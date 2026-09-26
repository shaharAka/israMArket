"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { endpoints } from "@/lib/api";
import { BrandMark, IconSparkles } from "@/lib/icons";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
        className="drawn-button mb-7 flex w-full items-center justify-between gap-3 border border-[#dedcd4] bg-[#f4f1ea] p-4 text-right text-[#191b18] hover:bg-[#ebe6db] transition-colors"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#c8c5b8] bg-white rounded">
            <IconSparkles className="w-5 h-5 text-[#191b18]" />
          </div>
          <div className="min-w-0">
            <span className="block font-bold text-sm text-[#191b18]">לראות את הדמו</span>
            <span className="block text-xs text-[#5e6159]">מאפיית לחם תום, בלי הרשמה</span>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs font-bold text-[#191b18] underline underline-offset-4">
          לפתוח ←
        </span>
      </button>

      <div className="relative mb-6 flex items-center py-2">
        <div className="flex-grow border-t border-[#e6e4dc]"></div>
        <span className="mx-4 flex-shrink text-xs text-[#63665e]">או עם החשבון שלכם</span>
        <div className="flex-grow border-t border-[#e6e4dc]"></div>
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

      <p className="mt-6 text-center text-xs text-[#63665e]">
        עדיין אין לכם חשבון?{" "}
        <Link href="/signup" className="font-bold text-[#191b18] hover:underline underline-offset-4">
          לפתוח חשבון
        </Link>
      </p>
    </AuthCard>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7f4] px-4 py-8 sm:py-12">
      <div className="bg-[#ffffff] border border-[#e6e4dc] rounded-lg shadow-sm w-full max-w-md p-5 sm:p-8">
        <Link href="/" className="mb-6 flex items-center gap-2.5" aria-label="לעמוד הבית">
          <BrandMark className="h-9 w-9 text-[#191b18]" />
          <div>
            <span className="font-black text-base text-[#1e201d]">ישראמארקט</span>
            <span className="-mt-0.5 block text-[11px] text-[#63665e]">שיווק לעסקים קטנים</span>
          </div>
        </Link>

        <h1 className="mb-6 text-2xl font-black tracking-tight text-[#1e201d]">{title}</h1>
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
      <span className="mb-1.5 block text-sm font-bold text-[#1e201d]">{label}</span>
      {/* 16px on phones: iOS zooms the page into any field smaller than that. */}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        dir={dir}
        autoComplete={autoComplete}
        required
        className="min-h-12 w-full rounded-md border border-[#dedcd4] bg-[#ffffff] px-3.5 py-2.5 text-base text-[#1e201d] sm:text-sm"
      />
    </label>
  );
}
