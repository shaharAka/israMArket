"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandSwatch } from "@/lib/api";
import {
  MONTHS_HE,
  NETWORKS,
  TRIED_OPTIONS,
  chosenDirectionOf,
  currentPlan,
  kitFor,
  normalizeHandle,
  presetFor,
  type FlowState,
  type LinkKey,
} from "@/lib/draft";
import { UNKNOWN, baselineSummary, leverName, targetText } from "@/lib/goals";
import { GROW_OPTIONS, budgetLabel, formatIls } from "@/lib/quarterPlan";
import { IconChevron, IconLock } from "@/lib/icons";
import { modelOf } from "./script";
import { BidiText, NetworkIcon, inkOn } from "./ui";
import styles from "./start.module.css";

/**
 * "העסק שלכם": the business card we fill in together, one answer at a time.
 *
 * It is the portal the owner is building, so every answer lands here visibly: a slot
 * that was just answered rises in on a sun wash, and a slot not answered yet stays as one
 * quiet line ("עוד לא סיפרתם") instead of disappearing. Desktop shows it as a sticky side
 * panel; phones get `CardBar`, a compact summary that opens into this card.
 */

export type CardLook = {
  palette: BrandSwatch[] | null;
  logoUrl: string | null;
  source: "site" | "preset" | null;
};

export function lookOf(flow: FlowState): CardLook {
  const scan = flow.brandScan;
  if (scan?.status === "ready" && scan.brand?.palette?.length) {
    return { palette: scan.brand.palette, logoUrl: scan.brand.logo_url, source: "site" };
  }
  const preset = presetFor(flow.draft.style_preset);
  if (preset) return { palette: preset.palette, logoUrl: null, source: "preset" };
  return { palette: null, logoUrl: null, source: null };
}

function swatch(palette: BrandSwatch[] | null, role: BrandSwatch["role"], fallback: string): string {
  return palette?.find((s) => s.role === role)?.hex ?? palette?.[0]?.hex ?? fallback;
}

/** The monogram in the business's own colour once we have it; our soft blue until then. */
function markColours(look: CardLook): { bg: string; ink: string } {
  if (!look.palette) return { bg: "var(--primary-soft)", ink: "var(--primary)" };
  const bg = swatch(look.palette, "primary", "#ffffff");
  return { bg, ink: inkOn(bg) };
}

type Slot = { key: string; filled: boolean };

export function cardSlots(flow: FlowState): Slot[] {
  const d = flow.draft;
  const anyLink = Object.keys(d.links).length > 0;
  return [
    { key: "name", filled: Boolean(d.business_name.trim()) },
    { key: "what", filled: Boolean(d.business_type) },
    { key: "different", filled: Boolean(d.differentiator?.trim()) },
    { key: "audiences", filled: d.audiences.length > 0 },
    { key: "seasons", filled: Boolean(d.seasons && (d.seasons.busy.length || d.seasons.slow.length)) },
    { key: "links", filled: Boolean(d.has_none || anyLink) },
    {
      key: "tried",
      filled: Boolean(flow.triedNone || d.tried?.channels.length || d.tried?.what_worked?.trim()),
    },
    { key: "competitors", filled: Boolean(d.competitors?.some((c) => c.name.trim())) },
    { key: "baseline", filled: Object.values(d.baseline ?? {}).some((v) => v !== undefined && v !== UNKNOWN) },
    { key: "lever", filled: Boolean(d.lever?.primary) },
    { key: "budget", filled: Boolean(d.budget?.range) },
    { key: "target", filled: Boolean(targetText(d.target)) },
    { key: "direction", filled: Boolean(flow.quarterPlan && chosenDirectionOf(flow)) },
    { key: "plan", filled: Boolean(currentPlan(flow)) },
  ];
}

export function filledCount(flow: FlowState): { filled: number; total: number } {
  const slots = cardSlots(flow);
  return { filled: slots.filter((s) => s.filled).length, total: slots.length };
}

/**
 * One row of the card. Answered: the label over the answer. Not yet: one short line, the
 * label and "עוד לא סיפרתם" side by side. Only a slot that fills while the card is on
 * screen animates, not every slot on open.
 */
