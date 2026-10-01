# IsraMarket: the plan

One shared plan for the owner, Claude and Codex. **Read it before starting; update it in the
same PR that changes the work.** Each item has one owner. If you need something from another
owner, add it under their name rather than doing it in their lane.

- **Live:** https://34-165-93-157.sslip.io (main `56021d2`, 2 Oct 2026). Domain `isramarket.co.il`
  is registered but not live yet (see Blocked).
- **Updated:** 2 Oct 2026 by Claude.

## Who owns what

| Owner | Lane |
|---|---|
| **Shahar (owner)** | Decisions, accounts and consoles (Google, Meta, PayPal, LiveDNS), anything needing his identity, sign-in or payment. |
| **Claude** | Product and design of every screen (DESIGN-STANDARD.md, including screens Codex builds), the landing, plan / strategy / posts features, the post designer (Design DNA), image models. Branch `ux-simplification` (+ agent worktrees). |
| **Codex** | Integrations (Google: GA4, Search Console, GBP; Meta: Pages, Instagram, ads, Pixel; future shop platforms), provider reviews and approvals, privacy / legal pages, deploy, infra and the domain. Branches `codex/*`. |

**How we work**
- Every change is a PR to `main`. Whoever merges deploys:
  `gcloud compute ssh isramarket-vm --project isramarket --zone=me-west1-a --tunnel-through-iap --quiet --command 'sudo /srv/isramarket/deploy/gcp/update.sh'`.
  Then the item moves to Done here.
- **UI built by Codex** follows `web/DESIGN-STANDARD.md`, and Claude does a design pass before or right after merge. Add the item under Claude → "Design pass".
- **Shared files** (`web/app/globals.css`, `web/components/AppShell.tsx`, `web/lib/api.ts` types, `api/app/schemas.py`, `api/app/db.py`): small, additive changes. Pull main first.
- **Never in chat, code or logs:** secrets, tokens, passwords. Keys go into Secret Manager or `.env` by the owner.
- **Paid resources:** show the cost to the owner first.

## Now (in progress)

| # | Item | Owner | Status | Links |
|---|---|---|---|---|
| N1 | **Design DNA v2**: style as an art direction in words; the real logo (same-origin copy, small); colours from the logo + site (ΔE ≤ 6, never moved for uniqueness); one message per post; text in the photo's empty area; photo-led mix; ornament only from the brand; designer-review scoring; real test on tazizi.co.il | Claude | 2 agents building (server + renderer) | `docs/design-dna.md` Revision 1 |
| N2 | **Customer Pixel setup guide** (Wix / Shopify / WordPress instructions, refresh list, verification identity) | Codex | PR open, waiting for Claude's design pass (C1) | [#33](https://github.com/shaharAka/israMArket/pull/33) |
| N3 | **Domain move** to `www.isramarket.co.il`: site-host switch, aliases + 308 redirects, then Google and Meta origins / callbacks / policy URLs together | Codex | DNS on `serverHold` at the registry; draft PR #28 ready | [#28](https://github.com/shaharAka/israMArket/pull/28) |
| N4 | **Meta app approval**: Tech Provider done, `ads_read` ready for testing, data-deletion URL saved | Codex + Shahar | Blocked on a business portfolio (portfolio limit) and IsraMarket's legal entity | `docs/meta-approval-plan.md` |

## Next (ready, in order)

**Claude**
- C1 **Design pass on N2** (Pixel setup guide, [#33](https://github.com/shaharAka/israMArket/pull/33)), before it merges.
- C2 **Results page word budget:** 200 words vs 140. Fold the WhatsApp table and the Instagram numbers into "more" (needs D1).
- C3 **Today word budget:** 162 vs 150.
- C4 **Plan page** is ~284 words once a month exists. Tighten it.
- C5 **Plan editing after login:** today it shows "בקרוב".
- C6 **Setup checklist** should read the plan's `integrations_checklist`. The tazizi WhatsApp is labelled "new" by mistake.
- C7 **Jargon:** "רימרקטינג" in `web/lib/budget.ts`.
- C8 **Quick image drafts while the owner waits** (`gemini-3.1-flash-lite-image`). Not built.

**Codex**
- X1 **Security check:** the per-IP limit trusts the client's `X-Forwarded-For` through the Next proxy, which also affects login limits. Verify and fix.
- X2 **Facebook / TikTok data guides** are missing on the connections page. Claude does the design pass.
- X3 **Google OAuth verification**, after N3. Uses the new domain and policy URLs.
- X4 **GBP (Google Business Profile) API**, once a profile is verified for 60+ days (needs D5).
- X5 **Muse connector draft** is blocked until a real restricted connector API exists.

## Blocked / waiting on Shahar

| # | What | For |
|---|---|---|
| B1 | `isramarket.co.il` is on **serverHold** at the .il registry. Ask LiveDNS / ISOC-IL why. Don't disable the transfer lock. | N3 |
| B2 | Meta: a **business portfolio** for IsraMarket (Meta says the portfolio limit is reached) and the legal entity details | N4 |
| B3 | Meta / Facebook identity check on your account | N4 |
| B4 | Store-manager Meta access for tazizi, so its real Pixel shows up | N2 test |

## Decisions needed from Shahar

| # | Question | Default if no answer |
|---|---|---|
| D1 | Results page: fold the WhatsApp table + Instagram numbers behind "more"? | Fold |
| D2 | Price ₪99/month: VAT included or on top? | Included |
| D3 | After account deletion: keep payment records for bookkeeping? | Keep payments only, anonymised |
| D4 | Gemini paid tier, to confirm for the privacy wording (`web/lib/company.ts`) | Paid tier |
| D5 | Tazizi's Google Business Profile: verified for how long? | Wait |
| D6 | Israeli tax invoices: connect Morning / Green Invoice or iCount, and when? | Later |

## Later
- Shop platform integrations (Wix / Shopify / WooCommerce orders), owner: "later". Codex.
- An OpenAI image model in the bench, when a key exists. Claude.
- Rate limits and cache are in-memory per process. Fine on one VM; revisit when scaling. Codex.

## Done (recent)
| PR | What | Owner |
|---|---|---|
| [#32](https://github.com/shaharAka/israMArket/pull/32) | Design DNA v1: own style per business, photos real first, Muse Image default with NB2 fallback, cost log, brand page "הסגנון שלכם", demo bakery photos | Claude |
| [#31](https://github.com/shaharAka/israMArket/pull/31) | Cookie disclosure for Google and Meta security cookies | Codex |
| [#30](https://github.com/shaharAka/israMArket/pull/30) | Meta screens to the design standard | Claude |
| [#29](https://github.com/shaharAka/israMArket/pull/29) | Meta privacy and data-deletion page | Codex |
| [#27](https://github.com/shaharAka/israMArket/pull/27) | Simple Meta setup, ads reporting, Pixel checks | Codex |
| [#26](https://github.com/shaharAka/israMArket/pull/26) | Connected posts + instruction rewrite + hypothesis statuses | Claude |
| [#25](https://github.com/shaharAka/israMArket/pull/25) | Search Console reports after Google connection | Codex |
| [#24](https://github.com/shaharAka/israMArket/pull/24) | Finesse pass: new landing, design standard, every screen | Claude |
| [#23](https://github.com/shaharAka/israMArket/pull/23) | Recommendations ready to act on | Codex |

Older history: git log, and the design docs in `docs/`.
