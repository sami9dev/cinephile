import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth, getAdminSessionDetails } from '@/lib/adminAuth';
import { dualWriteReassignTitle } from '@/lib/dualWrite';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/titles/reassign
 * Reassigns links from old/custom ID to official TMDB ID.
 */
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const session = await getAdminSessionDetails(req);
    const body = await req.json().catch(() => ({}));
    const { oldMovieId, newMovieId, newTitle } = body;

    if (!oldMovieId || !newMovieId) {
      return NextResponse.json(
        { error: 'Both oldMovieId and newMovieId parameters are required' },
        { status: 400 }
      );
    }

    const res = await dualWriteReassignTitle(oldMovieId, newMovieId, newTitle, session.subject);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (error: any) {
    console.error('API /api/admin/titles/reassign POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
