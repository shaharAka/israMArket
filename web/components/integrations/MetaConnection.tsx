"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UIDialog, UIAction, InlineNotice } from "@/components/design/Controls";
import { endpoints, type IntegrationsPayload, type MetaAssets, type MetaPixel, type PixelVerification, type MetaSourceReadiness } from "@/lib/api";
import { IconChevron } from "@/lib/icons";
import styles from "./meta-connection.module.css";
import { PixelSetupGuide } from "./PixelSetupGuide";
import { SourceReadState } from "./SourceReadState";

type Item = IntegrationsPayload["integrations"][number];
const NO_PAGE = "__no_page__";
const RETURN_NOTES: Record<string, string> = {
  cancelled: "החיבור לא הושלם. אפשר לנסות שוב כשנוח לכם; התוכנית נשארת זמינה.",
  expired: "חלון החיבור פג או שנפתח בדפדפן אחר. התחילו שוב מכאן.",
  failed: "לא הצלחנו להשלים את החיבור. נסו שוב עם החשבון שמנהל את העסק בפייסבוק.",
};
const EXAMPLE_ASSETS: MetaAssets = {
  pages: [{ page_id: "demo-page", display_name: "לחם תום", instagram_id: "demo-instagram" }],
  ad_accounts: [{ id: "demo-ads", name: "לחם תום — פרסום", currency: "ILS" }],
  scopes: ["ads_read"], errors: {},
};

