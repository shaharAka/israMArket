"use client";

import { useEffect, useState } from "react";
import {
  PUBLISH_SCOPE_LABELS,
  endpoints,
  type PublishCapability,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import { IconCopy, IconImage, IconLink, IconWhatsApp } from "@/lib/icons";
import { copyText, toast, whatsappShareUrl } from "@/lib/ui";
import { whatsappEndpoints, type WhatsappPostLink } from "@/lib/whatsapp";
import { shortDay } from "@/components/posts/postMeta";

type OutletKey = "instagram" | "facebook" | "whatsapp" | "tiktok";

/** The platforms the owner actually posts to by hand. Each one is opened, not filled:
 *  neither Instagram nor Facebook lets another site pre-fill a caption, so the honest
 *  control is a link to the app plus the instruction to paste. WhatsApp is the exception
 *  and gets its own pre-filled link below. */
const COMPOSERS: { key: OutletKey; label: string; href: string; icon: string }[] = [
  { key: "instagram", label: "אינסטגרם", href: "https://www.instagram.com/", icon: "📸" },
  { key: "facebook", label: "פייסבוק", href: "https://www.facebook.com/", icon: "📘" },
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
    // No border of its own: it lives inside the editor's sheet or side panel, which is the box.
    <div>
      {/* ---- what the owner needs in hand to post by hand ---- */}
      <p className="text-[13px] font-bold text-[#62635f]">מה צריך כדי לפרסם</p>
      <p className="mt-1 text-[13px] leading-5 text-[#62635f]">
        {storedDate ? `מתוכנן ליום ${shortDay(storedDate)}` : "עוד לא נקבע תאריך"}
        {published ? " · סומן כפורסם" : ""}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={exportDisabled}
          onClick={onExportCard}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 text-xs font-bold text-[#20211f] hover:bg-[#faf8f5] disabled:opacity-40"
        >
          <IconImage className="h-3.5 w-3.5" />
          {exporting ? "מורידים את הכרטיס…" : "להוריד את הכרטיס"}
        </button>
        <a
          href={whatsappShareUrl(whatsappText)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#25d366] bg-white px-3 text-xs font-bold text-[#0b7a3d] hover:bg-[#f1fbf5]"
        >
          <IconWhatsApp className="h-4 w-4" />
          לשלוח בוואטסאפ
        </a>
        {composers.map((composer) => (
          <a
            key={composer.key}
            href={composer.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#cecdc7] bg-white px-3 text-xs font-bold text-[#20211f] hover:bg-[#faf8f5]"
          >
            <span aria-hidden>{composer.icon}</span>
            לפתוח את {composer.label}
          </a>
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[#8b8e84]">
        וואטסאפ ייפתח עם הכיתוב והקישור, מוכנים לשליחה. באינסטגרם ובפייסבוק אי אפשר למלא
        כיתוב מבחוץ, אז פותחים את האפליקציה ומדביקים.
      </p>

      {/* The caption for the channel being looked at, ready to paste. The text itself is
          under the preview and in the editor's "טקסט" section; a third full copy here only
          made the panel longer. */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0efeb] pt-3">
        <p className="text-[13px] font-bold text-[#62635f]">הכיתוב ל{outletLabel}</p>
        <button
          type="button"
          onClick={() => void copyText(caption, "הכיתוב הועתק.")}
          className="inline-flex min-h-11 items-center gap-1 text-[13px] font-bold text-[#191b18] underline underline-offset-2"
        >
          <IconCopy className="h-3.5 w-3.5" />
          להעתיק את הכיתוב
        </button>
      </div>

      {/* The tracked link — or the reason there is none, never a dead button. */}
      <div className="mt-3 border-t border-[#f0efeb] pt-3">
        <p className="text-[13px] font-bold text-[#62635f]">קישור עם מעקב</p>
        {trackingUrl ? (
          <>
            {/* A tracked URL is long and unreadable; two lines show it is there, the copy
                button hands over all of it, and the tooltip carries the rest. */}
            <p title={trackingUrl} className="mt-1 line-clamp-2 break-all font-mono text-xs leading-4 text-[#5e6159]" dir="ltr">
              {trackingUrl}
            </p>
            <button
              type="button"
              onClick={() => void copyText(trackingUrl, "הקישור הועתק.")}
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold text-[#191b18] underline underline-offset-2"
            >
              <IconLink className="h-3 w-3" />
              להעתיק את הקישור
            </button>
            <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
              כשמפרסמים עם הקישור הזה, נוכל לדעת אחר כך אילו לחיצות ופניות הגיעו מהפוסט.
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] leading-5 text-[#62635f]">
            לפוסט הזה אין קישור עם מעקב, כי לא רשמתם אתר לעסק. הוסיפו את האתר ב״ההחלטות שלי״,
            וניצור קישור לכל פוסט.
          </p>
        )}
      </div>

      {/* The post's WhatsApp link: only for a post that asks people to write on WhatsApp. */}
      {waLink?.cta_is_whatsapp ? (
        <div className="mt-3 border-t border-[#f0efeb] pt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#62635f]">
            <IconWhatsApp className="h-4 w-4 text-[#0b7a3d]" />
            קישור הוואטסאפ של הפוסט
          </p>
          {waLink.link ? (
            <>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p title={waLink.link.url} className="min-w-0 truncate font-mono text-xs leading-4 text-[#5e6159]" dir="ltr">
                  {waLink.link.url.replace(/^https?:\/\//, "")}
                </p>
                <button
                  type="button"
                  onClick={() => void copyText(waLink.link!.url, "קישור הוואטסאפ הועתק.")}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[13px] font-bold text-[#191b18] underline underline-offset-2"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                  להעתיק
                </button>
              </div>
              <p className="text-xs leading-5 text-[#8b8e84]">
                {/* Instagram does not make links in a feed caption tappable, so the honest
                    place there is the story's link sticker. */}
                בפייסבוק ובוואטסאפ שמים אותו בכיתוב. באינסטגרם קישור בכיתוב לא לחיץ, אז שמים אותו
                במדבקת קישור בסטורי. נספור כמה לחצו, וההודעה תגיע עם הקוד{" "}
                <span dir="ltr">{waLink.link.tag}</span>. אם נשלחה הודעה, רואים רק בוואטסאפ.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] leading-5 text-[#62635f]">
              הפוסט מזמין לכתוב בוואטסאפ, אז מגיע לו קישור משלו.{" "}
              <a href="/integrations" className="font-bold text-[#191b18] underline underline-offset-2">
                להגדיר את מספר הוואטסאפ
              </a>
            </p>
          )}
        </div>
      ) : null}

      {/* ---- when it goes out ---- */}
      <div className="mt-3 border-t border-[#f0efeb] pt-3">
        <label htmlFor="post-scheduled-for" className="block text-[13px] font-bold text-[#62635f]">
          מתי לפרסם
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            id="post-scheduled-for"
            type="date"
            value={scheduleDate}
            disabled={imageLocked || savingSchedule}
            onChange={(event) => changeSchedule(event.target.value)}
            className="h-10 rounded-md border border-[#cecdc7] bg-white px-2.5 text-xs font-bold text-[#20211f] disabled:opacity-40"
          />
          {storedDate ? (
            <button
              type="button"
              disabled={imageLocked || savingSchedule}
              onClick={() => void saveSchedule("")}
              className="min-h-10 px-1 text-[13px] font-bold text-[#62635f] underline underline-offset-2 disabled:opacity-40"
            >
              להסיר את התאריך
            </button>
          ) : null}
          {savingSchedule ? (
            <span className="text-[13px] text-[#747570]">שומרים…</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
          {storedDate ? "" : "בלי תאריך, הפוסט לא ייכנס לרשימת הפוסטים שמחכים לפרסום."}
        </p>
        {scheduleError ? (
          <p className="mt-1 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-2.5 py-1.5 text-[13px] leading-5 text-[#9f4330]">
            {scheduleError}
          </p>
        ) : null}
      </div>

      {/* ---- closing the loop after posting by hand ---- */}
      <div className="mt-3 border-t border-[#f0efeb] pt-3">
        <p className="text-[13px] font-bold text-[#62635f]">אחרי שפרסמתם ב{outletLabel}</p>
        <p className="mt-1 text-xs leading-5 text-[#8b8e84]">
          הדביקו כאן את הקישור לפוסט שפורסם, ונמדוד אותו בתוצאות.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="הקישור לפוסט שפורסם"
            value={publishUrl}
            onChange={(event) => onPublishUrlChange(event.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-md border border-[#dedcd4] px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={publishing}
            onClick={onMarkPublished}
            className="min-h-10 rounded-md border border-[#c7c4b8] bg-transparent px-3 text-xs font-bold text-[#1e201d] hover:bg-[#f4f3ee] disabled:opacity-40"
          >
            {published ? "לעדכן את הקישור" : "לסמן שפורסם"}
          </button>
        </div>
      </div>

      {/* ---- why there is no publish button ---- */}
      <div className="mt-3 border-t border-[#f0efeb] pt-3">
        <p className="text-[13px] font-bold text-[#62635f]">
          {capability?.auto_publish
            ? "יש הרשאה לפרסום אוטומטי"
            : "אין לנו הרשאה ממטא לפרסם אוטומטית באינסטגרם ובפייסבוק"}
        </p>

        {capabilityError ? (
          <p className="mt-1.5 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-2.5 py-1.5 text-[13px] leading-5 text-[#9f4330]">
            {capabilityError}
          </p>
        ) : !capability ? (
          <p className="mt-1.5 text-[13px] text-[#747570]">בודקים מה מותר לנו לפרסם…</p>
        ) : (
          // The conclusion is the heading above and stays on the face; the API's reasons are
          // the explanation of it, one tap down (UI-RULES rule 2 and 7).
          <details className="mt-1">
            <summary className="min-h-11 cursor-pointer content-center text-[13px] font-bold text-[#62635f] underline underline-offset-2">
              למה
            </summary>
            {/* The API's own sentences, shown as written. Paraphrasing them into
                "permissions" and "scopes" would be the jargon this panel exists to avoid,
                and softening them would be a promise nobody can keep. */}
            <ul className="mt-1.5 space-y-1">
              {capability.reasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-2 text-[13px] leading-5 text-[#5e6159]">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#b3b0a5]" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            {capability.missing.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] font-bold text-[#62635f] underline underline-offset-2">
                  מה בדיוק חסר (למי שמנהל את החשבון במטא)
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {capability.missing.map((scope) => (
                    <li key={scope} className="text-[13px] leading-5 text-[#5e6159]">
                      {PUBLISH_SCOPE_LABELS[scope] || scope}{" "}
                      <span className="font-mono text-xs text-[#8b8e84]">({scope})</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </details>
        )}
      </div>
    </div>
  );
}
