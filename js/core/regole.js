// Indicazioni in italiano per le regole di validazione che l'utente non riesce a collegare da solo a un campo.
export const HINTS = [
  [/^BR-BT-00727/, "Aggiungi «Luogo di esecuzione» e indica almeno il Paese (es. Italia) e la suddivisione NUTS (es. ITF48 per la provincia BAT).", "Obbligatorio: indica il Paese e la suddivisione NUTS (es. Italia, ITF48)."],
  [/^BR-BT-00137/, "Nel lotto indica la durata del contratto (es. 12 mesi) oppure la data di inizio e la data di fine.", "Indica la durata, oppure la data di inizio e di fine."],
];
export const hintFor = (i) => HINTS.find(([re]) => re.test(i.id))?.[1];
export const shortHintFor = (i) => HINTS.find(([re]) => re.test(i.id))?.[2];

// Alcune regole si risolvono compilando campi diversi da quello segnalato: vanno mostrati anche se facoltativi.
export const RULE_FIDS = [
  [/^BR-BT-00727-0228/, ["BT-5141-Procedure", "BT-5071-Procedure"]],
  [/^BR-BT-00727-0230/, ["BT-5141-Lot", "BT-5071-Lot"]],
  [/^BR-BT-00137/, ["BT-36-Lot", "BT-36-Lot-Unit", "BT-536-Lot", "BT-537-Lot"]],
];

// ---- Campi che le regole UE rendono obbligatori per certi tipi di avviso, ma che l'elenco dei campi non segna come tali.
// Li mostriamo da subito (con la nota «Obbligatorio»), così non si scoprono solo al controllo finale.
const LUOGO_PROC = ["can-desg", "can-social", "can-standard", "cn-desg", "cn-social", "cn-standard", "compl", "corr", "pin-buyer", "pin-cfc-social", "pin-cfc-standard", "pin-only", "pin-rtl", "pmc", "qu-sy", "subco", "veat"];
const LUOGO_LOTTO = [...LUOGO_PROC.filter((t) => t !== "pin-buyer" && t !== "pin-only"), "can-tran", "pin-tran"];
const DURATA_SUB = ["7", "8", "9", "10", "11", "15", "16", "17", "18", "19", "22"];
const NOTA_LUOGO = "Obbligatorio: indica dove si svolge il contratto (Paese e suddivisione NUTS, es. Italia, ITF48 per la provincia BAT).";
const NOTA_DURATA = "Obbligatorio: indica la durata del contratto (es. 24 mesi), oppure la data di inizio e di fine.";

/** Mappa fid → nota «Obbligatorio» per il tipo di avviso aperto. */
export function requiredFor(subtype, noticeType) {
  const m = new Map();
  if (LUOGO_PROC.includes(noticeType)) ["BT-5141-Procedure", "BT-5071-Procedure"].forEach((f) => m.set(f, NOTA_LUOGO));
  if (LUOGO_LOTTO.includes(noticeType)) ["BT-5141-Lot", "BT-5071-Lot"].forEach((f) => m.set(f, NOTA_LUOGO));
  if (DURATA_SUB.includes(String(subtype))) ["BT-36-Lot", "BT-36-Lot-Unit", "BT-536-Lot", "BT-537-Lot"].forEach((f) => m.set(f, NOTA_DURATA));
  return m;
}
