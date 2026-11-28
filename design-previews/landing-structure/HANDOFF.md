# IsraMarket landing page handoff

28 November 2026

The next review is about page structure. Start with the calendar-first wireframe, then use the animated preview as a source of components and media once the structure is agreed. The two previews are on the same GitHub branch. [Repository](https://github.com/shaharAka/israMArket) · [Landing preview branch](https://github.com/shaharAka/israMArket/tree/codex/landing-editorial-preview) · [Git and deployment](#git-and-deployment)

## Continue on another computer

If you need a fresh checkout, run the following in a terminal. If you already have the repository, fetch the branch and switch to it in a clean checkout.

```sh
git clone --branch codex/landing-editorial-preview https://github.com/shaharAka/israMArket.git
cd israMArket
```

### 1. Review the structure

Open `design-previews/landing-structure/index.html` directly in a browser. It is self-contained. To serve it locally or open either comparison by link, run this from the repository root.

```sh
python3 -m http.server 3244 --bind 127.0.0.1 --directory design-previews/landing-structure
```

On Windows, use `py -3` in place of `python3` if that is how your Python installation is configured.

- [Full wireframe](http://127.0.0.1:3244/)
- [Three outcomes side by side](http://127.0.0.1:3244/#outcomes)
- [Three outcomes stacked](http://127.0.0.1:3244/?layout=stacked#outcomes)

The numbered review bar jumps to a section. Toggle **סימוני מבנה** to hide the annotations. In section 4, switch between **שלושה בשורה** and **שלושה בטור**. On a phone, the row can be swiped and the stacked view reads vertically.

### 2. Run the earlier animated preview

Use Node.js 22, which was used for the local review. In a separate terminal from the repository root, run the following. The public preview uses example data and checked-in assets.

```sh
npm --prefix web ci
npm --prefix web run dev -- --hostname 127.0.0.1 --port 3242
```

Open the pages below after Next.js reports that the server is ready. The first load may take a few seconds while it compiles.

- [Editorial preview with animations](http://127.0.0.1:3242/design/editorial?lang=he)
- [Editorial preview with stacked outcomes](http://127.0.0.1:3242/design/editorial?lang=he&outcomes=stacked#results)
- [Earlier Ink landing draft](http://127.0.0.1:3242/?lang=he&palette=ink)

The editorial route supports Hebrew, English, Arabic, and Russian through its language picker. If the animated preview is slow to load, the independent HTML wireframe is the fastest way to review the layout.

## Agreed structure

1. **Hero.** The approved Hebrew headline is **מערכת הקידום שעושה בשבילך את העבודה.** The visual places the monthly goal, scheduled posts, approval status, and the follow-up recommendation in one campaign calendar.
2. **What you get.** Show one immediate benefit using the next post preview, with its date, channel, and approval status.
3. **How it works.** Four illustrated steps in a checkerboard layout. Learn about the business, optionally connect existing tools, choose a goal, then receive a plan and posts to review.
4. **The three outcomes.** The plan, the posts, and what the results suggest trying next. Compare the same three examples in a row and in three full-width bands.
5. **Post gallery.** A diagonal strip with varied work across businesses and formats. The animated draft includes silent films and stills.
6. **Who it fits.** Shops, service providers, software companies, and nonprofits, with a relevant illustration for each.
7. **Mobile.** Demonstrate a single action that works from the phone browser, such as reviewing a post.
8. **Free first month.** Clear offer, current terms, and one main action.
9. **FAQ and footer.** Answer the main questions and link to support, privacy, and terms.

The revised wireframe uses a light shell, concentrated pastel color around the product, and artwork inside individual calendar cells. The earlier dark editorial version and the revised wireframe are different review surfaces on this branch. Review the light wireframe for structure first. [Planable](https://planable.io/) · [Storyworth](https://welcome.storyworth.com/) · [Breef](https://www.breef.com/) · [Blend AI](https://blend-ai.com/) · [Plai](https://www.plai.io/)

Use the approved Hebrew reference when adding copy to the agreed structure. It includes the landing and onboarding wording, later copy corrections, and links to the current implementations. [Approved Hebrew copy and code locations](APPROVED-HEBREW-COPY.md)

## Files and commits

- `design-previews/landing-structure/index.html` is the standalone wireframe. `afd5416` added it and `b9382af` made it calendar-first.
- `web/app/design/editorial/page.tsx` and `web/components/landing-v2/EditorialLanding.tsx` are the entry point and layout for the animated editorial preview. `EditorialCalendar.tsx` has the clickable dates and post previews. `editorialContent.ts` has the Hebrew source copy. The editorial implementation is in `30a284c`.
- `web/components/landing-v2/CreativeReel.tsx`, `CampaignFilm.tsx`, and `StoryStage.tsx` contain the motion and visibility behavior. The four short films, posters, and gallery artwork are checked into `web/public/showcase/campaign-cuts/`, `web/public/showcase/dyo-tari/`, and `web/public/showcase/creative-strip/`. The underlying animation and portfolio work is included through `b546493`, `58e8529`, `755e41a`, and `065edd2`.
- `web/components/landing-v2/ProcessLanding.tsx` and `SignalHero.tsx` contain the earlier landing draft. `91e2f19` adds its palette variants.

## Where to pick up

1. Review the calendar-first structure, particularly how quickly the first screen communicates the product. Choose a preferred treatment for the three outcomes after comparing both.
2. Apply the chosen structure to the actual landing in a small change based on current `main`. The preview branch also carries earlier application experiments, so review the diff before taking any code into production.
3. Replace the wireframe art and labels with approved Hebrew copy and the strongest checked-in creative. Make each animation explain one action. Keep campaign measurement conditional on available data and keep publication under the owner's control.
4. Check the landing at desktop and phone widths. Confirm both text directions, the trial entry, muted playback, reduced motion, and the final mobile interaction. Follow the repository's translation and review workflow for the real page.

The standalone wireframe was checked on desktop and at a 390 px phone width. The earlier animated preview passed type checking, focused lint, and all four translation checks. Its final mobile swipe check timed out in the browser, so repeat that check on the new computer.

## Git and deployment

### Access on the new computer

- Install Git. Node.js 22 and Python 3.13 match the web and API versions used in CI. The HTML wireframe opens directly in a browser.
- You can clone the public repository immediately. Pushing to it requires repository write access on your own GitHub account. The private Project board has separate access.
- Production updates require an authorized Google Cloud account with SSH access through Identity-Aware Proxy to the IsraMarket VM and permission to run the update command with `sudo`. GitHub access and application Backoffice access are separate. Use your own authorized Google Cloud sign-in. [Install Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk) · [Google Cloud IAP SSH](https://cloud.google.com/compute/docs/connect/ssh-using-iap)

If you use GitHub CLI for HTTPS authentication, sign in interactively.

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

You can also use GitHub Desktop or your existing Git credential manager. Set your own Git commit identity if Git prompts for a name or email. Use development configuration for local app testing and keep production configuration in the existing Secret Manager and VM setup. [GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login) · [Local app setup](https://github.com/shaharAka/israMArket/blob/main/README.md#run-locally)

### Continue the previews or start a release branch

For an existing checkout, first check for local changes with `git status`. Fetch the latest refs. To open the preview branch for the first time in that checkout, run the following.

```sh
git fetch origin
git switch --track origin/codex/landing-editorial-preview
```

If the local preview branch already exists, switch to it with `git switch codex/landing-editorial-preview` and use `git pull --ff-only`. Keep the preview branch for design review. For the real landing change, start from current `origin/main` and bring across the specific files and behavior you intend to ship.

```sh
git fetch origin
git switch -c codex/landing-release-review origin/main
```

Before committing, review `git diff` and stage only the files for that change. Update the dated release note in `web/lib/releases.ts` for customer-facing work. For web changes, run these commands from the repo root.

```sh
npm --prefix web ci
npm --prefix web run i18n:sync
npm --prefix web run i18n:check
npm --prefix web run verify
```

The translation sync uses the repository's configured translation credentials if catalogs need new entries. For API changes, install `api/requirements.txt` in a local virtual environment, then run `python -m unittest discover -s tests -v` from `api/`. [CI checks](https://github.com/shaharAka/israMArket/blob/main/.github/workflows/ci.yml)

After committing, publish the branch and open a PR against `main`. Use the PR description to link the related issue and record what you tested. Review the changes and wait for CI before merging the release.

```sh
git push -u origin HEAD
gh pr create --base main --fill
gh pr checks
```

GitHub runs CI on PRs and on `main`. Updating production is a separate manual step. [Project workflow](https://github.com/shaharAka/israMArket/blob/main/docs/project-workflow.md)

### Deploy a reviewed release to the existing production VM

Production serves [www.isramarket.co.il](https://www.isramarket.co.il/) from an existing Google Compute Engine VM running Docker Compose. The API database and generated files live on a persistent disk. Use the existing updater for a normal code release. The infrastructure creation steps in the cloud setup guide are for new installations.

1. After review and merge, copy the full merge commit SHA from GitHub. This is the revision to deploy. As a cross-check, `git fetch origin` followed by `git log -1 --oneline origin/main` shows the current tip of `main`.
2. From the new computer, sign in with `gcloud auth login` if needed. Record the current production checkout and container status over IAP before making any changes.

```sh
gcloud compute ssh isramarket-vm --project=isramarket --zone=me-west1-a --tunnel-through-iap --command 'sudo git -C /srv/isramarket rev-parse HEAD && sudo isramarket-compose ps'
```

3. Replace `APPROVED_COMMIT_SHA` with the reviewed SHA and run this command.

```sh
gcloud compute ssh isramarket-vm --project=isramarket --zone=me-west1-a --tunnel-through-iap --command 'sudo /srv/isramarket/deploy/gcp/update.sh APPROVED_COMMIT_SHA'
```

The updater fetches the Git commit, builds the images, takes a pre-update SQLite backup, replaces changed containers, and checks health. Keep the pre-update backup enabled. The script prints the previous SHA and a rollback command. [Existing VM runbook](https://github.com/shaharAka/israMArket/blob/main/deploy/gcp/README.md#day-2) · [Update script](https://github.com/shaharAka/israMArket/blob/main/deploy/gcp/update.sh)

4. Check the public health endpoint. Then open the affected customer flow in a clean browser session and verify what the PR changed. For a landing release, check the hero, entry button, and layout on desktop and phone. Record the deployed SHA and the results in the PR and issue.

```sh
curl -fsS https://www.isramarket.co.il/backend/health
```

### If the release fails

Read the updater's output and inspect the affected services.

```sh
gcloud compute ssh isramarket-vm --project=isramarket --zone=me-west1-a --tunnel-through-iap --command 'sudo isramarket-compose logs --tail=200 api web caddy'
```

For a code rollback, rerun the updater with the previous known-good SHA and repeat the health and flow checks. Code rollback leaves the database on the persistent disk. For a release that ran a migration, check compatibility first and use the separate backup-restore procedure only if needed. [Backup and restore runbook](https://github.com/shaharAka/israMArket/blob/main/deploy/gcp/README.md#restore-from-a-backup)

Verified on 28 November 2026. The production checkout was `21c49b67ccc3f58a357ddfbe6152b339129ab46c`, which matched GitHub's `main`. The API, web, and Caddy containers were healthy, and the public health endpoint returned `"ok": true`.

## Related product work

The landing previews are on a development branch. The onboarding plan-retry and simpler connections changes were merged separately. The Backoffice workspace-reset feature has its own open PR. The reset permanently deletes the selected workspace while keeping the account login. Use disposable workspace data for testing. [Onboarding PR #240](https://github.com/shaharAka/israMArket/pull/240) · [Backoffice PR #241](https://github.com/shaharAka/israMArket/pull/241)

Use GitHub for open feedback and ideas. The repository's `AGENTS.md`, `PLAN.md`, and `docs/project-workflow.md` describe how to coordinate changes. [IsraMarket project board](https://github.com/users/shaharAka/projects/2)
