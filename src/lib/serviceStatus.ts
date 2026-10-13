import { getEnv } from '@/lib/env';
import { getDatabase } from '@/lib/mongodb';
import { getRedisClient } from '@/lib/redisDb';
import { isR2Configured } from '@/lib/r2';
import { parseReleaseDetails } from '@/lib/releaseParser';

export type ServiceHealthState =
  | 'Operational'
  | 'Degraded'
  | 'Offline'
  | 'Not Configured'
  | 'Unknown';

export type ServiceCategoryGroup =
  | 'APIs'
  | 'Database & Cache'
  | 'Hosting & Deployment'
  | 'Bots & Automation';

export interface ServiceCheckItem {
  id: string;
  name: string;
  group: ServiceCategoryGroup;
  purpose: string;
  status: ServiceHealthState;
  latencyMs?: number;
  checkedAt: string;
  lastOperationalAt?: string | null;
  message: string;
}

export interface ServiceStatusReport {
  overallStatus: ServiceHealthState;
  checkedAt: string;
  cached: boolean;
  summary: {
    total: number;
    operational: number;
    degraded: number;
    offline: number;
    notConfigured: number;
    unknown: number;
  };
  services: ServiceCheckItem[];
}

const CHECK_TIMEOUT_MS = 3500;
const CACHE_TTL_MS = 60_000; // 60 seconds standard cache
const FORCE_REFRESH_COOLDOWN_MS = 10_000; // 10 seconds minimum between forced refreshes

// Server-side in-memory state for caching and tracking lastOperationalAt timestamps
let cachedReport: ServiceStatusReport | null = null;
let cachedAtMs = 0;
const lastOperationalMap = new Map<string, string>();

/**
 * Redacts any sensitive credentials, tokens, or connection strings from diagnostic messages.
 */
