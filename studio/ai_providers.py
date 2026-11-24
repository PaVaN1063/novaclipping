"""Nova Clipping: the AI step must not fail because one service is busy.

``run_json_stage`` asks for one schema-shaped JSON answer and keeps going until
it gets one:

1. Gemini, starting with the configured model, then the other Gemini text
   models this API key can actually use (asked from Google, so a retired
   model is never tried).
2. Groq (free, OpenAI-compatible), when a Groq key is saved on the VM.
3. If every service is busy, it waits (30 s, 1, 2, 4, then 5 min) and goes
   round again, printing a line each time so the website sees it is alive.
   Only after ``AI_WAIT_MAX_SECONDS`` (default 1 h) does it give up.

Every call has a time limit, so a hung request can never stall a job.
Keys come from the environment or from files the website saved on the VM
(``NOVA_SECRETS_DIR``, default ``YT_COOKIES_DIR``): ``groq-key.txt``.
Keys are never printed.
"""
import concurrent.futures
import os
import re
import time

import httpx

GROQ_BASE = "https://api.groq.com/openai/v1"
CALL_TIMEOUT = float(os.environ.get("AI_CALL_TIMEOUT_SECONDS", "90"))
WAIT_MAX = float(os.environ.get("AI_WAIT_MAX_SECONDS", "3600"))

# Preference order when picking from the models a key offers.
_GEMINI_PREFS = [
    r"^gemini-flash-latest$", r"^gemini-[\d.]+-flash$", r"^gemini-[\d.]+-flash-preview",
    r"^gemini-flash-lite-latest$", r"^gemini-[\d.]+-flash-lite$", r"^gemini-[\d.]+-flash-lite-preview",
]
_GEMINI_FALLBACK = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"]
_GROQ_PREFS = [
    r"gpt-oss-120b", r"llama-3\.3-70b", r"llama-4-maverick", r"kimi-k2", r"qwen3-32b",
    r"llama-4-scout", r"gpt-oss-20b", r"llama-3\.1-8b",
]
_GROQ_SKIP = re.compile(r"whisper|guard|tts|playai|orpheus|distil|compound|prompt-guard|safeguard", re.I)


class TooLarge(Exception):
    """The request is bigger than the service accepts; split it."""


class AllBusy(Exception):
    pass


def _secrets_dir():
    return (os.environ.get("NOVA_SECRETS_DIR") or os.environ.get("YT_COOKIES_DIR") or "").strip()


