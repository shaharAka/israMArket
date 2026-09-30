"use client";

import { isolate } from "@/components/help/richText";
import { IconCopy, IconWhatsApp } from "@/lib/icons";
import { copyText, whatsappShareUrl } from "@/lib/ui";

/**
 * "Stuck? Send this to whoever set it up" — a ready Hebrew message, one tap to WhatsApp and
 * one to copy.
 *
 * The WhatsApp link has no phone number on purpose (`wa.me/?text=`): WhatsApp opens its own
 * contact picker, so we never ask for, see or store who the owner's web person is. The
 * message itself carries no personal data either; where the other side needs the owner's
 * Gmail, the message ends with a blank for the owner to fill in before sending.
 */
export function SendToHelper({
  title,
  message,
  copiedNote = "ההודעה הועתקה",
}: {
  title: string;
  message: string;
  copiedNote?: string;
}) {
  return (
    <div className="rounded bg-[var(--primary-soft)] p-3.5">
      <p className="text-sm font-bold text-[var(--ink)]">{title}</p>
      <div dir="rtl" className="mt-2 border-t border-[var(--rule-dark)] pt-3 text-[13px] leading-6 text-[var(--ink-soft)]">
        {message.split("\n").map((line, index) => (
          // Blank-for-the-owner lines ("הג׳ימייל: ") keep their height.
          <p key={index} className="min-h-6">
            {isolate(line)}
          </p>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <a
          href={whatsappShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--ink)] underline-offset-4 hover:underline"
        >
          <IconWhatsApp className="h-4 w-4" />
          לשלוח בוואטסאפ
        </a>
        <button
          type="button"
          onClick={() => {
            copyText(message, copiedNote).catch(() => undefined);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--ink)] underline-offset-4 hover:underline"
        >
          <IconCopy className="h-4 w-4" />
          להעתיק את ההודעה
        </button>
      </div>
    </div>
  );
}
