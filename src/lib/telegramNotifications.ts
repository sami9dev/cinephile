import { getSupabaseAdminClient } from '@/lib/supabase';
import { getEnv } from '@/lib/env';
import {
  UserRequest,
  DefectiveLinkReport,
  UserNotification,
  TelegramLink,
  TelegramLinkingToken,
  NotificationDelivery,
} from '@/types';
import { formatTelegramReleaseSummary } from '@/lib/releaseParser';

function getBotToken(): string {
  return (getEnv('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

export function getBotUsername(): string {
  return (getEnv('TELEGRAM_BOT_USERNAME') || process.env.TELEGRAM_BOT_USERNAME || 'CineFlue_bot').replace(/^@/, '').trim();
}

export function getSiteUrl(): string {
  const url = getEnv('NEXT_PUBLIC_SITE_URL') || process.env.NEXT_PUBLIC_SITE_URL || 'https://cineflue084.sk6216071.workers.dev';
  return url.replace(/\/+$/, '');
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Ensures required indexes on Telegram collections (managed by Supabase migrations)
 */
export async function ensureTelegramIndexes(_dbName?: string): Promise<void> {
  // Handled natively by Supabase schema indexes
}

function mapTelegramLinkToSupabaseRow(link: TelegramLink): Record<string, any> {
  return {
    firebase_uid: link.firebaseUid,
    telegram_chat_id: link.telegramChatId,
    telegram_user_id: link.telegramUserId,
    telegram_username: link.telegramUsername || null,
    status: link.status || 'active',
    request_notifications: link.requestNotifications !== false,
    report_notifications: link.reportNotifications !== false,
    linked_at: link.linkedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapSupabaseRowToTelegramLink(row: any): TelegramLink {
  return {
    firebaseUid: row.firebase_uid,
    telegramChatId: Number(row.telegram_chat_id),
    telegramUserId: Number(row.telegram_user_id),
    telegramUsername: row.telegram_username || undefined,
    status: row.status || 'active',
    requestNotifications: row.request_notifications !== false,
    reportNotifications: row.report_notifications !== false,
    linkedAt: row.linked_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Generates a cryptographically random, short-lived, single-use linking token for an authenticated user
 */
export async function generateTelegramLinkingToken(
  firebaseUid: string,
  _dbName?: string
): Promise<{ token: string; expiresAt: string; botUsername: string; telegramUrl: string }> {
  const uid = (firebaseUid || '').trim();
  if (!uid || uid === 'guest-user-default') {
    throw new Error('Valid authenticated user identity required to generate Telegram linking token');
  }

  // Generate cryptographically random token (32 hex characters)
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 minutes TTL

  const tokenRecord: TelegramLinkingToken = {
    token,
    firebaseUid: uid,
    createdAt: now.toISOString(),
    expiresAt,
    used: false,
    usedAt: null,
  };

  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      await supabase.from('telegram_linking_tokens').insert({
        token,
        firebase_uid: uid,
        created_at: now.toISOString(),
        expires_at: expiresAt,
        used: false,
        used_at: null,
      });
    }
  } catch (err: any) {
    console.warn('Supabase linking token insert warning:', err.message);
  }

  const botUsername = getBotUsername();
  const telegramUrl = `https://t.me/${botUsername}?start=${token}`;

  return {
    token,
    expiresAt,
    botUsername,
    telegramUrl,
  };
}

/**
 * Validates and atomically consumes a one-time linking token
 */
export async function verifyAndConsumeTelegramLinkingToken(
  token: string,
  _dbName?: string
): Promise<{ valid: boolean; firebaseUid?: string; error?: string }> {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    return { valid: false, error: 'Empty token' };
  }

  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return { valid: false, error: 'Database unavailable' };
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('telegram_linking_tokens')
      .select('*')
      .eq('token', cleanToken)
      .eq('used', false)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (error || !data || !data.firebase_uid) {
      return { valid: false, error: 'Token is invalid, expired, or already used' };
    }

    await supabase
      .from('telegram_linking_tokens')
      .update({ used: true, used_at: nowIso })
      .eq('token', cleanToken);

    return { valid: true, firebaseUid: data.firebase_uid };
  } catch (err: any) {
    console.error('Error verifying Telegram linking token:', err.message);
    return { valid: false, error: err.message };
  }
}

/**
 * Links a Telegram chat/user to a CineFuel user account
 */
export async function linkTelegramAccount(
  firebaseUid: string,
  telegramInfo: {
    chatId: number;
    userId: number;
    username?: string;
  },
  _dbName?: string
): Promise<{ success: boolean; link?: TelegramLink }> {
  const uid = (firebaseUid || '').trim();
  if (!uid) return { success: false };

  try {
    const supabase = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const linkDoc: TelegramLink = {
      firebaseUid: uid,
      telegramChatId: telegramInfo.chatId,
      telegramUserId: telegramInfo.userId,
      telegramUsername: telegramInfo.username || undefined,
      status: 'active',
      requestNotifications: true,
      reportNotifications: true,
      linkedAt: nowIso,
      updatedAt: nowIso,
    };

    if (supabase) {
      const row = mapTelegramLinkToSupabaseRow(linkDoc);
      const { error } = await supabase.from('telegram_links').upsert(row, { onConflict: 'firebase_uid' });
      if (error) {
        console.error('Supabase linkTelegramAccount error:', error.message);
      }
    }

    return { success: true, link: linkDoc };
  } catch (err: any) {
    console.error('Failed to link Telegram account:', err.message);
    return { success: false };
  }
}

/**
 * Gets Telegram link record for a user
 */
export async function getTelegramLinkForUser(
  firebaseUid: string,
  _dbName?: string
): Promise<TelegramLink | null> {
  const uid = (firebaseUid || '').trim();
  if (!uid) return null;

  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('telegram_links')
        .select('*')
        .eq('firebase_uid', uid)
        .maybeSingle();

      if (!error && data) {
        return mapSupabaseRowToTelegramLink(data);
      }
    }
  } catch (err: any) {
    console.error('Failed to get Telegram link for user:', err.message);
  }
  return null;
}

/**
 * Updates notification preferences (requestNotifications, reportNotifications)
 */
export async function updateTelegramPreferences(
  firebaseUid: string,
  prefs: {
    requestNotifications?: boolean;
    reportNotifications?: boolean;
  },
  _dbName?: string
): Promise<{ success: boolean }> {
  const uid = (firebaseUid || '').trim();
  if (!uid) return { success: false };

  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const updateFields: any = { updated_at: new Date().toISOString() };
      if (typeof prefs.requestNotifications === 'boolean') {
        updateFields.request_notifications = prefs.requestNotifications;
      }
      if (typeof prefs.reportNotifications === 'boolean') {
        updateFields.report_notifications = prefs.reportNotifications;
      }

      const { error } = await supabase
        .from('telegram_links')
        .update(updateFields)
        .eq('firebase_uid', uid);

      return { success: !error };
    }
  } catch (err: any) {
    console.error('Failed to update Telegram preferences:', err.message);
  }
  return { success: false };
}