def _read_secret(name):
    d = _secrets_dir()
    if not d:
        return ""
    try:
        with open(os.path.join(d, name), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def groq_key():
    return (os.environ.get("GROQ_API_KEY") or "").strip() or _read_secret("groq-key.txt")


def gemini_key():
    return (os.environ.get("GEMINI_API_KEY") or "").strip()


def _ranked(names, prefs, first=None):
    out = []
    if first and first in names:
        out.append(first)
    for pat in prefs:
        for n in sorted(names, reverse=True):
            if re.search(pat, n) and n not in out:
                out.append(n)
    return out


_gemini_models_cache = None


def gemini_models(client, configured):
    """The configured model first, then other Gemini flash models this key
    can use for generateContent, best first. Falls back to a short static
    list if Google cannot be asked."""
    global _gemini_models_cache
    if _gemini_models_cache is None:
        names = []
        try:
            for m in _with_timeout(lambda: list(client.models.list()), 25):
                name = (getattr(m, "name", "") or "").split("/")[-1]
                actions = getattr(m, "supported_actions", None) or []
                if name.startswith("gemini-") and (not actions or "generateContent" in actions) \
                        and not re.search(r"image|tts|audio|live|embedding|vision|robotics|computer", name):
                    names.append(name)
        except Exception as e:
            print(f"⚠️ Could not list Gemini models ({type(e).__name__}); using the default list.")
        _gemini_models_cache = _ranked(names, _GEMINI_PREFS) if names else []
    out = [configured] if configured else []
    for n in _gemini_models_cache or _GEMINI_FALLBACK:
        if n not in out:
            out.append(n)
    return out[:4]


_groq_models_cache = None


def groq_models(key):
    global _groq_models_cache
    if _groq_models_cache is None:
        names = []
        try:
            r = httpx.get(f"{GROQ_BASE}/models", headers={"Authorization": f"Bearer {key}"}, timeout=20)
            if r.status_code == 200:
                names = [m.get("id", "") for m in r.json().get("data", [])
                         if m.get("active", True) and not _GROQ_SKIP.search(m.get("id", ""))]
            else:
                print(f"⚠️ Groq model list answered {r.status_code}.")
        except Exception as e:
            print(f"⚠️ Could not reach Groq ({type(e).__name__}).")
        _groq_models_cache = _ranked(names, _GROQ_PREFS)[:3]
    return list(_groq_models_cache)


def _classify(msg):
    """'dead' (never retry this model), 'large' (split), 'busy' (try later)."""
    m = msg.lower()
    tpm = re.search(r"limit (\d+), used (\d+), requested (\d+)", m)
    if tpm:  # Groq per-minute budget: too big for it at all, or just wait a bit
        return "large" if int(tpm.group(3)) > int(tpm.group(1)) else "busy"
    if re.search(r"\b413\b", m) or any(t in m for t in (
            "request too large", "context_length", "context length", "maximum context",
            "reduce the length", "too many tokens")):
        return "large"
    if re.search(r"\b(404|403|401)\b", m) or any(t in m for t in (
            "not_found", "not found", "no longer available", "decommissioned", "does not exist",
            "model_not_found", "permission_denied", "api key not valid", "invalid api key",
            "unauthenticated")):
        return "dead"
    return "busy"


def _suggested_wait(msg, default):
    m = re.search(r"try again in (?:(\d+)m)?([\d.]+)s", msg)
    if m:
        return min(120.0, (int(m.group(1) or 0) * 60) + float(m.group(2)) + 1)
    return default


def _with_timeout(fn, seconds):
    ex = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    fut = ex.submit(fn)
    try:
        return fut.result(timeout=seconds)
    except concurrent.futures.TimeoutError:
        raise TimeoutError(f"no answer within {int(seconds)}s")
    finally:
        ex.shutdown(wait=False)


def run_json_stage(gemini_call, groq_call, configured_model, client, can_split=False):
    """``gemini_call(model)`` and ``groq_call(model, key)`` each return
    ``(parsed, cost)`` or raise. Returns the first good answer."""
    import gemini_worker  # policy blocks are final, never retried

    providers = []
    if client is not None and gemini_key():
        providers += [("Gemini", m) for m in gemini_models(client, configured_model)]
    gk = groq_key()
    if gk:
        providers += [("Groq", m) for m in groq_models(gk)]
    if not providers:
        raise RuntimeError("No AI service is set up: add a Gemini or Groq key in Settings.")

    dead = set()
    started = time.time()
    rounds = 0
    last = None
    while True:
        for i, (svc, model) in enumerate(providers):
            if (svc, model) in dead:
                continue
            for attempt in (1, 2):
                try:
                    if svc == "Gemini":
                        result = _with_timeout(lambda: gemini_call(model), CALL_TIMEOUT)
                    else:
                        result = _with_timeout(lambda: groq_call(model, gk), CALL_TIMEOUT)
                    if rounds or i:
                        print(f"✅ AI answered: {svc} {model}")
                    return result
                except gemini_worker.GeminiBlockedError:
                    raise
                except Exception as e:
                    msg = str(e)
                    last = f"{svc} {model}: {msg[:160]}"
                    kind = _classify(msg)
                    if kind == "large":
                        if can_split:
                            raise TooLarge(last)
                        print(f"⚠️ {svc} ({model}) can't take a request this big; skipping it for this part.")
                        dead.add((svc, model))
                        break
                    if kind == "dead":
                        print(f"⚠️ {svc} {model} is not available to this key; skipping it.")
                        dead.add((svc, model))
                        break
                    if isinstance(e, TimeoutError):
                        # A hung request means this model is overloaded right
                        # now; waiting on it again only wastes minutes.
                        print(f"⚠️ {svc} ({model}) did not answer in {int(CALL_TIMEOUT)}s.")
                        break
                    if attempt == 1:
                        wait = _suggested_wait(msg, 5)
                        print(f"⚠️ {svc} ({model}) busy or slow, retrying in {int(wait)}s: {msg[:120]}")
                        time.sleep(wait)
            nxt = next(((s, m) for s, m in providers[i + 1:] if (s, m) not in dead), None)
            if nxt and (svc, model) not in dead:
                print(f"🔁 {svc} ({model}) is busy; switching to {nxt[0]} {nxt[1]}")
        if all(p in dead for p in providers):
            raise RuntimeError(f"No AI model available to these keys. Last error: {last}")
        waited = time.time() - started
        if waited >= WAIT_MAX:
            raise AllBusy(f"Every AI service stayed busy for {int(waited // 60)} min. Last error: {last}")
        wait = min(300, 30 * (2 ** rounds), max(10, WAIT_MAX - waited))
        print(f"⏳ All AI services are busy — trying again in {int(wait)}s "
              f"(waited {int(waited // 60)} of {int(WAIT_MAX // 60)} min).")
        time.sleep(wait)
        rounds += 1
