import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';
import { getDatabase, resetMongoClient } from '@/lib/mongodb';
import { TitleDetails } from '@/types';
import { getTitleDetails, getLightweightTitleCard, cleanTitleString, resolveCanonicalMedia } from '@/lib/tmdb';
import { detectShowPlatform, stripWatermarks, detectSeasonNumber, detectEpisodeNumber } from '@/lib/seasonParser';

import { getEnv } from '@/lib/env';

export function getRedisClient(): Redis | null {
  const url = (getEnv('UPSTASH_REDIS_REST_URL') || getEnv('KV_REST_API_URL')).replace(/^["']|["']$/g, '').trim();
  const token = (getEnv('UPSTASH_REDIS_REST_TOKEN') || getEnv('KV_REST_API_TOKEN')).replace(/^["']|["']$/g, '').trim();
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch (err) {
    console.error('Failed to initialize Upstash Redis client:', err);
    return null;
  }
}

const REDIS_HASH_KEY = 'cinefuel:curated_links';
const REDIS_DELETED_KEY = 'cinefuel:deleted_link_ids';
const LOCAL_FILE = path.join(process.cwd(), 'src', 'data', 'serverLinks.json');

/**
 * Configurable catalog cache TTL in seconds (3600s / 1 hour)
 * Note: atomic version counter in Redis invalidates all cached pages instantly on any write/update.
 */
export const CATALOG_CACHE_TTL_SECONDS = 3600;

let localCachedCatalogVersion = 1;
let localCatalogVersionExpiresAt = 0;

/**
 * Returns current catalog cache version from Redis (versioned namespace)
 */
export async function getCatalogCacheVersion(): Promise<number> {
  const now = Date.now();
  if (localCatalogVersionExpiresAt > now) {
    return localCachedCatalogVersion;
  }
  const redisClient = getRedisClient();
  if (!redisClient) return 1;
  const env = (getEnv('APP_ENV') || getEnv('CINEFUEL_ENV') || 'staging').toLowerCase();
  try {
    const v = await redisClient.get<number>(`cinefuel:${env}:catalog:version`);
    const num = Number(v) || 1;
    localCachedCatalogVersion = num;
    localCatalogVersionExpiresAt = now + 10000; // 10s local TTL
    return num;
  } catch {
    return 1;
  }
}

/**
 * Invalidates the Redis catalog summary cache for all media types
 * Uses an atomic version counter in Redis so all previous page caches become obsolete
 * without needing FLUSHDB or deleting unrelated keys.
 */
export async function invalidateCatalogCache(): Promise<void> {
  const redisClient = getRedisClient();
  if (!redisClient) return;
  const env = (getEnv('APP_ENV') || getEnv('CINEFUEL_ENV') || 'staging').toLowerCase();
  try {
    const nextVer = await redisClient.incr(`cinefuel:${env}:catalog:version`);
    localCachedCatalogVersion = Number(nextVer) || (localCachedCatalogVersion + 1);
    localCatalogVersionExpiresAt = Date.now() + 10000;

    // Delete legacy unversioned root keys
    const keys = [
      `cinefuel:${env}:catalog:all`,
      `cinefuel:${env}:catalog:movie`,
      `cinefuel:${env}:catalog:tv`,
    ];
    await redisClient.del(...keys).catch(() => {});
  } catch (err: any) {
    console.warn('Failed to invalidate catalog cache in Redis:', err.message);
  }
}

export interface CatalogCursorData {
  page: number;
  sortDate?: string;
  movieId?: string;
}

export function encodeCatalogCursor(data: CatalogCursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCatalogCursor(token?: string | null): CatalogCursorData | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.page === 'number' && parsed.page >= 1) {
      return parsed as CatalogCursorData;
    }
  } catch {}
  return null;
}

// In-memory single-flight promise map to prevent cache stampedes in Cloudflare Worker runtime
const inFlightCatalogRequests = new Map<string, Promise<PaginatedUploadedResult>>();

let cachedLocalFallback: Record<string, any[]> | null = null;

/**
 * Reads local JSON fallback file safely
 */
export function getLocalFallbackLinks(): Record<string, any[]> {
  const isEdge = typeof (globalThis as any).WebSocketPair !== 'undefined' || Boolean(getEnv('WORKER_NAME'));
  if (isEdge) {
    // On Cloudflare Workers edge, skip reading huge 4.7MB file from filesystem to avoid OOM / CPU timeout
    return {};
  }
  if (cachedLocalFallback) {
    return cachedLocalFallback;
  }
  try {
    if (typeof fs !== 'undefined' && typeof fs.existsSync === 'function' && fs.existsSync(LOCAL_FILE)) {
      const raw = fs.readFileSync(LOCAL_FILE, 'utf-8');
      cachedLocalFallback = JSON.parse(raw || '{}');
      return cachedLocalFallback || {};
    }
  } catch (e) {
    // Expected on Cloudflare Workers edge environment
  }
  return {};
}

function isFileSystemWritable(): boolean {
  if (
    typeof fs === 'undefined' ||
    typeof fs.existsSync !== 'function' ||
    process.env.NEXT_RUNTIME === 'edge' ||
    process.env.CLOUDFLARE_WORKER ||
    typeof (process as any).getBuiltinModule !== 'undefined'
  ) {
    return false;
  }
  return true;
}

/**
 * Writes local JSON fallback file safely
 */
export function saveLocalFallbackLinks(data: Record<string, any[]>): boolean {
  if (!isFileSystemWritable()) return false;
  try {
    const dir = path.dirname(LOCAL_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing local serverLinks.json:', e);
  }
  return false;
}

/**
 * Fetches all links or links for a specific movie from Upstash Redis (with local fallback)
 */
export async function getLinksFromDatabase(
  movieId?: number | string,
  pagination?: { page?: number; limit?: number; q?: string; category?: string }
): Promise<{
  links?: any[];
  allLinks?: Record<string, any[]>;
  total?: number;
  source: 'mongodb_atlas' | 'upstash_redis' | 'local_json';
}> {
  // 1. Try MongoDB Atlas if connected (or upstream proxy on Cloudflare Workers)
  try {
    const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
    if (isCloudflare) {
      try {
        const upstreamBase = getEnv('UPSTREAM_API_URL') || 'https://cinephile-app.vercel.app';
        const queryParams = new URLSearchParams();
        if (movieId) queryParams.set('movieId', String(movieId));
        if (pagination?.page) queryParams.set('page', String(pagination.page));
        if (pagination?.limit) queryParams.set('limit', String(pagination.limit));
        if (pagination?.q && pagination.q.trim()) queryParams.set('q', pagination.q.trim());
        if (pagination?.category && pagination.category !== 'All') queryParams.set('category', pagination.category);

        const upstreamUrl = `${upstreamBase}/api/curated-links?${queryParams.toString()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        let res: Response | null = null;
        try {
          res = await fetch(upstreamUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Cloudflare-Worker-CineFuel' },
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (res && res.ok) {
          const remoteJson: any = await res.json();
          if (remoteJson?.success) {
            if (movieId && Array.isArray(remoteJson.links)) {
              let links = remoteJson.links;
              const redis = getRedisClient();
              if (redis && links.length > 0) {
                try {
                  const checks = await Promise.all(
                    links.map((l: any) => redis.sismember(REDIS_DELETED_KEY, l.id))
                  );
                  links = links.filter((_: any, idx: number) => !checks[idx]);
                } catch {}
              }
              return { links, source: 'mongodb_atlas' as any };
            } else if (remoteJson.allLinks) {
              return {
                allLinks: remoteJson.allLinks,
                total: typeof remoteJson.total === 'number' ? remoteJson.total : undefined,
                source: 'mongodb_atlas' as any,
              };
            }
          }
        }
      } catch (upstreamErr: any) {
        console.warn('Cloudflare upstream curated-links sync error:', upstreamErr.message);
      }
    }

    const db = await getDatabase();
    if (db) {
      const collection = db.collection('links');
      if (movieId) {
        const docs = await collection.find({ movieId: String(movieId) }).sort({ createdAt: -1 }).toArray();
        if (docs && docs.length > 0) {
          const cleaned = docs.map(({ _id, ...rest }) => rest);
          return { links: cleaned, source: 'mongodb_atlas' };
        }
      } else {
        const page = Math.max(1, pagination?.page || 1);
        const limit = Math.max(1, Math.min(200, pagination?.limit || 50));

        const mongoFilter: any = {};
        if (pagination?.category && pagination.category !== 'All') {
          mongoFilter.category = pagination.category;
        }
        if (pagination?.q && pagination.q.trim()) {
          const escaped = pagination.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escaped, 'i');
          mongoFilter.$or = [
            { title: regex },
            { url: regex },
            { movieId: pagination.q.trim() }
          ];
        }

        const isFiltered = Object.keys(mongoFilter).length > 0;
        const total = isFiltered
          ? await collection.countDocuments(mongoFilter).catch(() => 0)
          : await collection.estimatedDocumentCount().catch(() => 0);

        const docs = await collection
          .find(mongoFilter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();
        const grouped: Record<string, any[]> = {};
        for (const doc of docs || []) {
          const { _id, movieId: mId, ...rest } = doc;
          const k = String(mId || rest.movieId);
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(rest);
        }
        return { allLinks: grouped, total, source: 'mongodb_atlas' };
      }
    }
  } catch (mongoErr: any) {
    console.warn('MongoDB Atlas read fallback:', mongoErr.message);
    resetMongoClient();
  }

  const localData = getLocalFallbackLinks();
  const redisClient = getRedisClient();

  if (redisClient) {
    try {
      // Get all deleted link IDs to guarantee deleted links are never resurrected
      let deletedSet = new Set<string>();
      try {
        const deletedIds = await redisClient.smembers(REDIS_DELETED_KEY);
        if (Array.isArray(deletedIds)) {
          deletedSet = new Set(deletedIds as string[]);
        }
      } catch {}

      if (movieId) {
        const key = String(movieId);
        const redisLinks = await redisClient.hget<any[]>(REDIS_HASH_KEY, key);
        let list: any[] = [];
        if (Array.isArray(redisLinks)) {
          list = redisLinks;
        } else if (typeof redisLinks === 'string') {
          try { list = JSON.parse(redisLinks); } catch {}
        } else {
          // If key is totally absent in Redis, fallback to local
          list = localData[key] || [];
        }

        const filtered = list.filter((l: any) => l?.id && !deletedSet.has(l.id));
        return { links: filtered, source: 'upstash_redis' };
      }

      // High-performance Cloudflare-safe pagination:
      // Fetch only the lightweight field names (~5 KB) instead of 8.9 MB full payload with hgetall!
      const allRedisKeys = await redisClient.hkeys(REDIS_HASH_KEY);
      if (allRedisKeys && allRedisKeys.length > 0) {
        const result: Record<string, any[]> = {};
        const allKeys = Array.from(new Set([...Object.keys(localData), ...allRedisKeys]));
        const page = Math.max(1, pagination?.page || 1);
        const limit = Math.max(1, Math.min(100, pagination?.limit || 50));
        const startIndex = (page - 1) * limit;
        const pagedKeys = allKeys.slice(startIndex, startIndex + limit);

        // Fetch ONLY the requested page of keys from Redis using hmget
        let pagedData: Record<string, any> = {};
        if (pagedKeys.length > 0) {
          try {
            const rawHmget = await redisClient.hmget<Record<string, any>>(REDIS_HASH_KEY, ...pagedKeys);
            if (rawHmget && typeof rawHmget === 'object') {
              pagedData = rawHmget;
            }
          } catch (hmgetErr: any) {
            console.warn('hmget fallback in Upstash Redis:', hmgetErr.message);
          }
        }

        for (const k of pagedKeys) {
          const rawVal = pagedData[k] !== undefined ? pagedData[k] : localData[k];
          let list: any[] = [];
          if (Array.isArray(rawVal)) {
            list = rawVal;
          } else if (typeof rawVal === 'string') {
            try { list = JSON.parse(rawVal); } catch {}
          }
          const filtered = list.filter((l: any) => l?.id && !deletedSet.has(l.id));
          if (filtered.length > 0) {
            result[k] = filtered;
          }
        }
        return { allLinks: result, total: allKeys.length, source: 'upstash_redis' };
      }
    } catch (err: any) {
      console.warn('Upstash Redis read failed, using local JSON fallback:', err.message);
    }
  }

  // Fallback to local
  if (movieId) {
    return { links: localData[String(movieId)] || [], source: 'local_json' };
  }
  return { allLinks: localData, source: 'local_json' };
}

/**
 * Forwards mutations (write, delete, batch replace) to upstream Vercel backend
 * when running inside Cloudflare Workers edge environment.
 * Vercel connects to MongoDB Atlas directly in Node.js runtime.
 */
async function proxyMutationToUpstream(method: 'POST' | 'DELETE', path: string, body?: any): Promise<boolean> {
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (!isCloudflare) return false;

  const upstreamBase = getEnv('UPSTREAM_API_URL') || 'https://cinephile-app.vercel.app';
  const adminSecret = (getEnv('ADMIN_SECRET_KEY') || getEnv('ADMIN_PASSWORD') || '').trim();
  if (!adminSecret) return false;
  const adminUser = (getEnv('ADMIN_USER') || getEnv('ADMIN_USERNAME') || 'admin').trim();
  const url = `${upstreamBase}${path}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const headers: Record<string, string> = {
      'x-admin-key': adminSecret,
      'authorization': `Bearer ${adminSecret}`,
      'x-admin-user': adminUser,
      'User-Agent': 'Cloudflare-Worker-CineFuel',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (err: any) {
    console.warn(`Upstream mutation proxy warning (${method} ${path}):`, err.message);
    return false;
  }
}

/**
 * Saves a link to Upstash Redis and local JSON backup
 */
export async function saveLinkToDatabase(movieId: number | string, link: any): Promise<boolean> {
  const key = String(movieId);
  let persisted = false;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      const ok = await proxyMutationToUpstream('POST', '/api/curated-links', {
        movieId: key,
        link,
      });
      if (ok) persisted = true;
    } catch {}
  }

  // 1. MongoDB Atlas Cloud save
  try {
    const db = await getDatabase();
    if (db) {
      let enrichedLink = { ...link };
      if (!enrichedLink.posterPath || !enrichedLink.movieTitle) {
        const existingDoc = await db.collection('links').findOne(
          {
            movieId: key,
            $or: [
              { posterPath: { $exists: true, $nin: [null, ''] } },
              { movieTitle: { $exists: true, $nin: [null, ''] } },
            ],
          },
          { sort: { createdAt: -1 } }
        );
        if (existingDoc) {
          if (!enrichedLink.posterPath) enrichedLink.posterPath = existingDoc.posterPath || existingDoc.poster_path;
          if (!enrichedLink.backdropPath) enrichedLink.backdropPath = existingDoc.backdropPath || existingDoc.backdrop_path;
          if (existingDoc.mediaType === 'movie') {
            enrichedLink.mediaType = 'movie';
            enrichedLink.seasonNumber = null;
            enrichedLink.episodeNumber = null;
            if (enrichedLink.linkType === 'single_episode' || enrichedLink.linkType === 'zip_pack') {
              enrichedLink.linkType = 'general';
            }
            if (enrichedLink.category === 'SingleEpisode' || enrichedLink.category === 'ZipPack') {
              enrichedLink.category = 'Streaming';
            }
          } else if (!enrichedLink.mediaType && existingDoc.mediaType) {
            enrichedLink.mediaType = existingDoc.mediaType;
          }
        }
      }
      await db.collection('links').updateOne(
        { movieId: key, url: enrichedLink.url },
        { $set: { ...enrichedLink, movieId: key, updatedAt: new Date() } },
        { upsert: true }
      );
      persisted = true;
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas save warning:', err.message);
  }

  // 2. Upstash Cloud Redis save
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      if (link.id) {
        // Remove from deleted set in case of re-addition
        await redisClient.srem(REDIS_DELETED_KEY, link.id).catch(() => {});
      }

      let current: any[] = [];
      try {
        const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
        if (Array.isArray(fetched)) current = fetched;
        else if (typeof fetched === 'string') {
          try { current = JSON.parse(fetched); } catch {}
        }
      } catch {}

      if (current.length === 0) {
        const localData = getLocalFallbackLinks();
        current = localData[key] || [];
      }

      const updated = [link, ...current.filter((l: any) => l.id !== link.id && l.url !== link.url)];
      await redisClient.hset(REDIS_HASH_KEY, { [key]: updated });
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis save error:', err.message);
    }
  }

  // 3. Local backup (only when writable)
  if (isFileSystemWritable()) {
    try {
      const localData = getLocalFallbackLinks();
      const existing = localData[key] || [];
      localData[key] = [link, ...existing.filter((l: any) => l.id !== link.id && l.url !== link.url)];
      if (saveLocalFallbackLinks(localData)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local backup save failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not save link.');
  }

  await invalidateCatalogCache().catch(() => {});
  return true;
}

/**
 * Checks whether a specific link URL already exists for a movie in the database.
 */
export function isLinkAlreadyInDatabase(movieId: number | string, url: string): boolean {
  if (!url) return false;
  const localData = getLocalFallbackLinks();
  const existing = localData[String(movieId)] || [];
  return existing.some((l: any) => l.url === url);
}

/**
 * Saves multiple links to Upstash Redis and local JSON backup in one atomic operation
 */
export async function saveMultipleLinksToDatabase(movieId: number | string, links: any[], metadata?: any): Promise<boolean> {
  if (!links || links.length === 0) return true;
  const key = String(movieId);
  let persisted = false;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      const ok = await proxyMutationToUpstream('POST', '/api/curated-links', {
        movieId: key,
        links,
        metadata,
      });
      if (ok) persisted = true;
    } catch {}
  }

  // 1. MongoDB Atlas Cloud batch save
  try {
    const db = await getDatabase();
    if (db) {
      const existingDoc = await db.collection('links').findOne(
        {
          movieId: key,
          $or: [
            { posterPath: { $exists: true, $nin: [null, '', 'undefined', '/placeholder-poster.svg'] } },
            { movieTitle: { $exists: true, $nin: [null, '', 'undefined'] } },
          ],
        },
        { sort: { createdAt: -1 } }
      );
      const ops = links.map((l) => {
        const enriched = { ...l };
        if (metadata) {
          if (!enriched.movieTitle && metadata.movieTitle) enriched.movieTitle = metadata.movieTitle;
          if (!enriched.mediaType && metadata.mediaType) enriched.mediaType = metadata.mediaType;
          if (!enriched.posterPath && metadata.posterPath) enriched.posterPath = metadata.posterPath;
          if (!enriched.backdropPath && metadata.backdropPath) enriched.backdropPath = metadata.backdropPath;
          if (!enriched.releaseDate && metadata.releaseDate) enriched.releaseDate = metadata.releaseDate;
          if (typeof enriched.voteAverage !== 'number' && typeof metadata.voteAverage === 'number') enriched.voteAverage = metadata.voteAverage;
        }
        if (existingDoc) {
          if (!enriched.movieTitle && existingDoc.movieTitle) enriched.movieTitle = existingDoc.movieTitle;
          if (!enriched.posterPath) enriched.posterPath = existingDoc.posterPath || existingDoc.poster_path;
          if (!enriched.backdropPath) enriched.backdropPath = existingDoc.backdropPath || existingDoc.backdrop_path;
          if (existingDoc.mediaType === 'movie') {
            enriched.mediaType = 'movie';
            enriched.seasonNumber = null;
            enriched.episodeNumber = null;
            if (enriched.linkType === 'single_episode' || enriched.linkType === 'zip_pack') {
              enriched.linkType = 'general';
            }
            if (enriched.category === 'SingleEpisode' || enriched.category === 'ZipPack') {
              enriched.category = 'Streaming';
            }
          } else if (!enriched.mediaType && existingDoc.mediaType) {
            enriched.mediaType = existingDoc.mediaType;
          }
        }
        return {
          updateOne: {
            filter: { movieId: key, url: enriched.url },
            update: { $set: { ...enriched, movieId: key, updatedAt: new Date() } },
            upsert: true,
          },
        };
      });
      if (ops.length > 0) {
        await db.collection('links').bulkWrite(ops);
        persisted = true;
      }
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas batch save warning:', err.message);
  }

  // 2. Upstash Cloud Redis save
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const linkIds = links.map((l) => l.id).filter(Boolean);
      if (linkIds.length > 0) {
        await redisClient.srem(REDIS_DELETED_KEY, ...linkIds).catch(() => {});
      }

      let current: any[] = [];
      try {
        const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
        if (Array.isArray(fetched)) current = fetched;
        else if (typeof fetched === 'string') {
          try { current = JSON.parse(fetched); } catch {}
        }
      } catch {}

      if (current.length === 0) {
        const localData = getLocalFallbackLinks();
        current = localData[key] || [];
      }

      const newIds = new Set(links.map((l) => l.id).filter(Boolean));
      const newUrls = new Set(links.map((l) => l.url).filter(Boolean));
      const filteredCurrent = current.filter((l: any) => !newIds.has(l.id) && !newUrls.has(l.url));
      const updated = [...links, ...filteredCurrent];

      await redisClient.hset(REDIS_HASH_KEY, { [key]: updated });
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis batch save error:', err.message);
    }
  }

  // 3. Local backup
  if (isFileSystemWritable()) {
    try {
      const localData = getLocalFallbackLinks();
      const existing = localData[key] || [];
      const newIds = new Set(links.map((l) => l.id).filter(Boolean));
      const newUrls = new Set(links.map((l) => l.url).filter(Boolean));
      const filteredExisting = existing.filter((l: any) => !newIds.has(l.id) && !newUrls.has(l.url));
      localData[key] = [...links, ...filteredExisting];
      if (saveLocalFallbackLinks(localData)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local backup batch save failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not save batch links.');
  }

  await invalidateCatalogCache().catch(() => {});
  return true;
}

/**
 * Deletes a link from Upstash Redis and local JSON backup
 */
export async function deleteLinkFromDatabase(movieId: number | string, linkId: string): Promise<boolean> {
  const key = String(movieId);
  let persisted = false;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      const ok = await proxyMutationToUpstream(
        'DELETE',
        `/api/curated-links?movieId=${encodeURIComponent(key)}&linkId=${encodeURIComponent(linkId)}`
      );
      if (ok) persisted = true;
    } catch {}
  }

  // 1. MongoDB Atlas Cloud deletion
  try {
    const db = await getDatabase();
    if (db) {
      await db.collection('links').deleteMany({
        $or: [
          { id: linkId },
          { movieId: key, id: linkId },
          { movieId: Number(key) as any, id: linkId },
        ],
      } as any);
      persisted = true;
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas delete warning:', err.message);
  }

  // 2. Upstash Cloud Redis deletion
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      // Record in permanent tombstone set
      await redisClient.sadd(REDIS_DELETED_KEY, linkId);

      const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
      let list: any[] = [];
      if (Array.isArray(fetched)) {
        list = fetched;
      } else if (typeof fetched === 'string') {
        try { list = JSON.parse(fetched); } catch {}
      }
      const updated = list.filter((l: any) => l.id !== linkId);
      if (updated.length > 0) {
        await redisClient.hset(REDIS_HASH_KEY, { [key]: updated });
      } else {
        await redisClient.hdel(REDIS_HASH_KEY, key);
      }
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis deletion error:', err.message);
    }
  }

  // 3. Local backup deletion
  if (isFileSystemWritable()) {
    try {
      const localData = getLocalFallbackLinks();
      if (localData[key]) {
        localData[key] = localData[key].filter((l: any) => l.id !== linkId);
        if (saveLocalFallbackLinks(localData)) {
          persisted = true;
        }
      }
    } catch {}
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not delete link.');
  }

  await invalidateCatalogCache().catch(() => {});
  return true;
}

/**
 * Batch deletes multiple links from Upstash Redis and local JSON backup
 */
export async function deleteMultipleLinksFromDatabase(items: Array<{ movieId: number | string; linkId: string }>): Promise<boolean> {
  if (!items || items.length === 0) return true;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      await proxyMutationToUpstream('DELETE', '/api/curated-links', { items });
    } catch {}
  }

  // 1. Local backup deletion
  try {
    const localData = getLocalFallbackLinks();
    const delSet = new Set(items.map((i) => i.linkId));
    items.forEach(({ movieId }) => {
      const key = String(movieId);
      if (localData[key]) {
        localData[key] = localData[key].filter((l: any) => !delSet.has(l.id));
      }
    });
    saveLocalFallbackLinks(localData);
  } catch {}

  // 2. Upstash Cloud Redis deletion
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const linkIds = items.map((i) => i.linkId);
      if (linkIds.length > 0) {
        await redisClient.sadd(REDIS_DELETED_KEY, linkIds[0], ...linkIds.slice(1));
      }

      const byMovie: Record<string, Set<string>> = {};
      items.forEach(({ movieId, linkId }) => {
        const k = String(movieId);
        if (!byMovie[k]) byMovie[k] = new Set();
        byMovie[k].add(linkId);
      });

      for (const [key, delIds] of Object.entries(byMovie)) {
        const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
        let list: any[] = [];
        if (Array.isArray(fetched)) {
          list = fetched;
        } else if (typeof fetched === 'string') {
          try { list = JSON.parse(fetched); } catch {}
        }
        const updated = list.filter((l: any) => !delIds.has(l.id));
        await redisClient.hset(REDIS_HASH_KEY, { [key]: updated });
      }
    } catch (err: any) {
      console.error('Upstash Redis batch deletion error:', err.message);
    }
  }

  // 3. MongoDB Atlas Cloud batch deletion
  try {
    const db = await getDatabase();
    if (db) {
      const ids = items.map((i) => i.linkId);
      await db.collection('links').deleteMany({ id: { $in: ids } });
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas batch delete warning:', err.message);
  }

  await invalidateCatalogCache().catch(() => {});
  return true;
}

