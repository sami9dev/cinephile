import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { fetchTraktEpisodeTitle, fetchTraktSeasonEpisodes } from '@/lib/trakt';
import { resolveSeasonEpisodes } from '@/lib/episodeTitleResolver';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 1. Enforce admin authentication
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: admin privileges required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get('tmdbId') || searchParams.get('id') || undefined;
    const imdbId = searchParams.get('imdbId') || undefined;
    const query = searchParams.get('query') || searchParams.get('title') || undefined;
    const seasonRaw = searchParams.get('season') || searchParams.get('seasonNumber') || '1';
    const episodeRaw = searchParams.get('episode') || searchParams.get('episodeNumber') || undefined;
    const seasonOnly = searchParams.get('seasonOnly') === 'true';

    if (!tmdbId && !imdbId && !query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing identifier. Please provide tmdbId, imdbId, or query to identify the TV show.',
        },
        { status: 400 }
      );
    }

    const season = parseInt(seasonRaw, 10);
    if (isNaN(season) || season < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid season number. Must be 0 or higher.' },
        { status: 400 }
      );
    }

    // Season-wide episodes batch fetch
    if (seasonOnly) {
      // Try multi-source IMDb / TVMaze / TMDB / Trakt resolver first
      const resolved = await resolveSeasonEpisodes({
        tmdbId,
        imdbId,
        query,
        season,
      });

      if (resolved.episodes.length > 0) {
        return NextResponse.json({
          success: true,
          showTitle: resolved.showTitle || query,
          imdbId: resolved.imdbId,
          tmdbId: resolved.tmdbId,
          season,
          source: resolved.source,
          episodes: resolved.episodes.map((ep) => ({
            episodeNumber: ep.episode_number,
            title: ep.name,
            overview: ep.overview,
            source: ep.source,
          })),
        });
      }

      const result = await fetchTraktSeasonEpisodes({
        tmdbId,
        imdbId,
        query,
        season,
      });

      if (!result.success) {
        return NextResponse.json(result, { status: result.statusCode || 400 });
      }

      return NextResponse.json(result);
    }

    // Single episode lookup
    if (!episodeRaw) {
      return NextResponse.json(
        { success: false, error: 'Episode number is required for single episode lookup.' },
        { status: 400 }
      );
    }

    const episode = parseInt(episodeRaw, 10);
    if (isNaN(episode) || episode < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid episode number. Must be 1 or higher.' },
        { status: 400 }
      );
    }

    // Resolve via multi-source IMDb / TVMaze / TMDB / Trakt resolver
    const resolved = await resolveSeasonEpisodes({
      tmdbId,
      imdbId,
      query,
      season,
    });

    const matchEp = resolved.episodes.find((ep) => ep.episode_number === episode);
    if (matchEp) {
      return NextResponse.json({
        success: true,
        title: matchEp.name,
        season,
        episode,
        overview: matchEp.overview || '',
        showTitle: resolved.showTitle || query || '',
        imdbId: resolved.imdbId,
        tmdbId: resolved.tmdbId,
        source: matchEp.source,
      });
    }

    const result = await fetchTraktEpisodeTitle({
      tmdbId,
      imdbId,
      query,
      season,
      episode,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: result.statusCode || 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Error in GET /api/admin/trakt-episode:', err);
    const message =
      err instanceof Error ? err.message : 'Internal server error during episode title lookup.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
