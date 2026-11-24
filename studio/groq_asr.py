"""Nova Clipping: speech-to-text through Groq's free Whisper API.

The VM has 2 small CPU cores, so local transcription of a 30-minute video
takes ~11 minutes; Groq does it in well under a minute. Used when a Groq
key is saved on the VM. Any problem (no key, limit reached, network) returns
None and the caller transcribes locally as before, so it can never fail a job.

Audio is sent as small mono AAC pieces of 20 minutes (~5 MB each, under the
free tier's 25 MB upload limit); timestamps are shifted back into place.
"""
import json
import os
import subprocess
import tempfile
import time

import httpx

import ai_providers

CHUNK_SECONDS = int(os.environ.get("GROQ_ASR_CHUNK_SECONDS", "1200"))
MODELS = [m.strip() for m in os.environ.get(
    "GROQ_ASR_MODELS", "whisper-large-v3-turbo,whisper-large-v3").split(",") if m.strip()]

_LANG = {
    "english": "en", "hindi": "hi", "telugu": "te", "tamil": "ta", "kannada": "kn",
    "malayalam": "ml", "marathi": "mr", "bengali": "bn", "gujarati": "gu", "punjabi": "pa",
    "urdu": "ur", "spanish": "es", "portuguese": "pt", "french": "fr", "german": "de",
    "italian": "it", "japanese": "ja", "korean": "ko", "chinese": "zh", "russian": "ru",
    "arabic": "ar", "turkish": "tr", "indonesian": "id", "dutch": "nl", "polish": "pl",
}


def _lang_code(name):
    n = (name or "").strip().lower()
    if len(n) <= 3 and n:
        return n
    return _LANG.get(n, n[:2] or "en")


def _duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
            capture_output=True, text=True, timeout=60).stdout
        return float(json.loads(out)["format"]["duration"])
    except Exception:
        return 0.0


def _cut(src, start, length, dst):
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-t", str(length), "-i", src,
         "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "32k", dst],
        check=True, timeout=600)


def _send(path, key, model):
    with open(path, "rb") as f:
        r = httpx.post(
            f"{ai_providers.GROQ_BASE}/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (os.path.basename(path), f, "audio/mp4")},
            data={"model": model, "response_format": "verbose_json", "temperature": "0",
                  "timestamp_granularities[]": ["word", "segment"]},
            timeout=300)
    if r.status_code >= 400:
        raise RuntimeError(f"Groq {r.status_code}: {r.text[:200]}")
    return r.json()


def _send_with_retry(path, key):
    last = None
    for model in MODELS:
        for attempt in range(3):
            try:
                return _send(path, key, model)
            except Exception as e:
                last = str(e)
                kind = ai_providers._classify(last)
                if kind == "dead":
                    break  # try the next Whisper model
                if attempt < 2:
                    wait = ai_providers._suggested_wait(last, 10 * (attempt + 1))
                    if wait > 90:
                        raise RuntimeError(f"Groq audio limit reached ({last[:120]})")
                    print(f"⚠️ [ASR] Groq busy, retrying in {int(wait)}s", flush=True)
                    time.sleep(wait)
    raise RuntimeError(last or "Groq transcription failed")


def transcribe(media_path):
    """Transcript in the transcribe_media shape, or None to fall back."""
    if os.environ.get("GROQ_ASR", "on").lower() in ("0", "off", "false", "no"):
        return None
    key = ai_providers.groq_key()
    if not key:
        return None
    total = _duration(media_path)
    if total <= 0:
        return None
    started = time.time()
    print("🎙️ [ASR] Listening with Groq Whisper (fast)…", flush=True)
    segments, all_text, language = [], [], None
    next_pct = 25
    try:
        with tempfile.TemporaryDirectory(prefix="groq_asr_") as tmp:
            pos = 0.0
            idx = 0
            while pos < total - 0.5:
                length = min(CHUNK_SECONDS, total - pos)
                piece = os.path.join(tmp, f"part{idx}.m4a")
                _cut(media_path, pos, length, piece)
                data = _send_with_retry(piece, key)
                language = language or data.get("language")
                words = [{"word": " " + str(w.get("word", "")).strip(),
                          "start": float(w["start"]) + pos, "end": float(w["end"]) + pos}
                         for w in (data.get("words") or []) if "start" in w]
                wi = 0
                for s in data.get("segments") or []:
                    s_start, s_end = float(s["start"]) + pos, float(s["end"]) + pos
                    seg_words = []
                    while wi < len(words) and words[wi]["start"] < s_end - 0.01:
                        if words[wi]["end"] > s_start - 0.5:
                            seg_words.append(words[wi])
                        wi += 1
                    text = str(s.get("text", "")).strip()
                    if not text:
                        continue
                    segments.append({"start": s_start, "end": s_end, "text": " " + text,
                                     "words": seg_words})
                    all_text.append(text)
                pos += length
                idx += 1
                pct = int(min(pos, total) / total * 100)
                while pct >= next_pct and next_pct <= 100:
                    print(f"🎙️ Transcribing… {next_pct}% ({int(time.time() - started)}s)", flush=True)
                    next_pct += 25
    except Exception as e:
        print(f"⚠️ [ASR] Groq transcription not used ({str(e)[:160]}) — listening on the VM instead.",
              flush=True)
        return None
    if not segments:
        print("⚠️ [ASR] Groq returned no speech — listening on the VM instead.", flush=True)
        return None
    # Segments without word timings (rare) get evenly spread words, so clip
    # cuts can still snap to word boundaries.
    for s in segments:
        if not s["words"]:
            toks = s["text"].split()
            step = (s["end"] - s["start"]) / max(1, len(toks))
            s["words"] = [{"word": " " + t, "start": s["start"] + i * step,
                           "end": s["start"] + (i + 1) * step} for i, t in enumerate(toks)]
    print(f"🎙️ [ASR] Groq ok: {len(segments)} segments in {int(time.time() - started)}s", flush=True)
    return {"text": " ".join(all_text), "language": _lang_code(language), "segments": segments}
