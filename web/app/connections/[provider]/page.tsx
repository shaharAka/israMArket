import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy } from "@/components/language/LanguageProvider";
import { CONNECTION_EXAMPLES, type ConnectionExampleKey } from "@/components/landing-v2/connectionExamples";
import { ConnectionScreenshot } from "@/components/landing-v2/ConnectionScreenshot";
import { BrandWordmark } from "@/components/landing-v2/BrandWordmark";
import { siteSans, artSerif, siteSerif } from "@/components/landing-v2/siteFonts";
import { IconArrowRight } from "@/lib/icons";
import "@/components/landing-v2/lv2.css";
import "@/components/landing-v2/showcase.css";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(CONNECTION_EXAMPLES).map(provider => ({ provider })); }

export default async function ConnectionPage({ params }: PageProps<"/connections/[provider]">) {
  const { provider } = await params;
  if (!Object.hasOwn(CONNECTION_EXAMPLES, provider)) notFound();
  const connection = CONNECTION_EXAMPLES[provider as ConnectionExampleKey];
  return <div className={`lv2 lv2-site ${siteSans.variable} ${artSerif.variable} ${siteSerif.variable}`}>
    <header className="lv2-nav"><div className="lv2-wrap lv2-nav-row"><Link href="/" className="lv2-brand"><BrandWordmark /></Link><Link href="/#connections" className="lv2-nav-end"><IconArrowRight className="h-4 w-4" /><Copy text="לכל החיבורים" /></Link></div></header>
    <main className="lv2-wrap lv2-connection-page">
      <p className="lv2-eyebrow"><Copy text={connection.name} /></p>
      <h1 className="lv2-h2"><Copy text={connection.title} /></h1>
      <p className="lv2-lead"><Copy text={connection.benefit} /></p>
      <div className="lv2-connection-detail">
        <div><h2><Copy text="מחברים מתוך החשבון שלכם" /></h2><ol className="lv2-setup-steps">{connection.steps.map(step => <li key={step}><Copy text={step} /></li>)}</ol><Link href="/integrations" className="lv2-btn"><Copy text="לפתוח את החיבורים בחשבון" /></Link><p className="lv2-fine"><Copy text="אם עוד אין לכם חשבון, אפשר להתחיל מהיכרות עם העסק ולשמור את התוכנית אחר כך." /> <Link href="/start" className="lv2-link"><Copy text="להתחיל חודש בחינם" /></Link></p></div>
        <ConnectionScreenshot src={connection.screenshot} alt={connection.alt} />
      </div>
      <section className="lv2-connection-note"><h2><Copy text="מה צריך לדעת לפני החיבור" /></h2><p><Copy text={connection.caveat} /></p></section>
      <section className="lv2-connection-note"><h2><Copy text="המידע וההרשאות שלכם" /></h2><p><Copy text={connection.privacy} /></p><Link href="/security" className="lv2-link"><Copy text="איך שומרים על המידע שלכם" /></Link></section>
    </main>
  </div>;
}
