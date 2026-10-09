import type { RoadmapPost } from "./api";
import type { WhatsappPostLink } from "./whatsapp";

/** A site link cannot stand in for the WhatsApp link this post is measured by. */
export function wantsWhatsapp(post: Pick<RoadmapPost, "primary_outlet" | "cta" | "measure">): boolean {
  return post.measure?.metric === "whatsapp_clicks" || post.primary_outlet === "whatsapp" ||
    /וואטסאפ|ווטסאפ|וואצאפ|ווצאפ|whats\s?app|wa\.me/i.test(post.cta || "");
}

export function postDestination(post: RoadmapPost, whatsapp: WhatsappPostLink | null): string {
  return wantsWhatsapp(post) || whatsapp?.cta_is_whatsapp
    ? whatsapp?.cta_is_whatsapp && whatsapp.number_set ? whatsapp.link?.url || "" : ""
    : post.tracking_url || "";
}

export function messageWithLink(caption: string, link: string): string {
  return link ? `${caption}\n\n${link}` : caption;
}
