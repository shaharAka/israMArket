"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useState } from "react";
import { useIsDesktop } from "@/components/posts/BottomSheet";
import { HelpSheet } from "@/components/help/HelpSheet";
import { rich } from "@/components/help/richText";
import { SendToHelper } from "@/components/help/SendToHelper";
import { GUIDES, type Device, type Guide, type GuideBlock, type HelpTopic } from "@/components/help/guides";

/**
 * "איך מוצאים את זה?" — a quiet link that opens a short, step-by-step guide.
 *
 * The owner is not technical and is usually on the phone. A field that asks for "your
 * Instagram link" or a button that says "connect your site's analytics" assumes they know
 * where those live; this link is the answer, one tap away, without leaving the page.
 *
 * Only the link lives in the page. The guide opens in a portalled sheet, so the page's word
 * budget counts the link's few words and none of the guide (UI-RULES rule 7).
 */
export function HowToFind({
  topic,
  label = "איך מוצאים את זה?",
  className = "",
}: {
  topic: HelpTopic;
  /** The link text. Defaults to "איך מוצאים את זה?". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 min-w-11 items-center gap-1.5 text-right text-[13px] font-semibold text-[color:var(--primary)] underline-offset-4 transition-colors hover:text-[color:var(--primary-dark)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${className}`}
      >
        <span>{label}</span>
      </button>
      <GuideSheet topic={topic} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The guide in its sheet. Exported for `/help`, whose rows open the same sheet. */
export function GuideSheet({ topic, open, onClose }: { topic: HelpTopic; open: boolean; onClose: () => void }) {
  const guide = GUIDES[topic];
  return (
    <HelpSheet open={open} title={guide.title} onClose={onClose}>
      {open ? <GuideBody guide={guide} /> : null}
    </HelpSheet>
  );
}

function minutesLabel(minutes: number) {
  if (minutes <= 1) return "בערך דקה";
  if (minutes === 2) return "בערך 2 דקות";
  return `בערך ${minutes} דקות`;
}

function hasDeviceSteps(guide: Guide) {
  return guide.blocks.some((block) => block.phone || block.computer);
}

/**
 * Short answer first, then the time it takes, then the steps. The phone / computer toggle
 * only appears when the steps actually differ, and it starts on the device in the owner's
 * hand.
 */
function GuideBody({ guide }: { guide: Guide }) {
  const t = useCopy();
  const desktop = useIsDesktop();
  const [picked, setPicked] = useState<Device | null>(null);
  const device: Device = picked ?? (desktop ? "computer" : "phone");
  const toggle = hasDeviceSteps(guide);

  return (
    <div className="space-y-6 text-[14px] leading-7 text-[color:var(--ink-soft)]">
      <div>
        <p className="text-[16px] font-semibold leading-7 text-[color:var(--ink)]">{rich(guide.short)}</p>
        <p className="mt-1.5 text-[13px] font-medium text-[color:var(--ink-muted)]">{minutesLabel(guide.minutes)}</p>
      </div>

      {toggle ? (
        <div role="group" aria-label={t("ההסבר עבור")} className="inline-flex gap-1 rounded-xl bg-[var(--soft)] p-1">
          {(["phone", "computer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setPicked(value)}
              className={`min-h-11 min-w-20 rounded-lg px-4 text-[14px] font-semibold transition-[background-color,color,box-shadow] duration-200 ${
                device === value
                  ? "bg-[var(--paper)] text-[color:var(--ink)] shadow-[var(--shadow-card)]"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
              }`}
            >
              {value === "phone" ? t("טלפון") : t("מחשב")}
            </button>
          ))}
        </div>
      ) : null}

      {guide.blocks.map((block, index) => (
        <Block key={block.title} block={block} device={device} first={index === 0} />
      ))}

      <SendToHelper title={guide.stuck.title} message={guide.stuck.message} copiedNote={guide.stuck.copiedNote} />

      <div className="space-y-1 border-t border-[var(--rule)] pt-5">
        <p className="text-[13px] leading-6 text-[color:var(--ink-soft)]">
          <span className="font-semibold text-[color:var(--ink)]"><Copy text="למה אנחנו צריכים את זה:" /></span>
          {guide.why}
        </p>
        <p className="text-[13px] leading-6 text-[color:var(--ink-soft)]">
          <a
            href={guide.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline"
          >
            {guide.source.label}
          </a>
        </p>
      </div>
    </div>
  );
}

function Block({ block, device, first }: { block: GuideBlock; device: Device; first: boolean }) {
  const steps = block[device] ?? block.steps;
  return (
    <section className={first ? "" : "border-t border-[var(--rule)] pt-5"}>
      <h3 className="text-[15px] font-semibold leading-6 text-[color:var(--ink)]">{block.title}</h3>
      {block.text ? <p className="mt-1.5">{rich(block.text)}</p> : null}
      {steps?.length ? (
        <ol className="mt-3 space-y-2.5">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[12px] font-semibold tabular-nums text-[color:var(--primary)]"
              >
                {index + 1}
              </span>
              <span className="min-w-0">{rich(step)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {block.cases?.length ? (
        <dl className="mt-3 space-y-3">
          {block.cases.map((item) => (
            <div key={item.label}>
              <dt className="font-semibold text-[color:var(--ink)]">{item.label}</dt>
              <dd>{rich(item.text)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {block.note ? <p className="mt-3 text-[13px] leading-6 text-[color:var(--ink-muted)]">{rich(block.note)}</p> : null}
    </section>
  );
}
