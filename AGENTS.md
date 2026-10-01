# Working in this repo

Start with `PLAN.md`: who owns what, what is in progress, what is next, and what waits on the
owner. Before starting, put your name on the item. Update `PLAN.md` in the same PR that changes
the work (move it to Done when it is merged and deployed).

- Lanes: Claude owns product and design of every screen; Codex owns integrations, provider
  reviews, legal pages, deploy and infra. The owner decides. Details in `PLAN.md`.
- Any screen follows `web/DESIGN-STANDARD.md`.
- Never put secrets, tokens or passwords in code, logs, commits or chat.
