"use client";

import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/company";
import { IconArrowLeft } from "@/lib/icons";
import { useTrial } from "@/lib/trial";
import { minutesLabel } from "./TrialGuide";

/**
 * An empty state's way back into the month: "this is a step of your free month", linking
 * to that step on Today. No blank pages (Revision 7 B): every tab that has nothing yet says
 * what is missing, and this line says where it sits in the journey.
 *
 * Quiet by design — a link, never a button — because the empty state already carries the
 * page's one ask. Renders nothing once the step is done, after the trial, or while the
 * journey has not loaded (guidance only: a failed `/trial` just means no line).
 */
export function StepLink({
  stepKey,
  className = "",
}: {
  /** One step, or several in order: the first of them that is not done yet is linked. */
  stepKey: string | string[];
  className?: string;
}) {
  const { payload } = useTrial();
  const keys = Array.isArray(stepKey) ? stepKey : [stepKey];
  const step = keys
    .map((key) => payload?.steps.find((item) => item.key === key))
    .find((item) => item && item.status !== "done");
  if (!payload || payload.ended || !step) return null;
  return (
    <Link
      href={`/dashboard#step-${step.key}`}
      className={`inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline ${className}`}
    >
      <span>
        צעד בשבוע {step.week} של החודש החינמי
        {step.status === "todo" ? ` · ${minutesLabel(step.minutes)}` : ""}
      </span>
      <IconArrowLeft className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}

/** "שאלות? כתבו לנו": one address, from the one place it is set. */
export function ContactLink({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-[color:var(--ink-soft)] ${className}`}>
      שאלות?{" "}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline"
      >
        כתבו לנו
      </a>
    </p>
  );
}
