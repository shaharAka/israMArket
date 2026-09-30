"use client";

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
        className={`inline-flex min-h-11 min-w-11 items-center gap-1.5 text-right text-xs font-bold text-[var(--ink-soft)] underline decoration-[var(--rule-dark)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${className}`}
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
  const desktop = useIsDesktop();
  const [picked, setPicked] = useState<Device | null>(null);
  const device: Device = picked ?? (desktop ? "computer" : "phone");
  const toggle = hasDeviceSteps(guide);

  return (
    <div className="space-y-5 text-sm leading-6 text-[var(--ink-soft)]">
      <div>
        <p className="text-[15px] font-bold leading-7 text-[var(--ink)]">{rich(guide.short)}</p>
        <p className="mt-1 text-xs font-bold text-[var(--ink-muted)]">{minutesLabel(guide.minutes)}</p>
      </div>

      {toggle ? (
        <div role="group" aria-label="ההסבר עבור" className="inline-flex rounded border border-[var(--rule)] bg-[var(--canvas)] p-1">
          {(["phone", "computer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setPicked(value)}
              className={`min-h-11 min-w-20 rounded px-4 text-sm font-bold transition-colors ${
                device === value ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {value === "phone" ? "טלפון" : "מחשב"}
            </button>
          ))}
        </div>
      ) : null}

      {guide.blocks.map((block, index) => (
        <Block key={block.title} block={block} device={device} first={index === 0} />
      ))}

      <SendToHelper title={guide.stuck.title} message={guide.stuck.message} copiedNote={guide.stuck.copiedNote} />

      <div className="space-y-2 border-t border-[var(--rule)] pt-4">
        <p className="text-xs leading-5 text-[var(--ink-soft)]">
          <span className="font-bold text-[var(--ink)]">למה אנחנו צריכים את זה: </span>
          {guide.why}
        </p>
        <p className="text-xs leading-5 text-[var(--ink-soft)]">
          <a
            href={guide.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-bold text-[var(--ink)] underline underline-offset-4"
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
    <section className={first ? "" : "border-t border-[var(--rule)] pt-4"}>
      <h3 className="text-sm font-black text-[var(--ink)]">{block.title}</h3>
      {block.text ? <p className="mt-1">{rich(block.text)}</p> : null}
      {steps?.length ? (
        <ol className="mt-2 space-y-2">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold tabular-nums text-[var(--primary)]"
              >
                {index + 1}
              </span>
              <span className="min-w-0">{rich(step)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {block.cases?.length ? (
        <dl className="mt-2 space-y-2">
          {block.cases.map((item) => (
            <div key={item.label}>
              <dt className="font-bold text-[var(--ink)]">{item.label}</dt>
              <dd>{rich(item.text)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {block.note ? <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{rich(block.note)}</p> : null}
    </section>
  );
}
