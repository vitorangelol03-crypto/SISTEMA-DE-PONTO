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
- **Próximo:** Fase 0 — escrever migrations (tabelas novas) + edge fn `driver-public-api` como
  ARQUIVOS. **Aplicar migration/criar bucket/deploy/push = só com OK do Victor** (nada em prod ainda).

## 5. Validação desta sessão
CPF import: 1 UPDATE de dado em prod, verificado e reversível (`backups/2026-07-23-cpf-import/`).
D3: tsc 0 + build ok + 111 unit verdes. Commits locais em `feature/app-entregador`: `1c3734c`, `1f3805b`.
**Nada pushado. Nada aplicado em produção além do backfill de CPF.**
