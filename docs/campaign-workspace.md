# Campaign workspace

`/campaign` groups the active plan's posts by week, orders dated posts chronologically,
and shows the artwork, purpose, action and publication state together. The workspace
response supplies the business's saved Design DNA; opening this screen creates no media.
Campaign is a separate primary navigation view between Plan and Posts, with its own
active state and megaphone icon on desktop and phone. It is not owned by the Posts tab.
Each week has a visible brief drawn from its saved focus, goals, measurement targets and
eligible post learning. Duplicate goals are combined; missing targets stay absent. This
does not call a model on page open or invent a new finding. The website's campaign step
reuses the same `CampaignWeek` and `CampaignPostCard` components with local fixtures:
research → plan → campaign → posts → learning. Its automatic demonstration opens a post
from the campaign; all public selections stay local and never create customer revisions.
The refreshed, read-only product capture is
[`platform-campaign-desktop.png`](../web/public/showcase/platform-campaign-desktop.png),
captured from `/design/business?persona=services&screen=campaign&lang=he` at the desktop
breakpoint. The live feature player remains interactive and uses those same components,
including the campaign step in its automatic cursor/click sequence.

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

After separate approval, one follow-up edit passed the actual campaign job, authenticated
download, full-duration decode and Keep in a fresh isolated account. Its ledger usage
estimate was $0.571798, below the $1.20 approved ceiling. The five-second 720×1280 output
retained an audio stream; comparison with the original soundtrack gave 0.994746 normalized
correlation. Frame review showed the requested blue background with closely aligned
subject poses and movement; this is not a guarantee of pixel-identical foreground colours.
Undo restored the original video/content language without replenishing its used unit.
This did not reset the first account's unresolved edit reservation or submit a paid retry.

The provider/export canary gate is verified. Direct video stays off by default until the
reviewed release is deployed and activated. Product review, refreshed website captures
and deployed verification remain release work. Keep #190 and #158 open until their respective release gates are verified. The other parent issues are not closed by
this change.


## Website review: pace, artwork and copy

The website hero changes features every seven seconds rather than 10.5. Research and
learning details change every five seconds, campaign weeks every 6.5, and the post/reel
section keeps nine seconds so its eight-second human-motion clip can finish. Progress
bars share those durations. Campaign playback visibly opens a post and returns to its
week; pause, keyboard focus, reduced motion and page visibility guards remain. Selecting
a feature, including the currently selected one, restarts its reading time.

Each business's public campaign now has three distinct creative roles using the actual
CardStage renderer: photo-only advice, a typography-led invitation and a new process
photograph with an editorial composition. Software uses a real product capture for the
third asset. Business typefaces and palettes stay consistent across the sequence. Three
new photographs and their provenance are in `public/showcase/campaign-variety-art-direction.json`.
These are local website fixtures, not evidence of customer generation or performance.

CardStage now measures its own layout size rather than transformed viewport bounds. A
scaled product walkthrough used to apply its parent zoom again inside every post, leaving
shrunken artwork inside blank frames. This fix applies to the shared editor renderer too.
The campaign explanation was rewritten in natural Hebrew first, then reviewed in English,
Arabic and Russian. This review does not change provider activation, quotas or customer drafts.

Validation for this review: web typecheck/lint/production build and all 9,141 four-language
messages passed. Sixteen hydrated business/language views had two week-one posts, correct
locale/direction and no horizontal overflow. Desktop 1440px and phone 390px story reviews
passed; on the phone the post opened at 2.5 seconds, returned by 5.5 and week two was visible
by 6.8. Pausing froze the view and manual week/post navigation remained usable. The shared
renderer’s painted width matched its stage in the zoomed walkthrough and the unscaled
local customer campaign. The website capture was refreshed after this fix. Provider quotas
and activation are unchanged; no new paid Gemini/provider calls were made.
