# Isolated browser QA personas

The QA personas are fictional test accounts backed by a throwaway SQLite database. They
are not part of the app's customer demo or runtime fixtures. The fixture currently covers
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
businesses. It seeds no OAuth connections, assets, customer files, measured results,
subscriptions, or live provider configuration. Extend cases only with fictional, clearly
identified content and update the API fixture test for each new state.
