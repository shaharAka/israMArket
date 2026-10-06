# Shared work in GitHub

[IsraMarket Project](https://github.com/users/shaharAka/projects/2) is the shared delivery
view for Shahar, Claude and Codex. [Repository issues](https://github.com/shaharAka/israMArket/issues)
hold actionable public task descriptions, acceptance criteria, progress and PR links.
The Project is private; this repository and its issues are public. Private draft items
hold security follow-ups and owner prerequisites. Never convert them to public issues
without first removing private information and obtaining any required disclosure approval.

`PLAN.md` is the index and ownership agreement. Do not maintain a second changing backlog
in it. Update an issue and its Project item when work changes. Leave implementation details
and validation in the linked PR so reviewers can assess the actual change.

## Ownership and priority

- Claude: product and design, landing, ongoing plan, posts and Design DNA.
- Codex: integrations, measurement sources, provider approval, privacy pages, deployment,
  infrastructure and domain migration. Claude reviews customer-facing UI in this lane.
- Shahar: business decisions, account actions, identity, agreements and paid-resource approval.

Issues use `owner:claude`, `owner:codex` or `owner:shahar`. These indicate the responsible
lane, not who has an active claim. Do not assign every task to the same human GitHub account
and mistake that for agent ownership. Priority labels are P1 (core value / next work), P2
(important follow-up) and P3 (later / exploration). Priority is separate from readiness.

## Status

- **Ready** / `status:ready`: scoped, available to claim, with any ordering dependency clear.
- **In Progress** / `status:in-progress`: an agent has claimed it and is actively working.
- **Review** / `status:review`: waiting for review, merge, deployment or final verification.
- **Blocked** / `status:blocked`: names the dependency, the next action and who can unblock it.
- **Suggestions** / `status:suggestion`: a proposal to evaluate; not a delivery commitment.
- **Done** / `status:done`: code has merged, deployed and been verified, or a non-code outcome
  has been completed and evidenced.

Keep exactly one status label and one lane owner on each issue. Mirror the status in the
Project in the same work session. Project drag/drop does not by itself change issue labels.
When these disagree, read the latest factual progress comment and reconcile both before
working. Provider configuration, draft applications and development-mode access do not
count as approval. A merged PR is not proof that its change is deployed.

## Claim before editing

1. Read this file, current `PLAN.md`, the issue body, its latest comments and linked PRs.
2. Choose an available task in your lane. If you need another lane, agree on the handoff in
   the issue. Do not silently take over someone else's active work.
3. Post a claim with agent identity, a real branch/worktree and a short scope, for example:

   ```text
   Claimed by Codex. Branch: codex/<actual-branch>.
   Scope: <specific acceptance criteria being handled>.
   Next: <the immediate action>. Dependency: <if any>.
   ```

4. Re-read after claiming. Comments and labels are not an atomic lock: if another agent has
   claimed the same work, resolve the collision before editing. Move it to In Progress and
   remove the previous status label; mirror the Project field.
5. Pull current main into an isolated branch/worktree and keep changes within the claimed
   scope. Shared files need small additive edits; preserve the other agent's work.
6. Update progress when the state changes. State what is complete, what evidence supports
   it, what is blocked and the next action. Do not post repetitive unchanged updates.

With current repository CLI access, both agents can read and claim issues directly:

```sh
gh issue list --repo shaharAka/israMArket --label owner:codex --label status:ready
gh issue view <number> --repo shaharAka/israMArket --comments
gh issue comment <number> --repo shaharAka/israMArket --body-file <claim-file>
gh issue edit <number> --repo shaharAka/israMArket --remove-label status:ready --add-label status:in-progress
```

Use actual numbers and write multiline comments to a file. Do not print credentials or use
them in issue bodies. Projects CLI/API access requires a separate `project` scope; do not
silently expand the signed-in token. If it is unavailable, update the issue through `gh`
and the private Project through the already-authorised GitHub browser session. Routine
repository task updates remain possible without that scope.

## Review and completion

Every customer-facing deployment includes a dated note in `web/lib/releases.ts`: explain
what the owner can now do and link to its app destination. Keep it brief and describe only
shipped behavior. Translate the note with the same automatic copy workflow. Put the newest
release first with a new stable ID; that ID drives the quiet unread marker at `/updates`.
Opening the page marks the current release read on that browser. Do not announce a provider
approval, complete translation or launched feature before its actual verification.

Link `Refs #<number>` in the PR description. Use a closing keyword only when the issue's
whole delivery outcome is satisfied by merge. Most product work must stay open until
deployment verification; premature automatic issue closure can make the board misleading.
Each new PR must also be attached to the active Codex task when using Codex.

Move the issue to Review when its change is reviewable, with relevant validation and any
design-pass requirement. Whoever merges code deploys the exact reviewed revision under the
existing deployment instructions, verifies the customer path and records the deployed
revision/outcome. Then move the issue to Done, mark fulfilled acceptance criteria and close
it. A documentation-only coordination change needs to be merged and accessible to both
agents; it does not require a production server restart.

If the owner stops or redirects work, leave a clear handoff and release the active claim.
Suggestions become Ready only when their purpose, scope and acceptance criteria are agreed.

## Adding work

Search for an existing issue first. Use the Task or Suggestion issue form, choose a lane,
set a priority, add the matching labels and add it to this Project. Do not put credentials,
customer analytics, private asset identifiers, legal declarations or exploit details into
public issues or attachments. Keep sensitive prerequisites as private Project drafts with
an explicit owner and next action. No agents are automatically running because a task is
Ready; a human request or existing authorised task must initiate the work.
