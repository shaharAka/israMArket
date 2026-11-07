/** Parse a number written with the grouping and decimal marks of the active UI locale. */
export function parseLocaleNumber(input: string, locale: string): number | null {
  const source = input.trim().replace(/[\u061c\u200e\u200f]/g, "");
  if (!source) return null;

  const formatter = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 1 });
  const parts = formatter.formatToParts(1234567.8);
  const group = parts.find(part => part.type === "group")?.value;
  const decimal = parts.find(part => part.type === "decimal")?.value ?? ".";
  const digits = new Map<string, string>();
  for (let value = 0; value < 10; value += 1) {
    digits.set(new Intl.NumberFormat(locale, { useGrouping: false }).format(value), String(value));
  }
  let normalized = [...source].map(char => digits.get(char) ?? char).join("");
  if (group && /[\s\u00a0\u202f]/u.test(group)) normalized = normalized.replace(/[\s\u00a0\u202f]/gu, group);

  if (normalized.startsWith("+") || normalized.startsWith("-")) return null;
  const decimalParts = normalized.split(decimal);
  if (decimalParts.length > 2) return null;
  const integerText = decimalParts[0];
  const fractionText = decimalParts[1];
  if (!integerText || (decimalParts.length === 2 && !fractionText)) return null;

  let integer = integerText;
  if (group && integerText.includes(group)) {
    const chunks = integerText.split(group);
    if (chunks.length < 2 || chunks.some(chunk => !/^\d+$/u.test(chunk)) || chunks[0].length > 3 || chunks.slice(1).some(chunk => chunk.length !== 3)) return null;
    integer = chunks.join("");
  }
  if (!/^\d+$/u.test(integer) || (fractionText !== undefined && !/^\d+$/u.test(fractionText))) return null;
  const value = Number(`${integer}${fractionText === undefined ? "" : `.${fractionText}`}`);
  return Number.isFinite(value) ? value : null;
}

export function parseMeasurementInput(input: string, locale: string, unit: "count" | "ILS"):
  { value: number | null; error?: "invalid" | "integer" | "limit" } {
  if (!input.trim()) return { value: null };
  const value = parseLocaleNumber(input, locale);
  if (value === null) return { value: null, error: "invalid" };
  if (value < 0 || value > 1e9) return { value: null, error: "limit" };
  if (unit === "count" && !Number.isInteger(value)) return { value: null, error: "integer" };
  return { value };
}

export function updateFieldError(errors: Record<string, string>, key: string, message: string | null): Record<string, string> {
  const next = { ...errors };
  if (message) next[key] = message;
  else delete next[key];
  return next;
}
