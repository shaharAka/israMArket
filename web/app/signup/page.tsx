"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorNote } from "@/components/AppShell";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { endpoints } from "@/lib/api";
import { googleErrorFromLocation } from "@/lib/googleAuth";
import { AFTER_SAVE, clearSavedFlow, hasSavableDraft, loadFlow, saveFlowToAccount, type FlowState } from "@/lib/draft";
import { loadPreview, siteFromLocation, type SitePreview } from "@/components/onboarding/preview";
import { Swatches } from "@/components/onboarding/SitePreviewView";
import { AuthCard, Field } from "../login/page";
import auth from "../login/auth.module.css";

/** "ל" joins a Hebrew name directly (למאפיית תום) and takes a maqaf before a Latin one (ל־Tom's). */
function forName(name: string): string {
  return /^[֐-׿]/.test(name) ? `ל${name}` : `ל־${name}`;
}

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [site, setSite] = useState("");
  const [preview, setPreview] = useState<SitePreview | null>(null);
  /** What the owner built at /start, if anything: signing up here keeps it. */
  const [draft, setDraft] = useState<FlowState | null>(null);

  // Read after mount: the URL and sessionStorage only exist in the browser.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fromUrl = siteFromLocation();
      const stored = loadPreview(fromUrl || undefined);
      setSite(fromUrl || stored?.url || "");
      setPreview(stored);
      const flow = loadFlow();
      setDraft(hasSavableDraft(flow) ? flow : null);
      const googleError = googleErrorFromLocation();
      if (googleError) setError(googleError);
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
      if (draft) {
        try {
          await saveFlowToAccount(draft);
          await clearSavedFlow();
          // The budget was asked at /start: straight to the plan, not the old budget step.
          router.replace(AFTER_SAVE);
        } catch {
          // The account exists; /start still holds the draft and saves it from there.
          router.replace("/start");
        }
        return;
      }
      router.replace(site ? `/onboarding?site=${encodeURIComponent(site)}` : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לפתוח את החשבון. נסו שוב.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={
        draft
          ? `חשבון ${forName(draft.draft.business_name.trim())}`
          : preview?.business_name
            ? `חשבון ${forName(preview.business_name)}`
            : "פתיחת חשבון"
      }
    >
      {draft ? (
        <p className={auth.lead}>נשמור את מה שבנינו יחד ונמשיך לתקציב.</p>
      ) : preview ? (
        <div className={`${auth.lead} flex items-center justify-between gap-3`}>
          <p>אחרי זה נבנה את החודש הראשון.</p>
          <Swatches preview={preview} size="sm" />
        </div>
      ) : null}
      {/* A draft from /start is saved by /start itself once Google sends the owner back,
          exactly as it is after an email signup (StartFlow's resume=save). */}
      <GoogleButton
        next={
          draft
            ? "/start?resume=save"
            : site
              ? `/onboarding?site=${encodeURIComponent(site)}`
              : "/onboarding"
        }
        back="/signup"
        disabled={pending}
      />
      <div className="my-5">
        <OrDivider />
      </div>
      <form onSubmit={onSubmit} className={auth.form}>
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
        <Button type="submit" disabled={pending} tone="primary" size="md" className="mt-1 !min-h-[50px] w-full !text-[15px]">
          {pending ? "פותחים חשבון…" : "לפתוח חשבון"}
        </Button>
      </form>
      <p className={auth.fine}>
        פתיחת חשבון, גם עם Google, היא הסכמה ל
        <Link href="/terms">תנאי השימוש</Link>
        {" "}ול
        <Link href="/security">מדיניות הפרטיות</Link>
        .
      </p>
      <p className={auth.foot}>
        כבר יש לכם חשבון?{" "}
        <Link href="/login">להיכנס</Link>
      </p>
    </AuthCard>
  );
}
