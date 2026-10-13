import { getEnv } from '@/lib/env';
import { getDatabase } from '@/lib/mongodb';
import { getRedisClient } from '@/lib/redisDb';
import { isR2Configured, getR2Config } from '@/lib/r2';
import { parseReleaseDetails } from '@/lib/releaseParser';
import {
  extractEpisodeTitle,
  detectSeasonNumber,
  detectEpisodeNumber,
} from '@/lib/seasonParser';

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

export interface GitHubWorkflowCacheEntry {
  status: ServiceHealthState;
  conclusion: string;
  sha: string;
  runTimestamp: string;
  fetchedAtMs: number;
}

const CHECK_TIMEOUT_MS = 3500;
const CACHE_TTL_MS = 60_000; // 60 seconds standard report cache
const FORCE_REFRESH_COOLDOWN_MS = 10_000; // 10 seconds minimum between forced refreshes
const GITHUB_WORKFLOW_CACHE_TTL_MS = 300_000; // 5 minutes workflow cache to conserve GitHub API quota

// Server-side in-memory state for caching and tracking lastOperationalAt timestamps
let cachedReport: ServiceStatusReport | null = null;
let cachedAtMs = 0;
const lastOperationalMap = new Map<string, string>();
let lastKnownGitHubRun: GitHubWorkflowCacheEntry | null = null;

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
    // Redact Bearer / GitHub / JWT tokens
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]+\b/g, '[REDACTED_GH_TOKEN]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');

  if (redacted.toLowerCase().includes('abort') || redacted.toLowerCase().includes('timeout')) {
    return 'Request timed out';
  }
  return redacted.slice(0, 140);
}

export function isPlaceholderValue(val: string | undefined): boolean {
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

export function formatShortTimestamp(isoString: string | undefined | null): string {
  if (!isoString) return 'recent';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return 'recent';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return 'recent';
  }
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
  item: Omit<ServiceCheckItem, 'checkedAt' | 'lastOperationalAt'>,
  customLastOperationalAt?: string
): ServiceCheckItem {
  const nowIso = new Date().toISOString();
  if (item.status === 'Operational') {
    lastOperationalMap.set(item.id, customLastOperationalAt || nowIso);
  } else if (customLastOperationalAt) {
    lastOperationalMap.set(item.id, customLastOperationalAt);
  }
  return {
    ...item,
    checkedAt: nowIso,
    lastOperationalAt: lastOperationalMap.get(item.id) || null,
  };
}

/**
 * 1. TMDB API Check
 * Supports both TMDB v4 API Read Access Token (Bearer) and v3 API Key.
 */
