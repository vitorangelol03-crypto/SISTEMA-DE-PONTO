-- Sub-fase 17.3.X (fix advisors): _check_face_auto_reset não deveria ser chamável via RPC público.
-- É trigger function — só é executada via AFTER INSERT em face_auth_attempts.
-- REVOKE EXECUTE de anon + authenticated; também aplicar search_path imutável.

ALTER FUNCTION public._check_face_auto_reset() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public._check_face_auto_reset() FROM PUBLIC, anon, authenticated;
-- Trigger functions ficam acessíveis pro postgres role (que executa trigger)

-- _test_create_supervisor_with_perms (16.3 helper) — search_path imutável
ALTER FUNCTION public._test_create_supervisor_with_perms(TEXT, TEXT, JSONB, UUID, TEXT)
  SET search_path = public, pg_temp;
