import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/lib/adminAuth';
import { getAllReports, getReportById, updateReportStatus, deleteReport } from '@/lib/reportsDb';
import { dualWriteSaveLink } from '@/lib/dualWrite';
import {
  createReportNotification,
  createReportInProgressNotification,
  createAdminReplyNotification,
} from '@/lib/notificationsDb';
import {
  dispatchTelegramNotificationForReport,
  dispatchTelegramAdminReply,
} from '@/lib/telegramNotifications';

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

    const result = await getAllReports(status, { page, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('API /api/admin/reports GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await validateAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { id, status, adminComment, replacementLink } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    // If a replacement link is provided when fixing the report, save it to the DB
    if (replacementLink && typeof replacementLink === 'object' && replacementLink.url) {
      await dualWriteSaveLink(replacementLink).catch((e) => {
        console.warn('Failed to auto-save replacement link:', e.message);
      });
    }

    const reportStatus = status === 'dismissed' ? 'dismissed' : status === 'fixed' ? 'fixed' : status === 'in_progress' ? 'in_progress' : 'pending';
    const ok = await updateReportStatus(id, reportStatus, {
      adminNote: adminComment,
      replacementUrl: replacementLink?.url,
    });

    if (!ok) {
      return NextResponse.json({ error: 'Report not found or failed to update' }, { status: 404 });
    }

    const updated = await getReportById(id);
    if (!updated) {
      return NextResponse.json({ success: true });
    }

    if (reportStatus === 'fixed' || reportStatus === 'dismissed') {
      const notifRes = await createReportNotification(updated, reportStatus).catch(() => null);
      if (notifRes?.notification) {
        await dispatchTelegramNotificationForReport(updated, reportStatus, notifRes.notification).catch(() => {});
      }
    } else if (reportStatus === 'in_progress') {
      await createReportInProgressNotification(updated).catch(() => {});
    }

    if (adminComment) {
      await createAdminReplyNotification(
        'report',
        updated,
        adminComment,
        'master-admin'
      ).catch(() => {});

      await dispatchTelegramAdminReply(
        updated,
        'report',
        adminComment
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, report: updated });
  } catch (error: any) {
    console.error('API /api/admin/reports PATCH error:', error);
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

    const ok = await deleteReport(id);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    console.error('API /api/admin/reports DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
