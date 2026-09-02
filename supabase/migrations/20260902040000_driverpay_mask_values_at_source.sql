-- Mascaramento de valores em R$ de Pagamentos Driver NO BANCO (02/09/2026, pedido do
-- Victor: a permissão `driverpay.viewValues` (leva anterior) só escondia na TELA — o
-- número cru continuava vindo inteiro pro navegador em toda leitura, visível em
-- Rede/Network do inspecionar elemento ou em qualquer chamada REST direta. Isso fecha
-- a raiz: o banco não manda mais o valor pra quem não pode ver, ponto.
--
-- Mecanismo: 1 view "_v" por tabela com coluna de dinheiro, `security_invoker = true`
-- (a view roda com o RLS de quem pediu — mesmo isolamento por empresa de sempre,
-- nenhuma mudança aí) + as colunas de R$ trocadas por
-- `CASE WHEN <pode ver> THEN valor ELSE NULL END`. Depois REVOKE SELECT só nas colunas
-- de dinheiro das tabelas originais (não a tabela inteira — id/nome/status continuam
-- lidos direto, sem view, em todo o resto do código que não mexe com valor) e GRANT
-- SELECT nas views. Quem tenta ler a coluna crua da tabela original recebe erro claro
-- do Postgres, não dado errado — qualquer chamada que eu tenha esquecido de trocar
-- quebra alto (some da tela com erro), nunca vaza baixo.
--
-- "Pode ver" = `user_has_module_permission(sub, 'driverpay', 'viewValues')`, com o MESMO
-- bypass do 2626 usado nos triggers da leva anterior (líder fixo, nunca mascarado).
--
-- Escrita (INSERT/UPDATE/DELETE) continua na tabela original, sem mudança — só LEITURA
-- passa a ir pela view. `ensurePerm` no frontend já bloqueia quem não devia escrever.

-- ---------- 0. Backfill defensivo ----------
-- `viewValues` é mais novo que várias linhas de `user_permissions` (inclusive 9999/8888,
-- upsertadas antes dessa chave existir). O frontend já trata "chave ausente" como default
-- (`true`, DEFAULT_SUPERVISOR_PERMISSIONS.driverpay.viewValues), mas
-- `user_has_module_permission` só tem fallback pra LINHA ausente, não pra CHAVE ausente
-- dentro de uma seção que já existe — sem isto, 9999/8888 (que já tinham a seção
-- `driverpay` customizada antes de `viewValues` nascer) ficariam mascarados por engano.
-- Só toca quem tem `driverpay` customizado E não tem a chave — aditivo, mesmo valor que
-- o app já assume pra eles.
UPDATE public.user_permissions
SET permissions = jsonb_set(permissions, '{driverpay,viewValues}', 'true'::jsonb)
WHERE permissions -> 'driverpay' IS NOT NULL
  AND permissions -> 'driverpay' -> 'viewValues' IS NULL;

-- ---------- 1. Views mascaradas ----------

CREATE OR REPLACE VIEW public.driverpay_payments_v WITH (security_invoker = true) AS
SELECT
  id, company_id, period_id, driver_id, driver_name_snapshot, route_snapshot,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN total_packages_amount ELSE NULL END AS total_packages_amount,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN total_discounts ELSE NULL END AS total_discounts,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN total_vales ELSE NULL END AS total_vales,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN total_net ELSE NULL END AS total_net,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN zapex_rate ELSE NULL END AS zapex_rate,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN total_zapex ELSE NULL END AS total_zapex,
  nota_fiscal_recebida, espelho_conferido, espelho_conferido_at, espelho_conferido_by,
  created_at, updated_at
FROM public.driverpay_payments;

CREATE OR REPLACE VIEW public.driverpay_payment_packages_v WITH (security_invoker = true) AS
SELECT
  id, company_id, payment_id, platform_name, route, packages,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN rate_snapshot ELSE NULL END AS rate_snapshot,
  created_at
FROM public.driverpay_payment_packages;

CREATE OR REPLACE VIEW public.driverpay_discounts_v WITH (security_invoker = true) AS
SELECT
  id, company_id, payment_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN amount ELSE NULL END AS amount,
  package_code, observation, package_status, proof1_path, proof2_path, proof_video_path,
  created_by, created_at
FROM public.driverpay_discounts;

CREATE OR REPLACE VIEW public.driverpay_vales_v WITH (security_invoker = true) AS
SELECT
  id, company_id, payment_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN amount ELSE NULL END AS amount,
  vale_date, observation, created_by, created_at
FROM public.driverpay_vales;

CREATE OR REPLACE VIEW public.driverpay_platforms_v WITH (security_invoker = true) AS
SELECT
  id, company_id, name,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN default_rate ELSE NULL END AS default_rate,
  sort_order, active, color, highlight_mirror, mirror_notice, mirror_separate_value,
  nota_emitter_id, created_by, created_at
FROM public.driverpay_platforms;

CREATE OR REPLACE VIEW public.driverpay_platform_rates_v WITH (security_invoker = true) AS
SELECT
  id, company_id, driver_id, platform_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN rate ELSE NULL END AS rate,
  updated_by, updated_at
FROM public.driverpay_platform_rates;

CREATE OR REPLACE VIEW public.driverpay_deduction_ledger_v WITH (security_invoker = true) AS
SELECT
  id, company_id, period_id, driver_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN amount ELSE NULL END AS amount,
  source, source_ref, created_at, created_by
FROM public.driverpay_deduction_ledger;

CREATE OR REPLACE VIEW public.driverpay_deduction_carryover_v WITH (security_invoker = true) AS
SELECT
  id, company_id, from_period_id, to_period_id, driver_id,
  CASE WHEN (auth.jwt() ->> 'sub') = '2626'
         OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')
       THEN amount ELSE NULL END AS amount,
  created_at, created_by
FROM public.driverpay_deduction_carryover;

-- ---------- 2. Trava: coluna de dinheiro deixa de ser legível direto na tabela crua ----------
-- Só a coluna, não a tabela — id/nome/status/datas continuam de leitura direta pra
-- todo o resto do código que não mexe com valor (não precisa trocar pra view).
REVOKE SELECT (total_packages_amount, total_discounts, total_vales, total_net, zapex_rate, total_zapex)
  ON public.driverpay_payments FROM authenticated;
REVOKE SELECT (rate_snapshot) ON public.driverpay_payment_packages FROM authenticated;
REVOKE SELECT (amount) ON public.driverpay_discounts FROM authenticated;
REVOKE SELECT (amount) ON public.driverpay_vales FROM authenticated;
REVOKE SELECT (default_rate) ON public.driverpay_platforms FROM authenticated;
REVOKE SELECT (rate) ON public.driverpay_platform_rates FROM authenticated;
REVOKE SELECT (amount) ON public.driverpay_deduction_ledger FROM authenticated;
REVOKE SELECT (amount) ON public.driverpay_deduction_carryover FROM authenticated;

GRANT SELECT ON public.driverpay_payments_v TO authenticated;
GRANT SELECT ON public.driverpay_payment_packages_v TO authenticated;
GRANT SELECT ON public.driverpay_discounts_v TO authenticated;
GRANT SELECT ON public.driverpay_vales_v TO authenticated;
GRANT SELECT ON public.driverpay_platforms_v TO authenticated;
GRANT SELECT ON public.driverpay_platform_rates_v TO authenticated;
GRANT SELECT ON public.driverpay_deduction_ledger_v TO authenticated;
GRANT SELECT ON public.driverpay_deduction_carryover_v TO authenticated;
