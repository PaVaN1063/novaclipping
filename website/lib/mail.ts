// Email from Nova Clipping (Gmail, with an app password), no extra packages:
// a tiny SMTP client over TLS to smtp.gmail.com:465.
import tls from 'tls';
import { ALLOWED_EMAILS } from './role';
import { readDb } from './store';

type Mail = { subject: string; text: string; html?: string; to?: string[] };

function smtp(user: string, pass: string, to: string[], raw: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
    const steps: string[] = [
      'EHLO nova-clipping',
      'AUTH LOGIN',
      Buffer.from(user).toString('base64'),
      Buffer.from(pass).toString('base64'),
      `MAIL FROM:<${user}>`,
      ...to.map((t) => `RCPT TO:<${t}>`),
      'DATA',
      `${raw}\r\n.`,
      'QUIT',
    ];
    let buf = '';
    let i = -1; // -1: waiting for the greeting
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('Mail server timed out')); }, 20_000);
    sock.setEncoding('utf8');
    sock.on('data', (chunk: string) => {
      buf += chunk;
      // A reply is complete when its last line has "NNN " (space after the code).
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      buf = '';
      const code = Number(last.slice(0, 3));
      if (code >= 400) {
        clearTimeout(timer);
        sock.destroy();
        return reject(new Error(code === 535 ? 'Gmail refused the app password' : `Mail error ${last}`));
      }
      i += 1;
      if (i < steps.length) sock.write(steps[i] + '\r\n');
      else { clearTimeout(timer); sock.end(); resolve(); }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

const enc = (s: string) => `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;

export async function mailReady() {
  const m = (await readDb()).secrets.mail;
  return !!(m.user && m.appPassword);
}

/** Send to both your addresses (or `to`). Returns false when mail isn't set up. */
export async function sendMail({ subject, text, html, to }: Mail): Promise<boolean> {
  const m = (await readDb()).secrets.mail;
  if (!m.user || !m.appPassword) return false;
  const rcpt = (to && to.length ? to : ALLOWED_EMAILS).filter(Boolean);
  const boundary = `nova${Date.now().toString(36)}`;
  const body = html
    ? [
        `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
        Buffer.from(text).toString('base64'),
        `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
        Buffer.from(html).toString('base64'),
        `--${boundary}--`,
      ].join('\r\n')
    : Buffer.from(text).toString('base64');
  const raw = [
    `From: ${enc('Nova Clipping')} <${m.user}>`,
    `To: ${rcpt.join(', ')}`,
    `Subject: ${enc(subject)}`,
    'MIME-Version: 1.0',
    html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : 'Content-Type: text/plain; charset=UTF-8',
    ...(html ? [] : ['Content-Transfer-Encoding: base64']),
    `Date: ${new Date().toUTCString()}`,
    '',
    body,
  ].join('\r\n');
  await smtp(m.user, m.appPassword.replace(/\s+/g, ''), rcpt, raw);
  return true;
}
