"use client";

import { useEffect, useRef, useState } from "react";
import {
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
import { ChannelIcon } from "@/components/posts/ChannelIcon";
import { postDay, shortDay } from "@/components/posts/postMeta";
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
}: PublishPanelProps) {
  // The post's day as the feed, the calendar and the editor show it (postDay): the owner's
  // own date, else the plan's. The panel used to read only the owner's date, and said "עוד
  // לא נקבע תאריך" under a list that showed the plan's day for the same post.
  const [scheduleDate, setScheduleDate] = useState(postDay(post));
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

  useEffect(() => {
    if (linkFirst) linkInput.current?.focus({ preventScroll: true });
  }, [linkFirst]);

  // The field is seeded from the server's post and kept in step by every write below. The
  // editor remounts this panel when the owner switches post, so there is no second copy of
  // "which post is this" to keep in sync — and a failed save restores `storedDate` rather
  // than leaving a date on screen that was never stored.
  const storedDate = postDay(post);
  // Only a day the owner set can be removed; the plan's day is where the post belongs.
  const ownDate = post.scheduled_for || "";
  const trackingUrl = post.tracking_url || "";
  // The link the WhatsApp message carries is the one the post is measured by: its own
  // tracked WhatsApp link when it asks people to write on WhatsApp (taps are counted per
  // post code), else the site link with tracking. The site link on a "write to us" post
  // sent people to the site and left the post's WhatsApp taps at nothing.
  const messageLink = waLink?.cta_is_whatsapp && waLink.link ? waLink.link.url : trackingUrl;
  const whatsappText = (text: string) => (messageLink ? `${text}\n\n${messageLink}` : text);
  const published = Boolean(post.published_url);
  // Out: "פרסמתי" was tapped, with or without a link.
  const out = published || Boolean(post.published_at);
  const channelLabel = CHANNEL_LABEL[channel];
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
      setScheduleDate(postDay(result.post));
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
    if (previous && ownDate) void saveSchedule("");
    else setScheduleDate(storedDate);
  }

  // ---- closing the loop after posting by hand ----
  // "פרסמתי" is the whole ask: WhatsApp taps are counted by the post's own code either way.
  // The link is optional and says what it adds (Instagram's reach), never a demand.
  const linkField = channel === "whatsapp" ? null : (
    <div className={out ? "" : "mt-4"}>
      <label htmlFor="post-published-url" className={`${ui.help} block`}>
        {published ? "הקישור לפוסט" : "להדביק קישור לפוסט, כדי לראות גם כמה ראו"}
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
            {publishing ? "שומרים…" : published ? "לעדכן את הקישור" : "לשמור את הקישור"}
          </button>
        ) : null}
      </div>
    </div>
  );
  const doneSection = (
    <section key="done" className={linkFirst ? "pb-5" : "py-5"}>
      {out ? (
        linkField ?? <p className="text-sm leading-6 text-[var(--ink-soft)]">סומן כפורסם. את הלחיצות בוואטסאפ נספור לפי הקוד של הפוסט.</p>
      ) : (
        <>
          <button
            type="button"
            disabled={publishing}
            onClick={onMarkPublished}
            className="drawn-button inline-flex min-h-13 w-full items-center justify-center gap-2.5 bg-[var(--primary)] px-6 text-base text-white enabled:hover:bg-[var(--primary-dark)]"
          >
            <IconCheck className="h-5 w-5" />
            {publishing ? "שומרים…" : "פרסמתי"}
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
          מה צריך כדי לפרסם ב{channelLabel}
        </h3>
        <p className={`${ui.meta} mt-0.5 font-normal`}>
          {storedDate ? `מתוכנן ליום ${shortDay(storedDate)}` : "עוד לא נקבע תאריך"}
          {out ? " · סומן כפורסם" : ""}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" disabled={exportDisabled} onClick={onExportCard} className={ui.button}>
            <IconImage />
            {exporting ? "מורידים את הכרטיס…" : "להוריד את הכרטיס"}
          </button>
          {channel === "whatsapp" ? (
            <a href={whatsappShareUrl(whatsappText(caption))} target="_blank" rel="noopener noreferrer" className={ui.button}>
              <IconWhatsApp className="text-[color:var(--good)]" />
              לשלוח בוואטסאפ
            </a>
          ) : (
            <>
              <button type="button" onClick={() => void copy(caption, "הכיתוב הועתק.")} className={ui.button}>
                <IconCopy />
                להעתיק את הכיתוב
              </button>
              <a href={COMPOSER_HREF[channel]} target="_blank" rel="noopener noreferrer" className={`${ui.button} sm:col-span-2`}>
                <ChannelIcon channel={channel} />
                לפתוח את {channelLabel}
              </a>
            </>
          )}
        </div>
        <p className={`${ui.help} mt-3`}>
          {channel === "whatsapp"
            ? "וואטסאפ ייפתח עם הכיתוב והקישור, מוכנים לשליחה."
            : `ב${channelLabel} אי אפשר למלא כיתוב מבחוץ: מורידים את הכרטיס, מעתיקים את הכיתוב ומדביקים באפליקציה.`}
        </p>
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
                onClick={() => void copy(trackingUrl, "הקישור הועתק.")}
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
                  onClick={() => void copy(waLink.link!.url, "קישור הוואטסאפ הועתק.")}
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

      {/* "פרסמתי", once the post is up (and the optional link). */}
      {linkFirst ? null : doneSection}

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
          {ownDate ? (
            <button
              type="button"
              disabled={imageLocked || savingSchedule}
              onClick={() => void saveSchedule("")}
              className={`${ui.link} ${ui.linkQuiet} text-[13px]`}
            >
              להסיר את התאריך
            </button>
          ) : storedDate ? (
            <button
              type="button"
              disabled={imageLocked || savingSchedule}
              onClick={() => void saveSchedule(storedDate)}
              className={`${ui.link} text-[13px]`}
            >
              לקבוע את התאריך הזה
            </button>
          ) : null}
          {savingSchedule ? <span className={ui.help}>שומרים…</span> : null}
        </div>
        {storedDate ? (
          ownDate ? null : (
            <p className={`${ui.help} mt-2`}>התאריך מהתוכנית. כדי שהפוסט ייכנס לרשימת הפוסטים שמחכים לפרסום, קבעו אותו.</p>
          )
        ) : (
          <p className={`${ui.help} mt-2`}>בלי תאריך, הפוסט לא ייכנס לרשימת הפוסטים שמחכים לפרסום.</p>
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
                <span className="flex-1">אותו פוסט גם ל{CHANNEL_LABEL[key]}</span>
                <IconChevron />
              </summary>
              <p className={`${ui.inset} whitespace-pre-line px-4 py-3 text-sm leading-6 text-[color:var(--ink)]`}>{text}</p>
              <div className="mb-2 mt-1 flex flex-wrap gap-x-5">
                {key === "whatsapp" ? (
                  <a href={whatsappShareUrl(whatsappText(text))} target="_blank" rel="noopener noreferrer" className={ui.link}>
                    <IconWhatsApp />
                    לשלוח בוואטסאפ
                  </a>
                ) : (
                  <>
                    <button type="button" onClick={() => void copy(text, "הכיתוב הועתק.")} className={ui.link}>
                      <IconCopy />
                      להעתיק את הכיתוב
                    </button>
                    <a href={COMPOSER_HREF[key]} target="_blank" rel="noopener noreferrer" className={`${ui.link} ${ui.linkQuiet}`}>
                      לפתוח את {CHANNEL_LABEL[key]}
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
