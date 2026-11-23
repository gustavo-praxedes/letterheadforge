# AGENTS.md — LetterheadForge

Idioma: este arquivo e a conversa com o usuário em pt-BR. Código, comentários e commits em inglês, idioma já definido para este projeto.

## 0. Princípios do projeto

1. Tudo deve ser um comando. Toda operação (instalar, testar, servir, gerar manifesto, liberar versão) é exposta como script em `package.json` ou em `scripts/`, com entrada e saída previsíveis, para que agentes a executem sem interação manual.
2. Tudo deve ser um módulo. Cada funcionalidade vive em módulo ES com interface explícita e dependências declaradas por `import`, de modo que se integre ao que já existe sem alterar arquivos compartilhados.
3. Ferramenta de orquestração: `https://github.com/herdrdev/herdr`, a instalar no diretório do projeto e usar. O campo "Ferramentas" da seção 10 está pendente. O principal pergunta ao usuário a forma de instalação e uso antes de qualquer ação (seção 7, item 2).

## 1. Hierarquia

Três níveis. Nenhum agente cria um nível adicional.

1. **Agente Principal (Chief of Staff).** Único que conversa com o usuário. Planeja, delega, revisa, integra e faz o commit final. Não escreve código de produto.
2. **Subagentes.** Recebem trabalho do principal, delegam aos executores e verificam o resultado. O agente de specs é um subagente. Não fazem merge.
3. **Agentes Executores.** Fazem o trabalho pesado. Não criam outros agentes.

Cada agente reporta somente ao seu agente superior. Este analisa o trabalho e pede revisão até o checklist de conclusão passar.

### 1.1 Agente de Revisão Visual (subagente especializado)

Função: avaliar a interface pelas imagens, sem ler código.

- **Entrada exclusiva:** capturas de tela PNG em `temp/shots/<revisao>/`. O agente não recebe HTML, CSS, JS, logs de console, mensagens de erro ou qualquer texto do projeto. Se a imagem não mostrar o que precisa ser julgado, ele pede nova captura — nunca pede o código.
- **Quem chama:** o principal ou o subagente da frente de interface, conforme `docs/01.01.00-AGENTE-REVISAO-VISUAL.md`.
- **Como as imagens nascem:** `npm run shots` (`scripts/shots.mjs`, Playwright headless) sobre `npm run serve`. O capturador nunca inspeciona a imagem; só grava e informa os caminhos.
- **Saída:** veredito binário por item do checklist visual, com o ID da captura e a coordenada aproximada do defeito. Sem opinião sobre arquitetura, desempenho ou código.
- **Limite:** três rodadas de revisão visual por frente. Depois disso, bloqueio sobe ao principal.


## 2. Fluxo

Leitura inicial: antes de qualquer ação, todo agente lê este arquivo e depois os documentos listados no campo "Leitura obrigatória" da seção 10.

Nenhum agente escreve código antes de existirem spec aprovada e plano aprovado.

1. O principal conduz a entrevista com o usuário, conforme o protocolo da seção 3.
2. O principal grava o resultado em `docs/XX.00.00-DIRETRIZES-<NOME>.md`: decisões, alternativas descartadas e pontos em aberto.
3. O agente de specs escreve a spec em `docs/`, definindo o quê e o porquê: objetivo, comportamento esperado, restrições e critérios de aceite. A spec não contém tarefas nem nomes de agentes.
4. O principal revisa a spec. O usuário aprova a spec.
5. O agente de specs escreve o plano em `docs/`, definindo como e quem. Para cada tarefa: objetivo, arquivos permitidos, agente responsável e checklist de conclusão verificável. O plano referencia a spec por caminho, sem copiar o conteúdo.
6. O principal revisa o plano.
7. O principal delega as tarefas. Cada arquivo é atribuído a um único agente.
8. Cada subagente verifica o trabalho dos seus executores e reporta ao principal.
9. O principal integra e comita (seção 6).

Regras de precedência:

- Se o plano contradiz a spec, vale a spec.
- Se a execução revelar erro na spec, o agente para e reporta ao superior. A decisão sobe até o usuário. Nenhum agente altera a spec aprovada por conta própria.
- Se surgir trabalho fora do plano, o agente para e solicita atualização do plano.
- Se o agente de specs encontrar lacuna ou ambiguidade, ele devolve ao principal uma lista de perguntas. O principal retoma a entrevista e grava as respostas no arquivo de diretrizes.

