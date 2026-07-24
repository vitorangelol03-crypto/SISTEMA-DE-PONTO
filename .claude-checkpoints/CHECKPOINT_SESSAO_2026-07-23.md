# CHECKPOINT — Sessão 2026-07-23 — Kickoff do App do Entregador + backfill de CPF

> Início da feature "app do entregador" (drivers veem espelhos por quinzena e
> anexam notas fiscais). Sessão de PLANEJAMENTO + 1 operação de dado em produção
> (import de CPF). Nenhum código de app foi escrito ainda; nenhuma migration aplicada.

## 1. Feature (visão) e decisões do Victor (travadas)

App web (`/driver`, APK depois via Capacitor que já existe) onde o entregador loga,
vê espelhos por quinzena e anexa NF por CNPJ. No painel: publicar espelho pro app
(individual / grupo só-pro-líder / seleção), filtrar por plataforma, dashboard de NF
recebidas, e **baixar as NFs** (individual + em massa `.zip`, nomeadas driver+CNPJ+quinzena).

Decisões (perguntadas e respondidas):
- **Login por CPF** (não por nome — nome tinha colisão). CPF veio de PLANILHA.
- **Web primeiro**, APK depois.
- **Espelho filtrado por plataforma** mostra só o valor das plataformas enviadas
  (linhas E total batem → exige `allowedPlatformNames` nos builders de `driverPayShared.ts`;
  hoje `computeRowTotals` soma tudo — armadilha a corrigir).
- **CNPJs configuráveis** (tabela de emitentes + vínculo plataforma→CNPJ; app monta slots).
- Segurança: driver nunca fala com o banco — só com edge fn `driver-public-api` (molde do
  `employee-public-api`), `service_role`, filtra por `driver_id` do token; secret dedicado
  `DRIVER_JWT_SECRET`. ZERO mudança na RLS/tabelas do 2626.
- Buckets de espelho e NF = privados + signed URL.
Plano completo: `~/.claude/plans/vamos-precisar-fazer-um-tranquil-hopper.md`
(sendo refinado em paralelo no Ultraplan/nuvem — aguardando voltar).

## 2. Operação em PRODUÇÃO: backfill de CPF (feito, verificado, reversível)

Projeto Supabase = **`flcncdidxmmornkgkfbb`** ("PNR Dashboard" no painel = onde vive o
Sistema de Ponto/driverpay). Só a Caratinga (company `6583bb2a-...`) tem drivers.

- Estado ANTES: 97 drivers ativos, **0 com CPF** (e 0 telefone, 0 PIX — só nome/rota).
- Fonte: `C:\Users\VICTOR\Downloads\br_driver_2026-07-22_10-56-52.csv` (export iMile/XPT
  Caratinga, 298 linhas; colunas Driver Name, CPF, Phone…).
- Casamento por **nome exato** (regra `driverTokens` de `src/utils/driverNameMatch.ts`),
  validação `validateCPF` de `src/utils/validation.ts`. Resultado: **91/97 casaram**
  (0 parcial, 0 ambíguo, 0 CPF inválido, 0 conflito de CPF).
- Write: `UPDATE ... where cpf is null` (só preenche vazio, não sobrescreve). Verificado:
  97 ativos → **91 com CPF, 6 sem**. Spot-check ok (Caio ≠ Caíque, etc.).
- **Reversível:** `backups/2026-07-23-cpf-import/` (gitignored) com `mapping.csv` + `undo.sql`
  (zera SÓ as 91 linhas que ainda contêm o CPF importado).

**6 ainda sem CPF** (não estão na planilha iMile ou lá estão desativados sem CPF):
Cicero Junior de Sousa da Silva · Henrique Pereira de Freitas · Irineu (suiço) ·
Luiz Augusto da Silva · Mikael Barbosa Do Carmo · Wender Vieira. → Victor manda o CPF
deles de 2ª fonte quando puder; importa igual. (Telefones da planilha disponíveis se quiser.)