function Row({
  label,
  on,
  empty,
  children,
}: {
  label: string;
  on: boolean;
  /** What comes instead ("נבחר יחד בסוף"). Without one: "עוד לא סיפרתם". */
  empty?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [filledAtMount] = useState(on);
  if (!on) {
    return (
      <div className={`${styles.row} ${styles.rowEmpty}`}>
        <p className={styles.rowLabel}>{label}</p>
        {empty ? (
          <p className={styles.rowValue}>{empty}</p>
        ) : (
          <p className={styles.rowValue}>
            <span aria-hidden className={styles.rowPending} />
            <span className="sr-only">עוד לא סיפרתם</span>
          </p>
        )}
      </div>
    );
  }
  return (
    <div className={styles.row}>
      <p className={styles.rowLabel}>{label}</p>
      <div className={`${styles.rowValue} -mx-1 px-1 ${filledAtMount ? "" : styles.fill}`}>{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.cardSection}>
      <h3 className={styles.cardSectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Monogram({ name, bg, ink, size = "lg" }: { name: string; bg: string; ink: string; size?: "sm" | "lg" }) {
  const letter = name.trim().charAt(0) || "·";
  const box = size === "sm" ? "h-8 w-8 !rounded-[10px] text-sm" : "h-12 w-12 text-xl";
  return (
    <span className={`${styles.monogram} ${box}`} style={{ background: bg, color: ink }} aria-hidden>
      {letter}
    </span>
  );
}

export function BusinessCard({
  flow,
  onPickStyle,
  compactHeader = false,
}: {
  flow: FlowState;
  onPickStyle?: () => void;
  compactHeader?: boolean;
}) {
  const d = flow.draft;
  const look = lookOf(flow);
  const scan = flow.brandScan;
  const mark = markColours(look);
  const kit = d.business_type ? kitFor(d.business_type) : null;
  const direction = flow.quarterPlan ? chosenDirectionOf(flow) : null;
  const plan = currentPlan(flow);
  const model = modelOf(flow);
  const today = Object.values(d.baseline ?? {}).some((v) => v !== undefined && v !== UNKNOWN)
    ? baselineSummary(d.baseline, model, model === "services" ? undefined : d.grow_where)
    : "";
  const lever = d.lever ? leverName(d.lever.primary, model) : "";
  const secondLever = d.lever?.secondary ? leverName(d.lever.secondary, model) : "";
  const target = targetText(d.target);
  const grow = d.business_model !== "services" ? GROW_OPTIONS.find((o) => o.key === d.grow_where)?.label : undefined;
  const budget = budgetLabel(d.budget);
  const { filled, total } = filledCount(flow);
  const links = (["website", ...NETWORKS.map((n) => n.key)] as LinkKey[]).filter((key) => d.links[key] !== undefined);
  const busy = d.seasons?.busy ?? [];
  const slow = d.seasons?.slow ?? [];
  const tried = TRIED_OPTIONS.filter((o) => d.tried?.channels.includes(o.key));
  const competitors = (d.competitors ?? []).filter((c) => c.name.trim());

  return (
    <article aria-label="העסק שלכם" className={styles.card}>
      <div className={styles.cardHead}>
        {compactHeader ? null : (
          <>
            <div className={styles.cardMeta}>
              <span>העסק שלכם</span>
              <b>
                {filled} מתוך {total}
              </b>
            </div>
            <span className={styles.cardProgress} aria-hidden>
              <i style={{ transform: `scaleX(${filled / total})` }} />
            </span>
          </>
        )}
        <div className={styles.cardIdentity}>
          {look.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a remote logo from the scan, any host
            <img
              src={look.logoUrl}
              alt=""
              className={`h-12 w-12 shrink-0 rounded-[14px] bg-[var(--paper)] object-contain p-1 ring-1 ring-[var(--rule)] ${styles.pop}`}
            />
          ) : (
            <Monogram name={d.business_name} bg={mark.bg} ink={mark.ink} />
          )}
          <div className="min-w-0">
            {d.business_name.trim() ? (
              <p className={`${styles.cardName} ${styles.rise}`}>{d.business_name.trim()}</p>
            ) : (
              <p className={`${styles.cardName} text-[color:var(--ink-faint)]`}>שם העסק</p>
            )}
            <p className={styles.cardKind}>{kit ? kit.chip : "עוד לא סיפרתם מה אתם עושים"}</p>
          </div>
        </div>
        <div className={styles.cardLook}>
          {scan?.status === "reading" && !look.palette ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`${styles.swatch} bg-[var(--soft)] ${styles.shimmer}`} />
              ))}
              <span className="ms-1">קוראים את האתר…</span>
            </>
          ) : look.palette ? (
            <>
              {look.palette.slice(0, 5).map((s, i) => (
                <span key={`${s.hex}-${i}`} title={s.name} className={`${styles.swatch} ${styles.pop}`} style={{ background: s.hex }} />
              ))}
              <span className="ms-1">{look.source === "site" ? "הצבעים מהאתר שלכם" : presetFor(d.style_preset)?.name}</span>
            </>
          ) : scan?.status === "failed" ? (
            <span>
              לא הצלחנו לקרוא את האתר.{" "}
              {onPickStyle ? (
                <button type="button" onClick={onPickStyle} className="min-h-6 cursor-pointer font-semibold text-[color:var(--primary)] hover:underline">
                  לבחור סגנון
                </button>
              ) : null}
            </span>
          ) : (
            <span>הצבעים יופיעו כאן</span>
          )}
        </div>
      </div>

      <div className={styles.cardBody}>
        <Section title="העסק">
          <Row label="מה אתם עושים" on={Boolean(d.offerings.trim())}>
            {d.offerings.trim()}
          </Row>
          <Row label="מה מייחד אתכם" on={Boolean(d.differentiator?.trim())}>
            {d.differentiator?.trim()}
          </Row>
        </Section>

        <Section title="הלקוחות">
          <Row label="למי אתם מוכרים" on={d.audiences.length > 0}>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {d.audiences.map((a) => (
                <li key={a.name} className={`${styles.tag} ${styles.pop}`}>
                  {a.name}
                </li>
              ))}
            </ul>
          </Row>
          <Row label="עונות" on={busy.length + slow.length > 0}>
            {busy.length ? (
              <span className="flex items-center gap-2">
                <SeasonDot kind="busy" /> עמוס: {busy.map((m) => MONTHS_HE[m - 1]).join(", ")}
              </span>
            ) : null}
            {slow.length ? (
              <span className="flex items-center gap-2">
                <SeasonDot kind="slow" /> שקט: {slow.map((m) => MONTHS_HE[m - 1]).join(", ")}
              </span>
            ) : null}
          </Row>
        </Section>

        <Section title="איפה אתם">
          <Row label="אתר ורשתות" on={links.length > 0 || Boolean(d.has_none)}>
            {d.has_none ? (
              "עוד לא. מתחילים מכאן."
            ) : (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {links.map((key) => (
                  <li key={key} className={`${styles.tag} max-w-full ${styles.pop}`}>
                    <NetworkIcon network={key} className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)]" />
                    <span dir="ltr" className="min-w-0 break-all">
                      {linkLabel(key, d.links[key] ?? "")}
                    </span>
                    {flow.deferredLinks?.includes(key) ? <span className="shrink-0 text-[color:var(--ink-muted)]">בהמשך</span> : null}
                    {key !== "website" && d.activity?.[key] ? <ActivityDots level={d.activity[key]} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row label="מה ניסיתם" on={tried.length > 0 || Boolean(flow.triedNone) || Boolean(d.tried?.what_worked?.trim())}>
            {flow.triedNone ? (
              "עוד לא ניסיתם. נתחיל בקטן."
            ) : (
              <>
                {tried.length ? <span className="block">{tried.map((t) => t.label).join(" · ")}</span> : null}
                {d.tried?.what_worked?.trim() ? (
                  <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">הצליח: {d.tried.what_worked.trim()}</span>
                ) : null}
              </>
            )}
          </Row>
          <Row label="מתחרים" on={competitors.length > 0}>
            {competitors.map((c) => c.name).join(" · ")}
          </Row>
        </Section>

        <Section title="המספרים">
          {grow ? (
            <Row label="איפה לגדול" on>
              {grow}
            </Row>
          ) : null}
          <Row label="היום" on={Boolean(today)}>
            <BidiText text={today} />
          </Row>
          <Row label="מה מגדילים" on={Boolean(lever)}>
            <span className="block font-semibold">{lever}</span>
            {secondLever ? <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">ועוד: {secondLever}</span> : null}
          </Row>
          <Row label="תקציב שיווק לחודש" on={Boolean(budget)}>
            {budget}
          </Row>
          <Row label="יעד העבודה" on={Boolean(target)} empty="נחשב יחד אחרי התקציב">
            <span className="block font-semibold">
              <BidiText text={target} />
            </span>
            {d.target && d.target.kind !== "qualitative" ? (
              <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">
                {d.target.edited_by_owner ? "היעד שלכם." : "לפי החישוב שלנו."} טווח לתכנון, לא הבטחה.
              </span>
            ) : null}
          </Row>
        </Section>

        <Section title="התוכנית">
          <Row label="הכיוון" on={Boolean(direction)} empty="נבחר יחד בסוף">
            <span className="block font-semibold">{direction?.title}</span>
            <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">{direction?.approach_he}</span>
          </Row>
          <Row label="האסטרטגיה והצעדים הקרובים" on={Boolean(plan)} empty="נבנה יחד אחרי הכיוון">
            <span className="block">{plan?.strategy.one_liner_he}</span>
            {plan ? (
              <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">
                {plan.channels.filter((c) => c.kind === "new").length} ערוצים חדשים ·{" "}
                {plan.budget.organic_only || !plan.budget.monthly_ils ? "בלי תקציב פרסום" : `${formatIls(plan.budget.monthly_ils)} בחודש`}
              </span>
            ) : null}
          </Row>
        </Section>
      </div>
      <p className={styles.cardFoot}>
        <IconLock className="h-3.5 w-3.5 shrink-0" />
        נשמר רק במכשיר הזה, עד שתפתחו חשבון.
      </p>
    </article>
  );
}

function linkLabel(key: LinkKey, value: string): string {
  const v = value.trim();
  if (!v) return key === "website" ? "אתר" : NETWORKS.find((n) => n.key === key)?.label ?? key;
  if (key === "website") return v.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (key === "facebook") return v.replace(/^https?:\/\/(www\.)?/, "");
  if (key === "instagram") return `instagram.com/${normalizeHandle(v)}`;
  return `@${v.replace(/^@/, "")}`;
}

/** Busy months are the sun (the highlight); quiet months the soft blue. */
function SeasonDot({ kind }: { kind: "busy" | "slow" }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${kind === "busy" ? "bg-[var(--sun)]" : "bg-[var(--primary)] opacity-50"}`}
    />
  );
}

function ActivityDots({ level }: { level: "none" | "sometimes" | "regular" }) {
  const n = level === "regular" ? 3 : level === "sometimes" ? 2 : 1;
  const label = level === "regular" ? "באופן קבוע" : level === "sometimes" ? "מדי פעם" : "לא מפרסמים";
  return (
    <span className="inline-flex gap-0.5" title={label} aria-label={label}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n && level !== "none" ? "bg-[var(--primary)]" : "bg-[var(--rule-dark)]"}`} />
      ))}
    </span>
  );
}

