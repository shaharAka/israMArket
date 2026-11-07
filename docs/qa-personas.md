# Isolated browser QA personas

The QA personas are fictional test accounts backed by a throwaway SQLite database. They
are not part of the app's customer demo or runtime fixtures. The default minimal fixture covers
the five named business paths from `web/lib/uxFlows.ts`: online shop, physical shop,
designer/service, software, and fundraising. Each has one fictional draft campaign post,
one audience segment, a persona-specific KPI, a monthly hypothesis with three qualitative
targets, and four weekly focus rows so browser QA can edit and save a real strategy
response. The post's reach is only an intermediate content measure. No post is approved
or published; reported outcomes and budgets stay unknown, with no measured results.

## Start the test API

From the repository root, run:

```sh
PYTHONPATH=api:api/tests /Users/shahar/Documents/isramarket/api/.venv/bin/python \
  api/scripts/serve_qa_personas.py --port 8765 --web-origin http://127.0.0.1:3160
```

The server binds only to `127.0.0.1`. It creates a fresh SQLite database and media
directory in a temporary folder, prints the five test emails and a QA-only password, and
removes the folder when stopped with Ctrl+C. Provider and OAuth credentials are blank.
Billing enforcement is enabled with deliberately fake, non-routable PayPal placeholders
so the expired-trial generation gate is exercised. Do not open checkout or reuse these
placeholder values outside the isolated local QA server.

Start or restart the web app in a separate terminal with the API proxy aimed at that
process:

```sh
API_ORIGIN=http://127.0.0.1:8765 npm --prefix web run dev -- --hostname 127.0.0.1 --port 3160
```

Sign in at `http://127.0.0.1:3160/login` with any printed persona email and the printed
QA-only password. The accounts have separate business IDs and no live customer data.

## Populated campaign and read-failure cases

Add `--scenario populated` to the API command for twelve dated posts per account across
four weeks. It uses existing public showcase media copied into the temporary account's
media folder, native channel/format combinations, draft/approved/published states, and
explicitly tagged `qa_fixture` measurements. These numbers are fictional QA inputs,
not live provider results. The software example is Maslul, a project-management product.

Add `--fail-read history` or `--fail-read allowance` to simulate a 503 for that read only.
These controls exist only in the local QA launcher, never the production app. With
history unavailable, stored campaign posts must remain readable and editor links usable,
while starting new campaign revisions stays blocked until history can be checked. With
allowance unavailable, the saved campaign must remain visible without inventing quota.
Use `--fail-post-saves 1` to fail one editor save, then let a manual retry succeed without
restarting or losing the sign-in. A failed design save must remain visibly unsaved, retain
the chosen design and text, and block approval/export until it succeeds.

Restart without `--fail-read` to restore the read. Each restart creates a fresh database
and signing key, so sign in again; the sign-in return path should preserve the campaign
week and interface language.

For recovery, type a manual post in a different content language, reload, and verify text,
channel and language remain. In the editor, save a different caption in another session
before saving the first tab: the first save must offer an explicit local/server choice,
not overwrite the newer caption. No paid generation or publishing is needed for these
checks. Run the helper behavior scripts with `node web/scripts/test-post-caption-drafts.mjs`
and `node web/scripts/test-campaign-recovery.mjs`.

## Check the fixture

```sh
PYTHONPATH=api:api/tests /Users/shahar/Documents/isramarket/api/.venv/bin/python \
  -m unittest api.tests.test_qa_personas -v
```

The test creates its own independent temporary database. It signs into every persona and
checks authenticated business, strategy, audiences, setup, trial, allowance, generation,
performance, and billing responses; it edits and reloads each draft, asserts that business
IDs do not cross between accounts, results remain explicitly unmeasured, and the
expired-trial generation gate, exhausted-image quota, and failed-generation state behave
as seeded.

## Fixture contract

`api/tests/fixtures/qa_personas.json` is the only case definition. Each case supplies an
`id`, fictional business `name` and `email`, business segment/model/type, location,
primary goal, offering, one fictional audience and one draft campaign post, and these
controlled state fields:

- `trial`: `active` or `expired` (seeded relative to launch time).
- `images`: `available` or `exhausted` (the latter uses the actual trial allowance cap).
- `generation`: `idle` or `failed` (failed state has a test-only, non-provider error).

The seeder refuses to run unless the database is SQLite and contains no existing users or
businesses. Minimal mode seeds no assets or measured results. Neither mode seeds OAuth connections,
customer files, subscriptions, or live provider configuration. Extend cases only with fictional, clearly
identified content and update the API fixture test for each new state.
