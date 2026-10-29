// Esegue le regole schematron ufficiali dell'SDK (compilate in JSON da tools/build_data.py) con fontoxpath.
// Semantica Schematron: in ogni pattern un nodo viene valutato solo dalla prima regola il cui contesto lo seleziona.

const VAR = /\$([A-Za-z_][\w.\-]*)/g;

/** Incorpora nell'espressione i `let` di cui ha bisogno (le sequenze di nodi non passano come variabili). */
function makeInliner(letList) {
  const defs = new Map(letList);              // nome -> espressione
  const order = letList.map((l) => l[0]);
  const cache = new Map();
  const needs = (expr, out = new Set()) => {
    for (const m of expr.matchAll(VAR)) {
      const n = m[1];
      if (defs.has(n) && !out.has(n)) { out.add(n); needs(defs.get(n), out); }
    }
    return out;
  };
  return (expr) => {
    if (cache.has(expr)) return cache.get(expr);
    const req = needs(expr);
    const res = req.size
      ? `let ${order.filter((n) => req.has(n)).map((n) => `$${n} := (${defs.get(n)})`).join(", ")} return (${expr})`
      : expr;
    cache.set(expr, res);
    return res;
  };
}

/** Percorso "/Radice[1]/cac:X[2]/..." di un nodo del DOM, uguale a quello calcolato dal generatore. */
export function pathKey(node) {
  if (node.nodeType === 2) node = node.ownerElement;
  const parts = [];
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    let idx = 1;
    for (let sib = n.previousSibling; sib; sib = sib.previousSibling) if (sib.nodeType === 1 && sib.nodeName === n.nodeName) idx++;
    parts.unshift(`${n.nodeName}[${idx}]`);
  }
  return "/" + parts.join("/");
}

function locate(node, map) {
  if (!map) return {};
  let key = pathKey(node);
  const own = map.get(key);
  while (key) {
    const hit = map.get(key);
    if (hit && hit.inst) return { nodeId: hit.nodeId, inst: hit.inst, fid: own && own.fid };
    key = key.slice(0, key.lastIndexOf("/"));
  }
  return {};
}

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

export async function validateXml(store, subtype, xml, env, { onProgress, map, yieldEvery = 0 } = {}) {
  const { fx } = env;
  const rules = await store.rules(subtype);
  const pats = await Promise.all(rules.p.map((id) => store.get(`rules/patterns/${id}.json`)));
  const diag = await store.get("diag.json");
  const doc = env.parse(xml);
  const ns = rules.ns;
  const opts = { namespaceResolver: (p) => ns[p] || null };
  const evalNodes = (e, ctx, vars) => fx.evaluateXPathToNodes(e, ctx, null, vars, opts);
  const evalBool = (e, ctx, vars) => fx.evaluateXPathToBoolean(e, ctx, null, vars, opts);

  // let di schema: valori semplici, passati come variabili
  const vars = {};
  for (const [name, expr] of rules.lets) {
    const r = fx.evaluateXPath(expr, doc, null, vars, fx.evaluateXPath.ANY_TYPE, opts);
    vars[name] = typeof r === "boolean" ? r : Array.isArray(r) ? (r[0] && r[0].nodeValue) || (r[0] && r[0].textContent) || "" : r && r.nodeValue !== undefined ? r.nodeValue : r;
  }

  const issues = [];
  const errors = []; // regole non eseguibili (compatibilita' del motore XPath)
  let done = 0, ticks = 0;
  for (const pat of pats) {
    const inline = makeInliner(pat.l || []);
    const fired = new Set();
    for (const rule of pat.r) {
      const ruleInline = rule.l ? makeInliner([...(pat.l || []), ...rule.l]) : inline;
      let nodes;
      try { nodes = evalNodes(ruleInline(rule.c), doc, vars); }
      catch (e) { errors.push({ context: rule.c, error: String(e.message || e).slice(0, 200) }); continue; }
      for (const node of nodes) {
        if (fired.has(node)) continue;
        fired.add(node);
        if (yieldEvery && ++ticks % yieldEvery === 0) await yieldUI();
        for (const [id, role, test, dg, msg] of rule.a) {
          let ok;
          try { ok = evalBool(ruleInline(test), node, vars); }
          catch (e) { errors.push({ id, error: String(e.message || e).slice(0, 200) }); continue; }
          if (!ok) {
            const d = dg && diag[dg];
            const see = d ? d[1] : "";
            const loc = locate(node, map);
            issues.push({
              id, role, msg, see,
              fid: see.startsWith("field:") ? see.slice(6) : loc.fid,
              nodeId: see.startsWith("node:") ? see.slice(5) : loc.nodeId,
              inst: loc.inst,
            });
          }
        }
      }
    }
    done++;
    if (onProgress) onProgress(done / pats.length);
  }
  return { issues, errors };
}