export async function checkTmdbService(overrideCredential?: string): Promise<ServiceCheckItem> {
  const readToken = getEnv('TMDB_READ_ACCESS_TOKEN') || getEnv('TMDB_ACCESS_TOKEN');
  const v3Key = getEnv('TMDB_API_KEY') || getEnv('NEXT_PUBLIC_TMDB_API_KEY');
  const credential = (
    overrideCredential !== undefined ? overrideCredential : readToken || v3Key
  ).trim();

  const base = {
    id: 'tmdb',
    name: 'TMDB API',
    group: 'APIs' as const,
    purpose: 'Movie & TV metadata, search, posters & season details',
  };

  if (isPlaceholderValue(credential)) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'TMDB API credential is not configured',
    });
  }

  const isBearerToken =
    credential.startsWith('eyJ') ||
    (overrideCredential === undefined && Boolean(readToken) && credential === readToken.trim());

  const url = isBearerToken
    ? 'https://api.themoviedb.org/3/configuration'
    : `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(credential)}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (isBearerToken) {
    headers.Authorization = `Bearer ${credential}`;
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, { headers });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.images?.secure_base_url) {
        const authMode = isBearerToken ? 'Read Access Token' : 'API v3';
        return recordResult({
          ...base,
          status: 'Operational',
          latencyMs,
          message: `Authenticated ${authMode} verified (${latencyMs}ms)`,
        });
      }
      return recordResult({
        ...base,
        status: 'Degraded',
        latencyMs,
        message: 'Unexpected TMDB configuration payload',
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
 * 2. Trakt API Check (Optional secondary episode metadata provider)
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

  if (!/^[a-f0-9]{64}$/i.test(clientId)) {
    return recordResult({
      ...base,
      status: 'Offline',
      latencyMs: 0,
      message: 'Invalid TRAKT_CLIENT_ID format (expected 64-char hex)',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://api.trakt.tv/search/imdb/tt0903747?type=show',
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Cinephile-Service-Status/1.0',
          'trakt-api-version': '2',
          'trakt-api-key': clientId,
        },
      }
    );
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
 * 3. MDBList API Check (Optional multi-source ratings provider)
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
    if (res.status === 401 || res.status === 403) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: `Invalid MDBList key (HTTP ${res.status})`,
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
 * 4. Firebase Authentication Check (Optional; app uses Local HMAC auth when unset)
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
 * 5. Telegram Bot API Check (Server-Side getMe with timeout, never exposes token)
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

    if (res.ok && data?.ok === true && data?.result?.id) {
      const botUsername = data.result.username ? `@${data.result.username}` : 'Bot';
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Authenticated as ${botUsername} (${latencyMs}ms)`,
      });
    }

    if (res.status === 401 || res.status === 404 || data?.error_code === 401) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: 'Bot token unauthorized or revoked (HTTP 401)',
      });
    }

    if (res.status === 429 || data?.error_code === 429) {
      return recordResult({
        ...base,
        status: 'Degraded',
        latencyMs,
        message: 'Telegram API rate limit reached (HTTP 429)',
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
 * Tests real functionality of releaseParser, seasonParser, and the IMDb suggestion payload.
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
    // 1. Verify deterministic release parser engine (2160p + DV HDR + H.265 & 1080p + H.264)
    const sample4k = parseReleaseDetails(
      'Money.Heist.S01E06.2160p.NF.WEB-DL.DV.HDR.DDP5.1.H.265.mkv'
    );
    const sample1080p = parseReleaseDetails(
      'Money.Heist.S01E06.The.Hot.Cold.War.1080p.NF.WEB-DL.Multi.DDP5.1.H.264.mkv'
    );
    const releaseParserOk =
      sample4k.resolution === '2160p' &&
      sample4k.codec === 'H.265' &&
      sample4k.dynamicRange === 'DV HDR' &&
      sample4k.seasonNumber === 1 &&
      sample4k.episodeNumber === 6 &&
      sample1080p.resolution === '1080p' &&
      sample1080p.codec === 'H.264';

    // 2. Verify season & episode title parser engine
    const sampleLink = {
      title: 'Money.Heist.S01E06.The.Hot.Cold.War.1080p.NF.WEB-DL.H.264.mkv',
      quality: '1080p',
    };
    const seasonNum = detectSeasonNumber(sampleLink);
    const episodeNum = detectEpisodeNumber(sampleLink);
    const extractedTitle = extractEpisodeTitle(sampleLink.title);
    const seasonParserOk =
      seasonNum === 1 &&
      episodeNum === 6 &&
      typeof extractedTitle === 'string' &&
      extractedTitle.toLowerCase().includes('hot cold war');

    if (!releaseParserOk || !seasonParserOk) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs: Date.now() - start,
        message: 'Parser self-test failed on release/episode verification',
      });
    }

    // 3. Verify IMDb suggestion co-identifier endpoint and JSON response structure
    const res = await fetchWithTimeout(
      'https://v3.sg.media-imdb.com/suggestion/t/tt0111161.json',
      { headers: { Accept: 'application/json' } }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => null);
      const hasValidMatch =
        Array.isArray(data?.d) &&
        data.d.some((item: { id?: string }) => item?.id === 'tt0111161');
      if (hasValidMatch) {
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
        message: 'Parser active; IMDb payload missing expected title match',
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
    'WebSocketPair' in globalThis || Boolean(getEnv('WORKER_NAME'));

  if (isEdgeRuntime && overrideUri === undefined) {
    // In Cloudflare Workers workerd runtime, direct TCP SRV connections are unavailable;
    // mutations and uncached queries bridge through the upstream Node.js service.
    const upstreamBase = getEnv('UPSTREAM_API_URL') || 'https://cinephile-app.vercel.app';
    try {
      const res = await fetchWithTimeout(`${upstreamBase}/api/catalog?limit=1`, {
        headers: { 'User-Agent': 'Cinephile-Health-Check/1.0', Accept: 'application/json' },
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const validPayload =
          Array.isArray(data?.items) || Array.isArray(data?.titles) || Array.isArray(data);
        if (validPayload) {
          return recordResult({
            ...base,
            status: 'Operational',
            latencyMs,
            message: `Verified via Node.js bridge (${latencyMs}ms)`,
          });
        }
        return recordResult({
          ...base,
          status: 'Degraded',
          latencyMs,
          message: 'Bridge reachable but returned unexpected catalog payload',
        });
      }
      return recordResult({
        ...base,
        status: 'Degraded',
        latencyMs,
        message: `Edge TCP bypassed; bridge HTTP ${res.status}`,
      });
    } catch {
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
 * 9. Cloudflare R2 Storage Check (Optional unused integration; never marked Operational without a real check)
 */
export async function checkCloudflareR2Service(): Promise<ServiceCheckItem> {
  const base = {
    id: 'cloudflare_r2',
    name: 'Cloudflare R2',
    group: 'Database & Cache' as const,
    purpose: 'S3-compatible zero-egress media object storage',
  };

  const cfg = getR2Config();
  if (
    !isR2Configured() ||
    isPlaceholderValue(cfg.accessKeyId) ||
    isPlaceholderValue(cfg.secretAccessKey)
  ) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'R2 credentials not set (external link hosts active)',
    });
  }

  const probeUrl =
    cfg.publicUrl ||
    (cfg.endpoint && cfg.bucket
      ? `${cfg.endpoint.replace(/\/+$/, '')}/${cfg.bucket}`
      : null);

  if (!probeUrl) {
    return recordResult({
      ...base,
      status: 'Not Configured',
      message: 'R2 endpoint/public URL not configured',
    });
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(probeUrl, { method: 'HEAD' });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return recordResult({
        ...base,
        status: 'Operational',
        latencyMs,
        message: `Bucket reachable (${cfg.bucket}, ${latencyMs}ms)`,
      });
    }

    if (res.status === 401 || res.status === 403 || res.status === 400) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: `R2 endpoint rejected probe (HTTP ${res.status})`,
      });
    }

    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `R2 returned HTTP ${res.status}`,
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
    'WebSocketPair' in globalThis || Boolean(getEnv('WORKER_NAME'));

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
 * Helper to seed or clear the GitHub Actions workflow cache (used in testing and runtime caching).
 */
