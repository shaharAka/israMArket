"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { endpoints } from "@/lib/api";
import { loadPreview, siteFromLocation, type SitePreview } from "@/components/onboarding/preview";
import { Swatches } from "@/components/onboarding/SitePreviewView";
import { AuthCard, Field } from "../login/page";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [site, setSite] = useState("");
  const [preview, setPreview] = useState<SitePreview | null>(null);

  // Read after mount: the URL and sessionStorage only exist in the browser.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fromUrl = siteFromLocation();
      const stored = loadPreview(fromUrl || undefined);
      setSite(fromUrl || stored?.url || "");
      setPreview(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      router.replace(site ? `/onboarding?site=${encodeURIComponent(site)}` : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההרשמה נכשלה");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={preview?.business_name ? `חשבון ל${preview.business_name}` : "פתיחת חשבון"}>
      {preview ? (
        <div className="-mt-3 mb-5 flex items-center justify-between gap-3">
          <p className="text-sm text-[#5e6159]">אחרי זה נבנה את החודש הראשון.</p>
          <Swatches preview={preview} size="sm" />
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field name="full_name" label="שם מלא" placeholder="נועה כהן" autoComplete="name" />
        <Field
          name="email"
          label="אימייל"
          type="email"
          placeholder="noa@bakery.co.il"
          dir="ltr"
          autoComplete="email"
        />
        <Field
          name="password"
          label="סיסמה (לפחות 8 תווים)"
          type="password"
          placeholder="••••••••"
          dir="ltr"
          autoComplete="new-password"
        />
        <ErrorNote message={error} />
        <Button type="submit" disabled={pending} tone="primary" size="md" className="min-h-12 w-full">
          {pending ? "פותחים חשבון…" : "פתיחת חשבון"}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-[#63665e]">
        כבר יש לכם חשבון?{" "}
        <Link
          href="/login"
          className="font-bold text-[#191b18] underline-offset-4 hover:underline"
        >
          התחברו כאן
        </Link>
      </p>
    </AuthCard>
  );
}
