"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CARD, FIELD, LABEL } from "@/components/account/setupStyles";
import { SetupNotice } from "@/components/account/SetupNotice";
import { SegmentedControl, UIAction, UIDialog } from "@/components/design/Controls";
import { GoogleButton } from "@/components/GoogleButton";
import {
  ACTION_LABEL,
  CONNECTION_LABEL,
  LIFECYCLE_LABEL,
  STAGE_LABEL,
  STATUS_FILTERS,
  admin,
  billingLabel,
  daysLabel,
  formatDate,
  formatDateTime,
  formatMonth,
  formatUsd,
  timeAgo,
  type AccountDetail,
  type AccountFilters,
  type AccountRow,
  type AuditEntry,
  type Connection,
  type ConnectionState,
  type Lifecycle,
  type Stage,
} from "@/lib/admin";
import { ApiError, endpoints } from "@/lib/api";
import { BrandMark, IconArrowRight, IconCopy } from "@/lib/icons";
import { ToastHost, copyText, toast } from "@/lib/ui";
import { SupportQueue } from "@/components/support/SupportQueue";

type Gate = "loading" | "ok" | "signin" | "forbidden";
type Action = "reset" | "signout" | "suspend" | "reactivate" | "exempt" | "delete";

const STAGES: Stage[] = ["signup", "business", "plan", "approved", "published", "measured"];
const LIFECYCLES: Lifecycle[] = ["needs_owner", "ready", "approved", "published", "measured"];

const DOT: Record<ConnectionState, string> = {
  none: "border border-[var(--ink-faint)] bg-transparent",
  connected: "bg-[var(--primary)]",
  usable: "bg-[var(--good)]",
  attention: "bg-[var(--sun)]",
};

const SECTION_TITLE = "text-[15px] font-bold leading-6 text-[color:var(--ink)]";
const META = "text-[13px] leading-5 text-[color:var(--ink-muted)]";

/**
 * The owner's backoffice (api/app/routers/admin.py). Linked only from an admin's own
 * account menu (/account); every call is checked on the server, which answers 401/403 to
 * anyone else, so this page shows nothing until the server says yes.
 */
