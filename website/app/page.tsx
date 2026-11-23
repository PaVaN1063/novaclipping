import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { IconCalendar, IconInstagram, IconPlay, IconScissors, NovaMark } from '@/components/Icons';

const preview = [
  { title: '1v4 clutch on Haven', score: 94, where: 'Auto-posted · YouTube' },
  { title: 'Last-second defuse', score: 86, where: 'Confirm to post' },
  { title: 'Insane flick shot', score: 72, where: 'Confirm to post' },
  { title: 'Funny fail compilation', score: 58, where: 'Waiting for approval' },
];

const features = [
  { icon: <IconScissors size={28} />, title: 'Long video in, clips out', text: 'Paste a YouTube or Twitch link or upload a video. Nova finds the best moments and cuts vertical clips with captions and your watermark.' },
  { icon: <IconPlay size={28} />, title: 'Viral score on every clip', text: 'Each clip gets a score out of 100 when it’s made, plus a “now” score that cools off the longer it waits.' },
  { icon: <IconCalendar size={28} />, title: 'Posts itself, asks when unsure', text: '90+ goes out by itself and emails you. 70–89 asks for one tap. 50–69 waits for your approval. Under 50 stays on hold.' },
  { icon: <IconInstagram size={28} />, title: 'YouTube + Instagram', text: 'Full-quality originals go to Shorts and Reels at spaced-out times. You watch light previews; downloads keep full quality.' },
];

const steps = [
  { n: '01', title: 'Sign in and connect', text: 'Sign in with Google, then connect YouTube and Instagram once in Settings.' },
  { n: '02', title: 'Start a project', text: 'Name it (Gaming, Movies…), give it a link or a video. Up to three projects clip at the same time.' },
  { n: '03', title: 'Let it run', text: 'Clips land in your library with their scores. Approve, schedule or let 90+ go out on their own.' },
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
          <Link href="/login" className="btn btn-primary">Sign in</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="pill">Part of the Nova family</span>
          <h1 className="display">Long videos in.<br />Viral clips out.</h1>
          <p>Nova Clipping cuts your gameplay into short clips, scores how viral each one can go, and posts the best to YouTube and Instagram — by itself, or with one tap from you.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/studio" className="btn btn-primary btn-lg"><IconScissors /> Open Studio</Link>
            <Link href="/dashboard" className="btn btn-ghost btn-lg">Dashboard</Link>
          </div>
        </div>

        <div className="hero-card card" style={{ padding: 20, gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="display" style={{ fontWeight: 600, color: 'var(--heading)' }}>Gaming · 4 new clips</span>
            <span style={{ fontSize: 13, color: 'var(--ok)' }}>Clipped</span>
          </div>
          {preview.map((p) => (
            <div className="row-item" key={p.title}>
              <div className="thumb"><IconPlay /></div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</span>
                <span className="muted" style={{ fontSize: 13 }}>{p.where}</span>
              </div>
              <span className={`chip ${p.score >= 90 ? 'chip-ok' : p.score >= 70 ? 'chip-accent' : 'chip-warn'}`}>{p.score}/100</span>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="section">
        <h2 className="display">From one video to a week of posts</h2>
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
            <h2 className="display" style={{ fontSize: 34 }}>Your next viral clip is in a video you already have.</h2>
            <p className="body">Private to you: sign in with Google. Clipping and your keys stay on your own server.</p>
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
