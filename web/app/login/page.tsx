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
      setError(err instanceof Error ? err.message : "פרטי ההתחברות אינם נכונים");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="כניסה למערכת">
      {/* 1-Click Demo Login Button */}
      <button
        type="button"
        onClick={async () => {
          setPending(true);
          await endpoints.enterDemo();
          router.replace("/dashboard");
        }}
        disabled={pending}
        className="drawn-button mb-7 flex w-full items-center justify-between border border-[#dedcd4] bg-[#f4f1ea] p-4 text-right text-[#191b18] hover:bg-[#ebe6db] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-[#c8c5b8] bg-white rounded">
            <IconSparkles className="w-5 h-5 text-[#191b18]" />
          </div>
          <div>
            <span className="block font-bold text-sm text-[#191b18]">כניסת הדגמה מהירה</span>
            <span className="block text-xs text-[#5e6159]">צפייה בכל המסכים (מאפיית לחם תום)</span>
          </div>
        </div>
        <span className="text-xs font-bold text-[#191b18] underline underline-offset-4">פתיחה ←</span>
      </button>

      <div className="relative mb-6 flex items-center py-2">
        <div className="flex-grow border-t border-[#e6e4dc]"></div>
        <span className="mx-4 flex-shrink text-xs text-[#63665e]">או התחברות עם חשבון</span>
        <div className="flex-grow border-t border-[#e6e4dc]"></div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field name="email" label="כתובת אימייל" type="email" placeholder="name@business.co.il" />
        <Field name="password" label="סיסמה" type="password" placeholder="••••••••" />
        <ErrorNote message={error} />
        <Button type="submit" disabled={pending} tone="primary" size="md">
          {pending ? "מתחבר..." : "כניסה לחשבון"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-[#63665e]">
        עדיין אין לכם חשבון?{" "}
        <Link href="/signup" className="font-bold text-[#191b18] hover:underline underline-offset-4">
          פתחו חשבון עכשיו
        </Link>
      </p>
    </AuthCard>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7f4] px-4 py-12">
      <div className="bg-[#ffffff] border border-[#e6e4dc] rounded-lg shadow-sm w-full max-w-md p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <BrandMark className="h-9 w-9 text-[#191b18]" />
          <div>
            <span className="font-black text-base text-[#1e201d]">ישראמארקט</span>
            <span className="-mt-0.5 block text-[11px] text-[#63665e]">שיווק שעובד בישראל</span>
          </div>
        </div>

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
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-xs font-bold text-[#1e201d]">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required
        className="w-full rounded-md border border-[#e6e4dc] bg-[#ffffff] px-3.5 py-2.5 text-sm text-[#1e201d]"
      />
    </label>
  );
}
