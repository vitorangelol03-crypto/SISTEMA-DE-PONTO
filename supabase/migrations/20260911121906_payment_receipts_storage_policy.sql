-- ════════════════════════════════════════════════════════════════════════════
-- RECIBO DE PAGAMENTO — 3/3: A POLICY DO BUCKET
--
-- ✅ APLICADA em 11/09/2026 (versão 20260911121906, a mesma do nome do arquivo).
--    Na madrugada o modo automático barrou (é tabela compartilhada do Supabase);
--    passou quando o Victor pediu explicitamente.
--
-- ⚠️ ESTA VERSÃO FOI SUBSTITUÍDA no mesmo dia por `20260911124322`: a policy
--    nascia `for all`, o que dava DELETE a quem só tem `financial.viewPayments`
--    (permissão de LEITURA). Uma auditoria adversarial pegou. O arquivo fica
--    aqui porque é o histórico do que rodou; o estado atual é o da 124322.
--
-- As duas funções-porteiro abaixo continuam valendo — são elas que a policy nova
-- usa.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- O caminho é `{company_id}/{inicio}_{fim}/{employee_id}.pdf`, então a 1ª pasta
-- é o company_id.
--
-- ⚠️ PADRÃO CONFERIDO EM PRODUÇÃO (11/09/2026): as policies dos 4 buckets do
-- driverpay NÃO são "empresa e pronto" — elas checam a PERMISSÃO do módulo:
--   bucket_id = X AND ( acesso_total() OR ( tem_aba() AND a pasta é da empresa ) )
-- Aqui vale o mesmo, com o módulo `financial`: quem não pode ver pagamento não
-- pode escrever um recibo de pagamento. Só a empresa bater seria mais frouxo que
-- o resto da casa.
--
-- 🔴 ESTE BLOCO PRECISA SER APLICADO À MÃO (Victor, 11/09/2026): o modo
-- automático barra criar policy em `storage.objects` — é uma tabela compartilhada
-- do Supabase. A TABELA e o BUCKET já estão aplicados; falta SÓ isto. Sem ele
-- ninguém consegue subir o PDF e o botão "Publicar" dá erro de permissão.
-- Cole no SQL Editor do Supabase e rode:

create or replace function public.financeiro_acesso_total()
returns boolean language sql stable security definer set search_path to '' as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role' then true
    when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' = '2626' then true
    when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' = '9999'
     and public.user_has_module_permission('9999', 'financial', 'viewPayments') then true
    else false
  end;
$$;

create or replace function public.financeiro_ve_pagamento()
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(
    public.user_has_module_permission(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      'financial', 'viewPayments'),
    false);
$$;

revoke all on function public.financeiro_acesso_total() from public;
revoke all on function public.financeiro_ve_pagamento() from public;
grant execute on function public.financeiro_acesso_total() to authenticated;
grant execute on function public.financeiro_ve_pagamento() to authenticated;

drop policy if exists payment_receipts_company_all on storage.objects;
create policy payment_receipts_company_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'payment-receipts'
    and ( (select public.financeiro_acesso_total())
          or ( (select public.financeiro_ve_pagamento())
               and split_part(name, '/', 1) = coalesce((select auth.jwt() ->> 'company_id'), '') ) )
  )
  with check (
    bucket_id = 'payment-receipts'
    and ( (select public.financeiro_acesso_total())
          or ( (select public.financeiro_ve_pagamento())
               and split_part(name, '/', 1) = coalesce((select auth.jwt() ->> 'company_id'), '') ) )
  );

commit;