/**
 * Seeds all local links into Upstash Redis
 */
export async function seedLocalLinksToRedis(): Promise<{ success: boolean; totalTitles: number }> {
  const redisClient = getRedisClient();
  if (!redisClient) return { success: false, totalTitles: 0 };
  try {
    const local = getLocalFallbackLinks();
    const keys = Object.keys(local);
    if (keys.length === 0) return { success: true, totalTitles: 0 };

    await redisClient.hset(REDIS_HASH_KEY, local);
    return { success: true, totalTitles: keys.length };
  } catch (err: any) {
    console.error('Seeding to Upstash Redis failed:', err.message);
    return { success: false, totalTitles: 0 };
  }
}

/**
 * Migrates an old filehost domain to a new active domain across all links
 */
export async function migrateDomainInDatabase(
  oldDomain: string,
  newDomain: string
): Promise<{ success: boolean; updatedCount: number; oldDomain: string; newDomain: string }> {
  const cleanOld = oldDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const cleanNew = newDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

  if (!cleanOld || !cleanNew || cleanOld === cleanNew) {
    return { success: false, updatedCount: 0, oldDomain: cleanOld, newDomain: cleanNew };
  }

  let totalUpdated = 0;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      await proxyMutationToUpstream('POST', '/api/curated-links', {
        action: 'migrate_domain',
        oldDomain: cleanOld,
        newDomain: cleanNew,
      });
    } catch {}
  }

  // 1. Local fallback update
  try {
    const localData = getLocalFallbackLinks();
    let localCount = 0;
    for (const [movieId, links] of Object.entries(localData)) {
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        if (link.url && link.url.includes(cleanOld)) {
          link.url = link.url.replace(cleanOld, cleanNew);
          link.updatedAt = new Date().toISOString();
          localCount++;
        }
      }
    }
    if (localCount > 0) {
      saveLocalFallbackLinks(localData);
      totalUpdated = Math.max(totalUpdated, localCount);
    }
  } catch (err) {
    console.error('Local JSON domain migration error:', err);
  }

  // 2. Upstash Redis Cloud update
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const allKeys = await redisClient.hgetall(REDIS_HASH_KEY);
      if (allKeys && typeof allKeys === 'object') {
        let redisCount = 0;
        const toUpdate: Record<string, any[]> = {};
        for (const [movieId, linksVal] of Object.entries(allKeys)) {
          let links: any[] = [];
          if (Array.isArray(linksVal)) links = linksVal;
          else if (typeof linksVal === 'string') {
            try { links = JSON.parse(linksVal); } catch {}
          }
          let modified = false;
          for (const link of links) {
            if (link.url && link.url.includes(cleanOld)) {
              link.url = link.url.replace(cleanOld, cleanNew);
              link.updatedAt = new Date().toISOString();
              modified = true;
              redisCount++;
            }
          }
          if (modified) {
            toUpdate[movieId] = links;
          }
        }
        if (Object.keys(toUpdate).length > 0) {
          await redisClient.hset(REDIS_HASH_KEY, toUpdate);
          totalUpdated = Math.max(totalUpdated, redisCount);
        }
      }
    } catch (err: any) {
      console.warn('Redis domain migration warning:', err.message);
    }
  }

  // 3. MongoDB Atlas Cloud update
  try {
    const db = await getDatabase();
    if (db) {
      const collection = db.collection('links');
      const docs = await collection.find({ url: { $regex: cleanOld, $options: 'i' } }).toArray();
      if (docs && docs.length > 0) {
        const ops = docs.map((doc) => {
          const newUrl = doc.url.replace(new RegExp(cleanOld, 'gi'), cleanNew);
          return {
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: {
                  url: newUrl,
                  updatedAt: new Date(),
                },
              },
            },
          };
        });
        if (ops.length > 0) {
          await collection.bulkWrite(ops);
          totalUpdated = Math.max(totalUpdated, ops.length);
        }
      }
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas domain migration warning:', err.message);
  }

  return { success: true, updatedCount: totalUpdated, oldDomain: cleanOld, newDomain: cleanNew };
}

