"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import { SwatchFan } from "@/components/brand/SwatchFan";
import { useCopy } from "@/components/language/LanguageProvider";

/** Identity tool, separate from the day-to-day plan navigation. Never opens a popover. */
export function BrandLink({ className = "" }: { className?: string }) {
  const t = useCopy();
  const active = usePathname() === "/brand";
  const [colors, setColors] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    function read() { endpoints.business().then(result => { if (active) setColors((result.business?.brand_language?.palette ?? []).map(item => item.hex)); }).catch(() => undefined); }
    read(); window.addEventListener("isramarket-brand-change", read);
    return () => { active = false; window.removeEventListener("isramarket-brand-change", read); };
  }, []);
  return <Link href="/brand" aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-200 ${active ? "text-[color:var(--primary)] font-semibold" : "text-[color:var(--ink-soft)]"} hover:bg-[var(--soft)] hover:text-[color:var(--ink)] ${className}`}><SwatchFan colors={colors} className="h-6 w-6 shrink-0" /><span>{t("המותג שלי")}</span></Link>;
}
