import { NextRequest, NextResponse } from 'next/server';
import { processTelegramMessage, AUTHORIZED_TELEGRAM_IDS } from '@/lib/telegramBotCore';
import { getEnv } from '@/lib/env';
import { validateAdminAuth } from '@/lib/adminAuth';
import {
  verifyAndConsumeTelegramLinkingToken,
  linkTelegramAccount,
  sendTelegramMessage,
  getSiteUrl,
} from '@/lib/telegramNotifications';

export const dynamic = 'force-dynamic';

function getBotToken() {
  return (getEnv('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function escapeHtml(str: string) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramReply(chatId: number, text: string) {
  try {
    const token = getBotToken();
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error('Error sending reply to Telegram:', e);
  }
}

async function sendTelegramPhotoCard(chatId: number, card: any) {
  const versionsLines = (card.versions || []).map((v: any) => {
    let q = v.quality || '1080p';
    if (/\b(?:2160p|2160|4k|uhd)\b/i.test(q)) q = '2160p';
    else if (/\b(?:1080p|1080|fhd)\b/i.test(q)) q = '1080p';
    else if (/\b(?:720p|720|hd)\b/i.test(q)) q = '720p';
    else if (/\b(?:480p|480|sd)\b/i.test(q)) q = '480p';
    const s = v.size ? `\n  ${v.size}` : '';
    return `• ${q} :${s}`;
  }).join('\n');

  const versionsText = versionsLines || '• 1080p :\n  WEB-DL';

  let cleanOutline = (card.outline || 'Every release brings the cinema home.').trim();
  if (cleanOutline.length > 240) {
    cleanOutline = cleanOutline.slice(0, 237) + '...';
  }

  const caption = 
`⚡ <b>${escapeHtml(card.title?.toUpperCase())} ${card.year ? `(${card.year})` : ''}</b>
─────────────────────────────
⭐ <b>Rating:</b> ${card.rating || '6.5'}/10
🎭 <b>Genres:</b> ${escapeHtml(card.genres || 'Drama, Cinema')}
─────────────────────────────

📖 <b>Plot Outline:</b>
<blockquote>${escapeHtml(cleanOutline)}</blockquote>

📦 <b>Available Versions:</b>
<pre>${escapeHtml(versionsText)}</pre>

🔊 <b>Audio Track:</b> ${escapeHtml(card.audio || 'Hindi, English')}

👤 <b>Uploaded by:</b> #${(card.uploadedBy || 'Shyam').replace(/^#/, '')}

🚀 ${card.channelHandle || '@cinflue'}${card.autoMigrationNotice ? `\n\n${card.autoMigrationNotice}` : ''}`;

  const destinationUrl = card.pageUrl || `https://cineflue084.sk6216071.workers.dev/${card.mediaType || 'movie'}/${card.movieId}`;
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: `🚀 Download ${card.title}`,
          url: destinationUrl,
        },
      ],
    ],
  };

  const token = getBotToken();

  // 1. Try sending Photo with styled HTML Caption & Inline Keyboard (matches reference)
  if (card.photoUrl) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: card.photoUrl,
          caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
      });
      const data = await res.json();
      if (data?.ok) return data;
      console.warn('sendPhoto failed in webhook, falling back to sendMessage:', data?.description);
    } catch (e: any) {
      console.warn('sendPhoto error in webhook, falling back to sendMessage:', e?.message);
    }
  }

  // 2. Fallback to HTML Message with Inline Keyboard
  return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: false,
    }),
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = getEnv('TELEGRAM_WEBHOOK_SECRET');
  const headerSecret = request.headers.get('x-telegram-bot-api-secret-token');

  if (!webhookSecret || !headerSecret || headerSecret !== webhookSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing telegram webhook secret token' },
      { status: 401 }
    );
  }

  try {
    const update = await request.json();

    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true, note: 'No text message' });
    }

    const chatId = message.chat.id;
    const fromId = message.from ? message.from.id : chatId;
    const text = message.text;
    const botToken = getBotToken();

    // Send typing status immediately to Telegram
    if (botToken) {
      fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        signal: AbortSignal.timeout(2000),
      }).catch(() => {});
    }

    const trimmed = text.trim();
    const startMatch = trimmed.match(/^\/start(?:\s+([a-zA-Z0-9_-]+))?$/i);

    // Case 1: /start with linking token (account connection from CineFuel Profile)
    if (startMatch && startMatch[1]) {
      const token = startMatch[1].trim();
      const consumeRes = await verifyAndConsumeTelegramLinkingToken(token);
      if (consumeRes.valid && consumeRes.firebaseUid) {
        await linkTelegramAccount(consumeRes.firebaseUid, {
          chatId,
          userId: fromId,
          username: message.from?.username || undefined,
        });

        const siteUrl = getSiteUrl();
        const successMessage =
`🎉 <b>CineFuel Account Connected!</b>

Your Telegram is now securely linked to your CineFuel account.

You will receive real-time updates here when:
🎬 <b>Your requested movies or TV shows are added</b>
🔧 <b>Your broken link reports are resolved</b>

You can manage your notification preferences anytime from your CineFuel Profile.`;

        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '🌐 Open CineFuel',
                url: siteUrl,
              },
            ],
          ],
        };

        await sendTelegramMessage(chatId, successMessage, replyMarkup);
        return NextResponse.json({ ok: true, linked: true });
      } else {
        const siteUrl = getSiteUrl();
        const errorMsg =
`⚠️ <b>Invalid or Expired Link Code</b>

This connection token is invalid, expired, or has already been used.

Please visit your CineFuel Profile to generate a fresh connection link:
${siteUrl}/profile`;

        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '🌐 Open CineFuel Profile',
                url: `${siteUrl}/profile`,
              },
            ],
          ],
        };

        await sendTelegramMessage(chatId, errorMsg, replyMarkup);
        return NextResponse.json({ ok: true, linked: false, error: consumeRes.error });
      }
    }

    // Case 2: Non-admin users who send /start or other general text without a token
    const isAdmin = AUTHORIZED_TELEGRAM_IDS.includes(fromId);
    if (!isAdmin) {
      const siteUrl = getSiteUrl();
      const helpMsg =
`👋 <b>Welcome to CineFuel Bot!</b>

I deliver instant updates on your movie & TV requests and broken link reports.

<b>To connect your CineFuel account:</b>
1. Open your <b>CineFuel Profile</b>
2. Click <b>"Connect Telegram"</b>
3. Follow the link back to activate instant updates!`;

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🌐 Open CineFuel Profile',
              url: `${siteUrl}/profile`,
            },
          ],
        ],
      };

      await sendTelegramMessage(chatId, helpMsg, replyMarkup);
      return NextResponse.json({ ok: true, note: 'User welcome message sent' });
    }

    // Case 3: Admin auto-uploader messages
    const result = await processTelegramMessage(fromId, text);

    if ((result as any).cards && (result as any).cards.length > 0) {
      for (const card of (result as any).cards) {
        await sendTelegramPhotoCard(chatId, card);
      }
    } else if (result.card) {
      await sendTelegramPhotoCard(chatId, result.card);
    } else {
      await sendTelegramReply(chatId, result.replyText);
    }

    return NextResponse.json({ ok: true, processed: result.success });
  } catch (error: any) {
    console.error('Error in Telegram Webhook route:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const isAdmin = await validateAdminAuth(req);
  if (!isAdmin) {
    return NextResponse.json({
      status: 'online',
      service: 'CineFuel Telegram Auto-Uploader API',
    });
  }

  return NextResponse.json({
    status: 'online',
    bot: 'CineFlue_bot',
    service: 'CineFuel Telegram Auto-Uploader API',
    diagnostics: {
      supabaseConfigured: !!(getEnv('NEXT_PUBLIC_SUPABASE_URL') && getEnv('SUPABASE_SERVICE_ROLE_KEY')),
      redisUrlConfigured: !!(getEnv('UPSTASH_REDIS_REST_URL') || getEnv('KV_REST_API_URL')),
      redisTokenConfigured: !!(getEnv('UPSTASH_REDIS_REST_TOKEN') || getEnv('KV_REST_API_TOKEN')),
      adminKeyConfigured: !!(getEnv('ADMIN_SECRET_KEY') || getEnv('ADMIN_PASSWORD')),
      tgWebhookSecretConfigured: !!getEnv('TELEGRAM_WEBHOOK_SECRET'),
      env: getEnv('APP_ENV') || getEnv('CINEFUEL_ENV') || 'unknown',
    },
  });
}
