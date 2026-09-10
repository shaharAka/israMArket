"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { endpoints } from "@/lib/api";
import { AuthCard, Field } from "../login/page";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await endpoints.register({
        full_name: String(form.get("full_name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      const website = new URLSearchParams(window.location.search).get("website") || "";
      router.replace(website ? `/onboarding?website=${encodeURIComponent(website)}` : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההרשמה נכשלה");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="פתיחת חשבון חדש">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          name="full_name"
          label="שם מלא"
          placeholder="נועה כהן"
        />
        <Field
          name="email"
          label="כתובת אימייל"
          type="email"
          placeholder="noa@bakery.co.il"
        />
        <Field
          name="password"
          label="סיסמה (לפחות 8 תווים)"
          type="password"
          placeholder="••••••••"
        />
        <ErrorNote message={error} />
        <Button type="submit" disabled={pending} tone="primary" size="md">
          {pending ? "יוצר חשבון..." : "יצירת חשבון והתחלת תוכנית"}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-[#63665e]">
        כבר יש לכם חשבון?{" "}
        <Link href="/login" className="text-[#191b18] font-bold hover:underline underline-offset-4">
          התחברו כאן
        </Link>
      </p>
    </AuthCard>
  );
}
