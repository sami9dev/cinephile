import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { searchMulti } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const searchData = await searchMulti(q, 1);
    const filtered = (searchData.results || [])
      .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((item: any) => ({
        id: item.id,
        title: item.title || item.name || '',
        name: item.name || item.title || '',
        media_type: item.media_type || (item.name ? 'tv' : 'movie'),
        release_date: item.release_date || item.first_air_date || '',
        poster_path: item.poster_path || null,
        backdrop_path: item.backdrop_path || null,
        vote_average: item.vote_average || 0,
        overview: item.overview || '',
      }));

    return NextResponse.json({
      success: true,
      results: filtered,
    });
  } catch (err: any) {
    console.error('Error in /api/admin/tmdb-search:', err);
    return NextResponse.json({ error: err.message || 'TMDB search failed' }, { status: 500 });
  }
}