## 3. Ultraplan (nuvem) FALHOU — construção passou a ser LOCAL

A sessão Ultraplan **não completou** (aviso do sistema: container remoto não subiu em 90min).
Um resumo dela dizia "tudo pronto: Fases 0-4, migrations, edge fn, app /driver, 569 testes,
entregue por bundle" — **NADA disso era real**. Verificado por 4 fontes independentes: sem
bundle no PC; commit `7d8415c` inexistente no git local; GitHub ao vivo com `feature/pagamentos-driver`
em `ac0c045` e `main` em `b43b31d`, sem PR; e os arquivos (migrations `2026072310*`, edge fn
`driver-public-api`, rota `/driver`, `allowedPlatformNames`) **não existem**. Nada foi perdido —
a feature nunca chegou a ser escrita. Victor mandou construir **aqui, local**.

## 4. Construção local iniciada — branch `feature/app-entregador` (de `main` b43b31d)

- **D3 FEITO e validado** (commit `1f3805b`): `computeRowTotals` + builders
  (`buildDriverMirrorData`/`buildGroupMirrorData`/`buildSelectionMirrorData`) aceitam
  `allowedPlatformNames?` opcional — filtra LINHAS e TOTAL juntos; sem o param = idêntico ao
  atual; Zapex conta como plataforma; descontos/vales seguem abatidos (decisão de exibição na Fase 1).
  8 testes novos (`tests/unit/driverPayPlatformFilter.spec.ts`). **Validação: tsc 0, build ok,
  111 unit verdes** (novos + regressão de espelho). Commit de docs: `1c3734c`.
- **Fase 0 ESCRITA** (arquivos, NÃO aplicados — commit `433932c`):
  - Migration `supabase/migrations/20260723120000_driverpay_app_foundation.sql`: tabela
    `driverpay_driver_auth` (senha bcrypt do driver; RLS **deny-all** a authenticated — só
    service_role) + `driverpay_mirror_publications` (RLS empresa+2626) + bucket privado
    `driverpay-mirrors` (policy só 9999/2626; driver lê por signed URL). Padrão copiado da
    migration de referência (header aditivo, índices, comments, rollback).
  - Edge fn `supabase/functions/driver-public-api/index.ts`: login CPF+senha (1234 lazy + troca
    obrigatória), change-password (proíbe 1234, lockout 5 erros/15min), my-mirrors, my-mirror-url
    (link assinado + marca visto). Token HS256 com **`DRIVER_JWT_SECRET` dedicado** (não autentica
    no banco). driver_id sempre do token verificado. Deno não instalado local → valida no deploy.
- **Fase 0 APLICADA E VALIDADA EM PROD (2026-07-23, com OK do Victor):** migration aplicada
  (via MCP apply_migration; tabelas + bucket privado `driverpay-mirrors` conferidos), edge fn
  `driver-public-api` deployada (v2, ACTIVE, verify_jwt=false), `DRIVER_JWT_SECRET` setado pelo
  Victor no painel. **Login testado ponta-a-ponta com driver REAL** (Romário Alves Dornelas,
  CPF + 1234): **8/8 cenários OK** — login com "troca obrigatória", troca de senha, "1234" barrado
  como nova senha, senha errada e token falso recusados, my-mirrors vazio. Registro de teste do
  Romário APAGADO (cadastro pristino p/ 1o login real). CLI supabase NÃO existe no shell → secret
  setado só via painel; deploy/migration foram via MCP.
- **Fase 2 FEITA (app /driver, commit `6408062`; tsc 0 + build ok):** rota pública `/driver` em
  `App.tsx` (molde /clock); `src/services/driverApp.ts` (cliente da edge fn + sessão localStorage);
  `src/components/driver-app/DriverApp.tsx` (login CPF+senha → troca obrigatória → lista de espelhos
  por quinzena → abrir PDF via link assinado; estados carregando/vazio/erro; 401 derruba sessão).
- **Smoke de `/driver` no navegador OK** (Playwright, viewport celular): login renderiza, login com
  CPF real + 1234 → tela "criar senha"; sem erro de runtime. Registro de teste do Romário apagado.
