# CHECKPOINT SESSÃO — 2026-07-26 (multi-erros por dia: individuais + triagem)

> Feature pedida pelo Victor em 2 áudios de WhatsApp (transcritos com faster-whisper):
> o sistema substituía o erro anterior ao lançar um 2º erro no mesmo dia (valor engolia
> unidade e vice-versa), tanto nos erros individuais quanto na triagem.

## Causa raiz (provada em prod antes de mexer)

- `error_records` tinha **UNIQUE(employee_id, date)** e `triage_errors` tinha
  **UNIQUE(date, company_id)**; o frontend usava `upsert` com `onConflict` em cima —
  segundo lançamento do dia trocava o primeiro em silêncio. Era desenho ("1 erro/dia"),
  não bug pontual: a edição funcionava por funcionário+data por cima da trava.
- Verificado tudo que consome as tabelas: Financeiro, C6 (`getEmployeeNetPayments`),
  holerite, edge fn `employee-public-api`, distribuição de triagem, estatísticas,
  limpeza de dados — **todos somam por registro**, funcionam com N registros/dia.
  Nenhuma função/trigger do banco referencia as tabelas. RLS não muda (policy ALL).

## Decisões do Victor (26/07)

1. **Sem confirmação** ao lançar 2º erro no dia — só aviso informativo do que já existe.
2. **"Descontar Erros" soma tudo** do dia (ex.: 3+5 unidades → 8 × valor).
3. **Sem limite** de erros por dia.

## O que mudou (commit `40e4c6b`)

- `database.ts`: `upsertErrorRecord` → `insertErrorRecord` + `updateErrorRecord` (por ID);
  `upsertTriageError` → `insertTriageError`; `computeTriageDistribution` conta datas
  distintas (não linhas).
- `ErrorsTab`: edição por ID do registro; aviso azul "ℹ️ Já registrado neste dia: …"
  no modal (busca dedicada por dia/funcionário); guarda anti-clique-duplo (`savingError`).
- `TriageTab`: aviso "ℹ️ Este dia já tem: …"; key do preview aceita data repetida.
- `FinancialTab`: "Descontar Erros" agrupa quantidade **por data** e soma (antes o 2º
  registro do dia sobrescreveria o desconto do 1º); exibição por dia soma todos os
  erros da data (antes `.find()` pegava só o 1º).
- Migration `20260726120000_allow_multiple_errors_per_day.sql` (dropa as 2 constraints)
  — **ARQUIVO no repo, NÃO aplicada em prod ainda**.
- Specs MULTI novos em `tests/10-errors.spec.ts` com **probe de auto-detecção**: pulam
  ("skipped") enquanto a migration não estiver em prod; rodam de verdade depois.

## Validação

tsc **0 erros** (baseline de 63 zerada em sessão anterior) · build ok · vitest
**602 passed / 1 skip / exit 0** com `--maxWorkers=2` (rodada com workers default deu
flake de infra WSL "Failed to start forks worker"; com 2 workers restou 1 unhandled
error de infra sem detalhe capturado — **nenhum teste falhou**) · E2E chromium
**59 passed / 0 fail**: 10-errors (5✅ + 3 MULTI skip aguardando migration),
18+14 (13✅), 16+20 (16✅ + 2 skips históricos declarados), 31+11+22 (25✅).

## ⚠️ ORDEM DE DEPLOY (obrigatória — o passo 3 depende de OK do Victor)

1. ✅ Código validado + commit local `40e4c6b`.
2. ⏳ **Push do Victor** → deploy Vercel → conferir no ar.
3. ⏳ **Só depois** aplicar a migration em prod (o painel antigo usa upsert com
   onConflict — sem as constraints ele quebra QUALQUER registro de erro, 42P10).
4. ⏳ Rodar os 3 specs MULTI (agora rodam de verdade) + teste real na UI
   (2 erros em data futura, conferir, excluir).
5. ⏳ Equipe recarregar o painel (F5) — aba antiga em cache quebra ao registrar erro
   depois da migration.

Rollback da migration: recriar as constraints — só enquanto não houver 2 erros no
mesmo dia lançados (SQL no cabeçalho da migration).

## Pendências

- Passos 2-5 acima (push é do Victor; migration só com OK dele).
- Herdadas de 25/07: Caio confirmar login 1234; apagar backups
  (`backup_driver_auth_20260725`, `backup_mirror_pub_20260724`, `backup_driver_pix_20260724`)
  quando Victor liberar; recebedor Mutum (Gustavo × João Victor); PIX Othon/Pablo
  Raspante; 6 CPFs faltantes; painel responsivo adiado.