/**
 * Replaces domain across all links for a specific movie or TV series
 */
export async function replaceDomainForTitleInDatabase(
  movieId: number | string,
  oldDomain: string,
  newDomain: string
): Promise<{ success: boolean; updatedCount: number }> {
  const key = String(movieId);
  const cleanOld = oldDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const cleanNew = newDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) {
    return { success: false, updatedCount: 0 };
  }
  let totalUpdated = 0;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      await proxyMutationToUpstream('POST', '/api/curated-links', {
        movieId: key,
        action: 'replace_domain_for_title',
        oldDomain: cleanOld,
        newDomain: cleanNew,
      });
    } catch {}
  }

  // 1. Local fallback
  try {
    const local = getLocalFallbackLinks();
    if (Array.isArray(local[key])) {
      let count = 0;
      for (const link of local[key]) {
        if (link.url && link.url.includes(cleanOld)) {
          link.url = link.url.replace(cleanOld, cleanNew);
          link.updatedAt = new Date().toISOString();
          count++;
        }
      }
      if (count > 0) {
        saveLocalFallbackLinks(local);
        totalUpdated = Math.max(totalUpdated, count);
      }
    }
  } catch {}

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
      let list: any[] = [];
      if (Array.isArray(fetched)) list = fetched;
      else if (typeof fetched === 'string') {
        try { list = JSON.parse(fetched); } catch {}
      }
      let count = 0;
      for (const link of list) {
        if (link.url && link.url.includes(cleanOld)) {
          link.url = link.url.replace(cleanOld, cleanNew);
          link.updatedAt = new Date().toISOString();
          count++;
        }
      }
      if (count > 0) {
        await redisClient.hset(REDIS_HASH_KEY, { [key]: list });
        totalUpdated = Math.max(totalUpdated, count);
      }
    } catch {}
  }

  // 3. MongoDB Atlas
  try {
    const db = await getDatabase();
    if (db) {
      const collection = db.collection('links');
      const docs = await collection.find({ movieId: key, url: { $regex: cleanOld, $options: 'i' } }).toArray();
      if (docs && docs.length > 0) {
        const ops = docs.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                url: doc.url.replace(new RegExp(cleanOld, 'gi'), cleanNew),
                updatedAt: new Date(),
              },
            },
          },
        }));
        await collection.bulkWrite(ops);
        totalUpdated = Math.max(totalUpdated, ops.length);
      }
    }
  } catch {}

  await invalidateCatalogCache().catch(() => {});
  return { success: true, updatedCount: totalUpdated };
}

/**
 * Completely replaces all links for a specific title in MongoDB Atlas, Upstash Redis, and local storage.
 * Used by admin to change the whole link set of a particular movie or TV series.
 */
