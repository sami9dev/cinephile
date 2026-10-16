import fs from 'fs';
import path from 'path';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getRedisClient } from '@/lib/redisDb';
import { DefectiveLinkReport } from '@/types';

const REDIS_REPORTS_KEY = 'cinefuel:defective_reports';
const LOCAL_REPORTS_FILE = path.join(process.cwd(), 'src', 'data', 'defectiveReports.json');

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
export function getLocalFallbackReports(): DefectiveLinkReport[] {
  if (!isFileSystemWritable()) return [];
  try {
    if (fs.existsSync(LOCAL_REPORTS_FILE)) {
      const raw = fs.readFileSync(LOCAL_REPORTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading local defectiveReports.json:', e);
  }
  return [];
}

/**
 * Writes local JSON fallback file safely
 */
export function saveLocalFallbackReports(data: DefectiveLinkReport[]): boolean {
  if (!isFileSystemWritable()) return false;
  try {
    const dir = path.dirname(LOCAL_REPORTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_REPORTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing local defectiveReports.json:', e);
  }
  return false;
}

/**
 * Fetches all defective link reports from Supabase, Redis, or local JSON file
 */
export async function getAllReports(
  filterStatus?: string,
  options?: { page?: number; limit?: number; userId?: string }
): Promise<{
  reports: DefectiveLinkReport[];
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
  const userId = options?.userId;

  // 1. Try Supabase first
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      let query = supabase.from('defective_reports').select('*', { count: 'exact' });
      if (filterStatus && typeof filterStatus === 'string' && filterStatus !== 'all') {
        const cleanStatus = filterStatus.trim();
        if (!cleanStatus.startsWith('$')) {
          query = query.eq('status', cleanStatus);
        }
      }
      if (userId && typeof userId === 'string') {
        const cleanUserId = userId.trim();
        if (cleanUserId && !cleanUserId.startsWith('$')) {
          query = query.eq('user_id', cleanUserId);
        }
      }
      query = query.order('created_at', { ascending: false });
      if (hasPagination) {
        query = query.range((page - 1) * limit, page * limit - 1);
      }
      const { data, count, error } = await query;
      if (!error && Array.isArray(data)) {
        const reports: DefectiveLinkReport[] = data.map((d: any) => ({
          id: d.id,
          linkId: d.link_id,
          movieId: Number(d.movie_id) || 0,
          mediaTitle: d.media_title || d.movie_title || 'Unknown Title',
          mediaType: d.media_type || 'movie',
          posterPath: d.poster_path || null,
          linkTitle: d.link_title || d.movie_title || 'Link',
          reportedUrl: d.reported_url || d.url || '',
          issueType: d.issue_type || 'other',
          issueLabel: d.issue_label || d.issue_type || 'Defective Link',
          quality: d.quality,
          server: d.server,
          additionalNotes: d.additional_notes || d.description,
          status: d.status || 'pending',
          userId: d.user_id,
          userEmail: d.user_email || d.reporter_email,
          createdAt: d.created_at,
          resolvedAt: d.resolved_at,
          replacementUrl: d.replacement_url,
          adminNote: d.admin_note,
        }));
        const total = count || reports.length;
        return {
          reports,
          total,
          pendingCount: reports.filter((r) => r.status === 'pending').length,
          page: hasPagination ? page : 1,
          totalPages: hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1,
          limit: hasPagination ? limit : total,
          source: 'supabase',
        };
      }
    }
  } catch (supabaseErr: any) {
    console.warn('Supabase defective reports read fallback:', supabaseErr.message);
  }

  // 2. Try Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const redisList = await redisClient.get<any>(REDIS_REPORTS_KEY);
      const list: DefectiveLinkReport[] = parseRedisList<DefectiveLinkReport>(redisList);

      if (list.length > 0) {
        const pendingCount = list.filter((r) => r.status === 'pending').length;
        const filtered = filterStatus && filterStatus !== 'all'
          ? list.filter((r) => r.status === filterStatus)
          : list;

        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          reports: filtered,
          total: list.length,
          pendingCount,
          source: 'upstash_redis',
        };
      }
    } catch (redisErr: any) {
      console.warn('Upstash Redis defective reports read failed:', redisErr.message);
    }
  }

  // 3. Fallback to Local JSON
  const localList = getLocalFallbackReports();
  const pendingCount = localList.filter((r) => r.status === 'pending').length;
  const filtered = filterStatus && filterStatus !== 'all'
    ? localList.filter((r) => r.status === filterStatus)
    : localList;

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    reports: filtered,
    total: localList.length,
    pendingCount,
    source: 'local_json',
  };
}

/**
 * Saves a new defective link report to all persistence layers
 */
