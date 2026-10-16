import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedUploadedTitles } from '@/lib/redisDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const type = (searchParams.get('type') as any) || 'all';
    const quality = searchParams.get('quality') || undefined;
    const category = searchParams.get('category') || undefined;
    const audio = searchParams.get('audio') || undefined;
    const ott = searchParams.get('ott') || undefined;
    const query = searchParams.get('q') || searchParams.get('query') || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = Number(searchParams.get('limit')) || 24;
    const page = Number(searchParams.get('page')) || 1;

    const result = await getPaginatedUploadedTitles({
      cursor,
      type,
      quality,
      category,
      audio,
      ott,
      query,
      limit,
      page,
    });

    const isCacheHit = (result as any).source === 'cache';
    const response = NextResponse.json({
      success: true,
      ...result,
    });
    response.headers.set('X-Cache', isCacheHit ? 'HIT' : 'MISS');
    response.headers.set('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=86400');
    return response;
  } catch (err: any) {
    console.error('Error in /api/catalog:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
