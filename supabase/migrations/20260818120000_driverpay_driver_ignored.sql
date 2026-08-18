-- ============================================================================
-- LEMBRAR QUEM FOI "IGNORADO" NA IMPORTAÇÃO DE PLANILHA (18/08/2026, pedido do Victor)
--
-- POR QUÊ: "vincular" um entregador da planilha a um driver cadastrado já fica salvo
-- pra sempre (driverpay_driver_aliases) — a próxima importação casa sozinho. "Ignorar"
-- NÃO fica salvo hoje: todo import da mesma planilha (ex.: LOGGI trazendo entregadores
-- de fora da empresa, achado 18/08) volta a pedir a mesma decisão de novo. Pedido do
-- Victor: "guarda os rejeitados também... pra não precisar ficar mexendo toda vez que
-- for upar a planilha".
--
-- MESMO FORMATO da tabela de apelidos (company_id + alias_norm únicos), só que sem
-- driver_id — aqui a decisão é "nunca criar nem vincular este nome", não "vira este
-- driver". Vale pras 4 plataformas (decisão do Victor: mesmo mecanismo já compartilhado).
--
-- COMO ENTRA NO MATCH: `matchDriver` (driverNameMatch.ts) passa a checar, na ordem:
-- 1) alias vinculado -> matched; 2) alias ignorado (esta tabela) -> status 'ignored'
-- (resolução default = Ignorar, mas o operador pode trocar na hora, se quiser); 3) nem
-- um nem outro -> 'new' (pendente, como sempre foi).
--
-- EDIÇÃO: o operador pode desfazer um "ignorado" (linha some, volta a aparecer como
-- pendente no próximo import) numa tela de gerenciamento — ver DriverImportLinksModal.tsx.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.driverpay_driver_ignored (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Nome exatamente como veio na planilha, na PRIMEIRA vez que foi ignorado (auditoria).
  alias_raw  text NOT NULL,
  -- Chave normalizada (mesma função normalizeDriverName da tabela de apelidos).
  alias_norm text NOT NULL CHECK (length(btrim(alias_norm)) > 0),
  -- Plataforma de onde veio (iMile/Shopee/Anjun/LOGGI) — só auditoria, não filtra o match.
  source     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (company_id, alias_norm)
);

COMMENT ON TABLE public.driverpay_driver_ignored IS
  'Nomes de entregador (vindos de planilha) que o operador marcou "ignorar" na '
  'importação — lembrado pra não pedir a mesma decisão de novo. Apagar a linha faz '
  'o nome voltar a aparecer como pendente no próximo import.';

-- RLS: mesmo padrão da tabela de apelidos e das outras tabelas driverpay.
ALTER TABLE public.driverpay_driver_ignored ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driverpay_rls ON public.driverpay_driver_ignored;
CREATE POLICY driverpay_rls ON public.driverpay_driver_ignored FOR ALL TO authenticated
  USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.driverpay_driver_ignored CASCADE;
-- ============================================================================
