import {
  parseHubCloudTitle,
  cleanTelegramText,
  resolveTruncatedTelegramDocument,
  fetchHubCloudPageMetadata,
  computeCardBadge,
  HubCloudParsedResult,
} from './hubcloudParser';
import { getLinksFromSupabase, replaceAllLinksForTitleInSupabase } from './supabaseDb';
import { saveMultipleLinksToDatabase, invalidateCatalogCache, getRedisClient } from './redisDb';
import { detectServer } from './serverDetector';
import { getTitleDetails, searchMulti, cleanTitleString, resolveCanonicalMedia } from './tmdb';
import { getEnv } from './env';

export interface TelegramIngestInput {
  text?: string;
  caption?: string;
  document?: { file_name?: string; file_size?: number; mime_type?: string };
  video?: { file_name?: string; file_size?: number };
  urls?: string[];
  fromId?: number;
  senderName?: string;
}

export interface IngestedReleaseItem {
  url: string;
  title: string;
  parsed: HubCloudParsedResult;
  serverName: string;
  serverBadge: string;
  qualityBadge: string;
  size: string;
  score: number;
}

export interface IngestionResult {
  success: boolean;
  error?: string;
  movie?: {
    id: string | number;
    title: string;
    year: string;
    mediaType: 'movie' | 'tv';
    posterPath: string | null;
    backdropPath: string | null;
    overview: string;
    rating: string;
    genres: string;
    pageUrl: string;
  };
  releases: IngestedReleaseItem[];
  allLinksCount: number;
  cardBadge: string;
  isUpgrade: boolean;
  previousBadge?: string;
  replySummary: string;
  htmlCard?: {
    photoUrl: string | null;
    caption: string;
    destinationUrl: string;
  };
}

/**
 * Resolves canonical media from TMDB by IMDb ID, TMDB ID, or title + year search.
 */
async function resolveTmdbMedia(params: {
  imdbId?: string | null;
  tmdbId?: string | null;
  titleQuery: string;
  year?: number | null;
  mediaTypeHint?: 'movie' | 'tv';
}) {
  const { imdbId, tmdbId, titleQuery, year, mediaTypeHint } = params;

  // 1. If explicit TMDB ID is present
  if (tmdbId) {
    try {
      const details = await getTitleDetails(mediaTypeHint || 'movie', tmdbId);
      if (details && details.id) return details;
    } catch {
      if (!mediaTypeHint || mediaTypeHint === 'movie') {
        try {
          const tvDetails = await getTitleDetails('tv', tmdbId);
          if (tvDetails && tvDetails.id) return tvDetails;
        } catch {}
      }
    }
  }

  // 2. If IMDb ID is present
  if (imdbId) {
    try {
      const details = await getTitleDetails(mediaTypeHint || 'movie', imdbId);
      if (details && details.id) return details;
    } catch {}
  }

  // 3. Fallback to TMDB Multi-Search
  if (titleQuery && titleQuery.length >= 2) {
    const cleanQ = cleanTitleString(titleQuery);
    try {
      const searchRes = await searchMulti(cleanQ);
      if (searchRes && searchRes.results && searchRes.results.length > 0) {
        const mediaCandidates = searchRes.results.filter(
          (r: any) => r.media_type === 'movie' || r.media_type === 'tv'
        ) as any[];

        if (mediaCandidates.length > 0) {
          // If year is known, find closest match
          if (year) {
            const yearMatch = mediaCandidates.find((c: any) => {
              const rel = (c.release_date || c.first_air_date || '').slice(0, 4);
              return rel && Math.abs(parseInt(rel, 10) - year) <= 1;
            });
            if (yearMatch) return yearMatch;
          }

          // If mediaTypeHint is known
          if (mediaTypeHint) {
            const typeMatch = mediaCandidates.find((c: any) => c.media_type === mediaTypeHint);
            if (typeMatch) return typeMatch;
          }

          return mediaCandidates[0];
        }
      }
    } catch (e: any) {
      console.warn('TMDB searchMulti error in ingestion:', e.message);
    }
  }

  return null;
}

