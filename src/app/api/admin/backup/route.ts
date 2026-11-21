import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getRedisClient } from '@/lib/redisDb';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { mapSupabaseRowToLink } from '@/lib/supabaseDb';
import { dualWriteSaveMultipleLinks } from '@/lib/dualWrite';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/backup
 * Exports all links from Supabase PostgreSQL grouped by movieId as structured JSON.
 */
export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    const { data, error } = await supabase
      .from('links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const grouped: Record<string, any[]> = {};
    for (const row of data || []) {
      const link = mapSupabaseRowToLink(row);
      const mId = String(link.movieId);
      if (!grouped[mId]) grouped[mId] = [];
      grouped[mId].push(link);
    }

    return NextResponse.json({
      success: true,
      exportedAt: new Date().toISOString(),
      totalTitles: Object.keys(grouped).length,
      totalLinks: (data || []).length,
      catalog: grouped,
    });
  } catch (error: any) {
    console.error('API /api/admin/backup GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/backup
 * Imports JSON backup or executes reconcile sync between Supabase and Upstash Redis.
 */
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'import', catalog } = body;

    if (action === 'import' && catalog && typeof catalog === 'object') {
      const flattenedLinks: any[] = [];
      for (const [movieId, links] of Object.entries(catalog)) {
        if (Array.isArray(links)) {
          for (const l of links) {
            flattenedLinks.push({ ...l, movieId });
          }
        }
      }

      if (flattenedLinks.length === 0) {
        return NextResponse.json({ error: 'No valid links found in backup catalog' }, { status: 400 });
      }

      // Batch import in chunks of 100
      let totalImported = 0;
      const chunkSize = 100;
      for (let i = 0; i < flattenedLinks.length; i += chunkSize) {
        const chunk = flattenedLinks.slice(i, i + chunkSize);
        const res = await dualWriteSaveMultipleLinks(chunk, { bumpVersion: i + chunkSize >= flattenedLinks.length });
        if (res.success) {
          totalImported += res.count || chunk.length;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully imported ${totalImported} links`,
        totalImported,
      });
    }

    // Default action: Reconcile sync from Supabase to Upstash Redis summary
    const supabase = getSupabaseAdminClient();
    const redis = getRedisClient();

    if (!supabase || !redis) {
      return NextResponse.json({ error: 'Both Supabase and Redis must be available for reconcile' }, { status: 503 });
    }

    const { data: allLinks, error: sbErr } = await supabase.from('links').select('*');
    if (sbErr || !allLinks) {
      return NextResponse.json({ error: sbErr?.message || 'Failed to fetch Supabase links' }, { status: 500 });
    }

    // Group links
    const titleMap = new Map<string, any[]>();
    for (const row of allLinks) {
      const link = mapSupabaseRowToLink(row);
      const mId = String(link.movieId);
      if (!titleMap.has(mId)) titleMap.set(mId, []);
      titleMap.get(mId)!.push(link);
    }

    // Build fresh summary for Redis
    const summaryList: any[] = [];
    for (const [mId, links] of titleMap.entries()) {
      if (links.length === 0) continue;
      const latest = links.reduce((a, b) => (new Date(a.createdAt || 0) > new Date(b.createdAt || 0) ? a : b));
      summaryList.push({
        _id: mId,
        groupMovieTitle: latest.movieTitle || latest.title,
        latestDoc: latest,
        linksCount: links.length,
        sortDate: latest.createdAt,
        allMediaTypes: Array.from(new Set(links.map((l) => l.mediaType).filter(Boolean))),
        groupVoteAverage: latest.voteAverage || 8.0,
      });
    }

    // Write summary to Redis
    await redis.set('cinefuel:all_titles_summary', JSON.stringify(summaryList));

    return NextResponse.json({
      success: true,
      message: `Reconciled ${summaryList.length} titles and ${allLinks.length} links from Supabase into Redis summary`,
      totalTitles: summaryList.length,
      totalLinks: allLinks.length,
    });
  } catch (error: any) {
    console.error('API /api/admin/backup POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
