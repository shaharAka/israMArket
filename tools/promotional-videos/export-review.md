# Export review — 3 October 2026

Astra prepared these two actual promotional exports against main `3a40db5` in the isolated
`codex/promotional-videos` worktree. The original script proposition comes from
`docs/isramarket-dogfood.md`, adapted to the user's ongoing-plan direction. This document
records technical/visual inspection, not owner approval or a published campaign outcome.

## Review completed

- Read the work agreement, workflow, design standard, Hebrew guide, UI rules, dogfood
  campaign, launch gates and post-quality brief. Read #71 and confirmed the active claim.
- Inspected the owned synthetic `web/public/flow-screens/strategy.png` and current plan
  page source for product hierarchy. Recreated a simplified labeled UI for phone readability;
  did not copy real account data or imply pixel-for-pixel current app footage.
- Viewed Instagram's six-scene and TikTok's five-scene contact sheets plus full-resolution
  post frame. Main captions have at most two lines, no text overflow, no reversed Hebrew,
  clipped CTA or conflicting filled actions. Key content avoids the conservative overlay area.
- Rendered and visually inspected separate mixed-direction cases: Hebrew with Instagram,
  2026, 3 posts, 4,500 ₪ and an example.test address. Latin runs and numeric order remain
  correct. The test strip is QA only and does not appear in either video.
- Verified contiguous caption timing and correct end times for each platform.
- Actual MP4 probing checks 1080×1920, 30/1 fps, H.264, yuv420p, 720/540 decoded frames and
  24/18 seconds. MP4 atom order verifies faststart. Full ffmpeg decode reports no errors.
- Representative final frames are extracted from the actual encoded MP4, not just the
  composition preview. Their contact sheets and full-size PNGs are local deliverables.

## Iterations and cost accounting

Two preview passes. The first preview stopped on the TikTok line-width assertion; the
72 px headline size fixes it without changing words. A second preview passed. No video
encode failed. One completed render per platform was superseded after decoded-frame review
revealed a small rectangular seam under the rising sun; clearing the transparent overlay
fixes it. Final run: one encode per platform. Total: four completed MP4 render jobs across
two visual versions, two accepted review files. No remote retries, generation API calls,
external render fees, music fees or new production provider.

First version observed render+probe/contact-sheet time: Instagram 68.17 s, TikTok 51.61 s.
Final version: Instagram 68.44 s / 842,222 bytes; TikTok 51.52 s / 571,523 bytes.
Exact hashes are in `export-metadata.json` and each local `*.manifest.json`. These are measured
local render/verification latency, excluding environment setup, composition authoring and
human/model review. Exact model-session dollar cost is not available and is not claimed
as zero; only external provider/render fees are zero.

## Remaining review boundary

The files are silent-first promotional reviews. No narration or music was commissioned.
The schematic example is explicitly labeled and includes a missing-data state; no result,
customer quote or integration approval is fabricated. No live destination is included.
Owner/Claude creative review and the actual upload overlay/destination check remain before
publication. No platform account was opened or logged into for this task. No production
screens, APIs, configuration, deployments, pushes or merges were performed by this agent.

See README for local recovery, licenses, dependency footprint and storage retention.
