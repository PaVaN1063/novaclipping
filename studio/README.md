# Nova Clipping Studio

The clipping engine of Nova Clipping. It turns long gameplay videos into short
vertical clips, adds captions and your watermark, writes titles with Gemini, and
hands the clips to the Nova Clipping website for scheduling on YouTube and Instagram.

## What it does
- Finds the best moments in a long video or a video link and cuts them into 9:16 clips
- Captions, reframing, hooks and a text watermark
- Viral score, titles, descriptions and hashtags with Gemini
- YouTube Studio: title ideas and thumbnails for a single video
- Runs several projects in a queue

## Run on your laptop (Docker Desktop)
```
docker compose up -d
```
Open http://localhost:5175. After changing Python code, run `restart-studio.bat`.

## Run on the Oracle Cloud VM
Double-click `deploy-oracle.bat`. It packs the code, uploads it to the VM and
starts it with `docker-compose.oracle.yml`. Logins are created on the VM the
first time and copied to `deploy/` (never committed).

## Folders
- `app.py`, `main.py` and the other `.py` files: the backend (FastAPI)
- `dashboard/`: the Studio screens (React + Vite)
- `render-service/`, `remotion/`: caption and video rendering
- `deploy/`: VM setup scripts

## License
The core is MIT licensed (see `LICENSE` and `NOTICE`); the `cloud/` folder keeps
its own license (`cloud/LICENSE`).
