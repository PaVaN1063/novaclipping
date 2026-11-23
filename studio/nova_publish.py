"""Nova Clipping: post or schedule clips through your own Nova Clipping website
(the one connected to YouTube / Instagram with your own keys), as an
alternative to Upload-Post.

Self-contained add-on. Nothing in the clipping pipeline changes. For each clip
it sends the finished file (with your text watermark burned in, if one is set)
to the website, then creates one batch there with a date and time per clip.
The website's worker uploads to YouTube (Private + publish time) and posts
Instagram Reels at their slot.

Settings (website address + link key) are saved in
assets/nova_brand/publish.json inside the mounted repo folder.

Routes (all under /api/nova/publish):
  GET  /settings      {site_url, has_key}
  PUT  /settings      {site_url, key?}
  POST /test          checks the website answers and accepts the key
  POST /send          {job_id, clips:[{clip_index, title, description, publish_at}], platforms, mode}
"""
import asyncio
import glob
import json
import os
import shutil
import tempfile
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(HERE, "assets", "nova_brand", "publish.json")
# The website runs on the Windows host; from inside Docker that is host.docker.internal.
DEFAULT_SITE = os.environ.get("NOVA_SITE_URL", "http://host.docker.internal:3000")


IN_DOCKER = os.path.exists("/.dockerenv")


def _api(s) -> str:
    """The website address as this backend must call it (inside Docker,
    localhost is the container itself, so use the Windows host)."""
    url = s["site_url"] if isinstance(s, dict) else s
    # On the server the website runs next to the Studio: reach it directly
    # instead of going out through its public address.
    pub = os.environ.get("NOVA_SITE_PUBLIC_URL", "").rstrip("/")
    inner = os.environ.get("NOVA_SITE_API_URL", "").rstrip("/")
    if pub and inner and url.rstrip("/") == pub:
        return inner
    if IN_DOCKER:
        for local in ("://localhost", "://127.0.0.1"):
            url = url.replace(local, "://host.docker.internal")
    return url


def _public(url: str) -> str:
    """The website address as your browser opens it."""
    return url.replace("://host.docker.internal", "://localhost")


def _status(s) -> dict:
    return {"site_url": _public(s["site_url"]), "has_key": bool(s["key"]),
            "linked_at": s.get("linked_at")}


def load_settings() -> dict:
    out = {"site_url": DEFAULT_SITE, "key": ""}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)
        if isinstance(saved.get("site_url"), str) and saved["site_url"].strip():
            out["site_url"] = saved["site_url"].strip().rstrip("/")
        if isinstance(saved.get("key"), str):
            out["key"] = saved["key"].strip()
        if isinstance(saved.get("linked_at"), str):
            out["linked_at"] = saved["linked_at"]
    except (OSError, ValueError):
        pass
    return out


def save_settings(site_url: str, key: Optional[str]) -> dict:
    cur = load_settings()
    site_url = (site_url or "").strip().rstrip("/") or DEFAULT_SITE
    if not site_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="The website address must start with http:// or https://")
    data = {"site_url": _public(site_url), "key": (key.strip() if key is not None else cur["key"]),
            "linked_at": cur.get("linked_at")}
    if key is not None and key.strip() and key.strip() != cur["key"]:
        import datetime as _dt
        data["linked_at"] = _dt.datetime.now(_dt.timezone.utc).isoformat()
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    tmp = SETTINGS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, SETTINGS_FILE)
    return data


class SettingsIn(BaseModel):
    site_url: str = ""
    key: Optional[str] = None


class ClipIn(BaseModel):
    clip_index: int = Field(ge=0)
    title: str = Field("", max_length=100)
    description: str = Field("", max_length=4000)
    publish_at: Optional[str] = None  # ISO 8601 with offset; None = draft


class SendIn(BaseModel):
    job_id: str
    clips: List[ClipIn]
    platforms: List[str] = ["youtube"]
    mode: str = "schedule"  # or "draft"
    name: str = ""
    watermark: bool = True


def _headers(key: str) -> dict:
    return {"x-nova-key": key}


def _site_error(r: httpx.Response) -> str:
    try:
        return r.json().get("error") or f"HTTP {r.status_code}"
    except Exception:
        return f"HTTP {r.status_code}"


