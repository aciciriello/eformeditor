// Formattazione dei valori secondo i tipi eForms (date con fuso orario, orari, indicatori).

function lastSunday(year, month /*0-based*/) {
  const d = new Date(Date.UTC(year, month + 1, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

/** Offset di fuso per l'Italia (CET/CEST) per una data YYYY-MM-DD. */
export function tzFor(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
  if (!m) return "+01:00";
  const y = +m[1];
  const d = Date.UTC(y, +m[2] - 1, +m[3]);
  const start = lastSunday(y, 2).getTime();
  const end = lastSunday(y, 9).getTime();
  return d >= start && d < end ? "+02:00" : "+01:00";
}

export function todayISO() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export function formatDate(v) {
  v = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v + tzFor(v);
  return v;
}

export function formatTime(v, dateForTz) {
  v = String(v).trim();
  if (/^\d{2}:\d{2}$/.test(v)) v += ":00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v + tzFor(dateForTz || todayISO());
  return v;
}

/** Valore dal formato XML a quello dei campi di input (toglie il fuso). */
export function parseDate(v) { return String(v).replace(/(Z|[+-]\d{2}:\d{2})$/, ""); }
export function parseTime(v) { return String(v).replace(/(Z|[+-]\d{2}:\d{2})$/, "").replace(/^(\d{2}:\d{2}):00$/, "$1"); }

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export const isEmpty = (v) => {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).length === 0;
  if (typeof v === "object") return Object.values(v).every(isEmpty);
  return false;
};

/** Toglie dai messaggi delle regole i codici tecnici (BT-xxx) e i riferimenti al sottotipo. */
export const clean = (m) => String(m).replace(/\s*\((?:BT|OPT|OPP)-[^)]*\)/g, "").replace(/\s*\(in '[^']*'\)/g, "").replace(/\s+/g, " ").trim();
