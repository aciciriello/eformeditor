import { TAR } from "../core/tar.js";
import { PROC_ART } from "../core/codice.js";
import { clean } from "../core/format.js";
import { hintFor } from "../core/regole.js";
import { h, uid, clear } from "./dom.js";
import { combo } from "./combo.js";
import { isEmpty } from "../core/format.js";
import { confirmBox } from "./modal.js";

const SMALL_LIST = 40;
let instSeq = 0;
const instKeys = new WeakMap();
export const instKey = (inst) => {
  if (!inst) return "";
  if (!instKeys.has(inst)) instKeys.set(inst, String(++instSeq));
  return instKeys.get(inst);
};

/** Genera il modulo di una sezione dell'avviso a partire dai metadati dell'SDK. */
export class Form {
  /**
   * app: { store, notice, help, errors: Map<"fid|inst", string[]>, changed() }
   */
  constructor(app) { this.app = app; this.hidden = 0; }
  get store() { return this.app.store; }
  get notice() { return this.app.notice; }

  renderSection(group) {
    this.hidden = 0;
    const box = h("div", { class: "panel" }, h("h2", {}, group.n));
    // il gruppo di primo livello e' la sezione: ne mostriamo il contenuto
    const wrap = group.nd && group.r ? this.renderGroup({ ...group, s: 0, n: group.n }, new Map(), true) : this.renderItems(group.c, new Map());
    box.append(...[].concat(wrap));
    const app = this.app;
    const eb = app.buildErrBox();
    if (eb) box.querySelector("h2").after(eb);
    const toggle = (all) => { app.showAll = all; app.showEditor(); };
    if (app.showAll) box.querySelector("h2").after(h("p", { class: "mode" }, "Stai vedendo tutti i campi. ", h("button", { type: "button", class: "ghost", onclick: () => toggle(false) }, "Mostra solo l'essenziale")));
    else if (this.hidden) box.querySelector("h2").after(h("p", { class: "mode" }, `Qui vedi solo ciò che serve: gli altri ${this.hidden} campi sono facoltativi e compaiono da soli se diventano necessari. `,
      h("button", { type: "button", class: "ghost", onclick: () => toggle(true) }, "Mostra anche i facoltativi")));
    return box;
  }

  countFields(items) { return items.reduce((n, x) => n + (x.f ? (x.h ? 0 : 1) : this.countFields(x.c)), 0); }
  errTouch(g) {
    const a = this.app;
    return !!(g.nd && a.errNodes.has(g.nd)) || g.c.some((x) => (x.f ? a.errFids.has(x.f) : this.errTouch(x)));
  }
  fieldVisible(it, ctx) {
    if (it.h) return false;
    return this.app.showAll || it.m === 1 || this.app.required.has(it.f) || this.app.errFids.has(it.f) || !isEmpty(this.valueOf(it.f, ctx));
  }
  groupVisible(g, ctx) {
    return this.app.showAll || this.hasMandatory(g) || this.errTouch(g) || this.hasData(g.c, ctx);
  }

  renderItems(items, ctx) {
    const out = [];
    for (const it of items) {
      if (it.f) {
        if (!this.fieldVisible(it, ctx)) { if (!it.h) this.hidden++; continue; }
        const el = this.renderField(it, ctx); if (el) out.push(el);
      } else if (!this.groupVisible(it, ctx)) this.hidden += this.countFields(it.c);
      else out.push(...[].concat(this.renderGroup(it, ctx)));
    }
    return out;
  }

  // ------------------------------------------------------------------ gruppi
  hasMandatory(g) {
    return g.c.some((x) => (x.f ? (x.m === 1 && !x.h) || (this.app.required.has(x.f) && !x.h) : this.hasMandatory(x)));
  }
  hasData(items, ctx) {
    for (const it of items) {
      if (it.f) { if (!it.h && !isEmpty(this.valueOf(it.f, ctx))) return true; }
      else if (it.nd && it.r) { if (this.notice.instances(it.nd, ctx).some((i) => this.hasData(it.c, new Map(ctx).set(it.nd, i)))) return true; }
      else if (this.hasData(it.c, ctx)) return true;
    }
    return false;
  }
  valueOf(fid, ctx) {
    const f = this.store.fields[fid];
    const inst = this.notice.instFor(f.pn, ctx, false);
    return inst ? inst.v[fid] : undefined;
  }

