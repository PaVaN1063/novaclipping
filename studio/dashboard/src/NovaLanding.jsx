import { ArrowRight, Scissors, Captions, Stamp, Upload, Sparkles, CheckCircle2 } from 'lucide-react';

// Nova Clipping front page. Replaces the upstream marketing landing: one
// screen that says what the site does and opens the studio (#app).
const FEATURES = [
  {
    icon: Scissors,
    title: 'finds the moments',
    body: 'AI watches the whole run and cuts the strongest 15–60 second moments into 9:16 clips.',
  },
  {
    icon: Captions,
    title: 'captions and hooks',
    body: 'Word-by-word captions and a hook line on top, styled and ready for Shorts and Reels.',
  },
  {
    icon: Stamp,
    title: 'your watermark',
    body: 'Turn on the watermark when you download and your logo goes on the clip.',
  },
];

const STEPS = [
  { icon: Upload, label: 'UPLOAD', text: 'Drop a recording or paste a YouTube link.' },
  { icon: Sparkles, label: 'CLIP', text: 'Nova Clipping cuts, reframes and captions it.' },
  { icon: CheckCircle2, label: 'POST', text: 'Review, add your watermark, download or post.' },
];

export default function NovaLanding({ onLaunchApp }) {
  return (
    <div className="min-h-screen bg-paper text-ink2 flex flex-col">
      <header className="h-16 border-b border-rule flex items-center justify-between px-5 sm:px-8 sticky top-0 bg-paper/90 backdrop-blur z-20">
        <a href="#landing" className="flex items-center gap-3">
          <img src="/nova-clipping-logo.png" alt="" className="w-8 h-8 rounded-input" />
          <span className="font-display lowercase text-xl text-ink">nova clipping</span>
        </a>
        <button onClick={onLaunchApp} className="btn-primary px-4 py-2 text-sm">
          open studio <ArrowRight size={14} />
        </button>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 grid md:grid-cols-[1.2fr_1fr] gap-12 items-center">
          <div>
            <p className="eyebrow mb-5">GAMING CLIPS · 9:16 · CAPTIONED</p>
            <h1 className="font-display lowercase text-ink leading-[1.02] tracking-[-0.032em] text-5xl sm:text-6xl lg:text-7xl">
              long gaming runs in. <span className="text-coral">clips</span> out.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted max-w-xl">
              Give Nova Clipping a full playthrough. It finds the best moments, cuts them
              vertical, adds captions and a hook, and puts your watermark on before you post.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onLaunchApp} className="btn-primary px-5 py-3">
                start clipping <ArrowRight size={16} />
              </button>
            </div>
          </div>

          <div className="relative mx-auto w-56 sm:w-64">
            <div className="absolute -inset-10 rounded-full blur-3xl opacity-60" style={{ background: 'var(--color-glow)' }} aria-hidden="true" />
            <div className="relative card aspect-[9/16] overflow-hidden flex flex-col items-center justify-center gap-4 p-6">
              <img src="/nova-clipping-logo.png" alt="Nova Clipping" className="w-24 h-24 rounded-card" />
              <span className="readout">CLIP 01 · 00:42 · 1080×1920</span>
              <div className="w-full space-y-2">
                <div className="h-2 rounded-full bg-brass/70 w-4/5 mx-auto" />
                <div className="h-2 rounded-full bg-paper3 w-3/5 mx-auto" />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-rule bg-paper2">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 grid sm:grid-cols-3 gap-6">
            {STEPS.map(({ icon: Icon, label, text }, i) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-input bg-paper3 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-brass" />
                </div>
                <div>
                  <p className="readout">{String(i + 1).padStart(2, '0')} · {label}</p>
                  <p className="text-sm text-ink2 mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 grid md:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6 space-y-3">
              <div className="w-10 h-10 rounded-input bg-paper3 flex items-center justify-center">
                <Icon size={18} className="text-brass" />
              </div>
              <h2 className="font-display lowercase text-2xl text-ink">{title}</h2>
              <p className="text-sm text-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-rule px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <img src="/nova-clipping-logo.png" alt="" className="w-4 h-4 rounded" />
          nova clipping
        </span>
        <span className="readout">© {new Date().getFullYear()} NOVA CLIPPING</span>
      </footer>
    </div>
  );
}
