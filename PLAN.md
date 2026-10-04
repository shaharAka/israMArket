# IsraMarket: the shared work plan

Open work and progress now live in the [private GitHub Project](https://github.com/users/shaharAka/projects/2) and [linked repository issues](https://github.com/shaharAka/israMArket/issues). Read [the project workflow](docs/project-workflow.md) before taking a task. This file is the index and ownership agreement, not a second status board.

- **Updated:** 2 Oct 2026 by Codex, at Shahar’s request.
- **Live:** the existing deployment; the owned-domain migration is tracked separately below.
- Repository issues are public. Keep sensitive owner prerequisites and security findings in private Project drafts.

## Who owns what

- **Shahar:** business decisions, identity, accounts, agreements and paid-resource approval.
- **Claude:** product and design of every screen, landing, ongoing plan, posts and Design DNA.
- **Codex:** integrations, provider reviews, privacy pages, deployment, infrastructure and the domain.

A lane owner is not an active claim. Claim a task with your agent name, real branch and scope, then re-read for competing claims before editing. Keep one status label and mirror the Project status. Pull current main before editing shared files. UI built by Codex follows `web/DESIGN-STANDARD.md` and receives a Claude design pass before or right after merge.

Code work is Done after merge, deployment and verification. Documentation-only coordination work is Done after merge and accessibility verification; no production restart is required. Never put credentials or customer data into code, logs, chat or public issues.

## Open-work index

### Codex

- [#37 — Set up the shared GitHub work tracker and task-claiming workflow](https://github.com/shaharAka/israMArket/issues/37)
- [#38 — Ship and verify customer-specific Pixel setup](https://github.com/shaharAka/israMArket/issues/38)
- [#40 — Activate isramarket.co.il and migrate site and provider callbacks together](https://github.com/shaharAka/israMArket/issues/40)
- [#41 — Complete Meta App Review for public customer connections](https://github.com/shaharAka/israMArket/issues/41)
- [#42 — Complete Google OAuth verification on the owned domain](https://github.com/shaharAka/israMArket/issues/42)
- [#45 — Distinguish permission granted from usable data and guide connection recovery](https://github.com/shaharAka/israMArket/issues/45)
- [#46 — Turn connected analytics into plain-language findings and plan/post actions](https://github.com/shaharAka/israMArket/issues/46)
- [#50 — Add clear Facebook and TikTok data/setup guides](https://github.com/shaharAka/israMArket/issues/50)
- [#51 — Prepare Google Business Profile integration when eligibility is met](https://github.com/shaharAka/israMArket/issues/51)
- [#52 — Finish the Muse small-business connector application when a supported API exists](https://github.com/shaharAka/israMArket/issues/52)
- [#56 — Evaluate order integrations for Wix, Shopify and WooCommerce](https://github.com/shaharAka/israMArket/issues/56)
- [#57 — Investigate the Instagram Edits assistant and supported personalisation APIs](https://github.com/shaharAka/israMArket/issues/57)
- [#58 — Evaluate fast analysis and low-noise proactive updates](https://github.com/shaharAka/israMArket/issues/58)
- [#59 — Plan shared caching and rate limits before multi-instance deployment](https://github.com/shaharAka/israMArket/issues/59)
- [#73 — Launch readiness: replace test setup and verify every release gate](https://github.com/shaharAka/israMArket/issues/73)

### Claude

- [#39 — Apply the reviewed design pass to the customer Pixel flow](https://github.com/shaharAka/israMArket/issues/39)
- [#43 — Make the post-signup checklist follow the actual business plan](https://github.com/shaharAka/israMArket/issues/43)
- [#44 — Design and preview a guided, minimal connection journey after signup](https://github.com/shaharAka/israMArket/issues/44)
- [#47 — Simplify Results, Today and Plan copy and remove jargon](https://github.com/shaharAka/israMArket/issues/47)
- [#48 — Enable editing the ongoing plan after signup](https://github.com/shaharAka/israMArket/issues/48)
- [#49 — Use customer SVG logos safely in brand and post design](https://github.com/shaharAka/israMArket/issues/49)
- [#54 — Explore quick image drafts while a full post design is generated](https://github.com/shaharAka/israMArket/issues/54)
- [#55 — Benchmark an additional image model for post design](https://github.com/shaharAka/israMArket/issues/55)
- [#74 — Build IsraMarket’s launch campaign and first-month reels/posts](https://github.com/shaharAka/israMArket/issues/74)

### Shahar

- [#53 — Validate brand/post design with real owner-provided product photos](https://github.com/shaharAka/israMArket/issues/53)

## Private prerequisites

The private Project also contains the immediate client-IP/rate-limit security verification, owner provider/privacy prerequisites, and commercial/invoice/payment-retention decisions. Read their latest state there. Do not put private factual answers into public issue comments.

## Earlier plan references

Legacy N2 → #38; N3/B1 → #40; N4/B2/B3/B4 and D7/D8 → #41 plus private owner prerequisites. C1 → #39; C2/C3/C4/C7/D1 → #47; C5 → #48; C6 → #43; C8 → #54; C9 → #49. X1 → private security draft; X2 → #50; X3 → #42; X4/D5 → #51; X5 → #52; B5 → #53. D2/D3/D6 → private commercial decisions; D4 → private provider/privacy prerequisites. Later platform/model/scaling work → #55, #56 and #59.

## Recent delivered work

See merged PRs and deployment evidence for history: [Design DNA v2 #36](https://github.com/shaharAka/israMArket/pull/36), [Design DNA v1 #32](https://github.com/shaharAka/israMArket/pull/32), [cookie disclosure #31](https://github.com/shaharAka/israMArket/pull/31), [Meta UI #30](https://github.com/shaharAka/israMArket/pull/30), [privacy/deletion #29](https://github.com/shaharAka/israMArket/pull/29), [Meta/ads/Pixel baseline #27](https://github.com/shaharAka/israMArket/pull/27), [Search Console #25](https://github.com/shaharAka/israMArket/pull/25), and [actionable recommendations #23](https://github.com/shaharAka/israMArket/pull/23).

Older history is in git and `docs/`.
