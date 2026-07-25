-- ============================================================================
-- FIX: reset de senha do app do driver NUNCA funcionou pelo painel.
--
-- CAUSA RAIZ (provada em prod, 2026-07-25): a migration 20260723150000 criou
-- uma policy de DELETE em driverpay_driver_auth sem policy de SELECT (de
-- proposito, pra proteger os hashes). So que no Postgres um DELETE com WHERE
-- que referencia colunas da tabela exige que as linhas tambem sejam visiveis
-- pelas policies de SELECT — sem nenhuma, o DELETE do painel casava 0 linhas,
-- em silencio (sem erro). Prova: DELETE sem WHERE (nao referencia coluna)
-- afetaria as 37 linhas; com WHERE driver_id=X afetava 0.
--
-- CONSERTO: RPC SECURITY DEFINER que apaga a credencial por dentro (bypassa
-- RLS) e DEVOLVE quantas linhas apagou — o painel passa a saber quando nao
-- havia nada pra resetar. A autorizacao do CHAMADOR e checada aqui dentro
-- (mestre 9999/2626 ou mesma empresa do driver), igual a policy antiga
-- prometia. Os hashes continuam ilegiveis pro painel (segue sem SELECT).
-- A policy de DELETE morta e removida (nunca autorizou nada; deixa-la
-- convidaria um "conserto" errado via policy de SELECT, expondo os hashes).
--
-- Aplicada em prod via MCP apply_migration (2026-07-25, OK do Victor).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.driverpay_reset_driver_password(p_driver_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_driver_company uuid;
  v_sub text := COALESCE(auth.jwt() ->> 'sub', '');
  v_jwt_company text := COALESCE(auth.jwt() ->> 'company_id', '');
  v_deleted integer;
BEGIN
  SELECT company_id INTO v_driver_company FROM driverpay_drivers WHERE id = p_driver_id;
  IF v_driver_company IS NULL THEN
    RAISE EXCEPTION 'Driver nao encontrado';
  END IF;
  IF NOT (v_sub IN ('9999','2626') OR v_driver_company::text = v_jwt_company) THEN
    RAISE EXCEPTION 'Sem permissao para resetar a senha deste driver';
  END IF;
  DELETE FROM driverpay_driver_auth WHERE driver_id = p_driver_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $function$;

COMMENT ON FUNCTION public.driverpay_reset_driver_password(uuid) IS
  'Reset de senha do app do driver: apaga a credencial (volta pro 1234 com troca obrigatoria e destrava lockout) e devolve quantas linhas apagou (0 = driver nunca acessou o app). Authz do chamador: mestre 9999/2626 ou mesma empresa do driver.';

REVOKE EXECUTE ON FUNCTION public.driverpay_reset_driver_password(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.driverpay_reset_driver_password(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.driverpay_reset_driver_password(uuid) TO authenticated, service_role;

-- Policy morta (nunca funcionou — ver causa raiz acima). O reset agora e via RPC.
DROP POLICY IF EXISTS driverpay_driver_auth_master_delete ON public.driverpay_driver_auth;

-- ============================================================================
-- ROLLBACK (se precisar):
--   DROP FUNCTION IF EXISTS public.driverpay_reset_driver_password(uuid);
--   -- e recriar a policy da 20260723150000 (mesmo sabendo que ela nao opera):
--   -- CREATE POLICY driverpay_driver_auth_master_delete ON public.driverpay_driver_auth
--   --   FOR DELETE TO authenticated USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), ''))
--   --     OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));
-- ============================================================================
