"use client";

import { useEffect, useState } from "react";
import {
  PUBLISH_SCOPE_LABELS,
  endpoints,
  type PublishCapability,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import { IconChevron, IconCopy, IconImage, IconLink, IconWhatsApp } from "@/lib/icons";
import { copyText, toast, whatsappShareUrl } from "@/lib/ui";
import { whatsappEndpoints, type WhatsappPostLink } from "@/lib/whatsapp";
import { shortDay } from "@/components/posts/postMeta";
import ui from "@/components/posts/chrome.module.css";

type OutletKey = "instagram" | "facebook" | "whatsapp" | "tiktok";

/** The two platforms' marks, drawn in the icon set's own line (24px grid, 1.6 stroke) so
 *  they sit with the rest of the controls instead of as emoji. */
function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 8.2h-1.3a1.9 1.9 0 0 0-1.9 1.9v10.3M9.4 13h4.8" />
    </svg>
  );
}

/** The platforms the owner actually posts to by hand. Each one is opened, not filled:
 *  neither Instagram nor Facebook lets another site pre-fill a caption, so the honest
 *  control is a link to the app plus the instruction to paste. WhatsApp is the exception
 *  and gets its own pre-filled link below. */
const COMPOSERS: { key: OutletKey; label: string; href: string; Icon: () => React.JSX.Element }[] = [
  { key: "instagram", label: "אינסטגרם", href: "https://www.instagram.com/", Icon: InstagramGlyph },
  { key: "facebook", label: "פייסבוק", href: "https://www.facebook.com/", Icon: FacebookGlyph },
];

export type PublishPanelProps = {
  post: RoadmapPost;
  /** The post's place in the month — what every write addresses. */
  postIndex: number;
  /** The channel being looked at — the caption and the composer links follow it. */
  outlet: OutletKey;
  outletLabel: string;
  /** The caption resolved for that channel: `outlet_captions[outlet]`, else `caption`. */
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

  // The pasted-URL flow, moved in here unchanged: the state stays in PostEditor so
  // switching posts keeps resetting it the way it always did.
  publishUrl: string;
  onPublishUrlChange: (value: string) => void;
  publishing: boolean;
  onMarkPublished: () => void;
};

/**
 * The publishing handoff.
 *
 * This panel exists because of one hard limit: the Meta connection holds read-only
 * permissions, and posting to an Instagram business account or a Facebook Page needs
 * `instagram_content_publish` / `pages_manage_posts`, which Meta only grants after it
 * reviews the app. Nothing here can change that, so nothing here pretends to: there is no
 * publish button, and the capability note says why in the API's own words.
 *
 * What is left is the part that genuinely works today — the kit. The card downloads, the
 * caption and the tracked link copy, WhatsApp opens with the whole message already in it,
 * and the two platforms that cannot be pre-filled open next to the instruction to paste.
 * A date can be set so nothing is forgotten, and the pasted URL still closes the loop.
 */
