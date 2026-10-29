# eformeditor.eu
Compilatore gratuito di avvisi eForms per il TED (Proiecta S.r.l.). Sito statico: basta caricare questa cartella
su qualsiasi hosting (nessun server applicativo, nessun database). Servire i file con MIME corretti
(`.js` come `text/javascript`, `.json` come `application/json`) e abilitare la compressione gzip/brotli
(la cartella `data/` pesa ~22 MB non compressi, ma il browser scarica solo i file dell'avviso scelto).

- `data/` generata da `tools/build_data.py` a partire da eForms SDK 1.15.1 (EUPL-1.2).
- `vendor/fontoxpath.bundle.js` – fontoxpath (MIT), motore XPath per le regole Schematron.
- Per aggiornare l'SDK: `python3 tools/build_data.py <cartella-SDK> site/data`.
