import { Fragment } from "react";

/**
 * `**bold**` for the menu names the owner has to look for on screen, and nothing else: the
 * guides are plain Hebrew strings, not markup. English menu names are wrapped in an
 * isolate so "Settings" does not scramble the RTL order of the sentence around it.
 */
export function rich(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-bold text-[var(--ink)]">
          {isolate(part.slice(2, -2))}
        </strong>
      );
    }
    return <Fragment key={index}>{isolate(part)}</Fragment>;
  });
}

/**
 * Wraps runs of Latin text (menu names, addresses, "G-") in `<bdi dir="ltr">` so they keep
 * their own order inside a Hebrew sentence instead of trading places with the punctuation
 * around them.
 */
export function isolate(text: string) {
  const parts = text.split(/([A-Za-z0-9][A-Za-z0-9 .,&@/:_+›>'’-]*[A-Za-z0-9/-]|[A-Za-z])/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      // Short runs (a phone number, "G-AB12", "Ctrl+U") never break across lines; long
      // menu paths may.
      <bdi key={index} dir="ltr" className={part.length <= 16 ? "whitespace-nowrap" : undefined}>
        {part}
      </bdi>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
