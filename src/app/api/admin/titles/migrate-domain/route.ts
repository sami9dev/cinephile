import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth, getAdminSessionDetails } from '@/lib/adminAuth';
import { dualWriteMigrateDomain } from '@/lib/dualWrite';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/titles/migrate-domain
 * Batch migrates file host domains across all links with dryRun support.
 */
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const session = await getAdminSessionDetails(req);
    const body = await req.json().catch(() => ({}));
    const { oldDomain, newDomain, dryRun } = body;

    if (!oldDomain || !newDomain) {
      return NextResponse.json(
        { error: 'Both oldDomain and newDomain parameters are required' },
        { status: 400 }
      );
    }

    const res = await dualWriteMigrateDomain(oldDomain, newDomain, session.subject, { dryRun });
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (error: any) {
    console.error('API /api/admin/titles/migrate-domain POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