  renderGroup(g, ctx, asSection = false) {
    const { notice } = this;
    if (g.nd && g.r) {
      const holder = h("div", { "data-group": g.nd });
      const paint = () => {
        clear(holder);
        let list = notice.instances(g.nd, ctx);
        if (!list.length && this.hasMandatory(g)) { notice.addInstance(g.nd, ctx); list = notice.instances(g.nd, ctx); }
        list.forEach((inst, idx) => {
          const sub = new Map(ctx).set(g.nd, inst);
          const cap = this.caption(g, inst);
          const remember = g.nd === "ND-Organization"
            ? h("button", { type: "button", class: "ghost", title: "Alla prossima compilazione ritroverai questi dati già inseriti", onclick: (e) => { this.app.saveProfile(inst); e.target.textContent = "✓ Ente ricordato su questo computer"; } }, "Ricorda come mio ente") : null;
          const head = h("header", {},
            h("b", {}, `${g.n}${list.length > 1 || g.idf ? " " + (g.idf ? this.notice.groupValue(g, inst, g.idf) || idx + 1 : idx + 1) : ""}`, cap ? ` — ${cap}` : ""),
            h("span", {}, remember, h("button", { class: "ghost danger", type: "button", onclick: () => {
              const del = () => { notice.removeInstance(g.nd, inst, ctx); paint(); this.app.changed(); };
              if (!this.hasData(g.c, sub)) del();
              else confirmBox(`Eliminare «${g.n}» con i dati inseriti?`, "Elimina").then((y) => y && del());
            } }, "Elimina")));
          holder.append(h("div", { class: "inst", "data-node": g.nd, "data-inst": instKey(inst) }, head, ...this.renderItems(g.c, sub)));
        });
        if (!list.length && this.errTouch(g)) holder.append(h("p", { class: "msg", role: "alert" }, `Obbligatorio: aggiungi «${g.n}» e compila i campi richiesti.`));
        holder.append(h("button", { type: "button", class: "add", onclick: () => { notice.addInstance(g.nd, ctx); paint(); this.app.changed(); } }, `+ Aggiungi ${g.n.toLowerCase()}`));
      };
      paint();
      if (asSection) return holder;
      return h("fieldset", {}, h("legend", {}, g.n), holder);
    }
    const kids = this.renderItems(g.c, ctx);
    if (!kids.length) return [];
    const open = this.hasMandatory(g) || this.hasData(g.c, ctx);
    const d = h("details", { class: "grp", "data-node": g.nd || "" }, h("summary", {}, g.n), ...kids);
    if (open) d.open = true;
    return d;
  }

  caption(g, inst) {
    if (!g.cap) return "";
    let v = this.notice.groupValue(g, inst, g.cap);
    if (v && typeof v === "object") v = Object.values(v).find((x) => x) || "";
    return v || "";
  }

  // ------------------------------------------------------------------ campi
  renderField(item, ctx) {
    const { notice, store } = this;
    const fid = item.f, f = store.fields[fid];
    if (!f || item.h) return null;
    const id = uid("f");
    const inst = notice.instFor(f.pn, ctx, false);
    const ro = !!item.ro || (inst && inst.a.includes(fid));
    const wrap = h("div", { class: "field", "data-fid": fid, "data-inst": instKey(inst) });
    const label = h("label", { for: id }, f.n,
      item.m === 1 || (this.app.required.has(fid) && !/^BT-(536|537|36-Lot-Unit)/.test(fid)) ? h("span", { class: "req", title: "Obbligatorio" }, "*") : item.m === 2 ? h("span", { class: "cond" }, "(obbligatorio in certi casi)") : null);
    const hp = this.app.help && this.app.help[fid];
    const lblRow = h("div", { class: "lbl-row" }, label);
    wrap.append(lblRow);
    if (this.app.required.has(fid) && /^(BT-5071|BT-36-Lot$)/.test(fid)) wrap.append(h("p", { class: "reqnote" }, this.app.required.get(fid)));
    if (hp) {
      const open = item.m === 1;
      const box = h("p", { class: "help", hidden: !open }, hp);
      lblRow.append(h("button", { type: "button", class: "helpb", "aria-label": "Mostra o nascondi la spiegazione", title: "Che cosa devo scrivere?", onclick: () => { box.hidden = !box.hidden; } }, "ⓘ"));
      wrap.append(box);
    }
    const cl = item.cl || f.cl;
    const get = () => notice.getValue(fid, ctx);
    const set = (v) => { notice.setValue(fid, v, ctx); this.app.changed(fid); wrap.classList.remove("has-error"); wrap.querySelector(".msg")?.remove(); };

    let body;
    if (f.rp) body = this.repeated(f, fid, id, get, set, cl, ro, item, ctx);
    else if (f.t === "text-multilingual") body = this.multilingual(f, fid, id, get, set, ro);
    else body = this.single(f, fid, id, get(), set, cl, ro, item, ctx);
    wrap.append(body);

    // errori da controllo precedente
    const msgs = this.app.errorsFor(fid, inst);
    if (msgs.length) {
      wrap.classList.add("has-error");
      wrap.append(h("p", { class: "msg", role: "alert" }, msgs[0] + (msgs.length > 1 ? ` (+${msgs.length - 1})` : "")));
    }
    return wrap;
  }

