"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  PUBLISH_SCOPE_LABELS,
  endpoints,
  type PostChannel,
  type PublishCapability,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import { CHANNEL_LABEL } from "@/lib/postLifecycle";
import { IconCheck, IconChevron, IconCopy, IconImage, IconLink, IconWhatsApp } from "@/lib/icons";
import { copyText, toast, whatsappShareUrl } from "@/lib/ui";
import { whatsappEndpoints, type WhatsappPostLink } from "@/lib/whatsapp";
import { loadTrial } from "@/lib/trial";
import { messageWithLink, postDestination, wantsWhatsapp } from "@/lib/postTracking";
import { ChannelIcon } from "@/components/posts/ChannelIcon";
import { shortDay } from "@/components/posts/postMeta";
import ui from "@/components/posts/chrome.module.css";

/** The apps the owner posts to by hand. Each one is opened, not filled: neither Instagram
 *  nor Facebook lets another site pre-fill a caption, so the honest control is a link to
 *  the app plus the instruction to paste. WhatsApp is the exception and opens pre-filled. */
const COMPOSER_HREF: Record<Exclude<PostChannel, "whatsapp">, string> = {
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
};

export type PublishPanelProps = {
  post: RoadmapPost;
  /** The post's place in the month — what every write addresses. */
  postIndex: number;
  /** The one channel the plan chose for this post. The kit is for it; the others are a
   *  quiet "אותו פוסט גם ל…" further down (posts-v2, Revision 1). */
  channel: PostChannel;
  /** The caption for that channel: `outlet_captions[channel]`, else `caption`. */
  caption: string;
  /** True while an image operation is rewriting the same post on the server. */
  imageLocked: boolean;
  /** Every write returns the whole strategy, exactly like the editor's other writes. */
  onStrategy: (strategy: StrategyPayload) => void;

  // The card export already lives in PostEditor. The kit reuses that one implementation
  // rather than rasterising the card a second way.
  onExportCard: () => void;
  exporting: boolean;
  exportDisabled: boolean;

  // "פרסמתי" and the optional link: the state stays in PostEditor so switching posts keeps resetting
  // it the way it always did.
  publishUrl: string;
  onPublishUrlChange: (value: string) => void;
  publishing: boolean;
  onMarkPublished: () => void;
  /** Open on the pasted link: the post is out and the link is what is missing. */
  linkFirst?: boolean;
  onWhatsappLink?: (link: WhatsappPostLink) => void;
};

async function copy(text: string, success: string) {
  try {
    await copyText(text, success);
  } catch {
    toast("לא הצלחנו להעתיק. אפשר לסמן את הטקסט ולהעתיק ידנית.");
  }
}

/**
 * The publishing handoff.
 *
 * This panel exists because of one hard limit: the Meta connection holds read-only
 * permissions, and posting to an Instagram business account or a Facebook Page needs
 * `instagram_content_publish` / `pages_manage_posts`, which Meta only grants after it
 * reviews the app. Nothing here can change that, so nothing here pretends to: there is no
 * publish button, and the capability note says why in the API's own words.
 *
 * What is left is the part that genuinely works today — the kit, for the post's one
 * channel. The card downloads, the caption and the tracked link copy, WhatsApp opens with
 * the whole message already in it, and Instagram and Facebook open next to the instruction
 * to paste. A date can be set so nothing is forgotten, and "פרסמתי" closes the loop (the
 * post's link is optional; it adds Instagram's reach to what is measured).
 */
