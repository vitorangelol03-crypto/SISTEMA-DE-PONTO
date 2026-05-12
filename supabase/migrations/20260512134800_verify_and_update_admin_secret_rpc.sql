-- Sub-fase 11.3 — RPC SECURITY DEFINER pra validar/atualizar admin_secret
-- usando pgcrypto bcrypt (crypt + gen_salt 'bf').
-- Frontend chama via supabase.rpc(...) — não precisa acesso direto à tabela.

CREATE OR REPLACE FUNCTION public.verify_admin_secret(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.admin_secret
  WHERE id = 'default';

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_secret(p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
BEGIN
  IF p_new_password IS NULL OR length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'Senha deve ter pelo menos 4 caracteres';
  END IF;

  UPDATE public.admin_secret
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin secret não inicializado';
  END IF;
END;
$$;

-- Grants — chamáveis por anon (verify_admin_secret é o gate de entrada,
-- update_admin_secret só faz sentido após verify_admin_secret OK no UI).
GRANT EXECUTE ON FUNCTION public.verify_admin_secret(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_secret(text) TO anon, authenticated;

COMMENT ON FUNCTION public.verify_admin_secret(text) IS 'Sub-fase 11.3 — valida admin_secret via bcrypt crypt(plain, hash). Retorna boolean.';
COMMENT ON FUNCTION public.update_admin_secret(text) IS 'Sub-fase 11.3 — atualiza admin_secret com bcrypt hash gerado via gen_salt bf 10.';
