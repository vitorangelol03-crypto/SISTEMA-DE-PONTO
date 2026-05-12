-- Sub-fase 11.3 step 3 — migrar senhas plain → bcrypt via pgcrypto.
-- Usa gen_salt('bf', 10) (bcrypt, cost factor 10).
-- Idempotente: só atualiza linhas onde password_hash ainda é NULL ou plain.
-- O `password` plain é PRESERVADO até cutover atômico (11.1).

-- users: password (plain) → password_hash (bcrypt)
UPDATE public.users
SET password_hash = crypt(password, gen_salt('bf', 10))
WHERE password IS NOT NULL
  AND (password_hash IS NULL OR password_hash NOT LIKE '$2%');

-- admin_secret: a coluna chama-se password_hash mas armazena plain.
-- Re-hashea in-place. Guarda contra re-execução: só se não começa com $2_$ (bcrypt prefix).
UPDATE public.admin_secret
SET password_hash = crypt(password_hash, gen_salt('bf', 10))
WHERE password_hash NOT LIKE '$2%';
