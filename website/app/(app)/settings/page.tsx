import { headers } from 'next/headers';
import AiSettings from '@/components/AiSettings';
import AutopilotSettings from '@/components/AutopilotSettings';
import InstagramSettings from '@/components/InstagramSettings';
import LinkKeySettings from '@/components/LinkKeySettings';
import YoutubeSettings from '@/components/YoutubeSettings';
import { INBOX_DIR, readDb } from '@/lib/store';
import { redirectUri } from '@/lib/youtube';
import { DEFAULT_STUDIO_URL } from '@/lib/studio';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ yt?: string; msg?: string }> }) {
  const { yt, msg } = await searchParams;
  const h = await headers();
  const origin = (process.env.APP_URL || `${h.get('x-forwarded-proto') || 'http'}://${h.get('host') || 'localhost:3000'}`).replace(/\/+$/, '');
  const db = await readDb();
  const s = db.secrets.youtube;

  return (
    <>
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display">Settings</h1>
          <p className="muted">Connect the channels Nova Clipping posts to.</p>
        </div>
      </div>

      {yt === 'connected' ? <div className="banner banner-ok" role="status">YouTube is connected. Waiting clips will start uploading within a minute.</div> : null}
      {yt === 'error' ? <div className="banner banner-warn" role="alert">{msg || 'Could not connect YouTube.'}</div> : null}
      {yt === 'nokeys' ? <div className="banner banner-warn" role="alert">Save your Client ID and secret first.</div> : null}

      <div className="cols" style={{ gap: 24 }}>
        <div className="col-2">
          <YoutubeSettings
            clientId={s.clientId || ''}
            hasSecret={!!s.clientSecret}
            connected={db.connections.youtube.connected}
            account={db.connections.youtube.account}
            redirect={redirectUri(origin)}
          />
        </div>

        <section className="card col-1" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>Get your Google keys (free)</h2>
          <ol className="body" style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project called <strong>Nova Clipping</strong>.</li>
            <li>Turn on the <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">YouTube Data API v3</a>.</li>
            <li>Under <strong>Google Auth Platform</strong> (OAuth consent screen): choose <strong>External</strong>, fill in the app name and your email, and add your own Gmail under <strong>Test users</strong>.</li>
            <li>Under <strong>Clients</strong>: create a <strong>Web application</strong> client and paste the redirect URI from this page.</li>
            <li>Copy the Client ID and secret into this page, save, then press <strong>Connect YouTube</strong>.</li>
          </ol>
          <p className="hint">While the Google app is in “Testing”, Google may ask you to reconnect about once a week.</p>
        </section>
      </div>

      <div id="ai">
        <AiSettings hasKey={!!db.secrets.gemini.apiKey} model={db.secrets.gemini.model || ''} />
      </div>

      <div id="studio-link">
        <LinkKeySettings linkKey={db.prefs.linkKey || ''} seenAt={db.prefs.studioSeenAt || null} studioUrl={db.prefs.studioUrl || DEFAULT_STUDIO_URL} />
      </div>

      <div id="autopilot">
        <AutopilotSettings
          enabled={db.autopilot.enabled}
          platforms={db.autopilot.platforms}
          mode={db.autopilot.mode}
          gapHours={db.autopilot.gapHours}
          caption={db.autopilot.caption}
          deleteAfterPost={db.prefs.deleteAfterPost}
          inbox={INBOX_DIR}
          aiReady={!!db.secrets.gemini.apiKey}
        />
      </div>

      <div id="instagram" className="cols" style={{ gap: 24 }}>
        <div className="col-2">
          <InstagramSettings
            connected={db.connections.instagram.connected}
            account={db.connections.instagram.account}
            publicUrl={db.prefs.publicUrl || ''}
            expiresAt={db.secrets.instagram.expiresAt}
          />
        </div>
        <section className="card col-1" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>Get your Instagram token (free)</h2>
          <ol className="body" style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <li>Make sure your Instagram is a <strong>Professional</strong> account (Creator or Business) — Instagram app → Settings → Account type.</li>
            <li>Open <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers</a> and create an app with the <strong>Instagram</strong> use case (“Manage messaging &amp; content on Instagram”).</li>
            <li>In <strong>API setup with Instagram login</strong>, add your Instagram account (and accept the tester invite in Instagram if asked).</li>
            <li>Click <strong>Generate token</strong> next to your account, log in, allow access, and copy the token into this page.</li>
            <li>Run <code>start-tunnel.bat</code> and save the https address it prints as the public address.</li>
          </ol>
          <p className="hint">Instagram limits how many posts an app can publish per day; Nova keeps the rest queued.</p>
        </section>
      </div>
    </>
  );
}
