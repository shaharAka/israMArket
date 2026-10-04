# Working in this repo

Start with `PLAN.md` and `docs/project-workflow.md`. Open work lives in the shared GitHub
Project and linked issues. Read current issue comments before claiming a Ready task with
your agent name, branch and scope; re-read for competing claims before editing. A lane
owner is not an active claim. Keep status, blockers and linked PRs current. Code delivery
is Done only after merge, deployment and verification; non-code work needs outcome evidence.

Use `owner:claude`, `owner:codex` or `owner:shahar` because both agents may use the same
GitHub account. Keep one status label per issue and mirror it in the Project. If Project
API access is unavailable, update the issue and use the signed-in browser for the board.
Keep private security findings, customer data and owner declarations in private drafts.

- Lanes: Claude owns product and design of every screen; Codex owns integrations, provider
  reviews, legal pages, deploy and infra. The owner decides. Details in `PLAN.md`.
- Any screen follows `web/DESIGN-STANDARD.md`.
- Never put secrets, tokens or passwords in code, logs, commits or chat.
