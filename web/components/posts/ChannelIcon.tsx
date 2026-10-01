import type { PostChannel } from "@/lib/api";
import { IconFacebook, IconInstagram, IconWhatsApp } from "@/lib/icons";

/** The plan's channel for a post, as the set's own line icon. Decorative: the channel's
 *  name is always said next to it or in the row's label. */
export function ChannelIcon({ channel, className = "h-4 w-4" }: { channel: PostChannel; className?: string }) {
  if (channel === "facebook") return <IconFacebook className={className} />;
  if (channel === "whatsapp") return <IconWhatsApp className={className} />;
  return <IconInstagram className={className} />;
}
