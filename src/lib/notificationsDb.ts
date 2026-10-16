import fs from 'fs';
import path from 'path';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getRedisClient } from '@/lib/redisDb';
import { getUserByFirebaseUid } from '@/lib/usersDb';
import { UserRequest, DefectiveLinkReport, UserNotification } from '@/types';

export { type UserNotification };

const REDIS_NOTIFICATIONS_KEY = 'cinefuel:user_notifications';
const LOCAL_NOTIFICATIONS_FILE = path.join(process.cwd(), 'src', 'data', 'userNotifications.json');

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
  if (
    process.env.NEXT_RUNTIME === 'edge' ||
    process.env.CLOUDFLARE_WORKER ||
    typeof (process as any).getBuiltinModule !== 'undefined'
  ) {
    return false;
  }
  return true;
}

/**
 * Reads local JSON fallback notifications file safely
 */
export function getLocalFallbackNotifications(): UserNotification[] {
  if (!isFileSystemWritable()) return [];
  try {
    if (fs.existsSync(LOCAL_NOTIFICATIONS_FILE)) {
      const raw = fs.readFileSync(LOCAL_NOTIFICATIONS_FILE, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading local userNotifications.json:', e);
  }
  return [];
}

/**
 * Writes local JSON fallback notifications file safely
 */
export function saveLocalFallbackNotifications(data: UserNotification[]): boolean {
  if (!isFileSystemWritable()) return false;
  try {
    const dir = path.dirname(LOCAL_NOTIFICATIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_NOTIFICATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing local userNotifications.json:', e);
    return false;
  }
}

/**
 * Ensures indexes exist on the notifications store (managed by Supabase migrations)
 */
export async function ensureNotificationIndexes(_dbName?: string): Promise<void> {
  // Handled natively by Supabase schema indexes
}

function mapNotificationToSupabaseRow(notif: UserNotification): Record<string, any> {
  return {
    id: notif.id,
    user_id: notif.userId || notif.firebaseUid,
    firebase_uid: notif.firebaseUid || notif.userId,
    request_id: notif.requestId || null,
    report_id: notif.reportId || null,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    media_title: notif.mediaTitle,
    movie_id: notif.movieId !== undefined && notif.movieId !== null ? String(notif.movieId) : null,
    media_type: notif.mediaType || 'movie',
    link_url: notif.linkUrl || '/',
    poster_path: notif.posterPath || null,
    read: Boolean(notif.read),
    read_at: notif.readAt || null,
    admin_reply: notif.adminReply || null,
    replacement_url: notif.replacementUrl || null,
    created_at: notif.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapSupabaseRowToNotification(row: any): UserNotification {
  return {
    id: row.id,
    userId: row.user_id || row.firebase_uid,
    firebaseUid: row.firebase_uid || row.user_id,
    requestId: row.request_id || undefined,
    reportId: row.report_id || undefined,
    type: row.type,
    title: row.title,
    message: row.message,
    mediaTitle: row.media_title || '',
    movieId: row.movie_id || undefined,
    mediaType: row.media_type || 'movie',
    linkUrl: row.link_url || '/',
    posterPath: row.poster_path || null,
    read: Boolean(row.read),
    createdAt: row.created_at,
    readAt: row.read_at || null,
    adminReply: row.admin_reply || undefined,
    replacementUrl: row.replacement_url || undefined,
  };
}

/**
 * Checks whether user has in-app notifications enabled for requests or reports across all storage engines
 */
export async function isUserNotificationEnabled(
  firebaseUid: string,
  category: 'request' | 'report',
  _db?: any
): Promise<boolean> {
  try {
    const cleanUid = (firebaseUid || '').trim();
    if (!cleanUid) return true;

    // Check user profile directory lookup (checks Supabase, Redis, local)
    const profile = await getUserByFirebaseUid(cleanUid);
    if (profile?.notificationPreferences) {
      return category === 'request'
        ? profile.notificationPreferences.inAppRequests !== false
        : profile.notificationPreferences.inAppReports !== false;
    }

    return true;
  } catch {
    return true;
  }
}

/**
 * Internal helper to persist a notification across Supabase, Upstash Redis, and Local JSON.
 * Returns true if persisted in at least one layer.
 */
async function saveNotificationRecord(
  notif: UserNotification,
  _dbName?: string
): Promise<{ success: boolean; created: boolean; notification: UserNotification }> {
  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      // Idempotency check in Supabase
      let query = supabase.from('notifications').select('*').limit(1);
      if (notif.requestId && notif.type !== 'ADMIN_REPLY') {
        query = query.or(`id.eq.${notif.id},and(request_id.eq.${notif.requestId},type.eq.${notif.type})`);
      } else if (notif.reportId && notif.type !== 'ADMIN_REPLY') {
        query = query.or(`id.eq.${notif.id},and(report_id.eq.${notif.reportId},type.eq.${notif.type})`);
      } else {
        query = query.eq('id', notif.id);
      }

      const { data: existing } = await query.maybeSingle();
      if (existing) {
        return { success: true, created: false, notification: mapSupabaseRowToNotification(existing) };
      }

      const row = mapNotificationToSupabaseRow(notif);
      const { error: insertErr } = await supabase.from('notifications').upsert(row, { onConflict: 'id' });
      if (!insertErr) {
        persisted = true;
      } else {
        console.warn('Supabase notification save warning:', insertErr.message);
      }
    }
  } catch (supabaseErr: any) {
    console.warn('Supabase notification save error:', supabaseErr.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const raw = await redisClient.get<any>(REDIS_NOTIFICATIONS_KEY);
      const list = parseRedisList<UserNotification>(raw);

      // Check for duplicate in Redis
      const existing = list.find((n) => {
        if (n.id === notif.id) return true;
        if (notif.requestId && notif.type !== 'ADMIN_REPLY' && n.requestId === notif.requestId && n.type === notif.type) return true;
        if (notif.reportId && notif.type !== 'ADMIN_REPLY' && n.reportId === notif.reportId && n.type === notif.type) return true;
        return false;
      });

      if (existing) {
        return { success: true, created: false, notification: existing };
      }

      // Prepend and cap at 1000 items
      const updated = [notif, ...list.filter((n) => n.id !== notif.id)].slice(0, 1000);
      await redisClient.set(REDIS_NOTIFICATIONS_KEY, updated);
      persisted = true;
    } catch (redisErr: any) {
      console.warn('Upstash Redis notification save warning:', redisErr.message);
    }
  }

  // 3. Local fallback JSON
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackNotifications();
      const existing = local.find((n) => n.id === notif.id);
      if (!existing) {
        const updated = [notif, ...local.filter((n) => n.id !== notif.id)].slice(0, 500);
        if (saveLocalFallbackNotifications(updated)) {
          persisted = true;
        }
      }
    } catch (localErr: any) {
      console.warn('Local notification save warning:', localErr.message);
    }
  }

  return { success: persisted, created: true, notification: notif };
}

/**
 * Creates a single, idempotent fulfillment notification for a user request.
 */
export async function createRequestFulfilledNotification(
  request: UserRequest,
  meta?: {
    fulfilledLinkId?: string;
    fulfilledLinkUrl?: string;
    adminNote?: string;
  },
  dbName?: string
): Promise<{ success: boolean; created: boolean; notification?: UserNotification }> {
  const uid = (request.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { success: false, created: false };
  }

  try {
    const enabled = await isUserNotificationEnabled(uid, 'request');
    if (!enabled) {
      return { success: true, created: false };
    }

    const mediaType = request.mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbId = request.tmdbId;
    const linkUrl = tmdbId ? `/${mediaType}/${tmdbId}` : (meta?.fulfilledLinkUrl || '/');
    const releaseYr = request.releaseYear ? ` (${request.releaseYear})` : '';
    const cleanMediaTitle = request.title.trim();

    const notif: UserNotification = {
      id: `notif-${request.id}`,
      userId: uid,
      firebaseUid: uid,
      requestId: request.id,
      type: 'REQUEST_FULFILLED',
      title: 'Your request has been fulfilled',
      message: `"${cleanMediaTitle}"${releaseYr} is now available on CineFuel.${meta?.adminNote ? ` Admin note: "${meta.adminNote}"` : ''}`,
      mediaTitle: cleanMediaTitle,
      movieId: tmdbId,
      mediaType,
      linkUrl,
      posterPath: request.posterPath || null,
      read: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      adminReply: meta?.adminNote || undefined,
    };

    return await saveNotificationRecord(notif, dbName);
  } catch (err: any) {
    console.error('Failed to create request fulfillment notification:', err.message);
    return { success: false, created: false };
  }
}

/**
 * Creates a notification when a user request is marked in-progress.
 */
export async function createRequestInProgressNotification(
  request: UserRequest,
  meta?: {
    adminNote?: string;
  },
  dbName?: string
): Promise<{ success: boolean; created: boolean; notification?: UserNotification }> {
  const uid = (request.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { success: false, created: false };
  }

  try {
    const enabled = await isUserNotificationEnabled(uid, 'request');
    if (!enabled) {
      return { success: true, created: false };
    }

    const mediaType = request.mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbId = request.tmdbId;
    const linkUrl = tmdbId ? `/${mediaType}/${tmdbId}` : '/profile#my-requests';
    const cleanMediaTitle = request.title.trim();

    const notif: UserNotification = {
      id: `notif-prog-${request.id}`,
      userId: uid,
      firebaseUid: uid,
      requestId: request.id,
      type: 'REQUEST_IN_PROGRESS',
      title: `Request in Progress: ${cleanMediaTitle}`,
      message: `Our curators are working on sourcing "${cleanMediaTitle}".${meta?.adminNote ? ` (${meta.adminNote})` : ''}`,
      mediaTitle: cleanMediaTitle,
      movieId: tmdbId,
      mediaType,
      linkUrl,
      posterPath: request.posterPath || null,
      read: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      adminReply: meta?.adminNote || undefined,
    };

    return await saveNotificationRecord(notif, dbName);
  } catch (err: any) {
    console.error('Failed to create request in-progress notification:', err.message);
    return { success: false, created: false };
  }
}

/**
 * Creates a notification when a user request is rejected by an admin.
 */
export async function createRequestRejectedNotification(
  request: UserRequest,
  meta?: {
    adminNote?: string;
  },
  dbName?: string
): Promise<{ success: boolean; created: boolean; notification?: UserNotification }> {
  const uid = (request.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { success: false, created: false };
  }

  try {
    const enabled = await isUserNotificationEnabled(uid, 'request');
    if (!enabled) {
      return { success: true, created: false };
    }

    const mediaType = request.mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbId = request.tmdbId;
    const linkUrl = '/profile#my-requests';
    const cleanMediaTitle = request.title.trim();

    const notif: UserNotification = {
      id: `notif-rej-${request.id}`,
      userId: uid,
      firebaseUid: uid,
      requestId: request.id,
      type: 'REQUEST_REJECTED',
      title: `Request Rejected: ${cleanMediaTitle}`,
      message: `Your request for "${cleanMediaTitle}" could not be fulfilled.${meta?.adminNote ? ` Reason: "${meta.adminNote}"` : ''}`,
      mediaTitle: cleanMediaTitle,
      movieId: tmdbId,
      mediaType,
      linkUrl,
      posterPath: request.posterPath || null,
      read: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      adminReply: meta?.adminNote || undefined,
    };

    return await saveNotificationRecord(notif, dbName);
  } catch (err: any) {
    console.error('Failed to create request rejection notification:', err.message);
    return { success: false, created: false };
  }
}

/**
 * Creates a single, idempotent notification for a defective link report resolution or update.
 */
export async function createReportNotification(
  report: DefectiveLinkReport,
  status: 'fixed' | 'dismissed',
  meta?: {
    replacementUrl?: string;
    adminNote?: string;
  },
  dbName?: string
): Promise<{ success: boolean; created: boolean; notification?: UserNotification }> {
  const uid = (report.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { success: false, created: false };
  }

  try {
    const enabled = await isUserNotificationEnabled(uid, 'report');
    if (!enabled) {
      return { success: true, created: false };
    }

    const notifType = status === 'fixed' ? 'DEFECTIVE_LINK_RESOLVED' : 'DEFECTIVE_LINK_DISMISSED';
    const mediaType = report.mediaType === 'tv' ? 'tv' : 'movie';
    const movieId = report.movieId;
    const linkUrl = meta?.replacementUrl || (movieId ? `/${mediaType}/${movieId}` : '/profile#my-reports');
    const cleanMediaTitle = (report.mediaTitle || 'Reported Title').trim();

    const title = status === 'fixed'
      ? 'Broken Link Report Resolved'
      : 'Broken Link Report Dismissed';

    const message = status === 'fixed'
      ? `The link you reported for "${cleanMediaTitle}" has been verified and repaired.${meta?.adminNote ? ` (${meta.adminNote})` : ''}`
      : `The link report for "${cleanMediaTitle}" was checked and dismissed.${meta?.adminNote ? ` Note: "${meta.adminNote}"` : ' Our curators confirmed the title is active.'}`;

    const notif: UserNotification = {
      id: `notif-rep-${report.id}-${status}`,
      userId: uid,
      firebaseUid: uid,
      reportId: report.id,
      type: notifType,
      title,
      message,
      mediaTitle: cleanMediaTitle,
      movieId,
      mediaType,
      linkUrl,
      posterPath: report.posterPath || null,
      read: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      adminReply: meta?.adminNote || undefined,
    };

    return await saveNotificationRecord(notif, dbName);
  } catch (err: any) {
    console.error('Failed to create defective report notification:', err.message);
    return { success: false, created: false };
  }
}

/**
 * Creates a notification when a defective link report is marked in-progress.
 */
export async function createReportInProgressNotification(
  report: DefectiveLinkReport,
  meta?: {
    adminNote?: string;
  },
  dbName?: string
): Promise<{ success: boolean; created: boolean; notification?: UserNotification }> {
  const uid = (report.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { success: false, created: false };
  }

  try {
    const enabled = await isUserNotificationEnabled(uid, 'report');
    if (!enabled) {
      return { success: true, created: false };
    }

    const mediaType = report.mediaType === 'tv' ? 'tv' : 'movie';
    const movieId = report.movieId;
    const linkUrl = movieId ? `/${mediaType}/${movieId}` : '/profile#my-reports';
    const cleanMediaTitle = (report.mediaTitle || 'Reported Title').trim();

    const notif: UserNotification = {
      id: `notif-rep-prog-${report.id}`,
      userId: uid,
      firebaseUid: uid,
      reportId: report.id,
      type: 'DEFECTIVE_LINK_IN_PROGRESS',
      title: `Broken Link Report In Progress: ${cleanMediaTitle}`,
      message: `Our technical team is currently investigating and repairing the reported link for "${cleanMediaTitle}".${meta?.adminNote ? ` (${meta.adminNote})` : ''}`,
      mediaTitle: cleanMediaTitle,
      movieId,
      mediaType,
      linkUrl,
      posterPath: report.posterPath || null,
      read: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      adminReply: meta?.adminNote || undefined,
    };

    return await saveNotificationRecord(notif, dbName);
  } catch (err: any) {
    console.error('Failed to create defective report in-progress notification:', err.message);
    return { success: false, created: false };
  }
}

/**
 * Creates an in-app notification when an admin replies to a user request or broken link report
 */
export async function createAdminReplyNotification(
  targetType: 'request' | 'report',
  item: UserRequest | DefectiveLinkReport,
  replyText: string,
  dbName?: string
): Promise<{ success: boolean; created: boolean; notification?: UserNotification }> {
  const uid = (item.userId || '').trim();
  if (!uid || uid === 'guest-user-default' || !replyText.trim()) {
    return { success: false, created: false };
  }

  try {
    const enabled = await isUserNotificationEnabled(uid, targetType);
    if (!enabled) {
      return { success: true, created: false };
    }

    const cleanMediaTitle = targetType === 'request'
      ? (item as UserRequest).title.trim()
      : ((item as DefectiveLinkReport).mediaTitle || 'Reported Title').trim();

    const mediaType = ((item as any).mediaType === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
    const movieId = targetType === 'request'
      ? (item as UserRequest).tmdbId
      : (item as DefectiveLinkReport).movieId;

    const linkUrl = movieId ? `/${mediaType}/${movieId}` : '/profile';
    const notifId = `notif-reply-${item.id}-${Date.now()}`;

    const notif: UserNotification = {
      id: notifId,
      userId: uid,
      firebaseUid: uid,
      ...(targetType === 'request' ? { requestId: item.id } : { reportId: item.id }),
      type: 'ADMIN_REPLY',
      title: targetType === 'request'
        ? `Admin Replied to Your Request: ${cleanMediaTitle}`
        : `Admin Replied to Your Broken Link Report: ${cleanMediaTitle}`,
      message: `Admin reply: "${replyText.trim()}"`,
      mediaTitle: cleanMediaTitle,
      movieId,
      mediaType,
      linkUrl,
      posterPath: item.posterPath || null,
      read: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      adminReply: replyText.trim(),
    };

    return await saveNotificationRecord(notif, dbName);
  } catch (err: any) {
    console.error('Failed to create admin reply notification:', err.message);
    return { success: false, created: false };
  }
}

/**
 * Retrieves paginated notifications for a verified user across Supabase, Upstash Redis, and Local JSON.
 */
export async function getUserNotifications(
  firebaseUid: string,
  options: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  _dbName?: string
): Promise<{
  notifications: UserNotification[];
  total: number;
  unreadCount: number;
  page: number;
  totalPages: number;
  limit: number;
  hasMore: boolean;
}> {
  const uid = (firebaseUid || '').trim();
  if (!uid) {
    return {
      notifications: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      totalPages: 1,
      limit: 20,
      hasMore: false,
    };
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.max(1, Math.min(50, options.limit || 20));

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      let query = supabase.from('notifications').select('*', { count: 'exact' });
      query = query.or(`firebase_uid.eq.${uid},user_id.eq.${uid}`);
      if (options.unreadOnly) {
        query = query.eq('read', false);
      }
      query = query.order('created_at', { ascending: false });
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        const notifications = data.map(mapSupabaseRowToNotification);
        const total = count ?? data.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        const { count: unreadCountVal } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .or(`firebase_uid.eq.${uid},user_id.eq.${uid}`)
          .eq('read', false);

        return {
          notifications,
          total,
          unreadCount: unreadCountVal ?? notifications.filter((n) => !n.read).length,
          page,
          totalPages,
          limit,
          hasMore: page < totalPages,
        };
      }
    }
  } catch (err: any) {
    console.warn('Supabase notifications read fallback:', err.message);
  }

  // 2. Try Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const raw = await redisClient.get<any>(REDIS_NOTIFICATIONS_KEY);
      const list = parseRedisList<UserNotification>(raw);

      const userNotifs = list.filter((n) => n.firebaseUid === uid || n.userId === uid);
      const unreadCount = userNotifs.filter((n) => !n.read).length;

      const filtered = options.unreadOnly ? userNotifs.filter((n) => !n.read) : userNotifs;
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const paged = filtered.slice((page - 1) * limit, page * limit);

      return {
        notifications: paged,
        total,
        unreadCount,
        page,
        totalPages,
        limit,
        hasMore: page < totalPages,
      };
    } catch (redisErr: any) {
      console.warn('Upstash Redis notifications read failed:', redisErr.message);
    }
  }

  // 3. Fallback to Local JSON
  const localList = getLocalFallbackNotifications();
  const userNotifs = localList.filter((n) => n.firebaseUid === uid || n.userId === uid);
  const unreadCount = userNotifs.filter((n) => !n.read).length;

  const filtered = options.unreadOnly ? userNotifs.filter((n) => !n.read) : userNotifs;
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paged = filtered.slice((page - 1) * limit, page * limit);

  return {
    notifications: paged,
    total,
    unreadCount,
    page,
    totalPages,
    limit,
    hasMore: page < totalPages,
  };
}