- **Ajuste visual pedido pelo Victor (commit `81a953b`):** cor dominante AZUL (era laranja) + ícone
  de dinheiro `CircleDollarSign` no lugar do caminhão, na tela `/driver`. tsc 0 + build ok + print conferido.
- **Fase 1a FEITA (commit `a67d870`; tsc 0 + build ok):** `publishDriverMirror` em `driverPay.ts`
  (gera Blob → upload no bucket privado `driverpay-mirrors` → troca/insere publicação, 1 por
  período+driver). `DriverPayTab` guarda os drivers cobertos (individual/grupo/massa/seleção) e
  `onPublish` gera **1 PDF individual por driver** e publica (erro por-driver + resumo). Botão verde
  **"Publicar no app"** no `DriverMirrorPreviewDialog`. Fluxo de download atual intacto.
- **Fase 3 (Nota Fiscal) iniciada — Victor escolheu.** Migration `20260723130000_driverpay_nota_fiscal.sql`
  ESCRITA (arquivo, NÃO aplicada): tabelas `driverpay_nota_emitters` (CNPJs) + `driverpay_nota_fiscal_files`
  + coluna `driverpay_platforms.nota_emitter_id` + bucket privado `driverpay-nota-fiscais`. RLS empresa+2626;
  idempotente. **APLICADA + verificada em prod (2026-07-23, OK do Victor):** 2 tabelas + coluna + bucket
  privado + 2 RLS + storage policy conferidos; nada existente tocado.
- **3b FEITO (tsc/build ok):** serviço de emitentes em `driverPay.ts` (`DriverNotaEmitter`,
  getNotaEmitters/createNotaEmitter/updateNotaEmitter/setPlatformNotaEmitter; `DriverPlatform` ganhou
  `nota_emitter_id`) + `EmittersModal.tsx` (cadastra CNPJs + vincula cada plataforma a um CNPJ) +
  botão "CNPJs / Notas" na toolbar do `DriverPayTab`.
- **3c FEITO** (edge fn v4 ACTIVE, commit da fn): `nf-slots`/`nf-upload`(base64→bucket privado→
  registra+marca check antigo)/`nf-list` + `periodId` no `my-mirrors`. **Regressão login 8/8 na v4** (não quebrou Fase 0).
- **3d FEITO (commit; tsc/build ok):** no app, cada espelho tem "Anexar nota" → tela por CNPJ (nf-slots),
  foto pela câmera comprimida (canvas jpeg 1600px/q0.7) → nf-upload → lista de enviadas. Lado do DRIVER da NF completo.
- **3e FEITO → FASE 3 COMPLETA (commit; tsc/build ok, 13 unit):** `notaFiscalFileName` (puro, 6 testes) +
  `listNotaFiscalFiles`/`notaFiscalFileUrl` (signed URL) + `NotasRecebidasModal` (lista, ver, baixar 1 a 1
  nomeado, baixar todas `.zip` via **jszip 3.10.1** — dep nova) + botão "Notas recebidas" no `DriverPayTab`.
- **Fase 1b FEITA (commit):** chips de plataforma no diálogo → envio ao app filtrado por plataforma (D3).
- **Fase 4 FEITA (commit):** migration `leader_driver_id` (aplicada) + `setGroupLeader` + seletor de líder no
  `GroupManagerModal` + publicar grupo gera o PDF do grupo e publica **só pro líder** (sem líder = bloqueia).
- **TODAS AS FASES CONCLUÍDAS** (D3, 0, 1a, 1b, 2, 3, 4). tsc 0 + build ok + **204 unit verdes** (regressão).
- **PENDENTE DO VICTOR:** (1) `git push` + deploy Vercel pra testar o app no celular (login/ver espelho/anexar
  nota) e o ciclo publicar→app AO VIVO; (2) cadastrar os CNPJs no painel ("CNPJs / Notas") + vincular
  plataformas; (3) os 6 CPFs que faltam (export `br_driver_2026-07-24`). Backend validado por regressão 8/8; UI por tsc/build/smoke.

