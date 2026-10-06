/** Real route captures made through the demo UI on 2–3 Oct 2026 and the isolated
 * software preparation fixture on 7 Oct 2026. All account data is synthetic.
 * OAuth, generating and publishing states stay schematic until those states are captured.
 * Do not relabel a shared route's screenshot as proof of a distinct state or customer.
 */
export const FLOW_CAPTURES: Record<string,string> = {
  landing:"landing", login:"login", "direct-signup":"signup",
  "plan-first":"plan", welcome:"welcome", dashboard:"dashboard",
  connections:"integrations", "baseline-post":"baseline", featured:"prepare-topics",
  photos:"prepare-photos", voice:"prepare-style", editor:"editor", results:"performance",
  decision:"decisions", "next-month":"strategy", billing:"billing",
};
export function flowCapture(id:string) { return FLOW_CAPTURES[id] ? `/flow-screens/${FLOW_CAPTURES[id]}.png` : null; }
export function flowCaptureNote(id:string) { return ["featured", "photos", "voice"].includes(id) ? "צילום מסך הכנת פוסטים · עסק תוכנה לדוגמה · 7.10.2026" : "צילום העמוד בדמו המאפייה · 2.10.2026"; }
