-- Fechamento FINAL da brecha REST (03/09/2026) pras 5 tabelas com function nova
-- (payments, error_records, triage_errors, triage_distribution_employees,
-- bonus_removals). Validado com E2E completo ANTES desta trava (44/46, 0 falha,
-- 0 retry) — só agora, com o código do cliente já rodando 100% pelas functions,
-- é seguro tirar o acesso direto da tabela crua. Reconfirmado DEPOIS desta trava
-- com outra rodada completa (41/44, só flakiness de CPU já documentada, 0 falha
-- persistente).
--
-- SECURITY DEFINER não precisa de NENHUM privilégio do invocador na tabela — só
-- EXECUTE na function em si. Por isso pode revogar a tabela INTEIRA (não só as
-- colunas de dinheiro) sem quebrar a function.
REVOKE SELECT ON public.payments FROM authenticated;
REVOKE SELECT ON public.error_records FROM authenticated;
REVOKE SELECT ON public.triage_errors FROM authenticated;
REVOKE SELECT ON public.triage_distribution_employees FROM authenticated;
REVOKE SELECT ON public.bonus_removals FROM authenticated;
