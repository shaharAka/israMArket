"use client";

import { IdentityMark } from "@/components/landing-v2/IdentityMark";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { WhatsNewLink } from "@/components/language/WhatsNewLink";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, endpoints, isDemo } from "@/lib/api";
import { IconArrowRight, IconChart, IconHome, IconImage, IconCalendar, IconLogout, IconStore } from "@/lib/icons";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { BrandLink } from "@/components/BrandLink";
import { TrialWelcome } from "@/components/trial/Welcome";
import { SYSTEM_TONE } from "@/lib/tone";
import { UIAction } from "@/components/design/Controls";
import { productPaletteVariables, useDesignPalette } from "@/components/design/palette";
import { ToastHost } from "@/lib/ui";
import { signInUrl } from "@/lib/authNavigation";

type Tab = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  /** Every route that lives under this tab, so the tab stays lit on its sub-pages. */
  owns: string[];
};

/**
 * The whole app, in four tabs. The same four on the phone's bottom bar and the desktop
 * sidebar, so the owner learns one map.
 *
 * It used to be nine, and the phone only had room for five: the quarterly plan, the
 * decisions, the connections, the account and log-out were unreachable on mobile, and
 * the calendar and the weekly recommendation were in no menu at all. Everything that is
 * not a daily task is a business utility. The calendar belongs to the plan.
 */
export const TABS: Tab[] = [
  { href: "/dashboard", label: "השבוע", icon: IconHome, owns: ["/dashboard"] },
  {
    href: "/strategy",
    label: "התוכנית",
    icon: IconStore,
    // `/baseline`: the plan's starting numbers, the week-1 measurement step (Revision 8).
    owns: ["/strategy", "/plan", "/decisions", "/calendar", "/promotion", "/instagram", "/baseline"],
  },
  // The week-2 raw materials the posts are written from: photos, the products to feature
  // and the style check (Revision 8).
  { href: "/posts", label: "פוסטים", icon: IconImage, owns: ["/posts", "/assets", "/featured", "/voice"] },
  { href: "/performance", label: "תוצאות", icon: IconChart, owns: ["/performance", "/recommendations"] },
];

// `/security` is public (the landing links to it) and has no shell.
const BUSINESS_UTILITIES = ["/brand", "/integrations", "/account", "/billing", "/help", "/support", "/updates"];

function underRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** The tab a route belongs to, or null for routes outside the tabs (the wizard). */
export function tabFor(pathname: string): Tab | null {
  return TABS.find((tab) => tab.owns.some((route) => underRoute(pathname, route))) ?? null;
}

/**
 * Routes reachable before first-run is finished. The wizard's own routes must be here
 * or the redirect below would loop forever.
 *
 * `/decisions` is here too: the wizard links to it from its last step ("לשינוי התקציב"),
 * and gating it meant that link silently bounced the owner back to step 1 of the wizard
 * with no explanation. It renders a safe empty state when there is no business yet.
 *
 * `/strategy` too: a business built at /start lands there right after signup, before its
 * first month exists, because the plan it shows was stored at signup (Revision 5) and
 * the page builds the month itself.
 *
 * `/account` and `/billing` too: they belong to the account, not the business. Paying,
 * changing a password or deleting the account must not require finishing the wizard.
 */
const FIRST_RUN_ROUTES = ["/integrations", "/onboarding", "/start", "/login", "/signup", "/decisions", "/strategy", "/account", "/billing", "/help", "/support", "/updates"];

