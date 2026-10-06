"use client";

import { useEffect, useState } from "react";
import { UIAction } from "@/components/design/Controls";
import { BUSINESS_FIELDS } from "@/lib/businessFields";
import {
  NETWORKS,
  draftForApi,
  inferBusinessModel,
  inferBusinessType,
  kitFor,
  loadStylePresets,
  looksLikeUrl,
  seasonsExampleFor,
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
import { HowToFind } from "@/components/help/HowToFind";
import { ActivityPicker, TriedPicker } from "./AnswerPickers";
import { SeasonsPicker } from "./SeasonsPicker";
import { BusinessRoute, ServiceClientSources } from "./BusinessRoute";
import { modelOf } from "./script";
import { IconPlus } from "@/lib/icons";
import { CHANGE_LATER, Chip, IconButton, NetworkIcon, QuietLink, StepShell, TextInput } from "./ui";
import styles from "./start.module.css";
import form from "./form.module.css";

/** What every screen gets from the flow. */
export type StepProps = {
  flow: FlowState;
  update: (fn: (flow: FlowState) => FlowState) => void;
  setDraft: (patch: Partial<OnboardingDraft>) => void;
  /** Mark this screen answered and move on. */
  next: () => void;
  nextLabel?: string;
  editLinks?: () => void;
  reflection: string | null;
  notice?: React.ReactNode;
  focus: boolean;
  direction: "fwd" | "back";
};

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={form.error}>
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
      <div>
        <label htmlFor="business-name" className={form.label}>
          שם העסק
        </label>
        <input
          id="business-name"
          className={form.input}
          value={flow.draft.business_name}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "business-name-error" : undefined}
          onChange={(event) => {
            setError("");
            setDraft({ business_name: event.target.value });
          }}
          placeholder="למשל: מאפיית השכונה"
          autoComplete="organization"
          maxLength={80}
        />
        {error ? (
          <p id="business-name-error" role="alert" className={`${form.error} mt-2`}>
            {error}
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}

export function StepWhat(props: StepProps) {
  const { flow, update, setDraft, next } = props;
  const [error, setError] = useState("");
  const d = flow.draft;
  const kit = kitFor(d.business_type);
  const service = flow.modelConfirmed && d.business_model === "services";
  const software = d.business_model === "saas";
  return (
    <StepShell
      {...props}
      title={software ? "אילו מוצרים יש לחברה שלכם?" : service ? "איזה שירות אתם נותנים?" : "מה אתם עושים?"}
      why="נתאים לכם תוכנית שיווק, ובהמשך נכתוב לפיה פוסטים לאישורכם."
      primary="להמשיך למה שמייחד אתכם"
      onPrimary={() => {
        if (!flow.modelConfirmed) {
          setError("בחרו את סוג העסק שמתאים לכם.");
          return;
        }
        if (d.offerings.trim().length < 3) {
          setError("כתבו במשפט קצר מה אתם מוכרים או עושים.");
          return;
        }
        // The owner's own words are the answer. The field is optional: when none was
        // tapped we take the closest one from what they wrote.
        update((f) => {
          const businessType = f.draft.business_type || inferBusinessType(f.draft.offerings);
          const business_model = f.modelConfirmed
            ? f.draft.business_model
            : inferBusinessModel(businessType, f.draft.offerings);
          return { ...f, draft: { ...f.draft, business_type: businessType, business_model } };
        });
        next();
      }}
    >
      <BusinessRoute flow={flow} update={update} onSelect={() => setError("")} />
      <TextInput
        id="offerings"
        label={software ? "שם ותיאור קצר לכל מוצר. אפשר גם מוצר אחד שעוד בונים." : service ? "איזה שירות, ולמי הוא מתאים?" : "במילים שלכם: מה אתם מוכרים או עושים?"}
        value={d.offerings}
        onChange={(value) => {
          setError("");
          setDraft({ offerings: value });
        }}
        placeholder={software ? "למשל: כלי לתיאום פגישות לסטודיואים; כלי לניהול תשלומים" : service && !d.business_type ? "למשל: עיצוב דירות למשפחות, אימון אישי למתחילים או שיעורים לתלמידים" : kit.placeholder}
        maxLength={software ? 600 : 300}
      />
      <FieldError message={error} />
      <details className="border-t border-[var(--rule)] pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-[14px] font-medium text-[color:var(--ink-muted)]">
          תחום העסק (לא חובה){d.business_type ? ` · ${kit.chip}` : ""}
        </summary>
      <fieldset>
        <legend className="sr-only">תחום העסק</legend>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_FIELDS.map((field) => (
            <Chip
              key={field.key}
              label={field.chip}
              selected={d.business_type === field.key}
              onClick={() => {
                setError("");
                // Tapping the selected field again clears it.
                setDraft({ business_type: d.business_type === field.key ? "" : field.key });
              }}
            />
          ))}
        </div>
      </fieldset>
      </details>
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
      reassure={CHANGE_LATER}
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
        placeholder={modelOf(flow) === "saas" ? "למשל: מתחילים בלי הטמעה ארוכה, והכלי נבנה במיוחד לסטודיואים" : "למשל: הכול נעשה אצלנו, בעבודת יד"}
        maxLength={200}
      />
      <div>
        <p className="mb-2.5 text-[13px] text-[color:var(--ink-muted)]">אפשר להתחיל מאחד מאלה:</p>
        <div className="flex flex-wrap gap-2">
          {(modelOf(flow) === "saas" ? ["קל להתחיל", "חוסך עבודה ידנית", "מתחבר לכלים שכבר יש", "נבנה לתחום שלנו"] : kit.differentiators).map((example) => (
            <Chip
              key={example}
              label={example}
              selected={text.split(/,\s*/).includes(example)}
              onClick={() => toggleExample(example)}
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
      title={modelOf(flow) === "saas" ? "מי צריך את המוצר שלכם?" : modelOf(flow) === "services" ? "למי מתאים השירות שלכם?" : "מי קונה מכם?"}
      why={modelOf(flow) === "saas" ? "נציע קהל לפי הבעיה ומי שמחליט על הרכישה. אפשר לבחור, לשנות או להשלים בהמשך." : "ככה נדע למי לכתוב. הצענו 3 קהלים לפי מה שסיפרתם, ואפשר לשנות."}
      primary="להמשיך לעונות השנה"
      reassure={CHANGE_LATER}
      onPrimary={() => {
        if (newName.trim()) saveNew();
        next();
      }}
      skip="לא בטוחים? לדלג"
      onSkip={() => next()}
    >
      {loading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-[color:var(--ink-muted)]">מחפשים את הלקוחות שלכם…</p>
          <div className={form.list}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 border-t border-[var(--rule)] px-4 py-4 first:border-t-0">
                <span className={`block h-3 w-32 rounded-full bg-[var(--soft)] ${styles.shimmer}`} />
                <span className={`block h-2.5 w-56 max-w-full rounded-full bg-[var(--soft)] ${styles.shimmer}`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {flow.suggestionsFailed ? (
            <p className="text-[15px] leading-6 text-[color:var(--ink-soft)]">לא הצלחנו להציע קהלים כרגע. כתבו בעצמכם למי העסק שלכם מתאים.</p>
          ) : null}
          {kept.length ? (
            <ul className={`${form.list} ${styles.stagger}`}>
              {kept.map((audience, index) =>
                editing === index ? (
                  <li key={`edit-${index}`} className="space-y-3 bg-[var(--soft)] p-4">
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
                    <UIAction
                      variant="secondary"
                      onClick={() => {
                        if (!audience.name.trim()) setDraft({ audiences: kept.filter((_, i) => i !== index) });
                        setEditing(null);
                      }}
                    >
                      לשמור את הקהל
                    </UIAction>
                  </li>
                ) : (
                  <li key={`${audience.name}-${index}`} className="flex items-start gap-1 py-2.5 pe-1.5 ps-4">
                    <div className="min-w-0 flex-1 py-1">
                      <p className="text-[15.5px] font-semibold leading-6 text-[color:var(--ink)]">{audience.name}</p>
                      <p className="mt-0.5 text-[13.5px] leading-[1.55] text-[color:var(--ink-soft)]">
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
                  className={`${form.chip} ${form.chipAdd}`}
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  {s.name}
                </button>
              ))}
            </div>
          ) : null}

          {showAdd && !full ? (
            <div className={`${form.panel} space-y-3`}>
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
              <UIAction variant="secondary" onClick={saveNew} disabled={!newName.trim()}>
                להוסיף את הקהל
              </UIAction>
            </div>
          ) : !full ? (
            <div>
              <QuietLink tone="action" onClick={() => setAdding(true)}>
                להוסיף קהל משלכם
              </QuietLink>
            </div>
          ) : (
            <p className="text-[13px] text-[color:var(--ink-muted)]">עד 3 קהלים. כדי להוסיף, הסירו אחד.</p>
          )}
        </>
      )}
    </StepShell>
  );
}

export function StepSeasons(props: StepProps) {
  const { flow, setDraft, next } = props;
  const seasons = flow.draft.seasons ?? { busy: [], slow: [] };

  return (
    <StepShell
      {...props}
      title="מתי עמוס ומתי שקט?"
      why="חשבו על השנה האחרונה. סמנו מתי היה הכי הרבה עבודה, ואז עברו ל״שקט״ וסמנו מתי היה פחות."
      primary="להמשיך לאתר ולרשתות"
      onPrimary={next}
      skip="לא בטוחים? לדלג"
      onSkip={() => {
        setDraft({ seasons: { busy: [], slow: [] } });
        next();
      }}
      reassure="לא צריך לדייק. אפשר לשנות את זה בכל רגע ב״ההחלטות שלי״."
    >
      <SeasonsPicker
        value={seasons}
        onChange={(value) => setDraft({ seasons: value })}
        example={seasonsExampleFor(flow.draft.business_type)}
      />
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
            className={`${form.tile} !items-center !gap-3 !p-3`}
          >
            <span className="flex shrink-0 -space-x-1.5 space-x-reverse" aria-hidden>
              {preset.palette.slice(0, 4).map((s) => (
                <span key={s.hex} className="h-6 w-6 rounded-full ring-2 ring-[var(--paper)]" style={{ background: s.hex }} />
              ))}
            </span>
            <span className="text-sm font-semibold leading-tight text-[color:var(--ink)]">{preset.name}</span>
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
    setLinkErrors({});
    update((f) => ({ ...f, deferredLinks: f.deferredLinks?.filter((item) => item !== key), draft: { ...f.draft, links: { ...f.draft.links, [key]: value } } }));
  }
  function setActivity(key: "instagram" | "facebook" | "tiktok", value: Activity) {
    update((f) => ({ ...f, draft: { ...f.draft, activity: { ...(f.draft.activity ?? {}), [key]: value } } }));
  }

  const nothingChosen = !d.has_none && selected.length === 0;
  const [error, setError] = useState("");
  const [linkErrors, setLinkErrors] = useState<LinkErrors>({});
  const [checking, setChecking] = useState(false);
  const activeLinks = Object.fromEntries(Object.entries(d.links).filter(([key]) => !flow.deferredLinks?.includes(key as LinkKey)));
  const linksKey = signature(activeLinks);

  // Check beside the input. Submit checks the current value again, so a late debounce
  // cannot let an invalid profile surface as an unrelated goal/plan failure later.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      validateLinks(activeLinks)
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

  async function continueWithLinks() {
    if (nothingChosen) {
      setError("סמנו איפה אתם נמצאים, או ״עוד לא״.");
      return;
    }
    setChecking(true);
    try {
      const errors = d.has_none ? {} : await validateLinks(activeLinks);
      setLinkErrors(errors);
      const invalid = Object.keys(errors) as LinkKey[];
      if (invalid.length) update((f) => ({ ...f, deferredLinks: [...new Set([...(f.deferredLinks ?? []), ...invalid])], deferredLinkErrors: { ...f.deferredLinkErrors, ...errors } }));
      const site = d.links.website?.trim();
      if (site && looksLikeUrl(site) && !invalid.includes("website") && !flow.deferredLinks?.includes("website")) onWebsite(site);
      next();
    } catch {
      const unchecked = Object.keys(activeLinks).filter((key) => activeLinks[key]?.trim()) as LinkKey[];
      const errors = Object.fromEntries(unchecked.map((key) => [key, "לא הצלחנו לבדוק את הקישור כרגע. אפשר להחליף או לבדוק אותו שוב בחיבורים אחרי ההרשמה."]));
      update((f) => ({ ...f, deferredLinks: [...new Set([...(f.deferredLinks ?? []), ...unchecked])], deferredLinkErrors: { ...f.deferredLinkErrors, ...errors } }));
      next();
    } finally {
      setChecking(false);
    }
  }

  return (
    <StepShell
      {...props}
      title="איפה אפשר למצוא אתכם?"
      why="מהאתר נלמד את הסגנון שלכם, ומהרשתות מה כבר קורה. אין עדיין? מתחילים בלי."
      primary={checking ? "בודקים את הקישורים…" : "להמשיך למה שניסיתם"}
      primaryDisabled={checking}
      onPrimary={() => { void continueWithLinks(); }}
      reassure={Object.keys(linkErrors).length ? "אפשר להמשיך. קישור שלא נוכל לקרוא נשמר לתיקון בהמשך." : undefined}
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
          <p className="text-[15px] leading-6 text-[color:var(--ink)]">
            הרבה עסקים מתחילים בדיוק ככה. בחרו סגנון שמרגיש כמוכם, ונבנה ממנו את הפוסטים הראשונים.
          </p>
          <PresetGrid
            value={d.style_preset}
            onPick={(key) => update((f) => ({ ...f, draft: { ...f.draft, style_preset: key } }))}
          />
          <p className="text-[13px] text-[color:var(--ink-muted)]">לא בטוחים? אפשר לדלג. נבחר בשבילכם, ותמיד אפשר לשנות.</p>
        </div>
      ) : (
        <div className="space-y-4">
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
            <div key={network.key} className={`${form.panel} ${styles.rise}`}>
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
                  flow.deferredLinks?.includes(network.key)
                    ? `${flow.deferredLinkErrors?.[network.key] ?? "צריך קישור לפרופיל של העסק."} ממשיכים בינתיים בלי לקרוא אותו. אפשר לתקן כאן בכל רגע.`
                    : linkErrors[network.key] && d.links[network.key]?.trim()
                    ? linkErrors[network.key]
                    : "לא זוכרים? אפשר להשאיר ריק."
                }
              />
              <div className="mt-3">
                <ActivityPicker
                  label={`כמה אתם מפרסמים ב${network.label}`}
                  value={d.activity?.[network.key]}
                  onChange={(value) => {
                    if (value) setActivity(network.key, value);
                  }}
                />
              </div>
            </div>
          ))}
          {selected.length ? null : (
            <p className="flex items-center gap-2 text-[13px] text-[color:var(--ink-muted)]">
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
  if (modelOf(flow) !== "products") {
    return (
      <StepShell {...props} title="מאיפה מגיעים הלקוחות שלכם?" why="נבין מה כבר מביא פניות, ומה כדאי לפתח בתוכנית."
        primary="להמשיך למתחרים" reassure={CHANGE_LATER} onPrimary={next} skip="לדלג" onSkip={next}>
        <ServiceClientSources flow={flow} setDraft={props.setDraft} />
        <details className="border-t border-[var(--rule)] pt-3">
          <summary className="cursor-pointer py-2 text-[14px] font-semibold text-[color:var(--ink)]">שיווק שכבר ניסיתם (לא חובה)</summary>
          <div className="mt-3 space-y-4">
            <TriedPicker channels={tried.channels} onToggle={toggle} />
            <TextInput id="what-worked" label="מה הצליח, ומה פחות?" value={tried.what_worked ?? ""}
              onChange={(what_worked) => update((f) => ({ ...f, draft: { ...f.draft, tried: { channels: f.draft.tried?.channels ?? [], what_worked } } }))}
              placeholder="למשל: טיפים הביאו שאלות, אבל עוד לא לקוחות" maxLength={200} />
          </div>
        </details>
      </StepShell>
    );
  }
  return (
    <StepShell
      {...props}
      title="מה ניסיתם עד היום?"
      why="לא נמציא את הגלגל מחדש. נחזק את מה שכבר הצליח."
      primary="להמשיך למתחרים"
      reassure={CHANGE_LATER}
      onPrimary={next}
      skip="לדלג"
      onSkip={() => {
        update((f) => ({ ...f, triedNone: false, draft: { ...f.draft, tried: { channels: [] } } }));
        next();
      }}
    >
      <TriedPicker channels={tried.channels} onToggle={toggle}>
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
        />
      </TriedPicker>
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
      title={flow.draft.business_model === "saas" ? "מה עושים היום בלי המוצר שלכם?" : "מי המתחרים העיקריים שלכם?"}
      why={flow.draft.business_model === "saas" ? "גם גיליון, תהליך ידני או כלי אחר הם חלופות. נבין למה כדאי לעבור אליכם." : "נראה מה כבר יש, ונמצא איפה אתם יכולים לבלוט."}
      primary="להמשיך למטרה ולתקציב"
      reassure={CHANGE_LATER}
      onPrimary={() => {
        setDraft({ competitors: rows.filter((r) => r.name.trim()) });
        next();
      }}
      skip={flow.draft.business_model === "saas" ? "אין כרגע? אפשר להמשיך" : "לא יודעים? לדלג, ונחפש בעצמנו"}
      onSkip={() => {
        setDraft({ competitors: [] });
        next();
      }}
    >
      <div className="space-y-4">
        {rows.map((row, index) => (
          // items-end: both boxes line up even if one label wraps to two lines.
          <div key={index} className="grid grid-cols-[1fr_1.1fr] items-end gap-3">
            <TextInput
              id={`comp-name-${index}`}
              label={flow.draft.business_model === "saas" ? "כלי או דרך עבודה" : rows.length > 1 ? `מתחרה ${index + 1}` : "שם העסק"}
              value={row.name}
              onChange={(value) => setRow(index, { name: value })}
              placeholder="השם"
              maxLength={80}
            />
            <TextInput
              id={`comp-link-${index}`}
              label={flow.draft.business_model === "saas" ? "קישור (לא חובה)" : "אתר או אינסטגרם"}
              value={row.link ?? ""}
              onChange={(value) => setRow(index, { link: value })}
              placeholder="https://example.com"
              dir="ltr"
              inputMode="url"
              maxLength={200}
            />
          </div>
        ))}
      </div>
      {rows.length < MAX_COMPETITORS && rows[rows.length - 1]?.name.trim() ? (
        <div>
          <QuietLink tone="action" onClick={() => setDraft({ competitors: [...rows, { name: "", link: "" }] })}>
            {flow.draft.business_model === "saas" ? "להוסיף עוד חלופה" : "להוסיף עוד מתחרה"}
          </QuietLink>
        </div>
      ) : null}
      {/* One help link for all rows: inside each row's label it pushed that box lower
          than the name box beside it. */}
      <div className="-my-2 flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-[13px] text-[color:var(--ink-muted)]">לא חייבים קישור. מספיק השם.</p>
        {flow.draft.business_model !== "saas" && <HowToFind topic="competitor_instagram" label="איך מוצאים שם משתמש?" />}
      </div>
    </StepShell>
  );
}
