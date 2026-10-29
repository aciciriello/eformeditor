// Mini-parser per gli XPath relativi dell'SDK eForms (solo le 13 forme che compaiono davvero).

/** Divide un XPath sui '/' ignorando quelli dentro [] o apici. */
export function splitSteps(xp) {
  const out = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of xp) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "/" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.filter((s) => s !== "");
}

/** Estrae i predicati [..] di primo livello da un passo. */
function predicates(step) {
  const preds = [];
  let depth = 0, quote = null, cur = "", start = -1;
  for (let i = 0; i < step.length; i++) {
    const ch = step[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === "[") { if (depth === 0) start = i + 1; depth++; }
    else if (ch === "]") { depth--; if (depth === 0) preds.push(step.slice(start, i)); }
  }
  return preds;
}

/** Interpreta un predicato "positivo" (percorso = 'valore'); ritorna null per not(...) o ../... */
function parsePredicate(p) {
  p = p.trim();
  if (p.startsWith("not(") || p.startsWith("..")) return null;
  const m = p.match(/^(.+?)\s*=\s*(.+)$/);
  if (!m) return null;
  let rhs = m[2].trim();
  const q = rhs.match(/'([^']*)'/);
  if (!q) return null;
  const value = q[1];
  const segs = m[1].trim().split("/");
  const last = segs.pop();
  let leaf;
  if (last === "text()") leaf = { text: true };
  else if (last.startsWith("@")) leaf = { attr: last.slice(1) };
  else return null;
  return { path: segs, leaf, value };
}

export function parseStep(raw) {
  const i = raw.indexOf("[");
  const name = i < 0 ? raw : raw.slice(0, i);
  const preds = i < 0 ? [] : predicates(raw).map(parsePredicate).filter(Boolean);
  return { raw, name, preds };
}
