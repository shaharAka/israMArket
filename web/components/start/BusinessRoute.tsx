"use client";

import type { BusinessModel } from "@/lib/api";
import { isGoalValidFor } from "@/lib/businessModel";
import { CLIENT_SOURCE_OPTIONS, type ClientSource, type ClientSources } from "@/lib/draft";
import type { StepProps } from "./steps";
import { TextInput } from "./ui";
import form from "./form.module.css";

const ROUTES: { key: BusinessModel; label: string; detail: string }[] = [
  { key: "products", label: "מוכרים מוצרים", detail: "בחנות או באתר" },
  { key: "services", label: "נותנים שירות", detail: "מומחיות, פגישות או פרויקטים" },
  { key: "saas", label: "תוכנה או סטארטאפ", detail: "מוצר דיגיטלי או אפליקציה" },
  { key: "both", label: "גם וגם", detail: "מוצרים ושירותים" },
];

export function BusinessRoute({ flow, update, onSelect }: Pick<StepProps, "flow" | "update"> & { onSelect: () => void }) {
  function choose(model: BusinessModel) {
    update((f) => {
      const changed = f.draft.business_model !== model;
      return {
        ...f, modelConfirmed: true,
        draft: {
          ...f.draft, business_model: model,
          software: model === "saas" ? f.draft.software : undefined,
          goal: f.draft.goal && isGoalValidFor(model, f.draft.goal) ? f.draft.goal : undefined,
          success: changed ? undefined : f.draft.success,
          baseline: changed ? undefined : f.draft.baseline,
          lever: changed ? undefined : f.draft.lever,
          target: changed ? undefined : f.draft.target,
          grow_where: ["services", "saas"].includes(model) ? undefined : f.draft.grow_where,
        },
      };
    });
    onSelect();
  }
  return (
    <fieldset>
      <legend className={form.label}>איזה עסק יש לכם?</legend>
      <div role="radiogroup" aria-label="סוג העסק" className="grid grid-cols-2 gap-2">
        {ROUTES.map((route) => (
          <button key={route.key} type="button" role="radio"
            aria-checked={Boolean(flow.modelConfirmed && flow.draft.business_model === route.key)}
            onClick={() => choose(route.key)} className={`${form.option} !min-h-20 !px-2`}>
            <span className="block text-[14px] font-semibold">{route.label}</span>
            <span className="mt-1 block text-[12px] leading-5 text-[color:var(--ink-muted)]">{route.detail}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ServiceClientSources({ flow, setDraft }: Pick<StepProps, "flow" | "setDraft">) {
  const value = flow.draft.client_sources;
  function set(patch: Partial<ClientSources>) {
    setDraft({ client_sources: { status: "unknown", channels: [], ...value, ...patch } });
  }
  function toggle(key: ClientSource) {
    const channels = value?.channels.includes(key) ? value.channels.filter((c) => c !== key) : [...(value?.channels ?? []), key];
    set({ channels, status: channels.length ? "known" : "unknown", main_channel: channels.includes(value?.main_channel as ClientSource) ? value?.main_channel : null });
  }
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className={`${form.label} !mb-2`}>איך לקוחות מוצאים אתכם היום? אפשר לבחור כמה.</legend>
        <div className="divide-y divide-[var(--rule)]">
          {CLIENT_SOURCE_OPTIONS.map((source) => (
            <label key={source.key} className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-[15px] text-[color:var(--ink)]">
              <input type="checkbox" checked={Boolean(value?.channels.includes(source.key))} onChange={() => toggle(source.key)}
                className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
              {source.label}
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="בלי מידע על מקורות הלקוחות">
          {([{ key: "starting", label: "עוד לא הגיעו לקוחות" }, { key: "unknown", label: "לא בטוחים" }] as const).map((option) => (
            <button key={option.key} type="button" aria-pressed={value?.status === option.key}
              onClick={() => set({ status: option.key, channels: [], main_channel: null })}
              className={`${form.option} !min-h-11 !px-3 !py-2 !text-[13px]`}>
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      {value?.channels && value.channels.length > 1 ? (
        <div>
          <label htmlFor="client-main-source" className={form.label}>מה מביא את רוב הלקוחות? (לא חובה)</label>
          <select id="client-main-source" className={form.input} value={value.main_channel ?? ""}
            onChange={(event) => set({ main_channel: event.target.value ? event.target.value as ClientSource : null })}>
            <option value="">לא בטוחים / אין מקור עיקרי</option>
            {CLIENT_SOURCE_OPTIONS.filter((source) => value.channels.includes(source.key)).map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
          </select>
        </div>
      ) : null}
      <TextInput id="client-source-details" label="יש משהו שכדאי שנדע? (לא חובה)" value={value?.details ?? ""}
        onChange={(details) => set({ details })} placeholder="למשל: רוב הלקוחות מגיעים מהמלצות, ורוצים להגיע גם לקהל חדש" maxLength={300} />
    </div>
  );
}
