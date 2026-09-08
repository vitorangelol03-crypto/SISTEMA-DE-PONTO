-- ═══════════════════════════════════════════════════════════════════════════════
-- Pedido do Victor (08/09/2026): fechar o buraco do §2.2 de CHECKPOINT_PROXIMOS_PASSOS.md.
--
-- O QUE ESTAVA ERRADO (provado no banco em 08/09, não deduzido):
--   As 24 policies `driverpay_rls` diziam "mesma empresa OU sub in (9999,2626)". Ou seja,
--   QUALQUER usuário de Caratinga — os supervisores 01/02/03/04/7770, que NÃO têm a aba
--   Pagamentos Driver liberada — lia e escrevia tudo direto na API REST, sem passar pela
--   tela. Provado: `authenticated` ainda tem INSERT/UPDATE/DELETE em driverpay_payments,
--   _packages, _discounts, _vales e SELECT completo em driverpay_drivers (CPF, pix_key,
--   phone, recebedor_pix). A leva de 03-04/09 fechou só a LEITURA de valores em R$ (revoke
--   de coluna + funções mascaradas); a ESCRITA nunca foi fechada.
--
-- DECISÃO DO VICTOR (08/09): a trava do banco passa a seguir a PERMISSÃO da tela, não o
--   número do usuário. Isso respeita a decisão dele de 02/09 (as travas exclusivas do 2626
--   viraram permissão normal configurável — migration 20260902020000) em vez de voltar
--   atrás pra "só 2626", que era a recomendação velha de 31/08 e está OBSOLETA.
--   Decidido também: o 9999 CONTINUA enxergando as duas empresas (como hoje); o 8888
--   continua só na dele.
--
-- ⚠️ POR QUE O 2626 PRECISA DE BYPASS EXPLÍCITO AQUI:
--   O 2626 NÃO tem linha em user_permissions (conferido: só 02, 03, 04, 8888 e 9999 têm),
--   e `user_has_module_permission` devolve false pra quem não tem linha. Ele usa a aba
--   graças ao bypass incondicional do frontend em src/hooks/usePermissions.ts:47
--   (`if (userId === PONTO_EDITOR_ID) return true`). Sem repetir esse bypass no banco, o
--   PRÓPRIO VICTOR perderia o acesso. O bypass abaixo espelha exatamente esse comportamento.
--
-- ESCOPO DESTA LEVA (1 de 2): as 24 policies + as 3 RPCs de período.
--   Fica pra leva 2: as 19 funções `*_masked` (hoje só conferem empresa, não a permissão),
--   as 5 policies de storage (hoje presas em '9999'/'2626') e fechar o bucket público
--   driverpay-discount-proofs com URL assinada.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1) Funções de decisão ──────────────────────────────────────────────────────
-- Sem argumento e STABLE de propósito: nas policies elas entram como `(select ...)`, então
-- o Postgres avalia UMA vez por query (InitPlan), não por linha — mesma técnica que a
-- policy antiga já usava com `(SELECT auth.jwt()...)`. Só a comparação de company_id fica
-- por linha, que é barata e é o que já acontecia.

-- Quem enxerga o driverpay das DUAS empresas.
create or replace function public.driverpay_acesso_total()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    -- service_role (edge functions, scripts de backup) nunca passa por RLS, mas as RPCs
    -- SECURITY DEFINER abaixo chamam esta função — então precisa responder true pra ele.
    when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
      then true
    -- 2626: líder único e fixo. Espelha usePermissions.ts:47. Não é configurável.
    when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' = '2626'
      then true
    -- 9999: mestre cross-empresa, MAS agora limitável pela tela (decisão de 02/09).
    -- Se o Victor desligar 'driverpay.view' dele em Permissões, ele perde o acesso.
    when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' = '9999'
     and public.user_has_module_permission('9999', 'driverpay', 'view')
      then true
    else false
  end;
$$;

-- Tem a aba Pagamentos Driver liberada na tela de Permissões?
create or replace function public.driverpay_tem_aba()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    public.user_has_module_permission(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      'driverpay', 'view'),
    false);
$$;

