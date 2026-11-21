import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  const results: Record<string, { status: 'healthy' | 'degraded' | 'down'; latencyMs: number; details?: any }> = {};

  // 1. Upstash Redis
  const redisUrl = getEnv('UPSTASH_REDIS_REST_URL');
  const redisToken = getEnv('UPSTASH_REDIS_REST_TOKEN');
  if (redisUrl && redisToken) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      const latencyMs = Date.now() - t0;
      results.redis = {
        status: data?.result === 'PONG' ? 'healthy' : 'degraded',
        latencyMs,
        details: { ping: data?.result },
      };
    } catch (e: any) {
      results.redis = { status: 'down', latencyMs: Date.now() - t0, details: e.message };
    }
  } else {
    results.redis = { status: 'down', latencyMs: 0, details: 'Credentials not configured' };
  }

  // 2. Supabase PostgreSQL
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (supabaseUrl && supabaseKey) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/links?select=id&limit=1`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        signal: AbortSignal.timeout(4000),
      });
      const latencyMs = Date.now() - t0;
      results.supabase = {
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs,
        details: { httpStatus: res.status },
      };
    } catch (e: any) {
      results.supabase = { status: 'down', latencyMs: Date.now() - t0, details: e.message };
    }
  } else {
    results.supabase = { status: 'down', latencyMs: 0, details: 'Credentials not configured' };
  }

  // 3. TMDB API
  const tmdbKey = getEnv('TMDB_API_KEY') || getEnv('NEXT_PUBLIC_TMDB_API_KEY');
  if (tmdbKey) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${tmdbKey}`, {
        signal: AbortSignal.timeout(4000),
      });
      const latencyMs = Date.now() - t0;
      results.tmdb = {
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs,
        details: { httpStatus: res.status },
      };
    } catch (e: any) {
      results.tmdb = { status: 'down', latencyMs: Date.now() - t0, details: e.message };
    }
  } else {
    results.tmdb = { status: 'down', latencyMs: 0, details: 'TMDB key missing' };
  }

  // 4. Telegram Bot API
  const botToken = getEnv('TELEGRAM_BOT_TOKEN');
  if (botToken) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      const latencyMs = Date.now() - t0;
      results.telegram = {
        status: data?.ok ? 'healthy' : 'degraded',
        latencyMs,
        details: { username: data?.result?.username },
      };
    } catch (e: any) {
      results.telegram = { status: 'down', latencyMs: Date.now() - t0, details: e.message };
    }
  } else {
    results.telegram = { status: 'down', latencyMs: 0, details: 'Bot token missing' };
  }

  // 5. Cloudflare Worker Edge Runtime
  results.worker = {
    status: 'healthy',
    latencyMs: 1,
    details: {
      runtime: typeof (globalThis as any).WebSocketPair !== 'undefined' ? 'edge' : 'node',
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json({
    success: true,
    diagnostics: results,
    timestamp: new Date().toISOString(),
  });
}
