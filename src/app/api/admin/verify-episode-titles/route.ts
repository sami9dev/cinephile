import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getLinksFromDatabase, updateEpisodeTitleInDatabase } from '@/lib/redisDb';
import { detectSeasonNumber, detectEpisodeNumber } from '@/lib/seasonParser';
import {
  resolveSeasonEpisodes,
  isVerifiedEpisodeTitleString,
  isRawReleaseFilenameOrToken,
  cleanSeriesQueryTitle,
} from '@/lib/episodeTitleResolver';

export const dynamic = 'force-dynamic';

export interface EpisodeTitleDiffItem {
  seasonNumber: number;
  episodeNumber: number;
  currentEpisodeTitle?: string;
  sampleReleaseTitle: string;
  linkCount: number;
  urlsIntact: boolean;
  proposedOfficialTitle: string;
  proposedHeading: string;
  source: 'imdb' | 'tvmaze' | 'tmdb' | 'manual' | 'stored' | 'unverified';
  isVerified: boolean;
  manualTitleVerified?: boolean;
  status: 'clean' | 'needs_update' | 'unverified';
  overview?: string;
}

interface StoredEpisodeLink {
  id?: string;
  title?: string;
  url?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  manualTitleVerified?: boolean;
  movieTitle?: string;
  linkType?: string;
  category?: string;
}

/**
 * Inspects a series' episodes and builds a safe preview diff of official episode titles vs current titles.
 * Never touches or modifies destination URLs, and never treats release filenames as official titles.
 */
