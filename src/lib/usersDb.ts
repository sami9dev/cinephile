import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getRedisClient } from '@/lib/redisDb';
import { getAllRequests } from '@/lib/requestsDb';
import { getAllReports } from '@/lib/reportsDb';
import { RegisteredUser } from '@/types';

const REDIS_USERS_KEY = 'cinefuel:registered_users';
const LOCAL_USERS_FILE = path.join(process.cwd(), 'src', 'data', 'registeredUsers.json');

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

/**
 * Reads local JSON fallback users file
 */
export function getLocalFallbackUsers(): RegisteredUser[] {
  try {
    if (fs.existsSync(LOCAL_USERS_FILE)) {
      const raw = fs.readFileSync(LOCAL_USERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading local registeredUsers.json:', e);
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
 * Writes local JSON fallback users file
 */
export function saveLocalFallbackUsers(data: RegisteredUser[]): boolean {
  if (!isFileSystemWritable()) return false;
  try {
    const dir = path.dirname(LOCAL_USERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing local registeredUsers.json:', e);
    return false;
  }
}

/**
 * Maps Supabase snake_case row to Cinephile RegisteredUser
 */
function mapSupabaseRowToUser(row: any): RegisteredUser {
  const uid = row.firebase_uid || row.uid || `usr_${Date.now()}`;
  const cleanEmail = (row.email || '').toLowerCase().trim();
  const name = row.name || row.display_name || (cleanEmail ? cleanEmail.split('@')[0] : 'Cinephile User');

  return {
    firebaseUid: uid,
    uid,
    name,
    displayName: row.display_name || name,
    email: cleanEmail,
    photoURL: row.photo_url || null,
    bio: row.bio || '',
    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres : [],
    provider: row.provider || 'firebase',
    status: row.status || 'active',
    createdAt: row.created_at || new Date().toISOString(),
    lastLoginAt: row.last_login_at || row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    notificationPreferences: row.notification_preferences || undefined,
  } as RegisteredUser;
}

/**
 * Maps RegisteredUser to Supabase row
 */
function mapUserToSupabaseRow(user: RegisteredUser): Record<string, any> {
  const uid = user.firebaseUid || user.uid;
  const cleanEmail = (user.email || '').toLowerCase().trim();
  const name = user.name || user.displayName || (cleanEmail ? cleanEmail.split('@')[0] : 'Cinephile User');

  return {
    uid,
    firebase_uid: uid,
    name,
    display_name: user.displayName || name,
    email: cleanEmail,
    photo_url: user.photoURL || null,
    bio: user.bio || '',
    favorite_genres: user.favoriteGenres || [],
    provider: user.provider || 'firebase',
    status: user.status || 'active',
    created_at: user.createdAt || new Date().toISOString(),
    last_login_at: user.lastLoginAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notification_preferences: user.notificationPreferences || null,
  };
}

/**
 * Formats and sanitizes a raw user document from redis/local fallback
 */
function sanitizeUserDocument(raw: any): RegisteredUser {
  const { _id, passwordHash, passwordSalt, ...rest } = raw;
  const cleanEmail = (rest.email || '').toLowerCase().trim();
  const uid = rest.firebaseUid || rest.uid || `usr_${Date.now()}`;
  const name = rest.name || rest.displayName || (cleanEmail ? cleanEmail.split('@')[0] : 'Cinephile User');

  return {
    ...rest,
    firebaseUid: uid,
    uid,
    name,
    displayName: name,
    email: cleanEmail,
    photoURL: rest.photoURL || null,
    provider: rest.provider || 'firebase',
    status: rest.status || 'active',
    createdAt: rest.createdAt || new Date().toISOString(),
    lastLoginAt: rest.lastLoginAt || rest.createdAt || new Date().toISOString(),
  } as RegisteredUser;
}

/**
 * Fetches all users from DB and merges live request/report activity (supports optional pagination)
 */
export async function getAllUsers(options?: { page?: number; limit?: number }): Promise<{
  users: RegisteredUser[];
  total: number;
  page?: number;
  totalPages?: number;
  limit?: number;
  source: 'supabase' | 'upstash_redis' | 'local_json';
}> {
  let userList: RegisteredUser[] = [];
  let total = 0;
  let source: 'supabase' | 'upstash_redis' | 'local_json' = 'local_json';
  const hasPagination = typeof options?.page === 'number' || typeof options?.limit === 'number';
  const page = Math.max(1, options?.page || 1);
  const limit = Math.max(1, Math.min(100, options?.limit || 50));

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      let query = supabase.from('users').select('*', { count: 'exact' });
      query = query.order('created_at', { ascending: false });
      if (hasPagination) {
        query = query.range((page - 1) * limit, page * limit - 1);
      }
      const { data, count, error } = await query;
      if (!error && data && data.length > 0) {
        userList = data.map(mapSupabaseRowToUser);
        total = count ?? data.length;
        source = 'supabase';
      }
    }
  } catch (supabaseErr: any) {
    console.warn('Supabase users read fallback:', supabaseErr.message);
  }

  // 2. Try Redis if Supabase was empty
  const redisClient = getRedisClient();
  if (userList.length === 0 && redisClient) {
    try {
      const redisData = await redisClient.get<any>(REDIS_USERS_KEY);
      const parsedList = parseRedisList<RegisteredUser>(redisData);
      if (parsedList.length > 0) {
        userList = parsedList.map((u: any) => sanitizeUserDocument(u));
        total = userList.length;
        source = 'upstash_redis';
      }
    } catch (redisErr: any) {
      console.warn('Upstash Redis users read failed:', redisErr.message);
    }
  }

  // 3. Fallback to local
  if (userList.length === 0) {
    userList = getLocalFallbackUsers().map((u: any) => sanitizeUserDocument(u));
    total = userList.length;
    source = 'local_json';
  }

  // 4. Fetch live requests & reports to correlate user activity
  const usersMap = new Map<string, RegisteredUser>();
  userList.forEach((u: any) => {
    const key = (u.email || u.firebaseUid || u.uid).toLowerCase();
    usersMap.set(key, { ...u, requestsCount: 0, reportsCount: 0, recentRequests: [] });
  });

  try {
    const { requests } = await getAllRequests('all');
    requests.forEach((req) => {
      const email = req.userEmail || req.userContact || '';
      const key = (email || req.userId || '').toLowerCase();
      if (!key) return;

      if (!usersMap.has(key)) {
        usersMap.set(key, {
          firebaseUid: req.userId || `usr-${Math.random().toString(36).substring(2, 9)}`,
          uid: req.userId || `usr-${Math.random().toString(36).substring(2, 9)}`,
          email: email || 'No email provided',
          name: req.userName || email.split('@')[0] || 'Cinephile User',
          displayName: req.userName || email.split('@')[0] || 'Cinephile User',
          createdAt: req.createdAt,
          lastLoginAt: req.createdAt,
          requestsCount: 0,
          reportsCount: 0,
          recentRequests: [],
          provider: 'request_submitter',
          status: 'active',
        });
      }

      const existing = usersMap.get(key)!;
      existing.requestsCount = (existing.requestsCount || 0) + 1;
      if (!existing.recentRequests) existing.recentRequests = [];
      if (!existing.recentRequests.includes(req.title)) {
        existing.recentRequests.push(req.title);
      }
    });
  } catch (e) {
    console.warn('Failed to correlate requests to users:', e);
  }

  try {
    const { reports } = await getAllReports('all');
    reports.forEach((rep) => {
      const email = rep.userEmail || '';
      const key = (email || rep.userId || '').toLowerCase();
      if (!key) return;

      if (!usersMap.has(key)) {
        usersMap.set(key, {
          firebaseUid: rep.userId || `usr-${Math.random().toString(36).substring(2, 9)}`,
          uid: rep.userId || `usr-${Math.random().toString(36).substring(2, 9)}`,
          email: email || 'No email provided',
          name: rep.userName || email.split('@')[0] || 'Cinephile User',
          displayName: rep.userName || email.split('@')[0] || 'Cinephile User',
          createdAt: rep.createdAt,
          lastLoginAt: rep.createdAt,
          requestsCount: 0,
          reportsCount: 0,
          recentRequests: [],
          provider: 'report_submitter',
          status: 'active',
        });
      }

      const existing = usersMap.get(key)!;
      existing.reportsCount = (existing.reportsCount || 0) + 1;
    });
  } catch (e) {
    console.warn('Failed to correlate reports to users:', e);
  }

  const finalUsers = Array.from(usersMap.values());
  finalUsers.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return {
    users: finalUsers,
    total: total || finalUsers.length,
    page: hasPagination ? page : 1,
    totalPages: hasPagination ? Math.max(1, Math.ceil((total || finalUsers.length) / limit)) : 1,
    limit: hasPagination ? limit : finalUsers.length,
    source,
  };
}

/**
 * Hashes a password using crypto.pbkdf2Sync (legacy password auth)
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, userSalt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt: userSalt };
}

/**
 * Verifies a password against a stored hash and salt (legacy password auth)
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === storedHash;
  } catch {
    return false;
  }
}

/**
 * Finds a user by Firebase UID across persistence layers
 */
export async function getUserByFirebaseUid(firebaseUid: string): Promise<RegisteredUser | null> {
  const cleanUid = (firebaseUid || '').trim();
  if (!cleanUid) return null;

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`firebase_uid.eq.${cleanUid},uid.eq.${cleanUid}`)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return mapSupabaseRowToUser(data);
      }
    }
  } catch (err: any) {
    console.warn('Supabase getUserByFirebaseUid warning:', err.message);
  }

  // 2. Try Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const redisData = await redisClient.get<any>(REDIS_USERS_KEY);
      const list = parseRedisList<RegisteredUser>(redisData);
      const found = list.find((u: RegisteredUser) => (u.firebaseUid === cleanUid || u.uid === cleanUid));
      if (found) return sanitizeUserDocument(found);
    } catch (e) {}
  }

  // 3. Try Local JSON
  try {
    const local = getLocalFallbackUsers();
    const found = local.find((u) => (u.firebaseUid === cleanUid || u.uid === cleanUid));
    if (found) return sanitizeUserDocument(found);
  } catch (e) {}

  return null;
}