/**
 * Phones: the card as one line at the top ("העסק שלכם · 3 מתוך 10"), opening into the
 * full card over the page. Escape, the backdrop and the close button all close it.
 */
export function CardBar({
  flow,
  open,
  onToggle,
  onPickStyle,
}: {
  flow: FlowState;
  open: boolean;
  onToggle: (open: boolean) => void;
  onPickStyle?: () => void;
}) {
  const look = lookOf(flow);
  const { filled, total } = filledCount(flow);
  const panel = useRef<HTMLDivElement>(null);
  const mark = markColours(look);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="business-card-panel"
        onClick={() => onToggle(!open)}
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl bg-[var(--soft)] py-1.5 pe-3 ps-1.5 text-start transition-colors active:bg-[var(--rule)]"
      >
        <Monogram name={flow.draft.business_name} bg={mark.bg} ink={mark.ink} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--ink)]">
          העסק שלכם
          <span key={filled} className={`inline-block font-normal tabular-nums text-[color:var(--ink-muted)] ${styles.pop}`}>
            {" "}· {filled} מתוך {total}
          </span>
        </span>
        <span className="relative h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-[var(--rule-dark)]" aria-hidden>
          <span
            className="absolute inset-0 origin-right rounded-full bg-[var(--primary)] transition-transform duration-500"
            style={{ transform: `scaleX(${filled / total})` }}
          />
        </span>
        <IconChevron className={`h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
      </button>
      {open ? (
        <div className="fixed inset-0 top-14 z-50 lg:hidden">
          <button
            type="button"
            aria-label="לסגור את הכרטיס"
            onClick={() => onToggle(false)}
            className={`absolute inset-0 cursor-default bg-[var(--ink)]/30 ${styles.backdrop}`}
          />
          <div
            id="business-card-panel"
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="העסק שלכם"
            className={`relative mx-3 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-[18px] outline-none ${styles.drop}`}
          >
            <BusinessCard flow={flow} onPickStyle={onPickStyle} />
            <div className="sticky bottom-0 flex justify-center bg-gradient-to-t from-[var(--paper)] via-[var(--paper)]/90 to-transparent pb-3 pt-4">
              <button
                type="button"
                onClick={() => onToggle(false)}
                className="min-h-11 cursor-pointer rounded-xl border border-[var(--rule-dark)] bg-[var(--paper)] px-6 text-sm font-semibold text-[color:var(--ink)] shadow-[var(--shadow-card)]"
              >
                לסגור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
