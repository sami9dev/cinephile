import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: false, error: 'User authentication has been disabled' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ success: false, error: 'User authentication has been disabled' }, { status: 404 });
}
