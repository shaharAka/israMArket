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
      strokeLinecap="round"
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
  // flat striped awning, display window and entrance
  "M4 6.5h16V9H4zM3 9h18v2c0 2.4-4.5 2.4-4.5 0c0 2.4-4.5 2.4-4.5 0c0 2.4-4.5 2.4-4.5 0c0 2.4-4.5 2.4-4.5 0V9z",
  "M7.5 9v2M12 9v2M16.5 9v2",
  "M4 13.5V21h16v-7.5M6.5 14.5h6V18h-6zM15 21v-6.5h2.5V21M2.5 21h19",
];

export function BrandMark({ className = "w-8 h-8" }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M9 6.5a3 3 0 016 0Z" fill="var(--sun)" stroke="none" />
      {BRAND_MARK_PATHS.map((d, index) => (
        <path key={d} d={d} stroke={index < 2 ? "var(--sun-edge)" : "currentColor"} />
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

/** Audience segments — who the plan and the posts are built for. */
export function IconUsers({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M9 20.5v-1.8c0-2 1.6-3.6 3.6-3.6h3.3c2 0 3.6 1.6 3.6 3.6v1.8" />
      <path d="M12.7 15.1a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z" />
      <path d="M4.4 20.5v-1.6c0-1.7 1.2-3.1 2.8-3.4M6.6 14.4a2.9 2.9 0 100-5.8 2.9 2.9 0 000 5.8z" />
    </Sketch>
  );
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

/** "Go into this row". Points left because the app is RTL: forward is leftward. */
export function IconChevron({ className }: IconProps) {
  return <Sketch className={className}><path d="M14.5 6L8.5 12l6 6" /></Sketch>;
}

/** "Back". Points right because the app is RTL: back is rightward. */
export function IconArrowRight({ className }: IconProps) {
  return <Sketch className={className}><path d="M4 12h16M14.7 6.7L20 12l-5.3 5.3" /></Sketch>;
}

/** A single person — the owner's account. */
export function IconUser({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M12 12.2a3.9 3.9 0 100-7.8 3.9 3.9 0 000 7.8z" />
      <path d="M4.8 20.5v-1.2c0-2.6 2.1-4.6 4.6-4.6h5.2c2.6 0 4.6 2.1 4.6 4.6v1.2" />
    </Sketch>
  );
}

/** Two stacked photos — the owner's media library. */
export function IconPhotos({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M7 7.5h13.5v12H7z" />
      <path d="M4 16.5v-12h13" />
      <path d="M7.3 16.6l3.6-3.6 2.6 2.5 2-2.1 5 3.9" />
    </Sketch>
  );
}

/** A padlock: something stored so that only we can open it. */
export function IconLock({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M5.5 10.5h13v10h-13z" />
      <path d="M8.3 10.5V7.8a3.7 3.7 0 017.4 0v2.7M12 14.4v2.4" />
    </Sketch>
  );
}

/** A shield: access we asked for, and nothing more. */
export function IconShield({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M12 3.2l7 2.6v5.4c0 4.6-2.9 8-7 9.6-4.1-1.6-7-5-7-9.6V5.8z" />
      <path d="M8.9 12.1l2.2 2.2 4-4.3" />
    </Sketch>
  );
}

/** An eye struck through: something we never see. */
export function IconEyeOff({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M2.5 12c2.6-4.4 5.8-6.4 9.5-6.4s6.9 2 9.5 6.4c-2.6 4.4-5.8 6.4-9.5 6.4S5.1 16.4 2.5 12z" />
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM4 20L20 4" />
    </Sketch>
  );
}

/** A globe: pages open to everyone. */
export function IconGlobe({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path d="M3.3 9.5h17.4M3.3 14.5h17.4M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9c2.4-2.5 3.6-5.5 3.6-9S14.4 5.5 12 3z" />
    </Sketch>
  );
}

/** A price tag struck through: data that is not for sale. */
export function IconNoSale({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M3.5 12.3V4.2h8.1l8.9 8.9-8.1 8.1z" />
      <path d="M7.9 8.6h.2M4 20L20 4" />
    </Sketch>
  );
}

/** A bin: delete for good. */
export function IconTrash({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10.2 10.5v6.5M13.8 10.5v6.5" />
    </Sketch>
  );
}

/** A plus that the FAQ turns into a cross when a question is open. */
export function IconPlus({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M12 5v14M5 12h14" />
    </Sketch>
  );
}

/** Leave: a door with an arrow heading out of it. */
export function IconLogout({ className }: IconProps) {
  return (
    <Sketch className={className}>
      <path d="M13.5 4H20v16h-6.5" />
      <path d="M15 12H3.5M7.8 7.7L3.5 12l4.3 4.3" />
    </Sketch>
  );
}

/** Refresh: a circular arrow. */
export function IconRefresh({ className }: IconProps) {
  return <Sketch className={className}><path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.8v4.2h-4.2" /></Sketch>;
}

/** Close: an X. */
export function IconClose({ className }: IconProps) {
  return <Sketch className={className}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Sketch>;
}
