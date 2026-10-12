import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { fetchTraktEpisodeTitle, fetchTraktSeasonEpisodes } from '@/lib/trakt';

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
  } catch (err: any) {
    console.error('Error in GET /api/admin/trakt-episode:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error during Trakt title lookup.' },
      { status: 500 }
    );
  }
}
