-- ════════════════════════════════════════════════════════════════════════════
-- APROVAÇÃO DE PONTO REMOVIDA (12/09/2026)
--
-- Pedido do Victor: *"vamos remover a função de aprovar ponto, ela não tem mais
-- utilidade no sistema"*. Perguntei o que fazer com as batidas pendentes e ele
-- escolheu tirar a coluna do banco de vez.
--
-- ⚠️ AVISEI O RISCO E ELE NÃO SE CONCRETIZOU. Rejeitar era o único estado com
-- efeito real (a batida saía do relatório de horas, que filtrava
-- `approval_status <> 'rejected'`). Conferido ANTES de remover:
--
--     Caratinga:   3.652 approved | 668 pending | 550 manual | 0 rejected
--     Ponte Nova:    425 approved | 247 pending | 108 manual | 0 rejected
--
-- ZERO rejeitadas. Nenhum número de relatório, histórico ou pagamento muda.
-- `pending` nunca excluiu nada de conta nenhuma; `approved` era só um carimbo.
--
-- Backup das 5.650 linhas (id + os 4 campos) em
-- `backups/2026-09-12-remove-aprovacao-ponto/attendance-approval-backup.json`,
-- com o SQL de restauração no README de lá.
--
-- ORDEM IMPORTOU: a edge function `clock-in-validated` gravava
-- `approval_status: "pending"` em toda batida do funcionário. Ela foi para a
-- **v15** (sem o campo) ANTES desta migration — senão o ponto pararia de
-- funcionar no instante em que a coluna sumisse.
--
-- Quem precisar descartar uma batida errada continua tendo o mestre 2626, que
-- edita e exclui direto na aba Ponto.
-- ════════════════════════════════════════════════════════════════════════════

-- Os índices e a constraint caem junto com as colunas (o Postgres derruba tudo
-- que depende só delas): idx_attendance_approval, idx_attendance_approved_by,
-- attendance_approval_status_check e attendance_approved_by_fkey.
alter table public.attendance
  drop column if exists approval_status,
  drop column if exists approved_by,
  drop column if exists approved_at,
  drop column if exists rejection_reason;
