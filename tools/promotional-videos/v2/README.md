# Promotional reels v2 — useful choice before product reveal

This is a local creative revision to the two v1 review assets, not a claim that a given
format will receive reach, rank better or convert viewers. A feed test with real publication
and appropriate observations would be needed to compare performance. Nothing was published.

## Creative decision

V1 is a calm product walkthrough with several small UI panels. V2 gives a small-business
owner one reusable example: turn a product description into an answer to a customer's
choice question. Large original illustrations compare a small cup for short coffee with a
larger cup for a milky coffee. It is labeled **הדגמה**; it is not an advertisement for a
real pottery business or a result/customer claim.

- **Instagram, 24s:** product question → generic product description → useful comparison →
  owner takeaway → one plan decision → ongoing-plan invitation. The useful use labels appear
  at 1.2s, so the opening gives viewers something concrete before the full explanation.
- **TikTok, 18s:** a faster size contrast → immediate use comparison → explicit owner lesson
  → concise plan-to-post connection → brand. The cut omits the slower generic-description
  scene, uses different headlines and preserves a four-second end card.
- The owner lesson is prominent in both: **בפוסט הבא, ענו על שאלה שעוזרת ללקוח לבחור.**
  This is the possible reason to save/share: a practical prompt for one's own next post.
  No distribution or business outcome is guaranteed.
- The ongoing plan remains the product. The post executes one decision; the plan continues
  according to questions from customers. No fixed programme or month-long publishing wait.
- The store/sun/path signature appears at the end rather than taking permanent space under
  every scene. The road draws before the walker begins. Movement is flat and restrained.

## Edit / reproduce

V1 code, captions, committed metadata and `.runtime/promotional-videos/exports/` are unchanged.
V2 source is only this new directory. `compose.py` imports the frozen v1 `Canvas`, typography,
font, store artwork and time/MP4 helpers from `../render.py`; it does not call the v1 renderer
or write into its output directory. Keep the parent folder when moving these sources.
No new package is required beyond the existing pinned `../requirements.txt` and ffmpeg.

```sh
.runtime/promotional-videos/venv/bin/python tools/promotional-videos/v2/compose.py --preview
.runtime/promotional-videos/venv/bin/python tools/promotional-videos/v2/compose.py
```

Use `--platform instagram` or `--platform tiktok` for one cut. Outputs go exclusively to
`.runtime/promotional-videos/exports-v2/` with distinct `-v2` filenames. Restart a render
command after interruption; every frame is deterministic. Original v1 reproduction remains
`python tools/promotional-videos/render.py` with the same local environment.

`captions.json` is the source for visual headlines, timings, post description and optional
spoken Hebrew. The renderer emits independent caption and narration SRT files, JSON,
MP4, decoded representative PNGs, contact sheet, ffprobe JSON and SHA-256 manifest.
The narration SRT is a proposed read, **not synthesized or recorded audio**; both draft MP4s
are silent. A human reader should rehearse pacing before recording; copy can be shortened
without changing the visual lesson. No paid voice service, clone or music was used.

All other UI/example copy and the end CTA are editable in `compose.py`. Essential copy uses
large Heebo and conservative margins; the `הדגמה` label remains visible during all example
scenes. Actual platform overlays and a verified destination still need checking at upload.
The owner retains publication/creative review. No inactive URL or guessed account appears.

## Verification, cost, rights and retention

The renderer asserts contiguous caption timing, at most two main caption lines and no
headline-width overflow. It probes every completed MP4 for 1080×1920, 30fps, H.264 High,
yuv420p, exact 720/540 frame counts and 24/18 second duration. Faststart is checked from MP4
atom order. A full ffmpeg decode follows; contact-sheet images are extracted from the MP4.

One preview pass, then one small opening-label improvement before the final render batch.
No encode failures or paid generation retries. Exact measured render+verification latency,
bytes, hashes and source hashes are in the generated manifests and checked-in metadata.
External provider fees are zero. Local compute and model-session costs are not assigned a
fabricated dollar amount. No new provider, account, production configuration or dependency.

All illustration/composition work is original code. The renderer uses the same tool licenses
as v1: Pillow MIT-CMU, python-bidi LGPL-3.0, local ffmpeg GPL-3.0-or-later/libx264, Heebo OFL
with its notice preserved in `../assets/`. Software tools are not bundled into the MP4.
Only source/copy/metadata are tracked. Exports remain local and ignored, with no automatic
expiry or remote upload; retain accepted files in an owner-controlled backup before cleanup.
