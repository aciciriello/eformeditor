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
