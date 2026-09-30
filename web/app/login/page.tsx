"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { endpoints } from "@/lib/api";
import { googleErrorFromLocation } from "@/lib/googleAuth";
import { BrandMark, IconSparkles } from "@/lib/icons";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Back from Google with `?google_error=`: say what happened. Browser only, after mount.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const message = googleErrorFromLocation();
      if (message) setError(message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await endpoints.login({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      const { business } = await endpoints.business();
      router.replace(business?.onboarding_complete ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "האימייל או הסיסמה לא נכונים");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="כניסה לחשבון">
      {/* 1-Click Demo Login Button */}
      <button
        type="button"
        onClick={async () => {
          setPending(true);
          await endpoints.enterDemo();
          router.replace("/dashboard");
        }}
        disabled={pending}
        className="drawn-button mb-7 flex w-full items-center justify-between gap-3 border border-[var(--rule-dark)] bg-[var(--primary-soft)] p-4 text-right text-[var(--ink)] hover:bg-[var(--primary-soft)] transition-colors"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--rule-dark)] bg-white rounded">
            <IconSparkles className="w-5 h-5 text-[var(--ink)]" />
          </div>
          <div className="min-w-0">
            <span className="block font-bold text-sm text-[var(--ink)]">לראות את הדמו</span>
            <span className="block text-xs text-[var(--ink-soft)]">מאפיית לחם תום, בלי הרשמה</span>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs font-bold text-[var(--ink)] underline underline-offset-4">
          לפתוח ←
        </span>
      </button>

      <div className="relative mb-6 flex items-center py-2">
        <div className="flex-grow border-t border-[var(--rule)]"></div>
        <span className="mx-4 flex-shrink text-xs text-[var(--ink-muted)]">או עם החשבון שלכם</span>
        <div className="flex-grow border-t border-[var(--rule)]"></div>
      </div>

      {/* AppShell sends an account with no business on to /start or /onboarding. */}
      <GoogleButton next="/dashboard" back="/login" disabled={pending} />
      <div className="my-4">
        <OrDivider />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          name="email"
          label="אימייל"
          type="email"
          placeholder="name@business.co.il"
          dir="ltr"
          autoComplete="email"
        />
        <Field
          name="password"
          label="סיסמה"
          type="password"
          placeholder="••••••••"
          dir="ltr"
          autoComplete="current-password"
        />
        <ErrorNote message={error} />
        <Button type="submit" disabled={pending} tone="primary" size="md" className="min-h-12 w-full">
          {pending ? "נכנסים…" : "להיכנס"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--ink-muted)]">
        עדיין אין לכם חשבון?{" "}
        <Link href="/signup" className="font-bold text-[var(--ink)] hover:underline underline-offset-4">
          לפתוח חשבון
        </Link>
      </p>
    </AuthCard>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth-blue flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-8 sm:py-12">
      <div className="bg-[var(--paper)] border border-[var(--rule)] rounded-lg w-full max-w-md p-5 sm:p-8">
        <Link href="/" className="mb-6 flex items-center gap-2.5" aria-label="לעמוד הבית">
          <BrandMark className="h-9 w-9 text-[var(--primary)]" />
          <div>
            <span className="font-black text-base text-[var(--ink)]">ישראמארקט</span>
            <span className="-mt-0.5 block text-[11px] text-[var(--ink-muted)]">שיווק לעסקים קטנים</span>
          </div>
        </Link>

        <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--ink)]">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Field({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue,
  dir,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  /** "ltr" for an email or a password: typed left to right, so it should read that way. */
  dir?: "ltr" | "rtl";
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-sm font-bold text-[var(--ink)]">{label}</span>
      {/* 16px on phones: iOS zooms the page into any field smaller than that. */}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        dir={dir}
        autoComplete={autoComplete}
        required
        className="min-h-12 w-full rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-3.5 py-2.5 text-base text-[var(--ink)] sm:text-sm"
      />
    </label>
  );
}
