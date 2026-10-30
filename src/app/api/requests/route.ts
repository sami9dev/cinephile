import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ error: 'Requests feature has been disabled', requests: [] }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Requests feature has been disabled' }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Requests feature has been disabled' }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Requests feature has been disabled' }, { status: 404 });
}
