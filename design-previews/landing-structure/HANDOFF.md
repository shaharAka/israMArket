# IsraMarket landing page handoff

28 November 2026

The next review is about page structure. Start with the calendar-first wireframe, then use the animated preview as a source of components and media once the structure is agreed. The two previews are on the same GitHub branch. [Landing preview branch](https://github.com/shaharAka/israMArket/tree/codex/landing-editorial-preview)

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

## Related product work

The landing previews are on a development branch. The onboarding plan-retry and simpler connections changes were merged separately. The Backoffice workspace-reset feature has its own open PR. The reset permanently deletes the selected workspace while keeping the account login. Use disposable workspace data for testing. [Onboarding PR #240](https://github.com/shaharAka/israMArket/pull/240) · [Backoffice PR #241](https://github.com/shaharAka/israMArket/pull/241)

Use GitHub for open feedback and ideas. The repository's `AGENTS.md`, `PLAN.md`, and `docs/project-workflow.md` describe how to coordinate changes. [IsraMarket project board](https://github.com/users/shaharAka/projects/2)