export function PublishPanel({
  post,
  postIndex,
  channel,
  caption,
  imageLocked,
  onStrategy,
  onExportCard,
  exporting,
  exportDisabled,
  publishUrl,
  onPublishUrlChange,
  publishing,
  onMarkPublished,
  linkFirst = false,
  onWhatsappLink,
}: PublishPanelProps) {
  const t = useCopy();
  const [scheduleDate, setScheduleDate] = useState(post.scheduled_for || "");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [capability, setCapability] = useState<PublishCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);

  // One cheap read, when the panel is first opened. It answers "what is actually
  // permitted" from the stored Meta grant — never from a flag in the app.
  useEffect(() => {
    let active = true;
    endpoints
      .publishCapability()
      .then((result) => {
        if (!active) return;
        setCapability(result);
        setCapabilityError("");
      })
      .catch((err) => {
        if (active) {
          setCapabilityError(err instanceof Error ? err.message : "לא הצלחנו לבדוק אם אפשר לפרסם אוטומטית");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const [waLink, setWaLink] = useState<WhatsappPostLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [linkStale, setLinkStale] = useState(false);
  const [linkRetry, setLinkRetry] = useState(0);
  const [numberDraft, setNumberDraft] = useState("");
  const [savingNumber, setSavingNumber] = useState(false);
  const linkVersion = useRef(0);
  const [placement, setPlacement] = useState<"story" | "profile">(post.format === "story" ? "story" : "profile");
  const needsWhatsapp = wantsWhatsapp(post) || Boolean(waLink?.cta_is_whatsapp);

  useEffect(() => {
    const version = ++linkVersion.current;
    whatsappEndpoints.forPost(postIndex, post.cta || "", post.uid || "")
      .then(async (result) => {
        if (version !== linkVersion.current) return;
        setWaLink(result);
        if (result.cta_is_whatsapp && !result.number_set) {
          // Offer a researched number, but never save it without the owner's action.
          const settings = await whatsappEndpoints.get();
          if (version === linkVersion.current) setNumberDraft((draft) => draft || settings.suggested_number);
        }
      })
      .catch((error) => {
        if (version !== linkVersion.current) return;
        const stale = error instanceof ApiError && error.status === 409;
        setLinkStale(stale);
        setLinkError(stale ? "הפוסט השתנה. פתחו אותו שוב כדי להכין את הקישור." : "לא הצלחנו להכין את הקישור. נסו שוב.");
      })
      .finally(() => {
        if (version === linkVersion.current) setLinkLoading(false);
      });
    return () => { linkVersion.current = version + 1; };
  }, [postIndex, post.uid, post.cta, linkRetry]);

  async function saveNumber(event: React.FormEvent) {
    event.preventDefault();
    if (savingNumber || !numberDraft.trim()) return;
    const version = linkVersion.current;
    setSavingNumber(true);
    setLinkError("");
    try {
      await whatsappEndpoints.save({ number: numberDraft.trim() });
      const result = await whatsappEndpoints.forPost(postIndex, post.cta || "", post.uid || "");
      if (version !== linkVersion.current) return;
      setWaLink(result);
      onWhatsappLink?.(result);
      void loadTrial(true);
    } catch (error) {
      if (version === linkVersion.current) {
        setLinkStale(error instanceof ApiError && error.status === 409);
        setLinkError(error instanceof Error ? error.message : "לא הצלחנו להכין את הקישור. נסו שוב.");
      }
    } finally {
      if (version === linkVersion.current) setSavingNumber(false);
    }
  }

  useEffect(() => {
    if (linkFirst) linkInput.current?.focus({ preventScroll: true });
  }, [linkFirst]);

  // The field is seeded from the server's post and kept in step by every write below. The
  // editor remounts this panel when the owner switches post, so there is no second copy of
  // "which post is this" to keep in sync — and a failed save restores `storedDate` rather
  // than leaving a date on screen that was never stored.
  const storedDate = post.scheduled_for || "";
  const messageLink = postDestination(post, waLink);
  const whatsappText = (text: string) => messageWithLink(text, messageLink);
  const published = Boolean(post.published_url);
  // Out: "פרסמתי" was tapped, with or without a link.
  const out = published || Boolean(post.published_at);
  const channelLabel = t(CHANNEL_LABEL[channel]);
  // The same post for the plan's other channels, when the plan wrote a caption for them.
  const crossPosts = (Object.keys(CHANNEL_LABEL) as PostChannel[]).flatMap((key) => {
    const text = key === channel ? "" : (post.outlet_captions?.[key] || "").trim();
    return text ? [{ key, text }] : [];
  });

  async function saveSchedule(value: string) {
    if (savingSchedule || imageLocked) return;
    setSavingSchedule(true);
    setScheduleError("");
    try {
      const result = await endpoints.schedulePost(postIndex, value);
      setScheduleDate(result.post.scheduled_for || "");
      onStrategy(result.strategy);
      toast(value ? t("התאריך נשמר. הפוסט יופיע בתור לפרסום.") : t("התאריך הוסר מהפוסט."));
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : t("לא הצלחנו לשמור את התאריך"));
      setScheduleDate(storedDate);
    } finally {
      setSavingSchedule(false);
    }
  }

  /** A native date field reports "" for a half-typed day. Writing that would clear a real
   *  schedule on the way to setting a new one, so an empty value is only saved when there
   *  was something to clear. */
  function changeSchedule(raw: string) {
    const previous = scheduleDate;
    setScheduleDate(raw);
    setScheduleError("");
    if (raw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
      void saveSchedule(raw);
      return;
    }
    if (previous) void saveSchedule("");
  }

  // ---- closing the loop after posting by hand ----
  // "פרסמתי" records publication; taps require the prepared link to be placed in it.
  // The link is optional and says what it adds (Instagram's reach), never a demand.
  const linkField = channel === "whatsapp" ? null : (
    <div className={out ? "" : "mt-4"}>
      <label htmlFor="post-published-url" className={`${ui.help} block`}>
        {published ? t("הקישור לפוסט") : t("להדביק קישור לפוסט, כדי לראות גם כמה ראו")}
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          ref={linkInput}
          id="post-published-url"
          value={publishUrl}
          onChange={(event) => onPublishUrlChange(event.target.value)}
          placeholder="https://..."
          dir="ltr"
          className={`${ui.field} min-w-0 flex-1 text-left text-sm`}
        />
        {out ? (
          <button
            type="button"
            disabled={publishing || !publishUrl.trim()}
            onClick={onMarkPublished}
            className={`${ui.button} ${ui.matchField} shrink-0`}
          >
            {publishing ? t("שומרים…") : published ? t("לעדכן את הקישור") : t("לשמור את הקישור")}
          </button>
        ) : null}
      </div>
    </div>
  );
  const doneSection = (
    <section key="done" className={linkFirst ? "pb-5" : "py-5"}>
      {out ? (
        linkField ?? <p className="text-sm leading-6 text-[var(--ink-soft)]">{messageLink ? t("סומן כפורסם. לחיצות על הקישור של הפוסט יופיעו בתוצאות.") : t("סומן כפורסם. הוסיפו מספר וואטסאפ כדי להכין קישור שאפשר למדוד.")}</p>
      ) : (
        <>
          <button
            type="button"
            disabled={publishing}
            onClick={onMarkPublished}
            className="drawn-button inline-flex min-h-13 w-full items-center justify-center gap-2.5 bg-[var(--primary)] px-6 text-base text-white enabled:hover:bg-[var(--primary-dark)]"
          >
            <IconCheck className="h-5 w-5" />
            {publishing ? t("שומרים…") : t("פרסמתי")}
          </button>
          {linkField}
        </>
      )}
    </section>
  );

  return (
    // No box of its own: it lives inside the editor's sheet or side panel, which is the card.
    // Groups are divided by hairlines, each with one title and its controls under it.
    <div className="divide-y divide-[var(--rule)]">
      {linkFirst ? doneSection : null}

      {/* ---- what the owner needs in hand to post by hand, for the one channel ---- */}
      <section className={linkFirst ? "py-5" : "pb-5"}>
        <h3 className={`${ui.groupTitle} flex items-center gap-2`}>
          <ChannelIcon channel={channel} className="h-[18px] w-[18px] text-[color:var(--ink-muted)]" />
          {t("מה צריך כדי לפרסם ב{arg_0}", { arg_0: channelLabel })}
        </h3>
        <p className={`${ui.meta} mt-0.5 font-normal`}>
          {storedDate ? t("מתוכנן ליום {arg_0}", { arg_0: shortDay(storedDate) }) : t("עוד לא נקבע תאריך")}
          {out ? t(" · סומן כפורסם") : ""}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" disabled={exportDisabled} onClick={onExportCard} className={ui.button}>
            <IconImage />
            {exporting ? t("מורידים את הכרטיס…") : t("להוריד את הכרטיס")}
          </button>
          {channel === "whatsapp" && (!needsWhatsapp || messageLink) ? (
            <a href={whatsappShareUrl(whatsappText(caption))} target="_blank" rel="noopener noreferrer" className={ui.button}>
              <IconWhatsApp className="text-[color:var(--good)]" />
              <Copy text="לשלוח בוואטסאפ" /></a>
          ) : (
            <>
              <button type="button" onClick={() => void copy(caption, t("הכיתוב הועתק."))} className={ui.button}>
                <IconCopy />
                <Copy text="להעתיק את הכיתוב" /></button>
              <a href={channel === "whatsapp" ? "https://web.whatsapp.com/" : COMPOSER_HREF[channel]} target="_blank" rel="noopener noreferrer" className={`${ui.button} sm:col-span-2`}>
                <ChannelIcon channel={channel} />
                {t("לפתוח את {arg_0}", { arg_0: channelLabel })}
              </a>
            </>
          )}
        </div>
        <p className={`${ui.help} mt-3`}>
          {channel === "whatsapp"
            ? t("וואטסאפ ייפתח עם הכיתוב והקישור, מוכנים לשליחה.")
            : t("ב{arg_0} אי אפשר למלא כיתוב מבחוץ: מורידים את הכרטיס, מעתיקים את הכיתוב ומדביקים באפליקציה.", { arg_0: channelLabel })}
        </p>
      </section>

      {/* One destination for this post, followed by the concrete place to use it. */}
      <section className="py-5">
        <h3 className={ui.groupTitle}>{needsWhatsapp ? t("קישור הוואטסאפ של הפוסט") : t("הקישור של הפוסט")}</h3>
        {needsWhatsapp && linkLoading ? <p className={`${ui.help} mt-2`} role="status"><Copy text="מכינים את הקישור…" /></p> : null}
        {needsWhatsapp && waLink && !waLink.number_set ? (
          <form onSubmit={saveNumber} className="mt-3">
            <label htmlFor="post-whatsapp-number" className={ui.help}><Copy text="באיזה מספר לקוחות יכולים לכתוב לכם?" /></label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input id="post-whatsapp-number" type="tel" autoComplete="tel" dir="ltr" placeholder="050-1234567"
                value={numberDraft} onChange={(event) => setNumberDraft(event.target.value)} disabled={savingNumber}
                className={`${ui.field} min-w-0 flex-1 text-left`} aria-describedby="post-link-help" />
              <button type="submit" disabled={savingNumber || !numberDraft.trim()} className={`${ui.button} ${ui.matchField}`}>
                {savingNumber ? t("שומרים…") : t("לשמור ולהכין קישור")}
              </button>
            </div>
            <p id="post-link-help" className={`${ui.help} mt-2`}><Copy text="נכין קישור לפוסט הזה ונראה כמה לחצו עליו." /></p>
          </form>
        ) : null}
        {linkError && needsWhatsapp ? (
          <div className="mt-2">
            <p role="alert" className={ui.error}>{t(linkError)}</p>
            {!waLink || waLink.number_set || linkStale ? <button type="button" onClick={() => { if (linkStale) void endpoints.strategy().then(onStrategy).catch(() => setLinkError("לא הצלחנו להכין את הקישור. נסו שוב.")); else { setLinkLoading(true); setLinkError(""); setWaLink(null); setLinkRetry((value) => value + 1); } }} disabled={linkLoading || savingNumber} className={ui.link}>{linkStale ? t("לפתוח את הפוסט המעודכן") : t("לנסות שוב")}</button> : null}
          </div>
        ) : null}
        {messageLink ? (
          <>
            <div className={`${ui.inset} mt-3 flex items-center gap-3 py-1 pe-1.5 ps-3.5`}>
              <p title={messageLink} className="min-w-0 flex-1 truncate font-mono text-xs leading-5 text-[var(--ink-soft)]" dir="ltr">{messageLink.replace(/^https?:\/\//, "")}</p>
              <button type="button" onClick={() => void copy(messageLink, t("הקישור הועתק."))} className={`${ui.link} shrink-0 rounded-[10px] px-2 text-[13px]`}>
                <IconLink /><Copy text="להעתיק את הקישור" />
              </button>
            </div>
            {channel === "instagram" ? (
              <div className="mt-3">
                <div role="group" aria-label={t("איפה לשים את הקישור")} className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={placement === "story"} onClick={() => setPlacement("story")} className={ui.chip}><Copy text="בסטורי" /></button>
                  <button type="button" aria-pressed={placement === "profile"} onClick={() => setPlacement("profile")} className={ui.chip}><Copy text="בפרופיל" /></button>
                </div>
                <p className={`${ui.help} mt-2`}>
                  {placement === "story" ? t("באפליקציית אינסטגרם: פתחו סטורי, בחרו במדבקת קישור והדביקו את הקישור.") : t("באפליקציית אינסטגרם: פתחו את הפרופיל של העסק, בחרו בעריכת הפרופיל, בקישורים ובהוספת קישור חיצוני.")}
                </p>
                {placement === "profile" ? <p className={`${ui.help} mt-1`}><Copy text="הקישור משותף לכל מי שנכנס לפרופיל. הלחיצות אינן מוכיחות שהגיעו מפוסט מסוים." /></p> : null}
              </div>
            ) : <p className={`${ui.help} mt-2`}><Copy text="הוסיפו את הקישור לכיתוב לפני הפרסום." /></p>}
            <p className={`${ui.help} mt-2`}>{needsWhatsapp ? t("נספור לחיצות על הקישור. הודעות שנשלחו רואים בוואטסאפ.") : t("עם נתוני אתר מחוברים נראה ביקורים דרך הקישור הזה.")}</p>
          </>
        ) : !needsWhatsapp ? <p className={`${ui.help} mt-2`}><Copy text="הוסיפו אתר עסק ב״ההחלטות שלי״ כדי להכין קישור לאתר." /><a href="/decisions" className={ui.link}><Copy text="להוסיף אתר" /></a></p> : null}
      </section>

      {/* "פרסמתי", once the post is up (and the optional link). */}
      {linkFirst ? null : doneSection}

      {/* ---- when it goes out ---- */}
      <section className="py-5">
        <label htmlFor="post-scheduled-for" className={`${ui.groupTitle} block`}>
          <Copy text="מתי לפרסם" /></label>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            id="post-scheduled-for"
            type="date"
            value={scheduleDate}
            disabled={imageLocked || savingSchedule}
            onChange={(event) => changeSchedule(event.target.value)}
            className={`${ui.field} w-auto min-w-44 text-sm font-medium tabular-nums`}
          />
          {storedDate ? (
            <button
              type="button"
              disabled={imageLocked || savingSchedule}
              onClick={() => void saveSchedule("")}
              className={`${ui.link} ${ui.linkQuiet} text-[13px]`}
            >
              <Copy text="להסיר את התאריך" /></button>
          ) : null}
          {savingSchedule ? <span className={ui.help}><Copy text="שומרים…" /></span> : null}
        </div>
        {storedDate ? null : (
          <p className={`${ui.help} mt-2`}><Copy text="בלי תאריך, הפוסט לא ייכנס לרשימת הפוסטים שמחכים לפרסום." /></p>
        )}
        {scheduleError ? (
          <p className={`${ui.error} mt-3`}>
            {scheduleError}
          </p>
        ) : null}
      </section>

      {/* ---- the same post elsewhere: a quiet option, never a choice up front ---- */}
      {crossPosts.length ? (
        <section className="py-2">
          {crossPosts.map(({ key, text }) => (
            <details key={key} className="group">
              <summary className={`${ui.summary} text-sm font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]`}>
                <ChannelIcon channel={key} className="h-[18px] w-[18px] text-[color:var(--ink-muted)]" />
                <span className="flex-1">{t("אותו פוסט גם ב{arg_0}", { arg_0: t(CHANNEL_LABEL[key]) })}</span>
                <IconChevron />
              </summary>
              <p className={`${ui.inset} whitespace-pre-line px-4 py-3 text-sm leading-6 text-[color:var(--ink)]`}>{text}</p>
              <div className="mb-2 mt-1 flex flex-wrap gap-x-5">
                {key === "whatsapp" && (!needsWhatsapp || messageLink) ? (
                  <a href={whatsappShareUrl(whatsappText(text))} target="_blank" rel="noopener noreferrer" className={ui.link}>
                    <IconWhatsApp />
                    <Copy text="לשלוח בוואטסאפ" /></a>
                ) : (
                  <>
                    <button type="button" onClick={() => void copy(text, t("הכיתוב הועתק."))} className={ui.link}>
                      <IconCopy />
                      <Copy text="להעתיק את הכיתוב" /></button>
                    <a href={key === "whatsapp" ? "https://web.whatsapp.com/" : COMPOSER_HREF[key]} target="_blank" rel="noopener noreferrer" className={`${ui.link} ${ui.linkQuiet}`}>
                      {t("לפתוח את {arg_0}", { arg_0: t(CHANNEL_LABEL[key]) })}
                    </a>
                  </>
                )}
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {/* ---- why there is no publish button ---- */}
      <section className="pt-5">
        <h3 className="text-sm font-semibold leading-6 text-[var(--ink-soft)]">
          {capability?.auto_publish
            ? t("יש הרשאה לפרסום אוטומטי")
            : t("אין לנו הרשאה ממטא לפרסם אוטומטית באינסטגרם ובפייסבוק")}
        </h3>

        {capabilityError ? (
          <p className={`${ui.error} mt-2`}>
            {capabilityError}
          </p>
        ) : !capability ? (
          <p className={`${ui.help} mt-1`}><Copy text="בודקים מה מותר לנו לפרסם…" /></p>
        ) : (
          // The conclusion is the heading above and stays on the face; the API's reasons are
          // the explanation of it, one tap down (UI-RULES rule 2 and 7).
          <details>
            <summary className={`${ui.summary} text-[13px] font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]`}>
              <Copy text="למה" /><IconChevron />
            </summary>
            {/* The API's own sentences, shown as written. Paraphrasing them into
                "permissions" and "scopes" would be the jargon this panel exists to avoid,
                and softening them would be a promise nobody can keep. */}
            <ul className="space-y-1.5">
              {capability.reasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-2.5 text-[13px] leading-6 text-[var(--ink-soft)]">
                  <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-faint)]" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            {capability.missing.length ? (
              <details className="mt-1">
                <summary className={`${ui.summary} text-[13px] font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]`}>
                  <Copy text="מה בדיוק חסר (למי שמנהל את החשבון במטא)" /><IconChevron />
                </summary>
                <ul className="space-y-1">
                  {capability.missing.map((scope) => (
                    <li key={scope} className="text-[13px] leading-6 text-[var(--ink-soft)]">
                      {PUBLISH_SCOPE_LABELS[scope] || scope}{" "}
                      <span className="font-mono text-xs text-[var(--ink-muted)]">({scope})</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </details>
        )}
      </section>
    </div>
  );
}
