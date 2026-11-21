import {
  parseHubCloudTitle,
  cleanTelegramText,
  resolveTruncatedTelegramDocument,
  fetchHubCloudPageMetadata,
  computeCardBadge,
  HubCloudParsedResult,
  isNonMediaUrl,
} from './hubcloudParser';
import { extractFilenameFromUrl, detectSeasonNumber, detectEpisodeNumber, isPackMedia } from './seasonParser';
import { getLinksFromSupabase, replaceAllLinksForTitleInSupabase } from './supabaseDb';
import { saveMultipleLinksToDatabase, upsertTitleInAllTitlesSummary, invalidateCatalogCache, getRedisClient } from './redisDb';
import { detectServer } from './serverDetector';
import { getTitleDetails, searchMulti, cleanTitleString, resolveCanonicalMedia } from './tmdb';
import { matchTmdbCascading } from './tmdbMatcher';
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
  movies?: {
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
    linksCount: number;
  }[];
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
  cards?: {
    photoUrl: string | null;
    caption: string;
    destinationUrl: string;
    title: string;
    year?: string;
    mediaType?: 'movie' | 'tv';
    movieId?: number | string;
    rating?: string;
    genres?: string;
    outline?: string;
    versions?: { quality: string; size?: string }[];
    audio?: string;
    uploadedBy?: string;
    channelHandle?: string;
    pageUrl?: string;
  }[];
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

  // 0. Check Canonical dictionary first (instant & resilient offline/ISP-safe)
  const canonicalCandidate = (tmdbId && resolveCanonicalMedia(tmdbId)) ||
    (imdbId && resolveCanonicalMedia(imdbId)) ||
    (titleQuery && resolveCanonicalMedia(titleQuery));

  if (canonicalCandidate) {
    return {
      id: canonicalCandidate.canonicalId,
      title: canonicalCandidate.title,
      name: canonicalCandidate.title,
      poster_path: canonicalCandidate.posterPath,
      backdrop_path: canonicalCandidate.backdropPath || canonicalCandidate.posterPath,
      release_date: canonicalCandidate.releaseDate,
      first_air_date: canonicalCandidate.releaseDate,
      vote_average: canonicalCandidate.voteAverage || 8.0,
      media_type: canonicalCandidate.mediaType || mediaTypeHint || 'movie',
    } as any;
  }

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

  // 2b. Cascading Multi-Pass TMDB Matcher (Direct ID, Strict, Fuzzy Sorensen-Dice, Cinemeta Bridge)
  try {
    const cascading = await matchTmdbCascading(
      titleQuery,
      cleanTitleString(titleQuery),
      year || undefined,
      mediaTypeHint === 'tv'
    );
    if (cascading.matched && cascading.candidate) {
      return {
        id: cascading.candidate.id,
        title: cascading.candidate.title,
        name: cascading.candidate.title,
        poster_path: cascading.candidate.posterPath,
        backdrop_path: cascading.candidate.backdropPath,
        release_date: cascading.candidate.year ? `${cascading.candidate.year}-01-01` : '',
        first_air_date: cascading.candidate.year ? `${cascading.candidate.year}-01-01` : '',
        vote_average: cascading.candidate.voteAverage || 7.5,
        media_type: cascading.candidate.mediaType || mediaTypeHint || 'movie',
        overview: cascading.candidate.overview,
      } as any;
    }
    // Ambiguous candidates: defer to processTelegramMessage for interactive inline confirmation
    if (cascading.candidates && cascading.candidates.length > 0) {
      return null;
    }
  } catch (err: any) {
    console.warn('Cascading TMDB match error in ingestion:', err.message);
  }

  // 3. Fallback to TMDB Multi-Search (Strictly reject URLs and non-media domains)
  if (
    titleQuery &&
    titleQuery.length >= 2 &&
    !/^https?:\/\//i.test(titleQuery) &&
    !titleQuery.includes('://') &&
    !/^(?:www\.|[a-z0-9_-]+\.[a-z]{2,6}\/)/i.test(titleQuery) &&
    !isNonMediaUrl(titleQuery)
  ) {
    const cleanQ = cleanTitleString(titleQuery);
    if (
      cleanQ &&
      cleanQ.length >= 2 &&
      !/^https?:\/\//i.test(cleanQ) &&
      !cleanQ.includes('://') &&
      !/^(?:www\.|[a-z0-9_-]+\.[a-z]{2,6}\/)/i.test(cleanQ)
    ) {
      try {
        const searchRes = await searchMulti(cleanQ);
        if (searchRes && searchRes.results && searchRes.results.length > 0) {
          // Filter valid movie / tv candidates and strictly purge troll/URL spam records (e.g. TMDB #331554)
          const mediaCandidates = searchRes.results.filter((r: any) => {
            if (r.media_type !== 'movie' && r.media_type !== 'tv') return false;
            const candName = (r.title || r.name || '').trim();
            if (
              !candName ||
              /^https?:\/\//i.test(candName) ||
              candName.includes('://') ||
              /^(?:www\.|[a-z0-9_-]+\.[a-z]{2,6}\/)/i.test(candName)
            ) {
              return false;
            }
            return true;
          }) as any[];

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
    'https://cinephile.sk6216071.workers.dev'
  ).replace(/\/+$/, '');

  const rawCombined = `${input.caption || ''}\n${input.text || ''}`.trim();

  // ===========================================================================
  // STAGE 1: Sanitize Telegram Captions & Strip Promotional Spam
  // ===========================================================================
  const sanitized = cleanTelegramText(rawCombined);

  // Collect candidate URLs from input + extracted, strictly filtering out trailers and non-media links
  const allUrls = Array.from(
    new Set([...(input.urls || []), ...sanitized.extractedUrls])
  ).filter((u) => /^https?:\/\//i.test(u) && !isNonMediaUrl(u));

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
      let candidateTitle = '';
      let candidateSize = authoritativeDocSize || null;

      // 1. Check if a line in sanitized cleanLines was directly associated with this URL
      for (let i = 0; i < sanitized.cleanLines.length; i++) {
        if (sanitized.cleanLines[i].includes(url)) {
          const lineWithoutUrl = sanitized.cleanLines[i]
            .replace(url, '')
            .replace(/^(?:Name|Title|Release|File(?:\s*Name)?)\s*[:=-]+\s*/i, '')
            .replace(/HUBCLOUD\s*[:=-]+\s*/gi, '')
            .trim();
          if (lineWithoutUrl.length >= 3 && !lineWithoutUrl.includes('://') && !isNonMediaUrl(lineWithoutUrl)) {
            candidateTitle = lineWithoutUrl;
          }
          break;
        }
      }

      // 2. If URL is on its own line, find preceding release name line in sanitized lines
      if (!candidateTitle) {
        // Find index of URL in cleanLines or look backwards through sanitized lines
        let urlCleanIndex = sanitized.cleanLines.findIndex((l) => l.includes(url));
        if (urlCleanIndex === -1) {
          // If URL was stripped from cleanLines, find position in rawCombined to locate previous clean line
          const urlPos = rawCombined.indexOf(url);
          if (urlPos > 0) {
            const rawPrefix = rawCombined.slice(0, urlPos);
            // Find the last clean line that appears before this URL in the raw message
            for (let k = sanitized.cleanLines.length - 1; k >= 0; k--) {
              const cl = sanitized.cleanLines[k];
              if (rawPrefix.includes(cl)) {
                urlCleanIndex = k + 1;
                break;
              }
            }
          }
        }

        const scanStartIndex = urlCleanIndex !== -1 ? urlCleanIndex - 1 : sanitized.cleanLines.length - 1;
        for (let j = scanStartIndex; j >= 0; j--) {
          let stripped = sanitized.cleanLines[j]
            .replace(/^(?:Name|Title|Release|File(?:\s*Name)?)\s*[:=-]+\s*/i, '')
            .replace(/HUBCLOUD\s*[:=-]+\s*/gi, '')
            .trim();
          if (
            stripped.length >= 3 &&
            !stripped.includes('://') &&
            !isNonMediaUrl(stripped) &&
            !/^(?:https?:\/\/|www\.)/i.test(stripped)
          ) {
            // Check if stripped is an orphan specs fragment split from the line above (e.g. "DDP 5.1 + ... x264 (Group).mkv" or "Atmos 7.1] ...")
            if (j > 0 && /^(?:\]|\+|Atmos|DD\+?|TrueHD|DTS(?:-HD)?|DDP|AAC|AC3|FLAC|E-AC-3|PCM|Dolby|Vision|HDR\d*\+?|DV|10Bit|8Bit|x264|x265|H\.?264|H\.?265|HEVC|AVC|AV1|\.mkv|\.mp4|\.zip|\.rar|[\(\[])/i.test(stripped)) {
              const prevLine = sanitized.cleanLines[j - 1]
                .replace(/^(?:Name|Title|Release|File(?:\s*Name)?)\s*[:=-]+\s*/i, '')
                .replace(/HUBCLOUD\s*[:=-]+\s*/gi, '')
                .trim();
              if (prevLine && !prevLine.includes('://') && !isNonMediaUrl(prevLine)) {
                stripped = `${prevLine} ${stripped}`;
              }
            }
            candidateTitle = stripped;
            break;
          }
        }
      }

      // 3. Fallback to extracting authentic scene filename from URL path
      if (!candidateTitle) {
        const urlFn = extractFilenameFromUrl(url);
        if (urlFn && urlFn.length >= 5 && !urlFn.includes('://') && !isNonMediaUrl(urlFn)) {
          candidateTitle = urlFn;
        }
      }

      // 4. If candidate title is too short, bare, or missing clean title, try fetching landing page metadata
      let parsed = parseHubCloudTitle(candidateTitle);
      const isBare =
        !candidateTitle ||
        candidateTitle.length < 15 ||
        !/\b(?:1080p|720p|2160p|4k|web|bluray|hdtc)\b/i.test(candidateTitle) ||
        !parsed.cleanMovieTitle ||
        parsed.cleanMovieTitle.length < 2 ||
        /^(?:atmos|truehd|ddp|dts|x264|x265|hevc|avc|1080p|2160p|720p)$/i.test(parsed.cleanMovieTitle.trim());

      if (isBare) {
        const fetched = await fetchHubCloudPageMetadata(url, 6000);
        if (fetched.filename && !fetched.filename.includes('://') && !isNonMediaUrl(fetched.filename)) {
          candidateTitle = fetched.filename;
          parsed = parseHubCloudTitle(candidateTitle);
        }
        if (!candidateSize && fetched.fileSize) {
          candidateSize = fetched.fileSize;
        }
      }

      // 5. If document was provided and this is the only link, use authoritative doc string
      if (authoritativeDocString && allUrls.length === 1) {
        candidateTitle = authoritativeDocString;
      }

      // 6. Fallback to cleanest non-URL line from post
      if (!candidateTitle || candidateTitle.length < 3 || candidateTitle.includes('://') || isNonMediaUrl(candidateTitle)) {
        const validLine = sanitized.cleanLines.find(
          (l) => l.length >= 3 && !l.includes('://') && !isNonMediaUrl(l) && !/^(?:https?:\/\/|www\.)/i.test(l)
        );
        candidateTitle = validLine || '';
      }

      // If candidate title is specs-only without movie name, prepend post title header
      const headerLine = sanitized.cleanLines.find(
        (l) =>
          l.length >= 2 &&
          !l.includes('://') &&
          !isNonMediaUrl(l) &&
          !/^(?:download|links?|direct|stream|quality|servers?|click|here|•|-)\b/i.test(l)
      );

      parsed = parseHubCloudTitle(candidateTitle);
      if ((!parsed.cleanMovieTitle || parsed.cleanMovieTitle.length < 2) && headerLine) {
        candidateTitle = `${headerLine} ${candidateTitle}`.trim();
        parsed = parseHubCloudTitle(candidateTitle);
      }

      if (candidateSize) {
        parsed.extractedSize = candidateSize;
      }

      // If we still cannot resolve any title, do not register a corrupt empty release
      if (!candidateTitle || !parsed.cleanMovieTitle || candidateTitle.includes('://')) {
        continue;
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
    const firstNonUrlLine = sanitized.cleanLines.find(
      (l) => !l.includes('://') && !isNonMediaUrl(l) && !/^(?:https?:\/\/|www\.)/i.test(l)
    );
    if (firstNonUrlLine) {
      const parsed = parseHubCloudTitle(firstNonUrlLine);
      if (parsed.cleanMovieTitle) {
        preparedReleases.push({
          url: `tg-text://${Date.now()}`,
          releaseTitle: firstNonUrlLine,
          extractedSize: parsed.extractedSize,
          parsed,
        });
      }
    }
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
  // STAGE 5: Multi-Movie Clustering & Quality Auto-Upgrade (Upsert)
  // ===========================================================================
  interface MediaCluster {
    clusterKey: string;
    searchTitle: string;
    searchYear?: number | null;
    isTvHint: boolean;
    releases: PreparedRelease[];
  }

  const clusterMap = new Map<string, MediaCluster>();

  for (const item of preparedReleases) {
    const rawClean = item.parsed.cleanMovieTitle || cleanTitleString(item.releaseTitle) || 'Featured Release';
    const clusterTitle = rawClean.trim();
    const clusterYear = item.parsed.year;
    const isTvHint = Boolean(item.parsed.isZipPack || item.parsed.seasonEpisode);

    // Group releases by normalized title, year, and media type hint
    const normTitle = clusterTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const clusterKey = `${normTitle}_${clusterYear || 'noyear'}_${isTvHint ? 'tv' : 'movie'}`;

    if (!clusterMap.has(clusterKey)) {
      clusterMap.set(clusterKey, {
        clusterKey,
        searchTitle: clusterTitle,
        searchYear: clusterYear,
        isTvHint,
        releases: [],
      });
    }
    clusterMap.get(clusterKey)!.releases.push(item);
  }

  const processedMovies: any[] = [];
  const processedCards: any[] = [];
  const allIngestedItems: IngestedReleaseItem[] = [];
  let totalReleasesSaved = 0;
  let primaryMovie: any = null;
  let primaryCard: any = null;
  let primaryBadge = 'HD';
  let primaryIsUpgrade = false;
  let primaryPreviousBadge = 'HD';

  for (const cluster of clusterMap.values()) {
    const searchTitle = cluster.searchTitle;
    const searchYear = cluster.searchYear;
    const isTvHint = cluster.isTvHint;

    if (
      !searchTitle ||
      searchTitle.length < 2 ||
      /^https?:\/\//i.test(searchTitle) ||
      searchTitle.includes('://') ||
      /^(?:www\.|[a-z0-9_-]+\.[a-z]{2,6}\/)/i.test(searchTitle)
    ) {
      continue;
    }

    const cleanTitleForCheck = (searchTitle || '').replace(/[^\w\s]/g, '').trim().toLowerCase();
    const isBoilerplateOnly =
      !cleanTitleForCheck ||
      cleanTitleForCheck === 'direct hubcloud' ||
      cleanTitleForCheck === 'hubcloud' ||
      cleanTitleForCheck === 'hubcloud links' ||
      cleanTitleForCheck === 'download links' ||
      cleanTitleForCheck === 'streaming links' ||
      cleanTitleForCheck === 'join channel' ||
      /^(?:direct\s*)?hubcloud(?:\s*links?)?$/i.test(cleanTitleForCheck);

    const tmdb = await resolveTmdbMedia({
      imdbId: sanitized.imdbId,
      tmdbId: sanitized.tmdbId,
      titleQuery: searchTitle,
      year: searchYear,
      mediaTypeHint: isTvHint ? 'tv' : 'movie',
    });

    const isDummyTmdb = !tmdb || !tmdb.title || tmdb.title.startsWith('Movie #') || tmdb.title === 'Untitled';
    if (isBoilerplateOnly && isDummyTmdb) {
      continue;
    }

    const candidateOfficialTitle = !isDummyTmdb
      ? (tmdb.title || tmdb.name || searchTitle)
      : (searchTitle || 'Featured Release');

    if (
      !candidateOfficialTitle ||
      /^https?:\/\//i.test(candidateOfficialTitle) ||
      candidateOfficialTitle.includes('://') ||
      /^(?:www\.|[a-z0-9_-]+\.[a-z]{2,6}\/)/i.test(candidateOfficialTitle)
    ) {
      continue;
    }

    const officialTitle = candidateOfficialTitle;
    const releaseDate = (!isDummyTmdb && (tmdb?.release_date || tmdb?.first_air_date))
      ? (tmdb.release_date || tmdb.first_air_date)
      : (searchYear ? `${searchYear}-01-01` : '');
    const releaseYear = releaseDate ? releaseDate.slice(0, 4) : (searchYear ? String(searchYear) : '');

    const movieId = (!isDummyTmdb && tmdb?.id)
      ? String(tmdb.id)
      : (sanitized.tmdbId || sanitized.imdbId || (searchTitle ? searchTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `release-${Date.now()}`));

    const mediaType: 'movie' | 'tv' =
      (!isDummyTmdb && tmdb?.media_type === 'tv') || isTvHint ? 'tv' : 'movie';

    // 1. Fetch existing links for THIS specific movieId from Supabase
    const existingLinks = (await getLinksFromSupabase(movieId)) || [];

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

    // 2. Deduplicate and merge incoming links for THIS movie
    const mergedLinksMap = new Map<string, any>();
    existingLinks.forEach((l) => {
      mergedLinksMap.set(l.url, l);
    });

    const existingPoster = existingLinks.find(
      (l) => l.posterPath && typeof l.posterPath === 'string' && !l.posterPath.includes('placeholder')
    )?.posterPath;
    const existingBackdrop = existingLinks.find(
      (l) => l.backdropPath && typeof l.backdropPath === 'string' && !l.backdropPath.includes('placeholder')
    )?.backdropPath;

    const resolvedPoster = (tmdb?.poster_path && !tmdb.poster_path.includes('placeholder'))
      ? tmdb.poster_path
      : (existingPoster || null);
    const resolvedBackdrop = (tmdb?.backdrop_path && !tmdb.backdrop_path.includes('placeholder'))
      ? tmdb.backdrop_path
      : (existingBackdrop || resolvedPoster || null);

    const clusterIngestedItems: IngestedReleaseItem[] = [];

    for (const item of cluster.releases) {
      const serverInfo = detectServer(item.url);
      const qualityBadge = computeCardBadge(item.parsed);

      const isZip = Boolean(item.parsed.isZipPack || isPackMedia(item.releaseTitle, item.url));
      const detectedSeason = detectSeasonNumber({ title: item.releaseTitle, url: item.url });
      const detectedEpisode = isZip ? undefined : detectEpisodeNumber({ title: item.releaseTitle, url: item.url });
      const linkType = isZip ? 'zip_pack' : (detectedEpisode !== undefined ? 'single_episode' : 'general');
      const category = isZip ? 'ZipPack' : (detectedEpisode !== undefined ? 'SingleEpisode' : 'Streaming');

      const linkObj: any = {
        id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        movieId,
        movie_id: movieId,
        mediaType,
        media_type: mediaType,
        title: item.releaseTitle,
        movieTitle: officialTitle,
        movie_title: officialTitle,
        posterPath: resolvedPoster,
        poster_path: resolvedPoster,
        backdropPath: resolvedBackdrop,
        backdrop_path: resolvedBackdrop,
        releaseDate,
        release_date: releaseDate,
        voteAverage: tmdb?.vote_average || 7.8,
        vote_average: tmdb?.vote_average || 7.8,
        url: item.url,
        category,
        seasonNumber: mediaType === 'tv' ? detectedSeason : undefined,
        season_number: mediaType === 'tv' ? detectedSeason : undefined,
        episodeNumber: mediaType === 'tv' ? detectedEpisode : undefined,
        episode_number: mediaType === 'tv' ? detectedEpisode : undefined,
        linkType: mediaType === 'tv' ? linkType : 'general',
        link_type: mediaType === 'tv' ? linkType : 'general',
        quality: item.parsed.resolution !== 'Unknown' ? item.parsed.resolution : '1080p FHD',
        codec: item.parsed.videoCodec || undefined,
        resolution: item.parsed.resolution !== 'Unknown' ? item.parsed.resolution : undefined,
        audioLanguage: item.parsed.languages.join(', ') || (item.parsed.isOrgAudio ? 'Original' : 'Hindi'),
        audio_language: item.parsed.languages.join(', ') || (item.parsed.isOrgAudio ? 'Original' : 'Hindi'),
        size: item.extractedSize || item.parsed.extractedSize || '',
        serverName: serverInfo.name,
        server_name: serverInfo.name,
        serverBadge: serverInfo.badge,
        server_badge: serverInfo.badge,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        qualityScore: item.parsed.qualityScore,
        summaryLine: item.parsed.uiSummaryLabel,
      };

      mergedLinksMap.set(item.url, linkObj);

      const relItem = {
        url: item.url,
        title: item.releaseTitle,
        parsed: item.parsed,
        serverName: serverInfo.name,
        serverBadge: serverInfo.badge,
        qualityBadge,
        size: linkObj.size,
        score: item.parsed.qualityScore,
      };
      clusterIngestedItems.push(relItem);
      allIngestedItems.push(relItem);
    }

    const allReleases = Array.from(mergedLinksMap.values()).sort((a, b) => {
      const scoreA = typeof a.qualityScore === 'number' ? a.qualityScore : parseHubCloudTitle(a.title || '').qualityScore;
      const scoreB = typeof b.qualityScore === 'number' ? b.qualityScore : parseHubCloudTitle(b.title || '').qualityScore;
      return scoreB - scoreA;
    });

    const topRelease = allReleases[0];
    const topParsed = parseHubCloudTitle(topRelease?.title || '');
    const newCardBadge = computeCardBadge(topParsed);
    const isUpgrade = previousTopScore > 0 && topParsed.qualityScore > previousTopScore;

    const metadataPayload = {
      movieTitle: officialTitle,
      posterPath: resolvedPoster,
      backdropPath: resolvedBackdrop,
      mediaType,
      releaseDate,
      voteAverage: tmdb?.vote_average || 7.8,
      cardBadge: newCardBadge,
      qualityScore: topParsed.qualityScore,
    };

    try {
      await replaceAllLinksForTitleInSupabase(movieId, allReleases, metadataPayload);
    } catch (sbErr: any) {
      console.warn(`Supabase replace links note for ${movieId}:`, sbErr.message);
    }

    try {
      await saveMultipleLinksToDatabase(movieId, allReleases, metadataPayload);
      await upsertTitleInAllTitlesSummary(movieId, allReleases, metadataPayload);
    } catch (rdErr: any) {
      console.warn(`Redis saveMultipleLinks note for ${movieId}:`, rdErr.message);
    }

    totalReleasesSaved += allReleases.length;

    // Telegram Bot Card Preparation for this movie
    const pageUrl = `${siteUrl}/${mediaType}/${movieId}`;
    const posterUrl = tmdb?.poster_path
      ? (tmdb.poster_path.startsWith('http') ? tmdb.poster_path : `https://image.tmdb.org/t/p/w780${tmdb.poster_path.startsWith('/') ? '' : '/'}${tmdb.poster_path}`)
      : (tmdb?.backdrop_path ? (tmdb.backdrop_path.startsWith('http') ? tmdb.backdrop_path : `https://image.tmdb.org/t/p/w780${tmdb.backdrop_path.startsWith('/') ? '' : '/'}${tmdb.backdrop_path}`) : null);

    const uniqueQualities = Array.from(
      new Set(
        clusterIngestedItems.map((item) => {
          const p = item.parsed;
          const tags = [
            p.resolution !== 'Unknown' ? p.resolution : null,
            p.ott ? (p.ott.code || p.ott.name).toUpperCase() : null,
            p.source,
            p.videoCodec,
            p.hdr.length ? p.hdr.join('+') : null,
          ].filter(Boolean);
          return tags.join(' | ');
        }).filter(Boolean)
      )
    );

    const versionsText = uniqueQualities.length > 0
      ? uniqueQualities.map((q) => `• <b>${q}</b>`).join('\n')
      : `• <b>${newCardBadge}</b>`;

    const badgeNotice = isUpgrade
      ? `🚀 <b>Homepage Card Upgraded:</b> <code>${previousBadge}</code> ➡️ <b>${newCardBadge}</b>`
      : `🏷️ <b>Homepage Card Badge:</b> <b>${newCardBadge}</b>`;

    const genres = Array.isArray(tmdb?.genres)
      ? tmdb.genres.map((g: any) => g.name).filter(Boolean).join(', ')
      : 'Cinema, Feature';

    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let overview = tmdb?.overview
      ? (tmdb.overview.length > 220 ? tmdb.overview.slice(0, 217) + '...' : tmdb.overview)
      : `${officialTitle} is now streaming in high quality on CineFuel.`;

    const safeTitle = escapeHtml(officialTitle.toUpperCase());
    const safeGenres = escapeHtml(genres);
    let safeOverview = escapeHtml(overview);

    let captionHtml = `🎬 <b>${safeTitle} ${releaseYear ? `(${releaseYear})` : ''}</b>
─────────────────────────────
⭐ <b>Rating:</b> ${tmdb?.vote_average ? Number(tmdb.vote_average).toFixed(1) : '8.0'}/10 | 🎭 <b>Genres:</b> ${safeGenres}
─────────────────────────────

📖 <b>Overview:</b>
<blockquote>${safeOverview}</blockquote>

📦 <b>Available Versions:</b>
${versionsText}

${badgeNotice}

🌐 <b>Live on Website:</b> <a href="${pageUrl}">${pageUrl}</a>`;

    if (captionHtml.length > 1020) {
      const maxOverview = Math.max(60, overview.length - (captionHtml.length - 1020));
      overview = overview.slice(0, maxOverview) + '...';
      safeOverview = escapeHtml(overview);
      captionHtml = `🎬 <b>${safeTitle} ${releaseYear ? `(${releaseYear})` : ''}</b>
─────────────────────────────
⭐ <b>Rating:</b> ${tmdb?.vote_average ? Number(tmdb.vote_average).toFixed(1) : '8.0'}/10 | 🎭 <b>Genres:</b> ${safeGenres}
─────────────────────────────

📖 <b>Overview:</b>
<blockquote>${safeOverview}</blockquote>

📦 <b>Available Versions:</b>
${versionsText}

${badgeNotice}

🌐 <b>Live on Website:</b> <a href="${pageUrl}">${pageUrl}</a>`;
    }

    const movieSummaryObj = {
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
      linksCount: allReleases.length,
    };

    const movieCardObj = {
      photoUrl: posterUrl,
      caption: captionHtml,
      destinationUrl: pageUrl,
      title: officialTitle,
      year: releaseYear,
      mediaType,
      movieId,
      rating: tmdb?.vote_average ? Number(tmdb.vote_average).toFixed(1) : '8.0',
      genres,
      outline: overview,
      versions: uniqueQualities.map((q) => ({ quality: q })),
      audio: clusterIngestedItems.map((i) => i.parsed.languages.join(', ')).filter(Boolean)[0] || 'Hindi, English',
      uploadedBy: 'Shyam',
      channelHandle: '@cinflue',
      pageUrl,
    };

    processedMovies.push(movieSummaryObj);
    processedCards.push(movieCardObj);

    if (!primaryMovie) {
      primaryMovie = movieSummaryObj;
      primaryCard = movieCardObj;
      primaryBadge = newCardBadge;
      primaryIsUpgrade = isUpgrade;
      primaryPreviousBadge = previousBadge;
    }
  }

  // 5. Invalidate catalog cache so homepage reflects upgraded cards immediately
  await invalidateCatalogCache();

  if (processedMovies.length === 0) {
    return {
      success: false,
      error: 'Could not resolve valid movie or series metadata for any releases in the submission.',
      releases: [],
      allLinksCount: 0,
      cardBadge: 'HD',
      isUpgrade: false,
      replySummary: '⚠️ Could not resolve valid movie titles from submission.',
    };
  }

  const replySummary = processedMovies.length === 1
    ? `✅ Successfully ingested ${allIngestedItems.length} release(s) for ${primaryMovie.title} (${primaryMovie.year}). Card badge: ${primaryBadge}.`
    : `✅ Successfully ingested ${allIngestedItems.length} release(s) across ${processedMovies.length} movies:\n` +
      processedMovies.map((m) => `• <b>${m.title}</b> (${m.year || 'N/A'}) - <b>${m.linksCount}</b> links`).join('\n');

  return {
    success: true,
    movie: primaryMovie,
    movies: processedMovies,
    releases: allIngestedItems,
    allLinksCount: totalReleasesSaved,
    cardBadge: primaryBadge,
    isUpgrade: primaryIsUpgrade,
    previousBadge: primaryPreviousBadge,
    replySummary,
    htmlCard: primaryCard,
    cards: processedCards,
  };
}