## 5. Validação desta sessão
CPF import: 1 UPDATE de dado em prod, verificado e reversível (`backups/2026-07-23-cpf-import/`).
D3: tsc 0 + build ok + 111 unit verdes. Commits locais em `feature/app-entregador`: `1c3734c`, `1f3805b`.
**Nada pushado. Nada aplicado em produção além do backfill de CPF.**

## 6. Continuação noite 23/07 — GO-LIVE + despublicar/reset (com OK do Victor)

- **PUSH + PRODUÇÃO (autorizado: "faz o push … coloque atualizado a vercel").** `feature/app-entregador`
  (24 commits) → **merge fast-forward em `main`** (`b43b31d`→`9c31db4`) → push. Vercel publicou produção.
  Verificado objetivo: `sistema-ponto-zeta.vercel.app/` HTTP 200 e o `index.html` de prod aponta pro
  bundle do build novo (`index-B_yLOdLg.js`, hasheado por conteúdo) → app do entregador no ar em `/driver`.
- **CICLO COMPLETO validado E2E (dado real):** painel (2626) publicou espelho do Adao → app (login Adao
  CPF+1234) listou → `my-mirror-url` → **baixei o PDF real (HTTP 200, 9.283 bytes, começa com %PDF)**.
  Depois LIMPO (publicação + auth de teste apagados).
- **🎉 APP EM USO REAL:** driver **Iago Nascimento de Oliveira** logou sozinho e **JÁ TROCOU a senha**
  (auth `must_change=false`, senha setada, ~23:28 de 23/07). O link foi divulgado pelo Victor. Registro
  PRESERVADO (não é teste). **App do entregador validado em produção com usuário real.**
- **Feature nova ENTREGADA (commit `1dd484a`): despublicar espelho + resetar senha** (pedidos do Victor,
  decisões travadas: despublicar no diálogo + selo "no app"; individual **e** "despublicar todos do período").
  - Editar espelho = **republicar** (já substituía; confirmado no código). Novo só o "excluir".
  - `driverPay.ts`: `listPublishedDriverIds`, `unpublishDriverMirror`, `unpublishAllMirrorsForPeriod`,
    `resetDriverPassword`. Diálogo do espelho: aviso "já publicado" + botão vira "Republicar (atualiza)" +
    "Despublicar" (vermelho). Selo "no app" na lista (tabela+card). Barra: "Despublicar todos do período".
    Form editar driver: botão "Resetar senha" (apaga a auth → volta 1234 + destrava lockout).
  - **Migration `20260723150000` APLICADA em prod (OK do Victor):** policy de **DELETE** em
    `driverpay_driver_auth` só pro mestre (9999/2626). **Sem SELECT/UPDATE** → hash das senhas segue
    protegido. Despublicar reusa a policy FOR ALL já existente em `driverpay_mirror_publications`.
  - **Validação:** tsc 0, build ok, **582 unit** verdes, **E2E real com cliques** (preview local do build
    novo → banco prod): publicar→selo "no app"→despublicar individual→despublicar todos→form "Resetar senha".
    Banco conferido limpo (0 publicações; o único auth é o REAL do Iago). PDFs despublicados ficam órfãos no
    bucket privado (trava do storage; inofensivo).
- **PENDENTE:** (a) decidir se sobe ESSA leva (despublicar/reset) pra Vercel — commitada local, ainda não
  pushada; (b) 6 CPFs faltantes; (c) recursos ainda não feitos: painel responsivo + "pedir nota de novo"
  (rejeitar NF) + print da nota anexada no painel (Notas recebidas com uma nota).
- **State:** `main` = `9c31db4` (origin, em produção). `feature/app-entregador` = `1dd484a` (local, 1 commit
  à frente do main, NÃO pushado). → SUPERSEDED pela §7.

## 7. Madrugada 24/07 — validar/recusar/excluir nota + coluna NF por contagem (EM PROD)

