import type { ReactNode } from "react";
export type EditorIconKind = "text" | "tone" | "photo" | "download" | "publish" | "badge" | "paper";
/** Small, consistent ink drawings. A single sun accent belongs to the image tool. */
export function EditorIcon({ kind, className = "" }: { kind: EditorIconKind; className?: string }) {
  const drawings: Record<EditorIconKind, ReactNode> = {
    text: <><path d="M4 5h10M4 9h8M4 13h5m3 7 2-6 5-5 3 3-5 5-5 3Z" /><path d="m16 12 3 3" /></>,
    tone: <><path d="M4 4h16v12H10l-5 4v-4H4Z" /><path d="M8 8h8M8 12h5" /></>,
    photo: <><path d="M3 6h18v14H3Z" /><path d="m3 17 5-5 5 5 3-3 5 5" /><circle cx="16" cy="10" r="2" fill="var(--im-sun,var(--sun))" stroke="none" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    publish: <><path d="m3 11 18-7-7 17-3-7-8-3Z" /><path d="m11 14 10-10" /></>,
    badge: <><path d="M4 4h11l6 6-11 11-6-6Z" /><circle cx="9" cy="9" r="1" /></>,
    paper: <><path d="M5 3h14v18H5Z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="round" aria-hidden="true">{drawings[kind]}</svg>;
}
