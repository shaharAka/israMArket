"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useState } from "react";
import { Button } from "@/components/AppShell";
import { ActivityPicker, TriedPicker } from "@/components/start/AnswerPickers";
import { SeasonsPicker, type Seasons } from "@/components/start/SeasonsPicker";
import { Chip, QuietLink, TextInput } from "@/components/start/ui";
import { endpoints, type Business, type BusinessModel, type OwnerContext, type OwnerContextUpdate, type PrimaryGoal } from "@/lib/api";
import { goalsFor } from "@/lib/businessModel";
import {
  ACTIVITY_OPTIONS,
  NETWORKS,
  TRIED_OPTIONS,
  kitFor,
  monthsLabel,
  seasonsExampleFor,
  type Activity,
  type Network,
  type TriedChannel,
} from "@/lib/draft";
import { IconCheck, IconChevron } from "@/lib/icons";
import { toast } from "@/lib/ui";

const MAX_COMPETITORS = 3;

/** The row ids inside "מה סיפרתם לנו", also usable as hashes (`/decisions#seasons`). */
export const ANSWER_IDS = ["seasons", "different", "tried", "activity", "competitors", "goal"] as const;
type AnswerId = (typeof ANSWER_IDS)[number];

type CompetitorRow = { name: string; link: string };

function contextOf(business: Business): OwnerContext {
  return business.owner_context ?? {};
}

/** The competitors the owner named: from /start when they went through it, else the profile's list. */
function competitorsOf(business: Business): CompetitorRow[] {
  const context = business.owner_context;
  if (context && Array.isArray(context.competitors)) {
    return context.competitors.map((item) => ({ name: item.name, link: item.link ?? "" }));
  }
  return (business.competitors ?? []).map((item) => ({ name: item.name, link: item.website_url ?? "" }));
}

/** The editor starts with at least one empty row to type into. */
function competitorRows(business: Business): CompetitorRow[] {
  const rows = competitorsOf(business);
  return rows.length ? rows : [{ name: "", link: "" }];
}

function seasonsOf(context: OwnerContext): Seasons {
  return { busy: [...(context.seasons?.busy ?? [])], slow: [...(context.seasons?.slow ?? [])] };
}

function triedOf(context: OwnerContext): { channels: TriedChannel[]; what_worked: string } {
  return { channels: [...(context.tried?.channels ?? [])], what_worked: context.tried?.what_worked ?? "" };
}

const NOT_SET = "לא סומן";

/**
 * "מה סיפרתם לנו" — the /start answers that had no screen of their own after signup:
 * seasons, what makes the business different, what they tried, how active they are per
 * network, competitors, and the goal. One line each; a line opens its editor in place,
 * with the same control /start used, and saves on its own (PUT /onboarding/owner-context).
 *
 * The goal is the exception: it is part of the profile, so it goes through the page's
 * save bar like the business model does.
 */
