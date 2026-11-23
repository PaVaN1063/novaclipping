"""Nova Clipping: your own text watermark (e.g. "@yourchannel") on clips.

Self-contained add-on. Nothing in the clipping pipeline changes: the clip
files, the metadata and the editor chain stay exactly as they were. A request
names a clip that is already finished, the text is drawn onto a temporary
copy with ffmpeg, and that copy is sent back as a download and deleted.

The text, position, size and opacity are typed in on the site and saved on
the server (assets/nova_brand/settings.json, inside the mounted repo folder,
so they survive restarts). Empty text = no watermark.

Routes (all under /api/nova/watermark):
  GET  /settings          current text + position/size/opacity
  PUT  /settings          save them
  GET  /preview.png       the text as it will be drawn (for the settings card)
  POST /render            {video_url, text?, ...} -> the watermarked MP4

Single-user: settings are global, which fits a private site behind
Cloudflare Access. app.py mounts it with build_router(...) at the very end.
"""
import asyncio
import io
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from typing import Optional
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "Montserrat-ExtraBold.ttf")
BRAND_DIR = os.path.join(HERE, "assets", "nova_brand")
SETTINGS_FILE = os.path.join(BRAND_DIR, "settings.json")

POSITIONS = ("top-center", "center", "bottom-center",
             "top-left", "top-right", "bottom-left", "bottom-right")
# Defaults match the usual Shorts look: centred, a little below the top,
# above the captions, white at ~75 %.
DEFAULTS = {"text": "", "position": "top-center", "size": 0.045, "opacity": 0.75}
MAX_TEXT = 60


class WatermarkSettings(BaseModel):
    text: str = Field("", max_length=MAX_TEXT)
    position: str = DEFAULTS["position"]
    size: float = Field(DEFAULTS["size"], ge=0.02, le=0.12)      # font height / video width
    opacity: float = Field(DEFAULTS["opacity"], ge=0.1, le=1.0)


class RenderRequest(BaseModel):
    video_url: str
    text: Optional[str] = Field(None, max_length=MAX_TEXT)
    position: Optional[str] = None
    size: Optional[float] = Field(None, ge=0.02, le=0.12)
    opacity: Optional[float] = Field(None, ge=0.1, le=1.0)


def load_settings() -> dict:
    out = dict(DEFAULTS)
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)
        if isinstance(saved.get("text"), str):
            out["text"] = saved["text"][:MAX_TEXT]
        if saved.get("position") in POSITIONS:
            out["position"] = saved["position"]
        for k in ("size", "opacity"):
            if isinstance(saved.get(k), (int, float)):
                out[k] = float(saved[k])
    except (OSError, ValueError):
        pass
    return out


def _check_position(position: str):
    if position not in POSITIONS:
        raise HTTPException(status_code=400, detail=f"position must be one of {', '.join(POSITIONS)}")


def save_settings(s: WatermarkSettings) -> dict:
    _check_position(s.position)
    os.makedirs(BRAND_DIR, exist_ok=True)
    data = {"text": s.text.strip(), "position": s.position, "size": s.size, "opacity": s.opacity}
    tmp = SETTINGS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, SETTINGS_FILE)
    return data


def render_text_png(text: str, font_px: int) -> Image.Image:
    """White bold text on transparent, with a faint shadow so it stays legible
    on bright frames. Opacity is applied later, in ffmpeg."""
    font = ImageFont.truetype(FONT, max(8, font_px))
    bbox = ImageDraw.Draw(Image.new("RGBA", (4, 4))).textbbox((0, 0), text, font=font)
    pad = max(4, font_px // 3)
    w, h = bbox[2] - bbox[0] + pad * 2, bbox[3] - bbox[1] + pad * 2
    txt = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(txt).text((pad - bbox[0], pad - bbox[1]), text, font=font, fill=(255, 255, 255, 255))
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 90), (0, 0), txt.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, font_px // 12)))
    return Image.alpha_composite(shadow, txt)


def _probe_size(path: str):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", path],
        capture_output=True, text=True, timeout=60)
    try:
        st = json.loads(r.stdout)["streams"][0]
        return int(st["width"]), int(st["height"])
    except (ValueError, KeyError, IndexError):
        raise HTTPException(status_code=422, detail="Could not read the clip's video stream")


