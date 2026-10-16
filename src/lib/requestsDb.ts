import fs from 'fs';
import path from 'path';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getRedisClient } from '@/lib/redisDb';
import { UserRequest } from '@/types';

const REDIS_REQUESTS_KEY = 'cinefuel:user_requests';
const LOCAL_REQUESTS_FILE = path.join(process.cwd(), 'src', 'data', 'userRequests.json');

export function parseRedisList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function isFileSystemWritable(): boolean {
  if (process.env.NEXT_RUNTIME === 'edge' || process.env.CLOUDFLARE_WORKER || typeof (process as any).getBuiltinModule !== 'undefined') {
    return false;
  }
  return true;
}

/**
 * Reads local JSON fallback file safely
 */
export function getLocalFallbackRequests(): UserRequest[] {
  if (!isFileSystemWritable()) return [];
  try {
    if (fs.existsSync(LOCAL_REQUESTS_FILE)) {
      const raw = fs.readFileSync(LOCAL_REQUESTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading local userRequests.json:', e);
  }
  return [];
}

/**
 * Writes local JSON fallback file safely
 */
export function saveLocalFallbackRequests(data: UserRequest[]): boolean {
  if (!isFileSystemWritable()) return false;
  try {
    const dir = path.dirname(LOCAL_REQUESTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing local userRequests.json:', e);
    return false;
  }
}

/**
 * Fetches all user requests from Supabase, Redis, or local JSON file
 */
export async function getAllRequests(
  filterStatus?: string,
  options?: { page?: number; limit?: number; userId?: string },
  dbName?: string
): Promise<{
  requests: UserRequest[];
  total: number;
  pendingCount: number;
  page?: number;
  totalPages?: number;
  limit?: number;
  source: 'supabase' | 'upstash_redis' | 'local_json';
}> {
  const hasPagination = typeof options?.page === 'number' || typeof options?.limit === 'number';
  const page = Math.max(1, options?.page || 1);
  const limit = Math.max(1, Math.min(100, options?.limit || 50));
  const userFilter = options?.userId ? options.userId.trim() : null;

  // 1. Try Supabase first
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      let query = supabase.from('user_requests').select('*', { count: 'exact' });
      if (filterStatus && typeof filterStatus === 'string' && filterStatus !== 'all') {
        const cleanStatus = filterStatus.trim();
        if (!cleanStatus.startsWith('$')) {
          query = query.eq('status', cleanStatus);
        }
      }
      if (userFilter && typeof userFilter === 'string') {
        const cleanUser = userFilter.trim();
        if (cleanUser && !cleanUser.startsWith('$')) {
          query = query.or(`user_id.eq.${cleanUser},user_email.eq.${cleanUser}`);
        }
      }
      query = query.order('created_at', { ascending: false });
      if (hasPagination) {
        query = query.range((page - 1) * limit, page * limit - 1);
      }
      const { data, count, error } = await query;
      if (!error && Array.isArray(data)) {
        const requests: UserRequest[] = data.map((d: any) => ({
          id: d.id,
          title: d.title,
          mediaType: d.media_type || 'movie',
          releaseYear: d.release_year || d.year || '',
          quality: d.quality || 'Any',
          audioLanguage: d.audio_language || 'Any',
          tmdbId: d.tmdb_id,
          posterPath: d.poster_path || null,
          seasonNumber: d.season_number,
          episodeNumber: d.episode_number,
          status: d.status || 'pending',
          notes: d.notes,
          userId: d.user_id,
          userName: d.user_name,
          userEmail: d.user_email,
          userContact: d.user_contact,
          createdAt: d.created_at,
          fulfilledAt: d.fulfilled_at,
          fulfilledLinkId: d.fulfilled_link_id,
          fulfilledLinkUrl: d.fulfilled_link_url,
          adminNote: d.admin_note,
        }));
        const total = count || requests.length;
        return {
          requests,
          total,
          pendingCount: requests.filter((r) => r.status === 'pending').length,
          page: hasPagination ? page : 1,
          totalPages: hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1,
          limit: hasPagination ? limit : total,
          source: 'supabase',
        };
      }
    }
  } catch (supabaseErr: any) {
    console.warn('Supabase requests read fallback:', supabaseErr.message);
  }

  // 2. Try Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const redisList = await redisClient.get<UserRequest[]>(REDIS_REQUESTS_KEY);
      let list: UserRequest[] = [];
      if (Array.isArray(redisList)) {
        list = redisList;
      } else if (typeof redisList === 'string') {
        try {
          list = JSON.parse(redisList);
        } catch {}
      }

      if (list.length > 0) {
        let filtered = list;
        if (userFilter) {
          filtered = filtered.filter((r) => r.userId === userFilter || r.userEmail === userFilter);
        }
        const pendingCount = filtered.filter((r) => r.status === 'pending').length;
        if (filterStatus && filterStatus !== 'all') {
          filtered = filtered.filter((r) => r.status === filterStatus);
        }

        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const total = filtered.length;
        const paginated = hasPagination ? filtered.slice((page - 1) * limit, page * limit) : filtered;

        return {
          requests: paginated,
          total,
          pendingCount,
          page: hasPagination ? page : 1,
          totalPages: hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1,
          limit: hasPagination ? limit : total,
          source: 'upstash_redis',
        };
      }
    } catch (redisErr: any) {
      console.warn('Upstash Redis requests read failed:', redisErr.message);
    }
  }

  // 3. Fallback to Local JSON
  const localList = getLocalFallbackRequests();
  let filtered = localList;
  if (userFilter) {
    filtered = filtered.filter((r) => r.userId === userFilter || r.userEmail === userFilter);
  }
  const pendingCount = filtered.filter((r) => r.status === 'pending').length;
  if (filterStatus && filterStatus !== 'all') {
    filtered = filtered.filter((r) => r.status === filterStatus);
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = filtered.length;
  const paginated = hasPagination ? filtered.slice((page - 1) * limit, page * limit) : filtered;

  return {
    requests: paginated,
    total,
    pendingCount,
    page: hasPagination ? page : 1,
    totalPages: hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1,
    limit: hasPagination ? limit : total,
    source: 'local_json',
  };
}

