import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security';
import {
  validateAdminAuth,
  createAdminSessionToken,
  getAdminSessionDetails,
  ADMIN_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '@/lib/adminAuth';
import { verifyFirebaseIdToken } from '@/lib/firebaseTokenVerifier';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/auth
 * Validates the currently supplied admin token (via HttpOnly cookie or Authorization header).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSessionDetails(req);
    if (!session.authorized) {
      return NextResponse.json(
        { success: false, authenticated: false, error: 'Unauthorized: invalid or expired admin credentials' },
        { status: 401 }
      );
    }
    return NextResponse.json({
      success: true,
      authenticated: true,
      role: 'admin',
      user: {
        identifier: session.subject || 'master-admin',
        role: 'admin',
      },
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
 * Sets HttpOnly Secure SameSite=Strict session cookie and returns token in response body.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password, idToken } = body;

    let userIdentifier = '';

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

        userIdentifier = claims.email || claims.firebaseUid;
      } catch (tokenErr: any) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid Firebase ID token', details: tokenErr.message },
          { status: 401 }
        );
      }
    } else if (username && password) {
      // 2. Admin Username & Password Login
      const cleanUser = String(username).trim().toLowerCase();
      const cleanPass = String(password).trim();

      const expectedUser = (getEnv('ADMIN_USER') || getEnv('ADMIN_USERNAME') || '').trim().toLowerCase();
      const configuredPass = (getEnv('ADMIN_PASSWORD') || getEnv('ADMIN_SECRET_KEY') || '').trim();

      if (!expectedUser || !configuredPass) {
        return NextResponse.json(
          { success: false, error: 'Administrator credentials are not configured on the server' },
          { status: 500 }
        );
      }

      const isUserMatch = timingSafeEqualStrings(cleanUser, expectedUser);
      const isPassMatch = timingSafeEqualStrings(cleanPass, configuredPass);

      if (!isUserMatch || !isPassMatch) {
        return NextResponse.json(
          { success: false, error: 'Invalid administrator username or password' },
          { status: 401 }
        );
      }

      userIdentifier = cleanUser;
    } else {
      return NextResponse.json(
        { success: false, error: 'Username and password or Firebase ID token required' },
        { status: 400 }
      );
    }

    // Generate cryptographic HMAC-SHA256 session token
    const sessionToken = await createAdminSessionToken(userIdentifier);

    // Build response with secure session cookie
    const response = NextResponse.json({
      success: true,
      token: sessionToken,
      user: {
        identifier: userIdentifier,
        role: 'admin',
      },
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (error: any) {
    console.error('API /api/admin/auth POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal authentication error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/auth
 * Clears the HttpOnly admin session cookie (logout).
 */
export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });

  return response;
}
