"use client";

import { useCallback, useEffect, useState } from "react";

type ToastState = { message: string; visible: boolean };

let pushToast: ((message: string) => void) | null = null;

export function toast(message: string) {
  pushToast?.(message);
}

export function ToastHost() {
  const [state, setState] = useState<ToastState>({ message: "", visible: false });

  useEffect(() => {
    pushToast = (message: string) => {
      setState({ message, visible: true });
      window.setTimeout(() => setState((prev) => ({ ...prev, visible: false })), 2200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (!state.visible) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-olive px-5 py-2.5 text-sm text-white shadow-lg">
      {state.message}
    </div>
  );
}

export async function copyText(text: string, success = "הועתק ללוח") {
  await navigator.clipboard.writeText(text);
  toast(success);
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
