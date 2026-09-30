"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { endpoints } from "@/lib/api";

/** Straight into the demo in one click: it used to be a second click on /login. */
export function DemoLink({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  async function openDemo() {
    setOpening(true);
    await endpoints.enterDemo();
    router.push("/dashboard");
  }

  return (
    <button type="button" onClick={() => void openDemo()} disabled={opening} className={className}>
      {opening ? "פותחים את הדמו…" : "לראות דמו"}
    </button>
  );
}
