"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { endpoints } from "@/lib/api";
import { googleErrorFromLocation } from "@/lib/googleAuth";
import { BrandMark } from "@/lib/icons";
import form from "@/components/start/form.module.css";
import auth from "./auth.module.css";

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
      {/* AppShell sends an account with no business on to /start or /onboarding. */}
      <GoogleButton next="/dashboard" back="/login" disabled={pending} />
      <div className="my-5">
        <OrDivider />
      </div>

      <form onSubmit={onSubmit} className={auth.form}>
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
        <Button type="submit" disabled={pending} tone="primary" size="md" className="mt-1 !min-h-[50px] w-full !text-[15px]">
          {pending ? "נכנסים…" : "להיכנס"}
        </Button>
      </form>

      <p className={auth.foot}>
        עדיין אין לכם חשבון?{" "}
        <Link href="/signup">לפתוח חשבון</Link>
      </p>
    </AuthCard>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`auth-blue ${auth.page}`}>
      <header className={auth.bar}>
        <div className={auth.barRow}>
          <Link href="/" className={auth.brand} aria-label="ישראמארקט, לעמוד הבית">
            <BrandMark className="h-8 w-8 text-[var(--primary)]" />
            <span>ישראמארקט</span>
          </Link>
        </div>
      </header>
      <main className={auth.main}>
        <div className={auth.card}>
          <h1 className={auth.title}>{title}</h1>
          {children}
        </div>
      </main>
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
    <label className="block">
      <span className={form.label}>{label}</span>
      {/* 16px on phones: iOS zooms the page into any field smaller than that (form.input). */}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        dir={dir}
        autoComplete={autoComplete}
        required
        className={`${form.input} ${dir === "ltr" ? "text-left" : ""}`}
      />
    </label>
  );
}