  /** Attributi visibili (valuta, unita' di misura, ...) accanto al campo principale. */
  attrEditors(f, fid, ctx, ro) {
    const { notice, store } = this;
    const out = [];
    for (const afid of f.at || []) {
      const af = store.fields[afid];
      if (!af || af.an === "languageID" || !af.cl || af.cl === "player-type") continue;
      if (notice.presetOf(afid) !== undefined) continue;
      const id = uid("a");
      const cur = () => notice.getValue(afid, ctx);
      const sel = this.select(af.cl, cur(), (v) => { notice.setValue(afid, v, ctx); this.app.changed(afid); }, { id, disabled: ro, short: true, label: af.an === "currencyID" || af.an === "unitCode" ? undefined : af.n });
      out.push(h("div", { class: "small", "data-attr": afid }, sel));
    }
    return out;
  }

  single(f, fid, id, value, set, cl, ro, item, ctx) {
    const { notice } = this;
    const pat = f.pt && !["date", "time"].includes(f.t) ? safeRe(f.pt) : null;
    const check = (el, v) => el.closest(".field")?.classList.toggle("bad-format", !!(pat && v && !pat.test(v)));
    const text = (type, extra = {}) => {
      const el = h("input", { type, id, value: value ?? "", disabled: ro, maxlength: f.ml || undefined, ...extra });
      el.addEventListener("input", () => { set(el.value); });
      el.addEventListener("blur", () => { check(el, el.value); });
      return el;
    };
    switch (f.t) {
      case "date": return text("date");
      case "time": return text("time");
      case "number": return text("number", { step: "any" });
      case "integer": return text("number", { step: "1" });
      case "url": return text("url", { placeholder: "https://…" });
      case "email": return text("email");
      case "phone": return text("tel");
      case "amount":
      case "measure": {
        const num = text("number", { step: "any", min: f.t === "measure" ? "0" : undefined });
        const row = h("div", { class: "row" }, num, ...this.attrEditors(f, fid, ctx, ro));
        if (f.t === "amount") {
          // la valuta e' quasi sempre l'euro: la proponiamo appena si scrive un importo
          num.addEventListener("input", () => {
            const afid = (f.at || []).find((a) => this.store.fields[a].an === "currencyID");
            if (afid && num.value && isEmpty(notice.getValue(afid, ctx))) {
              notice.setValue(afid, "EUR", ctx);
              const s = row.querySelector(`[data-attr="${afid}"] select`); if (s) s.value = "EUR";
            }
          });
        }
        return row;
      }
      case "indicator": {
        const name = uid("yn");
        const mk = (val, lab) => {
          const r = h("input", { type: "radio", name, value: val, disabled: ro, checked: String(value) === val });
          r.addEventListener("change", () => set(val));
          return h("label", {}, r, lab);
        };
        const clr = h("button", { type: "button", class: "ghost", onclick: (e) => { e.target.closest(".yn").querySelectorAll("input").forEach((x) => (x.checked = false)); set(undefined); } }, "Azzera");
        return h("div", { class: "yn", id }, mk("true", "Sì"), mk("false", "No"), clr);
      }
      case "code": return this.select(cl, value, set, { id, disabled: ro });
      case "id-ref": return this.idRef(f, id, value, set, ro);
      case "id": return text("text");
      default: {
        const long = !f.ml || f.ml >= 300;
        if (long) {
          const el = h("textarea", { id, disabled: ro, maxlength: f.ml || undefined, rows: 3 }, value ?? "");
          el.addEventListener("input", () => set(el.value));
          return el;
        }
        return text("text");
      }
    }
  }

  select(cl, value, onPick, { id, disabled, short, label } = {}) {
    const holder = h("div", {}, h("input", { type: "text", id, disabled: true, value: "Caricamento elenco…" }));
    this.store.codelist(cl).then((list) => {
      let el;
      if (list.length <= SMALL_LIST || short) {
        el = h("select", { id, disabled, "aria-label": label }, h("option", { value: "" }, label ? `${label}…` : short ? "—" : "— scegli —"),
          ...list.map((e) => h("option", { value: e[0], selected: e[0] === value }, short && cl === "currency" ? e[0] : short ? e[1] : `${e[1]}${e[1] === e[0] ? "" : ` (${e[0]})`}${cl === "procurement-procedure-type" && PROC_ART[e[0]] ? ` — ${PROC_ART[e[0]]} D.Lgs. 36/2023` : ""}`)));
        if (value && !list.some((e) => e[0] === value)) el.append(h("option", { value, selected: true }, value));
        el.addEventListener("change", () => onPick(el.value || undefined));
      } else el = combo(list, value, onPick, { id, disabled });
      holder.replaceChildren(el);
    }).catch(() => holder.replaceChildren(h("input", { type: "text", id, value: value ?? "", disabled, onchange: (e) => onPick(e.target.value) })));
    return holder;
  }