export async function replaceAllLinksForTitle(
  movieId: number | string,
  newLinks: any[],
  metadata?: {
    movieTitle?: string;
    posterPath?: string;
    backdropPath?: string;
    mediaType?: 'movie' | 'tv';
  }
): Promise<{ success: boolean; count: number }> {
  const key = String(movieId);
  const now = new Date();
  const sanitized = (newLinks || []).map((l, index) => ({
    ...l,
    movieId: key,
    id: l.id || `rep-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: l.createdAt || new Date(Date.now() - index * 1000).toISOString(),
    updatedAt: now.toISOString(),
    ...(metadata?.movieTitle && !l.movieTitle ? { movieTitle: metadata.movieTitle } : {}),
    ...(metadata?.posterPath && !l.posterPath ? { posterPath: metadata.posterPath } : {}),
    ...(metadata?.backdropPath && !l.backdropPath ? { backdropPath: metadata.backdropPath } : {}),
    ...(metadata?.mediaType && !l.mediaType ? { mediaType: metadata.mediaType } : {}),
  }));

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      await proxyMutationToUpstream('POST', '/api/curated-links', {
        movieId: key,
        action: sanitized.length === 0 ? 'delete_all_links' : 'replace_all_links',
        links: sanitized,
        ...metadata,
      });
    } catch {}
  }

  // 1. Local fallback
  try {
    const local = getLocalFallbackLinks();
    if (sanitized.length > 0) {
      local[key] = sanitized;
    } else {
      delete local[key];
    }
    saveLocalFallbackLinks(local);
  } catch {}

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      if (sanitized.length > 0) {
        await redisClient.hset(REDIS_HASH_KEY, { [key]: sanitized });
      } else {
        await redisClient.hdel(REDIS_HASH_KEY, key);
      }
    } catch (err: any) {
      console.warn('Upstash Redis replaceAllLinksForTitle error:', err.message);
    }
  }

  // 3. MongoDB Atlas
  const hasMongo = Boolean(getEnv('MONGODB_URI'));

  if (hasMongo && !isCloudflare) {
    try {
      const db = await getDatabase();
      if (!db) {
        throw new Error(`Primary database connection unavailable for replaceAllLinksForTitle(${key})`);
      }
      const collection = db.collection('links');
      let existingDoc: any = null;
      if (!metadata?.movieTitle || !metadata?.posterPath) {
        existingDoc = await collection.findOne({ movieId: key }, { sort: { createdAt: -1 } });
      }

      await collection.deleteMany({
        $or: [
          { movieId: key },
          { movieId: Number(key) },
        ],
      });

      if (sanitized.length > 0) {
        const docsToInsert = sanitized.map((doc) => {
          const enriched = { ...doc };
          if (existingDoc) {
            if (!enriched.movieTitle) enriched.movieTitle = existingDoc.movieTitle;
            if (!enriched.posterPath) enriched.posterPath = existingDoc.posterPath || existingDoc.poster_path;
            if (!enriched.backdropPath) enriched.backdropPath = existingDoc.backdropPath || existingDoc.backdrop_path;
            if (!enriched.mediaType && existingDoc.mediaType) enriched.mediaType = existingDoc.mediaType;
          }
          return enriched;
        });
        await collection.insertMany(docsToInsert);
      }
    } catch (err: any) {
      console.error('MongoDB Atlas replaceAllLinksForTitle error:', err.message);
      throw new Error(`Database write failed during replaceAllLinksForTitle: ${err.message}`);
    }
  }

  await invalidateCatalogCache().catch(() => {});
  return { success: true, count: sanitized.length };
}

/**
 * Deletes all links for a specific title from all database layers.
 */
export async function deleteAllLinksForTitle(movieId: number | string): Promise<{ success: boolean }> {
  const key = String(movieId);
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
      let list: any[] = [];
      if (Array.isArray(fetched)) list = fetched;
      else if (typeof fetched === 'string') {
        try { list = JSON.parse(fetched); } catch {}
      }
      const ids = list.map((l: any) => l.id).filter(Boolean);
      if (ids.length > 0) {
        await redisClient.sadd(REDIS_DELETED_KEY, ids[0], ...ids.slice(1)).catch(() => {});
      }
      await redisClient.hdel(REDIS_HASH_KEY, key).catch(() => {});
    } catch {}
  }
  return await replaceAllLinksForTitle(movieId, []);
}

/**
 * Updates title metadata (title name, year, poster, backdrop, media type)
 * and optionally remaps/migrates links to a new movieId across Redis, MongoDB, and local storage.
 * Enables admins to fix/rename a title or change its linked TMDB/IMDb ID directly without searching TMDB.
 */
export async function updateTitleMetadata(
  currentMovieId: number | string,
  updates: {
    newMovieId?: number | string;
    movieTitle?: string;
    year?: string | number;
    releaseDate?: string;
    mediaType?: 'movie' | 'tv';
    posterPath?: string;
    backdropPath?: string;
    overview?: string;
  }
): Promise<{ success: boolean; updatedCount: number; newId: string }> {
  const oldKey = String(currentMovieId).trim();
  const newKey = updates.newMovieId ? String(updates.newMovieId).trim() : oldKey;
  const isKeyChanged = oldKey !== newKey;

  // 1. Fetch current links for oldKey
  const res = await getLinksFromDatabase(oldKey);
  let links = Array.isArray(res.links) ? [...res.links] : [];

  const nowIso = new Date().toISOString();
  const relDate = updates.releaseDate || (updates.year ? `${updates.year}-01-01` : '2024-01-01');

  if (links.length === 0) {
    links = [{
      id: `title-meta-${Date.now()}`,
      movieId: newKey,
      title: updates.movieTitle || `Title #${newKey}`,
      movieTitle: updates.movieTitle,
      posterPath: updates.posterPath,
      backdropPath: updates.backdropPath,
      releaseDate: relDate,
      mediaType: updates.mediaType || 'movie',
      overview: updates.overview,
      category: 'Download',
      linkType: 'general',
      url: 'https://cinephile.sk6216071.workers.dev',
      createdAt: nowIso,
      updatedAt: nowIso,
    }];
  } else {
    links = links.map((l) => ({
      ...l,
      movieId: newKey,
      updatedAt: nowIso,
      ...(updates.movieTitle ? { movieTitle: updates.movieTitle } : {}),
      ...(updates.posterPath !== undefined ? { posterPath: updates.posterPath } : {}),
      ...(updates.backdropPath !== undefined ? { backdropPath: updates.backdropPath } : {}),
      ...(updates.mediaType ? { mediaType: updates.mediaType } : {}),
      ...(relDate ? { releaseDate: relDate } : {}),
      ...(updates.overview ? { overview: updates.overview } : {}),
    }));
  }

  // 2. If key changed, remove old key from Redis and local storage
  if (isKeyChanged) {
    await deleteAllLinksForTitle(oldKey).catch(() => {});
  }

  // 3. Save updated links under newKey across all persistence tiers
  await replaceAllLinksForTitle(newKey, links, {
    movieTitle: updates.movieTitle,
    posterPath: updates.posterPath,
    backdropPath: updates.backdropPath,
    mediaType: updates.mediaType,
  });

  await invalidateCatalogCache().catch(() => {});
  return { success: true, updatedCount: links.length, newId: newKey };
}

/**
 * Reassigns specific link IDs from currentMovieId to newMovieId, preserving
 * the exact destination URL, internal link ID, quality, codec, audio, etc.
 * Supports partial reassignment (moving 1 or more links) or full reassignment.
 * If all links are reassigned, currentMovieId is removed from database.
 */
export async function reassignLinksInDatabase(
  currentMovieId: number | string,
  newMovieId: number | string,
  linkIds: string[],
  newMetadata?: {
    movieTitle?: string;
    mediaType?: 'movie' | 'tv';
    posterPath?: string;
    backdropPath?: string;
    releaseDate?: string;
    voteAverage?: number;
  }
): Promise<{
  success: boolean;
  reassignedCount: number;
  remainingCount: number;
  destinationCount: number;
}> {
  const oldKey = String(currentMovieId).trim();
  const newKey = String(newMovieId).trim();
  if (!oldKey || !newKey) throw new Error('currentMovieId and newMovieId are required');
  if (!Array.isArray(linkIds) || linkIds.length === 0) throw new Error('linkIds must be a non-empty array');

  const linkIdSet = new Set(linkIds.map((id) => String(id)));

  // 1. Fetch current links from source
  const currentRes = await getLinksFromDatabase(oldKey);
  const currentLinks = Array.isArray(currentRes.links) ? currentRes.links : [];

  const linksToMove = currentLinks.filter((l) => linkIdSet.has(String(l.id)));
  const remainingLinks = currentLinks.filter((l) => !linkIdSet.has(String(l.id)));

  if (linksToMove.length === 0) {
    throw new Error('No matching links found under currentMovieId with the provided linkIds');
  }

  // 2. Fetch destination links
  const destRes = await getLinksFromDatabase(newKey);
  const destLinks = Array.isArray(destRes.links) ? [...destRes.links] : [];

  const nowIso = new Date().toISOString();
  const explicitReleaseDate = newMetadata?.releaseDate ? String(newMetadata.releaseDate).trim() : null;

  // 3. Update the moved links to newKey, preserving exact URL, ID, quality, etc.
  const updatedMovedLinks = linksToMove.map((l) => ({
    ...l,
    movieId: newKey,
    updatedAt: nowIso,
    ...(newMetadata?.movieTitle ? { movieTitle: newMetadata.movieTitle } : {}),
    ...(newMetadata?.posterPath ? { posterPath: newMetadata.posterPath } : {}),
    ...(newMetadata?.backdropPath ? { backdropPath: newMetadata.backdropPath } : {}),
    ...(newMetadata?.mediaType ? { mediaType: newMetadata.mediaType } : {}),
    ...(explicitReleaseDate ? { releaseDate: explicitReleaseDate } : (l.releaseDate ? { releaseDate: l.releaseDate } : {})),
    ...(newMetadata?.voteAverage !== undefined ? { voteAverage: newMetadata.voteAverage } : {}),
  }));

  // Append to destination without duplicating ID
  const finalDestLinks = [...destLinks.filter((dl) => !linkIdSet.has(String(dl.id))), ...updatedMovedLinks];

  // 4. Update MongoDB Atlas in-place (atomic and respects unique id index without duplicate key collision)
  const hasMongo = Boolean(getEnv('MONGODB_URI'));
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || Boolean(getEnv('WORKER_NAME'));
  let db: any = null;

  if (hasMongo && !isCloudflare) {
    db = await getDatabase();
    if (!db) {
      throw new Error(`Primary database connection unavailable for reassignLinksInDatabase(${oldKey} -> ${newKey})`);
    }
    const collection = db.collection('links');
    const updatePayload: Record<string, any> = {
      movieId: newKey,
      updatedAt: nowIso,
    };
    if (newMetadata?.movieTitle) updatePayload.movieTitle = newMetadata.movieTitle;
    if (newMetadata?.posterPath) updatePayload.posterPath = newMetadata.posterPath;
    if (newMetadata?.backdropPath) updatePayload.backdropPath = newMetadata.backdropPath;
    if (newMetadata?.mediaType) updatePayload.mediaType = newMetadata.mediaType;
    if (explicitReleaseDate) updatePayload.releaseDate = explicitReleaseDate;
    if (newMetadata?.voteAverage !== undefined) updatePayload.voteAverage = newMetadata.voteAverage;

    try {
      await collection.updateMany(
        {
          id: { $in: Array.from(linkIdSet) },
          $or: [{ movieId: oldKey }, { movieId: Number(oldKey) }],
        },
        {
          $set: updatePayload,
        }
      );
    } catch (dbErr: any) {
      console.error('MongoDB Atlas reassignLinksInDatabase error:', dbErr.message);
      throw new Error(`Database write failed during reassignLinksInDatabase: ${dbErr.message}`);
    }
  }

  // 5. Update Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      if (remainingLinks.length === 0) {
        await redisClient.hdel(REDIS_HASH_KEY, oldKey);
      } else {
        await redisClient.hset(REDIS_HASH_KEY, { [oldKey]: remainingLinks });
      }
      await redisClient.hset(REDIS_HASH_KEY, { [newKey]: finalDestLinks });
    } catch (redisErr: any) {
      console.warn('Upstash Redis link reassignment warning:', redisErr.message);
    }
  }

  // 6. Update Local Fallback Storage
  try {
    const local = getLocalFallbackLinks();
    if (remainingLinks.length === 0) {
      delete local[oldKey];
    } else {
      local[oldKey] = remainingLinks;
    }
    local[newKey] = finalDestLinks;
    saveLocalFallbackLinks(local);
  } catch {}

  // 7. Record audit entry
  try {
    if (db) {
      await db.collection('audit_reassignments').insertOne({
        action: 'reassign_links',
        sourceMovieId: oldKey,
        destinationMovieId: newKey,
        reassignedLinkIds: Array.from(linkIdSet),
        reassignedCount: linksToMove.length,
        timestamp: nowIso,
        newMetadata: newMetadata || {},
      }).catch(() => {});
    }
  } catch {}

  await invalidateCatalogCache().catch(() => {});

  return {
    success: true,
    reassignedCount: linksToMove.length,
    remainingCount: remainingLinks.length,
    destinationCount: finalDestLinks.length,
  };
}

/**
 * Permanently deletes an entire title and all its associated links,
 * while creating an audit backup log in MongoDB and local storage.
 */