/**
 * Saves a new user link request to all persistence layers
 */
export async function saveNewRequest(request: UserRequest): Promise<boolean> {
  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase.from('user_requests').upsert({
        id: request.id,
        title: request.title,
        year: request.releaseYear,
        release_year: request.releaseYear,
        media_type: request.mediaType,
        tmdb_id: request.tmdbId,
        poster_path: request.posterPath || null,
        season_number: request.seasonNumber,
        episode_number: request.episodeNumber,
        quality: request.quality || 'Any',
        audio_language: request.audioLanguage || 'Any',
        status: request.status || 'pending',
        notes: request.notes,
        user_id: request.userId,
        user_name: request.userName,
        user_email: request.userEmail,
        user_contact: request.userContact,
        created_at: request.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (!error) persisted = true;
    }
  } catch (err: any) {
    console.warn('Supabase request save warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_REQUESTS_KEY);
      const currentList = parseRedisList<UserRequest>(existing);
      const updated = [request, ...currentList.filter((r) => r.id !== request.id)];
      await redisClient.set(REDIS_REQUESTS_KEY, updated);
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis request save error:', err.message);
    }
  }

  // 3. Local backup (only when filesystem is writable)
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackRequests();
      const updated = [request, ...local.filter((r) => r.id !== request.id)];
      if (saveLocalFallbackRequests(updated)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local request save failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not persist the request.');
  }

  return true;
}

/**
 * Updates a user request (e.g. status, fulfilledLinkUrl, adminNote)
 */
