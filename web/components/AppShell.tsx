"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, endpoints, isDemo } from "@/lib/api";
import {
  BrandMark,
  IconChart,
  IconHome,
  IconImage,
  IconLink,
  IconRoute,
} from "@/lib/icons";
import { ToastHost } from "@/lib/ui";

const NAV = [
  { href: "/dashboard", label: "החודש שלך", icon: IconHome },
  { href: "/strategy", label: "התוכנית", icon: IconRoute },
  { href: "/posts", label: "הפוסטים", icon: IconImage },
  { href: "/performance", label: "תוצאות", icon: IconChart },
  { href: "/integrations", label: "חיבורים", icon: IconLink },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [demo, setDemo] = useState(false);

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
      })
      .catch(() => {});
    return () => window.clearTimeout(timer);
  }, [router]);

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#1e201d] flex flex-col md:flex-row">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#deddd8] bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7 text-[#20211f]" />
          <div>
            <span className="text-sm font-black text-[#20211f]">ישראמארקט</span>
            {businessName ? <span className="mr-2 text-xs text-[#747570]">/ {businessName}</span> : null}
          </div>
        </div>
        {demo ? <span className="text-[11px] font-bold text-[#747570]">מצב הדגמה</span> : null}
      </div>

      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-[#deddd8] bg-white md:flex"
      >
        <div className="px-5 py-5 border-b border-[#e6e4dc] flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-[#20211f]" />
            <div>
              <span className="font-black text-[#1e201d] text-base tracking-tight">ישראמארקט</span>
              <span className="text-[11px] text-[#63665e] block -mt-0.5">שיווק שעובד בישראל</span>
            </div>
          </Link>
          {demo ? (
            <span className="label-mark text-[#63665e] bg-[#f8f7f4]">
              דמו
            </span>
          ) : null}
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item relative flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-[#e9e8e3] text-[#20211f] font-black"
                    : "text-[#63665e] hover:text-[#1e201d] hover:bg-[#f8f7f4]"
                }`}
              >
                {active ? (
                  <span className="nav-active-bar absolute right-0 top-2 bottom-2 w-[3px] rounded-r bg-[#343632]" />
                ) : null}
                <Icon className={`nav-icon w-5 h-5 ${active ? "text-[#20211f]" : "text-[#63665e]"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#e6e4dc] flex items-center justify-between bg-[#faf9f7]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded border border-[#e6e4dc] bg-[#ffffff] text-[#1e201d] flex items-center justify-center font-black text-xs shrink-0">
              {initials || "ע"}
            </div>
            <Link href="/onboarding" className="min-w-0">
              <p className="truncate text-xs font-bold text-[#1e201d]">{name || "משתמש"}</p>
              <p className="truncate text-[11px] text-[#63665e]">{businessName || "עסק ישראלי"}</p>
            </Link>
          </div>
          <button
            onClick={async () => {
              await endpoints.logout();
              router.replace("/");
            }}
            className="text-xs text-[#63665e] hover:text-[#191b18] underline underline-offset-4"
            title="יציאה"
          >
            יציאה
          </button>
        </div>
      </aside>

      <div className="dot-grid flex-1 flex flex-col min-w-0">
        <main key={pathname} className="rise mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[#cecdc7] bg-white px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 md:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${
                active ? "text-[#20211f]" : "text-[#898a85]"
              }`}
            >
              <Icon className="nav-icon h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <ToastHost />
    </div>
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
