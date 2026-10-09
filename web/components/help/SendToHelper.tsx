"use client";

import { Copy } from "@/components/language/LanguageProvider";

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
    <div className="rounded-xl bg-[var(--soft)] px-4 pb-1 pt-4">
      <p className="text-[14px] font-semibold text-[color:var(--ink)]">{title}</p>
      {/* The message itself, on paper: the thing that gets sent. */}
      <div
        dir="rtl"
        className="mt-3 rounded-lg bg-[var(--paper)] px-3.5 py-3 text-[13px] leading-6 text-[color:var(--ink-soft)] shadow-[var(--shadow-card)]"
      >
        {message.split("\n").map((line, index) => (
          // Blank-for-the-owner lines ("הג׳ימייל: ") keep their height.
          <p key={index} className="min-h-6">
            {isolate(line)}
          </p>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-5">
        <a
          href={whatsappShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--primary)] underline-offset-4 transition-colors hover:text-[color:var(--primary-dark)] hover:underline"
        >
          <IconWhatsApp className="h-4 w-4" />
          <Copy text="לשלוח בוואטסאפ" /></a>
        <button
          type="button"
          onClick={() => {
            copyText(message, copiedNote).catch(() => undefined);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--primary)] underline-offset-4 transition-colors hover:text-[color:var(--primary-dark)] hover:underline"
        >
          <IconCopy className="h-4 w-4" />
          <Copy text="להעתיק את ההודעה" /></button>
      </div>
    </div>
  );
}