export async function deleteEntireTitleWithAudit(
  movieId: number | string
): Promise<{
  success: boolean;
  deletedCount: number;
  auditBackup: {
    movieId: string;
    title?: string;
    mediaType?: string;
    deletedCount: number;
    deletedAt: string;
  };
}> {
  const key = String(movieId).trim();
  if (!key) throw new Error('movieId is required');

  const res = await getLinksFromDatabase(key);
  const links = Array.isArray(res.links) ? res.links : [];
  const first = links[0];
  const auditBackup = {
    movieId: key,
    title: first?.movieTitle || first?.title || `Title #${key}`,
    mediaType: first?.mediaType || 'unknown',
    deletedCount: links.length,
    deletedAt: new Date().toISOString(),
    linksSnapshot: links,
  };

  // 1. Durably save audit backup in MongoDB before proceeding with any deletion
  const db = await getDatabase();
  if (!db) {
    throw new Error(`Database connection unavailable: deletion of title #${key} aborted for safety to prevent unaudited data loss`);
  }
  try {
    await db.collection('audit_title_deletions').insertOne(auditBackup);
  } catch (auditErr: any) {
    throw new Error(`Audit backup write failed: deletion of title #${key} aborted for safety (${auditErr?.message || 'audit error'})`);
  }

  // 2. Perform deletion only after audit snapshot is durably confirmed
  await deleteAllLinksForTitle(key);

  await invalidateCatalogCache().catch(() => {});

  return {
    success: true,
    deletedCount: links.length,
    auditBackup: {
      movieId: auditBackup.movieId,
      title: auditBackup.title,
      mediaType: auditBackup.mediaType,
      deletedCount: auditBackup.deletedCount,
      deletedAt: auditBackup.deletedAt,
    },
  };
}

/**
 * Updates an episode title for a specific TV series and episode across MongoDB Atlas, Redis, and local storage.
 * Strictly guarantees that destination links (url), link IDs, and technical qualities are NEVER modified, moved, or deleted.
 * Supports updating by linkId (exact record ID) or by (movieId, seasonNumber, episodeNumber).
 */
export async function updateEpisodeTitleInDatabase(
  movieId: number | string,
  params: {
    seasonNumber: number;
    episodeNumber: number;
    episodeTitle: string;
    linkId?: string;
    manualTitleVerified?: boolean;
    forceOverwrite?: boolean;
  }
): Promise<{
  success: boolean;
  updatedCount: number;
  skippedManualCount?: number;
  movieId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
}> {
  const key = String(movieId).trim();
  const sNum = Math.max(0, Number(params.seasonNumber) || 0);
  const eNum = Math.max(1, Number(params.episodeNumber) || 1);
  const epTitle = String(params.episodeTitle || '').trim();
  const forceOverwrite = params.forceOverwrite !== undefined ? Boolean(params.forceOverwrite) : true;
  const manualFlag =
    params.manualTitleVerified !== undefined ? Boolean(params.manualTitleVerified) : undefined;

  let updatedCount = 0;
  let skippedManualCount = 0;

  // 0. Upstream Vercel / MongoDB proxy for Cloudflare Workers
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
  if (isCloudflare) {
    try {
      await proxyMutationToUpstream('POST', '/api/curated-links', {
        movieId: key,
        action: 'update_episode_title',
        seasonNumber: sNum,
        episodeNumber: eNum,
        episodeTitle: epTitle,
        linkId: params.linkId,
        manualTitleVerified: manualFlag,
        forceOverwrite,
      });
    } catch {}
  }

  // 1. MongoDB Atlas update
  try {
    const db = await getDatabase();
    if (db) {
      const collection = db.collection('links');

      const baseMovieFilter = {
        $or: [{ movieId: key }, { movieId: Number(key) as any }],
      };

      const candidateDocs = await collection.find(baseMovieFilter).toArray();
      const matchingIds: any[] = [];

      for (const doc of candidateDocs) {
        const docItem = {
          title: typeof doc.title === 'string' ? doc.title : undefined,
          seasonNumber: typeof doc.seasonNumber === 'number' ? doc.seasonNumber : undefined,
          episodeNumber: typeof doc.episodeNumber === 'number' ? doc.episodeNumber : undefined,
          url: typeof doc.url === 'string' ? doc.url : undefined,
        };
        const matchesTarget = params.linkId
          ? String(doc.id) === String(params.linkId).trim()
          : Number(doc.seasonNumber || detectSeasonNumber(docItem) || 1) === sNum &&
            Number(doc.episodeNumber || detectEpisodeNumber(docItem) || 0) === eNum;

        if (!matchesTarget) continue;

        if (!forceOverwrite && doc.manualTitleVerified === true) {
          skippedManualCount++;
          continue;
        }

        matchingIds.push(doc._id);
      }

      if (matchingIds.length > 0) {
        const setFields: Record<string, any> = {
          episodeTitle: epTitle,
          updatedAt: new Date(),
        };
        if (manualFlag !== undefined) {
          setFields.manualTitleVerified = manualFlag;
        }

        const result = await collection.updateMany(
          { _id: { $in: matchingIds } },
          { $set: setFields }
        );
        updatedCount = Math.max(updatedCount, result.modifiedCount || result.matchedCount || 0);
      }
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas updateEpisodeTitle warning:', err.message);
  }

  // 2. Upstash Redis update
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      let current: any[] = [];
      const fetched = await redisClient.hget<any>(REDIS_HASH_KEY, key);
      if (Array.isArray(fetched)) current = fetched;
      else if (typeof fetched === 'string') {
        try { current = JSON.parse(fetched); } catch {}
      }

      if (current.length > 0) {
        let redisModified = false;
        let redisCount = 0;
        const updatedLinks = current.map((link: any) => {
          const matchLink = params.linkId
            ? link.id === params.linkId
            : Number(link.seasonNumber || detectSeasonNumber(link) || 1) === sNum &&
              Number(link.episodeNumber || detectEpisodeNumber(link) || 0) === eNum;

          if (matchLink) {
            if (!forceOverwrite && link.manualTitleVerified === true) {
              return link;
            }
            redisModified = true;
            redisCount++;
            return {
              ...link,
              episodeTitle: epTitle,
              ...(manualFlag !== undefined ? { manualTitleVerified: manualFlag } : {}),
              updatedAt: new Date().toISOString(),
            };
          }
          return link;
        });

        if (redisModified) {
          await redisClient.hset(REDIS_HASH_KEY, { [key]: JSON.stringify(updatedLinks) });
          updatedCount = Math.max(updatedCount, redisCount);
        }
      }
    } catch (err: any) {
      console.warn('Upstash Redis updateEpisodeTitle warning:', err.message);
    }
  }

  // 3. Local JSON fallback update (if writable)
  try {
    const localData = getLocalFallbackLinks();
    if (localData && localData[key]) {
      let localModified = false;
      let localCount = 0;
      const updatedLocal = localData[key].map((link: any) => {
        const matchLink = params.linkId
          ? link.id === params.linkId
          : Number(link.seasonNumber || detectSeasonNumber(link) || 1) === sNum &&
            Number(link.episodeNumber || detectEpisodeNumber(link) || 0) === eNum;

        if (matchLink) {
          if (!forceOverwrite && link.manualTitleVerified === true) {
            return link;
          }
          localModified = true;
          localCount++;
          return {
            ...link,
            episodeTitle: epTitle,
            ...(manualFlag !== undefined ? { manualTitleVerified: manualFlag } : {}),
            updatedAt: new Date().toISOString(),
          };
        }
        return link;
      });

      if (localModified) {
        localData[key] = updatedLocal;
        saveLocalFallbackLinks(localData);
        updatedCount = Math.max(updatedCount, localCount);
      }
    }
  } catch (err: any) {
    console.warn('Local fallback updateEpisodeTitle warning:', err.message);
  }

  await invalidateCatalogCache().catch(() => {});

  return {
    success: true,
    updatedCount,
    skippedManualCount,
    movieId: key,
    seasonNumber: sNum,
    episodeNumber: eNum,
    episodeTitle: epTitle,
  };
}

// Helper to detect synthetic/dummy placeholders
export const isDummyTitle = (t?: string) =>
  !t || t.startsWith('Series Feature #') || t.startsWith('Cinema Feature #');

export const extractUploadMeta = (docItem: any, mType: 'movie' | 'tv', details?: any) => {
  const docTitle = String(docItem?.title || '');
  const docQuality = String(docItem?.quality || '');
  const docAudio = String(docItem?.audioLanguage || '');
  const movieTitle = String(details?.title || details?.name || docItem?.movieTitle || '');
  const origLang = String(
    details?.original_language || docItem?.originalLanguage || docItem?.original_language || ''
  ).toLowerCase().trim();
  const origCountry: string[] = Array.isArray(details?.origin_country)
    ? details.origin_country
    : Array.isArray(docItem?.originCountry)
    ? docItem.originCountry
    : [];

  const cleanDocTitle = stripWatermarks(docTitle);
  const cleanDocQuality = stripWatermarks(docQuality);

  const has1080p = /(?:^|[\s._\-[\]()])(?:1080p|1080i|fhd)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle) ||
                   /(?:^|[\s._\-[\]()])(?:1080p|1080i|fhd)(?:[\s._\-[\]()]|$)/i.test(cleanDocQuality);
  const has720p = /(?:^|[\s._\-[\]()])(?:720p|720i|hd)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle) ||
                  /(?:^|[\s._\-[\]()])(?:720p|720i|hd)(?:[\s._\-[\]()]|$)/i.test(cleanDocQuality);
  const has480p = /(?:^|[\s._\-[\]()])(?:480p|480i|sd)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle) ||
                  /(?:^|[\s._\-[\]()])(?:480p|480i|sd)(?:[\s._\-[\]()]|$)/i.test(cleanDocQuality);

  // Only genuine 4K if NOT explicitly 1080p / 720p / 480p
  const is4k = !has1080p && !has720p && !has480p && (
    /(?:^|[\s._\-[\]()])(?:2160p|2160i|uhd|\b4k\b)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle) ||
    /(?:^|[\s._\-[\]()])(?:2160p|2160i|uhd|\b4k\b)(?:[\s._\-[\]()]|$)/i.test(cleanDocQuality)
  );
  const is1080p = has1080p || (!is4k && !has720p && !has480p);
  const isDV = /(?:^|[\s._\-[\]()])(?:dv|dovi|dolby[.\s_-]*vision)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle);
  const isHDR = /(?:^|[\s._\-[\]()])(?:hdr10\+|hdr10|hdr)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle);
  const isBluRay = /(?:^|[\s._\-[\]()])(?:bluray|blu-ray|remux|bdrip)(?:[\s._\-[\]()]|$)/i.test(cleanDocTitle);

  const platform = detectShowPlatform(docTitle, details);

  // Comprehensive category classification (Matches OlAMovies standard)
  let category = '';
  const titleCombined = `${movieTitle} ${docTitle}`.toLowerCase();
  const isHollywoodTitle = /(?:marvel|avenger|spider[- ]*man|spiderman|iron[- ]*man|thor|captain\s*america|captain\s*marvel|black\s*widow|ant[- ]*man|antman|doctor\s*strange|black\s*panther|guardians\s*of\s*the\s*galaxy|deadpool|wolverine|x[- ]*men|eternals|shang[- ]*chi|loki|hawkeye|daredevil|punisher|batman|superman|justice\s*league|wonder\s*woman|aquaman|flash|joker|harley\s*quinn|shazam|lanterns|star\s*wars|avatar|jurassic|fast\s*(?:and|&)\s*furious|mission:?\s*impossible|transformers?|harry\s*potter|fantastic\s*beasts|lord\s*of\s*the\s*rings|hobbit|game\s*of\s*thrones|house\s*of\s*the\s*dragon|stranger\s*things|godzilla|kong|john\s*wick|dune|oppenheimer|interstellar|inception|matrix|terminator|gladiator|alien|predator|blade\s*runner|mad\s*max|planet\s*of\s*the\s*apes|fallout|the\s*boys|reacher|jack\s*ryan|witcher|halo|peaky\s*blinders|walking\s*dead|american\s*primeval|squid\s*game|toy\s*story|pixar|disney)/i.test(titleCombined);
  const hasEnglishOrDual = /(?:dual|multi|english|eng|\+\s*eng|eng\s*\+|org\s*eng|atmos|truehd)/i.test(`${docTitle} ${docAudio}`);
  const isExplicitBollywood = /(?:bollywood|hindi\s*movie|desiremovies|bollyflix|vegamovies|katmoviehd)/i.test(`${titleCombined} ${docAudio}`);
  const isIndianLang = origLang === 'hi' || (origCountry.includes('IN') && (origLang === 'hi' || !origLang));

  if (mType === 'tv') {
    category = 'TV SERIES';
  } else if (isIndianLang && !isHollywoodTitle) {
    category = 'BOLLYWOOD';
  } else if (['te', 'ta', 'ml', 'kn'].includes(origLang) && !isHollywoodTitle) {
    category = 'SOUTH INDIAN';
  } else if (origLang === 'ja') {
    category = 'ANIME';
  } else if (origLang === 'ko') {
    category = 'KOREAN';
  } else if (origLang === 'en' || origCountry.some((c: string) => ['US', 'GB', 'CA', 'AU', 'NZ'].includes(c))) {
    category = 'HOLLYWOOD';
  } else if (isHollywoodTitle || hasEnglishOrDual) {
    category = 'HOLLYWOOD';
  } else if (isExplicitBollywood) {
    category = 'BOLLYWOOD';
  } else {
    category = 'HOLLYWOOD';
  }

  const sizeMatch = docItem?.size || docTitle.match(/\b(\d+(?:\.\d+)?\s*(?:gb|mb|tb))\b/i)?.[1]?.toUpperCase();

  return {
    is4k,
    is1080p,
    isDV,
    isHDR,
    isBluRay,
    platform: platform || (mType === 'tv' ? 'TV' : 'MOVIE'),
    category,
    size: sizeMatch || '',
    createdAt: docItem?.createdAt || docItem?.updatedAt || '',
    rawTitle: docTitle,
  };
};

