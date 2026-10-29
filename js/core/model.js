import { isEmpty, uuid, todayISO } from "./format.js";

export const newInst = () => ({ v: {}, c: {}, a: [] });

/** Valori proposti per i nuovi gruppi (modificabili): tutto cio' che per una PA italiana e' quasi sempre uguale. */
export const DEFAULTS = {
  "BT-514-Organization-Company": "ITA",
  "BT-514-Organization-TouchPoint": "ITA",
  "BT-5141-Lot": "ITA",
  "BT-5141-Part": "ITA",
  "BT-5141-Procedure": "ITA",
};

/**
 * Un avviso in lavorazione. I dati sono istanze annidate che seguono i nodi XML dell'SDK:
 *   inst = { v: {campo: valore}, c: {nodo: [inst, ...]}, a: [campi automatici] }
 * I campi ripetibili hanno array; i testi multilingua hanno {ITA: "...", ENG: "..."}.
 */
export class Notice {
  static async create(store, id, { defaults = true } = {}) {
    const data = await store.notice(id);
    const n = new Notice(store, id, data);
    n.defaults = defaults;
    n.initMeta();
    return n;
  }

  constructor(store, id, data) {
    this.store = store;
    this.id = id;
    this.info = store.noticeIndex[id];
    this.tree = data.tree;
    this.metaItems = data.meta;
    this.root = newInst();
    this.items = {};      // fieldId -> voce dell'albero (hidden, ps, m, ...)
    this.groups = {};     // nodeId -> descrittore di gruppo
    this.allowed = new Set();
    const walk = (list) => {
      for (const it of list) {
        if (it.f) { this.items[it.f] = it; this.allowed.add(it.f); }
        else {
          if (it.nd && !this.groups[it.nd]) this.groups[it.nd] = it;
          walk(it.c);
        }
      }
    };
    walk(this.tree);
    for (const m of this.metaItems) { this.items[m.f] = m; this.allowed.add(m.f); }
    this.counters = {};
  }

  // ------------------------------------------------------------ istanze
  /** Istanza del nodo; ctx e' una Map nodo->istanza per i gruppi ripetibili attivi. */
  instFor(nodeId, ctx = new Map(), create = true) {
    if (ctx.has(nodeId)) return ctx.get(nodeId);
    const parent = this.store.nodes[nodeId]?.[0];
    if (!parent) return this.root;
    const p = this.instFor(parent, ctx, create);
    if (!p) return null;
    let arr = p.c[nodeId];
    if (!arr || !arr.length) {
      if (!create) return null;
      arr = p.c[nodeId] = [this.makeInst(nodeId)];
    }
    return arr[0];
  }

  makeInst(nodeId) {
    const inst = newInst();
    const g = this.groups[nodeId];
    if (g && g.idf) {
      const f = this.store.fields[g.idf];
      if (f) {
        const { prefix, digits } = this.idFormat(g, f);
        const c = (this.counters[prefix] = (this.counters[prefix] || 0) + 1);
        // l'identificativo puo' stare in un nodo figlio del gruppo (es. ORG-0001 dentro ND-Company)
        let cur = inst;
        if (f.pn !== nodeId) {
          const path = this.store.chain(f.pn);
          const at = path.indexOf(nodeId);
          for (const node of path.slice(at + 1)) {
            const ni = newInst();
            (cur.c[node] ||= []).push(ni); cur = ni;
          }
        }
        cur.v[g.idf] = prefix + String(c).padStart(digits, "0");
        cur.a.push(g.idf);
      }
    }
    return inst;
  }

  /** Valore di un campo del gruppo, anche se sta in un nodo figlio (es. il nome di un'organizzazione). */
  groupValue(g, inst, fid) {
    const f = this.store.fields[fid];
    if (!f || !inst) return undefined;
    if (f.pn === g.nd) return inst.v[fid];
    const path = this.store.chain(f.pn);
    let cur = inst;
    for (const node of path.slice(path.indexOf(g.nd) + 1)) { cur = (cur.c[node] || [])[0]; if (!cur) return undefined; }
    return cur.v[fid];
  }

  idFormat(g, f) {
    const m = f.pt && /^\^([A-Za-z]+-)\[0-9\]\{(\d+)\}\$$/.exec(f.pt);
    if (m) return { prefix: m[1], digits: +m[2] };
    return { prefix: (g.ids || "ID") + "-", digits: 4 };
  }

  addInstance(nodeId, ctx = new Map()) {
    const parent = this.store.nodes[nodeId][0];
    const p = this.instFor(parent, ctx);
    const inst = this.makeInst(nodeId);
    (p.c[nodeId] ||= []).push(inst);
    return inst;
  }

