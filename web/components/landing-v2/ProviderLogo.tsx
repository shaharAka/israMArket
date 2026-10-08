import Image from "next/image";
import type { ConnectionExampleKey } from "./connectionExamples";
const LOGOS: Partial<Record<ConnectionExampleKey, string[]>> = { "google-analytics": ["googleanalytics"], "facebook-instagram": ["facebook", "instagram"], "ads-pixel": ["meta"], whatsapp: ["whatsapp"], linkedin: ["linkedin"], tiktok: ["tiktok"] };
export function ProviderLogo({ provider, size = 44 }: { provider: ConnectionExampleKey; size?: number }) {
  return <span className="lv2-provider-logo" aria-hidden="true">{LOGOS[provider]?.map(logo => <Image key={logo} src={`/connectors/${logo}.svg`} width={size} height={size} alt="" />) ?? <span className="lv2-website-wordmark" dir="ltr">www.</span>}</span>;
}