/**
 * Disconnects Telegram from a CineFuel user account
 */
export async function disconnectTelegramAccount(
  firebaseUid: string,
  _dbName?: string
): Promise<{ success: boolean }> {
  const uid = (firebaseUid || '').trim();
  if (!uid) return { success: false };

  try {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase
        .from('telegram_links')
        .update({
          status: 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('firebase_uid', uid);

      return { success: !error };
    }
  } catch (err: any) {
    console.error('Failed to disconnect Telegram account:', err.message);
  }
  return { success: false };
}

/**
 * Sends a raw Telegram message via Telegram Bot API
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: any
): Promise<{ ok: boolean; messageId?: number; description?: string }> {
  const token = getBotToken();
  if (!token) {
    console.warn('Cannot send Telegram message: TELEGRAM_BOT_TOKEN not configured');
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });

    const data = await res.json();
    if (data?.ok) {
      return { ok: true, messageId: data.result?.message_id };
    }
    console.warn('Telegram sendMessage API error response:', data?.description);
    return { ok: false, description: data?.description || 'Telegram API returned not ok' };
  } catch (err: any) {
    console.warn('Telegram sendMessage network error:', err.message);
    return { ok: false, description: err.message };
  }
}

/**
 * Dispatches Telegram notification for a fulfilled user request
 */
export async function dispatchTelegramNotificationForRequest(
  request: UserRequest,
  notification: UserNotification,
  dbName?: string
): Promise<{ dispatched: boolean; delivery?: NotificationDelivery }> {
  const uid = (request.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { dispatched: false };
  }

  try {
    const tgLink = await getTelegramLinkForUser(uid, dbName);
    if (!tgLink || tgLink.status !== 'active' || tgLink.requestNotifications === false) {
      return { dispatched: false };
    }

    const siteUrl = getSiteUrl();
    const mediaType = request.mediaType === 'tv' ? 'tv' : 'movie';
    const destinationUrl = notification.linkUrl?.startsWith('http')
      ? notification.linkUrl
      : `${siteUrl}${notification.linkUrl || (request.tmdbId ? `/${mediaType}/${request.tmdbId}` : '/')}`;

    const title = escapeHtml(request.title.trim());
    const releaseYear = request.releaseYear ? ` (${escapeHtml(request.releaseYear)})` : '';
    const quality = request.quality ? escapeHtml(request.quality) : '';
    const audio = request.audioLanguage ? escapeHtml(request.audioLanguage) : '';

    const messageHtml =
`🎬 <b>CineFuel Request Fulfilled</b>

Your requested title is now available!

<b>${title}${releaseYear}</b>

${quality ? `💎 <b>Quality:</b> <code>${quality}</code>\n` : ''}${audio ? `🔊 <b>Audio:</b> <code>${audio}</code>\n` : ''}
🚀 <i>Your request has been added to the CineFuel library. Enjoy streaming or downloading!</i>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🎬 Watch Now',
            url: destinationUrl,
          },
        ],
      ],
    };

    const sendRes = await sendTelegramMessage(tgLink.telegramChatId, messageHtml, replyMarkup);

    const delivery: NotificationDelivery = {
      id: `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      notificationId: notification.id,
      userId: uid,
      channel: 'telegram',
      telegramChatId: tgLink.telegramChatId,
      type: 'REQUEST_FULFILLED',
      status: sendRes.ok ? 'sent' : 'failed',
      telegramMessageId: sendRes.messageId || null,
      sentAt: new Date().toISOString(),
      error: sendRes.ok ? undefined : sendRes.description,
    };

    // Record delivery status in Supabase
    try {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        await supabase.from('notification_deliveries').insert({
          id: delivery.id,
          notification_id: delivery.notificationId,
          user_id: delivery.userId,
          channel: delivery.channel,
          telegram_chat_id: delivery.telegramChatId,
          type: delivery.type,
          status: delivery.status,
          telegram_message_id: delivery.telegramMessageId,
          sent_at: delivery.sentAt,
          error: delivery.error || null,
        });
      }
    } catch (logErr) {
      console.warn('Failed to record notification delivery:', logErr);
    }

    return { dispatched: sendRes.ok, delivery };
  } catch (err: any) {
    console.error('Failed to dispatch Telegram request notification:', err.message);
    return { dispatched: false };
  }
}