export function sanitizeDiagnosticMessage(raw: unknown): string {
  if (!raw) return 'Check failed';
  const msg = typeof raw === 'string' ? raw : (raw as Error)?.message || 'Check failed';
  const redacted = msg
    // Redact Telegram bot tokens
    .replace(/bot\d{6,12}:[A-Za-z0-9_-]+/gi, 'bot[REDACTED]')
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,50}\b/g, '[REDACTED_TOKEN]')
    // Redact MongoDB / Redis connection strings
    .replace(/(mongodb(?:\+srv)?|rediss?):\/\/[^\s"']+/gi, '$1://[REDACTED]')
    // Redact query params like api_key=... or apikey=...
    .replace(/([?&](?:api_key|apikey|token|secret|key)=)[^&\s"']+/gi, '$1[REDACTED]')
    // Redact long hex/base64 keys
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');

  if (redacted.toLowerCase().includes('abort') || redacted.toLowerCase().includes('timeout')) {
    return 'Request timed out';
  }
  return redacted.slice(0, 140);
}

function isPlaceholderValue(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('your_') ||
    lower.startsWith('generate_') ||
    lower.includes('placeholder') ||
    lower.includes('<username>') ||
    lower.includes('<your') ||
    lower === 'dummy_telegram_bot_token'
  );
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = CHECK_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

function recordResult(
  item: Omit<ServiceCheckItem, 'checkedAt' | 'lastOperationalAt'>
): ServiceCheckItem {
  const nowIso = new Date().toISOString();
  if (item.status === 'Operational') {
    lastOperationalMap.set(item.id, nowIso);
  }
  return {
    ...item,
    checkedAt: nowIso,
    lastOperationalAt: lastOperationalMap.get(item.id) || null,
  };
}

/**
 * 1. TMDB API Check
 */
export async function checkTmdbService(overrideKey?: string): Promise<ServiceCheckItem> {
  const apiKey = (
    overrideKey !== undefined
      ? overrideKey
      : getEnv('TMDB_API_KEY') || getEnv('NEXT_PUBLIC_TMDB_API_KEY')
  ).trim();

  const base = {
    id: 'tmdb',
    name: 'TMDB API',
    group: 'APIs' as const,
    purpose: 'Movie & TV metadata, search, posters & season details',
  };

  if (isPlaceholderValue(apiKey)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'TMDB API key is not configured',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`,
      { headers: { Accept: 'application/json' } }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Authenticated API v3 verified (${latencyMs}ms)`,
      });
    }
    if (res.status === 401 || res.status === 403) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: `Authentication failed (HTTP ${res.status})`,
      });
    }
    if (res.status === 429) {
      return recordResult({
        ...base,
        status: 'Degraded',
        latencyMs,
        message: 'Rate limit exceeded (HTTP 429)',
      });
    }
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Unexpected response (HTTP ${res.status})`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 2. Trakt API Check
 */
export async function checkTraktService(overrideClientId?: string): Promise<ServiceCheckItem> {
  const clientId = (
    overrideClientId !== undefined ? overrideClientId : getEnv('TRAKT_CLIENT_ID')
  ).trim();

  const base = {
    id: 'trakt',
    name: 'Trakt API',
    group: 'APIs' as const,
    purpose: 'Verified TV episode titles & season metadata',
  };

  if (isPlaceholderValue(clientId)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'TRAKT_CLIENT_ID not set (TVMaze/TMDB fallback active)',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout('https://api.trakt.tv/shows/trending?limit=1', {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Cinephile-Service-Status/1.0',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
      },
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `API v2 verified (${latencyMs}ms)`,
      });
    }
    if (res.status === 401 || res.status === 403) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: `Client ID rejected (HTTP ${res.status})`,
      });
    }
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Trakt returned HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 3. MDBList API Check
 */
export async function checkMdblistService(overrideKey?: string): Promise<ServiceCheckItem> {
  const apiKey = (
    overrideKey !== undefined
      ? overrideKey
      : getEnv('MDBLIST_API_KEY') || getEnv('NEXT_PUBLIC_MDBLIST_API_KEY')
  ).trim();

  const base = {
    id: 'mdblist',
    name: 'MDBList API',
    group: 'APIs' as const,
    purpose: 'Multi-source ratings aggregation (IMDb, RT, Metacritic)',
  };

  if (isPlaceholderValue(apiKey)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'Server API key not set (TMDB fallback active)',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      `https://mdblist.com/api/?apikey=${encodeURIComponent(apiKey)}&i=tt0111161`,
      { headers: { Accept: 'application/json' } }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.error) {
        return recordResult({
          ...base,
          status: 'Offline',
          latencyMs,
          message: 'Invalid MDBList API key',
        });
      }
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Ratings API verified (${latencyMs}ms)`,
      });
    }
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `MDBList returned HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 4. Firebase Authentication Check
 */
