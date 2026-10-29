// Genera l'XML eForms (UBL 2.3) da un Notice usando solo i metadati dell'SDK.
import { splitSteps, parseStep } from "./xpath.js";
import { formatDate, formatTime, isEmpty, todayISO } from "./format.js";

class El {
  constructor(q) { this.q = q; this.a = {}; this.k = []; this.t = null; this.sig = null; this.src = null; this.fid = null; }
}

// un elemento gia' creato soddisfa un passo se ha lo stesso nome e rispetta i suoi predicati positivi
function satisfies(el, step) {
  if (el.q !== step.name) return false;
  return step.preds.every((p) => {
    let t = el;
    for (const name of p.path) {
      t = t.k.find((e) => e.q === name);
      if (!t) return false;
    }
    return p.leaf.attr ? t.a[p.leaf.attr] === p.value : t.t === p.value;
  });
}

function ensureStep(parent, raw, reuse, materialize = true) {
  const step = parseStep(raw);
  if (reuse) {
    // stesso passo gia' usato, oppure elemento che ne soddisfa i predicati (mai per i passi con not(...))
    const hit = parent.k.find((e) => e.sig === raw || (!raw.includes("not(") && satisfies(e, step)));
    if (hit) return hit;
  }
  const el = new El(step.name);
  el.sig = raw;
  parent.k.push(el);
  if (materialize) {
    for (const p of step.preds) {
      let target = el;
      for (const name of p.path) target = ensureStep(target, name, true);
      if (p.leaf.attr) target.a[p.leaf.attr] = p.value;
      else target.t = p.value;
    }
  }
  return el;
}

/** materialize=false: i predicati descrivono contenuto che creano i campi figli, non elementi da inventare. */
function ensurePath(base, xp, reuseLast, materialize = true) {
  const steps = splitSteps(xp);
  let cur = base;
  steps.forEach((s, i) => {
    cur = ensureStep(cur, s, i < steps.length - 1 ? true : reuseLast, materialize);
  });
  return cur;
}