export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [gateMessage, setGateMessage] = useState("");
  const [tab, setTab] = useState<"accounts" | "audit" | "support">("accounts");
  const [filters, setFilters] = useState<Required<AccountFilters>>({ q: "", stage: "", status: "", sort: "last_active" });
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [now, setNow] = useState(0);
  const [myId, setMyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleGateError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) setGate("signin");
    else if (err instanceof ApiError && err.status === 403) {
      setGate("forbidden");
      setGateMessage(err.message);
    }
  }, []);

  // The list: debounced while typing a search, at once for everything else.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      admin
        .accounts(filters)
        .then((result) => {
          if (!active) return;
          setNow(Date.now());
          setRows(result.accounts);
          setGate("ok");
        })
        .catch((err: unknown) => active && handleGateError(err));
    }, filters.q ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, reloadKey, handleGateError]);

  useEffect(() => {
    endpoints
      .me()
      .then((user) => setMyId(user.id))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selected === null) return;
    let active = true;
    admin
      .account(selected)
      .then((result) => {
        if (!active) return;
        setNow(Date.now());
        setDetail(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        handleGateError(err);
        setDetailError(err instanceof Error ? err.message : "לא הצלחנו לטעון את החשבון.");
      });
    return () => {
      active = false;
    };
  }, [selected, handleGateError]);

  function open(id: number) {
    setDetail(null);
    setDetailError("");
    setSelected(id);
  }

  function close() {
    setSelected(null);
    setDetail(null);
  }

  function changed(next: AccountDetail | null) {
    if (next) setDetail(next);
    else close();
    setReloadKey((key) => key + 1);
  }

  if (gate === "loading") {
    return (
      <Shell>
        <p role="status" className="py-16 text-center text-[15px] text-[color:var(--ink-soft)]">
          טוענים…
        </p>
      </Shell>
    );
  }

  if (gate !== "ok") {
    return (
      <Shell>
        <div className={`${CARD} mx-auto mt-6 max-w-[480px] space-y-5 p-6 sm:p-8`}>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[color:var(--ink)]">ניהול</h1>
          <p className="text-[15px] leading-7 text-[color:var(--ink-soft)]">
            {gate === "signin"
              ? "צריך להתחבר. הניהול נפתח רק אחרי כניסה עם Google."
              : gateMessage || "העמוד הזה פתוח רק למנהלי ישראמארקט, אחרי כניסה עם Google."}
          </p>
          <GoogleButton next="/admin" back="/login" />
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--primary)] hover:underline">
            לחזור לאפליקציה
          </Link>
        </div>
      </Shell>
    );
  }

  const showDetail = selected !== null;

  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">ניהול החשבונות</h1>
        <p className="text-[15px] text-[color:var(--ink-soft)]">
          {rows ? `${rows.length} חשבונות ברשימה` : ""}
          {rows ? " · עלות AI היא הערכה לפי מחירון, בדולרים" : ""}
        </p>
      </div>

      <div className="mb-6">
        <SegmentedControl
          label="תצוגה"
          value={tab}
          onChange={(value) => setTab(value as "accounts" | "audit" | "support")}
          options={[
            { value: "accounts", label: "חשבונות" },
            { value: "audit", label: "יומן פעולות" },
            { value: "support", label: "פניות תמיכה" },
          ]}
        />
      </div>

      {tab === "support" ? <SupportQueue /> : tab === "audit" ? (
        <AuditLog />
      ) : (
        <>
          <Filters filters={filters} onChange={setFilters} hidden={showDetail} />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
            <section aria-label="החשבונות" className={showDetail ? "hidden lg:block" : ""}>
              <AccountList rows={rows} now={now} selected={selected} onOpen={open} />
            </section>
            <section
              aria-label="פרטי החשבון"
              className={`${showDetail ? "" : "hidden lg:block"} lg:sticky lg:top-[88px] lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:rounded-[16px]`}
            >
              {selected === null ? (
                <div className={`${CARD} px-6 py-16 text-center text-[15px] text-[color:var(--ink-soft)]`}>
                  בחרו חשבון מהרשימה כדי לראות את הפרטים ואת הפעולות.
                </div>
              ) : detail === null ? (
                <div className={`${CARD} p-6`}>
                  <BackToList onClick={close} />
                  {detailError ? (
                    <SetupNotice tone="error" title={detailError} />
                  ) : (
                    <p role="status" className="text-[15px] text-[color:var(--ink-soft)]">
                      טוענים את החשבון…
                    </p>
                  )}
                </div>
              ) : (
                <AccountPanel detail={detail} now={now} isMe={detail.id === myId} onBack={close} onChanged={changed} />
              )}
            </section>
          </div>
        </>
      )}
      <ToastHost />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-blue min-h-screen overflow-x-clip bg-[var(--canvas)] text-[color:var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[var(--paper)]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-[1360px] items-center justify-between gap-3 px-4 md:px-8">
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2.5">
            <BrandMark className="h-8 w-8 shrink-0 text-[color:var(--primary)]" />
            <span className="text-[17px] font-bold tracking-tight">ישראמארקט</span>
            <span className="rounded-full bg-[var(--soft)] px-2.5 py-0.5 text-[12px] font-semibold text-[color:var(--ink-muted)]">ניהול</span>
          </Link>
          <Link
            href="/account"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium text-[color:var(--ink-soft)] hover:bg-[var(--soft)] hover:text-[color:var(--ink)]"
          >
            <IconArrowRight className="h-4 w-4" />
            החשבון שלי
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1360px] px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}

function BackToList({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] lg:hidden"
    >
      <IconArrowRight className="h-4 w-4" />
      חזרה לרשימה
    </button>
  );
}

// --- filters and list -----------------------------------------------------------------------

