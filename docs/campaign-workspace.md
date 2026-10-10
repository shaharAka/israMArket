# Campaign workspace

`/campaign` groups the active plan's posts by week, orders dated posts chronologically,
and shows the artwork, purpose, action and publication state together. The workspace
response supplies the business's saved Design DNA; opening this screen creates no media.

Owners select up to three drafts and request a text, composition or image revision.
Video generation, editing and free finishing operate on one selected draft. Every
proposal stays separate from the current plan until **Keep**. **Undo** restores only
the creative fields, preserving the post's content language, measurements and schedule.
Approved, scheduled and published posts cannot be revised through this endpoint.

## Jobs and billing

`CampaignRevision` persists the selected post snapshots and fingerprints, request id,
options and proposals. Retrying the same request joins that job. Reusing its id with
different instructions or options is rejected. Interrupted jobs become failed without
replaying provider submissions. Keep/undo checks every completed member before making
any changes; one stale member prevents the entire batch from overwriting current work.

The account allowance is checked before creation and reserved atomically before each
paid provider request. Generation and generative video edits use the same two monthly
video units on the regular plan. Images use the existing image pool. Trial accounts have
no video generation entitlement. Local video finishing and layout changes do not use
these image/video units. Prepaid credit purchases remain separate work in #191.

Direct Google video is off unless `CAMPAIGN_VIDEO_ENABLED=true` and the Gemini key and
FFmpeg/FFprobe are available. Activation requires the scoped provider canary. This path
requests and normalizes a **five-second 720p vertical clip**, with one submission, no
fallback and no paid retry. The output-token budget is 55,000 and each request reserves
a conservative $1.20 ceiling. Verified token usage settles cost; unknown outcomes retain
the reservation. A user-supplied model, provider URL, price or settlement is never accepted.

## Finishing and export

Free finishing trims owned footage to a maximum 30-second excerpt, preserves its audio,
and fits it into a 720×1280 frame without silently cropping the subject. It does not yet
assemble several clips or add speech subtitles; the broader #71 reel scope remains open.
Generative edits accept a maximum five-second excerpt and retain the original soundtrack.

The headline and real logo are separate browser-rendered brand layers. The same 720×1280
DOM layer used in preview is rasterized to a transparent PNG and composited into the final
MP4. Loading state must preserve the edited headline during that asynchronous capture.
Before a clip is ready, the server checks dimensions, duration and decodes the entire file.
Original footage remains in the library for comparison and later finishing.

Private images bypass Next's server image optimizer because that optimizer does not
forward the owner's session cookie. Direct same-origin images and authenticated MP4
downloads retain the existing media ownership checks. A changed image URL resets the
renderer’s failed-image state.

## Verification and remaining release gate

Offline tests cover staged changes, keep/undo, stale batches, protected posts, independent
content language, request deduplication, interruptions, partial proposals, owned footage,
fully decodable exports and shared generation/edit limits. Isolated shop and service
campaigns exercise the real API and renderer without customer writes or paid media calls.

The 10 October canary made exactly one generation and one edit submission, with no paid
retries. Generation produced a fully decoded five-second 720×1280 MP4 and passed Keep.
The edit reached provider completion but failed during local soundtrack export: FFmpeg
received output filters before the second input. That ordering is fixed. Offline tests
now run real finishing both with/without the brand overlay and through the provider-edit
path, checking that the original soundtrack survives and only one request is sent.

The failed edit's provider usage was not persisted, so its conservative spend/unit hold
remains. One completed unit plus that hold exhausted the account's two units; an actual
third campaign request returned 429 without contacting the provider. This is not evidence
of two successful exports. The generation's recorded usage estimate is $0.530458; the edit
retains its $1.20 ceiling. These are ledger estimates, not a provider invoice.

A successful paid edit export still needs separate owner approval and verification.
Direct video stays off by default. Product review, refreshed website captures and deployed
verification also remain release work. Keep #190 and #158 In Progress until their
respective acceptance criteria are verified. The other parent issues are not closed by
this change.
