import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security';
import {
  validateAdminAuth,
  createAdminSessionToken,
} from '@/lib/adminAuth';
import { verifyFirebaseIdToken } from '@/lib/firebaseTokenVerifier';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/auth
 * Validates the currently supplied admin token.
 */
export async function GET(req: NextRequest) {
  try {
    const isAuthorized = await validateAdminAuth(req);
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, authenticated: false, error: 'Unauthorized: invalid or expired admin credentials' },
        { status: 401 }
      );
    }
    return NextResponse.json({
      success: true,
      authenticated: true,
      role: 'admin',
    });
  } catch (error: any) {
    console.error('API /api/admin/auth GET error:', error);
    return NextResponse.json(
      { success: false, authenticated: false, error: 'Authentication service error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/auth
 * Authenticates administrator via:
 * 1. Admin username & password (verified strictly on the server against server env)
 * 2. Firebase ID token (with admin custom claim or authorized email)
 *
 * Issues a cryptographically signed HMAC admin session token upon success.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password, idToken } = body;

    // 1. Firebase ID Token Login
    if (idToken && typeof idToken === 'string') {
      try {
        const claims = await verifyFirebaseIdToken(idToken);
        const configuredAdminEmails = (getEnv('ADMIN_EMAILS') || getEnv('ADMIN_EMAIL') || '')
          .toLowerCase()
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean);

        const isAdmin =
          claims.rawClaims?.admin === true ||
          (claims.email && configuredAdminEmails.includes(claims.email.toLowerCase()));

        if (!isAdmin) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Account does not have administrator privileges' },
            { status: 403 }
          );
        }

        const sessionToken = await createAdminSessionToken(claims.email || claims.firebaseUid);
        return NextResponse.json({
          success: true,
          token: sessionToken,
          user: {
            identifier: claims.email || claims.firebaseUid,
            role: 'admin',
          },
        });
      } catch (tokenErr: any) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid Firebase ID token', details: tokenErr.message },
          { status: 401 }
        );
      }
    }

    // 2. Admin Username & Password Login
    if (username && password) {
      const cleanUser = String(username).trim().toLowerCase();
      const cleanPass = String(password).trim();

      const expectedUser = (getEnv('ADMIN_USER') || getEnv('ADMIN_USERNAME') || '').trim().toLowerCase();
      const configuredPass = (getEnv('ADMIN_SECRET_KEY') || getEnv('ADMIN_PASSWORD') || '').trim();

      if (!expectedUser || !configuredPass) {
        return NextResponse.json(
          { success: false, error: 'Administrator credentials are not configured on the server' },
          { status: 500 }
        );
      }

      const isUserMatch = timingSafeEqualStrings(cleanUser, expectedUser);
      const isPassMatch = timingSafeEqualStrings(cleanPass, configuredPass);

      if (isUserMatch && isPassMatch) {
        const sessionToken = await createAdminSessionToken(cleanUser);
        return NextResponse.json({
          success: true,
          token: sessionToken,
          user: {
            identifier: cleanUser,
            role: 'admin',
          },
        });
      }

      return NextResponse.json(
        { success: false, error: 'Invalid administrator username or password' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Username and password or Firebase ID token required' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('API /api/admin/auth POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal authentication error' },
      { status: 500 }
    );
  }
}
