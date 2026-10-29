import * as fx from "../vendor/fontoxpath.bundle.js";
import { Store } from "./core/store.js";
import { Notice } from "./core/model.js";
import { generateXml } from "./core/xmlgen.js";
import { importXml } from "./core/xmlimport.js";
import { isEmpty, clean } from "./core/format.js";
import { RULE_FIDS, hintFor, shortHintFor, requiredFor } from "./core/regole.js";
import { h, clear } from "./ui/dom.js";
import { Form, instKey } from "./ui/form.js";
import { renderPicker } from "./ui/picker.js";
import { renderCheck } from "./ui/check.js";
import { confirmBox, notify } from "./ui/modal.js";
import { generateXmlWithMap } from "./core/xmlgen.js";
import { validateXml } from "./core/validate.js";
const PROFILE = "eformeditor:ente";

const main = document.getElementById("main");
const actions = document.getElementById("actions");
const DRAFT = "eformeditor:draft:";

const app = {
  store: null, notice: null, help: null, section: 0, errors: new Map(), lastResult: null,
  env: { fx, parse: (xml) => new DOMParser().parseFromString(xml, "application/xml") },
  pick: null, showAll: false, errFids: new Set(), errNodes: new Set(), required: new Map(), liveRun: 0, validating: false,

  // ------------------------------------------------------------ bozze locali (mai obbligatorie)
  listDrafts() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(DRAFT)) { const d = JSON.parse(localStorage.getItem(k)); out.push({ id: k.slice(DRAFT.length), title: d.title, saved: d.saved }); }
      }
    } catch { /* storage non disponibile */ }
    return out.sort((a, b) => (b.saved > a.saved ? 1 : -1));
  },
  saveDraft() {
    if (!this.notice) return;
    try {
      const j = this.notice.toJSON();
      j.saved = new Date().toISOString(); j.title = this.title();
      localStorage.setItem(DRAFT + this.notice.id, JSON.stringify(j));
      this.savedAt = j.saved; this.paintSaved();
    } catch { /* storage pieno o bloccato: si lavora comunque */ }
  },
  deleteDraft(id) { try { localStorage.removeItem(DRAFT + id); } catch { /* */ } },
  async openDraft(id) {
    try {
      const j = JSON.parse(localStorage.getItem(DRAFT + id));
      const n = await Notice.create(this.store, id);
      n.loadJSON(j);
      this.openNotice(n);
    } catch (e) { notify("Impossibile aprire la bozza: " + e.message); }
  },
  title() {
    const r = this.notice.root, v = r.v["BT-21-Procedure"] || r.v["BT-22-Procedure"];
    const t = v && typeof v === "object" ? Object.values(v)[0] : v;
    if (t) return t;
    const lot = (r.c["ND-Lot"] || [])[0];
    const l = lot && lot.v["BT-21-Lot"];
    return (l && typeof l === "object" ? Object.values(l)[0] : l) || "";
  },

  // ------------------------------------------------------------ dati dell'ente (solo su questo computer)
  saveProfile(inst) {
    const strip = (i) => ({
      v: Object.fromEntries(Object.entries(i.v).filter(([k]) => !i.a.includes(k))),
      c: Object.fromEntries(Object.entries(i.c).map(([k, arr]) => [k, arr.map(strip)])),
    });
    try { localStorage.setItem(PROFILE, JSON.stringify(strip(inst))); notify("Dati dell'ente salvati: li ritroverai nei prossimi avvisi."); }
    catch { notify("Impossibile salvare i dati su questo browser."); }
  },
  applyProfile(n) {
    let prof;
    try { prof = JSON.parse(localStorage.getItem(PROFILE) || "null"); } catch { prof = null; }
    if (!prof || !n.groups["ND-Organization"] || n.instances("ND-Organization").length) return false;
    const fill = (nodeId, inst, p) => {
      Object.assign(inst.v, p.v);
      for (const [cid, arr] of Object.entries(p.c || {})) inst.c[cid] = arr.map((x) => { const ci = n.makeInst(cid); fill(cid, ci, x); return ci; });
    };
    fill("ND-Organization", n.addInstance("ND-Organization"), prof);
    return true;
  },
  /** Crea nell'elenco delle organizzazioni il TAR scelto e ne restituisce l'identificativo (ORG-xxxx). */
  addTar(t) {
    const n = this.notice, org = n.addInstance("ND-Organization");
    const co = org.c["ND-Company"][0], lang = n.languages[0] || "ITA";
    co.v["BT-500-Organization-Company"] = { [lang]: t.n };
    const sub = (parent, nd, v) => { const i = n.makeInst(nd); Object.assign(i.v, v); (parent.c[nd] ||= []).push(i); return i; };
    sub(co, "ND-CompanyAddress", { "BT-513-Organization-Company": t.c, "BT-514-Organization-Company": "ITA", ...(t.z ? { "BT-512-Organization-Company": t.z } : {}), ...(t.nuts ? { "BT-507-Organization-Company": t.nuts } : {}) });
    if (t.v) co.c["ND-CompanyAddress"][0].v["BT-510(a)-Organization-Company"] = t.v;
    sub(co, "ND-CompanyContact", { "BT-506-Organization-Company": t.pec, "BT-503-Organization-Company": t.tel });
    if (t.cf) sub(co, "ND-CompanyLegalEntity", { "BT-501-Organization-Company": t.cf });
    this.index(); this.saveDraft(); this.scheduleLive();
    return co.v["OPT-200-Organization-Company"];
  },
  async leave() {
    if (!this.notice) return this.showPicker();
    if (await confirmBox("Tornare alla scelta dell'avviso? La bozza resta salvata su questo computer.", "Torna alla scelta")) { this.saveDraft(); this.showPicker(); }
  },

  // ------------------------------------------------------------ controllo (automatico e manuale)
  async validate(onProgress) {
    const { notice } = this;
    notice.stampDispatch();
    const { xml, map } = generateXmlWithMap(notice);
    const res = await validateXml(this.store, notice.id, xml, this.env, { map, yieldEvery: 150, onProgress });
    this.lastResult = res; this._dirty = false;
    this.setErrors(res.issues.filter((i) => i.role === "E"));
    return res;
  },
  scheduleLive() {
    clearTimeout(this._live);
    this._live = setTimeout(() => this.runLive(), 2500);
    this.paintStatus("pending");
  },
  async runLive() {
    if (!this.notice || this.validating) { if (this.validating) this.scheduleLive(); return; }
    const mine = ++this.liveRun, nid = this.notice;
    this.validating = true; this.paintStatus("running");
    try { await this.validate(); } catch { /* il controllo manuale mostrera' l'errore */ }
    this.validating = false;
    if (this.notice !== nid || mine !== this.liveRun) return;
    this.refreshMarks(); this.refreshSide(); this.paintStatus();
  },
  /** Aggiorna i segni di errore sui campi visibili senza ridisegnare il modulo (non si perde il cursore). */
  buildErrBox() {
    const issues = this.sectionIssues();
    if (!issues.length) return null;
    return h("div", { class: "errbox", role: "alert" },
      h("b", {}, `Da sistemare in questa pagina (${issues.length})`),
      h("ul", {}, issues.map((i) => h("li", {}, h("button", { type: "button", onclick: () => this.goTo(i) }, hintFor(i) || clean(i.msg))))));
  },
  refreshMarks() {
    const old = main.querySelector(".errbox"), nb = this.buildErrBox();
    if (old && nb) old.replaceWith(nb); else if (old) old.remove(); else if (nb) main.querySelector(".panel > h2")?.after(nb);
    main.querySelectorAll(".field[data-fid]").forEach((el) => {
      const fid = el.dataset.fid, k = el.dataset.inst;
      const msgs = this.errors.get(`${fid}|${k}`) || this.errors.get(`${fid}|`) || [];
      el.classList.toggle("has-error", msgs.length > 0);
      el.querySelector(".msg")?.remove();
      if (msgs.length) el.append(h("p", { class: "msg", role: "alert" }, msgs[0] + (msgs.length > 1 ? ` (+${msgs.length - 1})` : "")));
    });
  },
  nextIssue() {
    const errs = (this.lastResult?.issues || []).filter((i) => i.role === "E" && this.locate(i));
    if (!errs.length) return;
    const cur = typeof this.section === "number" ? this.section : -1;
    errs.sort((a, b) => ((this.sectionOf(a) - cur + 100) % 100) - ((this.sectionOf(b) - cur + 100) % 100));
    const skip = this._lastIssue && errs.length > 1 ? errs.findIndex((e) => e.id + e.fid === this._lastIssue) : -1;
    const pick = errs[(skip + 1) % errs.length];
    this._lastIssue = pick.id + pick.fid;
    this.goTo(pick);
  },
  paintStatus(state) {
    const el = document.getElementById("status"); if (!el) return;
    el.className = "status"; el.replaceChildren();
    const res = this.lastResult;
    if (state === "pending" || state === "running") { el.append("Controllo in corso…"); return; }
    if (!res) { el.append("Compila i campi: il controllo parte da solo e ti dice cosa manca."); return; }
    const errs = res.issues.filter((i) => i.role === "E");
    if (!errs.length) {
      el.classList.add("ok");
      el.append(h("b", {}, "✓ Nessun errore"), "L'avviso supera i controlli ufficiali. ", h("button", { type: "button", onclick: () => this.downloadXml() }, "Scarica l'XML"));
    } else {
      el.classList.add("bad");
      el.append(h("b", {}, `${errs.length} ${errs.length === 1 ? "cosa da sistemare" : "cose da sistemare"}`), h("button", { type: "button", onclick: () => this.nextIssue() }, "Vai alla prossima →"));
    }
  },

  // ------------------------------------------------------------ avvio / navigazione
  async newNotice(id) {
    const n = await Notice.create(this.store, id);
    const prefilled = this.applyProfile(n);
    this.openNotice(n);
    if (prefilled) notify("Ho precompilato i dati del tuo ente.");
  },
  openNotice(n) {
    this.required = requiredFor(n.id, this.store.meta.notices.find((x) => x.id === n.id)?.type);
    // le organizzazioni vanno definite per prime: le altre sezioni le richiamano per identificativo
    const oi = n.tree.findIndex((g) => g.g === "GR-Organisations-Section");
    if (oi > 0) n.tree.unshift(...n.tree.splice(oi, 1));
    const form = new Form(this); this.notice = n;
    for (const g of n.tree) if (g.nd && g.r && form.hasMandatory(g) && !n.instances(g.nd).length) n.addInstance(g.nd);
    this.notice = n; this.errors = new Map(); this.errFids = new Set(); this.errNodes = new Set(); this.lastResult = null; this.section = 0;
    this.index();
    this.showEditor();
    this.saveDraft();
  },
  index() {
    this.secOfField = {}; this.secOfNode = {}; this.secOfEntity = {};
    this.notice.tree.forEach((g, i) => {
      const walk = (items) => items.forEach((it) => {
        if (it.f) this.secOfField[it.f] = this.secOfField[it.f] ?? i;
        else { if (it.be) this.secOfEntity[it.be] = this.secOfEntity[it.be] ?? i; if (it.nd) this.secOfNode[it.nd] = this.secOfNode[it.nd] ?? i; walk(it.c); }
      });
      if (g.nd) this.secOfNode[g.nd] = i;
      walk(g.c);
    });
  },
  showPicker() {
    this.notice = null;
    clear(main); renderPicker(this, main); this.paintFooterBar();
    this.paintActions();
    window.scrollTo(0, 0);
  },
  changed() {
    clearTimeout(this._t);
    this._t = setTimeout(() => { this.saveDraft(); this.refreshSide(); }, 500);
    this._dirty = true;
    this.scheduleLive();
  },

  // ------------------------------------------------------------ errori del controllo
  setErrors(errs) {
    this.errors = new Map(); this.errFids = new Set(); this.errNodes = new Set();
    for (const e of errs) {
      if (e.fid) this.errFids.add(e.fid);
      // alcune regole si risolvono compilando campi diversi da quello segnalato: li mostro anche se facoltativi
      for (const [re, fids] of RULE_FIDS) if (re.test(e.id)) fids.forEach((f) => {
        this.errFids.add(f);
        const k2 = `${f}|`, m = shortHintFor(e) || hintFor(e) || clean(e.msg);
        if (!(this.errors.get(k2) || []).includes(m)) (this.errors.get(k2) || this.errors.set(k2, []).get(k2)).push(m);
      });
      if (e.nodeId) this.errNodes.add(e.nodeId);
      if (!e.fid) continue;
      const k = `${e.fid}|${instKey(e.inst)}`;
      (this.errors.get(k) || this.errors.set(k, []).get(k)).push(clean(e.msg));
    }
  },
  sectionIssues() {
    const r = this.lastResult;
    return r ? r.issues.filter((i) => i.role === "E" && this.sectionOf(i) === this.section) : [];
  },
  errorsFor(fid, inst) {
    return this.errors.get(`${fid}|${instKey(inst)}`) || this.errors.get(`${fid}|`) || [];
  },
  sectionOf(i) {
    let s = i.fid != null ? this.secOfField[i.fid] ?? this.secOfField[this.store.fields[i.fid]?.ao] : undefined;
    if (s === undefined && i.nodeId) s = this.secOfNode[i.nodeId];
    return s;
  },
  locate(i) {
    const s = this.sectionOf(i);
    return s === undefined ? null : { section: s, label: this.notice.tree[s].n };
  },
  goTo(i) {
    const s = this.sectionOf(i);
    if (s === undefined) return;
    this.section = s;
    this.showEditor();
    const q = (sel) => main.querySelector(sel);
    const k = instKey(i.inst);
    // se la regola si risolve compilando campi precisi (es. durata del lotto), vado direttamente su quelli, nello stesso lotto
    const ruleF = RULE_FIDS.filter(([re]) => re.test(i.id)).flatMap(([, f]) => f);
    const scope = (k && i.nodeId && q(`[data-node="${CSS.escape(i.nodeId)}"][data-inst="${k}"]`)) || main;
    const inScope = (f) => scope.querySelector(`.field[data-fid="${CSS.escape(f)}"]`);
    const byFid = ruleF.map(inScope).find(Boolean) || (i.fid && ((k && q(`.field[data-fid="${CSS.escape(i.fid)}"][data-inst="${k}"]`)) || q(`.field[data-fid="${CSS.escape(i.fid)}"]`)));
    let tgt = byFid;
    if (!tgt && i.fid) {
      // il campo non esiste ancora perché manca il gruppo (es. «Luogo di esecuzione»): lo creo e vado lì
      let pn = this.store.fields[i.fid]?.pn;
      const inLot = k && q(`[data-node][data-inst="${k}"]`);
      let holders = [];
      // il gruppo ripetibile può essere un nodo antenato di quello del campo: risalgo finché lo trovo
      while (pn && !holders.length) { holders = [...main.querySelectorAll(`[data-group="${CSS.escape(pn)}"]`)]; pn = this.store.nodes?.[pn]?.[0]; }
      const holder = (inLot && holders.find((hd) => inLot.contains(hd))) || holders[0];
      const add = holder && [...holder.children].filter((c) => c.classList?.contains("add")).pop();
      if (add && !holder.querySelector(".inst")) {
        add.click();
        const first = RULE_FIDS.filter(([re]) => re.test(i.id)).flatMap(([, f]) => f).map((f) => q(`[data-fid="${CSS.escape(f)}"]`)).find(Boolean);
        tgt = first || q(`[data-fid="${CSS.escape(i.fid)}"]`) || holder.querySelector(".inst") || holder;
      } else if (holder) tgt = holder.querySelector(".inst") || holder;
    }
    if (!tgt && i.nodeId) tgt = (k && q(`[data-node="${CSS.escape(i.nodeId)}"][data-inst="${k}"]`)) || q(`[data-node="${CSS.escape(i.nodeId)}"]`);
    if (tgt) {
      const target = tgt;
      let p = target.parentElement; while (p) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; }
      target.style.scrollMarginTop = "110px";
      target.scrollIntoView({ block: target.getBoundingClientRect().height > innerHeight * 0.6 ? "start" : "center" });
      target.classList.add("pulse");
      target.querySelector("input,select,textarea")?.focus({ preventScroll: true });
    }
  },

  /** Apre la sezione in cui si definisce un'entita' richiamata per identificativo (es. un lotto o un'organizzazione). */
  goToEntity(be) {
    const s = this.secOfEntity[be];
    if (s === undefined) return;
    this.section = s; this.showEditor(); window.scrollTo(0, 0);
  },

  // ------------------------------------------------------------ editor
  missing(items, ctx) {
    const nt = this.notice; let n = 0;
    for (const it of items) {
      if (it.f) { if (it.m === 1 && !it.h && !it.ro && isEmpty(nt.getValue(it.f, ctx))) n++; }
      else if (it.nd && it.r) for (const inst of nt.instances(it.nd, ctx)) n += this.missing(it.c, new Map(ctx).set(it.nd, inst));
      else n += this.missing(it.c, ctx);
    }
    return n;
  },
  refreshSide() {
    const side = document.getElementById("side"); if (!side) return;
    const i0 = (g) => this.notice.tree.indexOf(g);
    this.notice.tree.forEach((g, i) => {
      const pill = side.querySelector(`[data-sec="${i}"] .pill`); if (!pill) return;
      const m = g.nd && g.r
        ? this.notice.instances(g.nd, new Map()).reduce((a, inst) => a + this.missing(g.c, new Map().set(g.nd, inst)), 0)
        : this.missing(g.c, new Map());
      const e = this.lastResult ? this.lastResult.issues.filter((i) => i.role === "E" && this.sectionOf(i) === i0(g)).length : 0;
      pill.textContent = e ? `${e} da sistemare` : m ? `${m} da compilare` : "✓";
      pill.className = "pill" + (e ? " bad" : m ? "" : " ok");
    });
  },
  paintSaved() {
    const el = document.getElementById("saved");
    if (el && this.savedAt) el.textContent = `Bozza salvata sul tuo computer alle ${new Date(this.savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  },
  showEditor() {
    const { notice } = this;
    clear(main);
    const side = h("nav", { class: "side", id: "side", "aria-label": "Sezioni dell'avviso" },
      h("h2", {}, `Avviso ${notice.id}`),
      h("p", { class: "which" }, notice.info.n),
      h("div", { class: "status", id: "status", "aria-live": "polite" }),
      ...notice.tree.map((g, i) => h("button", { type: "button", "data-sec": i, "aria-current": String(this.section === i), onclick: () => { this.section = i; this.showEditor(); window.scrollTo(0, 0); } },
        g.n, h("span", { class: "pill" }, "…"))),
      h("hr"),
      h("button", { type: "button", "data-sec": "check", "aria-current": String(this.section === "check"), onclick: () => { this.section = "check"; this.showEditor(); window.scrollTo(0, 0); } }, "Controllo ed esportazione"),
      h("p", { class: "which", id: "saved" }));
    const content = h("div", { id: "content" });
    main.append(h("div", { class: "editor" }, side, content));
    if (this.section === "check") renderCheck(this, content);
    else {
      const form = new Form(this);
      const total = notice.tree.length;
      content.append(
        h("div", { class: "progress" }, h("span", {}, `Passo ${this.section + 1} di ${total + 1}`), h("div", { class: "bar2", "aria-hidden": "true" }, h("i", { style: `width:${Math.round(((this.section + 1) / (total + 1)) * 100)}%` }))),
        form.renderSection(notice.tree[this.section]));
    }
    this.refreshSide(); this.paintSaved(); this.paintActions(); this.paintStatus(); this.paintFooterBar();
  },
  paintFooterBar() {
    document.getElementById("actbar")?.remove();
    document.body.classList.toggle("working", !!this.notice);
    if (!this.notice) return;
    const total = this.notice.tree.length, last = this.section === total - 1, chk = this.section === "check";
    const go = (i) => { this.section = i; this.showEditor(); window.scrollTo(0, 0); };
    const bar = h("div", { class: "actbar", id: "actbar" },
      h("div", { class: "actbar-in" },
        !chk && this.section > 0 ? h("button", { type: "button", class: "btn sec", onclick: () => go(this.section - 1) }, "← Indietro") : chk ? h("button", { type: "button", class: "btn sec", onclick: () => go(total - 1) }, "← Indietro") : h("span"),
        h("span", { class: "sp" }),
        chk ? h("button", { type: "button", class: "btn pri", onclick: () => this.downloadXml() }, "Scarica l'XML")
          : h("button", { type: "button", class: "btn pri", onclick: () => go(last ? "check" : this.section + 1) }, last ? "Controlla e scarica →" : "Avanti →")));
    document.body.append(bar);
  },

  // ------------------------------------------------------------ file
  downloadXml() {
    this.notice.stampDispatch();
    const xml = generateXml(this.notice);
    const d = new Date(), p = (x) => String(x).padStart(2, "0");
    save(new Blob([xml], { type: "application/xml" }), `eforms-${this.notice.id}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xml`);
    this.saveDraft();
  },
  downloadDraft() {
    this.saveDraft();
    save(new Blob([JSON.stringify(this.notice.toJSON())], { type: "application/json" }), `bozza-eforms-${this.notice.id}.json`);
  },
  pickFile(accept, cb) {
    const inp = h("input", { type: "file", accept, hidden: true });
    inp.addEventListener("change", async () => { const f = inp.files[0]; if (f) { try { await cb(await f.text(), f); } catch (e) { notify("File non valido: " + (e.message || e)); } } inp.remove(); });
    document.body.append(inp); inp.click();
  },
  importFile() {
    this.pickFile(".xml,.json,application/xml,application/json", async (text, f) => {
      if (f.name.toLowerCase().endsWith(".json")) {
        const j = JSON.parse(text); const n = await Notice.create(this.store, j.notice); n.loadJSON(j); this.openNotice(n); this.scheduleLive();
      } else {
        const n = await importXml(this.store, text, this.env); this.openNotice(n); this.scheduleLive();
      }
    });
  },
  paintActions() {
    clear(actions);
    const b = (label, fn, cls = "", title) => h("button", { type: "button", class: `hbtn ${cls}`, title: title || label, onclick: fn }, h("span", { class: "lbl" }, label));
    actions.append(b("Apri un XML o una bozza…", () => this.importFile(), "", "Riprendi un avviso già scaricato dalla tua piattaforma (XML eForms) o una bozza salvata (.json)"));
    if (this.notice) {
      actions.append(b("Salva bozza", () => this.downloadDraft()), b("Cambia avviso", () => this.leave()), b("Scarica XML", () => this.downloadXml(), "pri"));
    }
  },
};

function save(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

document.getElementById("brand").addEventListener("click", (e) => { e.preventDefault(); app.leave(); });

(async () => {
  try {
    const store = await new Store((p) => fetch(`data/${p}`).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); })).init();
    app.store = store;
    app.help = await store.help();
    document.getElementById("sdkv").textContent = store.meta.sdk;
    window.__app = app; // utile per prove e diagnosi
    const want = new URLSearchParams(location.search).get("avviso");
    if (want && store.meta.notices.some((n) => n.id === want)) { history.replaceState(null, "", location.pathname); await app.newNotice(want); } else app.showPicker();
  } catch (e) {
    clear(main); main.append(h("p", { class: "summary bad" }, "Impossibile caricare i dati: " + e.message));
  }
})();

// piè di pagina a barra espandibile, come compiladgue.it
{
  const sf = document.getElementById("sf"), strip = document.getElementById("sfs");
  const toggle = () => { const o = sf.classList.toggle("open"); strip.setAttribute("aria-expanded", String(o)); };
  strip.addEventListener("click", (e) => { if (!e.target.closest("a")) toggle(); });
  strip.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
}