function Filters({
  filters,
  onChange,
  hidden,
}: {
  filters: Required<AccountFilters>;
  onChange: (next: Required<AccountFilters>) => void;
  hidden: boolean;
}) {
  const set = (key: keyof AccountFilters, value: string) => onChange({ ...filters, [key]: value });
  return (
    <div className={`mb-5 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] ${hidden ? "hidden lg:grid" : ""}`}>
      <label className="col-span-2 block lg:col-span-1">
        <span className="sr-only">חיפוש</span>
        <input
          type="search"
          value={filters.q}
          onChange={(event) => set("q", event.target.value)}
          placeholder="חיפוש לפי אימייל, שם או עסק"
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className="sr-only">שלב</span>
        <select value={filters.stage} onChange={(event) => set("stage", event.target.value)} className={FIELD}>
          <option value="">כל השלבים</option>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">מצב</span>
        <select value={filters.status} onChange={(event) => set("status", event.target.value)} className={FIELD}>
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 block lg:col-span-1">
        <span className="sr-only">סדר</span>
        <select value={filters.sort} onChange={(event) => set("sort", event.target.value)} className={FIELD}>
          <option value="last_active">לפי פעילות אחרונה</option>
          <option value="created">חדשים קודם</option>
        </select>
      </label>
    </div>
  );
}

