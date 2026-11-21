import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getRedisClient } from '@/lib/redisDb';
import { getSupabaseAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const redis = getRedisClient();

    let totalLinks = 0;
    let supabaseTitles = 0;
    let pendingRequests = 0;
    let pendingReports = 0;
    let totalUsers = 0;

    if (supabase) {
      const [linksRes, reqsRes, repsRes, usersRes] = await Promise.all([
        supabase.from('links').select('id, movie_id', { count: 'exact' }),
        supabase.from('user_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('defective_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('users').select('id', { count: 'exact', head: true }),
      ]);

      totalLinks = linksRes.count ?? 0;
      if (linksRes.data) {
        const distinct = new Set(linksRes.data.map((r: any) => String(r.movie_id)));
        supabaseTitles = distinct.size;
      }
      pendingRequests = reqsRes.count ?? 0;
      pendingReports = repsRes.count ?? 0;
      totalUsers = usersRes.count ?? 0;
    }

    let redisTitles = 0;
    let redisMemory = 'N/A';
    if (redis) {
      try {
        const rawSum = await redis.get<string | any[]>('cinefuel:all_titles_summary');
        if (rawSum) {
          const parsed = typeof rawSum === 'string' ? JSON.parse(rawSum) : rawSum;
          if (Array.isArray(parsed)) redisTitles = parsed.length;
        }
      } catch {}
    }

    const totalTitles = Math.max(supabaseTitles, redisTitles);

    return NextResponse.json({
      success: true,
      metrics: {
        totalTitles,
        totalLinks,
        supabaseTitles,
        redisTitles,
        pendingRequests,
        pendingReports,
        totalUsers,
        parityPercentage: totalTitles > 0 ? Math.min(100, Math.round((redisTitles / totalTitles) * 100)) : 100,
        syncStatus: Math.abs(supabaseTitles - redisTitles) <= 2 ? 'synchronized' : 'divergent',
      },
      roleMatrix: {
        publicUser: ['Browse catalog', 'Direct streaming & downloads', 'Search movies/shows'],
        registeredMember: ['Watchlist tracking', 'Request content', 'Report defective links', 'Telegram notifications'],
        adminRole: ['Full link vault control', 'TMDB ID reassignment', 'Domain batch migration', 'Zero-loss Telegram bot', 'Purge with audit'],
      },
    });
  } catch (error: any) {
    console.error('API /api/admin/overview GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
