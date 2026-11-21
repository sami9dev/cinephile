import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { isValidHttpUrl } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/reports/probe
 * Server-side probe of external stream/download URLs to check availability.
 */
export async function POST(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string' || !isValidHttpUrl(url)) {
      return NextResponse.json({ error: 'Valid HTTP/HTTPS url is required' }, { status: 400 });
    }

    const t0 = Date.now();
    let status = 0;
    let statusText = '';
    let isAlive = false;
    let finalUrl = url;

    try {
      // First try a lightweight HEAD request with 5s timeout
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      status = res.status;
      statusText = res.statusText;
      finalUrl = res.url;
      isAlive = res.ok || (res.status >= 300 && res.status < 400) || res.status === 403; // Some CDNs return 403 for HEAD
    } catch {
      // Fallback to GET with small byte range if HEAD is blocked
      try {
        const getRes = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Range: 'bytes=0-1024',
          },
        });
        status = getRes.status;
        statusText = getRes.statusText;
        finalUrl = getRes.url;
        isAlive = getRes.ok || (getRes.status >= 300 && getRes.status < 400);
      } catch (getErr: any) {
        status = 504;
        statusText = getErr.message || 'Timeout / Unreachable';
        isAlive = false;
      }
    }

    const latencyMs = Date.now() - t0;

    return NextResponse.json({
      success: true,
      url,
      finalUrl,
      status,
      statusText,
      latencyMs,
      isAlive,
    });
  } catch (error: any) {
    console.error('API /api/admin/reports/probe error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