/**
 * 5-Stage Complete Telegram Release Ingestion Pipeline.
 */
export async function processTelegramIngestion(
  input: TelegramIngestInput
): Promise<IngestionResult> {
  const siteUrl = (
    getEnv('LIVE_SITE_URL') ||
    getEnv('NEXT_PUBLIC_SITE_URL') ||
    'https://cinephile-web.onrender.com'
  ).replace(/\/+$/, '');

  const rawCombined = `${input.caption || ''}\n${input.text || ''}`.trim();

  // ===========================================================================
  // STAGE 1: Sanitize Telegram Captions & Strip Promotional Spam
  // ===========================================================================
  const sanitized = cleanTelegramText(rawCombined);

  // Collect candidate URLs from input + extracted
  const allUrls = Array.from(
    new Set([...(input.urls || []), ...sanitized.extractedUrls])
  ).filter((u) => /^https?:\/\//i.test(u));

  // ===========================================================================
  // STAGE 2: Solve Telegram's 64-Character Filename Truncation Bug
  // ===========================================================================
  let authoritativeDocString: string | null = null;
  let authoritativeDocSize: string | null = null;

  const doc = input.document || input.video;
  if (doc && doc.file_name) {
    const resolvedDoc = resolveTruncatedTelegramDocument(doc, rawCombined);
    authoritativeDocString = resolvedDoc.authoritativeReleaseString;
    authoritativeDocSize = resolvedDoc.authoritativeSize;
  }

  // ===========================================================================
  // STAGE 3 & 4: Fetch Bare HubCloud Metadata & Parse Multi-Link Posts
  // ===========================================================================
  interface PreparedRelease {
    url: string;
    releaseTitle: string;
    extractedSize: string | null;
    parsed: HubCloudParsedResult;
  }

  const preparedReleases: PreparedRelease[] = [];

  if (allUrls.length > 0) {
    // Process each URL
    for (const url of allUrls) {
      // Find line in text associated with this URL
      let associatedLine = '';
      for (let i = 0; i < sanitized.cleanLines.length; i++) {
        if (sanitized.cleanLines[i].includes(url)) {
          // Take text on that line without the URL, or preceding line
          const lineWithoutUrl = sanitized.cleanLines[i].replace(url, '').trim();
          associatedLine = lineWithoutUrl || (i > 0 ? sanitized.cleanLines[i - 1] : '');
          break;
        }
      }

      // Check if we need to auto-fetch HubCloud landing page HTML
      let candidateTitle = associatedLine;
      let candidateSize = authoritativeDocSize || null;

      // If candidate title is too short or bare, fetch landing page metadata
      const isBare =
        !candidateTitle ||
        candidateTitle.length < 15 ||
        !/\b(?:1080p|720p|2160p|4k|web|bluray|hdtc)\b/i.test(candidateTitle);

      if (isBare) {
        const fetched = await fetchHubCloudPageMetadata(url, 6000);
        if (fetched.filename) {
          candidateTitle = fetched.filename;
        }
        if (!candidateSize && fetched.fileSize) {
          candidateSize = fetched.fileSize;
        }
      }

      // If document was provided and this is the only link, use authoritative doc string
      if (authoritativeDocString && allUrls.length === 1) {
        candidateTitle = authoritativeDocString;
      }

      // Final fallback to raw sanitized text
      if (!candidateTitle || candidateTitle.length < 5) {
        candidateTitle = sanitized.cleanLines[0] || url;
      }

      // If candidate title is specs-only without movie name, prepend post title header
      const headerLine = sanitized.cleanLines.find(
        (l) =>
          l.length >= 2 &&
          !l.includes('http') &&
          !/^(?:download|links?|direct|stream|quality|servers?|click|here|•|-)\b/i.test(l)
      );

      let parsed = parseHubCloudTitle(candidateTitle);
      if ((!parsed.cleanMovieTitle || parsed.cleanMovieTitle.length < 2) && headerLine) {
        candidateTitle = `${headerLine} ${candidateTitle}`.trim();
        parsed = parseHubCloudTitle(candidateTitle);
      }

      if (candidateSize) {
        parsed.extractedSize = candidateSize;
      }

      preparedReleases.push({
        url,
        releaseTitle: candidateTitle,
        extractedSize: candidateSize || parsed.extractedSize,
        parsed,
      });
    }
  } else if (authoritativeDocString) {
    // Direct Document / Video upload with no URL link
    const parsed = parseHubCloudTitle(authoritativeDocString);
    if (authoritativeDocSize) {
      parsed.extractedSize = authoritativeDocSize;
    }
    preparedReleases.push({
      url: `tg-doc://${encodeURIComponent(authoritativeDocString)}`,
      releaseTitle: authoritativeDocString,
      extractedSize: authoritativeDocSize || parsed.extractedSize,
      parsed,
    });
  } else if (sanitized.cleanLines.length > 0) {
    // Plain text title without links
    const parsed = parseHubCloudTitle(sanitized.cleanLines[0]);
    preparedReleases.push({
      url: `tg-text://${Date.now()}`,
      releaseTitle: sanitized.cleanLines[0],
      extractedSize: parsed.extractedSize,
      parsed,
    });
  }

  if (preparedReleases.length === 0) {
    return {
      success: false,
      error: 'No valid movie titles, release details, or download links could be parsed from the message.',
      releases: [],
      allLinksCount: 0,
      cardBadge: 'HD',
      isUpgrade: false,
      replySummary: '⚠️ No valid release or download links detected.',
    };
  }

  // ===========================================================================
  // STAGE 5: Database Deduplication & Quality Auto-Upgrade (Upsert)
  // ===========================================================================
  // Use the cleanest title and year from the highest-scoring release to match TMDB
  const primaryRelease = [...preparedReleases].sort(
    (a, b) => b.parsed.qualityScore - a.parsed.qualityScore
  )[0];

  const searchTitle = primaryRelease.parsed.cleanMovieTitle;
  const searchYear = primaryRelease.parsed.year;
  const isTvHint = primaryRelease.parsed.isZipPack || !!primaryRelease.parsed.seasonEpisode;

  const tmdb = await resolveTmdbMedia({
    imdbId: sanitized.imdbId,
    tmdbId: sanitized.tmdbId,
    titleQuery: searchTitle,
    year: searchYear,
    mediaTypeHint: isTvHint ? 'tv' : 'movie',
  });

  const isDummyTmdb = !tmdb || !tmdb.title || tmdb.title.startsWith('Movie #') || tmdb.title === 'Untitled';
  const officialTitle = !isDummyTmdb
    ? (tmdb.title || tmdb.name || searchTitle)
    : (searchTitle || 'Featured Release');

  const releaseDate = (!isDummyTmdb && (tmdb?.release_date || tmdb?.first_air_date))
    ? (tmdb.release_date || tmdb.first_air_date)
    : (searchYear ? `${searchYear}-01-01` : '');
  const releaseYear = releaseDate ? releaseDate.slice(0, 4) : (searchYear ? String(searchYear) : '');

  const movieId = (!isDummyTmdb && tmdb?.id)
    ? String(tmdb.id)
    : (sanitized.tmdbId || sanitized.imdbId || (searchTitle ? searchTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `release-${Date.now()}`));

  const mediaType: 'movie' | 'tv' =
    (!isDummyTmdb && tmdb?.media_type === 'tv') || isTvHint ? 'tv' : 'movie';

  // 1. Fetch existing links for this title from Supabase (or Redis)
  const existingLinks = (await getLinksFromSupabase(movieId)) || [];

  // Determine previous top quality score & badge
  let previousTopScore = -1;
  let previousBadge = 'HD';
  if (existingLinks.length > 0) {
    for (const l of existingLinks) {
      const p = parseHubCloudTitle(l.title || '');
      if (p.qualityScore > previousTopScore) {
        previousTopScore = p.qualityScore;
        previousBadge = computeCardBadge(p);
      }
    }
  }

  // 2. Deduplicate and merge incoming links
  const mergedLinksMap = new Map<string, any>();

  // Add existing links
  existingLinks.forEach((l) => {
    mergedLinksMap.set(l.url, l);
  });

  const ingestedItems: IngestedReleaseItem[] = [];

  for (const item of preparedReleases) {
    const serverInfo = detectServer(item.url);
    const qualityBadge = computeCardBadge(item.parsed);

    const linkObj: any = {
      id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      movieId,
      mediaType,
      title: item.releaseTitle,
      movieTitle: officialTitle,
      posterPath: tmdb?.poster_path || null,
      backdropPath: tmdb?.backdrop_path || null,
      releaseDate,
      voteAverage: tmdb?.vote_average || 7.8,
      url: item.url,
      category: item.parsed.isZipPack
        ? 'ZipPack'
        : item.parsed.seasonEpisode
        ? 'SingleEpisode'
        : 'Streaming',
      quality: item.parsed.resolution !== 'Unknown' ? item.parsed.resolution : '1080p FHD',
      audioLanguage: item.parsed.languages.join(', ') || (item.parsed.isOrgAudio ? 'Original' : 'Hindi'),
      size: item.extractedSize || item.parsed.extractedSize || '',
      serverName: serverInfo.name,
      serverBadge: serverInfo.badge,
      createdAt: new Date().toISOString(),
      qualityScore: item.parsed.qualityScore,
      summaryLine: item.parsed.uiSummaryLabel,
    };

    // Upsert by URL
    mergedLinksMap.set(item.url, linkObj);

    ingestedItems.push({
      url: item.url,
      title: item.releaseTitle,
      parsed: item.parsed,
      serverName: serverInfo.name,
      serverBadge: serverInfo.badge,
      qualityBadge,
      size: linkObj.size,
      score: item.parsed.qualityScore,
    });
  }

  // 3. Re-sort all links for this movie by qualityScore descending
  const allReleases = Array.from(mergedLinksMap.values()).sort((a, b) => {
    const scoreA = typeof a.qualityScore === 'number' ? a.qualityScore : parseHubCloudTitle(a.title || '').qualityScore;
    const scoreB = typeof b.qualityScore === 'number' ? b.qualityScore : parseHubCloudTitle(b.title || '').qualityScore;
    return scoreB - scoreA;
  });

  // Top release determines the card badge on the homepage poster
  const topRelease = allReleases[0];
  const topParsed = parseHubCloudTitle(topRelease.title || '');
  const newCardBadge = computeCardBadge(topParsed);
  const isUpgrade = previousTopScore > 0 && topParsed.qualityScore > previousTopScore;

  // 4. Save to database: Replace all links atomically in Supabase & Upstash Redis
  const metadataPayload = {
    movieTitle: officialTitle,
    posterPath: tmdb?.poster_path || null,
    backdropPath: tmdb?.backdrop_path || null,
    mediaType,
    releaseDate,
    voteAverage: tmdb?.vote_average || 7.8,
    cardBadge: newCardBadge,
    qualityScore: topParsed.qualityScore,
  };

  try {
    await replaceAllLinksForTitleInSupabase(movieId, allReleases, metadataPayload);
  } catch (sbErr: any) {
    console.warn('Supabase replace links note:', sbErr.message);
  }

  try {
    await saveMultipleLinksToDatabase(movieId, allReleases, metadataPayload);
  } catch (rdErr: any) {
    console.warn('Redis saveMultipleLinks note:', rdErr.message);
  }

  // 5. Invalidate catalog cache so homepage reflects upgraded card immediately
  await invalidateCatalogCache();

  // ===========================================================================
  // STAGE 6: Telegram Bot Reply Confirmation Preparation
  // ===========================================================================
  const pageUrl = `${siteUrl}/${mediaType}/${movieId}`;
  const posterUrl = tmdb?.poster_path
    ? (tmdb.poster_path.startsWith('http') ? tmdb.poster_path : `https://image.tmdb.org/t/p/w780${tmdb.poster_path.startsWith('/') ? '' : '/'}${tmdb.poster_path}`)
    : (tmdb?.backdrop_path ? (tmdb.backdrop_path.startsWith('http') ? tmdb.backdrop_path : `https://image.tmdb.org/t/p/w780${tmdb.backdrop_path.startsWith('/') ? '' : '/'}${tmdb.backdrop_path}`) : null);

  const releaseLines = ingestedItems.map((item) => {
    const p = item.parsed;
    const tags = [
      p.resolution !== 'Unknown' ? p.resolution : null,
      p.ott ? p.ott.code : null,
      p.source,
      p.videoCodec,
      p.hdr.length ? p.hdr.join('+') : null,
      p.audioCodec ? `${p.audioCodec}${p.hasAtmos ? ' Atmos' : ''}` : null,
      item.size || null,
    ].filter(Boolean);

    return `• <b>${tags.join(' | ')}</b>\n  <i>Score: ${p.qualityScore}</i> — <a href="${item.url}">Direct Link</a>`;
  }).join('\n\n');

  const badgeNotice = isUpgrade
    ? `🚀 <b>Homepage Card Upgraded:</b> <code>${previousBadge}</code> ➡️ <b>${newCardBadge}</b>`
    : `🏷️ <b>Homepage Card Badge:</b> <b>${newCardBadge}</b>`;

  const genres = Array.isArray(tmdb?.genres)
    ? tmdb.genres.map((g: any) => g.name).filter(Boolean).join(', ')
    : 'Cinema, Feature';

  const overview = tmdb?.overview
    ? (tmdb.overview.length > 220 ? tmdb.overview.slice(0, 217) + '...' : tmdb.overview)
    : `${officialTitle} is now streaming in high quality on CineFuel.`;

  const captionHtml = `🎬 <b>${officialTitle.toUpperCase()} ${releaseYear ? `(${releaseYear})` : ''}</b>
─────────────────────────────
⭐ <b>Rating:</b> ${tmdb?.vote_average ? Number(tmdb.vote_average).toFixed(1) : '8.0'}/10 | 🎭 <b>Genres:</b> ${genres}
─────────────────────────────

📖 <b>Overview:</b>
<blockquote>${overview}</blockquote>

📦 <b>Ingested Quality Links (${ingestedItems.length}):</b>
${releaseLines}

${badgeNotice}

🌐 <b>Live on Website:</b> <a href="${pageUrl}">${pageUrl}</a>`;

  return {
    success: true,
    movie: {
      id: movieId,
      title: officialTitle,
      year: releaseYear,
      mediaType,
      posterPath: tmdb?.poster_path || null,
      backdropPath: tmdb?.backdrop_path || null,
      overview,
      rating: tmdb?.vote_average ? Number(tmdb.vote_average).toFixed(1) : '8.0',
      genres,
      pageUrl,
    },
    releases: ingestedItems,
    allLinksCount: allReleases.length,
    cardBadge: newCardBadge,
    isUpgrade,
    previousBadge,
    replySummary: `✅ Successfully ingested ${ingestedItems.length} release(s) for ${officialTitle} (${releaseYear}). Card badge: ${newCardBadge}.`,
    htmlCard: {
      photoUrl: posterUrl,
      caption: captionHtml,
      destinationUrl: pageUrl,
    },
  };
}