export function setGitHubWorkflowCacheForTest(entry: GitHubWorkflowCacheEntry | null): void {
  lastKnownGitHubRun = entry;
}

/**
 * Fallback check using GitHub's public workflow badge SVG (served by github.com CDN,
 * which is not subject to api.github.com's 60 req/hr shared-IP unauthenticated rate limit).
 */
async function checkGitHubBadgeFallback(startMs: number): Promise<ServiceCheckItem> {
  const base = {
    id: 'github_actions',
    name: 'GitHub Actions',
    group: 'Hosting & Deployment' as const,
    purpose: 'Automated build & Cloudflare Workers deploy pipeline',
  };

  try {
    const badgeRes = await fetchWithTimeout(
      'https://github.com/sk6216071-glitch/cinephile/actions/workflows/deploy-production.yml/badge.svg',
      {
        headers: {
          'User-Agent': 'Cinephile-Service-Status/1.0',
          Accept: 'image/svg+xml,text/plain,*/*',
        },
      }
    );
    const latencyMs = Date.now() - startMs;

    if (badgeRes.ok) {
      const svgText = (await badgeRes.text().catch(() => '')).toLowerCase();
      const nowIso = new Date().toISOString();
      const timeLabel = formatShortTimestamp(nowIso);

      if (svgText.includes('passing')) {
        lastKnownGitHubRun = {
          status: 'Operational',
          conclusion: 'success',
          sha: 'main',
          runTimestamp: nowIso,
          fetchedAtMs: Date.now(),
        };
        return recordResult(
          {
            ...base,
            status: 'Operational',
            latencyMs,
            message: `API rate-limited · Last run passing (${timeLabel})`,
          },
          nowIso
        );
      }

      if (svgText.includes('failing')) {
        lastKnownGitHubRun = {
          status: 'Degraded',
          conclusion: 'failure',
          sha: 'main',
          runTimestamp: nowIso,
          fetchedAtMs: Date.now(),
        };
        return recordResult({
          ...base,
          status: 'Degraded',
          latencyMs,
          message: `API rate-limited · Last run failing (${timeLabel})`,
        });
      }
    }
  } catch {
    // Ignore badge fetch errors and fall through to rate-limit Unknown state
  }

  return recordResult({
    ...base,
    status: 'Unknown',
    latencyMs: Date.now() - startMs,
    message: 'GitHub API rate-limited (deployment unaffected)',
  });
}

