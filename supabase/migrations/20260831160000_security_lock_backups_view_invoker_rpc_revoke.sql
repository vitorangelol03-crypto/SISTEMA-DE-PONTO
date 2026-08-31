-- 31/08/2026 — Segurança: fecha 3 portas abertas pra QUALQUER pessoa com a chave anon (que
-- está no bundle do site). Provado ao vivo em prod com has_table_privilege /
-- has_function_privilege antes de aplicar; OK do Victor em 31/08 ("pode aplicar").
-- Tudo aqui é SÓ RESTRITIVO: nenhuma tela muda, nenhum dado muda.
-- Aplicada em prod via MCP apply_migration em 2026-08-31 e conferida com a mesma consulta.

-- 1) Tabelas public.backup_* (12, criadas à mão em prod, fora do repo): sem RLS e com
--    SELECT+DELETE pro anon — backup_employees_20260813 (CPF/PIN/face de 96 funcionários),
--    backup_attendance_20260813 (~5k), backup_payments_20260813 (~3k),
--    backup_driver_pix_20260724 (99), backup_espelho_conferido_20260818, backup_mirror_pub_*,
--    backup_nf_*, backup_driver_auth_20260725. RLS ligada sem policy = só dono/service_role
--    enxerga; os grants de anon/authenticated são revogados por cima. Nada em src/,
--    supabase/functions/ ou tests/ lê essas tabelas. REGRA: backup de dado sensível nunca
--    em `public` — schema privado ou arquivo.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'backup\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- 2) View driverpay_payment_computed: a migration 20260717182000 recriou com
--    CREATE OR REPLACE VIEW sem WITH (...) — isso ZERA as opções da view (doc do Postgres:
--    "the new options list replaces the existing options list"), então ela voltou a rodar
--    como o dono (postgres, BYPASSRLS) e o anon lia os 325 pagamentos com valores.
--    security_invoker = true faz a view respeitar a RLS de quem chama. Consumidores:
--    recomputePaymentTotals (src/services/driverPay.ts) como 2626 — passa na RLS das
--    tabelas base; tests/70 com service_role; funções SECURITY DEFINER rodam como dono
--    (inalteradas). REGRA: toda recriação desta view repete o WITH (security_invoker = true).
ALTER VIEW public.driverpay_payment_computed SET (security_invoker = true);
REVOKE ALL ON public.driverpay_payment_computed FROM anon;

-- 3) driverpay_conclude_period_only (20260717150000): SECURITY DEFINER, sem checagem do
--    chamador e SEM o REVOKE FROM PUBLIC que as outras duas RPCs receberam em
--    20260703170100 → o anon executava (com o period_id que a view entregava, dava pra
--    concluir a quinzena aberta sem login). Mantém authenticated (UI do 2626) e
--    service_role. REGRA: toda RPC nova nasce com REVOKE EXECUTE FROM PUBLIC, anon.
--    Segundo passo (migration à parte): checar o chamador DENTRO das 3 RPCs.
REVOKE EXECUTE ON FUNCTION public.driverpay_conclude_period_only(uuid, uuid, text) FROM PUBLIC, anon;