## 3. Entrevista

Este protocolo é completo e não depende de skill, plugin ou ferramenta externa. "Grill-me" é apenas o nome do protocolo. O usuário o aciona ao pedir "grill-me", "estresse este plano" ou ao dar diretrizes novas.

Objetivo: chegar a um entendimento compartilhado com o usuário sobre o plano ou o design, sem pontos ambíguos ou em aberto.

Regras:

1. Antes de perguntar, mapeie as decisões do plano em ordem de dependência. Uma decisão só é perguntada depois das decisões de que depende.
2. Faça uma pergunta por vez. Nunca envie uma lista de perguntas.
3. Para cada pergunta, informe:
   - a decisão em jogo e por que ela importa;
   - a resposta recomendada, com o motivo;
   - o custo ou o risco da recomendação.
4. Se a resposta puder ser obtida no código, nos documentos do projeto ou na seção 10, consulte-os em vez de perguntar.
5. Aprofunde cada ramo do design até esgotá-lo, antes de passar ao próximo. Questione premissas, casos de borda, falhas e dependências.
6. Registre cada decisão confirmada em uma linha, antes de passar à próxima pergunta.
7. Se o usuário não responder a uma pergunta, adote a recomendação como proposta, sinalize isso e prossiga. O usuário pode corrigir a qualquer momento.
8. Quando uma resposta alterar decisões anteriores, reabra apenas as decisões afetadas.
9. Encerre quando não restarem decisões em aberto. Apresente o resumo final e grave o resultado em `docs/XX.00.00-DIRETRIZES-<NOME>.md`, conforme a seção 2.

Idioma e tom: pt-BR, tom sério e profissional, sem gírias.

## 4. Revisão, qualidade e escalonamento

- Aprovação de spec, plano e tarefa por checklist binário. Todos os itens devem passar. Opinião do revisor não substitui o checklist.
- **Checklist do plano:** cada critério de aceite da spec é coberto por uma tarefa; cada tarefa tem objetivo, arquivos permitidos, agente e checklist de conclusão; nenhum arquivo pertence a mais de um agente; novo comportamento vai em arquivos novos, e edição de arquivo compartilhado é mínima e atribuída a um único agente; não há termos ambíguos como "melhorar" ou "se necessário".
- **Checklist da tarefa:** definido no plano. Usa os comandos da seção 10, sem repeti-los, e inclui sempre os padrões de qualidade abaixo.
- Limite de 3 rodadas de revisão por documento ou tarefa.
- Se a terceira rodada falhar, o revisor não faz uma quarta. Ele reporta o bloqueio ao superior, com o motivo e as opções. O bloqueio sobe nível por nível até o principal, que o apresenta ao usuário.

Padrões de qualidade (itens fixos do checklist da tarefa):

1. **Testes:** toda mudança vem com testes. Toda correção de bug vem com um teste de regressão que falhava antes da correção.
2. **Erros tratados:** entrada inválida produz um erro acionável, nunca um crash nem um resultado corrompido em silêncio. O agente não entrega funcionalidade criando um caminho de falha e corrige uma falha existente antes de construir sobre ela.
3. **Interface:** se a tarefa altera UI, o executor gera uma captura de tela e o subagente a examina na verificação. A avaliação visual é feita pelo Agente de Revisão Visual (seção 1.1), que recebe somente as imagens.
4. **Privacidade:** nenhum dado pessoal do usuário (nome, e-mail) em requisições externas, assets, exemplos ou documentos.
5. **Licenças:** não copiar código nem assets sem licença permissiva. Registrar a atribuição de todo material de terceiros usado.

## 5. Isolamento

- Todo o trabalho ocorre dentro da pasta do projeto.
- Cada executor usa um git worktree próprio em `temp/worktrees/<agente>/`, na branch `agent/<ID>-<tarefa>`.
- Scripts temporários ficam em `temp/scripts/`.
- `temp/` deve estar no `.gitignore`.
- Nenhum agente edita arquivos fora do seu worktree nem fora dos arquivos permitidos da tarefa.
- Cada agente usa diretório de build e cache próprio, dentro do seu worktree.
- Se o build falhar por causa de arquivo fora dos arquivos permitidos, o agente não o corrige. Ele reporta ao superior.
- Ao concluir a tarefa, o worktree e os artefatos de build do agente são apagados, após o merge do principal.

## 6. Commits e merge

