-- Sub-fase audit-round-2: _test_create_supervisor_with_perms (16.3) usa
-- gen_salt('bf', 10) que está em extensions schema. Local funciona mas CI
-- (com search_path diferente) falha com "function gen_salt(unknown, integer)
-- does not exist". Fix: ALTER FUNCTION pra search_path explícito + qualifica
-- crypt/gen_salt.

CREATE OR REPLACE FUNCTION public._test_create_supervisor_with_perms(
  sup_id TEXT,
  plain_pass TEXT,
  perms_json JSONB,
  company_uuid UUID,
  created_by_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  DELETE FROM user_permissions WHERE user_id = sup_id;
  DELETE FROM users WHERE id = sup_id;

  INSERT INTO users (id, password_hash, role, company_id, created_by)
  VALUES (
    sup_id,
    extensions.crypt(plain_pass, extensions.gen_salt('bf', 10)),
    'supervisor',
    company_uuid,
    created_by_id
  );

  INSERT INTO user_permissions (user_id, company_id, permissions, updated_by)
  VALUES (sup_id, company_uuid, perms_json, created_by_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._test_create_supervisor_with_perms(TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._test_create_supervisor_with_perms(TEXT, TEXT, JSONB, UUID, TEXT) TO authenticated, service_role;