-- Versão com empresa + ação, pras RPCs (que recebem company_id como parâmetro).
create or replace function public.driverpay_pode(p_company_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.driverpay_acesso_total()
      or ( coalesce(public.user_has_module_permission(
             nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
             'driverpay', p_action), false)
           and p_company_id::text = coalesce(
             nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'company_id', '') );
$$;

revoke execute on function public.driverpay_acesso_total() from public, anon;
revoke execute on function public.driverpay_tem_aba() from public, anon;
revoke execute on function public.driverpay_pode(uuid, text) from public, anon;
grant execute on function public.driverpay_acesso_total() to authenticated;
grant execute on function public.driverpay_tem_aba() to authenticated;
grant execute on function public.driverpay_pode(uuid, text) to authenticated;

-- ── 2) Recria as 24 policies `driverpay_rls` ───────────────────────────────────
-- Muda também o ROLE de 2 delas (driverpay_driver_aliases e driverpay_mirror_notice hoje
-- estão em `public`, o que inclui o anon) para `authenticated`. Conferido antes: nem o app
-- do motorista (src/components/driver-app/, src/services/driverApp.ts) nem a edge function
-- driver-public-api tocam essas 2 tabelas — são usadas só pelo painel, em
-- src/services/driverPay.ts. O anon já era barrado na prática (não tem company_id no JWT);
-- isso só tira o convite.
-- driverpay_driver_auth fica de fora: tem RLS ligada e ZERO policy (fechada de propósito,
-- só service_role entra) — não é tocada aqui.
do $$
declare
  t text;
  v_regra text;