export async function checkFirebaseAuthService(overrideKey?: string): Promise<ServiceCheckItem> {
  const apiKey = (
    overrideKey !== undefined ? overrideKey : getEnv('NEXT_PUBLIC_FIREBASE_API_KEY')
  ).trim();

  const base = {
    id: 'firebase_auth',
    name: 'Firebase Auth',
    group: 'APIs' as const,
    purpose: 'Client identity & Google OAuth RS256 verification',
  };

  if (
    isPlaceholderValue(apiKey) ||
    apiKey === 'AIzaSyDemoPlaceholderKeyForOfflineFirst'
  ) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'Firebase key not set (Local HMAC auth active)',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `JWKS certificates verified (${latencyMs}ms)`,
      });
    }
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `JWKS endpoint returned HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 5. Telegram Bot API Check (Server-Side getMe, never exposes token)
 */
export async function checkTelegramBotService(overrideToken?: string): Promise<ServiceCheckItem> {
  const token = (
    overrideToken !== undefined ? overrideToken : getEnv('TELEGRAM_BOT_TOKEN')
  ).trim();

  const base = {
    id: 'telegram_bot',
    name: 'Telegram Bot API',
    group: 'Bots & Automation' as const,
    purpose: 'Admin link publishing, bulk uploads & user alerts',
  };

  if (isPlaceholderValue(token)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'TELEGRAM_BOT_TOKEN is not configured',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`, {
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Date.now() - start;
    const data = await res.json().catch(() => null);

    if (res.ok && data?.ok && data?.result) {
      const botUsername = data.result.username ? `@${data.result.username}` : 'Bot';
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Authenticated as ${botUsername} (${latencyMs}ms)`,
      });
    }

    if (res.status === 401 || data?.error_code === 401) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: 'Bot token unauthorized or revoked (HTTP 401)',
      });
    }

    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Telegram API returned HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 6. TV Release Parser & IMDb Suggestion Co-Identifier Check
 */
export async function checkTvParserAndImdbService(): Promise<ServiceCheckItem> {
  const base = {
    id: 'tv_parser_imdb',
    name: 'TV Parser & IMDb Lookup',
    group: 'Bots & Automation' as const,
    purpose: 'Release filename parser & IMDb suggestion co-identifier',
  };

  const start = Date.now();
  try {
    // 1. Verify deterministic release parser engine
    const sample = parseReleaseDetails(
      'Money.Heist.S01E06.1080p.NF.WEB-DL.Multi.DDP5.1.H.264.mkv'
    );
    const parserOk = sample.resolution === '1080p' && sample.codec === 'H.264';
    if (!parserOk) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs: Date.now() - start,
        message: 'Release parser self-test failed',
      });
    }

    // 2. Verify IMDb suggestion co-identifier endpoint used by bot & metadata resolver
    const res = await fetchWithTimeout(
      'https://v3.sg.media-imdb.com/suggestion/t/tt0111161.json',
      { headers: { Accept: 'application/json' } }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Parser & IMDb co-identifier verified (${latencyMs}ms)`,
      });
    }

    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Parser active; IMDb API returned HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs: Date.now() - start,
      message: `Parser active; IMDb lookup ${sanitizeDiagnosticMessage(err).toLowerCase()}`,
    });
  }
}

/**
 * 7. MongoDB Atlas Check
 */
