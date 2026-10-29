// Accesso ai dati generati da tools/build_data.py. Funziona identico nel browser (fetch) e in Node (fs).
export class Store {
  constructor(fetchJSON) {
    this.fetchJSON = fetchJSON;
    this.cache = new Map();
  }

  async init() {
    const [meta, fields, nodes, order, multi] = await Promise.all([
      this.fetchJSON("meta.json"),
      this.fetchJSON("fields.json"),
      this.fetchJSON("nodes.json"),
      this.fetchJSON("order.json"),
      this.fetchJSON("multi.json"),
    ]);
    this.multi = multi;
    this.meta = meta;
    this.fields = fields;
    this.nodes = nodes;
    this.order = order;
    // indici derivati
    this.fieldsByNode = {};
    for (const [id, f] of Object.entries(fields)) {
      (this.fieldsByNode[f.pn] ||= []).push(id);
    }
    this.childNodes = {};
    for (const [id, n] of Object.entries(nodes)) {
      if (n[0]) (this.childNodes[n[0]] ||= []).push(id);
    }
    this.noticeIndex = Object.fromEntries(meta.notices.map((n) => [n.id, n]));
    return this;
  }

  async get(path) {
    if (!this.cache.has(path)) this.cache.set(path, this.fetchJSON(path));
    return this.cache.get(path);
  }

  notice(id) { return this.get(`notice/${id}.json`); }
  codelist(id) { return this.get(`codelists/${id}.json`); }
  help() { return this.get("help.json"); }
  rules(id) { return this.get(`rules/${id}.json`); }

  /** Catena di nodi dalla radice (esclusa) fino al nodo indicato (incluso). */
  chain(nodeId) {
    const out = [];
    let cur = nodeId;
    while (cur && this.nodes[cur] && this.nodes[cur][0]) {
      out.unshift(cur);
      cur = this.nodes[cur][0];
    }
    return out;
  }
}
