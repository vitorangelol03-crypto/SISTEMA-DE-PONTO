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
- **Fila Fase 3:** (3e) painel "Notas recebidas" (matriz driver×CNPJ) + **baixar (individual + .zip nomeado
  driver+CNPJ+quinzena)** — precisa de `jszip` (NÃO instalado; adicionar). Depois Fase 1b (filtro no envio) + Fase 4 (líder).
- **Testes LIVE que dependem do deploy do Victor:** ciclo publicar→app (espelho aparecer no app) e NF (driver
  sobe foto real → some no painel). Backend validado por regressão 8/8; UI por tsc/build/smoke.

## 5. Validação desta sessão
CPF import: 1 UPDATE de dado em prod, verificado e reversível (`backups/2026-07-23-cpf-import/`).
D3: tsc 0 + build ok + 111 unit verdes. Commits locais em `feature/app-entregador`: `1c3734c`, `1f3805b`.
**Nada pushado. Nada aplicado em produção além do backfill de CPF.**
