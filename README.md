# LetterheadForge

[![site](https://img.shields.io/badge/site-online-2F6F60)](https://gustavo-praxedes.github.io/letterheadforge/) [![versão](https://img.shields.io/badge/versão-0.1.0-081525)](https://github.com/gustavo-praxedes/letterheadforge/releases/tag/v0.1.0)

**No ar:** https://gustavo-praxedes.github.io/letterheadforge/

Aplicação web estática que gera um PDF A4 para impressão doméstica, com 1 página A4, 2 páginas A5 ou 4 páginas A6 — todas com a mesma configuração de pauta, moldura, marca d'água, imagens e caixas de texto.

- Especificação: [`docs/02.00.00-ESPECIFICACOES.md`](docs/02.00.00-ESPECIFICACOES.md) · Plano do marco 1: [`docs/03.00.00-PLANO-MARCO-1.md`](docs/03.00.00-PLANO-MARCO-1.md) · Contratos do núcleo: [`docs/03.01.00-CONTRATOS-NUCLEO-M1.md`](docs/03.01.00-CONTRATOS-NUCLEO-M1.md)
- Convenções de trabalho dos agentes: [`AGENTS.md`](AGENTS.md)

## Privacidade

Tudo roda no navegador. Sem backend, sem telemetria, sem cookies, sem envio de dados. O único tráfego externo é o download das fontes pelo jsDelivr (Fontsource).

## Requisitos

- Node.js LTS (testes e servidor local)
- Navegador atual (Chrome, Edge, Firefox, Safari)

## Desenvolvimento local

```bash
npm ci
npm test        # testes do núcleo (node --test)
npm run lint    # ESLint 9
npm run serve   # http-server em http://localhost:8080
```

Módulos ES nativos: a aplicação não abre por `file://`, use o servidor local.

## Estado

Marco 1 (núcleo geométrico, testes e spike de fontes) em execução. A interface e a exportação de PDF entram nos marcos 2 e 3.

## Licenças de terceiros

- Fonte Inter (SIL Open Font License 1.1), servida pelo Fontsource via jsDelivr.
- Bibliotecas de runtime em `vendor/`: ver [`vendor/VERSIONS.md`](vendor/VERSIONS.md).

## Licença

MIT — Copyright (c) 2026 Gustavo Praxedes. Ver [`LICENSE`](LICENSE).