- **Checkpoint:** o dono de uma branch `agent/<ID>-<tarefa>` faz commits locais nela, sem push. Todo checkpoint deixa o projeto compilando e com os testes verdes.
- **Merge:** somente o agente principal faz merge.
- **Integração:** o principal cria `integ/<ID>` a partir da branch principal. Ele faz merge nela das branches dos executores, na ordem do plano, somente após o subagente reportar o checklist concluído. Em seguida roda a suíte completa de testes.
- **Commit final:** após aprovação explícita do usuário, o principal faz `merge --squash` de `integ/<ID>` na branch principal, com um único commit por trabalho e mensagem escrita por ele, em Conventional Commits, em inglês.
- **Push:** exige aprovação separada do usuário.
- **Conflito de merge:** o principal não resolve sozinho. Ele devolve ao subagente da frente, que designa um executor para corrigir na branch dele.
- A pasta `docs/` entra no commit.

## 7. Ações que exigem aprovação do usuário

O principal obtém a aprovação. Nenhum outro agente executa estas ações sem ela:

1. Alterar uma spec aprovada.
2. Instalar, remover ou atualizar dependências não previstas no plano.
3. Executar `git push --force`, `git reset --hard` fora do próprio worktree, ou apagar branches que não sejam do próprio agente.
4. Ler, gravar ou expor segredos, como `.env` e chaves de API. Segredos nunca entram em commit, documento ou handoff.
5. Acessar produção, serviços externos ou rede, além do necessário para os testes definidos no plano.
6. Alterar arquivos fora da lista de arquivos permitidos da tarefa.

Qualquer outra ação dentro do escopo do plano é permitida sem consulta.

## 8. Handoff

Gatilho: ao atingir cerca de 70% do contexto, ou antes, se a qualidade cair. Nunca espere o limite.

Procedimento:

1. Faça commit do trabalho parcial na própria branch.
2. Grave o documento em `docs/XX.YY.ZZ-HANDOFF-<TAREFA>.md`, em arquivo novo, incrementando ZZ para evitar colisão. Não sobrescreva handoffs anteriores.
3. Redija segredos e dados pessoais. Não duplique conteúdo de spec, plano ou commits. Referencie por caminho.
4. Reporte ao superior imediato o caminho do documento e o hash do último commit. O principal avisa o usuário.
5. O novo agente assume o mesmo worktree, a mesma branch e o mesmo escopo. Ele lê o handoff mais recente da tarefa antes de qualquer ação e confirma o recebimento ao superior.
6. O handoff não zera o contador de rodadas de revisão.

Campos obrigatórios (escreva "nenhum" quando não houver conteúdo):

1. ID da tarefa e agente anterior.
2. Objetivo, por referência ao plano.
3. Itens do checklist de conclusão: concluídos e pendentes.
4. Último commit e branch.
5. Decisões tomadas e o motivo.
6. Bloqueios e rodadas de revisão consumidas.
7. Próximo passo exato.
8. Skills ou recursos sugeridos, apenas se a ferramenta em uso os oferecer.

## 9. Nomenclatura e rastreabilidade

- Todo arquivo de documentação novo fica em `docs/` e segue o padrão `XX.YY.ZZ-NOME-DO-ARQUIVO.md` (ex.: `01.00.00-ESPECIFICACOES.md`, `02.00.00-FASE-X.md`, `02.01.00-TRABALHO-X.md`, `02.01.01-HANDOFF.md`).
- XX: frente/fase (dois dígitos). YY: trabalho/subetapa dentro da frente (dois dígitos). ZZ: revisão ou artefato sequencial daquele trabalho (dois dígitos). Nome em maiúsculas, com hífens, sem acentos e sem espaços.
- O prefixo `XX.YY.ZZ` nunca muda após criado. Nenhum agente renomeia arquivos.
- ID do trabalho: prefixo de 8 dígitos `XX.YY.ZZ` do documento de origem (ou `XX.00.00` quando derivado de diretrizes ou spec inicial).
- Todo documento começa com duas linhas: `Trabalho: <ID>` e `Origem: <caminho do documento de origem>`. A spec aponta para as diretrizes, o plano para a spec e o handoff para o plano ou tarefa anterior.
- Branches: `agent/<ID>-<tarefa>` e `integ/<ID>`.
- Frentes em uso: `01` processo (diretrizes, revisão visual), `02` especificação e decisões, `03` Marco 1, `04` Marco 2, `05` Marco 3, `06` Marco 4, `07` Marco 5.
- Documentos em vigor: `01.00.00-DIRETRIZES-LETTERHEADFORGE.md`, `01.01.00-AGENTE-REVISAO-VISUAL.md`, `02.00.00-ESPECIFICACOES.md`, `02.01.00-DECISOES.md`, `03.00.00-PLANO-MARCO-1.md`, `03.01.00-CONTRATOS-NUCLEO-M1.md`. Nomes históricos (`SPEC.md`, `PLAN-M1.md`, `DECISIONS.md`) foram renomeados por decisão do usuário em 2026-11-23; qualquer referência antiga deve ser corrigida, não recriada.

