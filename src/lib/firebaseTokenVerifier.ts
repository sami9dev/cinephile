import { getEnv } from '@/lib/env';

export interface VerifiedFirebaseClaims {
  firebaseUid: string;
  name: string;
  email: string;
  photoURL: string | null;
  provider: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string;
  status: 'active';
  authTime?: number;
  iat: number;
  exp: number;
  rawClaims: Record<string, any>;
}

interface JWKKey {
  kty: string;
  alg?: string;
  use?: string;
  kid: string;
  n: string;
  e: string;
  [key: string]: any;
}

// In-memory Google JWKS cache for Edge / Cloudflare Workers
let cachedGoogleKeys: Record<string, JWKKey> = {};
let jwksCacheExpiresAt = 0;

// Test public JWK for automated verification in non-production environments
const TEST_PUBLIC_JWK: JWKKey = {
  key_ops: ['verify'],
  ext: true,
  alg: 'RS256',
  kty: 'RSA',
  n: 'wsBaz-0AOq5wzgUH9IGxtu6C0gPTmrBtxZ-BmAZHQ32UoXbFC0666J82BHelzjTYS-r9dbhQGtIkpeHFE42h-lCpXcMrLOkLoZ0xdM3WdW18xjKD86JjSXEZ8lPb-LqebT21xAzGQHP-rFoafOhWIJPF4USOlXV-Ew9kRrghSUtrfavFpFiaSY_LYQ5Zx2AlfwYqyBRYGTvFcKGhfOBYybYF8-EWECvSLNAlTsHRK4cqFv7kRtlpyBAStbFQKBqfcSCWj-CEiq0YBqXp2fWo_IqTrY-tLgwTlj5OIi5euUn__S1G_MF-oGcfoFXsXSdtPaAaPwkOl-ItqUizCKQUtQ',
  e: 'AQAB',
  kid: 'cinefuel-test-key-v1',
  use: 'sig',
};

// Base64URL decoders
function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeString(str: string): string {
  const bytes = base64UrlDecode(str);
  return new TextDecoder().decode(bytes);
}

/**
 * Extracts Bearer token from Request, Headers, or Authorization string
 */
