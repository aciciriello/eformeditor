// Statistiche di visita (Google Analytics 4): si attivano solo dopo il consenso esplicito.
// Non vengono mai inviati il contenuto degli avvisi, i file aperti o i dati dell'ente: solo le visite alla pagina.
const GA_ID = "G-R1CLJKGMJR";
const KEY = "eformeditor:consenso";

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* senza storage il banner ricompare */ } };

let loaded = false;
function loadGA() {
  if (loaded) return; loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.append(s);
}

function stopGA() {
  window[`ga-disable-${GA_ID}`] = true;
  // elimina i cookie di Analytics già impostati
  const host = location.hostname, parts = host.split(".");
  const domains = [host, "." + host, "." + parts.slice(-2).join(".")];
  document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => n === "_ga" || n.startsWith("_ga_") || n === "_gid")
    .forEach((n) => domains.forEach((d) => { document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`; }));
}

function banner() {
  document.getElementById("cookiebar")?.remove();
  const choose = (v) => {
    write(v); bar.remove();
    if (v === "si") { window[`ga-disable-${GA_ID}`] = false; loadGA(); } else stopGA();
  };
  const bar = document.createElement("div");
  bar.id = "cookiebar"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Preferenze cookie");
  bar.innerHTML = `<p><b>Statistiche di visita.</b> Usiamo Google Analytics per capire quanto viene usato lo strumento. Si attiva solo se accetti. Gli avvisi che compili non vengono mai inviati. <a href="privacy.html">Privacy e cookie</a></p>
    <div class="ck-btns"><button type="button" class="btn sec" data-v="no">Rifiuta</button><button type="button" class="btn pri" data-v="si">Accetta</button></div>`;
  bar.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => choose(b.dataset.v)));
  document.body.append(bar);
}

const saved = read();
if (saved === "si") loadGA(); else if (saved !== "no") banner();
document.addEventListener("click", (e) => { if (e.target.closest("[data-cookie-prefs]")) { e.preventDefault(); banner(); } });