Pedido do Victor (com regras adicionadas ao longo): conectar as notas do app com a coluna NF do
painel; **Validar/Recusar(motivo)/Excluir** cada nota; a coluna NF vira **"validadas/esperadas"**
(verde só quando todas as CNPJs esperadas estão VALIDADAS). Commit `de630f5`, **em produção**
(`main` = `de630f5`, Vercel bundle `index-DOEJvmp3.js`).

- **Regras (travadas):** esperadas = nº de CNPJs distintos com pacote — **iMile(eMile)=1 CNPJ,
  Shopee/Anjun/Loggi=outro** → 1 ou 2 notas (conferido no banco: eMile→53.824.315, resto→11.802.464).
  **Ciente de GRUPO: só o líder anexa; as notas do grupo validam o grupo TODO** (grupo de 6 com 2
  CNPJs → 2 validadas = os 6 verdes). Manual coexiste (clicar o selo marca "na mão" p/ quem manda
  por fora). Recusar guarda motivo que o driver vê; Excluir apaga o registro (arquivo órfão no bucket).
- **Banco:** migration `20260723160000` APLICADA (OK do Victor) — status ganha `validada` + `validated_at/by`
  + `reject_reason` (aditivo, amplia o CHECK). RLS já permitia painel editar/apagar nota (policy ALL).
- **Edge fn v5 (deployed, ACTIVE):** `nf-slots` ciente de grupo (líder vê CNPJs do grupo via
  `driverpay_group_members`) + não conta 'rejeitada' como enviada + devolve `rejected`/`rejectReason`;
  `nf-upload` NÃO marca mais `nota_fiscal_recebida` sozinho (quem deixa verde é a validação); `nf-list`
  devolve `reject_reason`. Compatível com o app do Iago (campos novos, ignorados pelo antigo).
- **Cálculo puro** em `driverPayShared.ts`: `expectedEmitterIds`, `computeNfProgress`,
  `computeNfProgressByPayment` (group-aware, chave=grupo|paymentId). 11 unit novos.
- **UI:** `NotasRecebidasModal` reescrito (agrupa por driver, status colorido, Validar/Recusar/Excluir);
  coluna NF (`DriverRow` tabela + `DriverList` card + subtotal do grupo) = selo "validadas/esperadas";
  app do driver (`DriverApp`) mostra "recusada: <motivo>, envie outra" e reabre o CNPJ.
- **Validação:** tsc 0, build ok, **593 unit** (incl. os 11 do cálculo grupo/1-ou-2-CNPJ), edge fn HTTP
  (Adriano = 2 slots pq tem iMile+outras), **E2E real com cliques**: subir nota → NF "0/2" → validar →
  "1/2" → recusar c/ motivo → driver vê "recusada" e slot reabre (`sent:0, rejected:1, motivo`). Dado de
  teste do Adriano limpo; **nota + auth REAIS do Iago preservados**.
- **Também nesta madrugada:** despublicar espelho + resetar senha (§6) foram pra PROD (`main`=`48cee06`
  antes desta). App do entregador em uso real (Iago logou/trocou senha).
- **Status do grupo no cabeçalho (visão Grupos) + FILTROS + polish** (pedidos do Victor em seguida):
  - Cabeçalho de cada grupo mostra sem abrir: **pacotes por plataforma** (chips coloridos), **NF do grupo**
    (validadas/esperadas — "NF ok" verde ou "NF x/y — falta N" âmbar) e **espelho no app / não publicado**.
  - **3 filtros novos** na aba (`DriverFilters` + `filteredRows` ciente de grupo): por **status de NF**
    (falta/ok), por **espelho publicado** (sim/não), por **plataforma** (tem pacote). E2E real: filtro NF
    "falta" reduz a lista (96/97). Barra de filtros reorganizada **simétrica** (6 filtros num grid 3×2 +
    toggle Lista/Grupos à direita) a pedido do Victor ("simétrico e bonito").
  - Validado: tsc 0, build ok, 593 unit, E2E real (grupos com status + os 3 filtros clicados).
