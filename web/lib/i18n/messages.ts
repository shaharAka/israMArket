import type { Locale } from "./locales";

export type Catalog = Record<string, string>;
export type MessageArgs = Record<`arg_${number}`, string | number>;

/**
 * Interpolate values after translation. Never sends names, answers or measurements
 * to a provider, and never interprets HTML. Values containing braces stay literal.
 */
export function formatMessage(template: string, args: MessageArgs = {}): string {
  return template.replace(/\{(arg_\d+)\}/g, (_, key: keyof MessageArgs) => {
    if (!Object.hasOwn(args, key)) throw new Error(`Missing translation argument: ${key}`);
    return String(args[key]);
  });
}

/** Missing copy is a review failure, rather than a page silently switching to Hebrew. */
export function createTranslator(catalog: Catalog) {
  return (id: string, args?: MessageArgs): string => {
    if (!Object.hasOwn(catalog, id)) throw new Error(`Missing translated message: ${id}`);
    return formatMessage(catalog[id], args);
  };
}

/** Load one language on demand. Not wired to customer routes until journey review. */
export async function loadCatalog(locale: Locale): Promise<Catalog> {
  switch (locale) {
    case "en": return (await import("./messages/en.json")).default;
    case "ar": return (await import("./messages/ar.json")).default;
    case "ru": return (await import("./messages/ru.json")).default;
    case "he": {
      const { default: source } = await import("./source.json");
      return Object.fromEntries(Object.entries(source).map(([id, message]) => [id, message.source]));
    }
  }
}
