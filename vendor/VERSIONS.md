# Bibliotecas de terceiros

Cópias das distribuições minificadas, versão fixa (spec §7.2). Nenhuma biblioteca de runtime é carregada de CDN. O SHA-256 foi calculado com `node:crypto` sobre o arquivo gravado em `vendor/`.

| Biblioteca | Versão | Arquivo | Origem | SHA-256 | Licença |
|---|---|---|---|---|---|
| pdf-lib | 1.17.1 | `vendor/pdf-lib/pdf-lib.min.js` | https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz (`dist/pdf-lib.min.js`) | `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` | MIT (c) 2019 Andrew Dillon |
| @pdf-lib/fontkit | 1.1.1 | `vendor/fontkit/fontkit.umd.min.js` | https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz (`dist/fontkit.umd.min.js`) | `d8df561b9fba98e24f2e5130e40948809281bbbc55a20c412359f1a0a5eb35a6` | MIT — fork de `foliojs/fontkit` (Devon Govett) por Andrew Dillon |

As duas bibliotecas são MIT: o texto integral da licença acompanha cada pacote publicado no npm. Cada pasta de `vendor/` tem um `README.md` com versão, origem, licença, SHA-256 e o limite conhecido do fontkit com WOFF2.

Fontes: Fontsource via jsDelivr, SIL Open Font License 1.1. Versões e URLs testadas no spike T15 em `docs/02.01.00-DECISOES.md` §3.

O build **UMD** do fontkit substitui o build ES: o `fontkit.es.min.js` importa `pako` como dependência externa e
não roda sozinho (nem no worker, nem no Node). O UMD embute o pako e registra `self.fontkit`.
