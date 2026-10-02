/** Real route captures made through the demo UI on 2 Oct 2026. All account data is synthetic.
 * OAuth, generating and publishing states stay schematic until those states are captured.
 * Do not relabel a shared route's screenshot as proof of a distinct state or customer.
 */
export const FLOW_CAPTURES: Record<string,string> = {
  landing:"landing", login:"login", "direct-signup":"signup",
  "plan-first":"plan", welcome:"welcome", dashboard:"dashboard",
  connections:"integrations", "baseline-post":"baseline", featured:"featured",
  photos:"assets", voice:"voice", editor:"editor", results:"performance",
  decision:"decisions", "next-month":"strategy", billing:"billing",
};
export function flowCapture(id:string) { return FLOW_CAPTURES[id] ? `/flow-screens/${FLOW_CAPTURES[id]}.png` : null; }