export async function checkMongoDbService(overrideUri?: string): Promise<ServiceCheckItem> {
  const uri = (overrideUri !== undefined ? overrideUri : getEnv('MONGODB_URI')).trim();

  const base = {
    id: 'mongodb',
    name: 'MongoDB Atlas',
    group: 'Database & Cache' as const,
    purpose: 'Authoritative database for releases, requests & reports',
  };

  if (isPlaceholderValue(uri)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'MONGODB_URI is not configured',
    });
  }

  if (!/^mongodb(\+srv)?:\/\/.+/i.test(uri)) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: 0,
      message: 'Invalid MongoDB connection URI scheme',
    });
  }

  const start = Date.now();
  const isEdgeRuntime =
    typeof (globalThis as any).WebSocketPair !== 'undefined' || Boolean(getEnv('WORKER_NAME'));

  if (isEdgeRuntime && overrideUri === undefined) {
    // In Cloudflare Workers workerd runtime, direct TCP SRV connections are unavailable;
    // mutations and uncached queries bridge through the upstream Node.js service or Upstash mirror.
    const upstreamBase = getEnv('UPSTREAM_API_URL') || 'https://cinephile-app.vercel.app';
    try {
      const res = await fetchWithTimeout(`${upstreamBase}/api/catalog?limit=1`, {
        headers: { 'User-Agent': 'Cinephile-Health-Check/1.0' },
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return recordResult({
          ...base,
          status: 'Operational',
          latencyMs,
          message: `Reachable via Node.js bridge (${latencyMs}ms)`,
        });
      }
      return recordResult({
        ...base,
        status: 'Degraded',
        latencyMs,
        message: `Edge TCP bypassed; bridge HTTP ${res.status}`,
      });
    } catch (err) {
      return recordResult({
        ...base,
        status: 'Degraded',
        latencyMs: Date.now() - start,
        message: 'Edge TCP bypassed; upstream bridge unreachable',
      });
    }
  }

  // If an explicit overrideUri was provided that differs from configured env, test it isolated
  if (overrideUri !== undefined && overrideUri !== getEnv('MONGODB_URI')) {
    try {
      const { MongoClient } = await import('mongodb');
      const testClient = new MongoClient(uri, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000,
      });
      try {
        await testClient.connect();
        await testClient.db('admin').command({ ping: 1 });
        const latencyMs = Date.now() - start;
        return recordResult({
          ...base,
          status: 'Operational',
          latencyMs,
          message: `Ping OK (${latencyMs}ms)`,
        });
      } finally {
        await testClient.close().catch(() => {});
      }
    } catch (err) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs: Date.now() - start,
        message: sanitizeDiagnosticMessage(err),
      });
    }
  }

  try {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Database ping timed out')), CHECK_TIMEOUT_MS)
    );
    const db = await Promise.race([getDatabase(), timeoutPromise]);
    const latencyMs = Date.now() - start;

    if (!db) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: 'Database connection unavailable',
      });
    }

    await Promise.race([db.command({ ping: 1 }), timeoutPromise]);
    const count = await db
      .collection('links')
      .estimatedDocumentCount()
      .catch(() => null);
    const totalLatency = Date.now() - start;

    const countSuffix = typeof count === 'number' ? ` · ${count.toLocaleString()} links` : '';
    return recordResult({
      ...base,
      status: 'Operational',
      latencyMs: totalLatency,
      message: `Ping OK (${totalLatency}ms${countSuffix})`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 8. Upstash Redis Check
 */
export async function checkUpstashRedisService(
  overrideUrl?: string,
  overrideToken?: string
): Promise<ServiceCheckItem> {
  const url = (
    overrideUrl !== undefined
      ? overrideUrl
      : getEnv('UPSTASH_REDIS_REST_URL') || getEnv('KV_REST_API_URL')
  ).trim();
  const token = (
    overrideToken !== undefined
      ? overrideToken
      : getEnv('UPSTASH_REDIS_REST_TOKEN') || getEnv('KV_REST_API_TOKEN')
  ).trim();

  const base = {
    id: 'upstash_redis',
    name: 'Upstash Redis',
    group: 'Database & Cache' as const,
    purpose: 'Edge catalog cache, link hash mirror & rate limiting',
  };

  if (isPlaceholderValue(url) || isPlaceholderValue(token)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'Upstash REST credentials not configured',
    });
  }

  const start = Date.now();

  // When testing with explicit credential overrides, verify directly against the REST endpoint
  if (overrideUrl !== undefined || overrideToken !== undefined) {
    try {
      const cleanUrl = url.replace(/\/+$/, '');
      const res = await fetchWithTimeout(`${cleanUrl}/ping`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.result === 'PONG') {
          return recordResult({
            ...base,
            status: 'Operational',
            latencyMs,
            message: `PONG (${latencyMs}ms)`,
          });
        }
      }
      if (res.status === 401 || res.status === 403) {
        return recordResult({
          ...base,
          status: 'Offline',
          latencyMs,
          message: `Redis auth failed (HTTP ${res.status})`,
        });
      }
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: `Redis returned HTTP ${res.status}`,
      });
    } catch (err) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs: Date.now() - start,
        message: sanitizeDiagnosticMessage(err),
      });
    }
  }

  try {
    const redis = getRedisClient();
    if (!redis) {
      return recordResult({
        ...base,
        status: 'Offline',
        message: 'Failed to initialize Redis client',
      });
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis request timed out')), CHECK_TIMEOUT_MS)
    );

    const [pingRes, hlen] = await Promise.race([
      Promise.all([redis.ping(), redis.hlen('cinefuel:curated_links').catch(() => null)]),
      timeoutPromise,
    ]);
    const latencyMs = Date.now() - start;

    if (pingRes === 'PONG') {
      const titlesNote = typeof hlen === 'number' ? ` · ${hlen.toLocaleString()} titles` : '';
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `PONG (${latencyMs}ms${titlesNote})`,
      });
    }

    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: 'Unexpected ping response from Redis',
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * 9. Cloudflare R2 Storage Check
 */