## 10. Projeto

Se um campo estiver vazio, o principal pergunta ao usuário e grava a resposta aqui. Nunca presuma um valor.

- **Produto:** LetterheadForge, aplicação web estática que gera PDF A4 com folhas A4, A5 ou A6 configuráveis. Repositório: `https://github.com/gustavo-praxedes/letterheadforge`.
- **Estado:** **Marco 1 concluído e integrado em `main`** (commit `55333ee`): 12 módulos de núcleo, 139 testes verdes, lint limpo, fontes em WOFF (D11). Plano do marco 2 escrito em `docs/04.00.00-PLANO-MARCO-2.md`, aguardando aprovação do usuário. Diretrizes em `docs/01.00.00-DIRETRIZES-LETTERHEADFORGE.md`.
- **Instalação:** `npm ci`
- **Build:** nenhum. Módulos ES nativos, sem etapa de build.
- **Testes:** `npm test` (executa `node --test`)
- **Lint:** `npm run lint` (ESLint 9, flat config em `eslint.config.js`, sem regras de formatação)
- **Servidor local:** `npm run serve` (`http-server`, porta 8080)
- **Capturas para revisão visual:** `npm run shots` (`scripts/shots.mjs`, Playwright headless, grava em `temp/shots/<revisao>/`)
- **Spike de fontes:** `npm run spike:woff2` (`scripts/spike-woff2.mjs`)
- **Liberação de versão:** `npm run release` (`commit-and-tag-version`)
- **Branch principal:** `main`
- **Idioma do código e dos commits:** inglês. Commits em Conventional Commits. Documentação em pt-BR.
- **Ferramentas:** herdr 0.9.5 (`https://herdr.dev/install.ps1`). Uso neste projeto: bancada de execução — workspace `letterheadforge` com `--cwd E:/LETTERHEADFORGE`, panes para `npm test`, `npm run lint` e `npm run shots`. Sessão nomeada `lhf`; todo comando leva `--session lhf`. herdr **não** substitui as branches e worktrees da seção 5: cada executor continua dono do próprio worktree e da própria branch.
- **Leitura obrigatória:** `docs/02.00.00-ESPECIFICACOES.md`; o plano em vigor (`docs/04.00.00-PLANO-MARCO-2.md`, quando aprovado; senão `docs/03.00.00-PLANO-MARCO-1.md`); `docs/03.01.00-CONTRATOS-NUCLEO-M1.md` (contratos do núcleo); `docs/01.01.00-AGENTE-REVISAO-VISUAL.md`; `README.md`.
- **Verificações adicionais:**
  - `grep -rnE "window|document|fetch" src/core src/store/history.js` não retorna ocorrências (núcleo puro).
  - Nenhum número de regra, texto de interface ou cor fixos fora de `src/config.js`, `src/strings.pt-BR.js`, `src/styles/tokens.css` e `data/` (revisão registrada no checklist da tarefa).
  - `npm run lint` sem erros.
- **Restrições de tecnologia e arquitetura:**
  - Sem backend, sem telemetria, sem cookies, sem envio de dados. Único tráfego externo: fontes via jsDelivr.
  - Sem dependências de runtime. `package.json` só com devDependencies (`http-server`, `commit-and-tag-version`).
  - Bibliotecas de runtime (`pdf-lib`, `@pdf-lib/fontkit`) em `vendor/`, versão fixa, registradas em `vendor/VERSIONS.md`.
  - `src/core/` é puro: sem DOM, sem rede. A interface e o PDF consomem o núcleo, nunca o contrário.
  - Preview e PDF compartilham a mesma `Scene`.
  - Sem `innerHTML` com conteúdo do usuário. CSP conforme a seção 10.5 da spec.
  - Nenhuma falha silenciosa: todo erro gera aviso visível ao usuário.
