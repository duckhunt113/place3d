// Reading numbers out of OSM tag values, which are free text.

/** A length in metres from values like "12", "12 m", "3.5m", "40'" or "40 ft". Undefined if unreadable. */
export function parseMetres(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(m|metres?|meters?|'|ft|feet)?\s*$/i.exec(value);
  if (!match) return undefined;
  const amount = Number((match[1] as string).replace(",", "."));
  const unit = (match[2] ?? "m").toLowerCase();
  return unit === "'" || unit === "ft" || unit === "feet" ? amount * 0.3048 : amount;
}

/** A plain number from values like "2", "2.5" or "2;3" (first value wins). Undefined if unreadable. */
export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^\s*(-?\d+(?:\.\d+)?)/.exec(value);
  return match ? Number(match[1]) : undefined;
}