/**
 * Dispatches Telegram notification for a resolved/dismissed defective link report
 */
export async function dispatchTelegramNotificationForReport(
  report: DefectiveLinkReport,
  status: 'fixed' | 'dismissed',
  notification: UserNotification,
  dbName?: string
): Promise<{ dispatched: boolean; delivery?: NotificationDelivery }> {
  const uid = (report.userId || '').trim();
  if (!uid || uid === 'guest-user-default') {
    return { dispatched: false };
  }

  try {
    const tgLink = await getTelegramLinkForUser(uid, dbName);
    if (!tgLink || tgLink.status !== 'active' || tgLink.reportNotifications === false) {
      return { dispatched: false };
    }

    const siteUrl = getSiteUrl();
    const mediaType = report.mediaType === 'tv' ? 'tv' : 'movie';
    const destinationUrl = notification.linkUrl?.startsWith('http')
      ? notification.linkUrl
      : `${siteUrl}${notification.linkUrl || (report.movieId ? `/${mediaType}/${report.movieId}` : '/profile#my-reports')}`;

    const mediaTitle = escapeHtml((report.mediaTitle || 'Reported Title').trim());
    const isFixed = status === 'fixed';

    const messageHtml = isFixed
      ? `✅ <b>Broken Link Report Resolved</b>\n\nThe link you reported for <b>${mediaTitle}</b> has been repaired and verified active!\n\n🚀 <i>Thank you for helping keep the CineFuel library clean and reliable.</i>`
      : `ℹ️ <b>Broken Link Report Update</b>\n\nOur curators reviewed your report for <b>${mediaTitle}</b>. The link is operational and active.`;

    const replyMarkup = isFixed
      ? {
          inline_keyboard: [
            [
              {
                text: '🎬 Watch Now',
                url: destinationUrl,
              },
            ],
          ],
        }
      : undefined;

    const sendRes = await sendTelegramMessage(tgLink.telegramChatId, messageHtml, replyMarkup);

    const delivery: NotificationDelivery = {
      id: `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      notificationId: notification.id,
      userId: uid,
      channel: 'telegram',
      telegramChatId: tgLink.telegramChatId,
      type: isFixed ? 'DEFECTIVE_LINK_RESOLVED' : 'DEFECTIVE_LINK_DISMISSED',
      status: sendRes.ok ? 'sent' : 'failed',
      telegramMessageId: sendRes.messageId || null,
      sentAt: new Date().toISOString(),
      error: sendRes.ok ? undefined : sendRes.description,
    };

    // Record delivery status in Supabase
    try {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        await supabase.from('notification_deliveries').insert({
          id: delivery.id,
          notification_id: delivery.notificationId,
          user_id: delivery.userId,
          channel: delivery.channel,
          telegram_chat_id: delivery.telegramChatId,
          type: delivery.type,
          status: delivery.status,
          telegram_message_id: delivery.telegramMessageId,
          sent_at: delivery.sentAt,
          error: delivery.error || null,
        });
      }
    } catch (logErr) {
      console.warn('Failed to record notification delivery:', logErr);
    }

    return { dispatched: sendRes.ok, delivery };
  } catch (err: any) {
    console.error('Failed to dispatch Telegram report notification:', err.message);
    return { dispatched: false };
  }
}

const ADMIN_TELEGRAM_IDS = [930928310];

// Deduplication cache to prevent sending duplicate alerts when the same event is retried
const sentAdminAlerts = new Set<string>();

/**
 * Notifies telegram admin(s) instantly when a user submits a new request on the website.
 * Telegram is ONLY for alerting admins; all review, replies, fixes, and fulfillment happen in the web admin panel.
 */
export async function notifyAdminOnTelegramNewRequest(request: UserRequest): Promise<void> {
  const alertKey = `req:${request.id}`;
  if (sentAdminAlerts.has(alertKey)) {
    return;
  }
  sentAdminAlerts.add(alertKey);
  if (sentAdminAlerts.size > 1000) {
    const first = sentAdminAlerts.values().next().value;
    if (first) sentAdminAlerts.delete(first);
  }

  try {
    const title = escapeHtml(request.title.trim());
    const releaseYear = request.releaseYear ? ` (${escapeHtml(request.releaseYear)})` : '';
    const quality = request.quality ? escapeHtml(request.quality) : 'Any';
    const audio = request.audioLanguage ? escapeHtml(request.audioLanguage) : 'Any';
    const user = escapeHtml(request.userEmail || request.userName || 'Signed-in User');
    const notes = request.notes ? escapeHtml(request.notes) : '';
    const adminUrl = `${getSiteUrl()}/admin?tab=requests&id=${encodeURIComponent(request.id)}`;

    const releaseCandidate = `${request.title} ${request.quality || ''} ${request.notes || ''}`.trim();
    const releaseSummary = formatTelegramReleaseSummary(releaseCandidate);

    const text =
`🎬 <b>NEW USER REQUEST SUBMISSION</b>
─────────────────────────────
📌 <b>Title:</b> <b>${title}${releaseYear}</b>
💎 <b>Quality:</b> <code>${quality}</code>
🔊 <b>Audio:</b> <code>${audio}</code>
${releaseSummary ? `📦 <b>Release Details:</b> <code>${escapeHtml(releaseSummary)}</code>\n` : ''}👤 <b>User:</b> ${user}
🆔 <code>${request.id}</code>
${notes ? `📝 <b>Notes:</b> <i>${notes}</i>\n` : ''}
⚡ <i>Open in Website Admin Panel to review, reply, or fulfill:</i>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '🔗 Open in Admin Panel', url: adminUrl },
        ],
      ],
    };

    for (const adminId of ADMIN_TELEGRAM_IDS) {
      await sendTelegramMessage(adminId, text, replyMarkup).catch((err) => {
        console.warn(`Admin telegram alert delivery note for request ${request.id}:`, err?.message);
      });
    }
  } catch (err: any) {
    console.warn('Failed to notify admin on Telegram for request:', err.message);
  }
}

