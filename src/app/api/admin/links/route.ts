import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import {
  dualWriteSaveLink,
  dualWriteSaveMultipleLinks,
  dualWriteDeleteLink,
  dualWriteDeleteMultipleLinks,
} from '@/lib/dualWrite';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { mapSupabaseRowToLink } from '@/lib/supabaseDb';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/links
 * Paginated link vault query with multi-attribute filtering.
 */
export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)));
    const q = (searchParams.get('q') || '').trim();
    const quality = (searchParams.get('quality') || '').trim();
    const audio = (searchParams.get('audio') || '').trim();
    const server = (searchParams.get('server') || '').trim();
    const movieId = (searchParams.get('movieId') || '').trim();

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    let query = supabase.from('links').select('*', { count: 'exact' });

    if (movieId) {
      query = query.eq('movie_id', movieId);
    }
    if (quality && quality !== 'all') {
      query = query.ilike('quality', `%${quality}%`);
    }
    if (audio && audio !== 'all') {
      query = query.ilike('audio_language', `%${audio}%`);
    }
    if (server && server !== 'all') {
      query = query.or(`server_name.ilike.%${server}%,server_badge.ilike.%${server}%`);
    }
    if (q) {
      query = query.or(`title.ilike.%${q}%,url.ilike.%${q}%,movie_title.ilike.%${q}%,movie_id.eq.${q}`);
    }

    query = query.order('created_at', { ascending: false });
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const links = (data || []).map(mapSupabaseRowToLink);
    const total = count ?? links.length;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      links,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('API /api/admin/links GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/links
 * Direct link ingestion (single link or array of links).
 */
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { link, links } = body;

    if (Array.isArray(links) && links.length > 0) {
      const res = await dualWriteSaveMultipleLinks(links);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (link && typeof link === 'object') {
      const res = await dualWriteSaveLink(link);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    return NextResponse.json({ error: 'Invalid payload: provide link or links array' }, { status: 400 });
  } catch (error: any) {
    console.error('API /api/admin/links POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/links
 * Deletes single or bulk links atomically.
 */
export async function DELETE(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { linkId, linkIds, movieId } = body;

    if (Array.isArray(linkIds) && linkIds.length > 0 && movieId) {
      const res = await dualWriteDeleteMultipleLinks(linkIds, movieId);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (linkId && movieId) {
      const res = await dualWriteDeleteLink(linkId, movieId);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    return NextResponse.json(
      { error: 'Missing parameters: provide (linkId, movieId) or (linkIds, movieId)' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('API /api/admin/links DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