/**
 * Finds a user by email across Supabase, Redis, and local JSON
 */
export async function getUserByEmail(email: string): Promise<RegisteredUser | null> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return null;

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return mapSupabaseRowToUser(data);
      }
    }
  } catch (err: any) {
    console.warn('Supabase getUserByEmail warning:', err.message);
  }

  // 2. Try Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const redisData = await redisClient.get<any>(REDIS_USERS_KEY);
      const list = parseRedisList<RegisteredUser>(redisData);
      const found = list.find((u: RegisteredUser) => u.email.toLowerCase() === cleanEmail);
      if (found) return sanitizeUserDocument(found);
    } catch (e) {}
  }

  // 3. Try Local JSON
  try {
    const local = getLocalFallbackUsers();
    const found = local.find((u) => u.email.toLowerCase() === cleanEmail);
    if (found) return sanitizeUserDocument(found);
  } catch (e) {}

  return null;
}

/**
 * Saves or updates a Firebase authenticated user profile across persistence layers.
 */
export async function saveFirebaseUserToDatabase(profile: {
  firebaseUid: string;
  name: string;
  email: string;
  photoURL?: string | null;
  provider?: string;
  createdAt?: string;
  lastLoginAt?: string;
  status?: string;
}): Promise<RegisteredUser> {
  const cleanEmail = (profile.email || '').toLowerCase().trim();
  const cleanUid = (profile.firebaseUid || '').trim();
  if (!cleanUid) {
    throw new Error('firebaseUid is required');
  }

  const existing = (await getUserByFirebaseUid(cleanUid)) || (cleanEmail ? await getUserByEmail(cleanEmail) : null);
  const finalName = profile.name ? profile.name.trim() : (cleanEmail ? cleanEmail.split('@')[0] : 'Cinephile User');

  const finalUser: RegisteredUser = {
    firebaseUid: cleanUid,
    uid: cleanUid,
    name: finalName,
    displayName: finalName,
    email: cleanEmail,
    photoURL: profile.photoURL !== undefined ? profile.photoURL : (existing?.photoURL || null),
    bio: existing?.bio || '',
    favoriteGenres: existing?.favoriteGenres || [],
    provider: profile.provider || existing?.provider || 'google.com',
    status: (profile.status as any) || existing?.status || 'active',
    createdAt: existing?.createdAt || profile.createdAt || new Date().toISOString(),
    lastLoginAt: profile.lastLoginAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requestsCount: existing?.requestsCount || 0,
    reportsCount: existing?.reportsCount || 0,
    recentRequests: existing?.recentRequests || [],
  };

  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const row = mapUserToSupabaseRow(finalUser);
      const { error } = await supabase.from('users').upsert(row, { onConflict: 'uid' });
      if (!error) {
        persisted = true;
      } else {
        console.warn('Supabase Firebase user save warning:', error.message);
      }
    }
  } catch (err: any) {
    console.warn('Supabase Firebase user save warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existingRedis = await redisClient.get<any>(REDIS_USERS_KEY);
      const currentList = parseRedisList<RegisteredUser>(existingRedis);
      const updated = [
        finalUser,
        ...currentList.filter((u) => u.firebaseUid !== cleanUid && u.uid !== cleanUid && (!cleanEmail || u.email !== cleanEmail)),
      ];
      await redisClient.set(REDIS_USERS_KEY, updated);
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis Firebase user save error:', err.message);
    }
  }

  // 3. Local JSON (only if writable)
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackUsers();
      const updated = [
        finalUser,
        ...local.filter((u) => u.firebaseUid !== cleanUid && u.uid !== cleanUid && (!cleanEmail || u.email !== cleanEmail)),
      ];
      if (saveLocalFallbackUsers(updated)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local Firebase user save failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not save Firebase user profile.');
  }

  return finalUser;
}