export async function updateRequestStatus(
  id: string,
  status: 'pending' | 'in_progress' | 'fulfilled' | 'rejected',
  meta?: {
    fulfilledLinkId?: string;
    fulfilledLinkUrl?: string;
    adminNote?: string;
    adminReply?: string;
  }
): Promise<boolean> {
  const cleanId = String(id || '').trim();
  if (!cleanId || cleanId.startsWith('$')) return false;

  let persisted = false;
  const replyObj = meta?.adminReply?.trim()
    ? { sender: 'admin', message: meta.adminReply.trim(), createdAt: new Date().toISOString() }
    : null;

  const updates: any = {
    status,
    ...(status === 'fulfilled' ? { fulfilledAt: new Date().toISOString() } : {}),
    ...(meta?.fulfilledLinkId ? { fulfilledLinkId: meta.fulfilledLinkId } : {}),
    ...(meta?.fulfilledLinkUrl ? { fulfilledLinkUrl: meta.fulfilledLinkUrl } : {}),
    ...(meta?.adminNote ? { adminNote: meta.adminNote } : (replyObj ? { adminNote: replyObj.message } : {})),
  };

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'fulfilled') updateData.fulfilled_at = new Date().toISOString();
      if (meta?.fulfilledLinkId) updateData.fulfilled_link_id = meta.fulfilledLinkId;
      if (meta?.fulfilledLinkUrl) updateData.fulfilled_link_url = meta.fulfilledLinkUrl;
      if (meta?.adminNote || replyObj?.message) updateData.admin_note = meta?.adminNote || replyObj?.message;
      const { error } = await supabase.from('user_requests').update(updateData).eq('id', cleanId);
      if (!error) persisted = true;
    }
  } catch (err: any) {
    console.warn('Supabase request update warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_REQUESTS_KEY);
      const currentList = parseRedisList<UserRequest>(existing);
      const updated = currentList.map((r) => {
        if (r.id === cleanId) {
          return {
            ...r,
            ...updates,
            ...(replyObj ? { adminReplies: [...(r.adminReplies || []), replyObj] } : {}),
          };
        }
        return r;
      });
      await redisClient.set(REDIS_REQUESTS_KEY, updated);
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis request update error:', err.message);
    }
  }

  // 3. Local update (only if writable)
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackRequests();
      const updated = local.map((r) => {
        if (r.id === cleanId) {
          return {
            ...r,
            ...updates,
            ...(replyObj ? { adminReplies: [...(r.adminReplies || []), replyObj] } : {}),
          };
        }
        return r;
      });
      if (saveLocalFallbackRequests(updated)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local request update failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not update request status.');
  }

  return true;
}

/**
 * Deletes a request by ID
 */
export async function deleteRequest(id: string): Promise<boolean> {
  const cleanId = String(id || '').trim();
  if (!cleanId || cleanId.startsWith('$')) return false;

  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase.from('user_requests').delete().eq('id', cleanId);
      if (!error) persisted = true;
    }
  } catch {}

  // 2. Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_REQUESTS_KEY);
      const currentList = parseRedisList<UserRequest>(existing);
      await redisClient.set(REDIS_REQUESTS_KEY, currentList.filter((r) => r.id !== id));
      persisted = true;
    } catch {}
  }

  // 3. Local
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackRequests();
      if (saveLocalFallbackRequests(local.filter((r) => r.id !== id))) {
        persisted = true;
      }
    } catch {}
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not delete request.');
  }

  return true;
}

/**
 * Retrieves a single request by its ID
 */
export async function getRequestById(id: string, dbName?: string): Promise<UserRequest | null> {
  const reqId = (id || '').trim();
  if (!reqId) return null;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase.from('user_requests').select('*').eq('id', reqId).maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          title: data.title,
          mediaType: data.media_type || 'movie',
          releaseYear: data.release_year || data.year || '',
          quality: data.quality || 'Any',
          audioLanguage: data.audio_language || 'Any',
          tmdbId: data.tmdb_id,
          posterPath: data.poster_path || null,
          seasonNumber: data.season_number,
          episodeNumber: data.episode_number,
          status: data.status || 'pending',
          notes: data.notes,
          userId: data.user_id,
          userName: data.user_name,
          userEmail: data.user_email,
          userContact: data.user_contact,
          createdAt: data.created_at,
          fulfilledAt: data.fulfilled_at,
          fulfilledLinkId: data.fulfilled_link_id,
          fulfilledLinkUrl: data.fulfilled_link_url,
          adminNote: data.admin_note,
        };
      }
    }
  } catch (err: any) {
    console.warn('Supabase getRequestById fallback:', err.message);
  }

  // 2. Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const redisList = await redisClient.get<any>(REDIS_REQUESTS_KEY);
      const list = parseRedisList<UserRequest>(redisList);
      const found = list.find((r) => r.id === reqId);
      if (found) return found;
    } catch {}
  }

  // 3. Local JSON fallback
  const local = getLocalFallbackRequests();
  return local.find((r) => r.id === reqId) || null;
}

