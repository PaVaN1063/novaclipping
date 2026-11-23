import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Used to check that the public address reaches this site.
export function GET() {
  return NextResponse.json({ ok: true, app: 'nova-clipping' });
}
