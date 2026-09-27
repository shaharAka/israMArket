"use client";

import { useEffect, useState } from "react";
import { BUSINESS_TYPES } from "@/components/onboarding/constants";
import type { BusinessModel } from "@/lib/api";
import { BUSINESS_MODEL_OPTIONS, defaultGoalFor, goalsFor, isGoalValidFor } from "@/lib/businessModel";
import {
  ACTIVITY_OPTIONS,
  MONTHS_HE,
  MONTH_HINTS,
  NETWORKS,
  TRIED_OPTIONS,
  draftForApi,
  inferBusinessModel,
  kitFor,
  loadStylePresets,
  looksLikeUrl,
  signature,
  stylePresets,
  suggestAudiences,
  validateLinks,
  type LinkErrors,
  type Activity,
  type FlowState,
  type LinkKey,
  type OnboardingDraft,
  type TriedChannel,
} from "@/lib/draft";
import { Chip, IconButton, NetworkIcon, QuietLink, StepShell, TextInput } from "./ui";
import styles from "./start.module.css";

/** What every screen gets from the flow. */
export type StepProps = {
  flow: FlowState;
  update: (fn: (flow: FlowState) => FlowState) => void;
  setDraft: (patch: Partial<OnboardingDraft>) => void;
  /** Mark this screen answered and move on. */
  next: () => void;
  reflection: string | null;
  notice?: React.ReactNode;
  focus: boolean;
  direction: "fwd" | "back";
};

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-bold text-[#9f4330]">
      {message}
    </p>
  );
}

/* --------------------------------- העסק --------------------------------- */

export function StepName(props: StepProps) {
  const { flow, setDraft, next } = props;
  const [error, setError] = useState("");
  return (
    <StepShell
      {...props}
      title="איך קוראים לעסק?"
      why="זו פגישת היכרות קצרה. נשאל, נקשיב, ונבנה יחד תוכנית שיווק."
      primary="להמשיך לתחום של העסק"
      onPrimary={() => {
        if (flow.draft.business_name.trim().length < 2) {
          setError("כתבו את שם העסק, לפחות 2 אותיות.");
          return;
        }
        next();
      }}
    >
      <TextInput
        id="business-name"
        label="שם העסק"
        value={flow.draft.business_name}
        onChange={(value) => {
          setError("");
          setDraft({ business_name: value });
        }}
        placeholder="למשל: מאפיית השכונה"
        autoComplete="organization"
        maxLength={80}
      />
      <FieldError message={error} />
    </StepShell>
  );
}

export function StepWhat(props: StepProps) {
  const { flow, update, setDraft, next } = props;
  const [error, setError] = useState("");
  const d = flow.draft;
  const kit = kitFor(d.business_type);
  return (
    <StepShell
      {...props}
      title="מה אתם עושים?"
      why="ככה נדע מה לחקור ועל מה לדבר."
      primary="להמשיך למה שמייחד אתכם"
      onPrimary={() => {
        if (!d.business_type) {
          setError("בחרו את התחום הכי קרוב. אם אין, בחרו ״משהו אחר״.");
          return;
        }
        if (d.offerings.trim().length < 3) {
          setError("כתבו במשפט קצר מה אתם מוכרים או עושים.");
          return;
        }
        // Inferred here, confirmed with one tap at the goal step.
        update((f) =>
          f.modelConfirmed
            ? f
            : { ...f, draft: { ...f.draft, business_model: inferBusinessModel(f.draft.business_type, f.draft.offerings) } },
        );
        next();
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-[#191b18]">התחום</legend>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((type) => (
            <Chip
              key={type}
              label={kitFor(type).chip}
              selected={d.business_type === type}
              onClick={() => {
                setError("");
                setDraft({ business_type: type });
              }}
              className="px-3.5"
            />
          ))}
        </div>
      </fieldset>
      <TextInput
        id="offerings"
        label="במילים שלכם: מה אתם מוכרים או עושים?"
        value={d.offerings}
        onChange={(value) => {
          setError("");
          setDraft({ offerings: value });
        }}
        placeholder={kit.placeholder}
        maxLength={300}
      />
      <FieldError message={error} />
    </StepShell>
  );
}

