# Checklist manual — contraste, teclado e impressão

Complemento dos testes automatizados. Cada item tem que ser refeito quando `tokens.css` ou `base.css` mudarem.

## 1. Contraste (WCAG AA: texto ≥ 4,5:1, componente ≥ 3:1)

Medido por fórmula (luminância relativa), não por opinião. Recalcular com os pares em `src/styles/tokens.css`.

| Par | Razão | Limite | Situação |
|---|---|---|---|
| `--color-text` sobre `--color-surface` | 16,54:1 | 4,5 | passa |
| `--color-text-muted` sobre `--color-surface` | 8,02:1 | 4,5 | passa |
| `--color-text-muted` sobre `--color-surface-muted` | 7,42:1 | 4,5 | passa |
| `--color-text-muted` sobre `--color-surface-sunken` | 6,90:1 | 4,5 | passa |
| `--color-accent-contrast` sobre `--color-accent` | 5,89:1 | 4,5 | passa |
| `--color-accent-contrast` sobre `--color-accent-strong` | 8,29:1 | 4,5 | passa |

Registro: a revisão visual cega da rodada 3 apontou o status do preview e a aba inativa como "baixo contraste". A medição acima desmente (6,9:1 e 7,42:1). Vale a medição — AGENTS.md §4: opinião do revisor não substitui o checklist.

## 2. Teclado

- [ ] Tab percorre cabeçalho, painéis, abas do preview e o painel `?` na ordem visual.
- [ ] Foco sempre visível (anel de 2 px do token `--color-focus`).
- [ ] Enter/Espaço acionam botões e abrem/fecham os painéis recolhíveis.
- [ ] Atalhos da spec §5.8 funcionam com o foco fora de campo de texto.
- [ ] Ctrl/Cmd+Z e Ctrl/Cmd+S funcionam mesmo com o foco dentro de campo de texto.

## 3. Impressão (marco 3)

- [ ] PDF impresso em A4, escala 100% ("tamanho real"), sem ajustar à página.
- [ ] Medir com régua digital: 210 × 297 mm com tolerância de 0,2 mm.
- [ ] Marcas de corte da A5 e da A6 caem sobre a borda do papel, com 3 mm quando a margem permite.
- [ ] Moldura contínua, sem ser cortada por objetos.
