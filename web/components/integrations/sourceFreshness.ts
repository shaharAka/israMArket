type Reading = { readAt?: string; start?: string; end?: string };

/** Independent reads seconds apart are normal. Flag a materially older source only. */
export function materiallyOlder(source: Reading, other: Reading): boolean {
  const sourceTime = Date.parse(source.readAt || "");
  const otherTime = Date.parse(other.readAt || "");
  if (!Number.isFinite(sourceTime) || !Number.isFinite(otherTime) || sourceTime >= otherTime) return false;
  const differentPeriod = Boolean(source.start && other.start && source.start !== other.start) ||
    Boolean(source.end && other.end && source.end !== other.end);
  return differentPeriod || otherTime - sourceTime >= 24 * 60 * 60 * 1000;
}
