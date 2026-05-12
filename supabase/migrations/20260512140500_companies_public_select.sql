-- Sub-fase 11.1 fix — `companies` precisa ser pública pra SELECT (anon).
-- CompanyContext faz init pré-login pra mostrar CompanySelector ao admin.
-- Lista de empresas em si não é confidencial — display_name + city visíveis na UI.
-- Modificações (INSERT/UPDATE/DELETE) continuam admin-only.

DROP POLICY IF EXISTS "rls_companies_select_all" ON public.companies;
CREATE POLICY "rls_companies_public_select" ON public.companies
  FOR SELECT TO public USING (true);
