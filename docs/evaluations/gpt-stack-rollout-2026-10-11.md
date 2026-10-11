# GPT text-stack rollout — 11 October 2026

Shahar approved switching the text stack after PRs #196 and #197. Production text
routing is enabled through `TEXT_PROVIDER=openai` and `POST_MODEL=openai`, not by
rewriting saved customer work. Media engines and account-level caps stay unchanged.

## Roles and compatibility

- GPT-6 Luna, LOW: diagnosis/recommendation, Hebrew interview, small text rewrites/checks.
- GPT-6.1 Sol: research, extraction, planning, posts, support, Design DNA and vision.
  Existing workload LOW/MEDIUM settings remain. Non-Hebrew interviews use Sol LOW.
- Responses API, Standard processing, strict JSON and `store=false`. No hosted tools.
  Research still uses our guarded public-site/connector readers and supplied evidence.
- Optional schema fields become nullable required fields for the API, then introduced
  nulls are omitted to restore the original app contract. Explicitly nullable values stay.
- Output/time caps, single-attempt workloads, sanitized errors and usage hooks remain.
  Default GPT transient retries are capped at two; timeouts and billing/auth errors are
  not automatically retried. Usage accounts for cache writes and reasoning once.

## Bounded fictional verification

20 live requests, no paid retries or image/video generation. Estimated OpenAI usage:
**$0.303390 total**, from returned token counts at published Standard prices.
No customer data or customer account writes. An invalid fundraising fixture was corrected
before its model request; already-completed calls were reused rather than repeated.

The production gateway completed site extraction, all five interview routes, USP,
monthly roadmap, weekly post writing in Hebrew/English/Arabic/Russian, one tiny synthetic
vision input, grounded support and the two-stage missing-event-report analysis.

Initial Luna Arabic/Russian interviews returned Hebrew questions despite their requested
locale. These were valid JSON, but failed semantic review. Adding explicit language in
schema/prompt did not solve the Arabic case. Final routing uses Sol LOW for non-Hebrew
interviews: English, Arabic and Russian retests all returned questions in the selected
language in 2.5–3.6 seconds. A script guard uses the existing localized fallback if a
reply is primarily in another language, without a paid retry. Source quotes are not
translated. Hebrew keeps Luna LOW; both shop and service interview checks completed.

All four post batches preserved their selected content language. Their captions retained
the supplied Haifa/small-apartment/full-planning offer and the distinction that the firm
does not sell furniture. Existing content-language settings and saved/approved posts are
not migrated or translated. Missing-event analysis recommended reading the event report,
not treating unavailable purchases as zero.

This is compatibility/sanity evidence for the approved rollout, not a general creative
quality or latency study. The initial comparison remains in the linked benchmark reports.

## Repository and deployment checks

- Final complete API suite: 1,513 tests passed (including 12 new gateway tests).
- Interview locale-contract regression: 16 tests passed after the migration fix.
- Pre-restart environment guard/rollback: 2 new tests passed; all 19 script tests passed.
- Typecheck, lint and production web build passed; 4-language catalog/formatter checks passed.
- Deployment uses the existing exact-commit update, pre-update backup and health checks.
- `openai-api-key` lives in Secret Manager; only the VM service account receives access
  through its secretAccessor grant. No key in git, runtime UI or extra.env.
- Privacy processors and translated release notes accompany the same release.
- Rollback restores both TEXT_PROVIDER and POST_MODEL to gemini, then recreates containers.

Final CI, merged revision and live verification evidence are recorded in the PR and #58.
The remaining proactive-update thresholds/owner controls on #58 remain open.

## Primary references

[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[API data controls](https://developers.openai.com/api/docs/guides/your-data).
