import { NextRequest, NextResponse } from 'next/server';
import { resolveSeasonEpisodes, cleanSeriesQueryTitle } from '@/lib/episodeTitleResolver';
import { getLinksFromDatabase } from '@/lib/redisDb';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || searchParams.get('movieId');
  const imdbId = searchParams.get('imdbId') || undefined;
  const season = parseInt(searchParams.get('season') || '1', 10);
  let title = searchParams.get('title') || searchParams.get('query') || undefined;
  const year = searchParams.get('year') || undefined;

  if (!id && !imdbId && !title) {
    return NextResponse.json({ success: false, error: 'Missing id, imdbId, or title' }, { status: 400 });
  }

  try {
    // If title wasn't provided, attempt to infer show title from stored database records
    if (!title && id) {
      try {
        const dbRes = await getLinksFromDatabase(id);
        const links: Array<{ movieTitle?: string; title?: string }> = Array.isArray(dbRes.links)
          ? dbRes.links
          : [];
        const sample = links.find((l) => l.movieTitle) || links[0];
        if (sample?.movieTitle) {
          title = String(sample.movieTitle).trim();
        } else if (sample?.title) {
          title = cleanSeriesQueryTitle(sample.title);
        }
      } catch {
        // Ignore database lookup error
      }
    }

    const resolved = await resolveSeasonEpisodes({
      tmdbId: id || undefined,
      imdbId,
      query: title,
      season: isNaN(season) ? 1 : season,
      year,
    });

    return NextResponse.json({
      success: true,
      season_number: resolved.season_number,
      imdbId: resolved.imdbId,
      showTitle: resolved.showTitle,
      source: resolved.source,
      episodes: resolved.episodes.map((ep) => ({
        episode_number: ep.episode_number,
        episodeNumber: ep.episode_number,
        name: ep.name,
        title: ep.name,
        overview: ep.overview || '',
        still_path: ep.still_path || null,
        source: ep.source,
        isVerified: ep.isVerified,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
