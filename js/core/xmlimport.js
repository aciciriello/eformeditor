// Legge un XML eForms esistente e lo trasforma nel modello dati (stessi metadati del generatore, in senso inverso).
import { Notice, newInst } from "./model.js";
import { parseDate, parseTime } from "./format.js";

const SUBTYPE_XP =
  "/*/ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/efext:EformsExtension/efac:NoticeSubType/cbc:SubTypeCode/text()";

/**
 * @param store  Store gia' inizializzato
 * @param xml    testo XML
 * @param env    { parse(xml) -> Document, fx: modulo fontoxpath }
 */
export async function importXml(store, xml, env) {
  const { fx } = env;
  const ns = { ...store.meta.docTypes.CN.extra };
  const opts = { namespaceResolver: (p) => ns[p] || null };
  const doc = env.parse(xml);
  const nodesOf = (xp, ctx) => fx.evaluateXPathToNodes(xp, ctx, null, null, opts);
  const stringsOf = (xp, ctx) => fx.evaluateXPathToStrings(xp, ctx, null, null, opts);

  const sub = stringsOf(SUBTYPE_XP, doc)[0];
  if (!sub || !store.noticeIndex[sub.trim()]) throw new Error("Sottotipo di avviso non riconosciuto nell'XML");
  const notice = await Notice.create(store, sub.trim(), { defaults: false });
  notice.root = newInst();
  const stats = { fields: 0, nodes: 0 };

  const text = (el) => (el.textContent || "").trim();

  function fillFields(nodeId, el, inst) {
    for (const fid of store.fieldsByNode[nodeId] || []) {
      const f = store.fields[fid];
      if (f.an || !notice.allowed.has(fid)) continue;
      let els;
      try { els = nodesOf(f.xp, el); } catch (e) { continue; }
      if (!els.length) continue;
      stats.fields++;
      if (f.t === "text-multilingual") {
        const map = {};
        for (const e of els) map[e.getAttribute("languageID") || notice.languages[0]] = text(e);
        inst.v[fid] = map;
      } else {
        let vals = els.map(text);
        if (f.t === "date") vals = vals.map(parseDate);
        if (f.t === "time") vals = vals.map(parseTime);
        inst.v[fid] = f.rp ? vals : vals[0];
      }
      for (const afid of f.at || []) {
        const af = store.fields[afid];
        if (af.an === "languageID") continue;
        const av = els[0].getAttribute(af.an);
        if (av !== null && av !== undefined && av !== "" && String(av) !== String(notice.presetOf(afid))) inst.v[afid] = av;
      }
    }
  }

  function fillNode(nodeId, el, inst) {
    stats.nodes++;
    fillFields(nodeId, el, inst);
    const g = notice.groups[nodeId];
    if (g && g.idf) inst.a.push(g.idf);
    for (const cid of store.childNodes[nodeId] || []) {
      const n = store.nodes[cid];
      let els;
      try { els = nodesOf(n[1], el); } catch (e) { continue; }
      if (!els.length) continue;
      if (!n[2]) els = els.slice(0, 1);
      inst.c[cid] = els.map((ce) => {
        const ci = newInst();
        fillNode(cid, ce, ci);
        return ci;
      });
    }
  }

  fillNode("ND-Root", doc.documentElement, notice.root);
  for (const m of notice.metaItems) if (notice.root.v[m.f] !== undefined) notice.root.a.push(m.f);
  notice.syncCounters();
  // se il file dichiara eForms 1.13 (es. scheletro generato dalla PAD) l'XML scaricato resta compatibile con quella versione
  notice.compat13 = /eforms-sdk-1\.13\b/.test(stringsOf("/*/cbc:CustomizationID/text()", doc).join(""));
  notice.importStats = stats;
  return notice;
}