/**
 * Saves or updates a registered user across persistence layers (legacy password auth)
 */
export async function saveUserToDatabase(user: Partial<RegisteredUser> & { uid?: string; email: string }): Promise<RegisteredUser> {
  const cleanEmail = user.email.toLowerCase().trim();
  const existing = await getUserByEmail(cleanEmail);
  const uid = user.firebaseUid || user.uid || existing?.firebaseUid || existing?.uid || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const name = user.name || user.displayName || existing?.name || existing?.displayName || cleanEmail.split('@')[0] || 'Cinephile User';

  const finalUser: RegisteredUser = {
    firebaseUid: uid,
    uid,
    name,
    displayName: name,
    email: cleanEmail,
    photoURL: user.photoURL !== undefined ? user.photoURL : (existing?.photoURL || null),
    bio: user.bio || existing?.bio || '',
    favoriteGenres: user.favoriteGenres || existing?.favoriteGenres || [],
    createdAt: user.createdAt || existing?.createdAt || new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    provider: user.provider || existing?.provider || 'email_password',
    status: user.status || existing?.status || 'active',
    passwordHash: user.passwordHash || existing?.passwordHash,
    passwordSalt: user.passwordSalt || existing?.passwordSalt,
    requestsCount: existing?.requestsCount || 0,
    reportsCount: existing?.reportsCount || 0,
    recentRequests: existing?.recentRequests || [],
  };

  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const row = mapUserToSupabaseRow(finalUser);
      const { error } = await supabase.from('users').upsert(row, { onConflict: 'uid' });
      if (!error) {
        persisted = true;
      } else {
        console.warn('Supabase user save warning:', error.message);
      }
    }
  } catch (err: any) {
    console.warn('Supabase user save warning:', err.message);
  }

  // 2. Upstash Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existingRedis = await redisClient.get<any>(REDIS_USERS_KEY);
      const currentList = parseRedisList<RegisteredUser>(existingRedis);
      const updated = [finalUser, ...currentList.filter((u) => u.uid !== finalUser.uid && u.email !== finalUser.email)];
      await redisClient.set(REDIS_USERS_KEY, updated);
      persisted = true;
    } catch (err: any) {
      console.error('Upstash Redis user save error:', err.message);
    }
  }

  // 3. Local JSON (only if writable)
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackUsers();
      const updated = [finalUser, ...local.filter((u) => u.uid !== finalUser.uid && u.email !== finalUser.email)];
      if (saveLocalFallbackUsers(updated)) {
        persisted = true;
      }
    } catch (err: any) {
      console.error('Local user save failed:', err.message);
    }
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not save user.');
  }

  return finalUser;
}

