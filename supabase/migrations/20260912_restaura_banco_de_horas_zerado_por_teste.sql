-- ════════════════════════════════════════════════════════════════════════════
-- RESTAURA O BANCO DE HORAS QUE UM TESTE AUTOMATIZADO APAGOU (12/09/2026)
--
-- O QUE ACONTECEU
-- Em 12/09/2026, às 03:42-03:43 UTC (00:42 de Brasília), o spec E2E
-- `tests/42-bank-hours-apply-ui.spec.ts` criou uma quinzena de teste de
-- **16 a 31/07/2026 dentro da CARATINGA** (empresa real) e clicou em
-- "Aplicar selecionados". Esse botão aplica em TODO MUNDO que a janela de datas
-- pega — não só no funcionário de teste que o spec criou.
--
-- Resultado: 23 funcionários REAIS tiveram banco de horas "aplicado" e, com ele,
-- o passo 3 da RPC `apply_bank_hours_to_payment` ZEROU o saldo deles
-- (`bank_credit_minutes` e `bank_debit_minutes`) em todo o intervalo.
-- A limpeza do spec só apaga o funcionário de teste — os 23 reais ficaram assim.
--
-- MEDIDO ANTES DE MEXER
--   16 a 31/07 (o que o teste pegou):  crédito 0      · débito 0
--   01 a 15/07 (fora do alcance):      crédito 8.817  · débito 22.833
--   cópia de 13/08 (`backup_attendance_20260813`), mesmas 257 linhas:
--                                      crédito 2.175  · débito 19.783
--
-- POR QUE A CÓPIA DE 13/08 É FONTE CONFIÁVEL: comparando as 257 linhas dela com
-- as de hoje, **nada mais divergiu** — mesmo status, mesma entrada, mesma saída,
-- mesmas horas trabalhadas. Só os dois campos de banco de horas mudaram
-- (15 linhas no crédito, 152 no débito). Julho está fechado e pago; essas linhas
-- não tinham motivo para mudar.
--
-- O DINHEIRO NÃO FOI AFETADO: as três semanas de julho estão `paid` e os totais
-- dos pagamentos seguem no valor da diária — ninguém recebeu a mais nem a menos.
-- O que se perdeu foi o SALDO DE HORAS das pessoas.
--
-- COMO DESFAZER ESTA MIGRATION: o estado de agora é **zero em todas as 167
-- linhas afetadas**. Para voltar, zerar de novo os mesmos ids (lista em
-- `backups/2026-09-12-banco-horas-zerado-por-teste/`).
--
-- A RAIZ (corrigida no mesmo dia, fora daqui): os specs 27, 29, 30 e 42 passam a
-- usar uma janela de datas em que produção não tem nada.
-- ════════════════════════════════════════════════════════════════════════════

-- Restaura SÓ os dois campos, SÓ nas linhas dos 23 afetados, SÓ na janela do
-- teste, e SÓ onde ainda diverge da cópia. Qualquer linha fora disso é ignorada.
update public.attendance a
set bank_credit_minutes = b.bank_credit_minutes,
    bank_debit_minutes  = b.bank_debit_minutes
from public.backup_attendance_20260813 b
where b.id = a.id
  and a.date between '2026-07-16' and '2026-07-31'
  and a.employee_id in (
    select distinct employee_id
    from public.bank_hours_application_log
    where applied_at >= '2026-09-12T03:40:00Z'
      and applied_at <  '2026-09-12T03:45:00Z'
  )
  and (
    coalesce(a.bank_credit_minutes, 0) is distinct from coalesce(b.bank_credit_minutes, 0)
    or coalesce(a.bank_debit_minutes, 0) is distinct from coalesce(b.bank_debit_minutes, 0)
  );

-- Tira o carimbo FALSO dos pagamentos: eles dizem "banco de horas: -R$ 325,31"
-- enquanto o total gravado é a diária cheia. O carimbo mente no papel do
-- funcionário e ainda travaria uma aplicação de verdade no futuro.
-- As linhas do `bank_hours_application_log` FICAM: são o registro do que o teste
-- fez, e apagar auditoria para esconder estrago é pior que o estrago.
update public.payments p
set bank_hours_amount     = null,
    bank_hours_minutes    = null,
    bank_hours_applied_at = null
where p.bank_hours_applied_at >= '2026-09-12T03:40:00Z'
  and p.bank_hours_applied_at <  '2026-09-12T03:45:00Z';