export function extractBearerToken(input: any): string | null {
  if (!input) return null;
  let authHeader: string | null = null;
  if (typeof input === 'string') {
    authHeader = input;
  } else if ('headers' in input && input.headers) {
    authHeader = typeof input.headers.get === 'function' ? input.headers.get('authorization') : input.headers['authorization'];
  } else if (typeof input.get === 'function') {
    authHeader = input.get('authorization');
  }

  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (trimmed.startsWith('Bearer ')) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

/**
 * Fetches Google JWKS from official endpoint and caches with Cache-Control TTL
 */
async function getGoogleJwks(): Promise<Record<string, JWKKey>> {
  const now = Date.now();
  if (jwksCacheExpiresAt > now && Object.keys(cachedGoogleKeys).length > 0) {
    return cachedGoogleKeys;
  }

  try {
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Google JWKS: HTTP ${res.status}`);
    }

    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const ttlSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 21600; // default 6 hours
    jwksCacheExpiresAt = now + ttlSeconds * 1000;

    const data = (await res.json()) as { keys?: JWKKey[] };
    const keyMap: Record<string, JWKKey> = {};
    if (Array.isArray(data.keys)) {
      for (const k of data.keys) {
        if (k.kid) keyMap[k.kid] = k;
      }
    }
    cachedGoogleKeys = keyMap;
    return keyMap;
  } catch (err: any) {
    // If cache has old keys, return them as fallback
    if (Object.keys(cachedGoogleKeys).length > 0) {
      return cachedGoogleKeys;
    }
    throw new Error(`Google JWKS unavailable: ${err.message}`, { cause: err });
  }
}

/**
 * Verifies a Firebase ID token cryptographically and validates all claims.
 * Derives verified identity strictly from server-validated claims.
 */
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseClaims> {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing or invalid Firebase ID token');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token: must contain 3 segments');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Decode header
  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecodeString(headerB64));
  } catch {
    throw new Error('Invalid Firebase token header: malformed JSON');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Invalid token algorithm: expected RS256, got ${header.alg || 'unknown'}`);
  }

  if (!header.kid) {
    throw new Error('Invalid Firebase token header: missing key ID (kid)');
  }

  // 2. Decode payload
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(base64UrlDecodeString(payloadB64));
  } catch {
    throw new Error('Invalid Firebase token payload: malformed JSON');
  }

  // 3. Claims validation
  const appEnv = getEnv('APP_ENV', 'development');
  const projectId = getEnv('FIREBASE_PROJECT_ID') || getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || 'cinefuel-app';
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Allow test issuer only in non-production environments when using the test key
  const isTestKey = header.kid === 'cinefuel-test-key-v1' && appEnv !== 'production';

  if (!isTestKey) {
    if (payload.iss !== expectedIssuer) {
      throw new Error(`Token issuer mismatch: expected ${expectedIssuer}, received ${payload.iss}`);
    }
    if (payload.aud !== projectId) {
      throw new Error(`Token audience mismatch: expected ${projectId}, received ${payload.aud}`);
    }
  }

  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    throw new Error('Token subject (sub / UID) is missing or empty');
  }

  if (payload.sub.length > 128) {
    throw new Error('Token subject (sub / UID) exceeds maximum permitted length of 128 characters');
  }

  // Expiration check (with 30s leeway for clock drift)
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds - 30) {
    throw new Error(`Firebase ID token is expired (exp: ${payload.exp}, current: ${nowSeconds})`);
  }

  // Issued at check (with 300s leeway for clock drift)
  if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + 300) {
    throw new Error(`Firebase ID token issued in the future (iat: ${payload.iat}, current: ${nowSeconds})`);
  }

  // Auth time check
  if (payload.auth_time && (typeof payload.auth_time !== 'number' || payload.auth_time > nowSeconds + 300)) {
    throw new Error(`Firebase ID token auth_time invalid (auth_time: ${payload.auth_time}, current: ${nowSeconds})`);
  }

  // 4. Cryptographic Signature Verification
  let jwk: JWKKey | undefined;

  if (isTestKey) {
    jwk = TEST_PUBLIC_JWK;
  } else {
    const keys = await getGoogleJwks();
    jwk = keys[header.kid];
    if (!jwk) {
      // Re-fetch once in case key was recently rotated
      jwksCacheExpiresAt = 0;
      const freshKeys = await getGoogleJwks();
      jwk = freshKeys[header.kid];
    }
  }

  if (!jwk) {
    throw new Error(`No matching public key found for kid: ${header.kid}`);
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch (err: any) {
    throw new Error(`Failed to import public JWK key: ${err.message}`, { cause: err });
  }

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlDecode(signatureB64);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedData
  );

  if (!isValid) {
    throw new Error('Cryptographic signature verification failed: invalid token signature');
  }

  // 5. Derive verified identity strictly from validated claims
  const verifiedUid = payload.sub.trim();
  const rawEmail = (payload.email || '').toLowerCase().trim();
  const rawName = payload.name ? String(payload.name).trim() : '';
  const fallbackName = rawEmail ? rawEmail.split('@')[0] : 'Cinephile User';
  const verifiedName = rawName || fallbackName;
  const verifiedPhoto = payload.picture ? String(payload.picture).trim() : null;
  const verifiedProvider = payload.firebase?.sign_in_provider || 'google.com';

  const verifiedClaims: VerifiedFirebaseClaims = {
    firebaseUid: verifiedUid,
    name: verifiedName,
    email: rawEmail,
    photoURL: verifiedPhoto,
    provider: verifiedProvider,
    emailVerified: Boolean(payload.email_verified),
    createdAt: new Date((payload.auth_time || payload.iat || nowSeconds) * 1000).toISOString(),
    lastLoginAt: new Date().toISOString(),
    status: 'active',
    authTime: payload.auth_time,
    iat: payload.iat,
    exp: payload.exp,
    rawClaims: payload,
  };

  return verifiedClaims;
}
