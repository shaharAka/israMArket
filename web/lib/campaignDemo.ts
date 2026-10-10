import type { CampaignRevision } from "./campaign";
import type { RoadmapPost, StrategyPayload, Asset } from "./api";

// Public fixtures use the real workspace/renderer. No provider or customer write.
const revisions = new Map<string, CampaignRevision>();
const requestIds = new Map<string, string>();
export function demoCampaign(path: string, method: string, body: string, posts: RoadmapPost[], strategy: () => StrategyPayload, assets: Asset[]) {
  if (path === "/campaign/revisions" && method === "GET") return { revisions: [...revisions.values()].reverse() };
  if (path === "/campaign/revisions" && method === "POST") {
    const input = JSON.parse(body);
    if (["video", "video_edit", "finish"].includes(input.kind)) throw new Error("יצירת הסרטונים עדיין לא פתוחה. תוכלו להשתמש בסרטון שהעליתם.");
    const old = requestIds.get(input.request_id);
    if (old) return structuredClone(revisions.get(old));
    const items = input.post_uids.map((uid: string) => {
      const original = structuredClone(posts.find(p => p.uid === uid)!);
      const proposal = structuredClone(original);
      if (input.kind === "text") {
        const sentences = proposal.caption.split(/(?<=[.!?])\s+/);
        proposal.caption = sentences.slice(0, 2).join(" ");
        if (!proposal.caption.includes(proposal.cta)) proposal.caption += `\n${proposal.cta}`;
      } else if (input.kind === "layout" && proposal.design) {
        proposal.design.composition = proposal.design.composition === "inset_frame" ? "full_bleed" : "inset_frame";
      } else if (input.kind === "image") {
        const photo = assets.find(a => a.kind === "image" && a.url !== original.image_url);
        if (photo) { proposal.image_url = photo.url; proposal.image_source = "asset"; proposal.image_asset_id = photo.id; }
      }
      return { uid, original, proposal, state: "ready", error: "" };
    });
    const revision: CampaignRevision = { id: crypto.randomUUID(), strategy_id: strategy().id,
      kind: input.kind, instruction: input.instruction, state: "ready", items, error: "", created_at: new Date().toISOString() };
    revisions.set(revision.id, revision); requestIds.set(input.request_id, revision.id);
    return structuredClone(revision);
  }
  const [, , , id, action] = path.split("/");
  const row = revisions.get(id);
  if (!row) throw new Error("לא מצאנו את הגרסה הזו.");
  if (method === "GET") return structuredClone(row);
  if (action === "keep" || action === "undo") {
    row.items.forEach(item => {
      const index = posts.findIndex(p => p.uid === item.uid);
      posts[index] = structuredClone(action === "keep" ? item.proposal! : item.original);
    });
    row.state = action === "keep" ? "kept" : "undone";
  } else row.state = "discarded";
  return { revision: structuredClone(row), strategy: strategy() };
}
