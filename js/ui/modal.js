import { h } from "./dom.js";

/** Finestre di conferma e avviso dentro la pagina (i dialoghi del browser non sono sempre disponibili). */
export function confirmBox(message, yes = "Conferma", no = "Annulla") {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const done = (v) => { ov.remove(); prev?.focus?.(); resolve(v); };
    const ok = h("button", { type: "button", class: "primary", onclick: () => done(true) }, yes);
    const ov = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", onkeydown: (e) => { if (e.key === "Escape") done(false); } },
      h("div", { class: "dialog" }, h("p", {}, message), h("div", { class: "nav2" }, h("button", { type: "button", onclick: () => done(false) }, no), ok)));
    document.body.append(ov); ok.focus();
  });
}

export function notify(message) {
  const t = h("div", { class: "toast", role: "status" }, message);
  document.body.append(t);
  setTimeout(() => t.remove(), 6000);
}
