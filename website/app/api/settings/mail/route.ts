import { NextResponse } from 'next/server';
import { badRequest, currentUser, unauthorized } from '@/lib/auth';
import { sendMail } from '@/lib/mail';
import { updateDb } from '@/lib/store';

// Gmail for Nova Clipping's emails: the address and an app password. The
// password stays on the VM; the page only ever learns whether it is set.
export async function POST(req: Request) {
  if (!(await currentUser())) return unauthorized();
  const b = (await req.json().catch(() => null)) as { user?: string; appPassword?: string; test?: boolean; remove?: boolean } | null;
  if (!b) return badRequest('Bad request.');
  if (b.remove) {
    await updateDb((d) => { d.secrets.mail = { user: null, appPassword: null, savedAt: null }; });
    return NextResponse.json({ ok: true });
  }
  if (b.user !== undefined || b.appPassword !== undefined) {
    const user = (b.user || '').trim().toLowerCase();
    const pass = (b.appPassword || '').replace(/\s+/g, '');
    if (!/^[^@\s]+@gmail\.com$/.test(user)) return badRequest('Use a Gmail address.');
    if (pass && pass.length !== 16) return badRequest('A Gmail app password has 16 letters.');
    await updateDb((d) => {
      d.secrets.mail.user = user;
      if (pass) d.secrets.mail.appPassword = pass;
      d.secrets.mail.savedAt = new Date().toISOString();
    });
  }
  if (b.test) {
    try {
      const sent = await sendMail({ subject: 'Nova Clipping email works', text: 'This is a test from Nova Clipping. Alerts about posts and storage will come like this.' });
      if (!sent) return badRequest('Save the Gmail address and app password first.');
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : 'Could not send.');
    }
  }
  return NextResponse.json({ ok: true });
}
