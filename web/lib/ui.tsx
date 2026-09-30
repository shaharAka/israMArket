"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { MotionIllustration, MotionScope } from "@/components/motion";
import type { MotionAssetId } from "@/components/motion";

type ToastState = { message: string; visible: boolean; kind?: MotionAssetId; sequence: number };

let pushToast: ((message: string, kind?: MotionAssetId) => void) | null = null;

export function toast(message: string, kind?: MotionAssetId) {
  pushToast?.(message, kind);
}

export function ToastHost() {
  const [state, setState] = useState<ToastState>({ message: "", visible: false, sequence: 0 });

  useEffect(() => {
    let timer: number | undefined;
    pushToast = (message: string, kind?: MotionAssetId) => {
      window.clearTimeout(timer);
      setState((prev) => ({ message, kind, visible: true, sequence: prev.sequence + 1 }));
      timer = window.setTimeout(() => setState((prev) => ({ ...prev, visible: false })), 3200);
    };
    return () => {
      window.clearTimeout(timer);
      pushToast = null;
    };
  }, []);

  if (!state.visible) return null;
  return (
    <div role="status" className="app-feedback pointer-events-none fixed bottom-20 left-1/2 z-[80] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg px-5 py-3 text-sm text-white shadow-sm md:bottom-6">
      <div className="flex items-center gap-3">
        {state.kind ? <MotionScope mood="playful" className="shrink-0" style={{ "--motion-paper": "var(--paper)", "--motion-ink": "var(--primary)", "--motion-accent": "var(--sun)", "--motion-halo": "var(--primary-soft)" } as CSSProperties}><MotionIllustration kind={state.kind} active replayKey={state.sequence} className="!h-10 !w-10" /></MotionScope> : null}
        <span>{state.message}</span>
      </div>
    </div>
  );
}

export async function copyText(text: string, success = "הועתק") {
  await navigator.clipboard.writeText(text);
  toast(success, "copy");
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function useCopied() {
  const [copied, setCopied] = useState(false);
  const mark = useCallback(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, []);
  return { copied, mark };
}
