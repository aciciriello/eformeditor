import { h, clear } from "./dom.js";
import { confirmBox } from "./modal.js";

import { FASE_BREVE, FASE_ART, noticeArt, CODICE } from "../core/codice.js";
const FORM = {
  planning: ["Pianificazione", "Preinformazione e avvisi periodici indicativi"],
  consultation: ["Consultazione di mercato", "Consultazione preliminare, volontaria"],
  competition: ["Indizione di gara", "Bandi, avvisi di gara, concorsi di progettazione, sistemi di qualificazione"],
  result: ["Aggiudicazione", "Avvisi sui risultati della procedura"],
  "cont-modif": ["Modifica di un contratto", "Modifiche durante il periodo di validità"],
  "dir-awa-pre": ["Trasparenza ex ante", "Affidamenti diretti senza previa pubblicazione"],
  completion: ["Completamento", "Esecuzione conclusa del contratto (volontario)"],
  bri: ["Registrazione dell'impresa", "Informazioni per GEIE e società europee"],
};
const LB = {
  "32014L0024": "Dir. 2014/24/UE – appalti, settori ordinari",
  "32014L0025": "Dir. 2014/25/UE – settori speciali",
  "32014L0023": "Dir. 2014/23/UE – concessioni",
  "32009L0081": "Dir. 2009/81/CE – difesa e sicurezza",
  "32007R1370": "Reg. 1370/2007 – trasporto pubblico",
  "32024R2509": "Reg. 2024/2509 – bilancio UE",
  "31985R2137": "Reg. 2137/85 – GEIE",
  "32001R2157": "Reg. 2157/2001 – società europea",
  other: "Avvisi volontari (nessuna direttiva)",
};
export const labelLb = (k) => LB[k] || k;

export function renderPicker(app, mount) {
  const { store } = app;
  const st = app.pick || (app.pick = { form: null, lb: null, q: "" });
  const notices = store.meta.notices;

  const paint = () => {
    clear(mount);
    mount.append(h("section", { class: "hero" },
      h("h1", {}, "Compila il tuo avviso eForms per il TED"),
      h("p", {}, "Scegli il tipo di avviso, compila solo i campi essenziali e scarica l'XML già verificato con le regole ufficiali dell'Unione europea, pronto da caricare sulla tua piattaforma di e-procurement.")));

    const drafts = app.listDrafts();
    if (drafts.length) {
      mount.append(h("div", { class: "drafts" }, h("b", {}, "Bozze salvate su questo computer"),
        h("ul", { class: "issues" }, drafts.map((d) => h("li", {},
          h("span", {}, `${d.id} – ${d.title || "senza titolo"} · ${new Date(d.saved).toLocaleString("it-IT")}`),
          h("button", { type: "button", class: "primary", onclick: () => app.openDraft(d.id) }, "Riprendi"),
          h("button", { type: "button", class: "ghost danger", onclick: async () => { if (await confirmBox("Eliminare la bozza salvata?", "Elimina")) { app.deleteDraft(d.id); paint(); } } }, "Elimina"))))));
    }

    mount.append(h("p", { class: "step" }, h("span", {}, "1"), "In che fase è la procedura?"));
    const forms = Object.keys(FORM).filter((k) => notices.some((n) => n.form === k));
    mount.append(h("div", { class: "choices", role: "group" }, forms.map((k) =>
      h("button", { type: "button", class: "choice", "aria-pressed": String(st.form === k), onclick: () => { st.form = st.form === k ? null : k; st.lb = null; paint(); } },
        h("b", {}, FORM[k][0]), h("small", {}, FORM[k][1]),
        FASE_BREVE[k] ? h("small", { class: "art", title: FASE_ART[k] }, `${CODICE}: ${FASE_BREVE[k]}`) : null))));

    if (st.form && FASE_ART[st.form]) mount.append(h("p", { class: "legal" }, h("b", {}, `Riferimento ${CODICE}: `), FASE_ART[st.form] + "."));
    if (st.form) {
      const lbs = [...new Set(notices.filter((n) => n.form === st.form).map((n) => n.lb))];
      if (lbs.length === 1) st.lb = lbs[0];
      mount.append(h("p", { class: "step" }, h("span", {}, "2"), "Quale normativa si applica?"));
      mount.append(h("div", { class: "choices", role: "group" }, lbs.map((k) =>
        h("button", { type: "button", class: "choice", "aria-pressed": String(st.lb === k), onclick: () => { st.lb = st.lb === k ? null : k; paint(); } }, h("b", {}, labelLb(k))))));
    }

    const ready = st.form && st.lb;
    const searching = st.q.trim().length > 0;
    const list = notices.filter((n) => (!ready || (n.form === st.form && n.lb === st.lb)) &&
      (!searching || (n.id + " " + n.n).toLowerCase().includes(st.q.trim().toLowerCase())));
    mount.append(h("p", { class: "step" }, h("span", {}, ready ? "3" : "…"), ready ? "Scegli l'avviso" : "Oppure cerca per numero o parola"));
    const q = h("input", { type: "search", class: "search", placeholder: "Cerca per numero o parola (es. 16, aggiudicazione, concessioni)", value: st.q, "aria-label": "Cerca un avviso",
      style: "padding:.5rem .7rem;border:1px solid #8794a1;border-radius:.4rem;font:inherit;background:var(--card);color:inherit" });
    q.addEventListener("input", () => { st.q = q.value; const pos = q.selectionStart; paint(); const nq = mount.querySelector(".search"); nq.focus(); nq.setSelectionRange(pos, pos); });
    mount.append(q);
    if (!ready && !searching) {
      mount.append(h("p", { class: "empty" }, st.form ? "Ora scegli la normativa che si applica." : "Scegli la fase della procedura, oppure cerca un avviso per numero o parola."));
    } else {
      mount.append(h("div", { class: "notices" }, list.length ? list.map((n) =>
        h("button", { type: "button", class: "notice-card", onclick: () => app.newNotice(n.id) },
          h("span", { class: "num", "aria-label": "Sottotipo" }, n.id),
          h("span", {}, h("span", { class: "t" }, n.n), h("small", {}, `${FORM[n.form]?.[0] || n.form} · ${labelLb(n.lb)}`), noticeArt(n) ? h("small", { class: "art" }, `${CODICE}: ${noticeArt(n)}`) : null))) : h("p", { class: "empty" }, "Nessun avviso corrisponde ai filtri.")));
    }
    const row = (k, v) => h("div", { class: "crow" }, h("dt", {}, k), h("dd", {}, v));
    mount.append(h("section", { class: "compat panel", "aria-labelledby": "cmp" },
      h("h2", { id: "cmp" }, "Compatibilità"),
      h("dl", {},
        row("Piattaforme", "Compatibile con tutte le piattaforme di approvvigionamento digitale (PAD) italiane certificate AgID che adottano il formato eForms."),
        row("Formato", `XML eForms secondo l'eForms SDK ${store.meta.sdk} (UBL 2.3), tutti e 51 i sottotipi di avviso.`),
        row("Controlli", "Verifica con le regole di validazione ufficiali (schema XSD e Schematron) dell'Ufficio delle pubblicazioni dell'Unione europea."),
        row("Riferimenti normativi", "D.Lgs. 36/2023; Regolamento di esecuzione (UE) 2019/1780 e successive modifiche."),
        row("Riservatezza", ["I file sono letti ed elaborati nel tuo browser: i dati che inserisci non vengono inviati a nessun server. ", h("a", { href: "privacy.html" }, "Privacy e cookie")]))));
  };
  paint();
}