export function PublishPanel({
  post,
  postIndex,
  outlet,
  outletLabel,
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
}: PublishPanelProps) {
  const [scheduleDate, setScheduleDate] = useState(post.scheduled_for || "");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [capability, setCapability] = useState<PublishCapability | null>(null);
  const [capabilityError, setCapabilityError] = useState("");

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

  // The post's own WhatsApp tracked link, when its call to action is WhatsApp. The server
  // creates it on first read and returns the same link after that. A failure here only
  // hides the block; the rest of the kit does not depend on it.
  const [waLink, setWaLink] = useState<WhatsappPostLink | null>(null);
  useEffect(() => {
    let active = true;
    whatsappEndpoints
      .forPost(postIndex, post.cta || "")
      .then((result) => {
        if (active) setWaLink(result);
      })
      .catch(() => {
        if (active) setWaLink(null);
      });
    return () => {
      active = false;
    };
  }, [postIndex, post.cta]);

  // The field is seeded from the server's post and kept in step by every write below. The
  // editor remounts this panel when the owner switches post, so there is no second copy of
  // "which post is this" to keep in sync — and a failed save restores `storedDate` rather
  // than leaving a date on screen that was never stored.
  const storedDate = post.scheduled_for || "";
  const trackingUrl = post.tracking_url || "";
  const whatsappText = trackingUrl ? `${caption}\n\n${trackingUrl}` : caption;
  const published = Boolean(post.published_url);
  // The channel being looked at leads: it is the one the owner is about to post to.
  const composers = [...COMPOSERS].sort(
    (a, b) => Number(b.key === outlet) - Number(a.key === outlet)
  );

  async function saveSchedule(value: string) {
    if (savingSchedule || imageLocked) return;
    setSavingSchedule(true);
    setScheduleError("");
    try {
      const result = await endpoints.schedulePost(postIndex, value);
      setScheduleDate(result.post.scheduled_for || "");
      onStrategy(result.strategy);
      toast(value ? "התאריך נשמר. הפוסט יופיע בתור לפרסום." : "התאריך הוסר מהפוסט.");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "לא הצלחנו לשמור את התאריך");
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

  return (
    // No box of its own: it lives inside the editor's sheet or side panel, which is the card.
    // Groups are divided by hairlines, each with one title and its controls under it.
    <div className="divide-y divide-[var(--rule)]">
      {/* ---- what the owner needs in hand to post by hand ---- */}
      <section className="pb-5">
        <h3 className={ui.groupTitle}>מה צריך כדי לפרסם</h3>
        <p className={`${ui.meta} mt-0.5 font-normal`}>
          {storedDate ? `מתוכנן ליום ${shortDay(storedDate)}` : "עוד לא נקבע תאריך"}
          {published ? " · סומן כפורסם" : ""}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" disabled={exportDisabled} onClick={onExportCard} className={ui.button}>
            <IconImage />
            {exporting ? "מורידים את הכרטיס…" : "להוריד את הכרטיס"}
          </button>
          <a
            href={whatsappShareUrl(whatsappText)}
            target="_blank"
            rel="noopener noreferrer"
            className={ui.button}
          >
            <IconWhatsApp className="text-[color:var(--good)]" />
            לשלוח בוואטסאפ
          </a>
          {composers.map((composer) => (
            <a
              key={composer.key}
              href={composer.href}
              target="_blank"
              rel="noopener noreferrer"
              className={ui.button}
            >
              <composer.Icon />
              לפתוח את {composer.label}
            </a>
          ))}
        </div>
        <p className={`${ui.help} mt-3`}>
          וואטסאפ ייפתח עם הכיתוב והקישור, מוכנים לשליחה. באינסטגרם ובפייסבוק אי אפשר למלא
          כיתוב מבחוץ, אז פותחים את האפליקציה ומדביקים.
        </p>
      </section>

      {/* The caption for the channel being looked at, ready to paste. The text itself is
          under the preview and in the editor's "טקסט" section; a third full copy here only
          made the panel longer. */}
      <section className="flex items-center justify-between gap-3 py-3">
        <h3 className={ui.groupTitle}>הכיתוב ל{outletLabel}</h3>
        <button
          type="button"
          onClick={() => void copyText(caption, "הכיתוב הועתק.")}
          className={ui.link}
        >
          <IconCopy />
          להעתיק את הכיתוב
        </button>
      </section>

      {/* The tracked link — or the reason there is none, never a dead button. */}
      <section className="py-5">
        <h3 className={ui.groupTitle}>קישור עם מעקב</h3>
        {trackingUrl ? (
          <>
            {/* A tracked URL is long and unreadable; two lines show it is there, the copy
                button hands over all of it, and the tooltip carries the rest. */}
            <div className={`${ui.inset} mt-3 flex items-center gap-3 py-1 pe-1.5 ps-3.5`}>
              <p title={trackingUrl} className="min-w-0 flex-1 truncate font-mono text-xs leading-5 text-[var(--ink-soft)]" dir="ltr">
                {trackingUrl}
              </p>
              <button
                type="button"
                onClick={() => void copyText(trackingUrl, "הקישור הועתק.")}
                className={`${ui.link} shrink-0 rounded-[10px] px-2 text-[13px]`}
              >
                <IconLink />
                להעתיק את הקישור
              </button>
            </div>
            <p className={`${ui.help} mt-2`}>
              כשמפרסמים עם הקישור הזה, נוכל לדעת אחר כך אילו לחיצות ופניות הגיעו מהפוסט.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            לפוסט הזה אין קישור עם מעקב, כי לא רשמתם אתר לעסק. הוסיפו את האתר ב״ההחלטות שלי״,
            וניצור קישור לכל פוסט.
          </p>
        )}
      </section>

      {/* The post's WhatsApp link: only for a post that asks people to write on WhatsApp. */}
      {waLink?.cta_is_whatsapp ? (
        <section className="py-5">
          <h3 className={`${ui.groupTitle} flex items-center gap-2`}>
            <IconWhatsApp className="h-[18px] w-[18px] text-[var(--good)]" />
            קישור הוואטסאפ של הפוסט
          </h3>
          {waLink.link ? (
            <>
              <div className={`${ui.inset} mt-3 flex items-center gap-3 py-1 pe-1.5 ps-3.5`}>
                <p title={waLink.link.url} className="min-w-0 flex-1 truncate font-mono text-xs leading-5 text-[var(--ink-soft)]" dir="ltr">
                  {waLink.link.url.replace(/^https?:\/\//, "")}
                </p>
                <button
                  type="button"
                  onClick={() => void copyText(waLink.link!.url, "קישור הוואטסאפ הועתק.")}
                  className={`${ui.link} shrink-0 rounded-[10px] px-2 text-[13px]`}
                >
                  <IconCopy />
                  להעתיק
                </button>
              </div>
              <p className={`${ui.help} mt-2`}>
                {/* Instagram does not make links in a feed caption tappable, so the honest
                    place there is the story's link sticker. */}
                בפייסבוק ובוואטסאפ שמים אותו בכיתוב. באינסטגרם קישור בכיתוב לא לחיץ, אז שמים אותו
                במדבקת קישור בסטורי. נספור כמה לחצו, וההודעה תגיע עם הקוד{" "}
                <span dir="ltr">{waLink.link.tag}</span>. אם נשלחה הודעה, רואים רק בוואטסאפ.
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              הפוסט מזמין לכתוב בוואטסאפ, אז מגיע לו קישור משלו.{" "}
              <a href="/integrations" className={`${ui.link} min-h-0`}>
                להגדיר את מספר הוואטסאפ
              </a>
            </p>
          )}
        </section>
      ) : null}

      {/* ---- when it goes out ---- */}
      <section className="py-5">
        <label htmlFor="post-scheduled-for" className={`${ui.groupTitle} block`}>
          מתי לפרסם
        </label>
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
              להסיר את התאריך
            </button>
          ) : null}
          {savingSchedule ? <span className={ui.help}>שומרים…</span> : null}
        </div>
        {storedDate ? null : (
          <p className={`${ui.help} mt-2`}>בלי תאריך, הפוסט לא ייכנס לרשימת הפוסטים שמחכים לפרסום.</p>
        )}
        {scheduleError ? (
          <p className={`${ui.error} mt-3`}>
            {scheduleError}
          </p>
        ) : null}
      </section>

      {/* ---- closing the loop after posting by hand ---- */}
      <section className="py-5">
        <h3 className={ui.groupTitle}>אחרי שפרסמתם ב{outletLabel}</h3>
        <p className={`${ui.help} mt-0.5`}>הדביקו כאן את הקישור לפוסט שפורסם, ונמדוד אותו בתוצאות.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="הקישור לפוסט שפורסם"
            value={publishUrl}
            onChange={(event) => onPublishUrlChange(event.target.value)}
            placeholder="https://..."
            dir="ltr"
            className={`${ui.field} min-w-0 flex-1 text-left text-sm`}
          />
          <button
            type="button"
            disabled={publishing}
            onClick={onMarkPublished}
            className={`${ui.button} ${ui.matchField} shrink-0`}
          >
            {published ? "לעדכן את הקישור" : "לסמן שפורסם"}
          </button>
        </div>
      </section>

      {/* ---- why there is no publish button ---- */}
      <section className="pt-5">
        <h3 className="text-sm font-semibold leading-6 text-[var(--ink-soft)]">
          {capability?.auto_publish
            ? "יש הרשאה לפרסום אוטומטי"
            : "אין לנו הרשאה ממטא לפרסם אוטומטית באינסטגרם ובפייסבוק"}
        </h3>

        {capabilityError ? (
          <p className={`${ui.error} mt-2`}>
            {capabilityError}
          </p>
        ) : !capability ? (
          <p className={`${ui.help} mt-1`}>בודקים מה מותר לנו לפרסם…</p>
        ) : (
          // The conclusion is the heading above and stays on the face; the API's reasons are
          // the explanation of it, one tap down (UI-RULES rule 2 and 7).
          <details>
            <summary className={`${ui.summary} text-[13px] font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]`}>
              למה
              <IconChevron />
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
                  מה בדיוק חסר (למי שמנהל את החשבון במטא)
                  <IconChevron />
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