  idRef(f, id, value, set, ro) {
    const { notice } = this;
    const sel = h("select", { id, disabled: ro });
    const fill = () => {
      const cur = sel.value || value;
      const ents = notice.entities(f.rf || [], f.is);
      sel.replaceChildren(h("option", { value: "" }, ents.length ? "— scegli —" : "— nessuna voce disponibile: inseriscila prima nella sezione corrispondente —"),
        ...ents.map((e) => h("option", { value: e.id, selected: e.id === cur }, e.caption ? `${e.id} — ${e.caption}` : e.id)));
      if (cur && !ents.some((e) => e.id === cur)) sel.append(h("option", { value: cur, selected: true }, cur));
    };
    fill();
    // una sola scelta possibile: la selezioniamo noi (es. l'unica organizzazione inserita)
    if (!value && !ro) {
      const ents = notice.entities(f.rf || [], f.is);
      if (ents.length === 1) { sel.value = ents[0].id; set(ents[0].id); }
    }
    sel.addEventListener("mousedown", fill);
    sel.addEventListener("focus", fill);
    sel.addEventListener("change", () => set(sel.value || undefined));
    const be = (f.rf || []).find((b) => this.app.secOfEntity[b] !== undefined);
    const row = be === undefined ? sel : h("div", { class: "row" }, sel, h("button", { type: "button", class: "ghost small", onclick: () => this.app.goToEntity(be) }, "Vai all'elenco →"));
    // organo di ricorso: si sceglie il TAR da un elenco e l'organizzazione viene creata da sola
    if (!/ReviewTerms$/.test(f.pn || "") || ro) return row;
    const tar = h("select", { class: "tarpick", "aria-label": "Aggiungi un TAR" }, h("option", { value: "" }, "+ Aggiungi qui il TAR competente…"),
      ...TAR.map((t, i) => h("option", { value: String(i) }, t.n)));
    const msg = h("p", { class: "hint", hidden: true });
    tar.addEventListener("change", () => {
      if (tar.value === "") return;
      const id = this.app.addTar(TAR[+tar.value]);
      tar.value = ""; fill(); sel.value = id; set(id);
      msg.hidden = false;
      msg.textContent = `Ho aggiunto ${id} all'elenco delle organizzazioni. Controlla e completa i suoi dati (via, codice fiscale, e-mail) nella sezione «Organizzazioni».`;
    });
    return h("div", {}, row, tar, msg);
  }

  multilingual(f, fid, id, get, set, ro) {
    const cur = { ...(get() || {}) };
    const langs = this.notice.languages;
    const long = !f.ml || f.ml >= 200;
    return h("div", {}, ...langs.map((l, i) => {
      const el = long
        ? h("textarea", { id: i ? undefined : id, disabled: ro, maxlength: f.ml || undefined, rows: 2, "aria-label": `${f.n} (${l})` }, cur[l] ?? "")
        : h("input", { type: "text", id: i ? undefined : id, disabled: ro, maxlength: f.ml || undefined, value: cur[l] ?? "", "aria-label": `${f.n} (${l})` });
      el.addEventListener("input", () => { if (el.value) cur[l] = el.value; else delete cur[l]; set({ ...cur }); });
      return h("div", { class: "lang" }, h("b", {}, l), el);
    }));
  }

  repeated(f, fid, id, get, set, cl, ro, item, ctx) {
    const box = h("div", {});
    let vals = [].concat(get() ?? []).filter((x) => x !== undefined);
    const paint = () => {
      clear(box);
      if (!vals.length) vals = [undefined];
      vals.forEach((v, i) => {
        const ed = this.single(f, fid, i ? undefined : id, v, (nv) => { vals[i] = nv; set(vals.filter((x) => !isEmpty(x))); }, cl, ro, item, ctx);
        const rm = vals.length > 1 ? h("button", { type: "button", class: "ghost danger", "aria-label": "Rimuovi", onclick: () => { vals.splice(i, 1); set(vals.filter((x) => !isEmpty(x))); paint(); } }, "✕") : null;
        box.append(h("div", { class: "valrow" }, ed, rm));
      });
      box.append(h("button", { type: "button", class: "ghost", onclick: () => { vals.push(undefined); paint(); } }, "+ Aggiungi un altro valore"));
    };
    paint();
    return box;
  }
}

function safeRe(p) { try { return new RegExp(p); } catch { return null; } }
