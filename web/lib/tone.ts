/**
 * The system tone.
 *
 * Sampled from a Chrome system dialog the owner liked: a cool slate panel with white
 * text and a white pill action. Every other tone in this app is warm (ink, sand, clay),
 * so this is the palette's one cool, "the software is talking" voice.
 *
 * The distinction it buys us: warm notes read as *your business* (a brand remark, a
 * plan suggestion), while these read as *the system* (a notice, an explanation, a
 * limitation). Before this, every informational note used the warm sand surface, so a
 * "we can't measure this yet" message looked like business content.
 *
 * Contrast: white on `base` is 6.1:1, and `ink` on `surface` is 10.4:1 — both clear AA.
 */
export const SYSTEM_TONE = {
  /** Panel background. The sampled colour, unchanged. */
  base: "#505F75",
  /** Pressed/hover state for an action sitting on `base`. */
  baseHover: "#465468",
  /** Deeper shade for a border or divider on a dark panel. */
  baseEdge: "#3E4A5C",
  /** Light surface for an inline note in an otherwise light page. */
  surface: "#F4F6F9",
  /** Border that pairs with `surface`. */
  border: "#D5DCE6",
  /** Readable text on `surface`. */
  ink: "#2F3A4A",
  /** Body text on `surface`, a step quieter than `ink`. */
  inkMuted: "#546073",
  /** Text and pills on `base`. */
  onBase: "#FFFFFF",
  /** Body text on `base` — white at reduced strength, never grey (grey dies on slate). */
  onBaseMuted: "rgba(255,255,255,0.78)",
} as const;