/**
 * Gets efficient unread notification count for authenticated header badge
 */
export async function getUnreadNotificationCount(firebaseUid: string, _dbName?: string): Promise<number> {
  const uid = (firebaseUid || '').trim();
  if (!uid) return 0;

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .or(`firebase_uid.eq.${uid},user_id.eq.${uid}`)
        .eq('read', false);
      if (typeof count === 'number') {
        return count;
      }
    }
  } catch (err: any) {
    console.warn('Supabase countUnread fallback:', err.message);
  }

  // 2. Try Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const raw = await redisClient.get<any>(REDIS_NOTIFICATIONS_KEY);
      const list = parseRedisList<UserNotification>(raw);
      return list.filter((n) => (n.firebaseUid === uid || n.userId === uid) && !n.read).length;
    } catch (redisErr: any) {
      console.warn('Upstash Redis countUnread failed:', redisErr.message);
    }
  }

  // 3. Local fallback
  const local = getLocalFallbackNotifications();
  return local.filter((n) => (n.firebaseUid === uid || n.userId === uid) && !n.read).length;
}

/**
 * Marks a notification as read with strict user ownership validation across all stores
 */
export async function markNotificationAsRead(
  notificationId: string,
  firebaseUid: string,
  _dbName?: string
): Promise<{ success: boolean; found: boolean }> {
  const uid = (firebaseUid || '').trim();
  const id = (notificationId || '').trim();
  if (!uid || !id) return { success: false, found: false };

  let found = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .or(`firebase_uid.eq.${uid},user_id.eq.${uid}`)
        .select('id');
      if (!error && data && data.length > 0) {
        found = true;
      }
    }
  } catch (err: any) {
    console.warn('Supabase markNotificationAsRead warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const raw = await redisClient.get<any>(REDIS_NOTIFICATIONS_KEY);
      const list = parseRedisList<UserNotification>(raw);
      let updatedAny = false;
      const updated = list.map((n) => {
        if (n.id === id && (n.firebaseUid === uid || n.userId === uid)) {
          updatedAny = true;
          found = true;
          return { ...n, read: true, readAt: new Date().toISOString() };
        }
        return n;
      });
      if (updatedAny) {
        await redisClient.set(REDIS_NOTIFICATIONS_KEY, updated);
      }
    } catch (redisErr: any) {
      console.warn('Upstash Redis markNotificationAsRead failed:', redisErr.message);
    }
  }

  // 3. Local fallback
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackNotifications();
      let updatedLocal = false;
      const updated = local.map((n) => {
        if (n.id === id && (n.firebaseUid === uid || n.userId === uid)) {
          updatedLocal = true;
          found = true;
          return { ...n, read: true, readAt: new Date().toISOString() };
        }
        return n;
      });
      if (updatedLocal) {
        saveLocalFallbackNotifications(updated);
      }
    } catch (localErr: any) {
      console.warn('Local markNotificationAsRead failed:', localErr.message);
    }
  }

  return {
    success: true,
    found,
  };
}

