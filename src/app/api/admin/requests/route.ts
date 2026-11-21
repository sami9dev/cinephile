import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getAllRequests, getRequestById, updateRequestStatus, deleteRequest } from '@/lib/requestsDb';
import {
  createRequestFulfilledNotification,
  createRequestInProgressNotification,
  createRequestRejectedNotification,
} from '@/lib/notificationsDb';
import { dispatchTelegramNotificationForRequest } from '@/lib/telegramNotifications';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const page = searchParams.get('page') ? Math.max(1, parseInt(searchParams.get('page')!, 10)) : 1;
    const limit = searchParams.get('limit') ? Math.max(1, Math.min(100, parseInt(searchParams.get('limit')!, 10))) : 50;

    const result = await getAllRequests(status, { page, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('API /api/admin/requests GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { id, status, adminComment, fulfilledLinkUrl } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const requestStatus =
      status === 'fulfilled' ? 'fulfilled' : status === 'in_progress' ? 'in_progress' : status === 'rejected' ? 'rejected' : 'pending';

    const ok = await updateRequestStatus(id, requestStatus, {
      adminNote: adminComment,
      fulfilledLinkUrl,
    });

    if (!ok) {
      return NextResponse.json({ error: 'Request not found or failed to update' }, { status: 404 });
    }

    const updated = await getRequestById(id);
    if (!updated) {
      return NextResponse.json({ success: true });
    }

    // Trigger user notification based on status
    if (requestStatus === 'fulfilled') {
      const notifRes = await createRequestFulfilledNotification(updated).catch(() => null);
      if (notifRes?.notification) {
        await dispatchTelegramNotificationForRequest(updated, notifRes.notification).catch(() => {});
      }
    } else if (requestStatus === 'in_progress') {
      const notifRes = await createRequestInProgressNotification(updated).catch(() => null);
      if (notifRes?.notification) {
        await dispatchTelegramNotificationForRequest(updated, notifRes.notification).catch(() => {});
      }
    } else if (requestStatus === 'rejected') {
      const notifRes = await createRequestRejectedNotification(updated).catch(() => null);
      if (notifRes?.notification) {
        await dispatchTelegramNotificationForRequest(updated, notifRes.notification).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, request: updated });
  } catch (error: any) {
    console.error('API /api/admin/requests PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const ok = await deleteRequest(id);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    console.error('API /api/admin/requests DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
