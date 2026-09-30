"""Create the PayPal product and the monthly plan, once. Prints the plan id for PAYPAL_PLAN_ID.

    cd api && python -m app.jobs.paypal_setup --dry-run      # show the payloads, call nothing
    python -m app.jobs.paypal_setup                          # sandbox or live, per PAYPAL_ENV
    python -m app.jobs.paypal_setup --product-id PROD-XXXX   # reuse an existing product
    python -m app.jobs.paypal_setup --vat-percent 18         # only if VAT is to be added on top

Reads PAYPAL_ENV, PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from the environment (or .env).
Prints ids only (a plan id is not a secret: the browser sends it to PayPal anyway), never
the credentials or the token.

The plan is 99 ₪ a month (paypal.PRICE_ILS, = PRICE_ILS in web/lib/pricing.ts), billed
until cancelled, with no PayPal-side trial: the free month is ours (services/billing.py).
Instead, the page sets each subscription's `start_time` to the day the free month ends.

Idempotent-ish: products and plans are created with fixed PayPal-Request-Id values, so a
rerun within PayPal's idempotency window returns the same objects, and an existing ACTIVE
plan of the product with the same price is reused rather than duplicated. A plan's price
cannot be edited into another currency later; a price change means a new plan (bump
PLAN_VERSION) and a new PAYPAL_PLAN_ID.
"""

from __future__ import annotations

import argparse
import json
import sys

from app.services import paypal

PRODUCT_VERSION = "v1"
PLAN_VERSION = "v1"


def product_payload() -> dict:
    return {
        "name": "IsraMarket",
        "description": "Monthly marketing plan, posts and research for small businesses in Israel",
        "type": "SERVICE",
        "category": "SOFTWARE",
    }


def plan_payload(product_id: str, vat_percent: float = 0.0) -> dict:
    payload: dict = {
        "product_id": product_id,
        "name": f"IsraMarket monthly {paypal.PRICE_ILS} ILS",
        "description": "IsraMarket, billed monthly. Cancel anytime.",
        "status": "ACTIVE",
        "billing_cycles": [
            {
                # No TRIAL cycle: the free month is ours, the first charge is the
                # subscription's start_time (the day the free month ends).
                "frequency": {"interval_unit": "MONTH", "interval_count": 1},
                "tenure_type": "REGULAR",
                "sequence": 1,
                "total_cycles": 0,  # until cancelled
                "pricing_scheme": {"fixed_price": {"value": str(paypal.PRICE_ILS), "currency_code": paypal.CURRENCY}},
            }
        ],
        "payment_preferences": {
            "auto_bill_outstanding": True,
            "setup_fee": {"value": "0", "currency_code": paypal.CURRENCY},
            "setup_fee_failure_action": "CONTINUE",
            # PayPal retries a failed charge; after 3 failures the subscription is suspended.
            "payment_failure_threshold": 3,
        },
    }
    if vat_percent > 0:
        payload["taxes"] = {"percentage": f"{vat_percent:g}", "inclusive": False}
    return payload


def _same_price(plan: dict) -> bool:
    for cycle in plan.get("billing_cycles") or []:
        price = ((cycle.get("pricing_scheme") or {}).get("fixed_price") or {})
        if cycle.get("tenure_type") == "REGULAR" and price.get("currency_code") == paypal.CURRENCY:
            try:
                return float(price.get("value")) == float(paypal.PRICE_ILS)
            except (TypeError, ValueError):
                return False
    return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create the PayPal product and monthly plan.")
    parser.add_argument("--dry-run", action="store_true", help="print the payloads and call nothing")
    parser.add_argument("--product-id", default="", help="use this existing PayPal product")
    parser.add_argument("--vat-percent", type=float, default=0.0, help="add VAT on top of the price (default: none)")
    args = parser.parse_args(argv)

    if args.dry_run:
        print(f"environment: {paypal.env()} ({paypal.base_url()})")
        print("product:")
        print(json.dumps(product_payload(), indent=2, ensure_ascii=False))
        print("plan:")
        print(json.dumps(plan_payload(args.product_id or "<product id>", args.vat_percent), indent=2, ensure_ascii=False))
        return 0

    if not paypal.credentials_configured():
        print("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set (see docs/billing.md).", file=sys.stderr)
        return 2

    try:
        product_id = args.product_id.strip()
        if product_id:
            if paypal.get_product(product_id) is None:
                print(f"product {product_id} not found in {paypal.env()}", file=sys.stderr)
                return 1
        else:
            product = paypal.create_product(product_payload(), request_id=f"isramarket-product-{PRODUCT_VERSION}")
            product_id = str(product["id"])
        print(f"product: {product_id}")

        existing = [
            plan for plan in paypal.list_plans(product_id)
            if plan.get("status") == "ACTIVE" and _same_price(plan)
        ]
        if existing:
            plan_id = str(existing[0]["id"])
            print(f"plan (existing, ACTIVE, {paypal.PRICE_ILS} {paypal.CURRENCY}/month): {plan_id}")
        else:
            plan = paypal.create_plan(
                plan_payload(product_id, args.vat_percent),
                request_id=f"isramarket-plan-{PLAN_VERSION}-{product_id}",
            )
            plan_id = str(plan["id"])
            print(f"plan (created, {paypal.PRICE_ILS} {paypal.CURRENCY}/month): {plan_id}")
    except paypal.PayPalError as exc:
        print(f"PayPal call failed: HTTP {exc.status} {exc.name} (debug_id={exc.debug_id})", file=sys.stderr)
        return 1

    print()
    print(f"Set PAYPAL_PLAN_ID={plan_id} ({paypal.env()}) in /etc/isramarket/extra.env or api/.env.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
