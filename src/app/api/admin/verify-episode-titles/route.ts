import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getLinksFromDatabase, updateEpisodeTitleInDatabase } from '@/lib/redisDb';
import { getSeasonEpisodes } from '@/lib/tmdb';
import { fetchTraktSeasonEpisodes } from '@/lib/trakt';
import { extractEpisodeTitle, detectSeasonNumber, detectEpisodeNumber, detectLinkType } from '@/lib/seasonParser';

export const dynamic = 'force-dynamic';

export interface EpisodeDiffItem {
  seasonNumber: number;
  episodeNumber: number;
  currentEpisodeTitle: string | null;
  sampleReleaseTitle: string;
  linkCount: number;
  urlsIntact: boolean;
  proposedOfficialTitle: string;
  proposedHeading: string;
  source: 'tmdb' | 'trakt' | 'stored' | 'fallback';
  isVerified: boolean;
  status: 'clean' | 'needs_update' | 'unverified';
  overview?: string;
}

/**
 * Builds the preview diff between existing stored link data and verified provider metadata.
 */
async function buildEpisodeDiff(
  movieId: string,
  targetSeason?: number,
  showTitleQuery?: string
): Promise<{
  success: boolean;
  movieId: string;
  showTitle: string;
  totalEpisodes: number;
  needsUpdateCount: number;
  unverifiedCount: number;
  preview: EpisodeDiffItem[];
  error?: string;
}> {
  // 1. Fetch current links from database
  const linksRes = await getLinksFromDatabase(movieId);
  const links: any[] = linksRes.links || [];

  if (links.length === 0) {
    return {
      success: true,
      movieId,
      showTitle: showTitleQuery || 'Unknown Series',
      totalEpisodes: 0,
      needsUpdateCount: 0,
      unverifiedCount: 0,
      preview: [],
    };
  }

  // Determine show title from links or query
  const effectiveShowTitle = showTitleQuery || links[0]?.movieTitle || 'TV Series';

  // 2. Identify all single episode links and group them by (seasonNumber, episodeNumber)
  const episodesMap = new Map<string, { season: number; episode: number; links: any[] }>();

  links.forEach((l) => {
    const s = l.seasonNumber || detectSeasonNumber(l) || 1;
    const isPack = l.linkType === 'zip_pack' || l.category === 'ZipPack' || detectLinkType(l) === 'zip_pack';
    if (isPack) return; // Skip complete zip packs for episode titles

    const ep = l.episodeNumber || detectEpisodeNumber(l);
    if (!ep || ep <= 0) return;

    if (targetSeason !== undefined && s !== targetSeason) return;

    const key = `S${s}E${ep}`;
    if (!episodesMap.has(key)) {
      episodesMap.set(key, { season: s, episode: ep, links: [] });
    }
    episodesMap.get(key)!.links.push(l);
  });

  // Distinct seasons present
  const presentSeasons = Array.from(new Set(Array.from(episodesMap.values()).map((e) => e.season))).sort((a, b) => a - b);

  // 3. Query TMDB and Trakt for each season
  const providerEpisodesBySeason = new Map<number, Map<number, { title: string; overview?: string; source: 'tmdb' | 'trakt' }>>();

  for (const sNum of presentSeasons) {
    const seasonMap = new Map<number, { title: string; overview?: string; source: 'tmdb' | 'trakt' }>();

    // A. Try TMDB if movieId is numeric
    if (/^\d+$/.test(movieId.trim())) {
      try {
        const tmdbData = await getSeasonEpisodes(movieId.trim(), sNum);
        if (tmdbData && Array.isArray(tmdbData.episodes) && tmdbData.episodes.length > 0) {
          tmdbData.episodes.forEach((ep) => {
            if (ep.episode_number && ep.name && ep.name.trim()) {
              seasonMap.set(ep.episode_number, {
                title: ep.name.trim(),
                overview: ep.overview || '',
                source: 'tmdb',
              });
            }
          });
        }
      } catch (err: any) {
        console.warn(`TMDB fetch error for season ${sNum}:`, err?.message);
      }
    }

    // B. Fallback to Trakt if TMDB yielded nothing or for non-numeric IDs
    if (seasonMap.size === 0) {
      try {
        const traktRes = await fetchTraktSeasonEpisodes({
          tmdbId: /^\d+$/.test(movieId.trim()) ? movieId.trim() : undefined,
          imdbId: movieId.trim().startsWith('tt') ? movieId.trim() : undefined,
          query: effectiveShowTitle,
          season: sNum,
        });

        if (traktRes.success && Array.isArray(traktRes.episodes)) {
          traktRes.episodes.forEach((ep) => {
            if (ep.episodeNumber && ep.title && ep.title.trim()) {
              seasonMap.set(ep.episodeNumber, {
                title: ep.title.trim(),
                overview: ep.overview || '',
                source: 'trakt',
              });
            }
          });
        }
      } catch (err: any) {
        console.warn(`Trakt fetch error for season ${sNum}:`, err?.message);
      }
    }

    providerEpisodesBySeason.set(sNum, seasonMap);
  }

  // 4. Construct Diff Items
  const previewItems: EpisodeDiffItem[] = [];
  let needsUpdateCount = 0;
  let unverifiedCount = 0;

  const sortedKeys = Array.from(episodesMap.keys()).sort((a, b) => {
    const itemA = episodesMap.get(a)!;
    const itemB = episodesMap.get(b)!;
    if (itemA.season !== itemB.season) return itemA.season - itemB.season;
    return itemA.episode - itemB.episode;
  });

  for (const key of sortedKeys) {
    const { season, episode, links: epLinks } = episodesMap.get(key)!;
    const sTag = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

    // Current stored episodeTitle (if any)
    const existingStoredTitle = epLinks.find((l) => l.episodeTitle?.trim())?.episodeTitle?.trim() || null;
    const sampleReleaseTitle = epLinks[0]?.title || '';

    // Check provider metadata
    const seasonProviders = providerEpisodesBySeason.get(season);
    const providerMeta = seasonProviders?.get(episode);

    let proposedOfficialTitle = '';
    let source: 'tmdb' | 'trakt' | 'stored' | 'fallback' = 'fallback';
    let isVerified = false;
    let overview = '';

    if (providerMeta && providerMeta.title && !providerMeta.title.toLowerCase().startsWith('episode ')) {
      proposedOfficialTitle = providerMeta.title;
      source = providerMeta.source;
      isVerified = true;
      overview = providerMeta.overview || '';
    } else if (existingStoredTitle && !existingStoredTitle.toLowerCase().startsWith('episode ')) {
      proposedOfficialTitle = existingStoredTitle;
      source = 'stored';
      isVerified = true;
    } else {
      // Fallback: extract title from scene release or neutral "Episode N"
      const extracted = extractEpisodeTitle(sampleReleaseTitle);
      if (extracted && extracted.length > 2 && !extracted.toLowerCase().startsWith('episode ')) {
        proposedOfficialTitle = extracted;
        source = 'fallback';
        isVerified = false;
      } else {
        proposedOfficialTitle = `Episode ${episode}`;
        source = 'fallback';
        isVerified = false;
      }
    }

    const proposedHeading = `${sTag} — ${proposedOfficialTitle}`;

    // Determine status
    let status: 'clean' | 'needs_update' | 'unverified' = 'clean';
    if (!isVerified) {
      status = 'unverified';
      unverifiedCount++;
    } else if (!existingStoredTitle || existingStoredTitle !== proposedOfficialTitle) {
      status = 'needs_update';
      needsUpdateCount++;
    }

    previewItems.push({
      seasonNumber: season,
      episodeNumber: episode,
      currentEpisodeTitle: existingStoredTitle,
      sampleReleaseTitle,
      linkCount: epLinks.length,
      urlsIntact: true, // Destination URLs strictly untouched
      proposedOfficialTitle,
      proposedHeading,
      source,
      isVerified,
      status,
      overview,
    });
  }

  return {
    success: true,
    movieId,
    showTitle: effectiveShowTitle,
    totalEpisodes: previewItems.length,
    needsUpdateCount,
    unverifiedCount,
    preview: previewItems,
  };
}

