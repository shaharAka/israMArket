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
  presetFor,
  type FlowState,
  type LinkKey,
} from "@/lib/draft";
import { GROW_OPTIONS, budgetLabel, formatIls } from "@/lib/quarterPlan";
import { NetworkIcon, inkOn } from "./ui";
import styles from "./start.module.css";

/**
 * "העסק שלכם": the business card we fill in together, one answer at a time.
 *
 * It is the portal the owner is building, so every answer lands here visibly: a slot
 * that was just answered rises in on a warm wash, and a slot not answered yet stays soft
 * ("עוד לא סיפרתם") instead of disappearing. Desktop shows it as a sticky side panel;
 * phones get `CardBar`, a compact summary that opens into this card.
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
    { key: "success", filled: Boolean(d.success?.kpi) },
    { key: "budget", filled: Boolean(d.budget?.range) },
    { key: "direction", filled: Boolean(flow.quarterPlan && chosenDirectionOf(flow)) },
    { key: "plan", filled: Boolean(currentPlan(flow)) },
  ];
}

export function filledCount(flow: FlowState): { filled: number; total: number } {
  const slots = cardSlots(flow);
  return { filled: slots.filter((s) => s.filled).length, total: slots.length };
}

function Empty({ children = "עוד לא סיפרתם" }: { children?: React.ReactNode }) {
  return <span className="text-sm text-[#a3a59c]">{children}</span>;
}

/** Animates only a slot that fills while the card is on screen, not every slot on open. */
function Filled({ on, children, empty }: { on: boolean; children: React.ReactNode; empty?: React.ReactNode }) {
  const [filledAtMount] = useState(on);
  return on ? (
    <div key="filled" className={`-mx-1 px-1 ${filledAtMount ? "" : styles.fill}`}>
      {children}
    </div>
  ) : (
    <div key="empty">{empty ?? <Empty />}</div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <p className="mb-0.5 text-[11px] font-bold tracking-wide text-[#8a8c84]">{label}</p>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 pt-3">
      <h3 className="border-b border-[#ecebe5] pb-1.5 text-xs font-black text-[#191b18]">{title}</h3>
      <div className="divide-y divide-[#f1f0ea]">{children}</div>
    </section>
  );
}