export function StepDifferent(props: StepProps) {
  const { flow, setDraft, next } = props;
  const d = flow.draft;
  const kit = kitFor(d.business_type);
  const text = d.differentiator ?? "";
  function toggleExample(example: string) {
    const parts = text
      .split(/,\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const next = parts.includes(example) ? parts.filter((p) => p !== example) : [...parts, example];
    setDraft({ differentiator: next.join(", ") });
  }
  return (
    <StepShell
      {...props}
      title="מה מבדיל אתכם מאחרים?"
      why="זה מה שנשים בחזית. לקוחות צריכים סיבה לבחור דווקא בכם."
      primary="להמשיך ללקוחות"
      onPrimary={next}
      skip="לא בטוחים? לדלג, ונמצא את זה יחד"
      onSkip={() => {
        setDraft({ differentiator: "" });
        next();
      }}
    >
      <TextInput
        id="differentiator"
        label="במשפט אחד"
        value={text}
        onChange={(value) => setDraft({ differentiator: value })}
        placeholder="למשל: הכול נעשה אצלנו, בעבודת יד"
        maxLength={200}
      />
      <div>
        <p className="mb-2 text-xs text-[#5e6159]">אפשר להתחיל מאחד מאלה:</p>
        <div className="flex flex-wrap gap-2">
          {kit.differentiators.map((example) => (
            <Chip
              key={example}
              label={example}
              selected={text.split(/,\s*/).includes(example)}
              onClick={() => toggleExample(example)}
              className="px-3.5"
            />
          ))}
        </div>
      </div>
    </StepShell>
  );
}

/* -------------------------------- הלקוחות -------------------------------- */

const MAX_AUDIENCES = 3;

export function StepAudiences(props: StepProps) {
  const { flow, update, setDraft, next } = props;
  const d = flow.draft;
  const suggestions = flow.suggestions ?? null;
  const want = signature([d.business_name, d.business_type, d.offerings, d.differentiator ?? ""]);
  const loading = flow.suggestionsFor !== want && !flow.suggestionsFailed;
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    if (flow.suggestionsFor === want) return;
    let live = true;
    suggestAudiences(draftForApi(flow))
      .then((list) => {
        if (!live) return;
        const top = list.slice(0, MAX_AUDIENCES);
        update((f) => ({
          ...f,
          suggestions: top,
          suggestionsFor: want,
          suggestionsFailed: false,
          // First time here: keep all three. After that, the owner's choice stands.
          draft: f.draft.audiences.length || f.seen.includes("audiences")
            ? f.draft
            : { ...f.draft, audiences: top.map((a) => ({ name: a.name, description: a.description })) },
        }));
      })
      .catch(() => {
        if (!live) return;
        update((f) => ({ ...f, suggestionsFor: want, suggestionsFailed: true, suggestions: null }));
      });
    return () => {
      live = false;
    };
    // Fetch once per set of answers; `flow` is read for the payload only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  const kept = d.audiences;
  const whyFor = (name: string) => suggestions?.find((s) => s.name === name)?.why_he;
  const removed = (suggestions ?? []).filter((s) => !kept.some((k) => k.name === s.name));
  const full = kept.length >= MAX_AUDIENCES;
  const showAdd = adding || (flow.suggestionsFailed && kept.length === 0);

  function saveNew() {
    const name = newName.trim();
    if (!name || full) return;
    setDraft({ audiences: [...kept, { name, description: newDesc.trim() }] });
    setNewName("");
    setNewDesc("");
    setAdding(false);
  }

  return (
    <StepShell
      {...props}
      title="מי קונה מכם?"
      why="ככה נדע למי לכתוב. הצענו 3 קהלים לפי מה שסיפרתם, ואפשר לשנות."
      primary="להמשיך לעונות השנה"
      onPrimary={() => {
        if (newName.trim()) saveNew();
        next();
      }}
      skip="לא בטוחים? לדלג"
      onSkip={() => next()}
    >
      {loading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-[#5e6159]">מחפשים את הלקוחות שלכם…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-[68px] rounded-xl border border-[#e6e4dc] bg-white ${styles.shimmer}`} />
          ))}
        </div>
      ) : (
        <>
          {flow.suggestionsFailed ? (
            <p className="text-sm text-[#5e6159]">לא הצלחנו להציע קהלים כרגע. כתבו בעצמכם למי אתם מוכרים.</p>
          ) : null}
          {kept.length ? (
            <ul className={`divide-y divide-[#ecebe5] rounded-xl border border-[#e2e0d8] bg-white ${styles.stagger}`}>
              {kept.map((audience, index) =>
                editing === index ? (
                  <li key={`edit-${index}`} className="space-y-2 p-3">
                    <TextInput
                      id={`aud-name-${index}`}
                      label="שם הקהל"
                      value={audience.name}
                      onChange={(value) =>
                        setDraft({ audiences: kept.map((a, i) => (i === index ? { ...a, name: value } : a)) })
                      }
                      maxLength={60}
                    />
                    <TextInput
                      id={`aud-desc-${index}`}
                      label="במשפט: מי הם"
                      value={audience.description}
                      onChange={(value) =>
                        setDraft({ audiences: kept.map((a, i) => (i === index ? { ...a, description: value } : a)) })
                      }
                      maxLength={160}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!audience.name.trim()) setDraft({ audiences: kept.filter((_, i) => i !== index) });
                        setEditing(null);
                      }}
                      className="min-h-11 cursor-pointer rounded-full border border-[#c7c4b8] px-4 text-sm font-bold text-[#191b18]"
                    >
                      לשמור את הקהל
                    </button>
                  </li>
                ) : (
                  <li key={`${audience.name}-${index}`} className="flex items-start gap-1 py-2 pr-3.5 pl-1">
                    <div className="min-w-0 flex-1 py-1">
                      <p className="text-[15px] font-black text-[#191b18]">{audience.name}</p>
                      <p className="text-xs leading-5 text-[#5e6159]">
                        {whyFor(audience.name) || audience.description}
                      </p>
                    </div>
                    <IconButton label={`לערוך את ${audience.name}`} onClick={() => setEditing(index)}>
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                        <path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5z" strokeLinejoin="round" />
                      </svg>
                    </IconButton>
                    <IconButton
                      label={`להסיר את ${audience.name}`}
                      onClick={() => setDraft({ audiences: kept.filter((_, i) => i !== index) })}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                        <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                      </svg>
                    </IconButton>
                  </li>
                ),
              )}
            </ul>
          ) : null}

          {removed.length ? (
            <div className="flex flex-wrap gap-2">
              {removed.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  disabled={full}
                  onClick={() => setDraft({ audiences: [...kept, { name: s.name, description: s.description }] })}
                  className="min-h-11 cursor-pointer rounded-full border border-dashed border-[#b9b7ad] px-3.5 text-sm text-[#2b2d28] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + {s.name}
                </button>
              ))}
            </div>
          ) : null}

          {showAdd && !full ? (
            <div className="space-y-2 rounded-xl border border-[#e2e0d8] bg-white p-3">
              <TextInput
                id="aud-new-name"
                label="למי עוד אתם מוכרים?"
                value={newName}
                onChange={setNewName}
                placeholder="למשל: סטודנטים מהאזור"
                maxLength={60}
              />
              <TextInput
                id="aud-new-desc"
                label="במשפט: מה הם צריכים (לא חובה)"
                value={newDesc}
                onChange={setNewDesc}
                maxLength={160}
              />
              <button
                type="button"
                onClick={saveNew}
                disabled={!newName.trim()}
                className="min-h-11 cursor-pointer rounded-full border border-[#c7c4b8] px-4 text-sm font-bold text-[#191b18] disabled:opacity-50"
              >
                להוסיף את הקהל
              </button>
            </div>
          ) : !full ? (
            <QuietLink onClick={() => setAdding(true)}>להוסיף קהל משלכם</QuietLink>
          ) : (
            <p className="text-xs text-[#5e6159]">עד 3 קהלים. כדי להוסיף, הסירו אחד.</p>
          )}
        </>
      )}
    </StepShell>
  );
}

