-- Sub-fase 17.6.2 helper: pgcrypto.crypt() exposto como RPC pra vitest gerar
-- hashes bcrypt compatíveis com bcryptjs (usado pela edge fn public-api-v1).
-- Apenas service_role pode chamar (vitest tests).

CREATE OR REPLACE FUNCTION public._test_bcrypt_hash(plain TEXT)
RETURNS TEXT
LANGUAGE SQL
SET search_path = public, extensions, pg_temp
AS $$
  SELECT extensions.crypt(plain, extensions.gen_salt('bf', 10));
$$;

REVOKE EXECUTE ON FUNCTION public._test_bcrypt_hash(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_bcrypt_hash(TEXT) TO service_role;
