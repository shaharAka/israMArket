/** Keep money in the source account's currency, independently of interface language.
 * Old snapshots have no unit; they keep their existing numeric presentation.
 */
export function formatFindingValue(fact: { value: number; unit?: string; currency?: string }, locale: string): string {
  if (fact.unit === "money" && /^[A-Z]{3}$/.test(fact.currency ?? "")) {
    return new Intl.NumberFormat(locale, {
      style: "currency", currency: fact.currency, maximumFractionDigits: 2,
    }).format(fact.value);
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: fact.unit === "ratio" ? 2 : 1 }).format(fact.value);
  return fact.unit === "ratio" ? `${number}×` : number;
}