begin
  v_regra := '(select public.driverpay_acesso_total())'
          || ' or ((select public.driverpay_tem_aba())'
          || '     and (company_id)::text = coalesce((select auth.jwt() ->> ''company_id''), ''''))';

  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'driverpay\_%' escape '\'
    order by tablename
  loop
    if exists (select 1 from pg_policies
               where schemaname='public' and tablename=t and policyname='driverpay_rls') then
      execute format('drop policy driverpay_rls on public.%I', t);
      execute format(
        'create policy driverpay_rls on public.%I for all to authenticated using (%s) with check (%s)',
        t, v_regra, v_regra);
    end if;
  end loop;
end $$;

-- ── 3) As 3 RPCs de período passam a olhar QUEM chamou ─────────────────────────
-- Antes: SECURITY DEFINER, EXECUTE liberado pro `authenticated`, e NENHUMA checava o JWT —
-- recebiam company_id e user_id como parâmetro e confiavam. Resultado provado: o 8888
-- (Ponte Nova) conseguia concluir a quinzena de Caratinga só passando o id certo, e o
-- p_user_id ia pro campo `concluded_by` sem nenhuma validação.
-- O corpo de cada uma continua IDÊNTICO — só entra a guarda no começo.

create or replace function public.driverpay_create_period(
  p_company_id uuid, p_user_id text, p_label text,
  p_start date default null::date, p_end date default null::date, p_preload boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE v_new uuid;
BEGIN
  IF NOT public.driverpay_pode(p_company_id, 'managePeriods') THEN
    RAISE EXCEPTION 'Sem permissao para criar quinzena no Pagamentos Driver';
  END IF;
  INSERT INTO driverpay_periods (company_id, label, start_date, end_date, status, created_by) VALUES (p_company_id, p_label, p_start, p_end, 'aberto', p_user_id) RETURNING id INTO v_new;
  IF p_preload THEN
    INSERT INTO driverpay_payments (company_id, period_id, driver_id, driver_name_snapshot, route_snapshot)
    SELECT p_company_id, v_new, d.id, d.name, d.route FROM driverpay_drivers d WHERE d.company_id = p_company_id AND d.active = true;
  END IF;
  RETURN v_new;
END; $function$;

create or replace function public.driverpay_conclude_period_only(
  p_period_id uuid, p_company_id uuid, p_user_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE v_company uuid; v_status text;
BEGIN
  IF NOT public.driverpay_pode(p_company_id, 'complete') THEN
    RAISE EXCEPTION 'Sem permissao para concluir quinzena no Pagamentos Driver';
  END IF;
  SELECT company_id, status INTO v_company, v_status FROM driverpay_periods WHERE id = p_period_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Periodo % nao encontrado', p_period_id; END IF;
  IF v_company <> p_company_id THEN RAISE EXCEPTION 'Periodo nao pertence a empresa informada'; END IF;
  IF v_status = 'concluido' THEN RAISE EXCEPTION 'Periodo ja concluido'; END IF;
  UPDATE driverpay_payments dp SET
    total_packages_amount = COALESCE(pk.amt,0),
    total_zapex           = round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2),
    total_discounts       = COALESCE(ds.amt,0),
    total_vales           = COALESCE(vl.amt,0),
    total_net             = COALESCE(pk.amt,0) + round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2) - COALESCE(ds.amt,0) - COALESCE(vl.amt,0),
    updated_at            = now()
  FROM (SELECT id FROM driverpay_payments WHERE period_id = p_period_id) t
  LEFT JOIN LATERAL (SELECT round(SUM(pp.packages * pp.rate_snapshot),2) amt FROM driverpay_payment_packages pp
      WHERE pp.payment_id = t.id
        AND EXISTS (SELECT 1 FROM driverpay_platforms pl WHERE pl.company_id = p_company_id AND pl.name = pp.platform_name AND pl.active)) pk ON true
  LEFT JOIN LATERAL (SELECT count(*) cnt FROM driverpay_zapex WHERE payment_id = t.id) zx ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;
  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;
END; $function$;

create or replace function public.driverpay_conclude_period(
  p_period_id uuid, p_company_id uuid, p_user_id text, p_next_label text,
  p_next_start date default null::date, p_next_end date default null::date)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE v_company uuid; v_status text; v_new uuid;
BEGIN
  IF NOT public.driverpay_pode(p_company_id, 'complete') THEN
    RAISE EXCEPTION 'Sem permissao para concluir quinzena no Pagamentos Driver';
  END IF;
  SELECT company_id, status INTO v_company, v_status FROM driverpay_periods WHERE id = p_period_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Periodo % nao encontrado', p_period_id; END IF;
  IF v_company <> p_company_id THEN RAISE EXCEPTION 'Periodo nao pertence a empresa informada'; END IF;
  IF v_status = 'concluido' THEN RAISE EXCEPTION 'Periodo ja concluido'; END IF;
  UPDATE driverpay_payments dp SET
    total_packages_amount = COALESCE(pk.amt,0),
    total_zapex           = round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2),
    total_discounts       = COALESCE(ds.amt,0),
    total_vales           = COALESCE(vl.amt,0),
    total_net             = COALESCE(pk.amt,0) + round(COALESCE(zx.cnt,0) * dp.zapex_rate, 2) - COALESCE(ds.amt,0) - COALESCE(vl.amt,0),
    updated_at            = now()
  FROM (SELECT id FROM driverpay_payments WHERE period_id = p_period_id) t
  LEFT JOIN LATERAL (SELECT round(SUM(pp.packages * pp.rate_snapshot),2) amt FROM driverpay_payment_packages pp
      WHERE pp.payment_id = t.id
        AND EXISTS (SELECT 1 FROM driverpay_platforms pl WHERE pl.company_id = p_company_id AND pl.name = pp.platform_name AND pl.active)) pk ON true
  LEFT JOIN LATERAL (SELECT count(*) cnt FROM driverpay_zapex WHERE payment_id = t.id) zx ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_discounts WHERE payment_id = t.id) ds ON true
  LEFT JOIN LATERAL (SELECT round(SUM(amount),2) amt FROM driverpay_vales WHERE payment_id = t.id) vl ON true
  WHERE dp.id = t.id;
  UPDATE driverpay_periods SET status = 'concluido', concluded_at = now(), concluded_by = p_user_id WHERE id = p_period_id;
  INSERT INTO driverpay_periods (company_id, label, start_date, end_date, status, created_by)
    VALUES (p_company_id, p_next_label, p_next_start, p_next_end, 'aberto', p_user_id) RETURNING id INTO v_new;
  INSERT INTO driverpay_payments (company_id, period_id, driver_id, driver_name_snapshot, route_snapshot, zapex_rate)
  SELECT p_company_id, v_new, d.id, d.name, d.route, COALESCE(odp.zapex_rate, 0)
  FROM driverpay_drivers d
  LEFT JOIN driverpay_payments odp ON odp.driver_id = d.id AND odp.period_id = p_period_id
  WHERE d.company_id = p_company_id AND d.active = true;
  INSERT INTO driverpay_payment_packages (company_id, payment_id, platform_name, route, packages, rate_snapshot)
  SELECT p_company_id, ndp.id, oldpk.platform_name, oldpk.route, 0, oldpk.rate_snapshot
  FROM driverpay_payments ndp
  JOIN driverpay_payments odp ON odp.driver_id = ndp.driver_id AND odp.period_id = p_period_id
  JOIN driverpay_payment_packages oldpk ON oldpk.payment_id = odp.id
  WHERE ndp.period_id = v_new;
  RETURN v_new;
END; $function$;