/**
 * GET: Admin preview / audit of proposed episode title cleanup
 */
export async function GET(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ success: false, error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get('movieId') || searchParams.get('id');
    const seasonRaw = searchParams.get('season');
    const showTitle = searchParams.get('showTitle') || searchParams.get('title') || undefined;

    if (!movieId) {
      return NextResponse.json({ success: false, error: 'movieId is required' }, { status: 400 });
    }

    const season = seasonRaw !== null && seasonRaw !== undefined ? parseInt(seasonRaw, 10) : undefined;

    const result = await buildEpisodeDiff(movieId, isNaN(season as number) ? undefined : season, showTitle);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error in GET /api/admin/verify-episode-titles:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}

/**
 * POST: Apply batch episode title cleanup or preview changes
 */
export async function POST(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ success: false, error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { action = 'preview', movieId, season, showTitle, updates } = body;

    if (!movieId) {
      return NextResponse.json({ success: false, error: 'movieId is required' }, { status: 400 });
    }

    // Action 1: Preview diff
    if (action === 'preview') {
      const seasonNum = season !== undefined ? parseInt(String(season), 10) : undefined;
      const result = await buildEpisodeDiff(
        String(movieId),
        isNaN(seasonNum as number) ? undefined : seasonNum,
        showTitle
      );
      return NextResponse.json(result);
    }

    // Action 2: Apply updates safely in batch
    if (action === 'apply') {
      if (!Array.isArray(updates) || updates.length === 0) {
        return NextResponse.json(
          { success: false, error: 'updates array is required and must contain at least one item' },
          { status: 400 }
        );
      }

      const appliedResults = [];
      let totalModified = 0;

      for (const item of updates) {
        const sNum = Number(item.seasonNumber);
        const eNum = Number(item.episodeNumber);
        const epTitle = String(item.episodeTitle || '').trim();

        if (isNaN(sNum) || isNaN(eNum) || !epTitle) continue;

        // updateEpisodeTitleInDatabase ensures that URLs, IDs, qualities, servers are NEVER modified!
        const updateRes = await updateEpisodeTitleInDatabase(String(movieId), {
          seasonNumber: sNum,
          episodeNumber: eNum,
          episodeTitle: epTitle,
        });

        if (updateRes.success) {
          totalModified += updateRes.updatedCount;
          appliedResults.push({
            seasonNumber: sNum,
            episodeNumber: eNum,
            episodeTitle: epTitle,
            updatedCount: updateRes.updatedCount,
          });
        }
      }

      return NextResponse.json({
        success: true,
        movieId: String(movieId),
        totalApplied: appliedResults.length,
        totalLinksUpdated: totalModified,
        urlsProtected: true,
        applied: appliedResults,
      });
    }

    return NextResponse.json({ success: false, error: `Invalid action "${action}"` }, { status: 400 });
  } catch (err: any) {
    console.error('Error in POST /api/admin/verify-episode-titles:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