  removeInstance(nodeId, inst, ctx = new Map()) {
    const parent = this.store.nodes[nodeId][0];
    const p = this.instFor(parent, ctx, false);
    if (!p) return;
    p.c[nodeId] = (p.c[nodeId] || []).filter((x) => x !== inst);
  }

  instances(nodeId, ctx = new Map()) {
    const parent = this.store.nodes[nodeId][0];
    const p = this.instFor(parent, ctx, false);
    return (p && p.c[nodeId]) || [];
  }

  // ------------------------------------------------------------ valori
  presetOf(fid) {
    const it = this.items[fid];
    if (it && it.ps !== undefined) return it.ps;
    return this.store.fields[fid]?.ps ?? (this.defaults ? DEFAULTS[fid] : undefined);
  }

  getValue(fid, ctx = new Map(), create = false) {
    const f = this.store.fields[fid];
    const inst = this.instFor(f.pn, ctx, create);
    const v = inst ? inst.v[fid] : undefined;
    return v === undefined ? this.presetOf(fid) : v;
  }

  setValue(fid, value, ctx = new Map()) {
    const f = this.store.fields[fid];
    const inst = this.instFor(f.pn, ctx, true);
    if (isEmpty(value)) delete inst.v[fid];
    else inst.v[fid] = value;
  }

  /** Tutte le istanze (con nodo) di un'entita' di business referenziabile, per i campi id-ref. */
  entities(businessEntityIds, schemes) {
    const out = [];
    const visit = (nodeId, inst) => {
      const g = this.groups[nodeId];
      if (g && g.idf && businessEntityIds.includes(g.be)) {
        const id = this.groupValue(g, inst, g.idf);
        if (id) {
          let cap = g.cap && this.groupValue(g, inst, g.cap);
          if (cap && typeof cap === "object") cap = Object.values(cap).find((x) => x) || "";
          out.push({ id, caption: cap || "", entity: g.be });
        }
      }
      for (const [cid, arr] of Object.entries(inst.c)) arr.forEach((i) => visit(cid, i));
    };
    for (const [cid, arr] of Object.entries(this.root.c)) arr.forEach((i) => visit(cid, i));
    return out;
  }

  /** Allinea i contatori degli ID automatici a quanto gia' presente (dopo un import). */
  syncCounters() {
    const re = /^([A-Za-z]+-)(\d+)$/;
    const visit = (inst) => {
      for (const v of Object.values(inst.v)) {
        if (typeof v === "string") {
          const m = re.exec(v);
          if (m) this.counters[m[1]] = Math.max(this.counters[m[1]] || 0, +m[2]);
        }
      }
      for (const arr of Object.values(inst.c)) arr.forEach(visit);
    };
    visit(this.root);
  }

  // ------------------------------------------------------------ metadati
  /** Valori generati automaticamente (tipo di avviso, identificativi, data di invio, lingua). */
  initMeta() {
    const set = (fid, val) => this.setAuto(fid, val);
    set("OPP-070-notice", this.id);
    set("BT-02-notice", this.info.type);
    set("BT-03-notice", this.info.form);
    set("BT-01-notice", this.info.lb);
    set("OPT-001-notice", "2.3");
    set("OPT-002-notice", `eforms-sdk-${this.store.meta.sdk.split(".").slice(0, 2).join(".")}`);
    set("BT-701-notice", uuid());
    set("BT-04-notice", uuid());
    set("BT-757-notice", "01");
    set("BT-702(a)-notice", "ITA");
  }

  /** Imposta un campo automatico nell'istanza del nodo a cui appartiene. */
  setAuto(fid, val) {
    if (!this.allowed.has(fid)) return;
    const inst = this.instFor(this.store.fields[fid].pn, new Map(), true);
    inst.v[fid] = val;
    if (!inst.a.includes(fid)) inst.a.push(fid);
  }

  /** Aggiorna data/ora di invio all'esportazione. */
  stampDispatch(now = new Date()) {
    const p = (x) => String(x).padStart(2, "0");
    const d = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    const t = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    this.setAuto("BT-05(a)-notice", d);
    this.setAuto("BT-05(b)-notice", t);
  }

  get languages() {
    const main = this.getValue("BT-702(a)-notice") || "ITA";
    const extra = this.getValue("BT-702(b)-notice") || [];
    return [main, ...extra];
  }

  // ------------------------------------------------------------ serializzazione bozza
  toJSON() {
    return { sdk: this.store.meta.sdk, notice: this.id, root: this.root, counters: this.counters, defaults: this.defaults };
  }

  loadJSON(obj) {
    this.root = obj.root;
    this.counters = obj.counters || {};
    this.defaults = obj.defaults !== false;
    this.syncCounters();
  }
}
