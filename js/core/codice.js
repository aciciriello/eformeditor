// Riferimenti al D.Lgs. 36/2023 (Codice dei contratti pubblici) per fasi e procedure.
export const CODICE = "D.Lgs. 36/2023";

/** Articolo del Codice per ogni tipo di procedura (lista di codici eForms procurement-procedure-type). */
export const PROC_ART = {
  open: "art. 71",
  restricted: "art. 72",
  "neg-w-call": "art. 73",
  "comp-dial": "art. 74",
  innovation: "art. 75",
  "neg-wo-call": "art. 76; sottosoglia art. 50",
};

/** Riferimento per fase (campo FORM del selettore). */
export const FASE_ART = {
  planning: "artt. 81 (avvisi di pre-informazione) e 161 (avviso periodico indicativo, settori speciali)",
  consultation: "art. 77 (consultazioni preliminari di mercato)",
  competition: "art. 83 (bandi e avvisi); procedure: aperta art. 71, ristretta art. 72, competitiva con negoziazione art. 73, dialogo competitivo art. 74, partenariato per l'innovazione art. 75, negoziata senza bando art. 76",
  result: "art. 111 (avvisi relativi agli appalti aggiudicati)",
  "cont-modif": "art. 120 (modifica dei contratti in esecuzione); concessioni art. 189",
  "dir-awa-pre": "art. 86 (avviso volontario per la trasparenza preventiva)",
};
export const FASE_BREVE = {
  planning: "artt. 81, 161",
  consultation: "art. 77",
  competition: "art. 83 · artt. 71–76",
  result: "art. 111",
  "cont-modif": "art. 120",
  "dir-awa-pre": "art. 86",
};

/** Riferimento specifico per singolo avviso, dove più preciso di quello di fase. */
export function noticeArt(n) {
  const id = String(n.id), lb = n.lb;
  if (id === "E1") return "art. 77";
  if (id === "15") return "art. 162 (sistema di qualificazione)";
  if (["23", "24", "36", "37"].includes(id)) return "art. 46 (concorsi di progettazione)";
  if (n.form === "competition" && lb === "32014L0023") return "art. 182 (bando di concessione)";
  if (n.form === "planning" && lb === "32014L0025") return "art. 161";
  if (n.form === "planning" && lb === "32014L0024") return "art. 81";
  if (n.form === "cont-modif" && lb === "32014L0023") return "art. 189";
  if (n.form === "result" && lb === "32014L0023") return null;
  if (n.form === "competition" && (lb === "32014L0024" || lb === "32014L0025")) return FASE_BREVE.competition;
  return FASE_BREVE[n.form] || null;
}
