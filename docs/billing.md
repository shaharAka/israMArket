# Billing: PayPal subscriptions

## How it works

- **Price:** 99 ₪ a month (`PRICE_ILS` in `web/lib/pricing.ts`, the same number as
  `PRICE_ILS` in `api/app/services/paypal.py`; a test keeps them equal). VAT is not
  included (see "VAT" below).
- **The free month is ours**, not PayPal's. It runs 30 days from `users.trial_started_at`
  and ends at the start of day 31 (midnight, Israel time), the same moment `GET /trial`
  turns `ended`. Signup never asks for a card.
- **Paying:** on `/billing` (linked from `/account`, and from a one-line reminder on
  Today in the free month's last 7 days and after it). PayPal's own buttons show a PayPal
  button and "Debit or Credit Card". Card details are typed into PayPal's window and never
  reach our servers.
- **The first charge** is the subscription's `start_time`: the day the free month ends
  (or the end of an already-paid period, when someone re-subscribes after cancelling).
  So subscribing early never shortens the free month. The PayPal plan has no trial cycle.
- **Nothing the browser says is trusted.** After PayPal approves, the page sends only the
  subscription id. The API reads it back from PayPal and keeps it only if the plan is
  `PAYPAL_PLAN_ID`, `custom_id` is the signed-in user's id, and the status is
  APPROVAL_PENDING, APPROVED or ACTIVE. APPROVAL_PENDING is stored but gives no access.
- **Cancelling:** on `/billing`, any time. We cancel at PayPal, and access continues to
  the end of the period already paid for (or the end of the free month).
- **Webhooks** keep the status current (activated, updated, cancelled, suspended,
  expired, payment failed) and record every completed payment once, by PayPal's sale id
  (`payments` table).
- **Deleting the account** cancels the PayPal subscription first (best effort), then
  deletes the subscription and payment rows with everything else. If the cancel fails,
  the API logs an error with the subscription id: cancel it by hand in PayPal.
- **Enforcement** (`BILLING_ENFORCE`, off by default): once the free month plus 3 grace
  days is over with nothing paid, the AI generation endpoints answer 402 with a Hebrew
  message pointing to the subscription page. Viewing, editing, exporting, the account and
  deletion always work. It never applies while PayPal is not configured. The gated
  endpoints are listed in `api/tests/test_billing.py` (`GATED`); the weekly research job
  skips locked accounts too.

## Settings

| Variable | Where on the VM | Notes |
|---|---|---|
| `PAYPAL_ENV` | `/etc/isramarket/extra.env` | `sandbox` (default) or `live` |
| `PAYPAL_CLIENT_ID` | secret `paypal-client-id` | public, but kept with its secret |
| `PAYPAL_CLIENT_SECRET` | secret `paypal-client-secret` | |
| `PAYPAL_PLAN_ID` | `/etc/isramarket/extra.env` | printed by `python -m app.jobs.paypal_setup` |
| `PAYPAL_WEBHOOK_ID` | secret `paypal-webhook-id` | the webhook's id in the PayPal app |
| `BILLING_ENFORCE` | `/etc/isramarket/extra.env` | `false` until you decide |

Blank credentials or plan = "payment is not open yet": `/billing` says so quietly, no
reminder appears, nothing is enforced. Sandbox and live have separate apps, credentials,
plans and webhooks, so switching `PAYPAL_ENV` means replacing all four values.

## Owner checklist: sandbox first, then live

### Sandbox

1. Sign in to **developer.paypal.com** with the PayPal Business account.
2. **Apps & Credentials** > the **Sandbox** tab > **Create App** (type: Merchant).
   Copy the **Client ID** and **Secret**.
3. Put them in `api/.env` locally (or the Secret Manager secrets on the VM,
   `deploy/gcp/secrets.md`) with `PAYPAL_ENV=sandbox`.
4. Create the product and plan:
   ```
   cd api
   python -m app.jobs.paypal_setup --dry-run   # shows what will be created, calls nothing
   python -m app.jobs.paypal_setup             # prints PAYPAL_PLAN_ID=P-...
   ```
   Set `PAYPAL_PLAN_ID` to the printed value. Running it again reuses the ACTIVE 99 ₪ plan.
5. In the same sandbox app > **Webhooks** > **Add Webhook**:
   - URL: `https://<host>/backend/billing/paypal/webhook`
   - Events: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`,
     `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`,
     `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`,
     `PAYMENT.SALE.COMPLETED`.
   Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`. PayPal cannot reach `localhost`;
   test webhooks on the deployed host (sslip.io works).
6. Restart the API (`update.sh --recreate` on the VM).
7. **Sandbox buyer test.** developer.paypal.com > **Testing Tools > Sandbox Accounts**
   has a Personal (buyer) account; open it to see its email and password. On `/billing`,
   press the PayPal button and sign in as that buyer. Check:
   - PayPal's window shows 99 ₪ a month and the first payment on the free month's end date;
   - `/billing` then says the subscription is active, with that date;
   - the webhook deliveries in the app's Webhooks page show 200;
   - "לבטל את המנוי" cancels it (PayPal's sandbox buyer account shows it cancelled).
8. **Card option check.** On `/billing`, confirm the "Debit or Credit Card" button appears
   under the PayPal button. PayPal decides where it is offered (it depends on the merchant
   account's country and settings). If it is missing, check in the PayPal Business account
   that card payments are enabled; the code never disables card funding. In sandbox, pay
   with a card from **Testing Tools > Credit Card Generator**.

### Live

1. developer.paypal.com > **Apps & Credentials** > the **Live** tab > create the app.
   New Client ID and Secret.
2. Replace the three secrets with the live values, set `PAYPAL_ENV=live`.
3. Run `python -m app.jobs.paypal_setup` again (it now talks to live PayPal) and set the
   new `PAYPAL_PLAN_ID`.
4. Add the webhook in the **live** app (same URL, same events) and set its id.
5. Restart. Subscribe once with a real account, then cancel it, and check the webhook
   deliveries show 200.
6. Only then consider `BILLING_ENFORCE=true`.

## VAT

The price is shown as "not including VAT" (`VAT_NOTE`). The plan charges exactly 99 ₪,
with no tax added, because the setup job adds no `taxes` block by default. **Open
decision:** if the business is an עוסק מורשה and VAT must be charged on top, create a new
plan with `python -m app.jobs.paypal_setup --vat-percent 18` (check the current rate) and
switch `PAYPAL_PLAN_ID`. Existing subscribers stay on the plan they subscribed to.

## Invoices (later)

PayPal's receipts are **not** Israeli tax invoices, and no copy in the app says they are.
Tax invoices (חשבונית מס / קבלה) will come from an invoicing service, Morning (Green
Invoice) or iCount. What exists for it today:

- Every completed payment is a row in `payments`: user, PayPal sale id, subscription id,
  amount (the exact decimal string PayPal sent), currency, date, PayPal's status.
- `payments.invoice_ref` is empty, reserved for the invoicing service's document id.

TODO when adding it: on `PAYMENT.SALE.COMPLETED` (routers/billing._on_sale_completed),
issue the document through the service's API with the customer's business details, store
its id in `invoice_ref`, and email it. Deleting an account currently deletes its payment
rows; bookkeeping may require keeping invoices for years, which the invoicing service (not
this database) would hold.