export function StepSeasons(props: StepProps) {
  const { flow, setDraft, next } = props;
  const [mode, setMode] = useState<"busy" | "slow">("busy");
  const seasons = flow.draft.seasons ?? { busy: [], slow: [] };

  function toggle(month: number) {
    const other = mode === "busy" ? "slow" : "busy";
    const list = seasons[mode];
    const nextList = list.includes(month) ? list.filter((m) => m !== month) : [...list, month];
    setDraft({
      seasons: { ...seasons, [mode]: nextList, [other]: seasons[other].filter((m) => m !== month) } as {
        busy: number[];
        slow: number[];
      },
    });
  }

  return (
    <StepShell
      {...props}
      title="מתי עמוס ומתי שקט?"
      why="ככה נתכונן לעונה לפני שהיא מגיעה, ונמלא את החודשים השקטים."
      primary="להמשיך לאתר ולרשתות"
      onPrimary={next}
      skip="לא בטוחים? לדלג"
      onSkip={() => {
        setDraft({ seasons: { busy: [], slow: [] } });
        next();
      }}
    >
      <div role="radiogroup" aria-label="מה מסמנים" className="grid grid-cols-2 gap-1 rounded-full bg-[#ecebe5] p-1">
        {(["busy", "slow"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => setMode(key)}
            className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-bold ${
              mode === key ? "bg-white text-[#191b18] shadow-sm" : "text-[#5e6159]"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: key === "busy" ? "#d9824b" : "#7da2b8" }} />
            {key === "busy" ? "חודשים עמוסים" : "חודשים שקטים"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MONTHS_HE.map((label, index) => {
          const month = index + 1;
          const busy = seasons.busy.includes(month);
          const slow = seasons.slow.includes(month);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={busy || slow}
              aria-label={`${label}${busy ? ", עמוס" : slow ? ", שקט" : ""}`}
              onClick={() => toggle(month)}
              className={`flex min-h-[52px] cursor-pointer flex-col items-center justify-center rounded-xl border text-sm font-bold transition-colors ${
                busy
                  ? "border-[#d9824b] bg-[#fbeee3] text-[#6b3517]"
                  : slow
                    ? "border-[#7da2b8] bg-[#eaf1f5] text-[#24475a]"
                    : "border-[#dedcd4] bg-white text-[#2b2d28]"
              }`}
            >
              {label}
              <span className="text-[10px] font-normal opacity-70">{MONTH_HINTS[month] ?? " "}</span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

/* ---------------------------- איך אתם משווקים ---------------------------- */

const LINK_OPTIONS: { key: LinkKey; label: string }[] = [
  { key: "website", label: "אתר" },
  ...NETWORKS.map((n) => ({ key: n.key as LinkKey, label: n.label })),
];

export function PresetGrid({ value, onPick }: { value?: string; onPick: (key: string) => void }) {
  const [list, setList] = useState(stylePresets);
  useEffect(() => {
    let live = true;
    loadStylePresets().then((next) => {
      if (live) setList(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div role="radiogroup" aria-label="סגנון" className="grid grid-cols-2 gap-2">
      {list.map((preset) => {
        const selected = value === preset.key;
        return (
          <button
            key={preset.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(preset.key)}
            className={`flex min-h-[60px] cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-right ${
              selected ? "border-[#191b18] bg-[#f1efe8] ring-1 ring-[#191b18]" : "border-[#dedcd4] bg-white"
            }`}
          >
            <span className="flex shrink-0 -space-x-1.5 space-x-reverse" aria-hidden>
              {preset.palette.slice(0, 4).map((s) => (
                <span key={s.hex} className="h-6 w-6 rounded-full border-2 border-white" style={{ background: s.hex }} />
              ))}
            </span>
            <span className="text-sm font-bold leading-tight text-[#191b18]">{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StepLinks(props: StepProps & { onWebsite: (url: string) => void }) {
  const { flow, update, next, onWebsite } = props;
  const d = flow.draft;
  const selected = (Object.keys(d.links) as LinkKey[]).filter((k) => d.links[k] !== undefined);
  const websiteBad = d.links.website !== undefined && d.links.website.trim() !== "" && !looksLikeUrl(d.links.website);
  const scanFailed = flow.brandScan?.status === "failed";

  function toggle(key: LinkKey) {
    update((f) => {
      const links = { ...f.draft.links };
      if (links[key] !== undefined) delete links[key];
      else links[key] = "";
      return { ...f, draft: { ...f.draft, links, has_none: false } };
    });
  }
  function setLink(key: LinkKey, value: string) {
    update((f) => ({ ...f, draft: { ...f.draft, links: { ...f.draft.links, [key]: value } } }));
  }
  function setActivity(key: "instagram" | "facebook" | "tiktok", value: Activity) {
    update((f) => ({ ...f, draft: { ...f.draft, activity: { ...(f.draft.activity ?? {}), [key]: value } } }));
  }

  const nothingChosen = !d.has_none && selected.length === 0;
  const [error, setError] = useState("");
  const [linkErrors, setLinkErrors] = useState<LinkErrors>({});
  const linksKey = signature(d.links);

  // Checked as they type (debounced), never blocking: a wrong handle is a hint, not a wall.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      validateLinks(d.links)
        .then((errors) => {
          if (live) setLinkErrors(errors);
        })
        .catch(() => {});
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // Keyed on the links' content; `d.links` is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey]);

  return (
    <StepShell
      {...props}
      title="איפה אפשר למצוא אתכם?"
      why="מהאתר נלמד את הסגנון שלכם, ומהרשתות מה כבר קורה. אין עדיין? מתחילים בלי."
      primary="להמשיך למה שניסיתם"
      onPrimary={() => {
        if (nothingChosen) {
          setError("סמנו איפה אתם נמצאים, או ״עוד לא״.");
          return;
        }
        const site = d.links.website?.trim();
        if (site && looksLikeUrl(site)) onWebsite(site);
        next();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {LINK_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={d.links[option.key] !== undefined}
            onClick={() => {
              setError("");
              toggle(option.key);
            }}
          />
        ))}
        <Chip
          label="עוד לא"
          selected={Boolean(d.has_none)}
          onClick={() => {
            setError("");
            update((f) => ({ ...f, draft: { ...f.draft, has_none: !f.draft.has_none, links: {}, activity: {} } }));
          }}
        />
      </div>
      <FieldError message={error} />

      {d.has_none ? (
        <div className={`space-y-3 ${styles.rise}`}>
          <p className="text-sm leading-6 text-[#2b2d28]">
            הרבה עסקים מתחילים בדיוק ככה. בחרו סגנון שמרגיש כמוכם, ונבנה ממנו את הפוסטים הראשונים.
          </p>
          <PresetGrid
            value={d.style_preset}
            onPick={(key) => update((f) => ({ ...f, draft: { ...f.draft, style_preset: key } }))}
          />
          <p className="text-xs text-[#5e6159]">לא בטוחים? אפשר לדלג. נבחר בשבילכם, ותמיד אפשר לשנות.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selected.includes("website") ? (
            <div className={styles.rise}>
              <TextInput
                id="link-website"
                label="כתובת האתר"
                value={d.links.website ?? ""}
                onChange={(value) => setLink("website", value)}
                placeholder="myshop.co.il"
                dir="ltr"
                inputMode="url"
                helpTopic="website"
                note={
                  linkErrors.website && d.links.website?.trim()
                    ? linkErrors.website
                    : websiteBad
                    ? "הכתובת לא נראית שלמה. למשל: myshop.co.il"
                    : scanFailed
                      ? "לא הצלחנו לקרוא את האתר. בחרו סגנון בינתיים:"
                      : "לא זוכרים? אפשר להשאיר ריק ולהוסיף אחר כך."
                }
              />
              {scanFailed ? (
                <div className="mt-2">
                  <PresetGrid
                    value={d.style_preset}
                    onPick={(key) => update((f) => ({ ...f, draft: { ...f.draft, style_preset: key } }))}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {NETWORKS.filter((n) => selected.includes(n.key)).map((network) => (
            <div key={network.key} className={`rounded-xl border border-[#e2e0d8] bg-white p-3 ${styles.rise}`}>
              <TextInput
                id={`link-${network.key}`}
                label={network.label}
                value={d.links[network.key] ?? ""}
                onChange={(value) => setLink(network.key, value)}
                placeholder={network.placeholder}
                dir="ltr"
                inputMode="url"
                helpTopic={network.key}
                note={
                  linkErrors[network.key] && d.links[network.key]?.trim()
                    ? linkErrors[network.key]
                    : "לא זוכרים? אפשר להשאיר ריק."
                }
              />
              <div role="radiogroup" aria-label={`כמה אתם מפרסמים ב${network.label}`} className="mt-2 grid grid-cols-3 gap-1.5">
                {ACTIVITY_OPTIONS.map((option) => {
                  const on = d.activity?.[network.key] === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setActivity(network.key, option.key)}
                      className={`min-h-10 cursor-pointer rounded-lg border px-1 text-xs font-bold ${
                        on ? "border-[#191b18] bg-[#f1efe8] text-[#191b18] ring-1 ring-[#191b18]" : "border-[#dedcd4] text-[#4f524b]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {selected.length ? null : (
            <p className="flex items-center gap-2 text-xs text-[#5e6159]">
              <NetworkIcon network="website" className="h-4 w-4" />
              אפשר לסמן כמה. לכל אחד נשאל רק את הכתובת.
            </p>
          )}
        </div>
      )}
    </StepShell>
  );
}

export function StepTried(props: StepProps) {
  const { flow, update, next } = props;
  const tried = flow.draft.tried ?? { channels: [] as TriedChannel[] };
  function toggle(key: TriedChannel) {
    update((f) => {
      const current = f.draft.tried ?? { channels: [] };
      const channels = current.channels.includes(key)
        ? current.channels.filter((c) => c !== key)
        : [...current.channels, key];
      return { ...f, triedNone: false, draft: { ...f.draft, tried: { ...current, channels } } };
    });
  }
  return (
    <StepShell
      {...props}
      title="מה ניסיתם עד היום?"
      why="לא נמציא את הגלגל מחדש. נחזק את מה שכבר הצליח."
      primary="להמשיך למתחרים"
      onPrimary={next}
      skip="לדלג"
      onSkip={() => {
        update((f) => ({ ...f, triedNone: false, draft: { ...f.draft, tried: { channels: [] } } }));
        next();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {TRIED_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={tried.channels.includes(option.key)}
            onClick={() => toggle(option.key)}
            className="px-3.5"
          />
        ))}
        <Chip
          label="עוד לא ניסינו"
          selected={Boolean(flow.triedNone)}
          onClick={() =>
            update((f) => ({
              ...f,
              triedNone: !f.triedNone,
              draft: { ...f.draft, tried: { channels: [] } },
            }))
          }
          className="px-3.5"
        />
      </div>
      {tried.channels.length ? (
        <div className={styles.rise}>
          <TextInput
            id="what-worked"
            label="מה הצליח? (לא חובה)"
            value={tried.what_worked ?? ""}
            onChange={(value) =>
              update((f) => ({
                ...f,
                draft: { ...f.draft, tried: { channels: f.draft.tried?.channels ?? [], what_worked: value } },
              }))
            }
            placeholder="למשל: פוסט על מבצע שישי הביא הרבה הודעות"
            maxLength={200}
          />
        </div>
      ) : null}
    </StepShell>
  );
}

const MAX_COMPETITORS = 3;

export function StepCompetitors(props: StepProps) {
  const { flow, setDraft, next } = props;
  const rows = flow.draft.competitors?.length ? flow.draft.competitors : [{ name: "", link: "" }];
  function setRow(index: number, patch: Partial<{ name: string; link: string }>) {
    setDraft({ competitors: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }
  return (
    <StepShell
      {...props}
      title="מי המתחרים העיקריים שלכם?"
      why="לא כדי להעתיק. כדי לראות מה כבר יש, ולמצוא איפה אתם יכולים לבלוט."
      primary="להמשיך למטרה"
      onPrimary={() => {
        setDraft({ competitors: rows.filter((r) => r.name.trim()) });
        next();
      }}
      skip="לא יודעים? לדלג, ונחפש בעצמנו"
      onSkip={() => {
        setDraft({ competitors: [] });
        next();
      }}
    >
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_1.1fr] gap-2">
            <TextInput
              id={`comp-name-${index}`}
              label={rows.length > 1 ? `מתחרה ${index + 1}` : "שם העסק"}
              value={row.name}
              onChange={(value) => setRow(index, { name: value })}
              placeholder="השם"
              maxLength={80}
            />
            <TextInput
              id={`comp-link-${index}`}
              label="אתר או אינסטגרם"
              value={row.link ?? ""}
              onChange={(value) => setRow(index, { link: value })}
              placeholder="@name"
              dir="ltr"
              inputMode="url"
              helpTopic="competitor_instagram"
              maxLength={200}
            />
          </div>
        ))}
      </div>
      {rows.length < MAX_COMPETITORS && rows[rows.length - 1]?.name.trim() ? (
        <QuietLink onClick={() => setDraft({ competitors: [...rows, { name: "", link: "" }] })}>
          להוסיף עוד מתחרה
        </QuietLink>
      ) : null}
      <p className="text-xs text-[#5e6159]">לא חייבים קישור. מספיק השם.</p>
    </StepShell>
  );
}

const MODEL_QUESTION: Record<BusinessModel, string> = {
  products: "נראה שאתם מוכרים מוצרים — נכון?",
  services: "נראה שאתם נותנים שירות — נכון?",
  both: "נראה שאתם מוכרים מוצרים וגם נותנים שירות — נכון?",
};

export function StepGoal(props: StepProps) {
  const { flow, update, next } = props;
  const d = flow.draft;
  const model: BusinessModel = d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  const goals = goalsFor(model);
  const goal = d.goal && isGoalValidFor(model, d.goal) ? d.goal : null;

  function setModel(nextModel: BusinessModel) {
    update((f) => {
      const current = f.draft.goal;
      return {
        ...f,
        modelConfirmed: true,
        draft: {
          ...f.draft,
          business_model: nextModel,
          goal: current && isGoalValidFor(nextModel, current) ? current : undefined,
        },
      };
    });
    setChanging(false);
  }

  return (
    <StepShell
      {...props}
      title="מה הכי חשוב לכם עכשיו?"
      why="לפי זה נבנה את הכיוון לחודש הראשון."
      primary="לראות מה למדנו"
      onPrimary={() => {
        if (!goal) {
          setError("בחרו אחד מאלה. לא בטוחים? אפשר שנבחר בשבילכם.");
          return;
        }
        update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: model } }));
        next();
      }}
      skip="לא בטוחים? תבחרו בשבילנו"
      onSkip={() => {
        update((f) => ({
          ...f,
          modelConfirmed: true,
          draft: { ...f.draft, business_model: model, goal: defaultGoalFor(model) },
        }));
        next();
      }}
    >
      <div className="rounded-xl bg-[#efece3] p-3">
        {changing ? (
          <div className="space-y-2">
            <p className="text-sm font-bold text-[#191b18]">מה אתם מוכרים?</p>
            <div className="grid grid-cols-3 gap-2">
              {BUSINESS_MODEL_OPTIONS.map((option) => (
                <Chip
                  key={option.key}
                  label={option.key === "both" ? "גם וגם" : option.title}
                  selected={model === option.key}
                  onClick={() => setModel(option.key)}
                  className="px-2"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-[#191b18]">{MODEL_QUESTION[model]}</p>
            <div className="flex gap-2">
              <Chip
                label="נכון"
                selected={Boolean(flow.modelConfirmed)}
                onClick={() => update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: model } }))}
                className="min-h-10 px-3"
              />
              <Chip label="לא בדיוק" selected={false} onClick={() => setChanging(true)} className="min-h-10 px-3" />
            </div>
          </div>
        )}
      </div>
      <div role="radiogroup" aria-label="מה הכי חשוב" className={`grid gap-2 ${goals.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {goals.map((option) => {
          const on = goal === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setError("");
                update((f) => ({ ...f, draft: { ...f.draft, goal: option.key, business_model: model } }));
              }}
              className={`min-h-[68px] cursor-pointer rounded-xl border p-3 text-right transition-colors ${
                on ? "border-[#191b18] bg-[#f1efe8] ring-1 ring-[#191b18]" : "border-[#dedcd4] bg-white"
              }`}
            >
              <span className="block text-base font-black text-[#191b18]">{option.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[#5e6159]">{option.desc}</span>
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </StepShell>
  );
}