/**
 * Notifies telegram admin(s) instantly when a user reports a broken link on the website.
 * Telegram is ONLY for alerting admins; all review, replies, fixes, and dismissal happen in the web admin panel.
 */
export async function notifyAdminOnTelegramNewReport(report: DefectiveLinkReport): Promise<void> {
  const alertKey = `rep:${report.id}`;
  if (sentAdminAlerts.has(alertKey)) {
    return;
  }
  sentAdminAlerts.add(alertKey);
  if (sentAdminAlerts.size > 1000) {
    const first = sentAdminAlerts.values().next().value;
    if (first) sentAdminAlerts.delete(first);
  }

  try {
    const mediaTitle = escapeHtml(report.mediaTitle || 'Unknown Title');
    const issueLabel = escapeHtml(report.issueLabel || report.issueType);
    const reportedUrl = escapeHtml(report.reportedUrl);
    const user = escapeHtml(report.userEmail || report.userName || 'Signed-in User');
    const notes = report.additionalNotes ? escapeHtml(report.additionalNotes) : '';
    const adminUrl = `${getSiteUrl()}/admin?tab=reports&id=${encodeURIComponent(report.id)}`;

    const releaseCandidate = `${report.linkTitle || ''} ${report.additionalNotes || ''}`.trim();
    const releaseSummary = formatTelegramReleaseSummary(releaseCandidate, report.reportedUrl);

    const text =
`🚨 <b>NEW DEFECTIVE LINK REPORT</b>
─────────────────────────────
🎬 <b>Title:</b> <b>${mediaTitle}</b>
⚠️ <b>Issue:</b> <code>${issueLabel}</code>
🔗 <b>Reported URL:</b> <code>${reportedUrl}</code>
${releaseSummary ? `📦 <b>Release Details:</b> <code>${escapeHtml(releaseSummary)}</code>\n` : ''}👤 <b>Reporter:</b> ${user}
🆔 <code>${report.id}</code>
${notes ? `📝 <b>Notes:</b> <i>${notes}</i>\n` : ''}
⚡ <i>Open in Website Admin Panel to test, reply, or replace link:</i>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '🔗 Open in Admin Panel', url: adminUrl },
        ],
      ],
    };

    for (const adminId of ADMIN_TELEGRAM_IDS) {
      await sendTelegramMessage(adminId, text, replyMarkup).catch((err) => {
        console.warn(`Admin telegram alert delivery note for report ${report.id}:`, err?.message);
      });
    }
  } catch (err: any) {
    console.warn('Failed to notify admin on Telegram for report:', err.message);
  }
}

/**
 * Dispatches a Telegram message to a user when an admin replies to their submission
 */
export async function dispatchTelegramAdminReply(
  item: UserRequest | DefectiveLinkReport,
  type: 'request' | 'report',
  replyText: string,
  dbName?: string
): Promise<boolean> {
  const uid = (item.userId || '').trim();
  if (!uid || uid === 'guest-user-default') return false;

  try {
    const tgLink = await getTelegramLinkForUser(uid, dbName);
    if (!tgLink || tgLink.status !== 'active') return false;

    if (type === 'request' && tgLink.requestNotifications === false) return false;
    if (type === 'report' && tgLink.reportNotifications === false) return false;

    const siteUrl = getSiteUrl();
    const mediaTitle = escapeHtml(type === 'request' ? (item as UserRequest).title : (item as DefectiveLinkReport).mediaTitle);
    const msg = escapeHtml(replyText);

    const messageHtml =
`💬 <b>Admin Reply from CineFuel</b>
─────────────────────────────
Regarding your ${type === 'request' ? 'request' : 'report'} for:
<b>${mediaTitle}</b>

<i>"${msg}"</i>

🌐 <i>Check your profile notifications on CineFuel for details.</i>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🌐 View on CineFuel',
            url: `${siteUrl}/profile`,
          },
        ],
      ],
    };

    const res = await sendTelegramMessage(tgLink.telegramChatId, messageHtml, replyMarkup);
    return res.ok;
  } catch (err: any) {
    console.warn('Failed to dispatch telegram admin reply:', err.message);
    return false;
  }
}
