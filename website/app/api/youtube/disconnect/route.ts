import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { disconnect } from '@/lib/youtube';

export async function POST() {
  if (!(await currentUser())) return unauthorized();
  await disconnect();
  return NextResponse.json({ ok: true });
}
