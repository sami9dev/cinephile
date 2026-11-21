import { NextRequest } from 'next/server';
import { POST as authPost } from '../route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/login
 * Alias to POST /api/admin/auth
 */
export async function POST(req: NextRequest) {
  return authPost(req);
}
