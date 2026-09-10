# IsraMarket

End-to-end marketing for Israeli small businesses. The MVP generates a monthly strategy and then iterates from live performance data.

## What ships in the MVP

- **Onboarding:** website scrape plus a 5-question profile (type, offerings, monthly budget, top competitors, sales vs. brand).
- **Localized strategy:** Gemini extracts a USP against competitor sites, then builds a roadmap for the **civil Gregorian month** (January–December). Jewish holidays and Israeli shopping days are pinned onto those dates — the grid is never a Hebrew-month calendar.
- **Optimization loop:** GA4 Data API + Meta Graph API sync, then weekly Gemini recommendations. Loyalty/CRM stays out of scope; events go out through signed webhooks (Smoove, Zapier).

Models: `gemini-3.7-flash` for strategy and recommendations, `gemini-3.5-flash-lite` for site extraction.

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

Copy `.env.example` to `.env` in the repo root (and `api/.env`). Set `GEMINI_API_KEY`. Do not commit `.env`.

GA4 and Meta OAuth also need their client IDs and secrets. Until those are set, the connect buttons return a clear error — there is no mock performance data.

Open [http://localhost:3000](http://localhost:3000).
