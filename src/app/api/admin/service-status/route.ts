import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getAllServiceStatuses } from '@/lib/serviceStatus';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Enforce admin authorization before running or returning any infrastructure diagnostics
  const isAuthorized = await validateAdminAuth(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Admin authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('refresh') === '1';

    const report = await getAllServiceStatuses({ forceRefresh });

    return NextResponse.json(report, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to retrieve service status diagnostics' },
      { status: 500 }
    );
  }
}
