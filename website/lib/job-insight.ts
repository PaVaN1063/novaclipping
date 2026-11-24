// Reads the clipping engine's log lines and turns them into steps, a real
// progress number, an estimate, and a cleaned log that is safe to show.

export type StepState = 'waiting' | 'active' | 'done' | 'failed';
export type Step = { key: string; label: string; state: StepState; detail: string | null; percent: number | null };
export type Insight = { progress: number; stage: string; steps: Step[]; etaSeconds: number | null };

const has = (text: string, re: RegExp) => re.test(text);
function lastMatch(lines: string[], re: RegExp): RegExpMatchArray | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(re);
    if (m) return m;
  }
  return null;
}

export function readLogs(logs: string[], status: string, fromUpload: boolean, targetClips: number): Insight {
  const text = logs.join('\n');
  const failed = status === 'failed' || status === 'error';
  const finished = status === 'completed' || status === 'done';

  const dlStart = fromUpload || has(text, /Downloading video|Download attempt|Downloading webpage/i);
  const dlDone = fromUpload || has(text, /Video downloaded|Download succeeded|Transcribing|Analyzing with/i);
  const listenStart = has(text, /Transcribing|Using the transcript|transcript.*cache/i);
  const tr = lastMatch(logs, /Transcribing… (\d+)% \((\d+)s\)/);
  const listenPct = tr ? Number(tr[1]) : null;
  const listenDone = has(text, /Analyzing with|Detected language|Using the transcript/i);
  const findStart = has(text, /Analyzing with/i);
  const found = lastMatch(logs, /Found (\d+) clips!/);
  const total = found ? Number(found[1]) : 0;
  const findDone = !!found || has(text, /Processing Clip \d+|Processing clip:/);
  const ready = (text.match(/Clip \d+ ready/g) || []).length;
  const busyGemini = lastMatch(logs, /(Gemini|Groq).*(busy|transient error|503|high demand)/i);
  const switched = lastMatch(logs, /switching to (\w+) ([\w./:-]+)/);
  const waitingAi = lastMatch(logs, /All AI services are busy — trying again in (\d+)s \(waited (\d+) of (\d+) min\)/);
  const answered = lastMatch(logs, /AI answered: (\w+) ([\w./:-]+)/);
  const groqAsr = has(text, /Listening with Groq Whisper/);
  const groqAsrOk = lastMatch(logs, /\[ASR\] Groq ok: \d+ segments in (\d+)s/);
  const groqAsrOff = has(text, /Groq transcription not used|Groq returned no speech/);
  // Which of the waiting/switching/answered lines came last decides the note.
  const lastIdx = (re: RegExp) => { for (let i = logs.length - 1; i >= 0; i--) if (re.test(logs[i])) return i; return -1; };
  const iWait = lastIdx(/All AI services are busy/), iSwitch = lastIdx(/switching to \w+ /), iAns = lastIdx(/AI answered:/);
  let aiNote: string | null = null;
  if (iAns > iWait && iAns > iSwitch && answered) aiNote = `Answered by ${answered[1]} (${answered[2]})`;
  else if (iWait > iSwitch && waitingAi) aiNote = `All AI services busy — retrying in ${waitingAi[1]}s (waited ${waitingAi[2]} of ${waitingAi[3]} min)`;
  else if (switched) aiNote = `Busy — now trying ${switched[1]} ${switched[2]}`;
  else if (busyGemini) aiNote = 'AI busy, retrying…';

  const steps: Step[] = [];
  const st = (done: boolean, started: boolean): StepState =>
    done ? 'done' : started ? (failed ? 'failed' : 'active') : 'waiting';

  steps.push({ key: 'download', label: fromUpload ? 'Video received' : 'Downloading the video', state: st(dlDone, dlStart), detail: null, percent: null });
  const via = groqAsrOk ? `with Groq in ${fmt(Number(groqAsrOk[1]))}` : groqAsr && !groqAsrOff ? 'with Groq (fast)' : groqAsrOff ? 'on the VM (Groq not available)' : null;
  steps.push({ key: 'listen', label: 'Listening to the speech', state: st(listenDone, listenStart || groqAsr), percent: listenDone ? 100 : listenPct,
    detail: [tr && !listenDone ? `${tr[1]}% after ${fmt(Number(tr[2]))}` : null, via].filter(Boolean).join(' · ') || null });
  steps.push({ key: 'find', label: 'Finding viral moments (AI)', state: st(findDone, findStart), percent: null,
    detail: findDone && total ? `${total} clips picked${answered ? ` · by ${answered[1]}` : ''}` : aiNote });
  const of = total || targetClips || 0;
  steps.push({ key: 'clips', label: 'Cutting and rendering clips', state: finished ? 'done' : st(false, findDone), percent: of ? Math.round((ready / of) * 100) : null,
    detail: findDone ? `${ready} of ${of || '?'} ready` : null });
  steps.push({ key: 'finish', label: 'Previews and scores', state: finished ? 'done' : 'waiting', detail: null, percent: null });

  // Overall bar: download 2–12, listening 12–40, finding 40–55, clips 55–97.
  let progress = 2;
  let stage = 'Waiting for the clipping engine';
  let etaSeconds: number | null = null;
  if (status === 'queued') return { progress, stage, steps, etaSeconds };
  progress = 6; stage = 'Starting';
  if (dlStart) { progress = 8; stage = 'Downloading the video'; }
  if (dlDone) { progress = 12; stage = 'Listening to the speech'; }
  if (listenStart && listenPct !== null && !listenDone) {
    progress = 12 + Math.round(listenPct * 0.28);
    stage = `Listening to the speech · ${listenPct}%`;
    if (tr && listenPct > 0) etaSeconds = Math.round((Number(tr[2]) / listenPct) * (100 - listenPct));
  }
  if (findStart) {
    progress = 42;
    stage = iWait > iSwitch && iWait > iAns && waitingAi ? `Waiting for AI · retry in ${waitingAi[1]}s`
      : iSwitch > iAns && switched ? `Finding moments · using ${switched[1]}` : 'Finding viral moments';
  }
  if (findDone) {
    progress = 55 + (of ? Math.round((ready / of) * 42) : 0);
    stage = `Making clips · ${ready} of ${of || '?'} ready`;
  }
  if (finished) { progress = 100; stage = 'Done'; }
  return { progress: Math.min(progress, finished ? 100 : 97), stage, steps, etaSeconds };
}

function fmt(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// Log lines safe and useful to show: no debug noise, no links (they carry
// signed tokens), no IP addresses, no key-like strings, no transcript dump.
export function cleanLogs(logs: string[], max = 150): string[] {
  const out: string[] = [];
  for (const raw of logs) {
    let l = raw.replace(/^\s*📝\s*\[Job Output\]\s*/, '').trimEnd();
    if (!l.trim()) continue;
    if (/\[debug\]|mmco:|HF Hub|HF_TOKEN|absl::|XNNPACK|inference_feedback|matplotlib|MPLCONFIGDIR|^\s*\^+\s*$|^\s*\[\d+\.\d+s -> /.test(l)) continue;
    l = l.replace(/https?:\/\/\S+/g, '[link]')
      .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[ip]')
      .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[key]')
      .replace(/\bgsk_[0-9A-Za-z]{16,}\b/g, '[key]')
      .replace(/(key|token|secret|password|cookie)s?(["'=:\s]+)[^\s,'"}]{8,}/gi, '$1$2[hidden]');
    out.push(l.length > 400 ? l.slice(0, 400) + '…' : l);
  }
  return out.slice(-max);
}