/**
 * Marks all notifications for a user as read across all stores
 */
export async function markAllNotificationsAsRead(
  firebaseUid: string,
  _dbName?: string
): Promise<{ success: boolean; count: number }> {
  const uid = (firebaseUid || '').trim();
  if (!uid) return { success: false, count: 0 };

  let count = 0;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('notifications')
        .update({
          read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .or(`firebase_uid.eq.${uid},user_id.eq.${uid}`)
        .eq('read', false)
        .select('id');
      if (!error && data) {
        count = data.length;
      }
    }
  } catch (err: any) {
    console.warn('Supabase markAllNotificationsAsRead warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const raw = await redisClient.get<any>(REDIS_NOTIFICATIONS_KEY);
      const list = parseRedisList<UserNotification>(raw);
      let redisCount = 0;
      const updated = list.map((n) => {
        if ((n.firebaseUid === uid || n.userId === uid) && !n.read) {
          redisCount++;
          return { ...n, read: true, readAt: new Date().toISOString() };
        }
        return n;
      });
      if (redisCount > 0) {
        await redisClient.set(REDIS_NOTIFICATIONS_KEY, updated);
        if (count === 0) count = redisCount;
      }
    } catch (redisErr: any) {
      console.warn('Upstash Redis markAllNotificationsAsRead failed:', redisErr.message);
    }
  }

  // 3. Local JSON
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackNotifications();
      let localCount = 0;
      const updated = local.map((n) => {
        if ((n.firebaseUid === uid || n.userId === uid) && !n.read) {
          localCount++;
          return { ...n, read: true, readAt: new Date().toISOString() };
        }
        return n;
      });
      if (localCount > 0) {
        saveLocalFallbackNotifications(updated);
        if (count === 0) count = localCount;
      }
    } catch {}
  }

  return {
    success: true,
    count,
  };
}