/** Log out from anywhere: the sidebar, the business hub, the wizard's top bar. */
export function useLogOut() {
  const router = useRouter();
  return useCallback(async () => {
    try {
      await endpoints.logout();
    } catch {
      // The session is being thrown away either way; a failed call must not trap the
      // owner inside the app.
    }
    router.replace("/");
  }, [router]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useCopy();
  const { palette } = useDesignPalette();
  const pathname = usePathname();
  const router = useRouter();
  const logOut = useLogOut();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [businessColor, setBusinessColor] = useState<string | undefined>();
  const [demo, setDemo] = useState(false);
  // True while the signed-in owner has not finished the wizard. The tabs lead to pages
  // that would only redirect back to it, so the shell hides them until it is done.
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  // Children must not render until we know whether this user finished first-run,
  // otherwise every screen fires its own requests and logs "no business configured"
  // before the redirect lands. Only the async *result* is state; whether this is a
  // first-run route is derived during render, so nothing is set synchronously in the
  // effect. In demo mode we do not gate at all.
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const onFirstRunRoute = FIRST_RUN_ROUTES.some((r) => pathname.startsWith(r));
  const ready = onFirstRunRoute || checkedOnboarding || demo;

  useEffect(() => {
    const timer = window.setTimeout(() => setDemo(isDemo()), 0);
    endpoints
      .me()
      .then((user) => setName(user.full_name))
      .catch((err: unknown) => {
        const login = signInUrl(window.location.pathname + window.location.search + window.location.hash, document.documentElement.lang);
        if (err instanceof ApiError && err.code === "account_suspended") router.replace(`${login}&suspended=1`);
        else if (err instanceof ApiError && err.status === 401) router.replace(login);
      });

    endpoints
      .business()
      .then((res) => {
        if (res.business?.name) setBusinessName(res.business.name);
        setBusinessLogo(res.business?.brand_language?.logo_url ?? null);
        setBusinessColor(res.business?.brand_language?.palette.find(swatch => swatch.role === "primary")?.hex);
        // A signed-in user who has not finished the wizard has no business yet, so
        // every other screen would fail with "no business configured" and show an
        // error. Send them back to finish instead. Skipped on the wizard's own routes
        // (AppShell wraps them too) or this would loop forever.
        // A business built at /start (it has the stored 3-month plan) is in the app from
        // signup on: its free month starts there, with or without the first month's
        // posts (Revision 7 B). Only the older wizard still gates on `onboarding_complete`.
        const incomplete = !res.business?.onboarding_complete && !res.business?.quarter_plan;
        setSetupIncomplete(incomplete);
        if (incomplete && !onFirstRunRoute) {
          // No business at all: the /start conversation builds it. A started one finishes
          // in /onboarding (budget and the first month).
          router.replace(res.business ? "/onboarding" : "/start");
          return; // stay un-ready: render nothing rather than the wrong screen
        }
        setCheckedOnboarding(true);
      })
      .catch(() => setCheckedOnboarding(true));
    return () => window.clearTimeout(timer);
  }, [router, pathname, onFirstRunRoute]);



  useEffect(() => {
    let active = true;
    function refreshBrand() { endpoints.business().then(result => { if (!active) return; setBusinessLogo(result.business?.brand_language?.logo_url ?? null); setBusinessColor(result.business?.brand_language?.palette.find(item => item.role === "primary")?.hex); }).catch(() => undefined); }
    window.addEventListener("isramarket-brand-change", refreshBrand);
    return () => { active=false; window.removeEventListener("isramarket-brand-change", refreshBrand); };
  }, []);

  // During the wizard there is nowhere to go yet: no tabs, no brand panel.
  const inSetup = pathname.startsWith("/onboarding") || (setupIncomplete && !demo);
  const activeTab = inSetup ? null : tabFor(pathname);
  // On a page under a tab (the calendar, the monthly plan, the account…) the phone's top
  // bar leads back to that tab. Mid-wizard, the only way back is the wizard itself.
  const back = inSetup
    ? pathname.startsWith("/onboarding") || pathname.startsWith("/strategy")
      ? null
      : { href: "/onboarding", label: "חזרה להגדרה" }
    : BUSINESS_UTILITIES.some(route => underRoute(pathname, route))
      ? { href: "/business", label: "העסק שלי" }
      : activeTab && pathname !== activeTab.href
      ? { href: activeTab.href, label: activeTab.label }
      : null;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)]">
        <p className="text-sm text-[color:var(--ink-soft)]"><Copy text="טוענים…" /></p>
      </div>
    );
  }

  return (
    <div style={demo && palette.id !== "blue-sun" ? productPaletteVariables(palette) : undefined} data-palette={demo ? palette.id : "blue-sun"} className="app-blue flex min-h-screen flex-col overflow-x-clip bg-[var(--canvas)] text-[color:var(--ink)] md:flex-row">
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-2 border-b border-[var(--rule)] bg-white pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] md:hidden">
        {back ? (
          <Link
            href={back.href}
            className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-md px-2 text-[15px] font-bold text-[color:var(--ink)] active:bg-[var(--primary-soft)]"
          >
            <IconArrowRight className="h-5 w-5 shrink-0 locale-arrow" />
            <span><Copy text={back.label} /></span>
          </Link>
        ) : (
          <Link href={inSetup ? "/onboarding" : "/dashboard"} className="flex min-h-11 min-w-0 items-center gap-2 px-2">
            {businessName ? <BusinessLogo src={businessLogo} name={businessName} color={businessColor} className="h-7 w-7 shrink-0" /> : <span className="product-wordmark !text-[16px]" dir="ltr"><IdentityMark direction="open" /><span className="sr-only">isramarket</span></span>}
            {/* The owner's business, not ours: "ישראמארקט / לחם …" truncated the one
                word they would recognise. */}
            <span className="min-w-0 truncate text-[15px] font-semibold text-[color:var(--ink)]">
              {businessName || t("ישראמארקט")}
            </span>
          </Link>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {demo ? (
            <span
              className="px-2 py-0.5 text-[11px] font-medium"
              style={{ color: SYSTEM_TONE.inkMuted }}
            >
              <Link href="/preview"><Copy text="דמו" /></Link>
            </span>
          ) : null}
          {inSetup ? (
            <button
              type="button"
              onClick={logOut}
              className="inline-flex min-h-11 cursor-pointer items-center px-2 text-sm text-[color:var(--ink-soft)] underline underline-offset-4"
            ><Copy text="יציאה" /></button>
          ) : back?.href === "/business" ? null : (
            <Link href="/business" className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-[13px] font-medium text-[color:var(--ink-soft)] hover:bg-[var(--soft)]"><Copy text="העסק שלי" /></Link>
          )}
        </div>
      </header>

      <aside
        className="sticky top-0 z-40 hidden h-screen w-[260px] shrink-0 flex-col border-e border-[var(--rule)] bg-[var(--paper)] md:flex"
      >
        <div>
          {/* Identity gets the whole first row. The brand trigger used to share it and
              refused to shrink, which crushed the logo to a 7px column of wrapping text
              that the trigger then sat on top of. */}
          <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-2">
            <Link href={inSetup ? "/onboarding" : "/dashboard"} className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <span className="product-wordmark block" dir="ltr"><IdentityMark direction="open" /><span className="sr-only">isramarket</span></span>
                <span className="block text-xs text-[color:var(--ink-muted)]"><Copy text="שיווק לעסקים קטנים" /></span>
              </div>
            </Link>
            {demo ? (
              <span
                className="shrink-0 px-2 py-0.5 text-[11px] font-medium"
                style={{ color: SYSTEM_TONE.inkMuted }}
              ><Copy text="דמו" /></span>
            ) : null}
          </div>

        </div>

        <nav aria-label={t("ניווט ראשי")} className="flex-1 overflow-y-auto px-3 py-5">
          {inSetup ? null : (
            <div className="space-y-1">
              {TABS.map(tab => <div key={tab.href}><NavLink tab={tab} active={activeTab?.href === tab.href} />{tab.href === "/strategy" && activeTab?.href === "/strategy" && <Link href="/calendar" aria-current={pathname === "/calendar" ? "page" : undefined} className="ms-10 flex min-h-10 items-center gap-2 rounded-lg px-2 text-[13px] text-[color:var(--ink-muted)] hover:bg-[var(--soft)] hover:text-[color:var(--ink)] aria-[current=page]:text-[color:var(--primary)]"><IconCalendar className="h-4 w-4" /><Copy text="לוח התוכנית" /></Link>}</div>)}
            </div>
          )}
        </nav>

        {!inSetup && <div className="px-3 pb-1"><BrandLink /></div>}
        <div className="px-5"><WhatsNewLink className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--primary)] hover:underline aria-[current=page]:text-[var(--primary)]" /></div>

        <div className="m-3 mt-1 flex items-center justify-between gap-2 rounded-2xl bg-[var(--soft)] p-2">
          <Link
            href={inSetup ? "/onboarding" : "/business"}
            aria-current={pathname === "/business" ? "page" : undefined}
            className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-1.5 transition-colors hover:bg-[var(--paper)]"
          >
            <BusinessLogo src={businessLogo} name={businessName || name || "העסק שלי"} color={businessColor} className="h-8 w-8 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-[color:var(--ink)]">{name || t("החשבון שלי")}</span>
              <span className="block truncate text-xs text-[color:var(--ink-muted)]">{businessName || t("העסק שלי")}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={logOut}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs text-[color:var(--ink-muted)] transition-colors hover:bg-[var(--paper)] hover:text-[color:var(--ink)]"
          >
            <IconLogout className="h-4 w-4" /><Copy text="יציאה" /></button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          key={pathname}
          className={`rise app-main mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 md:px-10 md:py-10 ${
            inSetup ? "pb-10" : "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8"
          }`}
        >
          {children}
        </main>
      </div>

      {inSetup ? null : (
        <nav
          aria-label={t("ניווט ראשי")}
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[var(--rule)] bg-[var(--paper)]/95 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur-md md:hidden"
        >
          {TABS.map((tab) => {
            const active = activeTab?.href === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`nav-item relative flex min-h-[60px] flex-col items-center justify-center gap-1 whitespace-nowrap py-1.5 text-[11.5px] ${
                  active ? "font-semibold text-[color:var(--primary)]" : "font-medium text-[color:var(--ink-muted)]"
                }`}
              >
                <span
                  className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${active ? "bg-[var(--primary-soft)]" : ""}`}
                >
                  <Icon className="nav-icon h-[22px] w-[22px]" />
                </span>
                <span><Copy text={tab.label} /></span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* The free month's first-entry welcome: once per account, on whichever page the
          owner first lands. */}
      {inSetup ? null : <TrialWelcome />}
      <ToastHost />
    </div>
  );
}

/** Sidebar row. */
function NavLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`nav-item relative flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition-colors ${
        active
          ? "bg-[var(--primary-soft)] font-semibold text-[color:var(--primary)]"
          : "text-[color:var(--ink-soft)] hover:bg-[var(--soft)] hover:text-[color:var(--ink)]"
      }`}
    >
      <Icon className="nav-icon h-5 w-5" />
      <span><Copy text={tab.label} /></span>
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-[28px] font-medium leading-tight text-[color:var(--ink)] sm:text-[32px]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[color:var(--ink-soft)]">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2 shrink-0">{action}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`drawn-card p-5 sm:p-7 ${className}`}>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  disabled,
  tone = "primary",
  size = "md",
  variant,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  tone?: "primary" | "secondary" | "ghost" | "success" | "danger";
  size?: "sm" | "md" | "lg";
  variant?: "solid" | "outline";
  className?: string;
}) {
  const sizeMap = { sm: "!px-3 !text-xs", md: "!px-4 !text-sm", lg: "!px-5 !text-base" };
  const appearance = variant === "outline" || tone === "secondary" || tone === "success" ? "secondary" : tone === "ghost" ? "text" : tone === "danger" ? "danger" : "primary";
  return <UIAction type={type} onClick={onClick} disabled={disabled} variant={appearance} className={`${sizeMap[size]} ${className}`}>{children}</UIAction>;
}

export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "slate" | "blue" | "amber" | "emerald" | "purple" | "rose";
  className?: string;
}) {
  const map = {
    slate: "bg-[var(--soft)] text-[color:var(--ink-soft)]",
    blue: "bg-[var(--primary-soft)] text-[color:var(--primary)]",
    amber: "bg-[var(--sand)] text-[var(--sand-dark)]",
    emerald: "bg-[var(--good-soft)] text-[var(--good)]",
    purple: "bg-[var(--soft)] text-[color:var(--ink)]",
    rose: "bg-[var(--danger-soft)] text-[var(--danger)]",
  };
  return (
    <span className={`label-mark ${map[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--danger)]">
      <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" />
      <span>{message}</span>
    </div>
  );
}
