import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/auth';
import { readDb, withoutSecrets } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The website's pages read their data here (keys are left out).
export async function GET() {
  const user = await currentUser();
  if (!user || user.user === 'studio') return unauthorized();
  return NextResponse.json(withoutSecrets(await readDb()));
}