def _overlay_xy(position: str, margin: int):
    m = str(margin)
    return {
        "top-center": ("(W-w)/2", "H*0.15-h/2"),
        "center": ("(W-w)/2", "(H-h)/2"),
        "bottom-center": ("(W-w)/2", "H*0.85-h/2"),
        "top-left": (m, m),
        "top-right": (f"W-w-{m}", m),
        "bottom-left": (m, f"H-h-{m}"),
        "bottom-right": (f"W-w-{m}", f"H-h-{m}"),
    }[position]


def burn_text(src: str, dst: str, text: str, position: str, size: float, opacity: float):
    """Draw ``text`` on ``src`` and write ``dst``. Audio is copied as is."""
    _check_position(position)
    width, _height = _probe_size(src)
    work = os.path.dirname(dst)
    png = os.path.join(work, "wm_text.png")
    render_text_png(text, int(width * size)).save(png)
    margin = max(8, int(width * 0.04))
    x, y = _overlay_xy(position, margin)
    graph = (f"[1:v]format=rgba,colorchannelmixer=aa={opacity:.3f}[wm];"
             f"[0:v][wm]overlay={x}:{y}:format=auto,format=yuv420p[v]")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", src, "-i", png,
           "-filter_complex", graph, "-map", "[v]", "-map", "0:a?",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-c:a", "copy", "-movflags", "+faststart", dst]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if r.returncode != 0 or not os.path.exists(dst):
        raise HTTPException(status_code=500, detail=f"ffmpeg failed: {r.stderr.strip()[-400:]}")


def _clip_path(output_dir: str, video_url: str):
    """'/videos/<job>/<file>' (absolute URL and ?query allowed) -> (job_id, path)."""
    path = unquote(urlparse(video_url).path)
    parts = [p for p in path.split("/") if p]
    if len(parts) != 3 or parts[0] != "videos":
        raise HTTPException(status_code=400, detail="video_url must look like /videos/<job>/<file>.mp4")
    job_id, filename = parts[1], parts[2]
    if not filename.lower().endswith(".mp4") or os.path.basename(filename) != filename:
        raise HTTPException(status_code=400, detail="Only .mp4 clips can be watermarked")
    base = os.path.realpath(output_dir)
    full = os.path.realpath(os.path.join(base, job_id, filename))
    if not full.startswith(base + os.sep):
        raise HTTPException(status_code=400, detail="Bad clip path")
    return job_id, full


def build_router(output_dir, jobs, ensure_job_files, assert_job_owner) -> APIRouter:
    router = APIRouter(prefix="/api/nova/watermark", tags=["nova-watermark"])

    @router.get("/settings")
    async def get_settings():
        return {**load_settings(), "positions": list(POSITIONS)}

    @router.put("/settings")
    async def put_settings(body: WatermarkSettings):
        return save_settings(body)

    @router.get("/preview.png")
    async def preview(text: str = "", size: float = DEFAULTS["size"]):
        text = (text or load_settings()["text"] or " ")[:MAX_TEXT]
        img = render_text_png(text, int(1080 * min(max(size, 0.02), 0.12)))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})

    @router.post("/render")
    async def render(req: RenderRequest, request: Request):
        job_id, src = _clip_path(output_dir, req.video_url)
        await ensure_job_files(job_id, request)
        if job_id in jobs:
            await assert_job_owner(request, jobs[job_id])
        if not os.path.exists(src):
            raise HTTPException(status_code=404, detail="Clip not found")

        s = load_settings()
        text = (req.text if req.text is not None else s["text"]).strip()
        if not text:
            raise HTTPException(status_code=400, detail="Type your watermark text (e.g. your channel name) first")
        position = req.position or s["position"]
        size = req.size if req.size is not None else s["size"]
        opacity = req.opacity if req.opacity is not None else s["opacity"]

        work = tempfile.mkdtemp(prefix="nova_wm_")
        dst = os.path.join(work, f"{uuid.uuid4().hex}.mp4")
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, burn_text, src, dst, text, position, size, opacity)
        except Exception:
            shutil.rmtree(work, ignore_errors=True)
            raise
        return FileResponse(dst, media_type="video/mp4", filename=os.path.basename(src),
                            background=BackgroundTask(shutil.rmtree, work, True))

    return router
