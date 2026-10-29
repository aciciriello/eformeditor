import { h } from "./dom.js";

/** Campo con ricerca per elenchi lunghi (CPV, NUTS, ...). list = [[codice, etichetta, padre?], ...] */
export function combo(list, value, onPick, { id, disabled, placeholder = "Scrivi per cercare per codice o descrizione…" } = {}) {
  const byCode = new Map(list.map((e) => [e[0], e]));
  const show = (e) => (e ? `${e[0]} — ${e[1]}` : "");
  const inp = h("input", { type: "text", id, autocomplete: "off", placeholder, role: "combobox", "aria-expanded": "false", disabled });
  const ul = h("ul", { class: "combo-list", role: "listbox", hidden: true });
  let cur = value, sel = -1, res = [];
  inp.value = value ? show(byCode.get(value) || [value, ""]) : "";

  const close = () => { ul.hidden = true; inp.setAttribute("aria-expanded", "false"); };
  const open = () => { ul.hidden = false; inp.setAttribute("aria-expanded", "true"); };
  const pick = (e) => { cur = e ? e[0] : undefined; inp.value = show(e); close(); onPick(cur); };
  const paint = () => {
    ul.replaceChildren(...res.map((e, i) => {
      const li = h("li", { role: "option", "aria-selected": String(i === sel) }, h("small", {}, e[0]), e[1]);
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); pick(e); });
      return li;
    }));
    if (!res.length) ul.replaceChildren(h("li", { class: "empty" }, "Nessun risultato"));
  };
  const search = () => {
    const q = inp.value.trim().toLowerCase();
    const starts = [], has = [];
    for (const e of list) {
      if (starts.length + has.length >= 60) break;
      if (!q || e[0].toLowerCase().startsWith(q)) starts.push(e);
      else if (e[1].toLowerCase().includes(q)) has.push(e);
    }
    res = starts.concat(has).slice(0, 60); sel = res.length ? 0 : -1; paint(); open();
  };
  inp.addEventListener("input", search);
  inp.addEventListener("focus", () => { inp.select(); });
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault(); if (ul.hidden) search();
      sel = Math.max(0, Math.min(res.length - 1, sel + (ev.key === "ArrowDown" ? 1 : -1))); paint();
      ul.children[sel]?.scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter" && !ul.hidden) { ev.preventDefault(); if (res[sel]) pick(res[sel]); }
    else if (ev.key === "Escape") close();
  });
  inp.addEventListener("blur", () => {
    const t = inp.value.trim();
    if (!t) { if (cur !== undefined) pick(null); else close(); return; }
    const exact = byCode.get(t) || byCode.get(t.split(/\s+—\s+/)[0]);
    if (exact) { if (exact[0] !== cur) pick(exact); else { inp.value = show(exact); close(); } }
    else { inp.value = cur ? show(byCode.get(cur) || [cur, ""]) : ""; close(); }
  });
  return h("div", { class: "combo" }, inp, ul);
}
