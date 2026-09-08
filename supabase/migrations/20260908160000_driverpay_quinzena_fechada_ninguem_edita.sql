-- ═══════════════════════════════════════════════════════════════════════════════
-- Pedido do Victor (08/09/2026): "não né, 2626 mexe em quinzena fechada ninguém".
-- Ou seja: quinzena concluída passa a ser imutável pra TODO MUNDO no painel, inclusive
-- o mestre 2626. Pra editar, o caminho é REABRIR a quinzena (já existe: `reopenPeriod`
-- em src/services/driverPay.ts:1352, ligado na tela em DriverPayTab.tsx:2022; a tabela
-- driverpay_periods não tem trava, então reabrir continua funcionando).
--
-- 🔴 FURO PROVADO NO CAMINHO (não era hipótese — testado em transação com rollback):
--   a trava usava `IF current_user IN ('service_role','postgres','supabase_admin')` pra
--   decidir "isso é o backend, deixa passar". Só que `current_user` vira **postgres**
--   dentro de QUALQUER função SECURITY DEFINER — e as 7 RPCs `*_masked` que escrevem
--   (upsert_driverpay_package_masked, recompute_driverpay_payment_totals_masked,
--   update_driverpay_package_rate_where_changed_masked, create_driverpay_platform_masked,
--   upsert_driverpay_platform_rates_masked, upsert_payment_bonus_masked,
--   upsert_payment_rate_masked) são SECURITY DEFINER com dono postgres e EXECUTE pro
--   `authenticated`. Resultado medido: como 9999, escrever DIRETO na tabela em quinzena
--   concluída era BARRADO, mas passar pela RPC **GRAVAVA**. A trava estava furada por
--   dentro, pra qualquer usuário, desde a leva de segurança de 03-04/09.
--
-- CORREÇÃO: a decisão de "é backend?" deixa de olhar `current_user` e passa a olhar o
--   **JWT da requisição**, que não muda dentro de uma função SECURITY DEFINER:
--     - sem claims (psql/cron/manutenção) ......... passa
--     - claims.role = 'service_role' (edge fns) ... passa  → app do entregador intacto
--     - qualquer usuário logado ................... trava aplica, inclusive dentro das RPCs
--   E o bypass do 2626 sai.
--
-- PROVADO com a versão nova, em transação com rollback:
--   2626 escreve DIRETO em quinzena FECHADA ....... BARRADO
--   2626 pela RPC masked em quinzena FECHADA ...... BARRADO  (o furo)
--   9999 pela RPC masked em quinzena FECHADA ...... BARRADO
--   2626 pela RPC masked em quinzena ABERTA ....... passou  (dia a dia intacto)
--   backend service_role em quinzena FECHADA ...... passou  (app do entregador)
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.driverpay_enforce_period_locked()
returns trigger
language plpgsql
set search_path to ''
as $function$
DECLARE
  v_row record;
  v_json jsonb;
  v_claims jsonb;
  v_period_id uuid;
  v_status text;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;

  -- Sem JWT: manutenção direta no banco (psql, cron, migration). Não bloqueia.
  IF v_claims IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Backend de verdade (edge functions e scripts com a service key). O app do entregador
  -- passa por aqui — é o que mantém o envio de nota funcionando em quinzena já fechada.
  IF v_claims ->> 'role' = 'service_role' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF current_user IN ('service_role','supabase_admin') THEN RETURN COALESCE(NEW, OLD); END IF;

  -- NÃO existe mais bypass do 2626 (decisão do Victor, 08/09): quinzena fechada é
  -- imutável pra todo mundo no painel. Pra editar, reabra a quinzena.

  v_row  := COALESCE(NEW, OLD);
  v_json := to_jsonb(v_row);

  IF (v_json ? 'period_id') AND (v_json ->> 'period_id') IS NOT NULL THEN
    v_period_id := (v_json ->> 'period_id')::uuid;
  ELSIF (v_json ? 'payment_id') AND (v_json ->> 'payment_id') IS NOT NULL THEN
    SELECT p.period_id INTO v_period_id
      FROM public.driverpay_payments p
     WHERE p.id = (v_json ->> 'payment_id')::uuid;
  END IF;

  IF v_period_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT status INTO v_status FROM public.driverpay_periods WHERE id = v_period_id;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'Quinzena concluida: reabra a quinzena para editar';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $function$;