/**
 * 12. GitHub Actions CI/CD Check
 * - Uses authenticated server-side GitHub API requests if GITHUB_TOKEN / GH_TOKEN is configured.
 * - Caches workflow results for 5 minutes to avoid exhausting rate limits.
 * - When rate-limited (403/429), displays the last known workflow result with its timestamp,
 *   or falls back to the non-rate-limited workflow status badge, distinguishing rate limits from failed deploys.
 */
export async function checkGitHubActionsService(options?: {
  forceRefresh?: boolean;
  simulateRateLimit?: boolean;
  overrideToken?: string;
}): Promise<ServiceCheckItem> {
  const base = {
    id: 'github_actions',
    name: 'GitHub Actions',
    group: 'Hosting & Deployment' as const,
    purpose: 'Automated build & Cloudflare Workers deploy pipeline',
  };

  const now = Date.now();
  // Return cached workflow result if within 5-minute TTL and not simulating a rate limit
  if (
    !options?.forceRefresh &&
    !options?.simulateRateLimit &&
    lastKnownGitHubRun &&
    now - lastKnownGitHubRun.fetchedAtMs < GITHUB_WORKFLOW_CACHE_TTL_MS
  ) {
    const timeLabel = formatShortTimestamp(lastKnownGitHubRun.runTimestamp);
    const label =
      lastKnownGitHubRun.conclusion === 'success'
        ? `Last deploy succeeded (${lastKnownGitHubRun.sha} · ${timeLabel})`
        : lastKnownGitHubRun.conclusion === 'in_progress'
        ? `Deploy in progress (${lastKnownGitHubRun.sha} · ${timeLabel})`
        : `Last deploy ${lastKnownGitHubRun.conclusion} (${lastKnownGitHubRun.sha} · ${timeLabel})`;

    return recordResult(
      {
        ...base,
        status: lastKnownGitHubRun.status,
        latencyMs: 1,
        message: label,
      },
      lastKnownGitHubRun.status === 'Operational' ? lastKnownGitHubRun.runTimestamp : undefined
    );
  }

  const start = Date.now();
  const ghToken = (
    options?.overrideToken !== undefined
      ? options.overrideToken
      : getEnv('GITHUB_TOKEN') || getEnv('GH_TOKEN') || getEnv('GITHUB_PAT')
  ).trim();

  const headers: Record<string, string> = {
    'User-Agent': 'Cinephile-Service-Status/1.0',
    Accept: 'application/vnd.github+json',
  };
  if (!isPlaceholderValue(ghToken)) {
    headers.Authorization = `Bearer ${ghToken}`;
  }

  try {
    const res = options?.simulateRateLimit
      ? new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403 })
      : await fetchWithTimeout(
          'https://api.github.com/repos/sk6216071-glitch/cinephile/actions/workflows/deploy-production.yml/runs?per_page=1',
          { headers }
        );
    const latencyMs = Date.now() - start;

    if (res.status === 403 || res.status === 429) {
      // Distinguish API rate limit from a failed deployment!
      if (lastKnownGitHubRun) {
        const timeLabel = formatShortTimestamp(lastKnownGitHubRun.runTimestamp);
        const stateVerb =
          lastKnownGitHubRun.conclusion === 'success'
            ? 'succeeded'
            : lastKnownGitHubRun.conclusion;
        return recordResult(
          {
            ...base,
            status: lastKnownGitHubRun.status,
            latencyMs,
            message: `API rate-limited · Last run ${stateVerb} (${lastKnownGitHubRun.sha} · ${timeLabel})`,
          },
          lastKnownGitHubRun.status === 'Operational' ? lastKnownGitHubRun.runTimestamp : undefined
        );
      }

      return await checkGitHubBadgeFallback(start);
    }

    if (res.status === 401) {
      return recordResult({
        ...base,
        status: 'Offline',
        latencyMs,
        message: 'GitHub token unauthorized (HTTP 401)',
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
        message: 'No deployment workflow runs found',
      });
    }

    const sha = typeof latestRun.head_sha === 'string' ? latestRun.head_sha.slice(0, 7) : 'main';
    const runTimestamp =
      latestRun.updated_at || latestRun.created_at || new Date().toISOString();
    const timeLabel = formatShortTimestamp(runTimestamp);

    if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
      lastKnownGitHubRun = {
        status: 'Operational',
        conclusion: 'in_progress',
        sha,
        runTimestamp,
        fetchedAtMs: Date.now(),
      };
      return recordResult(
        {
          ...base,
          status: 'Operational',
          latencyMs,
          message: `Deploy in progress (${sha} · ${timeLabel})`,
        },
        runTimestamp
      );
    }

    if (latestRun.conclusion === 'success') {
      lastKnownGitHubRun = {
        status: 'Operational',
        conclusion: 'success',
        sha,
        runTimestamp,
        fetchedAtMs: Date.now(),
      };
      return recordResult(
        {
          ...base,
          status: 'Operational',
          latencyMs,
          message: `Last deploy succeeded (${sha} · ${timeLabel})`,
        },
        runTimestamp
      );
    }

    const conclusion = latestRun.conclusion || 'failed';
    lastKnownGitHubRun = {
      status: 'Degraded',
      conclusion,
      sha,
      runTimestamp,
      fetchedAtMs: Date.now(),
    };
    return recordResult({
      ...base,
      status: 'Degraded',
      latencyMs,
      message: `Last deploy ${conclusion} (${sha} · ${timeLabel})`,
    });
  } catch (err) {
    if (lastKnownGitHubRun) {
      const timeLabel = formatShortTimestamp(lastKnownGitHubRun.runTimestamp);
      return recordResult({
        ...base,
        status: lastKnownGitHubRun.status,
        latencyMs: Date.now() - start,
        message: `Cached · Last run ${lastKnownGitHubRun.conclusion} (${lastKnownGitHubRun.sha} · ${timeLabel})`,
      });
    }
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
 * - Optional unused integrations ("Not Configured" for Trakt, MDBList, Firebase Auth, R2)
 *   are NOT treated as system failures.
 * - Required core services (TMDB, MongoDB, Upstash Redis, Telegram Bot) must be Operational
 *   for overall Operational status.
 */
export function computeOverallStatus(services: ServiceCheckItem[]): ServiceHealthState {
  const criticalIds = new Set(['tmdb', 'mongodb', 'upstash_redis', 'telegram_bot']);
  const criticalServices = services.filter((s) => criticalIds.has(s.id));
  const configuredServices = services.filter((s) => s.status !== 'Not Configured');

  if (configuredServices.length > 0 && configuredServices.every((s) => s.status === 'Offline')) {
    return 'Offline';
  }
  if (services.some((s) => s.status === 'Offline' || s.status === 'Degraded')) {
    return 'Degraded';
  }
  if (criticalServices.some((s) => s.status === 'Not Configured')) {
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
    checkGitHubActionsService({ forceRefresh: force }),
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
