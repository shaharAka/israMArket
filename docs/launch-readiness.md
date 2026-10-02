# Launch readiness

Release gate: [#73](https://github.com/shaharAka/israMArket/issues/73). Campaign:
[#74](https://github.com/shaharAka/israMArket/issues/74). Prepared 2 October 2026.

Launch is an explicit decision after the required gates pass. A deployed preview, developer
permission or green build is not a public-launch sign-off. This is the checklist definition;
the issue and private Project hold current progress. Record **owner, date, exact revision,
environment, outcome and evidence** for every checked item. Unknown is not passed.
Keep account identities, private security findings, tokens and controller declarations out
of this public document. The private inventory lists actual accounts and resources.

## 1. Test setup becomes intentional production setup

Owner: Codex; account/ownership decisions: Shahar.

- [ ] Inventory Google sign-in test users, OAuth publishing mode, granted scopes, authorized
  origins/callbacks and provider test identities. Keep identity login separate from Analytics
  consent. Verify the actual production configuration; do not infer it from a successful login.
- [ ] Inventory Meta app mode, app roles, test assets/tokens and permission access levels.
  A successful app-admin connection does not demonstrate ordinary-customer access.
- [ ] Identify the separate IsraMarket customer workspace and its owned measurement/social
  assets. Preserve the existing customer workspace and its Analytics connection (#66).
- [ ] Review personal administrator versus business/support identities, recovery and a
  second authorized administrator. Do not remove the working administrator before replacement
  access is tested. A new support mailbox is not automatically an application account.
- [ ] Classify test accounts, sample businesses, screenshots, demo datasets, temporary grants
  and billing records: keep, restrict, replace, revoke or delete. Confirm irreversible cleanup
  separately; never clean up customer data merely because its workspace has a test-like name.
- [ ] Rotate any development credential exposed outside its intended secret store; replace
  references, verify dependent jobs, and revoke the previous credential. Never copy keys into
  this checklist or GitHub. Use scoped credentials and production secret storage.
- [ ] Review public `/design`, `/motion`, `/dev` and review routes. Decide which remain public
  samples and which require access control or removal. `noindex` alone does not restrict access.
- [ ] Confirm synthetic examples are labeled. Test identities, sample data and review events
  must not contaminate production campaign reports.

## 2. Domain and public provider access

Owner: Codex; owner/registrar/provider dependencies: Shahar and the providers.

- [ ] Resolve domain activation, authoritative DNS and certificate issuance; migrate the
  canonical site, HTTPS redirects, cookies, origins and OAuth/policy URLs together (#40).
  Keep the current working deployment until the replacement is verified.
- [ ] Verify Google domain ownership, real public policy/contact URLs, minimum scopes,
  review evidence and the resulting public consent state (#42). Recheck refusal, wrong
  account, refresh/reconnect and an ordinary user outside the development test list.
- [ ] Complete truthful Meta owner/controller requirements and review evidence; record
  actual decisions per requested permission (#41). Verify an ordinary customer's Page and
  professional Instagram selection, read-only ads reporting and customer-specific Pixel.
- [ ] Do not advertise Google Business Profile, Muse SMB or automatic social publishing
  as available until eligibility, implementation and access are evidenced (#51, #52).
  Optional future integrations may be deferred in the release scope explicitly.
- [ ] Separate authorization, chosen asset, first successful read, no history and receiving
  a Pixel event. Check cancellation/recovery and isolation between two businesses (#45).

## 3. Product value and customer experience

Owner: Claude; temporary implementation coverage: Codex.

- [ ] Complete truthful shop and service onboarding, including unknowns, supplied ranges,
  bad links, calculation failure, return-to-edit and saved-draft recovery.
- [ ] Verify direct sign-up, existing-account login, Google sign-in and saving a pre-signup
  plan. Keep account and business ownership correct; no hidden workspace replacement.
- [ ] Present the saved ongoing plan first, with one understandable next action. Verify
  skip/repair/resume of relevant connections and retention of completed answers (#43, #44).
- [ ] With existing usable materials, generate, edit and approve a first post promptly.
  Open the real manual publishing kit, publish to a confirmed destination and save its URL.
  Do not confuse approval with publication, or a calendar stage with a waiting requirement.
- [ ] Read actual evidence and give one plain-language finding, uncertainty and next action
  linked to the plan/post (#46). Clicks, messages, suitable inquiries and sales stay distinct.
- [ ] Run the same cycle as IsraMarket's actual customer workspace (#66). Record time to
  first useful action and the points needing assistance. The synthetic demo does not satisfy it.
- [ ] Check Hebrew/RTL, mixed URLs/numbers, small screens, keyboard/focus, reduced motion,
  loading, retry and offline/error messages on the principal routes.

## 4. Privacy, commercial terms and support

Owner: Shahar; implementation: Codex; copy/UX review: Claude.

- [ ] Review the actual controller/contact, terms, privacy, consent, data deletion and
  retention against the services used. Use a functioning contact address and test delivery.
- [ ] Resolve private owner declarations and commercial decisions in the private Project.
  Record processor/vendor use and rights for uploaded and generated content.
- [ ] Decide beta/free/paid launch scope. Verify real prices, trial end, cancellation,
  payment confirmation, invoices and support handling if paid subscriptions are enabled.
  Sandbox or mocked billing is not a passed live-payment check.
- [ ] Make support reachable from the app; prepare concise wrong-account, no-data,
  connection-denied, failed generation and manual-publication help.
- [ ] Review asset/music licenses, owner consent, generated-content labeling and absence
  of invented endorsements/results. Do not mail or message an unconsented prospect list.

## 5. Operations, security and controlled costs

Owner: Codex; private security and spending decisions: Shahar.

- [ ] Link the exact release CI result and live deployed revision. Smoke-check the customer
  paths after rollout. Prior evidence for an older revision is supporting history only.
- [ ] Restore a backup into an isolated environment and verify the result; record recovery
  and rollback procedure, retention and who can execute it. A copied backup alone is insufficient.
- [ ] Complete private security/rate-limit verification, account/data isolation and deletion
  checks. Keep findings private. Confirm internal ports and secrets remain protected.
- [ ] Verify provider failure fallback, generation timeouts/retries and queued-job recovery.
  Set a launch budget and usage alert/stop rule. Track cost per accepted post/reel including retries.
- [ ] Check logs/alerts are actionable, exclude secrets/customer answers, and reach a named
  operator. Record the response path for outage, broken consent or incorrect customer data.

## 6. Campaign and measurement

Owner: Claude; account and publication sign-off: Shahar; instrumentation: Codex.

- [ ] Approve the launch positioning and first-month drafts in `docs/isramarket-dogfood.md`.
- [ ] Confirm owned Page/Instagram/other destinations, actual launch day, working destination
  URLs and distinct publication tracking tags. Do not guess account handles.
- [ ] Finish and inspect one representative reel/export (#71), then render approved variants.
  Record owner review, rights, captions, safe areas, links and actual accepted-export costs.
- [ ] Install and validate IsraMarket's own consent-aware measurement. Connecting Analytics
  reads a property; it does not install website collection. Test allowed and refused consent.
- [ ] Observe tagged visits → onboarding → saved plan → first useful action without sending
  answers or contact data to analytics. Keep source reads and content actions separate.
- [ ] Schedule weekly review and record actual publication URLs, observed denominators,
  suitable-owner feedback and one next adjustment. Set outcome targets after a real baseline.

## Launch day and the first 48 hours

- [ ] Required gates above have evidence; optional deferrals are named, scoped and honestly
  reflected in the product. No required blocker is silently waived.
- [ ] Shahar approves launch scope/date and destinations; the team names the operator and
  current known limitations. Keep a rollback decision and executable release reference.
- [ ] Run a final external sign-in/save/connect/post/read smoke test on the canonical domain.
- [ ] Publish the approved first assets; log live URLs and check the actual tagged landing visit.
- [ ] Monitor connection, save and generation failures, support and spend at launch and again
  within 24–48 hours. Correct high-friction failures before expanding promotion.

Completion is the signed release record in #73, not checking boxes in a planning document.
