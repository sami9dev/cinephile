import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ error: 'Reports feature has been disabled', reports: [] }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Reports feature has been disabled' }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Reports feature has been disabled' }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Reports feature has been disabled' }, { status: 404 });
}
