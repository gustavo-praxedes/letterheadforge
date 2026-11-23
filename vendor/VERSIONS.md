# Bibliotecas de terceiros

Cópias das distribuições minificadas, versão fixa (spec §7.2). Nenhuma biblioteca de runtime é carregada de CDN. O SHA-256 foi calculado com `node:crypto` sobre o arquivo gravado em `vendor/`.

| Biblioteca | Versão | Arquivo | Origem | SHA-256 | Licença |
|---|---|---|---|---|---|
| pdf-lib | 1.17.1 | `vendor/pdf-lib/pdf-lib.min.js` | https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz (`dist/pdf-lib.min.js`) | `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` | MIT (c) 2019 Andrew Dillon |
| @pdf-lib/fontkit | 1.1.1 | `vendor/fontkit/fontkit.es.min.js` | https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz (`dist/fontkit.es.min.js`) | `911b7b69f220baff71bf123a15b16a8153ed46e68eeedfc224226d4c4ec967e7` | MIT — fork de `foliojs/fontkit` (Devon Govett) por Andrew Dillon |

As duas bibliotecas são MIT: o texto integral da licença acompanha cada pacote publicado no npm. Cada pasta de `vendor/` tem um `README.md` com versão, origem, licença, SHA-256 e o limite conhecido do fontkit com WOFF2.

Fontes: Fontsource via jsDelivr, SIL Open Font License 1.1. Versões e URLs testadas no spike T15 em `docs/02.01.00-DECISOES.md` §3.
