"use client";

import Image from "next/image";
import { useCopy } from "@/components/language/LanguageProvider";

export function ConnectionScreenshot({ src, alt }: { src: string; alt: string }) {
  const t = useCopy();
  return <figure className="lv2-real-screen">
    <Image src={src} width={1280} height={900} alt={t(alt)} sizes="(max-width: 800px) 95vw, 650px" />
  </figure>;
}