/** Per i valori successivi al primo (lingue, campi ripetibili): nuovo elemento padre se l'XSD non ammette piu' figli uguali. */
function ensureAltPath(base, xp, multi) {
  const steps = splitSteps(xp);
  if (steps.length < 2) return ensureStep(base, steps[0], false);
  const leafRaw = steps[steps.length - 1];
  const parentRaw = steps[steps.length - 2];
  let cur = base;
  for (let i = 0; i < steps.length - 2; i++) cur = ensureStep(cur, steps[i], true);
  const parentQ = parseStep(parentRaw).name;
  const leafQ = parseStep(leafRaw).name;
  const allowsMany = (multi[parentQ] || []).includes(leafQ);
  const parent = ensureStep(cur, parentRaw, allowsMany);
  return ensureStep(parent, leafRaw, false);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escA = (s) => esc(s).replace(/"/g, "&quot;").replace(/\n/g, "&#10;");

function ser(el, depth, out) {
  const ind = "\t".repeat(depth);
  const attrs = Object.entries(el.a).map(([k, v]) => ` ${k}="${escA(v)}"`).join("");
  if (!el.k.length) {
    if (el.t === null) out.push(`${ind}<${el.q}${attrs}/>`);
    else out.push(`${ind}<${el.q}${attrs}>${esc(el.t)}</${el.q}>`);
    return;
  }
  out.push(`${ind}<${el.q}${attrs}>`);
  for (const k of el.k) ser(k, depth + 1, out);
  out.push(`${ind}</${el.q}>`);
}

function sortTree(el, order, rootName) {
  const list = order[el.q === rootName ? rootName : el.q];
  if (list && el.k.length > 1) {
    const idx = new Map(list.map((q, i) => [q, i]));
    el.k = el.k
      .map((e, i) => ({ e, i, o: idx.has(e.q) ? idx.get(e.q) : 1e6 }))
      .sort((a, b) => a.o - b.o || a.i - b.i)
      .map((x) => x.e);
  }
  el.k.forEach((k) => sortTree(k, order, rootName));
}

export function generateXml(notice, opts = {}) {
  return generateXmlWithMap(notice, opts).xml;
}

/** Come generateXml, ma restituisce anche la mappa percorso-XML -> {nodeId, inst, fid} per collegare gli errori al form. */
export function generateXmlWithMap(notice, { pretty = true } = {}) {
  const { store } = notice;
  const dt = store.meta.docTypes[notice.info.doc];
  const root = new El(dt.root);
  root.a["xmlns"] = dt.ns;
  for (const [p, uri] of Object.entries(dt.extra)) root.a[`xmlns:${p}`] = uri;

  const isAttr = (fid) => !!store.fields[fid].an;
  const meta = new Set(notice.metaItems.map((m) => m.f));
  const nonEmptyMain = (inst) =>
    Object.entries(inst.v).some(([fid, v]) => notice.allowed.has(fid) && !isAttr(fid) && (meta.has(fid) || !inst.a.includes(fid)) && !isEmpty(v));
  const hasContent = (nodeId, inst) => {
    if (nonEmptyMain(inst)) return true;
    for (const [cid, arr] of Object.entries(inst.c)) if (arr.some((i) => hasContent(cid, i))) return true;
    return false;
  };

  const dateOf = (inst, f) => (f.df && inst.v[f.df]) || Object.values(inst.v).find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || notice.root.v["BT-05(a)-notice"] || todayISO();

  const fmt = (f, inst, raw) => {
    const s = String(raw);
    if (f.t === "date") return formatDate(s);
    if (f.t === "time") return formatTime(s, dateOf(inst, f));
    if (f.t === "indicator") return s === "true" || s === "1" ? "true" : s === "false" || s === "0" ? "false" : s;
    // gli importi vanno sempre con due decimali e il punto (le piattaforme rifiutano «227460» con l'errore «formato importo non valido»)
    if (f.t === "amount" && /^-?\d+([.,]\d+)?$/.test(s.trim())) { const n = s.trim().replace(",", "."); return /\.\d{3,}$/.test(n) ? n : Number(n).toFixed(2); }
    return s.trim();
  };

  const attrValue = (inst, afid) => {
    // i campi-attributo non stanno nell'albero del form: valgono se vale il campo a cui appartengono
    if (!notice.allowed.has(store.fields[afid].ao)) return undefined;
    const v = inst.v[afid];
    if (!isEmpty(v)) return String(v);
    if (store.fields[afid].cl === "player-type") {
      // il tipo si deduce dall'identificativo scelto: ORG-0001 -> organizzazione, TPO-0001 -> punto di contatto
      const main = inst.v[store.fields[afid].ao];
      if (typeof main === "string") return /^TPO-/.test(main) ? "touchpoint" : /^ORG-/.test(main) ? "organization" : undefined;
    }
    const ps = notice.presetOf(afid);
    return ps === undefined || ps === "{NOW}" ? undefined : String(ps);
  };

  function emitField(fid, nodeEl, inst) {
    const f = store.fields[fid];
    let val = inst.v[fid];
    if (isEmpty(val)) {
      const ps = notice.presetOf(fid);
      if (ps === undefined || ps === "{NOW}") return;
      val = f.rp ? [ps] : ps;
    }
    const attrsFor = (el, lang) => {
      for (const afid of f.at || []) {
        const af = store.fields[afid];
        if (af.an === "languageID" && lang) { el.a.languageID = lang; continue; }
        const av = attrValue(inst, afid);
        if (av !== undefined) el.a[af.an] = av;
      }
    };
    if (f.t === "text-multilingual") {
      const map = typeof val === "string" ? { [notice.languages[0]]: val } : val;
      let n = 0;
      for (const [lang, text] of Object.entries(map)) {
        if (isEmpty(text)) continue;
        const el = n++ === 0 ? ensurePath(nodeEl, f.xp, false) : ensureAltPath(nodeEl, f.xp, store.multi);
        el.fid = fid;
        el.t = String(text).trim();
        attrsFor(el, lang);
      }
      return;
    }
    const vals = Array.isArray(val) ? val.filter((x) => !isEmpty(x)) : [val];
    let vi = 0;
    for (const one of vals) {
      const el = vi++ === 0 ? ensurePath(nodeEl, f.xp, !f.rp) : ensureAltPath(nodeEl, f.xp, store.multi);
      el.fid = fid;
      el.t = fmt(f, inst, one);
      attrsFor(el);
    }
  }

  function emitNode(nodeId, inst, parentEl, isRoot) {
    const n = store.nodes[nodeId];
    const nodeEl = isRoot ? parentEl : ensurePath(parentEl, n[1], !n[2], false);
    nodeEl.src = { nodeId, inst };
    for (const fid of store.fieldsByNode[nodeId] || []) {
      if (!notice.allowed.has(fid) || isAttr(fid)) continue;
      emitField(fid, nodeEl, inst);
    }
    for (const cid of store.childNodes[nodeId] || []) {
      for (const ci of inst.c[cid] || []) if (hasContent(cid, ci)) emitNode(cid, ci, nodeEl, false);
    }
  }

  emitNode("ND-Root", notice.root, root, true);
  sortTree(root, store.order, dt.root);
  const map = new Map();
  (function index(el, key) {
    const count = {};
    for (const k of el.k) {
      count[k.q] = (count[k.q] || 0) + 1;
      const kk = `${key}/${k.q}[${count[k.q]}]`;
      if (k.src || k.fid) map.set(kk, { nodeId: k.src && k.src.nodeId, inst: k.src && k.src.inst, fid: k.fid });
      index(k, kk);
    }
  })(root, "/" + root.q + "[1]");
  map.set("/" + root.q + "[1]", { nodeId: "ND-Root", inst: notice.root });
  const out = [];
  ser(root, 0, out);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + out.join("\n") + "\n";
  return { xml: pretty ? xml : xml.replace(/>\s+</g, "><"), map };
}
