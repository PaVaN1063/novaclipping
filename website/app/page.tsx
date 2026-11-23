import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { IconCalendar, IconInstagram, IconPlay, IconScissors, IconUpload, NovaMark } from '@/components/Icons';

const preview = [
  { title: 'clutch_1v4_ranked.mp4', when: 'Sat 21 Nov · 6:00 PM', where: 'YouTube + IG' },
  { title: 'insane_flick_shot.mp4', when: 'Sat 21 Nov · 9:00 PM', where: 'YouTube + IG' },
  { title: 'last_second_defuse.mp4', when: 'Sun 22 Nov · 12:00 AM', where: 'YouTube' },
  { title: 'funny_fail_compilation.mp4', when: 'Draft · Private', where: 'YouTube' },
];

const features = [
  { icon: <IconUpload size={28} />, title: 'Many videos, one drop', text: 'Drag in a folder of clips. Set titles, captions and tags once for the whole batch, then tweak any single clip.' },
  { icon: <IconCalendar size={28} />, title: 'Draft or schedule', text: 'Park everything as private drafts in YouTube Studio, or space the batch out — one clip every few hours, automatically.' },
  { icon: <IconInstagram size={28} />, title: 'YouTube + Instagram', text: 'Send the same clip to Shorts and Reels, with a caption for each platform. The watermark stays your channel name.' },
  { icon: <IconScissors size={28} />, title: 'Nova Studio', text: 'Turn long gameplay into vertical clips, then push them straight into a batch. Studio comes online with the cloud server.' },
];

const steps = [
  { n: '01', title: 'Connect your channels', text: 'Sign in with Google for YouTube and with your Instagram professional account.' },
  { n: '02', title: 'Drop your clips', text: 'Upload from your laptop or pull finished clips from Studio. Fill details once for the batch.' },
  { n: '03', title: 'Draft or schedule, then go', text: 'Pick drafts or a start time and a gap between posts. Track everything on the schedule.' },
];

export default function Home() {
  return (
    <div className="container">
      <header className="site-header">
        <Link href="/" className="brand">
          <NovaMark size={28} />
          <span>Nova Clipping</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link href="/studio">Studio</Link>
          <ThemeToggle />
          <Link href="/dashboard" className="btn btn-primary">Open dashboard</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="pill">Part of the Nova family</span>
          <h1 className="display">Clip it. Batch it.<br />Ship it everywhere.</h1>
          <p>Drop a whole batch of clips and send them to YouTube and Instagram in one go — keep them as drafts, or give each one its own time slot.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/upload" className="btn btn-primary btn-lg"><IconUpload /> Upload clips</Link>
            <Link href="/studio" className="btn btn-ghost btn-lg">Open Studio</Link>
          </div>
        </div>

        <div className="hero-card card" style={{ padding: 20, gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="display" style={{ fontWeight: 600, color: 'var(--heading)' }}>Batch · 6 clips</span>
            <span style={{ fontSize: 13, color: 'var(--ok)' }}>Ready to send</span>
          </div>
          {preview.map((p) => (
            <div className="row-item" key={p.title}>
              <div className="thumb"><IconPlay /></div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</span>
                <span className="muted" style={{ fontSize: 13 }}>{p.when}</span>
              </div>
              <span className="chip">{p.where}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="section">
        <h2 className="display">Built for posting in bulk</h2>
        <div className="grid-auto">
          {features.map((f) => (
            <div className="card feature" key={f.title} style={{ padding: 28 }}>
              <span style={{ color: 'var(--accent)' }}>{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="section">
        <h2 className="display">How it works</h2>
        <div className="grid-auto">
          {steps.map((s) => (
            <div className="step" key={s.n}>
              <span className="step-num">{s.n}</span>
              <h3 style={{ fontSize: 20 }}>{s.title}</h3>
              <p className="body">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '40px 0 72px' }}>
        <div className="card cta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '1 1 360px' }}>
            <h2 className="display" style={{ fontSize: 34 }}>Your next batch is one drop away.</h2>
            <p className="body">Free to use. Your clips upload straight from your browser to the platform.</p>
          </div>
          <Link href="/dashboard" className="btn btn-primary btn-lg">Open dashboard</Link>
        </div>
      </section>

      <footer className="site-footer">
        <span>Nova Clipping · part of the Nova family</span>
        <span>novaclipping.netlify.app</span>
      </footer>
    </div>
  );
}
