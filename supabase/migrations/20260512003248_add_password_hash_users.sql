-- Sub-fase 11.3 step 1 — ADD password_hash em users.
-- password plain mantido durante transição como rollback.
-- Será dropado em 11.1 (cutover atômico) após validação.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
COMMENT ON COLUMN public.users.password_hash IS 'bcrypt hash da senha. Migrado via edge fn auth-login. Coexiste com password plain até sub-fase 11.1 cutover (drop plain).';
