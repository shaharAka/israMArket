# IsraMarket

End-to-end marketing for Israeli small businesses. The MVP generates a monthly strategy and then iterates from live performance data.

## What ships in the MVP

- **Onboarding:** website scrape plus a 5-question profile (type, offerings, monthly budget, top competitors, sales vs. brand).
- **Localized strategy:** Gemini extracts a USP against competitor sites, then builds a roadmap for the **civil Gregorian month** (January–December). Jewish holidays and Israeli shopping days are pinned onto those dates — the grid is never a Hebrew-month calendar.
- **Cards:** the business's own photographed content is preferred; an AI image is generated only as a fallback or when the user asks for one. Typography-only cards render no photo at all. Cards export as real PNGs at 1080x1350, 1080x1080 or 1080x1920.
- **Optimization loop:** GA4 Data API + Meta Graph API sync, then weekly Gemini recommendations. Either source may be connected alone. Loyalty/CRM stays out of scope; events go out through signed webhooks (Smoove, Zapier).

Models: `gemini-3.7-flash` for strategy and recommendations, `gemini-3.5-flash-lite` for
site extraction, `gemini-3-pro-image` (Nano Banana Pro) at 2K for images. All are
overridable via `.env`; see `.env.example`.

## Run locally

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd web
npm install
npm run dev
```

Copy `.env.example` to `.env` in the repo root (and `api/.env`). Set `GEMINI_API_KEY`.
Also set a real `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` before storing any OAuth tokens —
the encryption key is derived from `JWT_SECRET` only when that secret is not the shipped
default. Do not commit `.env`.

The API binds to `127.0.0.1` by default. Do not expose it directly to a network: `/docs`
and `/openapi.json` are public, and the rate limiter trusts `X-Forwarded-For` (see
`TRUST_FORWARDED_FOR`).

GA4 and Meta OAuth also need their client IDs and secrets. Until those are set, the
connect buttons return a clear error, and `/performance` shows an empty state. Note that
`web/lib/api.ts` contains a **demo mode** (entered from the login screen) with fully
mocked business, strategy and performance fixtures — that is UI scaffolding for
designing without an API key, and it is clearly flagged in the UI when active.

Open [http://localhost:3000](http://localhost:3000).
