-- Mascaramento de valores em R$ de Financeiro/Erros/Triagem/C6 NO BANCO (03/09/2026,
-- mesma lógica aplicada ontem no driverpay em 20260902040000): a coluna de dinheiro
-- deixa de vir pro navegador de quem não tem a permissão de ver valor — não é mais só
-- a TELA escondendo, o Postgres nem manda o número.
--
-- Mecanismo idêntico ao de ontem: 1 view "_v" por tabela com coluna de dinheiro,
-- `security_invoker = true` (mesmo RLS/isolamento por empresa de sempre) + as colunas
-- de R$ trocadas por `CASE WHEN <pode ver> THEN valor ELSE NULL END`. REVOKE SELECT só
-- nas colunas de dinheiro (não a tabela inteira) e GRANT SELECT nas views.
--
-- DIFERENÇA de hoje: a tabela `payments` é lida tanto pelo Financeiro quanto pelo C6 —
-- o banco não sabe de qual tela veio o pedido, só quem é a pessoa. Decisão do Victor
-- (03/09/2026): só mostra o valor de `payments` pra quem tem AS DUAS permissões
-- (`financial.viewPayments` E `c6payment.viewValues`) — mais seguro, ninguém contorna
-- uma restrição de uma tela só porque ainda tem acesso pela outra.
--
-- ACHADO no meio do caminho: várias contas (aplicar/remover bonificação, distribuir
-- erro de triagem, calcular o valor líquido pro arquivo do C6, holerite PDF, espelho
-- do motorista) LEEM o valor existente pra RECALCULAR e escrever de volta — não é só
-- mostrar na tela. Se a view devolve NULL pra essas contas, elas quebram silenciosas
-- (ex.: aplicar bônus B zeraria o C1/C2 que a pessoa já tinha). Resolvido no código
-- (não aqui): essas ações passam a EXIGIR a permissão de ver valor também, com erro
-- claro em vez de conta errada — ver `ensureCanViewPaymentValues`/`ensureCanViewErrorValues`
-- em database.ts e os checks equivalentes em FinancialTab.tsx/driverPay.ts.

-- ---------- 0. Backfill defensivo ----------
-- `financial.viewPayments` já existia (não é novo), mas nunca foi checado em lugar
-- nenhum até hoje — pode haver linha customizada sem a chave. `c6payment.viewValues`
-- e `errors.viewValues` são novos (nasceram nesta sessão). Sem isto, quem já tinha a
-- seção customizada antes dessas chaves existirem ficaria mascarado por engano — o
-- frontend já trata "chave ausente" como true (DEFAULT_*_PERMISSIONS), só
-- `user_has_module_permission` não tem esse fallback pra chave ausente dentro de uma
-- seção que já existe. Aditivo: mesmo valor que o app já assume.
UPDATE public.user_permissions
SET permissions = jsonb_set(permissions, '{financial,viewPayments}', 'true'::jsonb)
WHERE permissions -> 'financial' IS NOT NULL
  AND permissions -> 'financial' -> 'viewPayments' IS NULL;

UPDATE public.user_permissions
SET permissions = jsonb_set(permissions, '{c6payment,viewValues}', 'true'::jsonb)
WHERE permissions -> 'c6payment' IS NOT NULL
  AND permissions -> 'c6payment' -> 'viewValues' IS NULL;

UPDATE public.user_permissions
SET permissions = jsonb_set(permissions, '{errors,viewValues}', 'true'::jsonb)
WHERE permissions -> 'errors' IS NOT NULL
  AND permissions -> 'errors' -> 'viewValues' IS NULL;

-- ---------- 1. Views mascaradas ----------

-- payments: AND das duas permissões (financial.viewPayments E c6payment.viewValues).
CREATE OR REPLACE VIEW public.payments_v WITH (security_invoker = true) AS
SELECT
  id, employee_id, date, created_by, created_at, updated_at, company_id,
  bank_hours_minutes, bank_hours_applied_at,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN daily_rate ELSE NULL END AS daily_rate,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN bonus ELSE NULL END AS bonus,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN total ELSE NULL END AS total,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN bonus_b ELSE NULL END AS bonus_b,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN bonus_c1 ELSE NULL END AS bonus_c1,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN bonus_breakdown ELSE NULL END AS bonus_breakdown,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN bank_hours_amount ELSE NULL END AS bank_hours_amount
FROM public.payments;

-- error_records: só errors.viewValues (não é compartilhada com outro módulo).
CREATE OR REPLACE VIEW public.error_records_v WITH (security_invoker = true) AS
SELECT
  id, employee_id, date, error_count, observations, created_by, created_at, updated_at,
  error_type, company_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
       THEN error_value ELSE NULL END AS error_value
FROM public.error_records;

CREATE OR REPLACE VIEW public.triage_errors_v WITH (security_invoker = true) AS
SELECT
  id, date, error_count, observations, created_by, created_at, updated_at, triage_type,
  company_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
       THEN direct_value ELSE NULL END AS direct_value
FROM public.triage_errors;

CREATE OR REPLACE VIEW public.triage_error_distributions_v WITH (security_invoker = true) AS
SELECT
  id, period_start, period_end, total_errors, total_employees, distributed_by,
  distributed_at, observations, company_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
       THEN value_per_error ELSE NULL END AS value_per_error,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
       THEN total_deducted ELSE NULL END AS total_deducted
FROM public.triage_error_distributions;

CREATE OR REPLACE VIEW public.triage_distribution_employees_v WITH (security_invoker = true) AS
SELECT
  id, distribution_id, employee_id, errors_share, created_at, company_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'errors', 'viewValues')
       THEN value_deducted ELSE NULL END AS value_deducted
FROM public.triage_distribution_employees;

-- bonus_removals: histórico de remoção de bônus do Financeiro — só financial.viewPayments
-- (C6 não lê esta tabela).
CREATE OR REPLACE VIEW public.bonus_removals_v WITH (security_invoker = true) AS
SELECT
  id, employee_id, date, observation, removed_by, removed_at, created_at, bonus_type,
  company_id, bonus_type_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
       THEN bonus_amount_removed ELSE NULL END AS bonus_amount_removed
FROM public.bonus_removals;

-- ---------- 2. Trava: coluna de dinheiro deixa de ser legível direto na tabela crua ----------
REVOKE SELECT (daily_rate, bonus, total, bonus_b, bonus_c1, bonus_c2, bonus_breakdown, bank_hours_amount)
  ON public.payments FROM authenticated;
REVOKE SELECT (error_value) ON public.error_records FROM authenticated;
REVOKE SELECT (direct_value) ON public.triage_errors FROM authenticated;
REVOKE SELECT (value_per_error, total_deducted) ON public.triage_error_distributions FROM authenticated;
REVOKE SELECT (value_deducted) ON public.triage_distribution_employees FROM authenticated;
REVOKE SELECT (bonus_amount_removed) ON public.bonus_removals FROM authenticated;

GRANT SELECT ON public.payments_v TO authenticated;
GRANT SELECT ON public.error_records_v TO authenticated;
GRANT SELECT ON public.triage_errors_v TO authenticated;
GRANT SELECT ON public.triage_error_distributions_v TO authenticated;
GRANT SELECT ON public.triage_distribution_employees_v TO authenticated;
GRANT SELECT ON public.bonus_removals_v TO authenticated;
