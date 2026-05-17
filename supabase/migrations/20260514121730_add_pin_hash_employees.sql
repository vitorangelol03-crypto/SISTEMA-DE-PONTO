-- Sub-fase 14.11.3 — pin_hash em employees (migração massa PINs plain → bcrypt)
-- Aplicada via MCP em 2026-05-14. Recuperada via auditoria forense em 2026-05-17.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

COMMENT ON COLUMN public.employees.pin_hash IS
  'Sub-fase 14.11.3: hash bcrypt do PIN (substitui pin plain). Migração: UPDATE employees SET pin_hash = crypt(pin, gen_salt(''bf'', 10)), pin = NULL WHERE pin IS NOT NULL AND pin_hash IS NULL';
