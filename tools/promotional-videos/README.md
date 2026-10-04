# IsraMarket promotional reels — editable local masters

Two silent-first review exports created by Astra for issue #71. These are promotional
assets, not an app video-generation feature. Nothing is published or deployed. Claude
remains the product/design lane owner; review of the actual exports is still required.

## Creative and truth boundaries

- **Instagram:** 24 seconds / 720 frames. A readable product story: ongoing plan → first
  post from available material → what is known/unknown → next plan action → invitation.
- **TikTok:** 18 seconds / 540 frames. A direct 2.3-second hook, earlier product reveal,
  shorter evidence sequence and four-second end card. This is a different edit, not a resize.
- Both: 1080 × 1920, 30 fps, H.264 High, yuv420p, BT.709 metadata, MP4 faststart, no audio.
- Blue/sun values match `web/app/globals.css`; Heebo 400–700 only. Flat shop awning,
  a road drawn before the walker starts, and one slow sun rise across the whole asset.
- Every example UI screen is marked `הדגמה · עסק לדוגמה`. Its structure follows the
  plan, post review and Results pages, re-typeset for legibility. These are simplified
  synthetic compositions, not recordings of a live account or claims about actual results.
- The illustrated ceramic cup is original code artwork representing synthetic material.
  No customer photos, analytics, stock, third-party music or private account data are used.
- No instant approved integrations, automatic publishing, actual customer outcomes,
  inactive website address or unconfirmed social account appears. The CTA is intentionally
  an editable invitation without a destination. Add a verified destination only when known.

## Sources and editing

`captions.json` contains each platform's timing, Hebrew headline captions and post caption.
`captions/` holds generated, separately editable SRT copies; JSON remains the render source.
`render.py` contains all layouts, UI example copy, original vector-like artwork and motion.
The end card is the `kind == 'end'` branch in `content()`. Change its CTA there. All geometry
uses a 1080 × 1920 coordinate system; artwork is rasterized at 2× and downsampled. No browser,
Remotion, paid generator or network service is needed to render.

The composition uses Unicode bidi ordering explicitly with Pillow's BASIC layout engine.
Do not combine that with a second RTL reorder or RAQM direction pass. Font weights use
Heebo's variable weight axis. Width assertions fail instead of silently cropping captions.
The main captions use at most two lines, 70–72 px type. Key content stays within x=112–910,
y=208–1256, leaving 170 px on the right and 460+ px at the bottom for variable platform UI.
The store/path below are decorative. Actual platform overlays differ by app version and
caption length; confirm the final upload preview before publishing.

## Reproduce or recover

From the repository root, with Python 3 and `ffmpeg` / `ffprobe` on PATH:

```sh
python3 -m venv .runtime/promotional-videos/venv
.runtime/promotional-videos/venv/bin/pip install -r tools/promotional-videos/requirements.txt
.runtime/promotional-videos/venv/bin/python tools/promotional-videos/render.py --preview
.runtime/promotional-videos/venv/bin/python tools/promotional-videos/render.py
```

Use `--platform instagram` or `--platform tiktok` to regenerate only one edit. The renderer
writes only `.runtime/promotional-videos/exports/` and replaces files of that platform.
After an interruption, restart that command; frames are deterministic from time and source.
It streams raw frames to ffmpeg, avoiding thousands of retained frame PNGs. It probes the
completed MP4, asserts actual dimensions/rate/codec/pixel format/frame count/duration and
checks that the `moov` atom precedes `mdat`. Contact sheets are decoded from the final MP4.

Each export includes MP4, UTF-8 SRT, caption JSON, ffprobe JSON, SHA-256 manifest, full-size
representative PNGs and a contact sheet. SRT is a separate editable caption deliverable;
the MP4 already contains the same main headline captions. Avoid displaying both copies
on top of each other when publishing.

## Costs, rights and retention

- External generation/provider fees: **US$0**. No provider calls, paid tools, cloud renders,
  production provider switch or music licensing. Local CPU/storage and model-session usage
  are not assigned a fabricated dollar amount; no per-task inference bill is available.
- Observed render+verification seconds and exact bytes are in each generated manifest.
  Creative preview revision and retry counts are recorded in `export-review.md`.
- Pillow 12.3.0: MIT-CMU; python-bidi: LGPL-3.0; installed ffmpeg 9.0.2 build:
  GPL version 3 or later with libx264. These are local tools, not bundled with the videos.
  The renderer code is repository-owned work. A software license is not being represented
  as a restriction that automatically transfers to the rendered promotional artwork.
- `assets/Heebo.ttf`: Heebo Project Authors, SIL OFL 1.1; full notice is included alongside.
  Original source: https://github.com/google/fonts/tree/main/ofl/heebo.
- Sources/font/copy are tracked; large exports and local environments remain ignored under
  `.runtime/`. No remote upload or automatic expiration. Retained locally until the owner
  deletes them; preserve accepted exports in an owner-controlled backup before cleanup.
- Environment setup used a worktree-local Python venv and installed Homebrew ffmpeg because
  no binary was present. Homebrew also installed its standard codec dependencies and
  upgraded xz. App dependencies and production configuration were not touched. Extra
  exploratory fonttools, brotli and imageio-ffmpeg packages in the local venv are not needed
  by the final renderer and are omitted from its requirements.
