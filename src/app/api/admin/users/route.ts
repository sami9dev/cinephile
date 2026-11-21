import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { deleteUserFromDatabase } from '@/lib/usersDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    const { data, count, error } = await supabase
      .from('users')
      .select('id, uid, firebase_uid, email, name, display_name, role, status, created_at, last_login_at, telegram_chat_id, telegram_username', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const users = (data || []).map((u: any) => ({
      id: u.id,
      uid: u.uid || u.firebase_uid,
      email: u.email,
      name: u.name || u.display_name || u.email?.split('@')[0] || 'User',
      role: u.role || 'member',
      status: u.status || 'active',
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
      telegramUsername: u.telegram_username || null,
      telegramChatId: u.telegram_chat_id || null,
    }));

    return NextResponse.json({
      success: true,
      users,
      total: count ?? users.length,
    });
  } catch (error: any) {
    console.error('API /api/admin/users GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { uid, role, status } = body;

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (role) updates.role = role;
    if (status) updates.status = status;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .or(`uid.eq.${uid},firebase_uid.eq.${uid}`)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error: any) {
    console.error('API /api/admin/users PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { uid } = body;
    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    const ok = await deleteUserFromDatabase(uid);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    console.error('API /api/admin/users DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
