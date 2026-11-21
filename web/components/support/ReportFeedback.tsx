"use client";

import Image from "next/image";
import { useId, useRef, useState, type FormEvent } from "react";
import { UIAction, UIDialog } from "@/components/design/Controls";
import { FIELD, LABEL } from "@/components/account/setupStyles";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { ApiError, api } from "@/lib/api";

async function capturePage() {
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const top = window.scrollY;
  const { toJpeg } = await import("html-to-image");
  return toJpeg(document.body, {
    width, height,
    pixelRatio: Math.min(1, 1440 / width, 1440 / height),
    quality: 0.8,
    skipFonts: true,
    style: { position: "relative", top: `-${top}px`, margin: "0", overflow: "visible", backgroundColor: "#ffffff" },
    filter: node => {
      if (!(node instanceof Element)) return true;
      if (node.matches("dialog, iframe, video, canvas, input[type=password], [data-feedback-ui], [data-private]")) return false;
      return !(node instanceof HTMLImageElement) || !node.currentSrc || node.currentSrc.startsWith(window.location.origin + "/") || /^(data:|blob:)/.test(node.currentSrc);
    },
  });
}

export function ReportFeedback({ iconOnly = false }: { iconOnly?: boolean }) {
  const t = useCopy();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"bug" | "suggestion">("bug");
  const [body, setBody] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<null | "board" | "team">(null);
  const captureAttempt = useRef(0);
  const clientRef = useRef("");

  function discardScreenshot() {
    captureAttempt.current++;
    setScreenshot(null);
    setCapturing(false);
    setCaptureFailed(false);
  }

  function show() {
    if (saved) {
      setBody("");
      clientRef.current = "";
    }
    const attempt = ++captureAttempt.current;
    setSaved(null);
    setScreenshot(null);
    setCapturing(true);
    setCaptureFailed(false);
    setError("");
    setOpen(true);
    void capturePage().then(image => {
      if (attempt === captureAttempt.current) setScreenshot(image);
    }).catch(() => {
      if (attempt === captureAttempt.current) setCaptureFailed(true);
    }).finally(() => {
      if (attempt === captureAttempt.current) setCapturing(false);
    });
  }

  function close() {
    if (!busy) {
      discardScreenshot();
      setOpen(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || body.trim().length < 5) return;
    setBusy(true);
    setError("");
    clientRef.current ||= crypto.randomUUID();
    const report = new FormData();
    const path = window.location.pathname;
    report.set("client_ref", clientRef.current);
    report.set("kind", kind);
    report.set("body", body.trim());
    report.set("page", path.length <= 40 && /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(path) ? path : "/");
    try {
      if (screenshot) report.set("screenshot", await (await fetch(screenshot)).blob(), "screen.jpg");
      const response = await api<{ id: string; board_synced: boolean }>("/support/feedback", { method: "POST", body: report });
      setSaved(response.board_synced ? "board" : "team");
      discardScreenshot();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 413
        ? "צילום המסך גדול מדי. אפשר לשלוח את הדיווח בלעדיו."
        : "לא הצלחנו לשלוח את הדיווח. אפשר לנסות שוב, הטקסט נשאר כאן.");
    } finally {
      setBusy(false);
    }
  }

  return <div data-feedback-ui>
    <button type="button" onClick={show} aria-label={t("לדווח על תקלה או להציע שיפור")}
      title={iconOnly ? t("לדווח על תקלה או להציע שיפור") : undefined}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--ink-soft)] hover:bg-[var(--soft)]">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M20 15a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" strokeLinejoin="round" />
        <path d="M8 9h7M8 12h5" strokeLinecap="round" />
      </svg>
      {!iconOnly && <Copy text="לדווח על תקלה או להציע שיפור" />}
    </button>
    <UIDialog open={open} onClose={close} title={t("דיווח על תקלה או הצעה לשיפור")}>
      {saved ? <div className="space-y-4">
        <p role="status"><Copy text={saved === "board" ? "הדיווח נוסף ללוח של הצוות. תודה!" : "הדיווח נשמר לצוות. תודה!"} /></p>
        <UIAction onClick={close}><Copy text="סגירה" /></UIAction>
      </div> : <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${id}-kind`} className={LABEL}><Copy text="סוג הדיווח" /></label>
          <select id={`${id}-kind`} className={FIELD} value={kind} disabled={busy}
            onChange={event => setKind(event.target.value === "suggestion" ? "suggestion" : "bug")}>
            <option value="bug">{t("תקלה")}</option>
            <option value="suggestion">{t("הצעה לשיפור")}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-body`} className={LABEL}><Copy text={kind === "bug" ? "מה קרה?" : "מה כדאי לשפר?"} /></label>
          <textarea id={`${id}-body`} className={`${FIELD} min-h-28 resize-y`} rows={4} minLength={5} maxLength={3000}
            value={body} disabled={busy} required onChange={event => setBody(event.target.value)} />
        </div>
        {capturing || screenshot ? <div className="space-y-2">
          {capturing ? <p role="status" className="text-sm"><Copy text="מכינים צילום מסך…" /></p> : <>
            <p className="text-sm text-[var(--ink-muted)]"><Copy text="צילום המסך יצורף לדיווח לצוות." /></p>
            <Image src={screenshot!} unoptimized alt={t("תצוגה מקדימה של צילום המסך")} width={640} height={360}
              className="max-h-56 w-full rounded-lg border border-[var(--rule)] bg-white object-contain" />
          </>}
          <UIAction variant="text" onClick={discardScreenshot} disabled={busy}><Copy text="להסיר את צילום המסך" /></UIAction>
        </div> : null}
        {captureFailed ? <p role="status" className="text-sm text-[var(--ink-muted)]"><Copy text="צילום המסך לא הצליח. אפשר לשלוח את הדיווח בלעדיו." /></p> : null}
        {error ? <p role="alert" className="text-sm text-[var(--danger)]">{t(error)}</p> : null}
        <UIAction type="submit" busy={busy} disabled={body.trim().length < 5 || capturing}
          busyLabel={t("שולחים את הדיווח…")}><Copy text="לשלוח דיווח" /></UIAction>
      </form>}
    </UIDialog>
  </div>;
}
