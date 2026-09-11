-- ════════════════════════════════════════════════════════════════════════════
-- RECIBO DE PAGAMENTO — a policy do bucket deixa de permitir APAGAR
--
-- ✅ APLICADA em 11/09/2026 (versão 20260911124322, a mesma do nome do arquivo).
--
-- 🔴 O PORQUÊ (achado de uma auditoria adversarial, no mesmo dia):
-- a policy `20260911121906` nasceu `for all`. `for all` inclui DELETE — então
-- quem tem `financial.viewPayments`, que é uma permissão de **LEITURA**, podia
-- **apagar e sobrescrever** recibo de pagamento. Hoje são 3 supervisores nessa
-- situação. Recibo é documento: sumir em silêncio é pior do que nunca ter sido
-- publicado.
--
-- Agora são 3 policies separadas e NENHUMA de DELETE. Quem precisa apagar de
-- verdade (limpeza, correção de rota) é o `service_role`, que não passa por RLS.
--
-- ⚠️ O UPDATE é NECESSÁRIO, não é folga: publicar de novo o mesmo período
-- SUBSTITUI o recibo (o upload usa `upsert`), que é como se corrige um valor
-- errado. Sem UPDATE, corrigir seria impossível.
--
-- REVERSÃO (volta ao estado anterior, mais frouxo — não recomendado):
--   drop policy payment_receipts_ler on storage.objects;
--   drop policy payment_receipts_publicar on storage.objects;
--   drop policy payment_receipts_republicar on storage.objects;
--   e recriar a `payment_receipts_company_all` de 20260911121906.
-- ════════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists payment_receipts_company_all on storage.objects;

create policy payment_receipts_ler on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and ( (select public.financeiro_acesso_total())
          or ( (select public.financeiro_ve_pagamento())
               and split_part(name, '/', 1) = coalesce((select auth.jwt() ->> 'company_id'), '') ) )
  );

create policy payment_receipts_publicar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and ( (select public.financeiro_acesso_total())
          or ( (select public.financeiro_ve_pagamento())
               and split_part(name, '/', 1) = coalesce((select auth.jwt() ->> 'company_id'), '') ) )
  );

create policy payment_receipts_republicar on storage.objects
  for update to authenticated
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