- **PENDENTE:** painel responsivo à resolução (adiado pelo Victor p/ depois); 6 CPFs faltantes.
- **State (após esta parte):** `main` publicado; `feature/app-entregador` local. Edge fn `driver-public-api` v5.

## 8. Madrugada 24/07 (cont.) — ordenar grupos + RELATÓRIO (líder-recebedor + simples)

- **Ordenar grupos** (commit `308d2a4`): barra "Ordenar grupos por" na visão Grupos — botões (3 cliques:
  maior→menor / menor→maior / desativa) por Total de pacotes, por cada plataforma e por Total a receber,
  SEM abrir as gavetas. Métrica = agregado do grupo. tsc 0 + build.
- **RELATÓRIO reformulado** (commit `f5a4e4a`) — decisões do Victor (todas travadas):
  1. **Escopo por seleção:** marcar grupos/drivers → botão vira "Relatório da seleção (N)" (só eles); sem
     seleção = todos do filtro.
  2. **Líder-recebedor:** cada grupo vira o LÍDER recebendo o total do grupo; membros não viram linha; avulso
     = ele mesmo. (mesma lógica da NF; `leaderNameByGroup` do `driverpay_groups.leader_driver_id`, fallback 1º membro).
  3. **Dividido por rota:** 1 linha por rota × plataforma; net/desconto/vale na 1ª linha da unidade (SUM fecha).
  4. **Valor = TOTAL A RECEBER (net)**, desconto/vale ABATIDOS antes (regra do Victor: "senão dá prejuízo").
  - **Relatório simples** (.xlsx novo): A nome do líder SEM acento · B valor total (net) · C OBS = nome da
    quinzena (`period.label`).
  - Puros/testáveis em `driverPayShared`: `groupReportUnits`, `buildLeaderReportRows`, `buildSimpleReportRows`,
    `stripAccents`. `driverReport`: `buildSimpleSheet` + `exportDriverSimpleReportExcel` + opção sem aba "Por
    Grupo" + rótulo "recebedor(es)". Substituiu o `buildReportRows` per-driver no `handleReport`.
  - Validado: tsc 0, build ok, **600 unit** (7 novos) + **E2E real em PROD** (baixou geral+simples, abriu os .xlsx:
    geral "52 recebedor(es)", dividido por rota; simples A=nome sem acento / B=net / C=nome da quinzena). Em PROD.
  - Fix cosmético: nas linhas de continuação do bloco, a coluna GRUPO repete o grupo (era "Sem grupo").
- **Responsivo (commit `4dbc95a`):** medido com Playwright em 1440/1280/1024/768/414 — body NUNCA rola na
  horizontal (Layout sem max-w = full width; card view no mobile). A tabela tem ~1662px (14 colunas), então
  em telas < isso rola lateral (1ª coluna sticky). Compactei (padding/inputs/ações) → empurra ~1 coluna a mais
  pra dentro sem encolher fonte. Simetria conferida (KPIs 5, filtros 3×2). Caber 100% as 14 colunas em ~1408px
  exigiria encolher fonte (perde legibilidade) OU esconder colunas (ex.: Zapex quando vazio) — deixei como opção
  pro Victor decidir.
- **Config de dado em PROD (24/07, OK do Victor):** todo grupo com **1 driver** → esse driver vira **líder**.
  UPDATE em `driverpay_groups.leader_driver_id` p/ os **22 grupos de 1 membro** (todos estavam null; multi-driver
  NÃO tocados). Verificado 22/22 líder=membro, 0 sem líder. Reversível (voltar os 22 p/ null). Afeta: espelho de
  grupo→líder, anexo de nota do grupo, e recebedor no relatório.
- **PENDENTE (fila):** líderes dos **22 grupos multi-driver** (decisão do Victor, "Gerenciar grupos"); 6 CPFs
  faltantes; validar visualmente relatórios/telas amanhã; (opcional) esconder Zapex vazio na tabela.