function AccountList({
  rows,
  now,
  selected,
  onOpen,
}: {
  rows: AccountRow[] | null;
  now: number;
  selected: number | null;
  onOpen: (id: number) => void;
}) {
  if (rows === null) return <p className="text-[15px] text-[color:var(--ink-soft)]">טוענים…</p>;
  if (rows.length === 0) {
    return <div className={`${CARD} px-6 py-12 text-center text-[15px] text-[color:var(--ink-soft)]`}>אין חשבונות שמתאימים לסינון.</div>;
  }
  return (
    <ul className={`${CARD} divide-y divide-[var(--rule)] overflow-hidden`}>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onOpen(row.id)}
            aria-current={selected === row.id ? "true" : undefined}
            className="grid w-full gap-x-4 gap-y-1.5 px-4 py-3.5 text-start transition-colors duration-200 hover:bg-[var(--soft)] aria-[current=true]:bg-[var(--primary-soft)] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"
          >
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[15px] font-semibold text-[color:var(--ink)]">
                  {row.business?.name || row.full_name || row.email}
                </span>
                {row.suspended ? <Pill tone="danger">מושהה</Pill> : null}
                {row.is_admin ? <Pill>מנהל</Pill> : null}
              </span>
              <span dir="ltr" className="block truncate text-end text-[13px] text-[color:var(--ink-muted)]">
                {row.email}
              </span>
            </span>
            <span className="text-[13px] font-semibold text-[color:var(--ink)] sm:text-end">
              {STAGE_LABEL[row.stage.key]}
              {row.stage.days_in_stage !== null ? (
                <span className="font-normal text-[color:var(--ink-muted)]"> · {daysLabel(row.stage.days_in_stage)}</span>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[color:var(--ink-muted)]">
              <span>פעילות: {timeAgo(row.last_seen_at, now)}</span>
              <ConnectionDot name="גוגל" connection={row.connections.google} />
              <ConnectionDot name="פייסבוק" connection={row.connections.meta} />
            </span>
            <span className="flex items-center gap-3 text-[12.5px] text-[color:var(--ink-muted)] sm:justify-end">
              <span>{billingLabel(row.billing)}</span>
              <span dir="ltr" className="font-semibold tabular-nums text-[color:var(--ink)]">
                {formatUsd(row.cost_this_month_usd)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConnectionDot({ name, connection }: { name: string; connection: Connection }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${name}: ${CONNECTION_LABEL[connection.state]}`}>
      <span>{name}</span>
      <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[connection.state]}`} />
      <span className="sr-only">{CONNECTION_LABEL[connection.state]}</span>
    </span>
  );
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "good" }) {
  const map = {
    neutral: "bg-[var(--soft)] text-[color:var(--ink-soft)]",
    danger: "bg-[var(--danger-soft)] text-[color:var(--danger)]",
    good: "bg-[var(--good-soft)] text-[color:var(--good)]",
  };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${map[tone]}`}>{children}</span>;
}

// --- the account ------------------------------------------------------------------------------

function AccountPanel({
  detail,
  now,
  isMe,
  onBack,
  onChanged,
}: {
  detail: AccountDetail;
  now: number;
  isMe: boolean;
  onBack: () => void;
  onChanged: (next: AccountDetail | null) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const business = detail.businesses[0];
  const googleOnly = detail.google_linked && !detail.has_password;
  const signIn = [detail.google_linked ? "Google" : "", detail.has_password ? "סיסמה" : ""].filter(Boolean).join(" + ");

  return (
    <article className={`${CARD} p-5 sm:p-6`}>
      <BackToList onClick={onBack} />
      <header className="flex flex-col gap-1.5 border-b border-[var(--rule)] pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[20px] font-bold leading-tight tracking-tight text-[color:var(--ink)]">
            {detail.full_name || business?.name || "בלי שם"}
          </h2>
          {detail.suspended ? <Pill tone="danger">מושהה</Pill> : null}
          {detail.billing.exempt ? <Pill tone="good">חשבון חינם</Pill> : null}
          {detail.is_admin ? <Pill>מנהל</Pill> : null}
        </div>
        <p dir="ltr" className="text-end text-[14px] text-[color:var(--ink-soft)]">
          {detail.email}
        </p>
        {detail.suspended ? (
          <p className="text-[13px] text-[color:var(--danger)]">
            הושהה ב-{formatDate(detail.suspended_at)}
            {detail.suspended_reason ? `: ${detail.suspended_reason}` : ""}
          </p>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-[var(--rule)] py-5">
        <Fact label="נפתח">{formatDate(detail.created_at)}</Fact>
        <Fact label="פעילות אחרונה">{timeAgo(detail.last_seen_at, now)}</Fact>
        <Fact label="כניסה">{googleOnly ? "רק Google" : signIn || "אין"}</Fact>
        <Fact label="מנוי">{billingLabel(detail.billing)}</Fact>
        <Fact label="העסק" wide>
          {business ? (
            <>
              <span className="font-semibold">{business.name || "בלי שם"}</span>
              {business.website_url ? (
                <a
                  href={business.website_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  dir="ltr"
                  className="block truncate text-end text-[13px] text-[color:var(--primary)] hover:underline"
                >
                  {business.website_url.replace(/^https?:\/\//, "")}
                </a>
              ) : null}
              {detail.businesses.length > 1 ? <span className={META}> ועוד {detail.businesses.length - 1} עסקים</span> : null}
            </>
          ) : (
            "עוד אין עסק"
          )}
        </Fact>
      </dl>

      <Section title="איפה הם בדרך">
        <ol className="space-y-2.5">
          {detail.timeline.map((step) => {
            const current = step.key === detail.stage.key;
            return (
              <li key={step.key} className="flex items-center gap-3 text-[14px]">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    current ? "bg-[var(--sun)] shadow-[0_0_0_3px_var(--sand)]" : step.reached ? "bg-[var(--good)]" : "border border-[var(--ink-faint)]"
                  }`}
                />
                <span className={`flex-1 ${step.reached ? "text-[color:var(--ink)]" : "text-[color:var(--ink-muted)]"} ${current ? "font-semibold" : ""}`}>
                  {STAGE_LABEL[step.key]}
                  {current && detail.stage.days_in_stage !== null ? (
                    <span className="font-normal text-[color:var(--ink-muted)]"> · כבר {daysLabel(detail.stage.days_in_stage)}</span>
                  ) : null}
                </span>
                <span className={META}>{step.reached ? formatDate(step.reached_at) || "בלי תאריך" : ""}</span>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="חיבורים">
        <ul className="space-y-2.5">
          {(
            [
              ["גוגל (נתוני האתר)", detail.connections.google],
              ["פייסבוק ואינסטגרם", detail.connections.meta],
            ] as const
          ).map(([name, connection]) => (
            <li key={name} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[14px]">
              <span className="flex-1 text-[color:var(--ink)]">{name}</span>
              <span className="inline-flex items-center gap-2 font-semibold">
                {CONNECTION_LABEL[connection.state]}
                <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[connection.state]}`} />
              </span>
              {connection.checked_at ? <span className={`basis-full ${META}`}>נבדק {formatDateTime(connection.checked_at)}</span> : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`פוסטים${detail.posts.months ? ` · ${detail.posts.months === 1 ? "חודש אחד" : `${detail.posts.months} חודשים`}` : ""}`}>
        {detail.posts.total ? (
          <ul className="flex flex-wrap gap-2">
            {LIFECYCLES.map((key) => (
              <li key={key} className="rounded-lg bg-[var(--soft)] px-3 py-1.5 text-[13px] text-[color:var(--ink-soft)]">
                <span className="font-bold tabular-nums text-[color:var(--ink)]">{detail.posts.by_lifecycle[key] ?? 0}</span> {LIFECYCLE_LABEL[key]}
              </li>
            ))}
          </ul>
        ) : (
          <p className={META}>עוד אין פוסטים.</p>
        )}
      </Section>

      <Section title="עלות AI (הערכה, בדולרים)">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-start text-[12px] text-[color:var(--ink-muted)]">
              <th className="pb-2 text-start font-medium">חודש</th>
              <th className="pb-2 text-end font-medium">תמונות</th>
              <th className="pb-2 text-end font-medium">טקסט</th>
              <th className="pb-2 text-end font-medium">סה״כ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {detail.costs.map((month) => (
              <tr key={month.month}>
                <td className="py-2 text-[color:var(--ink)]">{formatMonth(month.month)}</td>
                <td dir="ltr" className="py-2 text-start tabular-nums text-[color:var(--ink-soft)]" title={`${month.image_calls} תמונות`}>
                  {formatUsd(month.images_usd)}
                </td>
                <td dir="ltr" className="py-2 text-start tabular-nums text-[color:var(--ink-soft)]" title={`${month.model_calls} קריאות`}>
                  {formatUsd(month.models_usd)}
                </td>
                <td dir="ltr" className="py-2 text-start font-semibold tabular-nums text-[color:var(--ink)]">
                  {formatUsd(month.total_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="פעולות">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <UIAction variant="secondary" onClick={() => setAction("reset")}>
            קישור לסיסמה חדשה
          </UIAction>
          <UIAction variant="secondary" onClick={() => setAction("signout")}>
            לנתק מכל המכשירים
          </UIAction>
          <UIAction variant="secondary" onClick={() => setAction("exempt")}>
            {detail.billing.exempt ? "לבטל את החשבון החינמי" : "לסמן כחשבון חינם"}
          </UIAction>
          {isMe ? null : detail.suspended ? (
            <UIAction variant="secondary" onClick={() => setAction("reactivate")}>
              להחזיר לפעילות
            </UIAction>
          ) : (
            <UIAction variant="secondary" onClick={() => setAction("suspend")}>
              להשהות את החשבון
            </UIAction>
          )}
          {isMe ? null : (
            <UIAction variant="danger" onClick={() => setAction("delete")} className="sm:col-span-2">
              למחוק את החשבון
            </UIAction>
          )}
        </div>
        {detail.reset_link_expires_at ? (
          <p className={`mt-3 ${META}`}>יש קישור לסיסמה חדשה שעוד לא נוצל, בתוקף עד {formatDateTime(detail.reset_link_expires_at)}.</p>
        ) : null}
      </Section>

      {detail.audit.length ? (
        <Section title="פעולות אחרונות בחשבון">
          <ul className="space-y-2">
            {detail.audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-x-3 text-[13.5px]">
                <span className="text-[color:var(--ink)]">{actionText(entry)}</span>
                <span className={META}>{formatDateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {action ? (
        <ActionDialog action={action} detail={detail} googleOnly={googleOnly} onClose={() => setAction(null)} onChanged={onChanged} />
      ) : null}
    </article>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className={META}>{label}</dt>
      <dd className="mt-0.5 text-[14.5px] text-[color:var(--ink)]">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[var(--rule)] py-5 last:border-b-0 last:pb-0">
      <h3 className={`mb-3 ${SECTION_TITLE}`}>{title}</h3>
      {children}
    </section>
  );
}

// --- confirmations ------------------------------------------------------------------------------

function ActionDialog({
  action,
  detail,
  googleOnly,
  onClose,
  onChanged,
}: {
  action: Action;
  detail: AccountDetail;
  googleOnly: boolean;
  onClose: () => void;
  onChanged: (next: AccountDetail | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const email = detail.email;

  const copy = useMemo(() => {
    switch (action) {
      case "reset":
        return {
          title: "קישור לסיסמה חדשה",
          description: `ניצור קישור אחד ל-${email}. הוא עובד פעם אחת, במשך 24 שעות, וכל קישור קודם שלא נוצל יפסיק לעבוד. שלחו אותו לבעלי החשבון, למשל בוואטסאפ.${
            googleOnly ? " החשבון נפתח עם Google: הקישור יאפשר לקבוע לו גם סיסמה." : ""
          }`,
          confirm: "ליצור קישור",
        };
      case "signout":
        return {
          title: "לנתק מכל המכשירים",
          description: `כל מכשיר שמחובר לחשבון של ${email} יתנתק. כדי להמשיך, יצטרכו להתחבר שוב.`,
          confirm: "לנתק",
        };
      case "suspend":
        return {
          title: "להשהות את החשבון",
          description: `${email} לא יוכלו להיכנס או להשתמש בחשבון, וכל המכשירים יתנתקו. המידע נשמר, ואפשר להחזיר את החשבון בכל רגע.`,
          confirm: "להשהות",
        };
      case "reactivate":
        return {
          title: "להחזיר את החשבון לפעילות",
          description: `${email} יוכלו להיכנס שוב, עם סיסמה או עם Google.`,
          confirm: "להחזיר לפעילות",
        };
      case "exempt":
        return detail.billing.exempt
          ? {
              title: "לבטל את החשבון החינמי",
              description: "מעכשיו החשבון חוזר למסלול הרגיל: החודש החינמי, ואחריו מנוי.",
              confirm: "לבטל",
            }
          : {
              title: "לסמן כחשבון חינם",
              description: "החשבון לא יתבקש לשלם. גם כשהחודש החינמי נגמר, הכול נשאר פתוח.",
              confirm: "לסמן כחינם",
            };
      case "delete":
        return {
          title: "למחוק את החשבון",
          description: `נמחק את החשבון של ${email}, את העסק, את כל המידע ואת כל הקבצים. מנוי בפייפאל מתבטל. אי אפשר לבטל את זה.`,
          confirm: "למחוק לתמיד",
        };
    }
  }, [action, email, googleOnly, detail.billing.exempt]);

  const deleteReady = typed.trim().toLowerCase() === email.toLowerCase();

  async function run() {
    setPending(true);
    setError("");
    try {
      switch (action) {
        case "reset": {
          const result = await admin.resetLink(detail.id);
          setLink(result);
          setPending(false);
          onChanged(await admin.account(detail.id));
          return;
        }
        case "signout":
          onChanged(await admin.signOut(detail.id));
          toast("כל המכשירים נותקו");
          break;
        case "suspend":
          onChanged(await admin.suspend(detail.id, reason.trim()));
          toast("החשבון הושהה");
          break;
        case "reactivate":
          onChanged(await admin.reactivate(detail.id));
          toast("החשבון חזר לפעילות");
          break;
        case "exempt":
          onChanged(await admin.setExempt(detail.id, !detail.billing.exempt));
          toast(detail.billing.exempt ? "החשבון חזר למסלול הרגיל" : "החשבון סומן כחשבון חינם");
          break;
        case "delete":
          await admin.remove(detail.id, typed);
          onChanged(null);
          toast("החשבון נמחק");
          break;
      }
      onClose();
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "לא הצלחנו. נסו שוב.");
    }
  }

  return (
    <UIDialog open onClose={onClose} title={copy.title} description={link ? undefined : copy.description}>
      {link ? (
        <div className="space-y-4">
          <SetupNotice tone="attention" title="הקישור מוצג רק עכשיו">
            אחרי שתסגרו את החלון לא נוכל להציג אותו שוב. אפשר ליצור קישור חדש בכל רגע.
          </SetupNotice>
          <label className="block">
            <span className={LABEL}>הקישור</span>
            <input
              readOnly
              dir="ltr"
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
              className={`${FIELD} text-left font-mono !text-[13px]`}
            />
          </label>
          <p className={META}>בתוקף עד {formatDateTime(link.expires_at)}, לשימוש אחד.</p>
          <div className="flex sm:justify-end">
            <UIAction
              className="w-full sm:w-auto" onClick={() => copyText(link.url, "הקישור הועתק").catch(() => toast("לא הצלחנו להעתיק. סמנו את הקישור והעתיקו ידנית."))}>
              <IconCopy className="h-4 w-4" />
              להעתיק את הקישור
            </UIAction>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {action === "suspend" ? (
            <label className="block">
              <span className={LABEL}>סיבה (לא חובה, רק לכם)</span>
              <input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} className={FIELD} />
            </label>
          ) : null}
          {action === "delete" ? (
            <label className="block">
              <span className={LABEL}>כדי לאשר, הקלידו את האימייל של החשבון</span>
              <input
                type="email"
                dir="ltr"
                autoComplete="off"
                placeholder={email}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                className={`${FIELD} text-left`}
              />
            </label>
          ) : null}
          {error ? <SetupNotice tone="error" title={error} /> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UIAction variant="text" onClick={onClose} disabled={pending}>
              לא עכשיו
            </UIAction>
            {action === "delete" || action === "suspend" ? (
              <button
                type="button"
                onClick={run}
                disabled={pending || (action === "delete" && !deleteReady)}
                className="inline-flex min-h-[46px] items-center justify-center rounded-[12px] bg-[var(--danger)] px-5 text-[14.5px] font-semibold text-[color:var(--paper)] transition-[filter,opacity] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending ? "רגע…" : copy.confirm}
              </button>
            ) : (
              <UIAction onClick={run} busy={pending}>
                {copy.confirm}
              </UIAction>
            )}
          </div>
        </div>
      )}
    </UIDialog>
  );
}

// --- the audit log -----------------------------------------------------------------------------

function actionText(entry: AuditEntry): string {
  const label = ACTION_LABEL[entry.action] ?? entry.action;
  if (entry.action === "billing_exempt") return `${label}: ${entry.details.exempt ? "הופעל" : "בוטל"}`;
  if (entry.action === "suspend" && entry.details.with_reason) return `${label}, עם סיבה`;
  if (entry.action === "reset_link" && entry.details.google_only) return `${label} (חשבון Google)`;
  return label;
}

function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    admin
      .audit()
      .then((result) => {
        if (!active) return;
        setEntries(result.entries);
        setMore(result.entries.length >= 100);
      })
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את היומן."));
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    const last = entries?.at(-1);
    if (!last) return;
    try {
      const result = await admin.audit(last.id);
      setEntries([...(entries ?? []), ...result.entries]);
      setMore(result.entries.length >= 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את היומן.");
    }
  }

  if (error) return <SetupNotice tone="error" title={error} />;
  if (entries === null) return <p className="text-[15px] text-[color:var(--ink-soft)]">טוענים…</p>;
  if (!entries.length) {
    return <div className={`${CARD} px-6 py-12 text-center text-[15px] text-[color:var(--ink-soft)]`}>עוד לא נעשו פעולות.</div>;
  }
  return (
    <div className="max-w-[880px]">
      <ul className={`${CARD} divide-y divide-[var(--rule)] overflow-hidden`}>
        {entries.map((entry) => (
          <li key={entry.id} className="grid gap-x-4 gap-y-1 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
            <span className="text-[15px] font-semibold text-[color:var(--ink)]">{actionText(entry)}</span>
            <span className={`${META} sm:text-end`}>{formatDateTime(entry.created_at)}</span>
            <span className="min-w-0 text-[13.5px] text-[color:var(--ink-soft)]">
              {entry.target_email ? (
                <span dir="ltr">{entry.target_email}</span>
              ) : entry.target_user_id ? (
                `חשבון שנמחק (מספר ${entry.target_user_id})`
              ) : (
                ""
              )}
            </span>
            <span className={`${META} min-w-0 truncate sm:text-end`}>
              על ידי <span dir="ltr">{entry.admin_email ?? `#${entry.admin_user_id}`}</span>
            </span>
          </li>
        ))}
      </ul>
      {more ? (
        <div className="mt-4">
          <UIAction variant="secondary" onClick={loadMore}>
            עוד פעולות
          </UIAction>
        </div>
      ) : null}
    </div>
  );
}
