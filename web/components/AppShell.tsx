"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, endpoints, isDemo } from "@/lib/api";
import { BrandMark, IconArrowRight, IconChart, IconHome, IconImage, IconLogout, IconStore } from "@/lib/icons";
import { BrandPicker } from "@/components/BrandPicker";
import { ACCENT } from "@/lib/sections";
import { SYSTEM_TONE } from "@/lib/tone";
import { ToastHost } from "@/lib/ui";

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
 * not a daily task now lives under "העסק", a plain list of rows (app/business).
 */
export const TABS: Tab[] = [
  { href: "/dashboard", label: "היום", icon: IconHome, owns: ["/dashboard"] },
  { href: "/posts", label: "פוסטים", icon: IconImage, owns: ["/posts", "/calendar"] },
  { href: "/performance", label: "תוצאות", icon: IconChart, owns: ["/performance", "/recommendations"] },
  {
    href: "/business",
    label: "העסק",
    icon: IconStore,
    owns: ["/business", "/strategy", "/plan", "/decisions", "/assets", "/promotion", "/integrations", "/account"],
  },
];

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
 */
const FIRST_RUN_ROUTES = ["/onboarding", "/login", "/signup", "/decisions"];

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
  const pathname = usePathname();
  const router = useRouter();
  const logOut = useLogOut();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
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
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      });

    endpoints
      .business()
      .then((res) => {
        if (res.business?.name) setBusinessName(res.business.name);
        // A signed-in user who has not finished the wizard has no business yet, so
        // every other screen would fail with "no business configured" and show an
        // error. Send them back to finish instead. Skipped on the wizard's own routes
        // (AppShell wraps them too) or this would loop forever.
        const incomplete = !res.business?.onboarding_complete;
        setSetupIncomplete(incomplete);
        if (incomplete && !onFirstRunRoute) {
          router.replace("/onboarding");
          return; // stay un-ready: render nothing rather than the wrong screen
        }
        setCheckedOnboarding(true);
      })
      .catch(() => setCheckedOnboarding(true));
    return () => window.clearTimeout(timer);
  }, [router, pathname, onFirstRunRoute]);

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  // During the wizard there is nowhere to go yet: no tabs, no brand panel.
  const inSetup = pathname.startsWith("/onboarding") || (setupIncomplete && !demo);
  const activeTab = inSetup ? null : tabFor(pathname);
  // On a page under a tab (the calendar, the monthly plan, the account…) the phone's top
  // bar leads back to that tab. Mid-wizard, the only way back is the wizard itself.
  const back = inSetup
    ? pathname.startsWith("/onboarding")
      ? null
      : { href: "/onboarding", label: "חזרה להגדרה" }
    : activeTab && pathname !== activeTab.href
      ? { href: activeTab.href, label: activeTab.label }
      : null;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f7f4]">
        <p className="text-sm text-[#63665e]">טוען…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#1e201d] flex flex-col md:flex-row">
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-2 border-b border-[#deddd8] bg-white pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] md:hidden">
        {back ? (
          <Link
            href={back.href}
            className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-md px-2 text-[15px] font-bold text-[#20211f] active:bg-[#f4f3ee]"
          >
            <IconArrowRight className="h-5 w-5 shrink-0" />
            <span>{back.label}</span>
          </Link>
        ) : (
          <Link href={inSetup ? "/onboarding" : "/dashboard"} className="flex min-h-11 min-w-0 items-center gap-2 px-2">
            <BrandMark className="h-7 w-7 shrink-0 text-[#20211f]" />
            {/* The owner's business, not ours: "ישראמארקט / לחם …" truncated the one
                word they would recognise. */}
            <span className="min-w-0 truncate text-[15px] font-black text-[#20211f]">
              {businessName || "ישראמארקט"}
            </span>
          </Link>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {demo ? (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-black"
              style={{ background: SYSTEM_TONE.base, color: SYSTEM_TONE.onBase }}
            >
              מצב הדגמה
            </span>
          ) : null}
          {inSetup ? (
            <button
              type="button"
              onClick={logOut}
              className="inline-flex min-h-11 cursor-pointer items-center px-2 text-sm text-[#63665e] underline underline-offset-4"
            >
              יציאה
            </button>
          ) : (
            <BrandPicker variant="mobile" />
          )}
        </div>
      </header>

      <aside
        className="sticky top-0 z-40 hidden h-screen w-64 shrink-0 flex-col border-l border-[#deddd8] bg-white md:flex"
      >
        <div className="border-b border-[#e6e4dc]">
          {/* Identity gets the whole first row. The brand trigger used to share it and
              refused to shrink, which crushed the logo to a 7px column of wrapping text
              that the trigger then sat on top of. */}
          <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2.5">
            <Link href={inSetup ? "/onboarding" : "/dashboard"} className="flex min-w-0 items-center gap-3">
              <BrandMark className="h-9 w-9 shrink-0 text-[#20211f]" />
              <div className="min-w-0">
                <span className="block font-black text-[#1e201d] text-base tracking-tight">ישראמארקט</span>
                <span className="-mt-0.5 block text-xs text-[#63665e]">שיווק שעובד בישראל</span>
              </div>
            </Link>
            {demo ? (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black"
                style={{ background: SYSTEM_TONE.base, color: SYSTEM_TONE.onBase }}
              >
                דמו
              </span>
            ) : null}
          </div>
          {/* The brand gets its own row, at the top, where it can be seen. */}
          {inSetup ? null : (
            <div className="px-5 pb-3">
              <BrandPicker variant="sidebar" />
            </div>
          )}
        </div>

        <nav aria-label="ניווט ראשי" className="flex-1 overflow-y-auto px-3 py-6">
          {inSetup ? null : (
            <div className="space-y-1">
              {TABS.map((tab) => (
                <NavLink key={tab.href} tab={tab} active={activeTab?.href === tab.href} />
              ))}
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-[#e6e4dc] flex items-center justify-between gap-2 bg-[#faf9f7]">
          <Link
            href={inSetup ? "/onboarding" : "/account"}
            className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-md px-1 hover:bg-[#f4f3ee]"
          >
            <span className="w-8 h-8 rounded border border-[#e6e4dc] bg-[#ffffff] text-[#1e201d] flex items-center justify-center font-black text-xs shrink-0">
              {initials || "ע"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-[#1e201d]">{name || "משתמש"}</span>
              <span className="block truncate text-xs text-[#63665e]">{businessName || "עסק ישראלי"}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={logOut}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-[#63665e] hover:bg-[#f4f3ee] hover:text-[#191b18]"
          >
            <IconLogout className="h-4 w-4" />
            יציאה
          </button>
        </div>
      </aside>

      <div className="dot-grid flex-1 flex flex-col min-w-0">
        <main
          key={pathname}
          className={`rise mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8 ${
            inSetup ? "pb-10" : "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8"
          }`}
        >
          {children}
        </main>
      </div>

      {inSetup ? null : (
        <nav
          aria-label="ניווט ראשי"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#cecdc7] bg-white pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:hidden"
        >
          {TABS.map((tab) => {
            const active = activeTab?.href === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`nav-item relative flex min-h-14 flex-col items-center justify-center gap-1 whitespace-nowrap py-1.5 text-xs font-bold ${
                  active ? "text-[#20211f]" : "text-[#63665e]"
                }`}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-5 top-0 h-[3px] rounded-b"
                    style={{ background: ACCENT.accent }}
                  />
                ) : null}
                <Icon className="nav-icon h-6 w-6" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

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
      className={`nav-item relative flex min-h-11 items-center gap-3 rounded-md px-3.5 py-2.5 text-[15px] transition-colors ${
        active ? "font-black text-[#20211f]" : "text-[#63665e] hover:bg-[#f8f7f4] hover:text-[#1e201d]"
      }`}
      style={active ? { background: ACCENT.surface } : undefined}
    >
      {active ? (
        <span
          className="nav-active-bar absolute right-0 top-2 bottom-2 w-[3px] rounded-r"
          style={{ background: ACCENT.accent }}
        />
      ) : null}
      <Icon className="nav-icon h-5 w-5" />
      <span>{tab.label}</span>
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
    <div className="mb-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#e6e4dc] pb-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1e201d]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[#63665e] max-w-3xl">{subtitle}</p> : null}
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
    <section className={`drawn-card p-5 sm:p-6 bg-[#ffffff] border border-[#e6e4dc] ${className}`}>
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
  const toneMap = {
    primary: "bg-[#20211f] text-white hover:bg-[#343632]",
    secondary: "bg-[#f2eee5] text-[#1e201d] hover:bg-[#e7e1d4]",
    ghost: "bg-[#ffffff] text-[#1e201d] hover:bg-[#f4f3ee]",
    success: "bg-[#eaf0e6] text-[#374b3d] hover:bg-[#dde6d7]",
    danger: "bg-[#1e201d] text-white hover:bg-[#343630]",
  };

  const sizeMap = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };
  const resolvedTone = variant === "outline" ? "ghost" : tone;
  const appearance =
    variant === "outline"
      ? "rounded-md border border-[#c7c4b8] bg-transparent text-[#1e201d] hover:bg-[#f4f3ee]"
      : `drawn-button ${toneMap[resolvedTone]}`;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-bold cursor-pointer transition-colors ${appearance} ${sizeMap[size]} ${className}`}
    >
      {children}
    </button>
  );
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
    slate: "bg-[#f8f7f4] text-[#63665e] border-[#e6e4dc]",
    blue: "bg-[#eaf0e6] text-[#374b3d] border-[#c7d6c2]",
    amber: "bg-[#f5efe3] text-[#6f654b] border-[#e2d7c3]",
    emerald: "bg-[#eaf0e6] text-[#374b3d] border-[#c7d6c2]",
    purple: "bg-[#f4f1ee] text-[#1e201d] border-[#e0dad3]",
    rose: "bg-[#fbf2ef] text-[#9f4330] border-[#eed1c9]",
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
    <div className="border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330] rounded-md flex items-center gap-2">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