export async function checkCloudflareR2Service(): Promise<ServiceCheckItem> {
  const base = {
    id: 'cloudflare_r2',
    name: 'Cloudflare R2',
    group: 'Database & Cache' as const,
    purpose: 'S3-compatible zero-egress media object storage',
  };

  const accessKey = getEnv('R2_ACCESS_KEY_ID');
  const secretKey = getEnv('R2_SECRET_ACCESS_KEY');

  if (!isR2Configured() || isPlaceholderValue(accessKey) || isPlaceholderValue(secretKey)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'R2 credentials not set (external link hosts active)',
    });
  }

  return recordResult({
    ...base,
    status: 'Operational',
    message: `Configured (bucket: ${getEnv('R2_BUCKET') || 'cinephile-media'})`,
  });
}

/**
 * 10. Cloudflare Workers Check (Distinguishes active runtime vs remote deployment)
 */
export async function checkCloudflareWorkersService(): Promise<ServiceCheckItem> {
  const base = {
    id: 'cloudflare_workers',
    name: 'Cloudflare Workers',
    group: 'Hosting & Deployment' as const,
    purpose: 'Edge production runtime & global CDN (cinephile)',
  };

  const isCurrentRuntime =
    typeof (globalThis as any).WebSocketPair !== 'undefined' || Boolean(getEnv('WORKER_NAME'));

  if (isCurrentRuntime) {
    return recordResult({
      ...base,
      status: 'Operational',
      latencyMs: 1,
      message: `Active runtime (${getEnv('WORKER_NAME') || 'cinephile'})`,
    });
  }

  const workerUrl = 'https://cinephile.sk6216071.workers.dev/robots.txt';
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(workerUrl);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Edge deployment reachable (${latencyMs}ms)`,
      });
    }
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Edge deployment HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: `Edge deployment ${sanitizeDiagnosticMessage(err).toLowerCase()}`,
    });
  }
}

/**
 * 11. Vercel Deployment Check (Distinguishes active runtime vs upstream bridge reachability)
 */
export async function checkVercelService(): Promise<ServiceCheckItem> {
  const base = {
    id: 'vercel',
    name: 'Vercel',
    group: 'Hosting & Deployment' as const,
    purpose: 'Node.js serverless deployment & MongoDB API bridge',
  };

  const isVercelRuntime = Boolean(process.env.VERCEL);
  if (isVercelRuntime) {
    return recordResult({
      ...base,
      status: 'Operational',
      latencyMs: 1,
      message: `Active runtime (${process.env.VERCEL_ENV || 'production'})`,
    });
  }

  const upstreamUrl = (getEnv('UPSTREAM_API_URL') || 'https://cinephile-app.vercel.app').replace(
    /\/+$/,
    ''
  );
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${upstreamUrl}/robots.txt`);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Deployment reachable (${latencyMs}ms)`,
      });
    }
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Deployment returned HTTP ${res.status}`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: Date.now() - start,
      message: `Deployment ${sanitizeDiagnosticMessage(err).toLowerCase()}`,
    });
  }
}

/**
 * 12. GitHub Actions CI/CD Check
 */
