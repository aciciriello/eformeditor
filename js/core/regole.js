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
const NOTA_IMPORTO = "Obbligatorio per la tua piattaforma: indica il valore stimato dell'appalto al netto dell'IVA (importo maggiore di zero).";
const NOTA_INDIRIZZO = "Obbligatorio per le organizzazioni italiane (NUTS e CAP).";
const NOTA_ACCEL = "Obbligatorio: indica se la procedura è accelerata (sì/no).";
const NOTA_DURATA = "Obbligatorio: indica la durata del contratto (es. 24 mesi), oppure la data di inizio e di fine.";

/** Mappa fid → nota «Obbligatorio» per il tipo di avviso aperto. */
export function requiredFor(subtype, noticeType) {
  const m = new Map();
  if (LUOGO_PROC.includes(noticeType)) ["BT-5141-Procedure", "BT-5071-Procedure"].forEach((f) => m.set(f, NOTA_LUOGO));
  if (LUOGO_LOTTO.includes(noticeType)) ["BT-5141-Lot", "BT-5071-Lot"].forEach((f) => m.set(f, NOTA_LUOGO));
  if (DURATA_SUB.includes(String(subtype))) ["BT-36-Lot", "BT-36-Lot-Unit", "BT-536-Lot", "BT-537-Lot"].forEach((f) => m.set(f, NOTA_DURATA));
  // le piattaforme (PAD) rifiutano il bando senza importo stimato maggiore di zero (errori REG98/REG99)
  if (["cn-standard", "cn-social", "cn-desg"].includes(noticeType)) ["BT-27-Procedure", "BT-27-Lot"].forEach((f) => m.set(f, NOTA_IMPORTO));
  // indirizzo dell'organizzazione: per l'Italia servono sempre NUTS e CAP (regole BT-507 / BT-512)
  ["BT-507-Organization-Company", "BT-512-Organization-Company"].forEach((f) => m.set(f, NOTA_INDIRIZZO));
  // bandi: accelerata sì/no (scoperto con la scansione automatica dei sottotipi)
  if (["cn-standard", "cn-social"].includes(noticeType)) m.set("BT-106-Procedure", NOTA_ACCEL);
  return m;
}

/** Condizioni sul valore di altri campi, scoperte con la scansione dei sottotipi: [fid, funzione(get) → obbligatorio?]. */
export const REQ_COND = {
  "BT-15-Lot": (get) => get("BT-14-Lot") !== "restricted-document",
  "BT-18-Lot": (get) => get("BT-17-Lot") !== "not-allowed" && !!get("BT-17-Lot"),
};

/** Compatibilita' con le piattaforme che validano con eForms 1.13 (es. molte PAD): il numero massimo di partecipanti e' obbligatorio per gli accordi quadro. */
export const FA_CODES = ["fa-w-rc", "fa-mix", "fa-wo-rc"];
export const NOTA_MAXPART = "Obbligatorio per la tua piattaforma (eForms 1.13) quando si tratta di un accordo quadro: indica il numero massimo di operatori ammessi all'accordo quadro.";

/** Converte l'XML generato (SDK 1.15) nel vocabolario eForms 1.13: versione dichiarata e codici rinominati nella 1.14. */
export function toSdk113(xml) {
  return xml
    .replace(/(<cbc:CustomizationID>)eforms-sdk-1\.\d+(<\/cbc:CustomizationID>)/, "$1eforms-sdk-1.13$2")
    .replace(/(<cbc:TendererRequirementTypeCode listName="(?:exclusion-grounds-source|selection-criteria-source)">)epo-acc-espd-request(<)/g, "$1epo-sub-espd$2");
}
