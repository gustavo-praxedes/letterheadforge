/**
 * Export file name (R105): `letterheadforge-{a4|a5|a6}-{retrato|paisagem}-{AAAAMMDD}.pdf`.
 * Pure, so the format is testable without a clock or a DOM.
 */

function pad(value) {
  return String(value).padStart(2, "0");
}

/** `YYYYMMDD` in local time — the date the person prints, not UTC. */
export function stampDate(date = new Date()) {
  const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;
}

export function exportFileName({ size, orientation, date } = {}) {
  const pageSize = String(size ?? "").toLowerCase();
  const allowed = new Set(["a4", "a5", "a6"]);
  if (!allowed.has(pageSize)) return { ok: false, code: "export.invalidSize" };

  const direction = orientation === "landscape" ? "paisagem" : "retrato";
  return { ok: true, name: `letterheadforge-${pageSize}-${direction}-${stampDate(date)}.pdf` };
}