def build_router(output_dir, jobs, ensure_job_files, assert_job_owner, canonical_clip_file, wm_module) -> APIRouter:
    router = APIRouter(prefix="/api/nova/publish", tags=["nova-publish"])

    @router.get("/settings")
    async def get_settings():
        s = load_settings()
        return _status(s)

    @router.put("/settings")
    async def put_settings(body: SettingsIn):
        s = save_settings(body.site_url, body.key)
        return _status(s)

    @router.post("/test")
    async def test():
        s = load_settings()
        if not s["key"]:
            raise HTTPException(status_code=400, detail="Paste the link key from your Nova Clipping website (Settings → Studio link).")
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{_api(s)}/api/link", headers=_headers(s["key"]))
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail=f"Can't reach the website at {s['site_url']}. Is it running (start-dev.bat)?")
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail="The website refused the link key. Copy it again from its Settings page.")
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"The website answered: {_site_error(r)}")
        return r.json()

    def clip_path(job_id: str, index: int) -> str:
        out = os.path.join(output_dir, job_id)
        metas = glob.glob(os.path.join(out, "*_metadata.json"))
        if not metas:
            raise HTTPException(status_code=404, detail="Project not found (it may have expired).")
        base = os.path.basename(metas[0]).replace("_metadata.json", "")
        mem = ((jobs.get(job_id) or {}).get("result") or {}).get("clips") or []
        url = (mem[index] or {}).get("video_url") if index < len(mem) else None
        name = os.path.basename(url.split("?")[0].split("/")[-1]) if url else canonical_clip_file(out, base, index)
        path = os.path.join(out, name or "")
        if not name or not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"Clip {index + 1} file not found.")
        return path

    @router.post("/send")
    async def send(body: SendIn, request: Request):
        s = load_settings()
        if not s["key"]:
            raise HTTPException(status_code=400, detail="Set up the Nova Clipping website link first (Settings → Post via Nova Clipping).")
        if not body.clips:
            raise HTTPException(status_code=400, detail="Pick at least one clip.")
        if body.mode not in ("schedule", "draft"):
            raise HTTPException(status_code=400, detail="mode must be schedule or draft")

        await ensure_job_files(body.job_id, request)
        if body.job_id in jobs:
            await assert_job_owner(request, jobs[body.job_id])

        wm = wm_module.load_settings() if body.watermark else None
        if wm and not (wm.get("text") or "").strip():
            wm = None

        work = tempfile.mkdtemp(prefix="nova_pub_")
        loop = asyncio.get_event_loop()
        sent = []
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=600, write=600)) as c:
                for clip in body.clips:
                    src = clip_path(body.job_id, clip.clip_index)
                    path = src
                    if wm:
                        path = os.path.join(work, f"{clip.clip_index:03d}.mp4")
                        await loop.run_in_executor(
                            None, wm_module.burn_text, src, path, wm["text"].strip(), wm["position"], wm["size"], wm["opacity"])
                    size = os.path.getsize(path)
                    name = os.path.basename(src)
                    try:
                        r = await c.post(f"{_api(s)}/api/uploads", headers=_headers(s["key"]),
                                         json={"fileName": name, "size": size})
                        if r.status_code != 200:
                            raise HTTPException(status_code=502, detail=f"Website refused the upload: {_site_error(r)}")
                        up_id = r.json()["id"]
                        with open(path, "rb") as f:
                            r = await c.put(f"{_api(s)}/api/uploads/{up_id}/file", headers={
                                **_headers(s["key"]), "Content-Type": "application/octet-stream"}, content=f.read())
                        if r.status_code != 200:
                            raise HTTPException(status_code=502, detail=f"Sending clip {clip.clip_index + 1} failed: {_site_error(r)}")
                    except httpx.HTTPError:
                        raise HTTPException(status_code=502, detail=f"Can't reach the website at {s['site_url']}. Is it running?")
                    sent.append({"uploadId": up_id, "title": clip.title, "description": clip.description,
                                 "hashtags": [], "publishAt": clip.publish_at if body.mode == "schedule" else None})

                first = next((x["publishAt"] for x in sent if x["publishAt"]), None)
                r = await c.post(f"{_api(s)}/api/batches", headers=_headers(s["key"]), json={
                    "name": body.name or "From Nova Studio",
                    "mode": body.mode,
                    "platforms": body.platforms,
                    "startAt": first,
                    "gapHours": 3,
                    "useAi": False,
                    "clips": sent,
                })
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Website could not create the schedule: {_site_error(r)}")
                data = r.json()
        finally:
            shutil.rmtree(work, ignore_errors=True)

        return {"ok": True, "batch_id": data.get("batchId"), "count": len(sent),
                "batch_url": f"{_public(s['site_url'])}/batches/{data.get('batchId')}"}

    # ---- Nova Clipping website <-> Studio link -------------------------------
    # One-click link: the website hands the Studio its link key (redirect back
    # from <site>/studio/connect, or a message from the website's Studio page),
    # the Studio saves it here and checks it against the website.

    class ConnectIn(BaseModel):
        site_url: str
        key: str = Field(min_length=10, max_length=200)

    @router.post("/link/connect")
    async def link_connect(body: ConnectIn):
        site = (body.site_url or "").strip().rstrip("/")
        if not site.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Bad website address.")
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{_api(site)}/api/link", headers=_headers(body.key.strip()))
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail=f"Can't reach the website at {site}. Is it running (start-dev.bat)?")
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="The website did not accept that link. Try connecting again.")
        s = save_settings(site, body.key)
        return {**_status(s), "site": r.json()}

    @router.post("/link/unlink")
    async def link_unlink():
        s = load_settings()
        save_settings(s["site_url"], "")
        return _status(load_settings())

    class SyncIn(BaseModel):
        gemini_key: Optional[str] = Field(None, max_length=300)
        gemini_updated_at: Optional[str] = Field(None, max_length=40)
        studio_url: Optional[str] = Field(None, max_length=300)
        watermark: Optional[str] = Field(None, max_length=80)

    @router.post("/link/sync")
    async def link_sync(body: SyncIn):
        """Two-way sync with the website: sends the Studio's side (Gemini key,
        its own address, watermark text) and returns the website's connections
        (YouTube, Instagram, Gemini). The newer Gemini key wins on both sides."""
        s = load_settings()
        if not s["key"]:
            return {**_status(s), "linked": False}
        payload = {
            "gemini": {"apiKey": (body.gemini_key or "").strip() or None,
                       "updatedAt": body.gemini_updated_at},
            "studioUrl": body.studio_url,
            "watermark": body.watermark,
        }
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(f"{_api(s)}/api/link", headers=_headers(s["key"]), json=payload)
        except httpx.HTTPError:
            return {**_status(s), "linked": True, "online": False,
                    "error": f"Website not reachable at {_public(s['site_url'])}"}
        if r.status_code == 401:
            return {**_status(s), "linked": True, "online": True, "refused": True,
                    "error": "The website no longer accepts this link (a new key was made). Connect again."}
        if r.status_code != 200:
            return {**_status(s), "linked": True, "online": True, "error": _site_error(r)}
        return {**_status(s), "linked": True, "online": True, "site": r.json()}

    return router