export interface PaginatedUploadedOptions {
  page?: number;
  limit?: number;
  cursor?: string;
  type?: 'all' | 'movie' | 'tv';
  quality?: string;
  category?: string;
  audio?: string;
  ott?: string;
  query?: string;
  genre?: string | number;
  sort?: 'latest' | 'top_rated' | 'rating' | 'popular';
  skipCount?: boolean;
}

export interface PaginatedUploadedResult {
  items: TitleDetails[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  nextCursor?: string | null;
  prevCursor?: string | null;
  hasMore?: boolean;
  source?: 'cache' | 'database';
}

/**
 * Fetches paginated titles that CONTAIN CUSTOM LINKS exclusively.
 * Implements TRUE DATABASE-LEVEL PAGINATION, PROJECTION, and REDIS PAGE CACHING.
 * Retrieves only the requested page (e.g. 24 titles) rather than thousands of documents.
 */
export async function getPaginatedUploadedTitles(
  options: PaginatedUploadedOptions = {}
): Promise<PaginatedUploadedResult> {
  const {
    cursor,
    page: rawPage = 1,
    limit: rawLimit = 24,
    type = 'all',
    quality,
    category,
    audio,
    ott,
    query,
  } = options;

  let page = rawPage;
  if (cursor) {
    const decoded = decodeCatalogCursor(cursor);
    if (decoded && typeof decoded.page === 'number') {
      page = decoded.page;
    } else {
      page = 1;
    }
  }

  const safeLimit = Math.max(1, Math.min(100, rawLimit));
  const safePage = Math.max(1, page);

  // 1. Try Redis Page Cache First (300s TTL)
  const redisClient = getRedisClient();
  const env = (getEnv('APP_ENV') || getEnv('CINEFUEL_ENV') || 'staging').toLowerCase();
  const version = await getCatalogCacheVersion();
  const filterKey = `${quality || '_'}:${audio || '_'}:${category || '_'}:${ott || '_'}:${options.genre || '_'}:${(options.sort as any) || '_'}:${query || '_'}`.toLowerCase();
  const countTag = options.skipCount ? 'fast' : 'full';
  const cacheKey = `cinefuel:${env}:catalog:v${version}:${type}:p${safePage}:l${safeLimit}:${countTag}:${filterKey}`;
  const fullCacheKey = `cinefuel:${env}:catalog:v${version}:${type}:p${safePage}:l${safeLimit}:full:${filterKey}`;

  if (redisClient) {
    try {
      let cached: any = null;
      if (options.skipCount) {
        cached = (await redisClient.get<PaginatedUploadedResult>(fullCacheKey)) || (await redisClient.get<PaginatedUploadedResult>(cacheKey));
      } else {
        cached = await redisClient.get<PaginatedUploadedResult>(cacheKey);
      }
      let data: PaginatedUploadedResult | null = null;
      if (typeof cached === 'string') {
        try { data = JSON.parse(cached); } catch {}
      } else if (cached && typeof cached === 'object' && Array.isArray((cached as any).items)) {
        data = cached as PaginatedUploadedResult;
      }
      if (data && Array.isArray(data.items)) {
        return { ...data, source: 'cache' as any };
      }
    } catch (cacheErr: any) {
      console.warn('Redis catalog page cache read error (continuing with DB fallback):', cacheErr.message);
    }
  }

  // 2. Prevent Cache Stampedes via In-Flight Single-Flight Promise
  if (inFlightCatalogRequests.has(cacheKey)) {
    return await inFlightCatalogRequests.get(cacheKey)!;
  }

  const queryPromise = (async (): Promise<PaginatedUploadedResult> => {
    // 2.5 Cloudflare Worker Edge Proxy Fallback:
    // When executing inside Cloudflare Workers, fetch from primary Node.js production deployment with 3.5s timeout
    const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || getEnv('WORKER_NAME');
    if (isCloudflare) {
      try {
        const queryParams = new URLSearchParams();
        if (type && type !== 'all') queryParams.set('type', type);
        if (safePage > 1) queryParams.set('page', String(safePage));
        queryParams.set('limit', String(safeLimit));
        if (quality) queryParams.set('quality', quality);
        if (category) queryParams.set('category', category);
        if (audio) queryParams.set('audio', audio);
        if (ott) queryParams.set('ott', ott);
        if (options.genre) queryParams.set('genre', String(options.genre));
        if (options.sort) queryParams.set('sort', String(options.sort));
        if (query) queryParams.set('q', query);

        const upstreamUrl = `https://cinephile-app.vercel.app/api/catalog?${queryParams.toString()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        let res: Response | null = null;
        try {
          res = await fetch(upstreamUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Cloudflare-Worker-CineFuel' },
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (res && res.ok) {
          const remoteJson: any = await res.json();
          if (remoteJson && Array.isArray(remoteJson.items)) {
            const { success, source, ...cleanResult } = remoteJson;
            if (redisClient && cleanResult.items.length > 0) {
              await redisClient.set(cacheKey, JSON.stringify(cleanResult), { ex: CATALOG_CACHE_TTL_SECONDS }).catch(() => {});
            }
            return { ...cleanResult, source: 'cache' as any };
          }
        }
      } catch (upstreamErr: any) {
        console.warn('Cloudflare upstream catalog sync error:', upstreamErr.message);
      }
    }

    // 3. Database-Level Query on MongoDB Atlas
    try {
      const db = await getDatabase();
      if (db) {
        const collection = db.collection('links');

        // Build Match Stage
        const andConditions: any[] = [];
        if (type === 'movie') {
          andConditions.push({
            $or: [
              { mediaType: 'movie' },
              {
                mediaType: { $ne: 'tv' },
                seasonNumber: { $in: [null, 0] },
                linkType: { $nin: ['zip_pack', 'single_episode'] },
                category: { $nin: ['ZipPack', 'SingleEpisode'] },
              },
            ],
          });
        } else if (type === 'tv') {
          andConditions.push({
            mediaType: { $ne: 'movie' },
            $or: [
              { mediaType: 'tv' },
              { linkType: { $in: ['zip_pack', 'single_episode'] } },
              { category: { $in: ['ZipPack', 'SingleEpisode'] } },
              { seasonNumber: { $gt: 0 } },
            ],
          });
        }

        // Quality filter
        if (quality) {
          const qLower = quality.toLowerCase();
          if (qLower === '4k' || qLower === '2160p') {
            andConditions.push({ $or: [{ quality: /4k|2160p|uhd/i }, { title: /4k|2160p|uhd/i }] });
          } else if (qLower === 'remux') {
            andConditions.push({ $or: [{ quality: /remux/i }, { title: /remux/i }] });
          } else if (qLower === 'hdr' || qLower === '4k_hdr') {
            andConditions.push({ $or: [{ quality: /hdr|dovi|dolby\s*vision/i }, { title: /hdr|dovi|dolby\s*vision/i }] });
          } else if (qLower === '1080p') {
            andConditions.push({ $or: [{ quality: /1080p|fhd/i }, { title: /1080p|fhd/i }] });
          } else if (qLower === '720p') {
            andConditions.push({ $or: [{ quality: /720p/i }, { title: /720p/i }] });
          }
        }

        // Audio filter
        if (audio) {
          const aLower = audio.toLowerCase();
          if (aLower === 'hindi') {
            andConditions.push({ $or: [{ audioLanguage: /hindi/i }, { title: /hindi/i }] });
          } else if (aLower === 'dual') {
            andConditions.push({ $or: [{ audioLanguage: /dual|\+|hindi.*eng/i }, { title: /dual|\+|hindi.*eng/i }] });
          } else if (aLower === 'english') {
            andConditions.push({ $or: [{ audioLanguage: /english|eng/i }, { title: /english|eng/i }] });
          }
        }

        // Category filter
        if (category) {
          const cLower = category.toLowerCase();
          if (cLower === 'zippack' || cLower === 'zip') {
            andConditions.push({
              $or: [
                { linkType: 'zip_pack' },
                { category: 'ZipPack' },
                { title: /season.*complete|zip.*pack|\bpacks?\b/i },
                { url: /(?:drive\/)?packs?/i },
              ],
            });
          }
        }

        // OTT Provider Filter
        if (ott) {
          const oLower = ott.toLowerCase();
          let ottRegex: RegExp;
          if (oLower === 'netflix') ottRegex = /\b(nf|netflix)\b/i;
          else if (oLower === 'prime' || oLower === 'amazon') ottRegex = /\b(amzn|amazon|prime)\b/i;
          else if (oLower === 'hotstar') ottRegex = /\b(hs|hotstar|disney)\b/i;
          else if (oLower === 'jiocinema') ottRegex = /\b(jio|jiocinema)\b/i;
          else if (oLower === 'sonyliv') ottRegex = /\b(sony|sonyliv|liv)\b/i;
          else if (oLower === 'zee5') ottRegex = /\b(zee|zee5)\b/i;
          else if (oLower === 'appletv') ottRegex = /\b(atvp|apple)\b/i;
          else ottRegex = /\b(nf|netflix|amzn|amazon|prime|hs|hotstar|disney|jio|jiocinema|sony|sonyliv|liv|zee|zee5|atvp|apple)\b/i;

          andConditions.push({
            $or: [
              { audioLanguage: ottRegex },
              { title: ottRegex },
              { quality: ottRegex },
              { url: ottRegex },
              { movieTitle: ottRegex },
            ],
          });
        }

        // Genre / Anime filter
        if (options.genre) {
          const gLower = String(options.genre).toLowerCase();
          if (gLower === '16' || gLower === 'anime' || gLower === 'animation') {
            andConditions.push({
              $or: [
                { category: /anime/i },
                { originalLanguage: 'ja' },
                { original_language: 'ja' },
                { title: /anime|animation|crunchyroll|naruto|one\s*piece|bleach|attack\s*on\s*titan|jujutsu|demon\s*slayer|dragon\s*ball|chainsaw|solo\s*leveling|ghibli/i },
                { movieTitle: /anime|animation|naruto|one\s*piece|bleach|attack\s*on\s*titan|jujutsu|demon\s*slayer|dragon\s*ball|chainsaw|solo\s*leveling|ghibli/i },
              ],
            });
          }
        }

        // Query filter
        if (query && query.trim()) {
          const words = query.trim().split(/\s+/).map((w) => new RegExp(w, 'i'));
          andConditions.push({
            $and: words.map((w) => ({
              $or: [{ title: w }, { movieTitle: w }],
            })),
          });
        }

        const matchStage: any = andConditions.length > 0 ? { $and: andConditions } : {};

        // Distinct titles count (cached in Redis with 300s TTL)
        const countCacheKey = `cinefuel:${env}:catalog:v${version}:count:${type}:${filterKey}`;
        let total = 0;
        if (options.skipCount) {
          total = safeLimit;
        } else {
          if (redisClient) {
            try {
              const cachedCount = await redisClient.get<number>(countCacheKey);
              if (typeof cachedCount === 'number') total = cachedCount;
            } catch {}
          }
          if (!total) {
            const distinctMovieIds = await collection.distinct('movieId', matchStage).catch(() => []);
            total = distinctMovieIds.length;
            if (redisClient && total > 0) {
              await redisClient.set(countCacheKey, total, { ex: CATALOG_CACHE_TTL_SECONDS }).catch(() => {});
            }
          }
        }

        const totalPages = Math.max(1, Math.ceil(total / safeLimit));

        if (safePage > totalPages && total > 0) {
          const emptyResult: PaginatedUploadedResult = {
            items: [],
            total,
            page: safePage,
            totalPages,
            limit: safeLimit,
            nextCursor: null,
            prevCursor: encodeCatalogCursor({ page: safePage - 1 }),
            hasMore: false,
          };
          return emptyResult;
        }

        // Pipeline with Projection & Limit before transfer
        const pipeline: any[] = [];
        if (Object.keys(matchStage).length > 0) {
          pipeline.push({ $match: matchStage });
        }

        const sortStage: any = options.sort === 'top_rated'
          ? { groupVoteAverage: -1, sortDate: -1, _id: 1 }
          : { sortDate: -1, _id: 1 };

        pipeline.push(
          { $sort: { createdAt: -1, updatedAt: -1, movieId: 1 } },
          {
            $project: {
              movieId: 1,
              mediaType: 1,
              title: 1,
              movieTitle: 1,
              posterPath: 1,
              backdropPath: 1,
              poster_path: 1,
              backdrop_path: 1,
              quality: 1,
              audioLanguage: 1,
              category: 1,
              linkType: 1,
              createdAt: 1,
              updatedAt: 1,
              seasonNumber: 1,
              episodeNumber: 1,
              releaseDate: 1,
              voteAverage: 1,
            },
          },
          {
            $group: {
              _id: '$movieId',
              latestDoc: { $first: '$$ROOT' },
              linksCount: { $sum: 1 },
              sortDate: { $first: '$createdAt' },
              groupMovieTitle: { $max: '$movieTitle' },
              groupPosterPath: { $max: '$posterPath' },
              groupBackdropPath: { $max: '$backdropPath' },
              groupPosterPathSnake: { $max: '$poster_path' },
              groupBackdropPathSnake: { $max: '$backdrop_path' },
              groupVoteAverage: { $max: { $ifNull: ['$voteAverage', 7.5] } },
              allMediaTypes: { $addToSet: '$mediaType' },
            },
          },
          { $sort: sortStage },
          { $skip: (safePage - 1) * safeLimit },
          { $limit: safeLimit }
        );

        const aggResults = await collection.aggregate(pipeline).toArray();

        // Cleanse string literals "undefined", "null", or placeholder strings
        const cleanString = (val?: any): string | null => {
          if (typeof val !== 'string') return null;
          const trimmed = val.trim();
          if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed.includes('placeholder')) return null;
          return trimmed;
        };

        // Enrich the current page entries (at most safeLimit records) into lightweight card objects
        const rawItems = aggResults.map((item: any) => {
          const mId = String(item._id || item.latestDoc?.movieId || '');
          const baseDoc = item.latestDoc || {};
          const doc = {
            ...baseDoc,
            movieTitle: cleanString(baseDoc.movieTitle) || cleanString(item.groupMovieTitle) || '',
            posterPath:
              cleanString(baseDoc.posterPath) ||
              cleanString(item.groupPosterPath) ||
              cleanString(baseDoc.poster_path) ||
              cleanString(item.groupPosterPathSnake) ||
              null,
            backdropPath:
              cleanString(baseDoc.backdropPath) ||
              cleanString(item.groupBackdropPath) ||
              cleanString(baseDoc.backdrop_path) ||
              cleanString(item.groupBackdropPathSnake) ||
              null,
          };

          // Canonical Media Resolution (Authority over raw ID anomalies)
          const canonical = resolveCanonicalMedia(mId);

          // Strict Movie vs TV Classification:
          // 1. Authoritative canonical mediaType takes highest priority if present
          // 2. If explicit mediaType in document/group is 'movie', it is a MOVIE
          // 3. If explicit mediaType is 'tv', it is TV
          // 4. Filename codec tokens like x264, x265, 5.1, 7.1 must NEVER trigger TV/season detection!
          let mediaType: 'movie' | 'tv' = 'movie';

          // Detect conflict between stored media types in group
          const cleanMediaTypes = (item.allMediaTypes || []).filter((t: any) => t === 'movie' || t === 'tv');
          if (cleanMediaTypes.includes('movie') && cleanMediaTypes.includes('tv')) {
            console.warn(`[Classification Conflict] Title ${mId} contains conflicting media types:`, cleanMediaTypes);
          }

          if (canonical?.mediaType) {
            mediaType = canonical.mediaType;
          } else {
            const rawExplicit = baseDoc.mediaType === 'movie' || baseDoc.mediaType === 'tv'
              ? baseDoc.mediaType
              : (cleanMediaTypes.includes('movie') ? 'movie' : (cleanMediaTypes.includes('tv') ? 'tv' : undefined));

            if (rawExplicit === 'movie') {
              mediaType = 'movie';
            } else if (rawExplicit === 'tv') {
              mediaType = 'tv';
            } else {
              // Safe explicit fallback: Only genuine season/episode patterns; NEVER audio/video codec tokens!
              const cleanTitle = (doc.title || '').replace(/\b(?:x26[45]|h26[45]|hevc|avc|[1257]\.[01]|1080p|2160p|720p|4k)\b/gi, ' ');
              const hasStrictSeasonPattern = /\b[Ss](?:eason\s*)?0*[1-9]\d{0,1}[Ee]0*[1-9]\d{0,2}\b/i.test(cleanTitle);
              const isTv =
                (typeof doc.seasonNumber === 'number' && doc.seasonNumber > 0 && doc.seasonNumber < 200 && (doc.linkType === 'single_episode' || doc.linkType === 'zip_pack' || doc.category === 'SingleEpisode' || doc.category === 'ZipPack')) ||
                hasStrictSeasonPattern;
              mediaType = isTv ? 'tv' : 'movie';
            }
          }

          const card = getLightweightTitleCard(mediaType, mId, doc, item.linksCount || 1);
          return {
            ...card,
            uploadMeta: extractUploadMeta(doc, mediaType, card),
          };
        }).filter(Boolean) as TitleDetails[];

        // Deduplicate cards by canonical media ID + explicit media type
        const items: TitleDetails[] = [];
        const seenCardMap = new Map<string, number>();

        for (const card of rawItems) {
          const cardKey = `${card.media_type}:${card.id}`;
          if (seenCardMap.has(cardKey)) {
            const existingIdx = seenCardMap.get(cardKey)!;
            const existing = items[existingIdx];
            // Merge link counts
            existing.linksCount = (existing.linksCount || 1) + (card.linksCount || 1);
            // Upgrade artwork if existing has placeholder but incoming has genuine poster
            const existingHasPlaceholder = !existing.poster_path || existing.poster_path.includes('placeholder');
            const incomingHasRealPoster = card.poster_path && !card.poster_path.includes('placeholder');
            if (existingHasPlaceholder && incomingHasRealPoster) {
              existing.poster_path = card.poster_path;
              existing.backdrop_path = card.backdrop_path || card.poster_path;
              existing.vote_average = card.vote_average || existing.vote_average;
            }
          } else {
            seenCardMap.set(cardKey, items.length);
            items.push(card);
          }
        }
        const hasMore = safePage < totalPages;
        const lastItem = aggResults[aggResults.length - 1];
        const nextCursor =
          hasMore && lastItem
            ? encodeCatalogCursor({
                page: safePage + 1,
                sortDate: lastItem.sortDate,
                movieId: String(lastItem._id),
              })
            : null;

        const prevCursor = safePage > 1 ? encodeCatalogCursor({ page: safePage - 1 }) : null;

        const resultPayload: PaginatedUploadedResult = {
          items,
          total,
          page: safePage,
          totalPages,
          limit: safeLimit,
          nextCursor,
          prevCursor,
          hasMore,
        };

        // Cache in Redis with 300s TTL
        if (redisClient && items.length > 0) {
          await redisClient.set(cacheKey, JSON.stringify(resultPayload), { ex: CATALOG_CACHE_TTL_SECONDS }).catch(() => {});
        }

        return { ...resultPayload, source: 'database' as any };
      }
    } catch (mongoErr: any) {
      console.warn('MongoDB Atlas getPaginatedUploadedTitles error (using local fallback):', mongoErr.message);
    }

    // 4. Local Fallback if MongoDB is offline
    const localData = getLocalFallbackLinks();
    const localList: Array<{ movieId: string; createdAt: string; link: any }> = [];
    const seen = new Set<string>();

    for (const [mId, links] of Object.entries(localData)) {
      if (!mId || mId === 'undefined' || mId === 'null' || seen.has(mId)) continue;
      if (Array.isArray(links) && links.length > 0) {
        const latest = links.reduce((a, b) =>
          new Date(a.createdAt || 0) > new Date(b.createdAt || 0) ? a : b
        );
        seen.add(mId);
        localList.push({ movieId: mId, createdAt: latest.createdAt || '', link: latest });
      }
    }

    localList.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const filtered = localList.filter((item) => {
      let mediaType: 'movie' | 'tv' = 'movie';
      if (item.link?.mediaType === 'movie') {
        mediaType = 'movie';
      } else if (item.link?.mediaType === 'tv') {
        mediaType = 'tv';
      } else {
        const isTv =
          (typeof item.link?.seasonNumber === 'number' && item.link?.seasonNumber > 0 && item.link?.seasonNumber < 200) ||
          item.link?.linkType === 'zip_pack' ||
          item.link?.linkType === 'single_episode' ||
          item.link?.category === 'ZipPack' ||
          item.link?.category === 'SingleEpisode' ||
          /\bs\d{1,2}e\d{1,2}\b|\bseason\s*\d+\b/i.test(item.link?.title || '');
        mediaType = isTv ? 'tv' : 'movie';
      }

      if (type === 'movie' && mediaType !== 'movie') return false;
      if (type === 'tv' && mediaType !== 'tv') return false;
      return true;
    });

    const localTotal = filtered.length;
    const localTotalPages = Math.max(1, Math.ceil(localTotal / safeLimit));
    const pagedEntries = filtered.slice((safePage - 1) * safeLimit, safePage * safeLimit);

    const localItems: TitleDetails[] = pagedEntries.map(({ movieId, link }) => {
      const cleanName = link?.movieTitle || cleanTitleString(link?.title) || (type === 'tv' ? `Series #${movieId}` : `Movie #${movieId}`);
      return {
        id: Number(movieId) || (movieId as any),
        title: cleanName,
        name: cleanName,
        overview: link?.overview || 'Available on CineFuel.',
        poster_path: link?.posterPath || link?.backdropPath || '/placeholder-poster.svg',
        backdrop_path: link?.backdropPath || link?.posterPath || '/placeholder-backdrop.svg',
        release_date: link?.releaseDate || '',
        first_air_date: link?.releaseDate || '',
        vote_average: link?.voteAverage || 7.5,
        vote_count: 500,
        media_type: type === 'tv' ? 'tv' : 'movie',
        genres: [{ id: 28, name: 'Featured' }],
        uploadMeta: extractUploadMeta(link, type === 'tv' ? 'tv' : 'movie', link),
      };
    });

    const hasMore = safePage < localTotalPages;
    return {
      items: localItems,
      total: localTotal,
      page: safePage,
      totalPages: localTotalPages,
      limit: safeLimit,
      nextCursor: hasMore ? encodeCatalogCursor({ page: safePage + 1 }) : null,
      prevCursor: safePage > 1 ? encodeCatalogCursor({ page: safePage - 1 }) : null,
      hasMore,
    };
  })();

  inFlightCatalogRequests.set(cacheKey, queryPromise);
  try {
    return await queryPromise;
  } finally {
    inFlightCatalogRequests.delete(cacheKey);
  }
}

/**
 * Fetches the most recently uploaded titles from MongoDB Atlas (or local fallback)
 * and retrieves their TMDB metadata for display in the "Recently Added" carousel.
 */
export async function getRecentlyAddedTitles(
  limit = 24,
  mediaTypeFilter: 'all' | 'movie' | 'tv' = 'all'
): Promise<TitleDetails[]> {
  const paginated = await getPaginatedUploadedTitles({
    limit,
    type: mediaTypeFilter,
    page: 1,
    skipCount: true,
  });
  return paginated.items;
}

export interface FilterUploadedOptions {
  type?: 'movie' | 'tv' | 'all';
  quality?: string;
  category?: string;
  audio?: string;
  ott?: string;
  query?: string;
  genre?: string | number;
  sort?: 'latest' | 'top_rated' | 'rating' | 'popular';
  limit?: number;
}

export interface EnrichedUploadedTitle extends TitleDetails {
  qualities: string[];
  linksCount: number;
  hasZipPack: boolean;
}

/**
 * Retrieves uploaded titles from MongoDB Atlas & local links with filtering by
 * Quality (4K, HDR, REMUX, 1080p), Media Type (Movie/TV), Audio, Category (ZipPack), or OTT platform.
 */
export async function getFilteredUploadedTitles(
  options: FilterUploadedOptions = {}
): Promise<{ items: EnrichedUploadedTitle[]; total: number }> {
  const {
    type = 'all',
    quality,
    category,
    audio,
    ott,
    query,
    limit = 60,
  } = options;

  const filterConditions: any[] = [];

  // 1. Media Type Filter
  if (type === 'movie') {
    filterConditions.push({ mediaType: 'movie' });
  } else if (type === 'tv') {
    filterConditions.push({
      mediaType: { $ne: 'movie' },
      $or: [
        { mediaType: 'tv' },
        { linkType: { $in: ['zip_pack', 'single_episode'] } },
        { category: { $in: ['ZipPack', 'SingleEpisode'] } },
        { seasonNumber: { $gt: 0 } },
      ],
    });
  }

  // 2. Quality Filter (HDR, REMUX, 1080p, 4K, 4k_hdr)
  if (quality) {
    const qLower = quality.toLowerCase();
    if (qLower === '4k_hdr' || qLower === '4khdr') {
      filterConditions.push({
        $or: [
          { quality: /4k|2160p/i },
          { quality: /hdr|dolby vision|dovi/i },
          { title: /4k|2160p/i },
          { title: /hdr|dolby vision|dovi/i },
        ],
      });
    } else if (qLower === '4k' || qLower === '2160p') {
      filterConditions.push({
        $or: [{ quality: /4k|2160p/i }, { title: /4k|2160p/i }],
      });
    } else if (qLower === 'hdr') {
      filterConditions.push({
        $or: [{ quality: /hdr|dolby vision|dovi/i }, { title: /hdr|dolby vision|dovi/i }],
      });
    } else if (qLower === 'remux') {
      filterConditions.push({
        $or: [{ quality: /remux/i }, { title: /remux/i }],
      });
    } else if (qLower === '1080p' || qLower === 'fhd') {
      filterConditions.push({
        $or: [{ quality: /1080p|fhd/i }, { title: /1080p|fhd/i }],
      });
    } else if (qLower === '720p' || qLower === 'hd') {
      filterConditions.push({
        $or: [{ quality: /720p/i }, { title: /720p/i }],
      });
    } else if (qLower === 'bluray') {
      filterConditions.push({
        $or: [{ quality: /bluray|bdrip/i }, { title: /bluray|bdrip/i }],
      });
    }
  }

  // 3. Category Filter (zippack)
  if (category) {
    const cLower = category.toLowerCase();
    if (cLower === 'zippack' || cLower === 'zip') {
      filterConditions.push({
        $or: [
          { linkType: 'zip_pack' },
          { category: 'ZipPack' },
          { title: /season.*complete/i },
          { title: /zip.*pack/i },
          { title: /\bpacks?\b/i },
          { url: /(?:drive\/)?packs?/i },
        ],
      });
    } else if (cLower === 'single_episode' || cLower === 'episode') {
      filterConditions.push({
        $or: [{ linkType: 'single_episode' }, { category: 'SingleEpisode' }],
      });
    }
  }

  // 4. Audio Language Filter
  if (audio) {
    const aLower = audio.toLowerCase();
    if (aLower === 'hindi') {
      filterConditions.push({
        $or: [{ audioLanguage: /hindi/i }, { title: /hindi/i }],
      });
    } else if (aLower === 'dual') {
      filterConditions.push({
        $or: [
          { audioLanguage: /dual|\+|hindi.*eng/i },
          { title: /dual|\+|hindi.*eng/i },
        ],
      });
    } else if (aLower === 'english') {
      filterConditions.push({
        $or: [{ audioLanguage: /english/i }, { title: /english/i }],
      });
    }
  }

  // 5. OTT Provider Filter
  if (ott) {
    const oLower = ott.toLowerCase();
    let ottRegex = new RegExp(oLower, 'i');
    if (oLower === 'netflix') ottRegex = /\b(nf|netflix)\b/i;
    else if (oLower === 'prime' || oLower === 'amazon') ottRegex = /\b(amzn|amazon|prime)\b/i;
    else if (oLower === 'hotstar') ottRegex = /\b(hs|hotstar|disney)\b/i;
    else if (oLower === 'jiocinema') ottRegex = /\b(jio|jiocinema)\b/i;
    else if (oLower === 'sonyliv') ottRegex = /\b(sony|sonyliv|liv)\b/i;
    else if (oLower === 'zee5') ottRegex = /\b(zee|zee5)\b/i;
    else ottRegex = /\b(nf|netflix|amzn|amazon|prime|hs|hotstar|disney|jio|jiocinema|sony|sonyliv|liv|zee|zee5|atvp|apple)\b/i;

    filterConditions.push({
      $or: [
        { audioLanguage: ottRegex },
        { title: ottRegex },
        { quality: ottRegex },
        { url: ottRegex },
        { movieTitle: ottRegex },
      ],
    });
  }

  // 5b. Genre / Anime Filter
  if (options.genre) {
    const gLower = String(options.genre).toLowerCase();
    if (gLower === '16' || gLower === 'anime' || gLower === 'animation') {
      filterConditions.push({
        $or: [
          { category: /anime/i },
          { originalLanguage: 'ja' },
          { original_language: 'ja' },
          { title: /anime|animation|crunchyroll|naruto|one\s*piece|bleach|attack\s*on\s*titan|jujutsu|demon\s*slayer|dragon\s*ball|chainsaw|solo\s*leveling|ghibli/i },
          { movieTitle: /anime|animation|naruto|one\s*piece|bleach|attack\s*on\s*titan|jujutsu|demon\s*slayer|dragon\s*ball|chainsaw|solo\s*leveling|ghibli/i },
        ],
      });
    }
  }

  // 6. Text Query
  if (query && query.trim().length > 0) {
    const qReg = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filterConditions.push({
      $or: [{ movieTitle: qReg }, { title: qReg }, { quality: qReg }],
    });
  }

  const mongoQuery = filterConditions.length > 0 ? { $and: filterConditions } : {};

  // Query MongoDB Atlas
  const groupedTitles = new Map<string, EnrichedUploadedTitle>();

  try {
    const db = await getDatabase();
    if (db) {
      const collection = db.collection('links');
      const docs = await collection
        .find(mongoQuery)
        .sort({ createdAt: -1, updatedAt: -1 })
        .limit(300)
        .toArray();

      for (const doc of docs) {
        const mId = String(doc.movieId || '');
        if (!mId || mId === 'undefined' || mId === 'null') continue;

        const qualString = `${doc.quality || ''} ${doc.title || ''}`.toUpperCase();
        const extractedQualities: string[] = [];
        if (qualString.includes('4K') || qualString.includes('2160P')) extractedQualities.push('4K UHD');
        if (qualString.includes('HDR') || qualString.includes('DOVI')) extractedQualities.push('HDR');
        if (qualString.includes('REMUX')) extractedQualities.push('REMUX');
        if (qualString.includes('1080P') || qualString.includes('FHD')) extractedQualities.push('1080p');
        if (qualString.includes('720P')) extractedQualities.push('720p');

        const isZip =
          doc.linkType === 'zip_pack' ||
          doc.category === 'ZipPack' ||
          /season.*complete|\bpacks?\b/i.test(doc.title || '') ||
          Boolean(doc.url && /(?:drive\/)?packs?/i.test(doc.url));

        if (!groupedTitles.has(mId)) {
          let mediaType: 'movie' | 'tv' = doc.mediaType === 'tv' ? 'tv' : 'movie';
          if (doc.mediaType !== 'movie' && (isZip || (typeof doc.seasonNumber === 'number' && doc.seasonNumber > 0))) {
            mediaType = 'tv';
          }

          groupedTitles.set(mId, {
            id: Number(mId),
            title: doc.movieTitle || `Title #${mId}`,
            name: doc.movieTitle || `Title #${mId}`,
            poster_path: doc.posterPath || null,
            backdrop_path: doc.backdropPath || doc.posterPath || null,
            release_date: doc.releaseDate || '',
            first_air_date: doc.releaseDate || '',
            vote_average: doc.voteAverage || 7.8,
            vote_count: 1200,
            overview: doc.overview || 'Available for high-speed download on CineFuel.',
            media_type: mediaType,
            qualities: extractedQualities,
            linksCount: 1,
            hasZipPack: isZip,
          } as EnrichedUploadedTitle);
        } else {
          const item = groupedTitles.get(mId)!;
          item.linksCount++;
          if (isZip) item.hasZipPack = true;
          for (const q of extractedQualities) {
            if (!item.qualities.includes(q)) item.qualities.push(q);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('MongoDB Atlas getFilteredUploadedTitles warning:', err.message);
  }

  // Filter out any dummy title
  let finalItems = Array.from(groupedTitles.values())
    .filter((t) => t.title && !t.title.startsWith('Series Feature #') && !t.title.startsWith('Cinema Feature #'));

  if (options.sort === 'top_rated') {
    finalItems.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  }

  finalItems = finalItems.slice(0, limit);

  return { items: finalItems, total: finalItems.length };
}