/**
 * Deletes a user by uid or firebaseUid
 */
export async function deleteUserFromDatabase(uid: string): Promise<boolean> {
  const cleanUid = (uid || '').trim();
  if (!cleanUid) return false;
  let persisted = false;

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase
        .from('users')
        .delete()
        .or(`firebase_uid.eq.${cleanUid},uid.eq.${cleanUid}`);
      if (!error) {
        persisted = true;
      }
    }
  } catch (e) {}

  // 2. Redis
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const existing = await redisClient.get<any>(REDIS_USERS_KEY);
      const currentList = parseRedisList<RegisteredUser>(existing);
      await redisClient.set(
        REDIS_USERS_KEY,
        currentList.filter((u) => u.firebaseUid !== cleanUid && u.uid !== cleanUid)
      );
      persisted = true;
    } catch (e) {}
  }

  // 3. Local
  if (isFileSystemWritable()) {
    try {
      const local = getLocalFallbackUsers();
      if (saveLocalFallbackUsers(local.filter((u) => u.firebaseUid !== cleanUid && u.uid !== cleanUid))) {
        persisted = true;
      }
    } catch (e) {}
  }

  if (!persisted) {
    throw new Error('Database persistence unavailable: could not delete user.');
  }

  return true;
}

/**
 * Updates user notification preferences in Supabase and Redis
 */
export async function updateUserPreferences(
  firebaseUid: string,
  preferences: {
    inAppRequests?: boolean;
    inAppReports?: boolean;
    telegramRequests?: boolean;
    telegramReports?: boolean;
  }
): Promise<{ success: boolean; preferences: any }> {
  const cleanUid = (firebaseUid || '').trim();
  if (!cleanUid) return { success: false, preferences: null };

  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('notification_preferences')
        .or(`firebase_uid.eq.${cleanUid},uid.eq.${cleanUid}`)
        .maybeSingle();

      const currentPrefs = existingUser?.notification_preferences || {};
      const updatedPrefs = { ...currentPrefs, ...preferences };

      await supabase
        .from('users')
        .update({
          notification_preferences: updatedPrefs,
          updated_at: new Date().toISOString(),
        })
        .or(`firebase_uid.eq.${cleanUid},uid.eq.${cleanUid}`);
    }
    return { success: true, preferences };
  } catch (err: any) {
    console.warn('Failed to update user preferences in Supabase:', err.message);
    return { success: false, preferences: null };
  }
}
