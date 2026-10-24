"use client";

import { AsciiReveal, AsciiSkeleton } from "ascii-reveal";
import { useEffect, useRef, type ReactNode } from "react";
import { revealArtwork } from "@/lib/artworkReveal";
import styles from "./result-reveal.module.css";

/** Actual pending work, never a timer pretending that research has progressed. */
export function ResultLoading({ label, artwork = false }: { label: string; artwork?: boolean }) {
  return <div role="status" className={styles.loading}>
    <AsciiSkeleton aria-hidden="true" variant="dither" lines={artwork ? 2 : 3} widths={["90%", "72%", "82%"]} />
    <p>{label}</p>
  </div>;
}

/** Only findings resolve; source links, corrections and answer fields stay readable. */
export function ResearchResult({ pending, label, children }: { pending: boolean; label: string; children: ReactNode }) {
  return <AsciiReveal className={styles.research} loading={pending} selector="[data-research-fact]" revealOnMount={false} duration="fast" speed={1} lazy={false}>
    {pending ? <ResultLoading label={label} /> : children}
  </AsciiReveal>;
}

/** Fresh assets resolve in place; existing posts and normal edits do not replay. */
export function ArtworkResult({ scope, source, pending = false, hasPreview = true, label, children }: {
  scope: string; source: string; pending?: boolean; hasPreview?: boolean; label: string; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef({ scope, source });
  useEffect(() => {
    const old = previous.current;
    if (old.scope !== scope) { previous.current = { scope, source }; return; }
    if (pending) return;
    previous.current = { scope, source };
    if (!root.current || !source || old.source === source) return;
    const abort = new AbortController();
    void revealArtwork(root.current, abort.signal, "img:not([data-card-logo]), video", 1.2);
    return () => abort.abort();
  }, [scope, source, pending]);
  return <div ref={root} className={styles.artwork} data-result-artwork aria-busy={pending}>
    {children}
    {pending && hasPreview ? <div className={styles.pending}><ResultLoading label={label} artwork /></div> : null}
  </div>;
}