export function OwnerAnswers({
  business,
  businessModel,
  primaryGoal,
  onGoal,
  onSaved,
  initialOpen,
}: {
  business: Business;
  businessModel: BusinessModel;
  primaryGoal: PrimaryGoal;
  onGoal: (goal: PrimaryGoal) => void;
  onSaved: (business: Business) => void;
  initialOpen?: string | null;
}) {
  const t = useCopy();
  const [open, setOpen] = useState<AnswerId | null>(
    initialOpen && (ANSWER_IDS as readonly string[]).includes(initialOpen) ? (initialOpen as AnswerId) : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const context = contextOf(business);
  const [seasons, setSeasons] = useState<Seasons>(() => seasonsOf(context));
  const [different, setDifferent] = useState(() => context.differentiator ?? "");
  const [tried, setTried] = useState(() => triedOf(context));
  const [activity, setActivity] = useState<Partial<Record<Network, Activity>>>(() => ({ ...(context.activity ?? {}) }));
  const [competitors, setCompetitors] = useState<CompetitorRow[]>(() => competitorRows(business));

  /** Opening a row starts its editor from what is saved now; one row open at a time. */
  function toggle(id: AnswerId) {
    setError("");
    if (open === id) {
      setOpen(null);
      return;
    }
    const current = contextOf(business);
    setSeasons(seasonsOf(current));
    setDifferent(current.differentiator ?? "");
    setTried(triedOf(current));
    setActivity({ ...(current.activity ?? {}) });
    setCompetitors(competitorRows(business));
    setOpen(id);
  }

  async function save(update: OwnerContextUpdate) {
    setSaving(true);
    setError("");
    try {
      const result = await endpoints.saveOwnerContext(update);
      // A fresh object: the demo answers with the same fixture it was handed.
      onSaved({ ...result.business });
      setOpen(null);
      toast(t("נשמר"));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("לא הצלחנו לשמור. נסו שוב."));
    } finally {
      setSaving(false);
    }
  }

  const busy = context.seasons?.busy ?? [];
  const slow = context.seasons?.slow ?? [];
  const seasonsSummary =
    busy.length || slow.length
      ? [busy.length ? t("עמוס: {arg_0}", { arg_0: monthsLabel(busy) }) : "", slow.length ? t("שקט: {arg_0}", { arg_0: monthsLabel(slow) }) : ""]
          .filter(Boolean)
          .join(" · ")
      : NOT_SET;
  const triedSummary = (context.tried?.channels ?? []).length
    ? TRIED_OPTIONS.filter((o) => context.tried?.channels.includes(o.key)).map((o) => o.label).join(", ")
    : NOT_SET;
  const activitySummary =
    NETWORKS.filter((n) => context.activity?.[n.key])
      .map((n) => `${n.label}: ${ACTIVITY_OPTIONS.find((o) => o.key === context.activity?.[n.key])?.label ?? ""}`)
      .join(" · ") || NOT_SET;
  const competitorNames = competitorsOf(business).map((c) => c.name).filter(Boolean);
  const goals = goalsFor(businessModel);
  const goalTitle = goals.find((g) => g.key === primaryGoal)?.title ?? t("לא נבחרה");
  const kit = kitFor(business.business_type);

  const actions = (onSave: () => void) => (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={onSave} disabled={saving}>
        {saving ? t("שומרים…") : t("לשמור")}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(null)}
        disabled={saving}
        className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-[var(--ink-muted)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline disabled:opacity-40"
      >
        <Copy text="לבטל" /></button>
      {error ? (
        <p role="alert" className="w-full text-[13px] font-semibold leading-6 text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <ul className="divide-y divide-[var(--rule)] overflow-hidden rounded-2xl bg-[var(--paper)] shadow-[var(--shadow-card)]">
      <AnswerRow id="seasons" label={t("עונות השנה")} value={seasonsSummary} open={open === "seasons"} onToggle={() => toggle("seasons")}>
        <SeasonsPicker value={seasons} onChange={setSeasons} example={seasonsExampleFor(business.business_type)} />
        {actions(() => void save({ seasons }))}
      </AnswerRow>

      <AnswerRow
        id="different"
        label={t("מה מייחד אתכם")}
        value={context.differentiator || t("לא נכתב")}
        open={open === "different"}
        onToggle={() => toggle("different")}
      >
        <TextInput id="answer-different" label={t("במשפט אחד")} value={different} onChange={setDifferent} maxLength={200} />
        <div className="mt-2 flex flex-wrap gap-2">
          {kit.differentiators.map((example) => {
            const parts = different.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
            const on = parts.includes(example);
            return (
              <Chip
                key={example}
                label={example}
                selected={on}
                onClick={() => setDifferent((on ? parts.filter((p) => p !== example) : [...parts, example]).join(", "))}
                className="px-3.5"
              />
            );
          })}
        </div>
        {actions(() => void save({ differentiator: different }))}
      </AnswerRow>

      <AnswerRow id="tried" label={t("מה ניסיתם")} value={triedSummary} open={open === "tried"} onToggle={() => toggle("tried")}>
        <TriedPicker
          channels={tried.channels}
          onToggle={(key) =>
            setTried((t) => ({
              ...t,
              channels: t.channels.includes(key) ? t.channels.filter((c) => c !== key) : [...t.channels, key],
            }))
          }
        />
        <div className="mt-3">
          <TextInput
            id="answer-worked"
            label={t("מה הצליח? (לא חובה)")}
            value={tried.what_worked}
            onChange={(value) => setTried((t) => ({ ...t, what_worked: value }))}
            maxLength={200}
          />
        </div>
        {actions(() => void save({ tried }))}
      </AnswerRow>

      <AnswerRow id="activity" label={t("איפה אתם פעילים")} value={activitySummary} open={open === "activity"} onToggle={() => toggle("activity")}>
        <div className="space-y-3">
          {NETWORKS.map((network) => (
            <div key={network.key}>
              <p className="mb-1.5 text-[13px] font-semibold text-[var(--ink)]">{network.label}</p>
              <ActivityPicker
                label={t("כמה אתם מפרסמים ב{arg_0}", { arg_0: network.label })}
                value={activity[network.key]}
                onChange={(value) => setActivity((a) => ({ ...a, [network.key]: value }))}
                clearable
              />
            </div>
          ))}
        </div>
        {actions(() =>
          void save({
            activity: {
              instagram: activity.instagram ?? null,
              facebook: activity.facebook ?? null,
              tiktok: activity.tiktok ?? null,
            },
          }),
        )}
      </AnswerRow>

      <AnswerRow
        id="competitors"
        label={t("המתחרים")}
        value={competitorNames.length ? competitorNames.join(", ") : t("לא נכתבו")}
        open={open === "competitors"}
        onToggle={() => toggle("competitors")}
      >
        <div className="space-y-3">
          {competitors.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_1.1fr] items-end gap-2">
              <TextInput
                id={`answer-comp-name-${index}`}
                label={t("מתחרה {arg_0}", { arg_0: index + 1 })}
                value={row.name}
                onChange={(value) => setCompetitors((list) => list.map((r, i) => (i === index ? { ...r, name: value } : r)))}
                placeholder={t("השם")}
                maxLength={80}
              />
              <TextInput
                id={`answer-comp-link-${index}`}
                label={t("אתר או אינסטגרם")}
                value={row.link}
                onChange={(value) => setCompetitors((list) => list.map((r, i) => (i === index ? { ...r, link: value } : r)))}
                placeholder="@name"
                dir="ltr"
                inputMode="url"
                maxLength={200}
              />
            </div>
          ))}
        </div>
        {competitors.length < MAX_COMPETITORS ? (
          <QuietLink onClick={() => setCompetitors((list) => [...list, { name: "", link: "" }])}><Copy text="להוסיף עוד מתחרה" /></QuietLink>
        ) : null}
        <p className="text-[13px] text-[var(--ink-muted)]"><Copy text="כדי להסיר מתחרה, מחקו את השם." /></p>
        {actions(() =>
          void save({
            competitors: competitors
              .filter((row) => row.name.trim())
              .map((row) => ({ name: row.name.trim(), link: row.link.trim() })),
          }),
        )}
      </AnswerRow>

      <AnswerRow id="goal" label={t("מה הכי חשוב")} value={goalTitle} open={open === "goal"} onToggle={() => toggle("goal")}>
        <div role="radiogroup" aria-label={t("מה הכי חשוב")} className="grid gap-3 sm:grid-cols-2">
          {goals.map((option) => {
            const on = primaryGoal === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onGoal(option.key)}
                className={`relative rounded-xl p-4 text-right transition-[background-color,box-shadow] duration-150 ${
                  on
                    ? "bg-[var(--primary-soft)] ring-[1.5px] ring-inset ring-[var(--primary)]"
                    : "bg-[var(--paper)] ring-1 ring-inset ring-[var(--rule-dark)] hover:ring-[var(--ink-muted)]"
                }`}
              >
                <span className="block pl-6 text-sm font-semibold text-[var(--ink)]">{option.title}</span>
                <span className="mt-1 block text-[13px] leading-5 text-[var(--ink-soft)]">{option.desc}</span>
                {on ? <IconCheck className="absolute top-4 left-4 h-4 w-4 text-[var(--primary)]" /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-[var(--ink-muted)]"><Copy text="נשמר עם ״לשמור את ההחלטות״ למטה." /></p>
      </AnswerRow>
    </ul>
  );
}

function AnswerRow({
  id,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: AnswerId;
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useCopy();
  return (
    <li id={id} className="scroll-mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-answer`}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-right transition-colors duration-150 hover:bg-[var(--soft)] sm:px-5"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
          <span className="shrink-0 text-sm font-semibold text-[var(--ink)] sm:w-32">{label}</span>
          <span className={`min-w-0 truncate text-sm ${value === NOT_SET ? "text-[var(--ink-muted)]" : "text-[var(--ink-soft)]"}`}>{value}</span>
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold ${open ? "text-[var(--ink-muted)]" : "text-[var(--primary)]"}`}>
          {open ? t("לסגור") : t("לשנות")}
          <IconChevron className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`} />
        </span>
      </button>
      <div id={`${id}-answer`} hidden={!open} className="space-y-3 border-t border-[var(--rule)] px-4 pb-5 pt-4 sm:px-5">
        {children}
      </div>
    </li>
  );
}
