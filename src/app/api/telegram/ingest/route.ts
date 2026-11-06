import { NextRequest, NextResponse } from 'next/server';
import { processTelegramIngestion, TelegramIngestInput } from '@/lib/telegramIngestion';
import { getEnv } from '@/lib/env';
import { validateAdminAuth } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const AUTHORIZED_TELEGRAM_IDS = [930928310];

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const xAdminKey = request.headers.get('x-admin-key') || '';
    const xTelegramToken = request.headers.get('x-telegram-token') || '';

    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    const envAdminSecret = (getEnv('ADMIN_SECRET_KEY') || process.env.ADMIN_SECRET_KEY || '').trim();
    const envAdminPassword = (getEnv('ADMIN_PASSWORD') || process.env.ADMIN_PASSWORD || '').trim();
    const envBotToken = (getEnv('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || '').trim();

    let isAuthorized = false;

    // 1. Check API token / secret headers
    if (envAdminSecret && (bearerToken === envAdminSecret || xAdminKey === envAdminSecret)) {
      isAuthorized = true;
    } else if (envAdminPassword && (bearerToken === envAdminPassword || xAdminKey === envAdminPassword)) {
      isAuthorized = true;
    } else if (envBotToken && (xTelegramToken === envBotToken || bearerToken === envBotToken)) {
      isAuthorized = true;
    }

    // 2. Fallback to admin session cookies
    if (!isAuthorized) {
      isAuthorized = await validateAdminAuth(request);
    }

    const body: TelegramIngestInput = await request.json().catch(() => ({}));

    // 3. Allow authorized admin Telegram user ID
    if (!isAuthorized && body.fromId && AUTHORIZED_TELEGRAM_IDS.includes(body.fromId)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: valid admin secret, telegram bot token, or authorized telegram ID required.' },
        { status: 401 }
      );
    }

    const result = await processTelegramIngestion(body);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error('Error in /api/telegram/ingest route:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error processing telegram ingestion',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'online',
    service: 'CineFuel 6-Stage Telegram Release Ingestion Pipeline',
    endpoint: '/api/telegram/ingest',
    supportedFormats: [
      'Bare HubCloud Link(s)',
      'Full Forwarded Channel Posts',
      'Direct Document / Video Uploads (Truncation-Resilient)',
    ],
  });
}
