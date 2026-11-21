import { DELETE as authDelete } from '../route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/auth/logout
 * Clears admin session cookie.
 */
export async function POST() {
  return authDelete();
}

export async function DELETE() {
  return authDelete();
}
