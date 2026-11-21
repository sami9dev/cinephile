import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getSupabaseAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all'; // 'all' | 'deletions' | 'reassignments'

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    let deletions: any[] = [];
    let reassignments: any[] = [];

    if (type === 'all' || type === 'deletions') {
      const { data } = await supabase
        .from('audit_title_deletions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      deletions = (data || []).map((d: any) => ({
        ...d,
        logType: 'deletion',
      }));
    }

    if (type === 'all' || type === 'reassignments') {
      const { data } = await supabase
        .from('audit_reassignments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      reassignments = (data || []).map((r: any) => ({
        ...r,
        logType: 'reassignment',
      }));
    }

    const allLogs = [...deletions, ...reassignments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      success: true,
      logs: allLogs,
      total: allLogs.length,
    });
  } catch (error: any) {
    console.error('API /api/admin/logs GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
