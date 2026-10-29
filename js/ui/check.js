import { h, clear } from "./dom.js";
import { clean } from "../core/format.js";

const SEV = { E: "Errore", W: "Avviso", I: "Informazione", F: "Segnalazione" };

export function renderCheck(app, mount) {
  const { notice } = app;
  const box = h("div", { class: "panel" }, h("h2", {}, "Controllo ed esportazione"));
  const out = h("div", {});
  const bar = h("i", {});
  const status = h("span", { "aria-live": "polite" });
  const btn = h("button", { type: "button", class: "primary" }, "Controlla l'avviso");
  box.append(
    h("p", {}, "Il controllo applica le regole Schematron ufficiali dell'SDK eForms al tuo avviso. Gli errori (rossi) vanno risolti prima della pubblicazione; cliccando una voce si apre il campo da correggere."),
    h("div", { class: "check-head" }, btn, h("div", { class: "bar", "aria-hidden": "true" }, bar), status),
    out,
    h("div", { class: "nav2" }, h("span"), h("button", { type: "button", onclick: () => app.downloadXml() }, "Scarica l'XML")));
  mount.append(box);

  const show = (res) => {
    clear(out);
    app.lastResult = res;
    const errs = res.issues.filter((i) => i.role === "E");
    const warns = res.issues.filter((i) => i.role !== "E");
    app.setErrors(errs);
    if (!errs.length) out.append(h("div", { class: "next" }, h("b", {}, "Cosa fare adesso"),
      h("ol", {}, h("li", {}, "Scarica l'XML con il pulsante in basso."), h("li", {}, "Caricalo nella sezione avvisi della tua piattaforma di approvvigionamento digitale (se consente il caricamento di un XML eForms)."), h("li", {}, "La piattaforma esegue i suoi controlli e lo pubblica secondo le proprie procedure."))));
    out.append(errs.length
      ? h("div", { class: "summary bad" }, `${errs.length} ${errs.length === 1 ? "errore da correggere" : "errori da correggere"}${warns.length ? `, ${warns.length} segnalazioni` : ""}.`)
      : h("div", { class: warns.length ? "summary warn" : "summary ok" }, warns.length ? `Nessun errore. ${warns.length} segnalazioni da valutare.` : "Nessun errore: l'avviso supera tutti i controlli."));
    const list = (arr, title, open) => {
      if (!arr.length) return null;
      const ul = h("ul", { class: "issues" }, arr.map((i) => {
        const loc = app.locate(i);
        const where = loc ? h("span", { class: "where" }, loc.label) : h("span", { class: "where" }, "—");
        const b = h("button", { type: "button", class: `issue ${i.role}`, disabled: !loc, onclick: () => app.goTo(i) }, where,
          h("span", {}, clean(i.msg), h("code", {}, `${SEV[i.role] || i.role} · ${i.id}`)));
        return h("li", {}, b);
      }));
      return h("details", { class: "tech", open }, h("summary", {}, `${title} (${arr.length})`), ul);
    };
    const direct = errs.filter((i) => app.locate(i)), tech = errs.filter((i) => !app.locate(i));
    out.append(...[list(direct, "Errori sui campi", true), list(tech, "Errori strutturali (di norma si risolvono compilando i campi obbligatori)", !direct.length), list(warns, "Segnalazioni e avvisi", false)].filter(Boolean));
    if (res.errors.length) out.append(h("p", { class: "empty" }, `${res.errors.length} regole non eseguibili dal browser sono state saltate.`));
    app.refreshSide(); app.paintStatus();
  };

  btn.addEventListener("click", async () => {
    btn.disabled = true; clear(out); status.textContent = "Controllo in corso…"; bar.style.width = "2%";
    try {
      clearTimeout(app._live);
      const res = await app.validate((p) => { bar.style.width = `${Math.round(p * 100)}%`; });
      status.textContent = "Controllo completato.";
      show(res);
    } catch (e) {
      status.textContent = "";
      out.append(h("div", { class: "summary bad" }, `Impossibile completare il controllo: ${e.message || e}`));
    } finally { btn.disabled = false; bar.style.width = "100%"; }
  });
  // il controllo parte da solo quando si arriva qui
  if (app.lastResult && !app._dirty) show(app.lastResult); else btn.click();
}
