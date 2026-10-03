# V3 — the marketing plan is the product

This revision addresses the owner's positioning correction: v2 taught a post technique,
while IsraMarket's value is an ongoing marketing plan for a particular business. Posts and
reels execute the plan. V3 starts with the cost/time burden of marketing or the difficulty
of making professional expertise visible; it does not promise to replace every professional.

## Story and example

A fictional independent interior designer, Tamar, is explicitly labeled **הדגמה**. Her plan
is the central artifact from the first frame through the middle scenes, always titled
**תוכנית השיווק של תמר**. It accumulates rather than turning into a catalogue of features:

1. Suitable audience: families in small apartments.
2. Distinct approach: start with what the home already has.
3. One realistic next action: show another arrangement of a living room.
4. Execution: a conceptual flat room illustration and a post in her own warm, practical voice.
5. Prospective learning: inquiries that fit the service; no invented counts or outcomes.

Tamar's deep olive, clay and warm cream differ from IsraMarket's blue/sun. The room is an
original conceptual diagram, never a claimed client project or a real before/after. It
is explicitly captioned `איור רעיוני · לא פרויקט לקוח`. The shop/sun is a small brand mark
at the end; the business goal is suitable service inquiries, not retail sales.

Instagram runs **26 seconds** for readable progression. Its exact opening is
`שיווק מקצועי עולה כסף. / לשווק לבד לוקח זמן.` TikTok runs **20 seconds** with opening
`טובים במקצוע שלכם. / איך הלקוחות ידעו?`; IsraMarket is named in its large caption at
2.5 seconds. Both begin with the plan already visible. Extended durations were used to
avoid squeezing the business direction and execution into tiny or rapidly changing text.

## Editable sources and reproduction

`captions.json` is the canonical source for main captions, exact timings, post description
and optional Hebrew narration. `captions/` contains separately editable caption/narration
SRT copies. Narration is a script only: both actual review MP4s are silent.

`compose.py` owns the layouts, room illustration, example plan copy and end card. It imports
unchanged v1 helpers (Canvas/Heebo/time/probe/shop) from `../render.py`. Keep the parent
folder and licensed font when moving the source. No new package/provider is used.

```sh
.runtime/promotional-videos/venv/bin/python tools/promotional-videos/v3/compose.py --preview
.runtime/promotional-videos/venv/bin/python tools/promotional-videos/v3/compose.py
```

Add `--platform instagram` or `--platform tiktok` for one file. Writes are confined to
`.runtime/promotional-videos/exports-v3/`; output filenames contain `-v3`. V1/v2 source,
caption and export paths are preserved. Their old render commands still work. Interrupted
renders can be deterministically restarted with the same command.

## Verification and accounting

The renderer checks caption continuity/two-line limit, headline width, actual 1080×1920,
30fps, H.264 High, yuv420p, exact duration/frame counts and faststart atom order. It fully
decodes each completed MP4, then extracts representative PNGs/contact sheets from that
encoded video. Final measured latency, bytes and hashes are in `export-metadata.json` and
local manifests. Source hashes identify the rendered composition; the Git revision in the
manifest is its base commit before the new source commit.

Preview width checks stopped twice on a long end headline. The final 56–63px headline
sizes fit the safe column; no caption is clipped to suppress a width failure. One successful
preview followed, then one final encode per platform. There were no failed encodes or
remote retries. Model-session cost is not available; local compute is not assigned an
invented dollar cost. External provider/render/voice/music fees are **$0**.

Licenses are unchanged: original composition/artwork; Heebo SIL OFL with its included notice;
Pillow MIT-CMU, python-bidi LGPL-3.0, local ffmpeg GPL-3.0-or-later/libx264. The tools are not
bundled with the MP4. See the parent README for environment setup and notices.

Sources/captions/metadata are committed; videos and QA images remain ignored local outputs.
No upload or automatic expiry. Retain accepted files in an owner-controlled backup before
cleanup. No accounts, app files, API, production configuration, deployment or publication
were changed. Owner/Claude creative review and an actual upload-overlay/destination check
remain; cold-feed engagement and suitability have not been measured.