function Monogram({ name, bg, ink, size = "lg" }: { name: string; bg: string; ink: string; size?: "sm" | "lg" }) {
  const letter = name.trim().charAt(0) || "·";
  const box = size === "sm" ? "h-7 w-7 text-sm" : "h-12 w-12 text-xl";
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full border border-black/10 font-black`}
      style={{ background: bg, color: ink }}
      aria-hidden
    >
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
  const band = look.palette ? swatch(look.palette, "primary", "#ecebe5") : "#ecebe5";
  const bandInk = look.palette ? inkOn(band) : "#191b18";
  const markBg = look.palette ? swatch(look.palette, "background", "#ffffff") : "#ffffff";
  const markInk = look.palette ? swatch(look.palette, "primary", "#191b18") : "#191b18";
  const kit = d.business_type ? kitFor(d.business_type) : null;
  const direction = flow.quarterPlan ? chosenDirectionOf(flow) : null;
  const plan = currentPlan(flow);
  const kpi = flow.successOptions?.find((o) => o.key === d.success?.kpi)?.name_he ?? (d.success?.kpi ? plan?.kpi.name_he : undefined);
  const grow = d.business_model !== "services" ? GROW_OPTIONS.find((o) => o.key === d.grow_where)?.label : undefined;
  const budget = budgetLabel(d.budget);
  const { filled, total } = filledCount(flow);
  const links = (["website", ...NETWORKS.map((n) => n.key)] as LinkKey[]).filter((key) => d.links[key] !== undefined);
  const busy = d.seasons?.busy ?? [];
  const slow = d.seasons?.slow ?? [];
  const tried = TRIED_OPTIONS.filter((o) => d.tried?.channels.includes(o.key));
  const competitors = (d.competitors ?? []).filter((c) => c.name.trim());

  return (
    <article aria-label="העסק שלכם" className="overflow-hidden rounded-2xl border border-[#e2e0d8] bg-white shadow-[0_1px_0_rgba(0,0,0,0.03),0_12px_32px_-18px_rgba(25,27,24,0.35)]">
      {/* The band paints in the business's colours as soon as we have them. */}
      <div
        className="relative px-5 pb-4 pt-4 transition-colors duration-700"
        style={{ background: band, color: bandInk }}
      >
        {compactHeader ? null : (
          <div className="mb-3 flex items-center justify-between text-[11px] font-bold opacity-80">
            <span>העסק שלכם</span>
            <span>
              {filled} מתוך {total}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          {look.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a remote logo from the scan, any host
            <img
              src={look.logoUrl}
              alt=""
              className={`h-12 w-12 shrink-0 rounded-full border border-black/10 bg-white object-contain p-1 ${styles.pop}`}
            />
          ) : (
            <Monogram name={d.business_name} bg={markBg} ink={markInk} />
          )}
          <div className="min-w-0">
            {d.business_name.trim() ? (
              <p className={`truncate text-xl font-black leading-tight ${styles.rise}`}>
                {d.business_name.trim()}
              </p>
            ) : (
              <p className="text-xl font-black leading-tight opacity-40">שם העסק</p>
            )}
            <p className="mt-0.5 truncate text-xs opacity-80">{kit ? kit.chip : "עוד לא סיפרתם מה אתם עושים"}</p>
          </div>
        </div>
        <div className="mt-3 flex min-h-6 items-center gap-1.5">
          {scan?.status === "reading" && !look.palette ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-5 w-5 rounded-full border border-black/10 bg-white/60 ${styles.shimmer}`} />
              ))}
              <span className="mr-1 text-xs opacity-80">קוראים את האתר…</span>
            </>
          ) : look.palette ? (
            <>
              {look.palette.slice(0, 5).map((s, i) => (
                <span
                  key={`${s.hex}-${i}`}
                  title={s.name}
                  className={`h-5 w-5 rounded-full border border-black/15 ${styles.pop}`}
                  style={{ background: s.hex }}
                />
              ))}
              <span className="mr-1 text-xs opacity-80">
                {look.source === "site" ? "הצבעים מהאתר שלכם" : presetFor(d.style_preset)?.name}
              </span>
            </>
          ) : scan?.status === "failed" ? (
            <span className="text-xs opacity-80">
              לא הצלחנו לקרוא את האתר.{" "}
              {onPickStyle ? (
                <button type="button" onClick={onPickStyle} className="cursor-pointer font-bold underline underline-offset-2">
                  לבחור סגנון
                </button>
              ) : null}
            </span>
          ) : (
            <span className="text-xs opacity-60">הצבעים יופיעו כאן</span>
          )}
        </div>
      </div>

      <div className="pb-4">
        <Section title="העסק">
          <Row label="מה אתם עושים">
            <Filled on={Boolean(d.offerings.trim())}>
              <p className="text-sm leading-6 text-[#191b18]">{d.offerings.trim()}</p>
            </Filled>
          </Row>
          <Row label="מה מייחד אתכם">
            <Filled on={Boolean(d.differentiator?.trim())}>
              <p className="text-sm leading-6 text-[#191b18]">{d.differentiator?.trim()}</p>
            </Filled>
          </Row>
        </Section>

        <Section title="הלקוחות">
          <Row label="למי אתם מוכרים">
            <Filled on={d.audiences.length > 0}>
              <ul className="flex flex-wrap gap-1.5">
                {d.audiences.map((a) => (
                  <li key={a.name} className={`rounded-full bg-[#f1efe8] px-2.5 py-1 text-xs font-bold text-[#191b18] ${styles.pop}`}>
                    {a.name}
                  </li>
                ))}
              </ul>
            </Filled>
          </Row>
          <Row label="עונות">
            <Filled on={busy.length + slow.length > 0}>
              <p className="text-sm leading-6 text-[#191b18]">
                {busy.length ? (
                  <span>
                    <SeasonDot kind="busy" /> עמוס: {busy.map((m) => MONTHS_HE[m - 1]).join(", ")}
                  </span>
                ) : null}
                {busy.length && slow.length ? <br /> : null}
                {slow.length ? (
                  <span>
                    <SeasonDot kind="slow" /> שקט: {slow.map((m) => MONTHS_HE[m - 1]).join(", ")}
                  </span>
                ) : null}
              </p>
            </Filled>
          </Row>
        </Section>

        <Section title="איפה אתם">
          <Row label="אתר ורשתות">
            <Filled on={links.length > 0 || Boolean(d.has_none)}>
              {d.has_none ? (
                <p className="text-sm text-[#191b18]">עוד לא. מתחילים מכאן.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {links.map((key) => (
                    <li
                      key={key}
                      className={`inline-flex items-center gap-1.5 rounded-full border border-[#e2e0d8] px-2.5 py-1 text-xs text-[#191b18] ${styles.pop}`}
                    >
                      <NetworkIcon network={key} className="h-3.5 w-3.5" />
                      <span dir="ltr" className="max-w-[9rem] truncate">
                        {linkLabel(key, d.links[key] ?? "")}
                      </span>
                      {key !== "website" && d.activity?.[key] ? <ActivityDots level={d.activity[key]} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Filled>
          </Row>
          <Row label="מה ניסיתם">
            <Filled on={tried.length > 0 || Boolean(flow.triedNone) || Boolean(d.tried?.what_worked?.trim())}>
              {flow.triedNone ? (
                <p className="text-sm text-[#191b18]">עוד לא ניסיתם. נתחיל בקטן.</p>
              ) : (
                <div className="space-y-1">
                  {tried.length ? <p className="text-sm text-[#191b18]">{tried.map((t) => t.label).join(" · ")}</p> : null}
                  {d.tried?.what_worked?.trim() ? (
                    <p className="text-xs leading-5 text-[#5e6159]">הצליח: {d.tried.what_worked.trim()}</p>
                  ) : null}
                </div>
              )}
            </Filled>
          </Row>
          <Row label="מתחרים">
            <Filled on={competitors.length > 0}>
              <p className="text-sm text-[#191b18]">{competitors.map((c) => c.name).join(" · ")}</p>
            </Filled>
          </Row>
        </Section>

        <Section title="המטרה והתקציב">
          {grow ? (
            <Row label="איפה לגדול">
              <Filled on>
                <p className="text-sm text-[#191b18]">{grow}</p>
              </Filled>
            </Row>
          ) : null}
          <Row label="מה ייחשב הצלחה">
            <Filled on={Boolean(kpi)}>
              <p className="text-sm font-bold text-[#191b18]">{kpi}</p>
              {d.success?.target ? <p className="text-xs leading-5 text-[#5e6159]">היעד: {d.success.target}</p> : null}
            </Filled>
          </Row>
          <Row label="תקציב שיווק לחודש">
            <Filled on={Boolean(budget)}>
              <p className="text-sm text-[#191b18]">{budget}</p>
            </Filled>
          </Row>
        </Section>

        <Section title="התוכנית">
          <Row label="הכיוון">
            <Filled on={Boolean(direction)} empty={<Empty>נבחר יחד בסוף</Empty>}>
              <p className="text-sm font-black text-[#191b18]">{direction?.title}</p>
              <p className="text-xs leading-5 text-[#5e6159]">{direction?.approach_he}</p>
            </Filled>
          </Row>
          <Row label="3 החודשים הקרובים">
            <Filled on={Boolean(plan)} empty={<Empty>נבנה יחד אחרי הכיוון</Empty>}>
              <p className="text-sm leading-6 text-[#191b18]">{plan?.strategy.one_liner_he}</p>
              {plan ? (
                <p className="text-xs leading-5 text-[#5e6159]">
                  {plan.channels.filter((c) => c.kind === "new").length} ערוצים חדשים ·{" "}
                  {plan.budget.organic_only || !plan.budget.monthly_ils ? "בלי תקציב פרסום" : `${formatIls(plan.budget.monthly_ils)} בחודש`}
                </p>
              ) : null}
            </Filled>
          </Row>
        </Section>
      </div>
      <p className="border-t border-[#ecebe5] bg-[#faf9f6] px-5 py-2.5 text-[11px] text-[#8a8c84]">
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
  return `@${v.replace(/^@/, "")}`;
}

function SeasonDot({ kind }: { kind: "busy" | "slow" }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: kind === "busy" ? "#d9824b" : "#7da2b8" }}
    />
  );
}

function ActivityDots({ level }: { level: "none" | "sometimes" | "regular" }) {
  const n = level === "regular" ? 3 : level === "sometimes" ? 2 : 1;
  const label = level === "regular" ? "באופן קבוע" : level === "sometimes" ? "מדי פעם" : "לא מפרסמים";
  return (
    <span className="inline-flex gap-0.5" title={label} aria-label={label}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n && level !== "none" ? "bg-[#191b18]" : "bg-[#d8d6ce]"}`} />
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
  const bg = look.palette ? swatch(look.palette, "primary", "#ffffff") : "#ffffff";
  const ink = look.palette ? inkOn(bg) : "#191b18";

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
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full border border-[#e2e0d8] bg-white py-1 pl-3 pr-1 text-right"
      >
        <Monogram name={flow.draft.business_name} bg={bg} ink={ink} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#191b18]">
          העסק שלכם
          <span key={filled} className={`inline-block font-normal text-[#6b6e65] ${styles.pop}`}>
            {"\u00a0"}· {filled} מתוך {total}
          </span>
        </span>
        <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[#e2e0d8]" aria-hidden>
          <span
            className="block h-full rounded-full bg-[#191b18] transition-[width] duration-500"
            style={{ width: `${(filled / total) * 100}%` }}
          />
        </span>
        <svg
          viewBox="0 0 16 16"
          className={`h-4 w-4 shrink-0 text-[#5e6159] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="fixed inset-0 top-14 z-50 lg:hidden">
          <button
            type="button"
            aria-label="לסגור את הכרטיס"
            onClick={() => onToggle(false)}
            className={`absolute inset-0 cursor-default bg-[#191b18]/30 ${styles.backdrop}`}
          />
          <div
            id="business-card-panel"
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="העסק שלכם"
            className={`relative mx-3 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl outline-none ${styles.drop}`}
          >
            <BusinessCard flow={flow} onPickStyle={onPickStyle} />
            <div className="sticky bottom-0 flex justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-2 pt-3">
              <button
                type="button"
                onClick={() => onToggle(false)}
                className="min-h-11 cursor-pointer rounded-full border border-[#c7c4b8] bg-white px-5 text-sm font-bold text-[#191b18]"
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