export async function checkGitHubActionsService(): Promise<ServiceCheckItem> {
  const base = {
    id: 'github_actions',
    name: 'GitHub Actions',
    group: 'Hosting & Deployment' as const,
    purpose: 'Automated build & Cloudflare Workers deploy pipeline',
  };

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://api.github.com/repos/sk6216071-glitch/cinephile/actions/workflows/deploy-production.yml/runs?per_page=1',
      {
        headers: {
          'User-Agent': 'Cinephile-Service-Status/1.0',
          Accept: 'application/vnd.github+json',
        },
      }
    );
    const latencyMs = Date.now() - start;

    if (res.status === 403 || res.status === 429) {
      return recordResult({
        ...base,
        status: 'Unknown',
        latencyMs,
        message: 'GitHub API rate limit reached',
      });
    }

    if (!res.ok) {
      return recordResult({
        ...base,
        status: 'Unknown',
        latencyMs,
        message: `GitHub API returned HTTP ${res.status}`,
      });
    }

    const data = await res.json().catch(() => null);
    const latestRun = data?.workflow_runs?.[0];
    if (!latestRun) {
      return recordResult({
        ...base,
        status: 'Unknown',
        latencyMs,
        message: 'No deployment runs found',
      });
    }

    const sha = typeof latestRun.head_sha === 'string' ? latestRun.head_sha.slice(0, 7) : '';
    if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Deploy in progress (${sha})`,
      });
    }

    if (latestRun.conclusion === 'success') {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Last deploy succeeded (${sha})`,
      });
    }

    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Last deploy ${latestRun.conclusion || 'failed'} (${sha})`,
    });
  } catch (err) {
    return recordResult({
      ...base,
      status: 'Unknown',
      latencyMs: Date.now() - start,
      message: sanitizeDiagnosticMessage(err),
    });
  }
}

/**
 * Computes the overall status from individual service checks.
 */
export function computeOverallStatus(services: ServiceCheckItem[]): ServiceHealthState {
  // Core services required for primary website & bot operation
  const criticalIds = new Set(['tmdb', 'mongodb', 'upstash_redis', 'telegram_bot']);
  const criticalServices = services.filter((s) => criticalIds.has(s.id));

  if (criticalServices.some((s) => s.status === 'Offline')) {
    return 'Degraded';
  }
  if (services.some((s) => s.status === 'Offline' || s.status === 'Degraded')) {
    return 'Degraded';
  }
  if (criticalServices.every((s) => s.status === 'Operational')) {
    return 'Operational';
  }
  return 'Unknown';
}

/**
 * Runs all service health checks in parallel with server-side caching & rate limiting.
 */
export async function getAllServiceStatuses(options?: {
  forceRefresh?: boolean;
}): Promise<ServiceStatusReport> {
  const now = Date.now();
  const force = Boolean(options?.forceRefresh);

  if (cachedReport) {
    const age = now - cachedAtMs;
    if (!force && age < CACHE_TTL_MS) {
      return { ...cachedReport, cached: true };
    }
    // Rate limit forced refreshes to at most once every 10 seconds
    if (force && age < FORCE_REFRESH_COOLDOWN_MS) {
      return { ...cachedReport, cached: true };
    }
  }

  const checks = await Promise.all([
    // APIs
    checkTmdbService(),
    checkTraktService(),
    checkMdblistService(),
    checkFirebaseAuthService(),
    // Database & Cache
    checkMongoDbService(),
    checkUpstashRedisService(),
    checkCloudflareR2Service(),
    // Hosting & Deployment
    checkCloudflareWorkersService(),
    checkVercelService(),
    checkGitHubActionsService(),
    // Bots & Automation
    checkTelegramBotService(),
    checkTvParserAndImdbService(),
  ]);

  const summary = {
    total: checks.length,
    operational: checks.filter((c) => c.status === 'Operational').length,
    degraded: checks.filter((c) => c.status === 'Degraded').length,
    offline: checks.filter((c) => c.status === 'Offline').length,
    notConfigured: checks.filter((c) => c.status === 'Not Configured').length,
    unknown: checks.filter((c) => c.status === 'Unknown').length,
  };

  const report: ServiceStatusReport = {
    overallStatus: computeOverallStatus(checks),
    checkedAt: new Date(now).toISOString(),
    cached: false,
    summary,
    services: checks,
  };

  cachedReport = report;
  cachedAtMs = now;
  return report;
}
