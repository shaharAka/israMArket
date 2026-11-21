/**
 * The system tone: the software talking about itself (a notice, an explanation, a
 * limitation, the demo badge), as opposed to remarks about the business.
 *
 * It used to be a cool slate sampled from a Chrome dialog. Signal / Punch replaced the
 * product palette, so the tone now reads from the same tokens (components/design/
 * product-theme.css): a graphite panel with white text, and a warm soft surface with
 * ink text for inline notes. Values are CSS custom properties, so the tone follows the
 * theme wherever it renders, portals included.
 *
 * Contrast: white on graphite (`--ink`) is 16.1:1; `--ink` on `--soft` is 13.9:1 and
 * `--ink-muted` on `--soft` is 5.0:1, all clear AA.
 */
export const SYSTEM_TONE = {
  /** Panel background: graphite, the product's action colour. */
  base: "var(--ink)",
  /** Pressed/hover state for an action sitting on `base`. */
  baseHover: "var(--action-hover)",
  /** Deeper shade for a border or divider on a dark panel. */
  baseEdge: "var(--action-hover)",
  /** Light surface for an inline note in an otherwise light page. */
  surface: "var(--soft)",
  /** Border that pairs with `surface`. */
  border: "var(--rule-dark)",
  /** Readable text on `surface`. */
  ink: "var(--ink)",
  /** Body text on `surface`, a step quieter than `ink`. */
  inkMuted: "var(--ink-muted)",
  /** Text and pills on `base`. */
  onBase: "#FFFFFF",
  /** Body text on `base`: white at reduced strength, never grey. */
  onBaseMuted: "rgba(255,255,255,0.78)",
} as const;
