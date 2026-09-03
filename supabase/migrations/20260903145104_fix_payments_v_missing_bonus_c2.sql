-- Correção (03/09/2026): a view payments_v (migração 20260903120000) esqueceu a
-- coluna bonus_c2 — ela estava no REVOKE mas nunca foi adicionada na view, então
-- todo mundo via "Bônus C2: R$ 0,00" mesmo com valor real gravado. Achado pelos
-- testes 07-financial.spec.ts:60 e 14-financial-integrity.spec.ts:237 (B e C1 corretos,
-- só C2 sempre zero). CREATE OR REPLACE VIEW não deixa reordenar colunas existentes —
-- adiciona bonus_c2 no FINAL da lista (única forma aditiva sem precisar DROP+CREATE).
-- Revisei as outras 5 views desta leva coluna por coluna depois disso — só esta tinha
-- coluna faltando.
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
       THEN bank_hours_amount ELSE NULL END AS bank_hours_amount,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
             AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
       THEN bonus_c2 ELSE NULL END AS bonus_c2
FROM public.payments;
