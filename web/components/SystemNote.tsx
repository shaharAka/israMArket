import { SYSTEM_TONE } from "@/lib/tone";

/**
 * A note in the system's voice, not the business's.
 *
 * `variant="panel"` is the reference treatment — a slate panel with white text and an
 * optional white pill action. `variant="inline"` is the same tone at page weight, for
 * a note that has to sit inside an otherwise light page without shouting.
 *
 * Use this for anything the software is saying about itself: a limitation, a notice, an
 * explanation of why data is missing. Business remarks stay on the warm surfaces.
 */
export function SystemNote({
  title,
  children,
  action,
  variant = "inline",
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  variant?: "panel" | "inline";
  className?: string;
}) {
  const isPanel = variant === "panel";

  return (
    <section
      className={`rounded-lg ${isPanel ? "p-5" : "border p-4"} ${className}`}
      style={
        isPanel
          ? { background: SYSTEM_TONE.base, color: SYSTEM_TONE.onBase }
          : { background: SYSTEM_TONE.surface, borderColor: SYSTEM_TONE.border }
      }
    >
      <div className={isPanel && action ? "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" : ""}>
        <div className="min-w-0">
          {title ? (
            <h3
              className={isPanel ? "text-sm font-black" : "text-xs font-black"}
              style={{ color: isPanel ? SYSTEM_TONE.onBase : SYSTEM_TONE.ink }}
            >
              {title}
            </h3>
          ) : null}
          <div
            className={`${title ? "mt-1.5" : ""} text-xs leading-6`}
            style={{ color: isPanel ? SYSTEM_TONE.onBaseMuted : SYSTEM_TONE.inkMuted }}
          >
            {children}
          </div>
        </div>

        {action ? (
          <div className="shrink-0">
            {action.href ? (
              <a
                href={action.href}
                className="inline-flex min-h-9 items-center rounded-full px-4 text-xs font-bold"
                style={{ background: SYSTEM_TONE.onBase, color: SYSTEM_TONE.ink }}
              >
                {action.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex min-h-9 items-center rounded-full px-4 text-xs font-bold"
                style={{ background: SYSTEM_TONE.onBase, color: SYSTEM_TONE.ink }}
              >
                {action.label}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
