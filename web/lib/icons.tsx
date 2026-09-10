import type { ReactNode } from "react";

type IconProps = { className?: string };

function Sketch({ className = "w-5 h-5", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Brand mark: a market stall with a sun rising behind the awning.
 * Shared by the app shell, the favicon (app/icon.svg) and the apple icon.
 */
export const BRAND_MARK_PATHS = [
  // sun
  "M9 6.5a3 3 0 016 0",
  "M12 1.2v1.3M8.3 2.7l.9.9M15.7 2.7l-.9.9",
  // awning slope + scallops
  "M3.5 10l2-3.5h13l2 3.5",
  "M3.5 10c0 2.3 4.25 2.3 4.25 0c0 2.3 4.25 2.3 4.25 0c0 2.3 4.25 2.3 4.25 0c0 2.3 4.25 2.3 4.25 0",
  // posts + counter
  "M6.2 12.6v6.9M17.8 12.6v6.9M3 19.5h18",
];

export function BrandMark({ className = "w-8 h-8" }: IconProps) {
  return (
    <Sketch className={className}>
      {BRAND_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </Sketch>
  );
}

export function IconHome({ className }: IconProps) {
  return <Sketch className={className}><path d="M3.5 11.8L12 4l8.5 7.5M5.5 10.3v9.2h13V10.1M9.3 19.5v-5.8h5.3v5.8" /></Sketch>;
}

/** Plan: a dotted route between two pins. */
export function IconRoute({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M5.5 20.5a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6zM18.5 8.1a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z" />
      <path strokeDasharray="1.8 2.4" strokeLinecap="round" d="M7.4 16.6c1.6-2.6 3-3.3 5.2-3.4 2.4-.1 3.6-1.3 4.7-4.6" />
    </Sketch>
  );
}

export function IconSparkles({ className }: IconProps) {
  return <Sketch className={className}><path d="M4 18.8l2.2-6.4L11 7.8l6.8-2.5-2.4 6.6-4.7 4.8L4 18.8zM12.6 10.7l4.2 4.1M6.2 12.5l4.4 4.1" /><path d="M18.6 3.5v3.2M17 5.1h3.2" /></Sketch>;
}

export function IconCalendar({ className }: IconProps) {
  return <Sketch className={className}><path d="M4 6.5h16v13H4zM7.2 3.8v5M16.8 3.8v5M4 10h16M8 13.3h2M14 13.3h2M8 16.5h2" /></Sketch>;
}

export function IconChart({ className }: IconProps) {
  return <Sketch className={className}><path d="M4 19.5V13h3.4v6.5M10.3 19.5V8.2h3.4v11.3M16.6 19.5V4.5H20v15M3 19.5h18" /></Sketch>;
}

export function IconLightbulb({ className }: IconProps) {
  return <Sketch className={className}><path d="M8.2 15.2C6.7 14 6 12.1 6 10.2A6 6 0 1116 14.7c-.9.8-1.5 1.5-1.6 2.3H9.6c-.1-.7-.6-1.3-1.4-1.8zM9.4 20h5.2M9.6 17h4.8M12 2V.8M4.6 4.5l-1-1M19.4 4.5l1-1" /></Sketch>;
}

export function IconLink({ className }: IconProps) {
  return <Sketch className={className}><path d="M9.2 15.2l5.6-6.4M7.7 18.6l-1.1 1.1a3.5 3.5 0 01-5-5l4.2-4.2a3.5 3.5 0 014.9 0M16.3 5.4l1.1-1.1a3.5 3.5 0 015 5l-4.2 4.2a3.5 3.5 0 01-4.9 0" /></Sketch>;
}

export function IconStore({ className }: IconProps) {
  return <Sketch className={className}><path d="M4.3 9.4v10.1h15.4V9.4M3 9.4l2.2-5h13.6l2.2 5c-1 2-3.3 2-4.4 0-1 2-3.4 2-4.6 0-1 2-3.5 2-4.6 0-1 2-3.3 2-4.4 0zM9.3 19.5v-5.7h5.4v5.7" /></Sketch>;
}

export function IconCopy({ className }: IconProps) {
  return <Sketch className={className}><path d="M8 7h11v13H8zM5 16H3V3h11v2" /></Sketch>;
}

export function IconWhatsApp({ className }: IconProps) {
  return <Sketch className={className}><path d="M19.2 17.4a8.3 8.3 0 10-3 2.2l4.3.9-1.3-3.1z" /><path d="M8.2 7.4c.5 4.2 3.1 6.9 7.5 8.2l1.1-2.3-2.7-1.2-1 1.2c-1.5-.7-2.6-1.8-3.2-3.2l1.1-.9-1.3-2.8-1.5 1z" /></Sketch>;
}

export function IconCheck({ className }: IconProps) {
  return <Sketch className={className}><path strokeWidth="2" d="M4 12.7l5.2 5.1L20 6.4" /></Sketch>;
}

export function IconArrowLeft({ className }: IconProps) {
  return <Sketch className={className}><path d="M20 12H4M9.3 6.7L4 12l5.3 5.3" /></Sketch>;
}

export function IconImage({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M3.5 5.2h17v13.6h-17z" />
      <path d="M3.8 15.4l4.2-4.3 3.1 3 2.4-2.6 6.8 5.2" />
      <path d="M15.6 8.4h.2" />
    </Sketch>
  );
}

/** Goal for the month. */
export function IconFlag({ className }: IconProps) {
  return <Sketch className={className}><path d="M5.5 21V3.5M5.5 4.5h11.8l-1.8 3.6 1.8 3.6H5.5" /></Sketch>;
}

/** Why we chose this direction. */
export function IconCompass({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path d="M15.6 8.4l-2.2 5.2-5 1.8 2.2-5.2z" />
    </Sketch>
  );
}

/** Something that needs the user. */
export function IconBell({ className }: IconProps) {
  return <Sketch className={className}><path d="M6.2 16.5V11a5.8 5.8 0 0111.6 0v5.5l1.6 2.1H4.6zM10 20.3a2 2 0 004 0M12 3.4V2" /></Sketch>;
}

export function IconPen({ className }: IconProps) {
  return <Sketch className={className}><path d="M4 20l4.3-1L19 8.3l-3.3-3.3L5 15.7zM14.2 6.5l3.3 3.3" /></Sketch>;
}

export function IconMegaphone({ className }: IconProps) {
  return <Sketch className={className}><path d="M4 10v4h3l8 4.2V5.8L7 10zM18.3 9.3a3.8 3.8 0 010 5.4M7 14v5.2h2.6v-4.4" /></Sketch>;
}

export function IconEye({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M2.5 12c2.6-4.4 5.8-6.4 9.5-6.4s6.9 2 9.5 6.4c-2.6 4.4-5.8 6.4-9.5 6.4S5.1 16.4 2.5 12z" />
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
    </Sketch>
  );
}
