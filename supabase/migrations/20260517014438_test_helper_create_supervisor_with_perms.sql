-- Sub-fase 16.3: helper pra spec 47 (supervisor users.create perm).
-- Função permite criar supervisor de teste com password bcrypt + permissions
-- custom em uma chamada RPC. Service_role bypassa RLS, então sem SECURITY
-- DEFINER. Cleanup defensivo de resíduos antes de criar.
--
-- Uso APENAS em testes (prefixo _test_). Em prod, supervisor é criado via
-- edge fn create-user.

CREATE OR REPLACE FUNCTION public._test_create_supervisor_with_perms(
  sup_id TEXT,
  plain_pass TEXT,
  perms_json JSONB,
  company_uuid UUID,
  created_by_id TEXT
) RETURNS VOID AS $$
BEGIN
  DELETE FROM user_permissions WHERE user_id = sup_id;
  DELETE FROM users WHERE id = sup_id;

  INSERT INTO users (id, password_hash, role, company_id, created_by)
  VALUES (sup_id, crypt(plain_pass, gen_salt('bf', 10)), 'supervisor', company_uuid, created_by_id);

  INSERT INTO user_permissions (user_id, company_id, permissions, updated_by)
  VALUES (sup_id, company_uuid, perms_json, created_by_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public._test_create_supervisor_with_perms(TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._test_create_supervisor_with_perms(TEXT, TEXT, JSONB, UUID, TEXT) TO authenticated, service_role;