export function MetaConnection({ item, ready, demo, website, onChanged, onDisconnect, primary = false }: {
  primary?: boolean; item?: Item; ready: boolean; demo: boolean; website: string; onChanged: () => Promise<void>; onDisconnect?: () => void }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"connect" | "choose" | "done">("connect");
  const [doneContext, setDoneContext] = useState<"saved" | "tracking">("saved");
  const [assets, setAssets] = useState<MetaAssets | null>(null);
  const [ads, setAds] = useState(false);
  const [page, setPage] = useState("");
  const [account, setAccount] = useState("");
  const [pixel, setPixel] = useState("");
  const [pixels, setPixels] = useState<MetaPixel[]>([]);
  const [pixelNote, setPixelNote] = useState("");
  const [verification, setVerification] = useState<PixelVerification | null>(item?.pixel_verification ?? null);
  const [busy, setBusy] = useState(false);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [note, setNote] = useState("");
  const [reading, setReading] = useState(false);
  const [readOverride, setReadState] = useState<MetaSourceReadiness | null>(null);
  const readState = readOverride || (item?.source_readiness as MetaSourceReadiness) || null;
  const popup = useRef<Window | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const returned = useRef(false);
  const expectedAttempt = useRef("");
  const changed = useRef(onChanged);
  const pixelRequest = useRef(0);
  const latestItem = useRef(item);
  useEffect(() => { changed.current = onChanged; latestItem.current = item; }, [onChanged, item]);

  async function read() {
    setReadState(null); setReading(true);
    try {
      const result = demo ? { integration: { source_readiness: { status: "ready", note_he: "" }, pixel_verification: null } } : await endpoints.metaRead();
      setReadState(result.integration.source_readiness as MetaSourceReadiness);
      setVerification(result.integration.pixel_verification || null);
      if (!demo) { await changed.current(); setReadState(null); }
    } catch {
      setReadState({ ...(latestItem.current?.source_readiness as MetaSourceReadiness), status: "unavailable", note_he: "לא הצלחנו לקרוא כרגע. הבחירה נשמרה; אפשר לנסות שוב." });
    } finally { setReading(false); }
  }

  function renewAccess() {
    setAds(Boolean(latestItem.current?.ad_account_id));
    setNote(""); setStage("connect"); setOpen(true);
  }

  async function loadAssets() {
    try {
      const result = await (demo ? Promise.resolve(EXAMPLE_ASSETS) : endpoints.metaAssets());
      if (expectedAttempt.current && result.connection_attempt !== expectedAttempt.current) {
        throw new Error("האישור בפייסבוק עדיין לא התקבל. השלימו אותו בחלון של פייסבוק ולחצו כאן להמשיך, או נסו לחבר שוב.");
      }
      setNote("");
      const current = latestItem.current;
      setAssets(result);
      setPage(previous => previous === NO_PAGE || result.pages.some(p => p.page_id === previous) ? previous : result.pages.some(p => p.page_id === current?.external_id) ? current!.external_id : "");
      void chooseAccount(result.ad_accounts.some(a => a.id === current?.ad_account_id) ? current!.ad_account_id! : "");
      setStage("choose"); setOpen(true);
      setCanResume(false);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "לא הצלחנו להביא את החשבונות. נסו לחבר מחדש.");
      setStage("connect"); setOpen(true);
    } finally { setBusy(false); }
  }

  // OAuth returns only a result code. Neither the opener nor the URL receives a token.
  useEffect(() => {
    async function complete(result: string) {
      if (returned.current) return;
      returned.current = true;
      if (timer.current) clearInterval(timer.current);
      setWaiting(false); setBusy(false);
      if (RETURN_NOTES[result]) { expectedAttempt.current = ""; setCanResume(false); setNote(RETURN_NOTES[result]); return; }
      await changed.current();
      await loadAssets();
    }
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== popup.current || event.data?.type !== "isramarket-meta-return") return;
      void complete(String(event.data.result));
    }
    window.addEventListener("message", receive);
    const result = new URLSearchParams(window.location.search).get("meta_result");
    if (result) void complete(result);
    return () => { window.removeEventListener("message", receive); if (timer.current) clearInterval(timer.current); };
    // Mounted once: refs keep callbacks current without resetting the OAuth listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function chooseAccount(value: string) {
    const request = ++pixelRequest.current;
    setAccount(value); setPixel(""); setPixels([]); setPixelNote("");
    if (!value) { setLoadingPixels(false); return; }
    setLoadingPixels(true);
    try {
      const result = demo ? { pixels: [{ id: "demo-pixel", name: "האתר של לחם תום" }], error: null } : await endpoints.metaPixels(value);
      if (request !== pixelRequest.current) return;
      setPixels(result.pixels); setPixelNote(result.error?.note_he || "");
      const current = latestItem.current;
      setPixel(result.pixels.some(p => p.id === current?.pixel_id) ? current!.pixel_id! : result.pixels.length === 1 ? result.pixels[0].id : "");
    } catch (err) {
      if (request === pixelRequest.current) setPixelNote(err instanceof Error ? err.message : "לא הצלחנו לקרוא את המעקב. אפשר להמשיך ולחבר אותו בהמשך.");
    } finally { if (request === pixelRequest.current) setLoadingPixels(false); }
  }

  async function connect(includeAds = ads) {
    if (demo) { await loadAssets(); return; }
    if (!ready) { setNote("החיבור לפייסבוק עדיין לא זמין. אפשר להמשיך בתוכנית ולחבר בהמשך."); return; }
    // Open synchronously during the click so the browser can allow the consent window.
    const child = window.open("about:blank", "isramarket-meta", "popup,width=620,height=740");
    if (timer.current) clearInterval(timer.current);
    popup.current = child; returned.current = false;
    setBusy(true); setNote("");
    try {
      const { url, attempt } = await endpoints.metaStart(includeAds, Boolean(child));
      expectedAttempt.current = attempt;
      setCanResume(true);
      if (!child) { window.location.assign(url); return; }
      child.location.href = url; setWaiting(true);
      timer.current = setInterval(() => {
        if (child.closed) {
          if (timer.current) clearInterval(timer.current);
          setWaiting(false);
          // A cross-origin isolation policy may sever the opener. Fetching the grant is
          // also the recovery path; a closed window itself is not evidence of consent.
          if (!returned.current) { returned.current = true; void changed.current().then(loadAssets); }
        }
      }, 700);
    } catch (err) {
      child?.close(); setNote(err instanceof Error ? err.message : "לא הצלחנו לפתוח את החיבור. נסו שוב.");
    } finally { setBusy(false); }
  }

  async function save() {
    setReadState(null); setBusy(true); setNote("");
    try {
      if (!demo) {
        await endpoints.metaAccount({ page_id: page === NO_PAGE ? "" : page, ad_account_id: account, pixel_id: pixel });
        await changed.current();
      }
      setVerification(null); setDoneContext("saved"); setStage("done");
      // Read after the saved selection, without a model prerequisite or blocking the plan.
      void read();
    } catch (err) { setNote(err instanceof Error ? err.message : "לא הצלחנו לשמור את הבחירה. נסו שוב."); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setNote("");
    try {
      setVerification(demo ? { status: "receiving", note_he: "פייסבוק מקבלת אירועים מהאתר.", events: ["PageView", "Purchase"] } : await endpoints.metaVerify());
      if (!demo) await changed.current();
    } catch (err) { setNote(err instanceof Error ? err.message : "לא הצלחנו לבדוק כרגע. אפשר לחזור לכאן בהמשך."); }
    finally { setBusy(false); }
  }

  const selectedPage = assets?.pages.find(p => p.page_id === page);
  const selectedPixel = pixels.find(p => p.id === pixel);
  const needsChoice = item?.status === "select_assets" || item?.status === "select_page";
  const tracking = verification || item?.pixel_verification;
  return <div className={styles.connection}>
    {item?.connected ? (
      // Same shape as the other connections: who is connected, and the actions beside it.
      <div className={styles.connected}>
        <p>מחובר: <strong>{item.display_name}</strong>{item.ad_account_id ? " · נתוני פרסום" : ""}{item.pixel_id ? " · מעקב באתר" : ""}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.textAction} onClick={() => { setNote(""); setOpen(true); setCanResume(false); expectedAttempt.current = ""; setBusy(true); void loadAssets(); }}>לנהל את החיבור</button>
          {item.pixel_id && <button type="button" className={styles.textAction} onClick={() => { setAccount(item.ad_account_id || ""); setPixel(item.pixel_id!); setVerification(item.pixel_verification || null); setDoneContext("tracking"); setStage("done"); setOpen(true); }}>לבדוק את המעקב</button>}
          {onDisconnect && <button type="button" className={styles.quietAction} onClick={onDisconnect}>לנתק</button>}
        </div>
      </div>
    ) : <>
      <UIAction variant={primary ? "primary" : "secondary"} disabled={!ready && !demo && !needsChoice} onClick={() => {
        setNote(""); setOpen(true); setCanResume(false); expectedAttempt.current = "";
        if (needsChoice) { setBusy(true); void loadAssets(); } else setStage("connect");
      }}>{needsChoice ? "לבחור את העסק שלי" : "לחבר את פייסבוק ואינסטגרם"}</UIAction>
      <p className={styles.hint}>{!ready && !demo ? "החיבור עדיין לא זמין. אפשר להמשיך בתוכנית ולחבר בהמשך." : "עם חשבון הפייסבוק שמנהל את הדף. נתוני מודעות אפשר להוסיף בהמשך."}</p>
    </>}
    {item?.connected && readState && <SourceReadState provider="meta" state={readState} checking={reading} primary={primary} onRetry={() => void read()} onReconnect={renewAccess} />}
    {note && !open && <p role="status">{note}</p>}
    <UIDialog open={open} onClose={() => setOpen(false)} title={stage === "connect" ? "לחבר את העסק לפייסבוק" : stage === "choose" ? "איזה עסק לחבר?" : doneContext === "tracking" ? "בדיקת המעקב באתר" : "החשבונות נשמרו"} description="הנתונים יעזרו לנו לדייק את התוכנית ואת הפוסטים שלכם.">
      <div className={styles.wizard}>
        {note && <InlineNotice tone="attention" title={note} />}
        {stage === "connect" && <>
          <p>פייסבוק תפתח חלון לאישור קריאת הנתונים. אחריו תבחרו את הדף העסקי; האינסטגרם המקצועי שמקושר אליו ייבחר איתו.</p>
          <details className={styles.setupGuide}><summary>יש לכם גם מודעות בתשלום?<IconChevron className={styles.disclosureIcon} /></summary>
            <label className={styles.check}><input type="checkbox" checked={ads} onChange={e => setAds(e.target.checked)} disabled={waiting} /><span>לחבר גם את נתוני המודעות<small>כדי לבדוק הוצאות ותוצאות. אפשר גם בהמשך.</small></span></label>
          </details>
          <p className={styles.hint}>גישה לקריאת נתונים בלבד. פרסום פוסטים ושינוי מודעות דורשים אישור נפרד.</p>
          <UIAction onClick={() => void connect()} busy={busy} disabled={waiting}>{waiting ? "ממתינים לאישור בחלון של פייסבוק" : "לאשר בפייסבוק ולבחור את הדף"}</UIAction>
          {(waiting || canResume) && <UIAction variant="text" onClick={() => { setWaiting(false); void loadAssets(); }}>אישרתי, להמשיך לבחירת העסק</UIAction>}
        </>}
        {stage === "choose" && assets && <>
          <label className={styles.field}>הדף העסקי<select value={page} onChange={e => setPage(e.target.value)}>
            <option value="" disabled={assets.pages.length > 0}>{assets.pages.length ? "בחרו את הדף" : "בלי דף כרגע"}</option>
            {assets.pages.map(p => <option key={p.page_id} value={p.page_id}>{p.display_name}</option>)}
            {assets.pages.length > 0 && <option value={NO_PAGE}>בלי דף כרגע</option>}
          </select></label>
          {selectedPage && <p className={styles.hint}>{selectedPage.instagram_id ? "האינסטגרם המקושר לדף הזה יתחבר יחד איתו." : "לא נמצא אינסטגרם מקושר לדף. אפשר לחבר אותו לדף בפייסבוק ולחזור לכאן."}</p>}
          {!assets.pages.length && <p className={styles.hint}>{assets.errors.pages?.note_he || "לא נמצאו דפים שאושרו. ודאו שהחשבון שנכנס לפייסבוק מנהל את הדף ושבחרתם בו בחלון האישור."} במסלול הזה האינסטגרם צריך להיות מקצועי ומקושר לדף פייסבוק.</p>}
          <details className={styles.setupGuide} open={Boolean(account) || undefined}>
            <summary>גם נתוני מודעות ומעקב באתר?<IconChevron className={styles.disclosureIcon} /></summary>
            <div className={styles.setupBody}>
              {assets.scopes.some(scope => ["ads_read", "ads_management"].includes(scope)) ? <>
          <label className={styles.field}>חשבון הפרסום <small>אפשר גם בהמשך</small><select value={account} onChange={e => { void chooseAccount(e.target.value); }}><option value="">בלי נתוני מודעות כרגע</option>{assets.ad_accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` (${a.currency})` : ""}</option>)}</select></label>
          {!assets.ad_accounts.length && <p className={styles.hint}>{assets.errors.ads?.note_he || "לא נמצאו חשבונות פרסום. אפשר להמשיך עם הדף ולחבר פרסום בהמשך."}</p>}
          {account && <>
            <label className={styles.field}>המעקב באתר (Meta Pixel)<select value={pixel} onChange={e => setPixel(e.target.value)} disabled={loadingPixels}><option value="">{loadingPixels ? "מחפשים את המעקב…" : "לבחור בהמשך"}</option>{pixels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            {pixelNote ? <p className={styles.hint}>{pixelNote}</p> : !loadingPixels && !pixels.length ? <p className={styles.hint}>לא נמצא מעקב בחשבון הזה. תוכלו לחבר אותו דרך מערכת האתר; החיבור לפרסום לא תלוי בכך.</p> : null}
            {!loadingPixels && !pixels.length && <PixelSetupGuide onRefresh={() => { void chooseAccount(account); }} busy={busy} />}
          </>}
          {!account && <p className={styles.hint}>כדי לבחור מעקב לאתר, בחרו גם את חשבון הפרסום שמקושר אליו. אפשר להמשיך בינתיים עם נתוני הדף.</p>}
              </> : <>
                <p className={styles.hint}>אם אתם מפרסמים בתשלום, אפשר לאשר קריאה נוספת בפייסבוק. הדף נשאר בבחירה שלכם.</p>
                <UIAction variant="secondary" onClick={() => void connect(true)} busy={busy}>לחבר גם את נתוני המודעות</UIAction>
              </>}
            </div>
          </details>
          <UIAction onClick={save} busy={busy} disabled={loadingPixels || (assets.pages.length > 0 && !page) || ((!page || page === NO_PAGE) && !account)}>{account ? "אלה החשבונות של העסק שלי" : "זה הדף של העסק שלי"}</UIAction>
          <UIAction variant="text" onClick={() => { setStage("connect"); setNote(""); }}>החשבון חסר? לחבר שוב עם מנהל העסק</UIAction>
        </>}
        {stage === "done" && <>
          {doneContext === "saved" ? <p>הבחירה נשמרה.</p> : null}
          {readState && <SourceReadState provider="meta" state={readState} checking={reading} onRetry={() => void read()} onReconnect={renewAccess} />}
          {account && !pixel && <>
            <p className={styles.hint}>נתוני המודעות מחוברים. כדי למדוד גם פעולות באתר, בחרו את המעקב של העסק.</p>
            <UIAction variant="text" onClick={() => { setBusy(true); void loadAssets(); }}>לבחור את המעקב שלי</UIAction>
            <PixelSetupGuide onRefresh={() => { setBusy(true); void loadAssets(); }} busy={busy} />
          </>}
          {pixel && <div className={styles.tracking}>
            <h3>האם המעקב באתר עובד?</h3>
            <p className={styles.hint}><strong>{selectedPixel?.name || tracking?.name || "המעקב של העסק"}</strong><br />האתר לבדיקה: {website ? <bdi>{website}</bdi> : <>לא הוגדר אתר. <Link href="/business">להוסיף את כתובת האתר</Link></>}</p>
            <p>{tracking?.note_he || "נבדוק אם פייסבוק מקבלת אירועים מהכתובת של העסק."}</p>
            {tracking?.checked_at && <small>נבדק: {new Date(tracking.checked_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</small>}
            <UIAction onClick={verify} busy={busy}>לבדוק את המעקב</UIAction>
            {tracking && ["waiting", "site_unconfirmed"].includes(tracking.status) && website && <a href={website} target="_blank" rel="noopener noreferrer" className={styles.retry}>לפתוח את האתר ולנסות שוב</a>}
            {tracking?.status === "wrong_site" && <UIAction variant="text" onClick={() => { setBusy(true); void loadAssets(); }}>לבחור את המעקב של האתר שלי</UIAction>}
            {tracking && ["permission", "reconnect"].includes(tracking.status) && <UIAction variant="text" onClick={renewAccess}>לחדש את הגישה למעקב</UIAction>}
            {(!tracking || tracking.status === "waiting") && <PixelSetupGuide onRefresh={() => { setBusy(true); void loadAssets(); }} busy={busy} />}
            <details className={styles.trackingDetails}>
              <summary>פרטי המעקב ושינוי הבחירה<IconChevron className={styles.disclosureIcon} /></summary>
              <div className={styles.setupBody}>
                <p>מזהה המעקב: <bdi>{pixel}</bdi></p>
                <button type="button" className={styles.textAction} onClick={() => { setBusy(true); void loadAssets(); }} disabled={busy}>לבחור מעקב אחר</button>
              </div>
            </details>
            <p className={styles.hint}>הבדיקה מראה שהאתר שולח אירועים. היא לא מאשרת הזמנות או סכומים.</p>
          </div>}
          <Link href="/strategy" className={styles.next}>להמשיך בתוכנית ←</Link>
          <UIAction variant="text" onClick={() => setOpen(false)}>לסגור ולהמשיך אחר כך</UIAction>
        </>}
      </div>
    </UIDialog>
  </div>;
}
