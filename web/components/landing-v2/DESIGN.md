# Public landing: Signal / Punch

Selected by Shahar on 24 October 2026. This applies to the current process landing page. It replaces the earlier neutral/blue public treatment; the signed-in component library uses the same palette in its calmer Operate mode.

- Punch orange `#ff7957`, graphite `#20221c`, warm white `#fff9f3`, peach `#ffb89b`. Darkened terracotta is used for readable text links and focus. Provider logos and customer artwork keep their own colors.
- Self-hosted Secular One for Hebrew display headings (SIL OFL, license in `public/fonts/signal/OFL.txt`). Existing Rubik body and English/Arabic/Russian locale fonts remain.
- Large graphic typography, generous space, rectangular actions, broad visual stages and restrained entry motion. Keep the approved hero message and the nine-step journey.
- The hero explains a complete promotion system. Do not replace it with a portfolio reel or an asset-generation pitch.
- Campaign demonstration: one goal and audience stay visible while the view moves through monthly plan, channel adaptations of one creative concept, measurement of the business outcome and learning that changes the next plan. Navigation is manual or automatic, with stage holds of 2.8, 4.5, 4.0 and 4.2 seconds; no publishing or generation occurs here.
- Measurements shown in this new scene describe what to measure, without fabricated performance counts. Real customer numbers require actual connected data.
- Demonstrations respect visibility, reduced motion and keyboard focus. Visible pause controls are removed at the owner’s request; direct stage selection remains available and must show a complete view.
- Every chapter, including campaign, keeps right-hand copy and left-hand illustration in Hebrew, with locale direction preserved. The campaign workspace fills its visual column; on phones text and illustration stack.

Implementation: `ProcessLanding.tsx`, `process-story.module.css`, `CampaignSystemScene.tsx`, `campaign-system.module.css`. The standalone studies remain available separately for reference.

## Interaction refinement — 24 October
Restore Signal’s edge-to-edge responsive panorama beneath the hero, with spring-driven headline movement, expanding media and a pointer-following link affordance. Its content represents goals, planning, coordinated campaign assets and feedback, rather than a collection of standalone reels. The page and navigation stay stable while scrolling and hovering. Each journey chapter pairs copy and an open illustration on one consistent warm surface, separated by white space. Keep color and animation inside the illustration rather than recoloring the viewport. Headline words can highlight under the pointer; reduced motion disables physical effects and automatic demonstrations.

## Campaign, phone and palette comparison
Campaign follows the same copy-right / visual-left chapter layout as the other steps. Its compact visual uses an illustrated weekly timeline, actual channel post shells, a measurement path and creative changes in the next plan. The phone has a separate dark physical frame, a screen, centered camera island, status icons and home indicator. Controls use Current’s softer radii. `?palette=punch-jade` previews a separate combination: Punch hero/emphasis with Jade actions, supporting graphics and mint accents; the default remains Punch. Neither palette changes on scroll.