async function buildEpisodeDiff(
  movieId: string,
  targetSeason?: number,
  showTitle?: string,
  imdbId?: string,
  forceOverwrite: boolean = false
) {
  const dbRes = await getLinksFromDatabase(movieId);
  const allLinks: StoredEpisodeLink[] = Array.isArray(dbRes.links) ? dbRes.links : [];

  // Filter to single episode links
  const episodeLinks = allLinks.filter((l) => {
    const ep = l.episodeNumber || detectEpisodeNumber(l);
    return ep !== undefined && ep > 0 && l.linkType !== 'zip_pack' && l.category !== 'ZipPack';
  });

  // Group links by (seasonNumber, episodeNumber)
  const grouped = new Map<string, { season: number; episode: number; links: StoredEpisodeLink[] }>();
  for (const link of episodeLinks) {
    const season = Number(link.seasonNumber || detectSeasonNumber(link) || 1);
    const episode = Number(link.episodeNumber || detectEpisodeNumber(link) || 0);
    if (episode < 1) continue;
    if (targetSeason !== undefined && season !== targetSeason) continue;

    const key = `S${season}E${episode}`;
    if (!grouped.has(key)) {
      grouped.set(key, { season, episode, links: [] });
    }
    grouped.get(key)!.links.push(link);
  }

  // Distinct seasons to query
  const seasons = Array.from(new Set(Array.from(grouped.values()).map((g) => g.season))).sort(
    (a, b) => a - b
  );

  // Determine effective show title for IMDb / TVMaze / TMDB lookup
  const effectiveShowTitle =
    showTitle ||
    allLinks.find((l) => l.movieTitle)?.movieTitle ||
    cleanSeriesQueryTitle(allLinks[0]?.title || '') ||
    undefined;

  let resolvedImdbId = imdbId;

  // Map of S{season}E{episode} -> { title, overview, source }
  const officialTitlesMap = new Map<
    string,
    { title: string; overview?: string; source: 'imdb' | 'tvmaze' | 'tmdb' }
  >();

  for (const sNum of seasons) {
    const resolvedSeason = await resolveSeasonEpisodes({
      tmdbId: movieId,
      imdbId: resolvedImdbId,
      query: effectiveShowTitle,
      season: sNum,
    });

    if (resolvedSeason.imdbId && !resolvedImdbId) {
      resolvedImdbId = resolvedSeason.imdbId;
    }

    for (const ep of resolvedSeason.episodes) {
      if (isVerifiedEpisodeTitleString(ep.name)) {
        officialTitlesMap.set(`S${sNum}E${ep.episode_number}`, {
          title: ep.name.trim(),
          overview: ep.overview,
          source: ep.source,
        });
      }
    }
  }

  // Build preview items sorted by season, then episode
  const sortedGroups = Array.from(grouped.values()).sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });

  const previewItems: EpisodeTitleDiffItem[] = [];
  let needsUpdateCount = 0;
  let unverifiedCount = 0;

  for (const group of sortedGroups) {
    const { season, episode, links: epLinks } = group;
    const key = `S${season}E${episode}`;
    const sTag = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

    const existingStoredTitle = epLinks
      .find((l) => l.episodeTitle && String(l.episodeTitle).trim().length > 0)
      ?.episodeTitle?.trim();
    const isManualVerified = epLinks.some((l) => l.manualTitleVerified === true);
    const sampleReleaseTitle = String(epLinks[0]?.title || '');

    const official = officialTitlesMap.get(key);

    let proposedOfficialTitle = '';
    let source: EpisodeTitleDiffItem['source'] = 'unverified';
    let isVerified = false;
    let overview: string | undefined = undefined;

    // 1. Preserve verified manual title corrections unless forceOverwrite is explicitly true
    if (
      isManualVerified &&
      existingStoredTitle &&
      isVerifiedEpisodeTitleString(existingStoredTitle) &&
      !forceOverwrite
    ) {
      proposedOfficialTitle = existingStoredTitle;
      source = 'manual';
      isVerified = true;
      overview = official?.overview;
    } else if (official && isVerifiedEpisodeTitleString(official.title)) {
      // 2. Authoritative official title from IMDb / TVMaze / TMDB
      proposedOfficialTitle = official.title;
      source = official.source;
      isVerified = true;
      overview = official.overview;
    } else if (existingStoredTitle && isVerifiedEpisodeTitleString(existingStoredTitle)) {
      // 3. Clean stored title in database
      proposedOfficialTitle = existingStoredTitle;
      source = isManualVerified ? 'manual' : 'stored';
      isVerified = true;
    } else {
      // 4. Never invent episode names or treat release filenames as official titles.
      // Retain existing non-filename title or fallback to "Episode N" and mark unverified.
      const safeRetainedTitle =
        existingStoredTitle && !isRawReleaseFilenameOrToken(existingStoredTitle)
          ? existingStoredTitle
          : `Episode ${episode}`;
      proposedOfficialTitle = safeRetainedTitle;
      source = 'unverified';
      isVerified = false;
    }

    const proposedHeading = `${sTag} — ${proposedOfficialTitle}`;

    // Determine status
    let status: EpisodeTitleDiffItem['status'] = 'clean';
    if (!isVerified) {
      status = 'unverified';
      unverifiedCount++;
    } else if (
      !existingStoredTitle ||
      existingStoredTitle !== proposedOfficialTitle ||
      isRawReleaseFilenameOrToken(existingStoredTitle)
    ) {
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
      manualTitleVerified: isManualVerified,
      status,
      overview,
    });
  }

  return {
    success: true,
    movieId,
    imdbId: resolvedImdbId,
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
    return NextResponse.json(
      { success: false, error: 'Unauthorized: admin access required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get('movieId') || searchParams.get('id');
    const seasonRaw = searchParams.get('season');
    const showTitle = searchParams.get('showTitle') || searchParams.get('title') || undefined;
    const imdbId = searchParams.get('imdbId') || undefined;
    const forceOverwrite = searchParams.get('forceOverwrite') === 'true';

    if (!movieId) {
      return NextResponse.json({ success: false, error: 'movieId is required' }, { status: 400 });
    }

    const season =
      seasonRaw !== null && seasonRaw !== undefined ? parseInt(seasonRaw, 10) : undefined;

    const result = await buildEpisodeDiff(
      movieId,
      isNaN(season as number) ? undefined : season,
      showTitle,
      imdbId,
      forceOverwrite
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Error in GET /api/admin/verify-episode-titles:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST: Apply batch episode title cleanup or preview changes
 */
export async function POST(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: admin access required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      action = 'preview',
      movieId,
      season,
      showTitle,
      imdbId,
      updates,
      forceOverwrite = false,
    } = body;

    if (!movieId) {
      return NextResponse.json({ success: false, error: 'movieId is required' }, { status: 400 });
    }

    // Action 1: Preview diff
    if (action === 'preview') {
      const seasonNum = season !== undefined ? parseInt(String(season), 10) : undefined;
      const result = await buildEpisodeDiff(
        String(movieId),
        isNaN(seasonNum as number) ? undefined : seasonNum,
        showTitle,
        imdbId,
        Boolean(forceOverwrite)
      );
      return NextResponse.json(result);
    }

    // Action 2: Apply updates safely in batch
    if (action === 'apply') {
      if (!Array.isArray(updates) || updates.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'updates array is required and must contain at least one item',
          },
          { status: 400 }
        );
      }

      const appliedResults = [];
      let totalModified = 0;
      let totalSkippedManual = 0;

      for (const item of updates) {
        const sNum = Number(item.seasonNumber);
        const eNum = Number(item.episodeNumber);
        const epTitle = String(item.episodeTitle || '').trim();

        if (isNaN(sNum) || isNaN(eNum) || !epTitle) continue;

        // Never allow applying a raw release filename as an official episode title
        if (isRawReleaseFilenameOrToken(epTitle)) {
          continue;
        }

        const itemForceOverwrite =
          item.forceOverwrite !== undefined ? Boolean(item.forceOverwrite) : Boolean(forceOverwrite);
        const itemManualVerified =
          item.manualTitleVerified !== undefined ? Boolean(item.manualTitleVerified) : undefined;

        // updateEpisodeTitleInDatabase ensures that URLs, IDs, qualities, servers are NEVER modified!
        const updateRes = await updateEpisodeTitleInDatabase(String(movieId), {
          seasonNumber: sNum,
          episodeNumber: eNum,
          episodeTitle: epTitle,
          manualTitleVerified: itemManualVerified,
          forceOverwrite: itemForceOverwrite,
        });

        if (updateRes.success) {
          totalModified += updateRes.updatedCount;
          totalSkippedManual += updateRes.skippedManualCount || 0;
          appliedResults.push({
            seasonNumber: sNum,
            episodeNumber: eNum,
            episodeTitle: epTitle,
            updatedCount: updateRes.updatedCount,
            skippedManualCount: updateRes.skippedManualCount || 0,
          });
        }
      }

      return NextResponse.json({
        success: true,
        movieId: String(movieId),
        totalApplied: appliedResults.length,
        totalLinksUpdated: totalModified,
        totalSkippedManual,
        urlsProtected: true,
        applied: appliedResults,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action "${action}"` },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error('Error in POST /api/admin/verify-episode-titles:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
