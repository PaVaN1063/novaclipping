# Nova Clipping

Website for novaclipping.netlify.app: a public landing page, plus a signed-in area with the dashboard, bulk upload, schedule and Studio.

## Run it on your laptop

Double-click `start-dev.bat`, or:

```powershell
npm install
npm run dev
```

Open http://localhost:3000

## Sign in

- **Quick access (dev)** on the login page — no password. Only shows while running locally.
- Or username `pavan`, password `nova123` (set your own in `.env.local`, see `.env.example`).

## How the data works

- `data/nova.json` — batches, clips and posts (one post per clip per platform).
- `storage/clips/` — the uploaded video files.
- Both stay on your laptop and are ignored by git. Delete them to start fresh.

Bulk upload saves the batch, then uploads each video to `storage/clips/` with a progress bar.
The Dashboard and Schedule read from `data/nova.json`.

## Background worker

Starts with the site (`instrumentation.ts` → `lib/worker.ts`) and checks the queue every 20 seconds:

- **YouTube** posts are sent straight away (YouTube holds the publish time itself).
- **Instagram** posts are sent when their time comes. Instagram "drafts" stay held in the Nova queue.
- If a platform isn't connected yet, the post shows "Connect YouTube/Instagram to send" and is retried once it is.

The actual sending lives in `lib/publishers.ts` — that's where the YouTube and Instagram code goes next.

## Status of each post

| Status | Meaning |
|---|---|
| Waiting for file | Batch saved, video not uploaded to Nova yet |
| In queue / Scheduled | Ready for the worker |
| Held in Nova queue | Instagram draft — not posted automatically |
| Connect … to send | Platform not connected yet |
| Sending… | Worker is sending it |
| Draft on YouTube / Scheduled on YouTube / Published / Posted | Done |
| Failed | Gave up after 3 tries (hover on the schedule to see why) |

## Going live

The JSON file and local video folder are for running on your laptop or the Oracle VM. Netlify can't keep files or run the worker, so the live setup will move data to Postgres and the worker to the Oracle VM.
