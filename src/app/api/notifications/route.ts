import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ count: 0, notifications: [] });
}

export async function POST() {
  return NextResponse.json({ success: true });
}
