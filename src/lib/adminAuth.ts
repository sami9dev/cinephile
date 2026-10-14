import { NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security';
import { extractBearerToken, verifyFirebaseIdToken } from '@/lib/firebaseTokenVerifier';

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Derives the server-side signing secret for admin session tokens.
 * NEVER exposed to client.
 */
function getAdminTokenSecret(): string {
  const secret =
    getEnv('ADMIN_SESSION_SECRET') ||
    getEnv('ADMIN_SECRET_KEY') ||
    getEnv('ADMIN_PASSWORD') ||
    getEnv('AUTH_SECRET');

  if (!secret) {
    throw new Error('Server configuration error: ADMIN_SESSION_SECRET or ADMIN_SECRET_KEY is required for admin session security');
  }
  return secret;
}

/**
 * Base64URL helper
 */
function toBase64Url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

/**
 * Creates a cryptographically signed HMAC-SHA256 admin session token.
 * Compatible with Edge runtime, Cloudflare Workers, and Node.js Web Crypto API.
 */
export async function createAdminSessionToken(userIdentifier: string = 'master-admin'): Promise<string> {
  const payload = {
    sub: userIdentifier,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const secret = getAdminTokenSecret();
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigBytes = new Uint8Array(sigBuffer);
  let binary = '';
  for (let i = 0; i < sigBytes.length; i++) {
    binary += String.fromCharCode(sigBytes[i]);
  }
  const sigB64 = toBase64Url(binary);

  return `${payloadB64}.${sigB64}`;
}

/**
 * Cryptographically verifies an admin session token.
 */
export async function verifyAdminSessionToken(token: string): Promise<{ valid: boolean; subject?: string }> {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.trim().split('.');
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, sigB64] = parts;
  try {
    const secret = getAdminTokenSecret();
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    const binary = fromBase64Url(sigB64);
    const sigBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      sigBytes[i] = binary.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64));
    if (!isValid) return { valid: false };

    const payload = JSON.parse(fromBase64Url(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || typeof payload.exp !== 'number' || now > payload.exp) {
      return { valid: false };
    }

    if (payload.role !== 'admin') {
      return { valid: false };
    }

    return { valid: true, subject: payload.sub };
  } catch {
    return { valid: false };
  }
}

/**
 * Checks if a given email is listed in the authorized admin emails environment variable.
 */
function isAuthorizedAdminEmail(email?: string): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  const configured = getEnv('ADMIN_EMAILS') || getEnv('ADMIN_EMAIL') || '';
  if (!configured) return false;

  const adminList = configured
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  return adminList.includes(cleanEmail);
}

/**
 * Validates whether the incoming request is authorized to perform admin mutations.
 *
 * Supported verification methods:
 * 1. Server-signed HMAC admin session token (from `Authorization: Bearer <token>` or `x-admin-key: <token>`)
 * 2. Firebase ID token with custom claim `admin === true` or verified email in `ADMIN_EMAILS`
 * 3. Server-to-server secret key matching `ADMIN_SECRET_KEY` / `ADMIN_PASSWORD` via timing-safe comparison
 *
 * Strictly rejects:
 * - Missing or invalid credentials
 * - Hardcoded fallback passwords
 * - Non-admin users
 */
export async function validateAdminAuth(req: NextRequest | Request): Promise<boolean> {
  const headerKey = req.headers.get('x-admin-key');
  const bearerToken = extractBearerToken(req);
  const providedToken = (bearerToken || headerKey || '').trim();

  if (!providedToken) {
    return false;
  }

  // 1. Check Server-to-Server Admin Secret Key (Timing-safe comparison)
  const configuredSecret = (getEnv('ADMIN_SECRET_KEY') || getEnv('ADMIN_PASSWORD') || '').trim();
  if (configuredSecret && timingSafeEqualStrings(providedToken, configuredSecret)) {
    return true;
  }

  // 2. Check HMAC-signed Admin Session Token (issued by /api/admin/auth)
  if (providedToken.includes('.') && providedToken.split('.').length === 2) {
    const sessionRes = await verifyAdminSessionToken(providedToken);
    if (sessionRes.valid) {
      return true;
    }
  }

  // 3. Check Firebase ID Token (Bearer RS256 with Google JWKS verification)
  if (providedToken.includes('.') && providedToken.split('.').length === 3) {
    try {
      const claims = await verifyFirebaseIdToken(providedToken);
      // Verify admin role via custom claim OR verified authorized admin email
      if (claims.rawClaims?.admin === true || isAuthorizedAdminEmail(claims.email)) {
        return true;
      }
    } catch {
      // Invalid Firebase token signature or expired
    }
  }

  return false;
}
