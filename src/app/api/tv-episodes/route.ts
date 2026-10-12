import { NextRequest, NextResponse } from 'next/server';
import { getSeasonEpisodes } from '@/lib/tmdb';
import { fetchTraktSeasonEpisodes } from '@/lib/trakt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || searchParams.get('tvId') || searchParams.get('movieId');
    const seasonRaw = searchParams.get('season') || searchParams.get('seasonNumber') || '1';
    const query = searchParams.get('title') || searchParams.get('query') || undefined;

    if (!id && !query) {
      return NextResponse.json(
        { success: false, error: 'A TV show id or title query is required.' },
        { status: 400 }
      );
    }

    const season = Math.max(0, parseInt(seasonRaw, 10) || 1);

    // 1. Try TMDB API first if id is numeric
    if (id && /^\d+$/.test(id.trim())) {
      const tmdbRes = await getSeasonEpisodes(id.trim(), season);
      if (tmdbRes && Array.isArray(tmdbRes.episodes) && tmdbRes.episodes.length > 0) {
        const response = NextResponse.json({
          success: true,
          season,
          source: 'tmdb',
          episodes: tmdbRes.episodes.map((ep) => ({
            episodeNumber: ep.episode_number,
            title: ep.name || '',
            overview: ep.overview || '',
          })),
        });
        response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');
        return response;
      }
    }

    // 2. Try Trakt API fallback (supports TMDB id, IMDb id, or title query)
    const traktRes = await fetchTraktSeasonEpisodes({
      tmdbId: id && /^\d+$/.test(id.trim()) ? id.trim() : undefined,
      imdbId: id && id.trim().startsWith('tt') ? id.trim() : undefined,
      query: query || (id && !/^\d+$/.test(id.trim()) ? id.trim() : undefined),
      season,
    });

    if (traktRes.success && Array.isArray(traktRes.episodes) && traktRes.episodes.length > 0) {
      const response = NextResponse.json({
        success: true,
        season,
        source: 'trakt',
        showTitle: traktRes.showTitle,
        episodes: traktRes.episodes.map((ep) => ({
          episodeNumber: ep.episodeNumber,
          title: ep.title || '',
          overview: ep.overview || '',
        })),
      });
      response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');
      return response;
    }

    return NextResponse.json({
      success: false,
      season,
      episodes: [],
      error: traktRes.error || 'No verified episode metadata found for this season.',
    });
  } catch (err: any) {
    console.error('Error in GET /api/tv-episodes:', err);
    return NextResponse.json(
      { success: false, episodes: [], error: err?.message || 'Failed to fetch episode metadata.' },
      { status: 500 }
    );
  }
}