export async function saveNewReport(report: DefectiveLinkReport): Promise<boolean> {
  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase.from('defective_reports').upsert({
        id: report.id,
        link_id: report.linkId,
        movie_id: report.movieId,
        movie_title: report.mediaTitle,
        media_title: report.mediaTitle,
        media_type: report.mediaType || 'movie',
        poster_path: report.posterPath || null,
        link_title: report.linkTitle,
        reported_url: report.reportedUrl,
        url: report.reportedUrl,
        issue_type: report.issueType,
        issue_label: report.issueLabel,
        description: report.additionalNotes || report.issueLabel,
        additional_notes: report.additionalNotes,
        quality: report.quality,
        server: report.server,
        status: report.status || 'pending',
        user_id: report.userId || null,
        user_name: report.userName || null,
        reporter_email: report.userEmail || null,
        user_email: report.userEmail || null,
        created_at: report.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (!error) persisted = true;
    }
  } catch (err: any) {
    console.warn('Supabase defective report save warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_REPORTS_KEY);
      const currentList = parseRedisList<DefectiveLinkReport>(existing);
      const updated = [report, ...currentList.filter((r) => r.id !== report.id)];
      await redisClient.set(REDIS_REPORTS_KEY, updated);
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis defective report save error:', err.message);
    }
  }

  // 3. Local backup (only when filesystem is writable)
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackReports();
      const updated = [report, ...local.filter((r) => r.id !== report.id)];
      if (saveLocalFallbackReports(updated)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local defective report save failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not persist the report.');
  }

  return true;
}

/**
 * Updates a defective report (e.g. status, replacementUrl, adminNote)
 */
export async function updateReportStatus(
  id: string,
  status: 'pending' | 'in_progress' | 'fixed' | 'dismissed',
  meta?: {
    replacementUrl?: string;
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
    ...(status === 'fixed' || status === 'dismissed' ? { resolvedAt: new Date().toISOString() } : {}),
    ...(meta?.replacementUrl ? { replacementUrl: meta.replacementUrl } : {}),
    ...(meta?.adminNote ? { adminNote: meta.adminNote } : (replyObj ? { adminNote: replyObj.message } : {})),
  };

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'fixed' || status === 'dismissed') updateData.resolved_at = new Date().toISOString();
      if (meta?.replacementUrl) updateData.replacement_url = meta.replacementUrl;
      if (meta?.adminNote || replyObj?.message) updateData.admin_note = meta?.adminNote || replyObj?.message;
      const { error } = await supabase.from('defective_reports').update(updateData).eq('id', cleanId);
      if (!error) persisted = true;
    }
  } catch (err: any) {
    console.warn('Supabase defective report update warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_REPORTS_KEY);
      const currentList = parseRedisList<DefectiveLinkReport>(existing);
      const updated = currentList.map((r) =>
        r.id === cleanId
          ? {
              ...r,
              ...updates,
              ...(replyObj ? { adminReplies: [...(r.adminReplies || []), replyObj] } : {}),
            }
          : r
      );
      await redisClient.set(REDIS_REPORTS_KEY, updated);
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis defective report update error:', err.message);
    }
  }

  // 3. Local update (only if writable)
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackReports();
      const updated = local.map((r) =>
        r.id === cleanId
          ? {
              ...r,
              ...updates,
              ...(replyObj ? { adminReplies: [...(r.adminReplies || []), replyObj] } : {}),
            }
          : r
      );
      if (saveLocalFallbackReports(updated)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local defective report update failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not update report status.');
  }

  return true;
}

/**
 * Deletes a defective report by ID
 */
export async function deleteReport(id: string): Promise<boolean> {
  const cleanId = String(id || '').trim();
  if (!cleanId || cleanId.startsWith('$')) return false;

  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase.from('defective_reports').delete().eq('id', cleanId);
      if (!error) persisted = true;
    }
  } catch {}

  // 2. Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_REPORTS_KEY);
      const currentList = parseRedisList<DefectiveLinkReport>(existing);
      await redisClient.set(REDIS_REPORTS_KEY, currentList.filter((r) => r.id !== cleanId));
      persisted = true;
    } catch {}
  }

  // 3. Local
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackReports();
      if (saveLocalFallbackReports(local.filter((r) => r.id !== cleanId))) {
        persisted = true;
      }
    } catch {}
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not delete report.');
  }

  return true;
}

/**
 * Retrieves a single defective report by ID
 */
export async function getReportById(id: string, dbName?: string): Promise<DefectiveLinkReport | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase.from('defective_reports').select('*').eq('id', cleanId).maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          linkId: data.link_id,
          movieId: Number(data.movie_id) || 0,
          mediaTitle: data.media_title || data.movie_title || 'Unknown Title',
          mediaType: data.media_type || 'movie',
          posterPath: data.poster_path || null,
          linkTitle: data.link_title || data.movie_title || 'Link',
          reportedUrl: data.reported_url || data.url || '',
          issueType: data.issue_type || 'other',
          issueLabel: data.issue_label || data.issue_type || 'Defective Link',
          quality: data.quality,
          server: data.server,
          additionalNotes: data.additional_notes || data.description,
          status: data.status || 'pending',
          userId: data.user_id,
          userEmail: data.user_email || data.reporter_email,
          createdAt: data.created_at,
          resolvedAt: data.resolved_at,
          replacementUrl: data.replacement_url,
          adminNote: data.admin_note,
        };
      }
    }
  } catch (err: any) {
    console.warn('Supabase getReportById fallback:', err.message);
  }

  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const redisData = await redisClient.get<any>(REDIS_REPORTS_KEY);
      const list = parseRedisList<DefectiveLinkReport>(redisData);
      const found = list.find((r) => r.id === cleanId);
      if (found) return found;
    } catch {}
  }

  const local = getLocalFallbackReports();
  return local.find((r) => r.id === cleanId) || null;
}
