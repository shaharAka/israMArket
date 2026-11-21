"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { TextField, UIAction } from "@/components/design/Controls";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { endpoints, isDemo, type Workspace } from "@/lib/api";
import { openWorkspace } from "@/lib/workspaceScope";
import { IconChevron, IconPlus } from "@/lib/icons";

export default function WorkspacesPage() {
  const t = useCopy();
  const { locale } = useLanguage();
  const [data, setData] = useState<{ active_id: number | null; workspaces: Workspace[] }>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"load" | "create" | "open" | "demo">();
  const errorText = {
    load: t("לא הצלחנו לטעון את מרחבי העבודה."),
    create: t("מרחב העבודה לא נפתח. אפשר לנסות שוב."),
    open: t("לא הצלחנו לעבור למרחב הזה. בדקו שהדפדפן מאפשר לשמור נתונים ונסו שוב."),
    demo: t("אפשר לפתוח מרחבי עבודה אחרי שמתחברים לחשבון."),
  };
  const [reload, setReload] = useState(0);
  const request = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (isDemo()) {
        if (alive) setError("demo");
        return;
      }
      try {
        const result = await endpoints.workspaces();
        if (alive) setData(result);
      } catch {
        if (alive) setError("load");
      }
    };
    void load();
    return () => { alive = false; };
  }, [reload]);

  useEffect(() => { if (creating) document.getElementById("workspace-name")?.focus(); }, [creating]);

  function open(workspace: Workspace) {
    try {
      openWorkspace(workspace.scope_required ? workspace.id : null, workspace.ready, locale);
    } catch {
      setError("open");
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (busy || cleanName.length < 2) return;
    setBusy(true);
    setError(undefined);
    try {
      if (request.current?.name !== cleanName) {
        request.current = { id: crypto.randomUUID(), name: cleanName };
      }
      const { workspace } = await endpoints.createWorkspace(cleanName, request.current.id);
      setData(previous => previous && previous.workspaces.some(choice => choice.id === workspace.id)
        ? previous : { active_id: previous?.active_id ?? null, workspaces: [...(previous?.workspaces ?? []), workspace] });
      setCreating(false);
      setName("");
      request.current = null;
      open(workspace);
    } catch {
      setError("create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[720px]">
        <PageHeader title={t("מרחבי עבודה")} subtitle={t("לכל עסק או עמותה יש תוכנית, תוכן וחיבורים משלהם.")} />
        {data ? (
          <div className="space-y-5">
            {data.workspaces.length > 0 ? (
              <ul className="divide-y divide-[var(--rule)] overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--paper)]">
                {data.workspaces.map(workspace => {
                  const active = workspace.id === data.active_id;
                  const label = workspace.name || t("העסק שלי");
                  return (
                    <li key={workspace.id}>
                      <button type="button" onClick={() => open(workspace)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start hover:bg-[var(--soft)] focus-visible:outline focus-visible:outline-offset-[-4px]">
                        <BusinessLogo name={label} className="h-9 w-9 shrink-0" />
                        <span className="min-w-0 flex-1 break-words font-semibold">{label}</span>
                        <span className="text-xs font-medium text-[var(--ink-soft)]">
                          {active ? t("פתוח עכשיו") : workspace.ready ? null : t("בהקמה")}
                        </span>
                        <IconChevron navigation className="h-4 w-4 shrink-0 text-[var(--ink-soft)]" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {creating ? (
              <form onSubmit={create} className="space-y-3 rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-4">
                <TextField id="workspace-name" label={t("שם העסק או העמותה")} value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={100} required />
                <div className="flex flex-wrap gap-2">
                  <UIAction type="submit" busy={busy} busyLabel={t("רגע…")} disabled={name.trim().length < 2}>{t("לפתוח ולהתחיל היכרות")}</UIAction>
                  <UIAction variant="text" disabled={busy} onClick={() => { setCreating(false); setError(undefined); }}>{t("ביטול")}</UIAction>
                </div>
              </form>
            ) : (
              <UIAction onClick={() => { setCreating(true); setError(undefined); }}>
                <IconPlus className="h-4 w-4" />{t("מרחב עבודה חדש")}
              </UIAction>
            )}
          </div>
        ) : !error ? <p role="status">{t("טוענים…")}</p> : null}
        {error ? (
          <div role="alert" className="mt-4 space-y-2 text-sm text-[var(--ink-soft)]">
            <p>{errorText[error]}</p>
            {error === "load" ? <UIAction variant="secondary" onClick={() => { setError(undefined); setReload(value => value + 1); }}>{t("לנסות שוב")}</UIAction> : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
