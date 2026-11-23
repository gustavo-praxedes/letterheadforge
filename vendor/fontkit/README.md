# @pdf-lib/fontkit (cópia minificada)

- Versão: **1.1.1**
- Arquivo: `fontkit.es.min.js` (bundle ES module, pronto para `import`)
- Origem: `https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz`, arquivo `dist/fontkit.es.min.js`
- Licença: MIT — fork de `foliojs/fontkit` (Devon Govett) mantido por Andrew Dillon
- SHA-256: `911b7b69f220baff71bf123a15b16a8153ed46e68eeedfc224226d4c4ec967e7`

Cópia fiel, sem edição, do arquivo publicado no npm. Não altere este arquivo: para
atualizar a biblioteca, troque a versão e registre o novo SHA-256 em
`vendor/VERSIONS.md` e em `docs/02.01.00-DECISOES.md`.

Uso no projeto (spec §7.1/§7.2): métricas de fonte, quebra de linha e subconjunto
incorporado ao PDF, em `src/pdf/`. É registrado em `pdfDoc.registerFontkit(fontkit)`
antes de `embedFont`. O mesmo arquivo é usado no preview e na exportação.

Limite conhecido, medido no spike T15: `fontkit.create()` lê WOFF2, mas o
subconjunto (`subset: true`) falha em WOFF2 de Inter com
`RangeError: Index out of range` em `TTFSubset.encode`. O projeto usa arquivos WOFF
do Fontsource enquanto a falha existir. Ver `docs/02.01.00-DECISOES.md` §3.
