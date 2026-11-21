import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth, getAdminSessionDetails } from '@/lib/adminAuth';
import {
  dualWriteDeleteEntireTitle,
  dualWriteUpdateMetadata,
} from '@/lib/dualWrite';
import { getRedisClient } from '@/lib/redisDb';
import { getSupabaseAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/titles
 * Returns all catalog titles with link counts and custom/unmatched tag.
 */
export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'custom' | 'movies' | 'tv'
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const redis = getRedisClient();
    let titlesList: any[] = [];

    // 1. Try Redis all_titles_summary for instant response
    if (redis) {
      try {
        const rawSum = await redis.get<string | any[]>('cinefuel:all_titles_summary');
        if (rawSum) {
          const parsed = typeof rawSum === 'string' ? JSON.parse(rawSum) : rawSum;
          if (Array.isArray(parsed) && parsed.length > 0) {
            titlesList = parsed.map((item) => {
              const movieIdStr = String(item._id || '');
              const isCustom = movieIdStr.startsWith('custom_') || !/^\d+$/.test(movieIdStr);
              return {
                id: item._id,
                movieId: item._id,
                title: item.groupMovieTitle || item.latestDoc?.movieTitle || item.latestDoc?.title || 'Untitled',
                mediaType: item.latestDoc?.mediaType || 'movie',
                posterPath: item.latestDoc?.posterPath || null,
                backdropPath: item.latestDoc?.backdropPath || null,
                linksCount: item.linksCount || item.count || 1,
                sortDate: item.sortDate || item.latestDoc?.createdAt,
                releaseDate: item.latestDoc?.releaseDate || null,
                isCustomFallback: isCustom,
              };
            });
          }
        }
      } catch (err: any) {
        console.warn('Redis summary read warning in /api/admin/titles:', err.message);
      }
    }

    // 2. Fallback to Supabase aggregation if Redis summary was empty
    if (titlesList.length === 0) {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('links')
          .select('id, movie_id, movie_title, title, media_type, poster_path, backdrop_path, created_at, release_date');

        if (!error && data) {
          const map = new Map<string, any>();
          for (const row of data) {
            const mId = String(row.movie_id);
            if (!map.has(mId)) {
              const isCustom = mId.startsWith('custom_') || !/^\d+$/.test(mId);
              map.set(mId, {
                id: mId,
                movieId: mId,
                title: row.movie_title || row.title || 'Untitled',
                mediaType: row.media_type || 'movie',
                posterPath: row.poster_path || null,
                backdropPath: row.backdrop_path || null,
                linksCount: 1,
                sortDate: row.created_at,
                releaseDate: row.release_date || null,
                isCustomFallback: isCustom,
              });
            } else {
              const entry = map.get(mId)!;
              entry.linksCount += 1;
              if (new Date(row.created_at) > new Date(entry.sortDate)) {
                entry.sortDate = row.created_at;
              }
            }
          }
          titlesList = Array.from(map.values());
        }
      }
    }

    // Apply filtering
    if (filter === 'custom') {
      titlesList = titlesList.filter((t) => t.isCustomFallback);
    } else if (filter === 'movies') {
      titlesList = titlesList.filter((t) => t.mediaType === 'movie');
    } else if (filter === 'tv') {
      titlesList = titlesList.filter((t) => t.mediaType === 'tv');
    }

    if (q) {
      titlesList = titlesList.filter((t) =>
        t.title.toLowerCase().includes(q) || String(t.movieId).toLowerCase().includes(q)
      );
    }

    // Sort by latest activity
    titlesList.sort((a, b) => new Date(b.sortDate || 0).getTime() - new Date(a.sortDate || 0).getTime());

    const customCount = titlesList.filter((t) => t.isCustomFallback).length;

    return NextResponse.json({
      success: true,
      titles: titlesList,
      total: titlesList.length,
      customCount,
    });
  } catch (error: any) {
    console.error('API /api/admin/titles GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/titles
 * Update title metadata across Supabase and Redis.
 */
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const session = await getAdminSessionDetails(req);
    const body = await req.json().catch(() => ({}));
    const { movieId, updates } = body;

    if (!movieId || !updates) {
      return NextResponse.json({ error: 'movieId and updates are required' }, { status: 400 });
    }

    const res = await dualWriteUpdateMetadata(movieId, updates, session.subject);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (error: any) {
    console.error('API /api/admin/titles POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/titles
 * Safe purge title and its links with audit record.
 */
export async function DELETE(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const session = await getAdminSessionDetails(req);
    const body = await req.json().catch(() => ({}));
    const { movieId, reason, titleHint } = body;

    if (!movieId) {
      return NextResponse.json({ error: 'movieId is required' }, { status: 400 });
    }

    const res = await dualWriteDeleteEntireTitle(
      movieId,
      reason || 'Administrative Purge',
      session.subject || 'master-admin',
      titleHint
    );

    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (error: any) {
    console.error('API /api/admin/titles DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
