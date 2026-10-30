import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import {
  identifyMediaItem,
  saveIdentifiedMediaRecord,
  MediaIdentificationResult,
  IdentificationOptions,
} from '@/lib/mediaIdentifier';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = body.action || 'identify';

    // 1. Identify a list of items or single item
    if (action === 'identify') {
      const items: string[] = Array.isArray(body.items)
        ? body.items
        : body.item
        ? [body.item]
        : [];

      if (items.length === 0) {
        return NextResponse.json({ error: 'No items provided for media identification' }, { status: 400 });
      }

      const results: MediaIdentificationResult[] = [];
      const rustWorkerUrl = process.env.RUST_WORKER_URL?.replace(/\/+$/, '');

      for (const item of items) {
        const url = typeof item === 'object' && item !== null ? (item as any).url : undefined;
        const text = typeof item === 'object' && item !== null ? (item as any).text || (item as any).path || '' : String(item);

        let res: MediaIdentificationResult | null = null;
        if (rustWorkerUrl) {
          try {
            const rResp = await fetch(`${rustWorkerUrl}/api/identify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, url }),
              signal: AbortSignal.timeout(3000),
            });
            if (rResp.ok) {
              res = await rResp.json();
            }
          } catch {}
        }

        if (!res) {
          res = await identifyMediaItem(text, { url });
        }
        results.push(res);
      }

      return NextResponse.json({
        success: true,
        total: results.length,
        matchedCount: results.filter((r) => r.status === 'matched').length,
        unmatchedCount: results.filter((r) => r.status === 'unmatched').length,
        ambiguousCount: results.filter((r) => r.status === 'ambiguous').length,
        results,
      });
    }

    // 2. Retry identification with manual user overrides
    if (action === 'retry') {
      const { rawInput, url, forcedType, forcedTmdbId, forcedYear, forcedTitle } = body;
      if (!rawInput) {
        return NextResponse.json({ error: 'rawInput is required for retry' }, { status: 400 });
      }

      const options: IdentificationOptions = {
        url,
        forcedType,
        forcedTmdbId,
        forcedYear: forcedYear ? Number(forcedYear) : undefined,
        forcedTitle,
      };

      const result = await identifyMediaItem(rawInput, options);
      return NextResponse.json({ success: true, result });
    }

    // 3. Save identified record to database
    if (action === 'save') {
      const { item, url } = body;
      if (!item) {
        return NextResponse.json({ error: 'Identified item object is required to save' }, { status: 400 });
      }

      const saveRes = await saveIdentifiedMediaRecord(item, url);
      return NextResponse.json(saveRes);
    }

    // 4. Scrape and Identify URL via Rust Worker
    if (action === 'scrape-and-identify') {
      const { url } = body;
      if (!url) {
        return NextResponse.json({ error: 'url is required for scrape-and-identify' }, { status: 400 });
      }

      const rustWorkerUrl = process.env.RUST_WORKER_URL?.replace(/\/+$/, '');
      if (rustWorkerUrl) {
        try {
          const res = await fetch(`${rustWorkerUrl}/api/scrape-and-identify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(20000),
          });
          if (res.ok) {
            const data = await res.json();
            return NextResponse.json(data);
          }
        } catch (e: any) {
          console.warn('Rust worker scrape-and-identify error:', e.message);
        }
      }
      return NextResponse.json({ error: 'Rust worker service is unavailable or unreachable' }, { status: 503 });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('Error in /api/admin/media-identification:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
