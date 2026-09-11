-- ════════════════════════════════════════════════════════════════════════════
-- RECIBO DE PAGAMENTO PUBLICADO PRO FUNCIONÁRIO
--
-- Pedido do Victor (10/09/2026): *"coloca também pra esse espelho, esses PDF,
-- ele aparecer na aba de erros do funcionário, pra gente poder publicar lá pra
-- eles também, lançar pra eles"*. E: *"pode deixar separado mesmo"* — BAIXAR e
-- PUBLICAR são dois botões diferentes, pra dar pra conferir antes de mandar.
--
-- Molde: o "espelho publicado" do driverpay (20260723120000), que já roda há
-- meses — tabela de publicação + bucket PRIVADO + link assinado pela edge fn.
-- Copiado o padrão de propósito: rota paralela nova seria a gambiarra.
--
-- ESTADO EM 11/09/2026:
--   ✅ tabela `payment_receipt_publications` — APLICADA
--   ✅ bucket privado `payment-receipts` — APLICADO
--   🔴 policy do bucket em `storage.objects` — FALTA (ver o bloco no fim; o modo
--      automático barra mexer nessa tabela, é você quem roda)
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS payment_receipts_company_all ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'payment-receipts';  -- esvaziar antes
--   DROP TABLE IF EXISTS public.payment_receipt_publications CASCADE;
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.payment_receipt_publications (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  -- O período é POR DATA, não por `payment_periods.id`: a gaveta do MÊS junta
  -- várias semanas e não tem um id só. Data cobre os dois casos (mês e semana).
  period_start  date not null,
  period_end    date not null,
  -- Como o funcionário vê o recibo na lista: "SETEMBRO/2026", "Semana 2 (08 – 14/09)".
  titulo        text not null check (length(btrim(titulo)) > 0),
  pdf_path      text not null check (length(btrim(pdf_path)) > 0),
  -- O líquido IMPRESSO no papel. Fica gravado pra dar pra conferir depois se o
  -- que o funcionário recebeu bate com o que o sistema diz hoje.
  total_net     numeric(12,2),
  delivered_at  timestamptz not null default now(),
  delivered_by  text references public.users(id) on delete set null,
  viewed_at     timestamptz,
  created_at    timestamptz not null default now(),
  -- Republicar o MESMO período da MESMA pessoa SUBSTITUI (corrigir um valor não
  -- pode virar dois recibos diferentes na tela dela, sem saber qual vale).
  constraint payment_receipt_pub_unico unique (company_id, employee_id, period_start, period_end)
);

create index if not exists idx_payment_receipt_pub_company  on public.payment_receipt_publications(company_id);
create index if not exists idx_payment_receipt_pub_employee on public.payment_receipt_publications(employee_id);
create index if not exists idx_payment_receipt_pub_delivery on public.payment_receipt_publications(delivered_by);
-- O funcionário abre a aba dele: busca por employee_id + empresa, mais recente em cima.
create index if not exists idx_payment_receipt_pub_do_func
  on public.payment_receipt_publications(employee_id, company_id, period_end desc);

alter table public.payment_receipt_publications enable row level security;

drop policy if exists payment_receipt_pub_rls on public.payment_receipt_publications;
create policy payment_receipt_pub_rls on public.payment_receipt_publications
  for all to authenticated
  using      (((company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')) or ((select auth.jwt() ->> 'sub') in ('9999','2626')))
  with check (((company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')) or ((select auth.jwt() ->> 'sub') in ('9999','2626')));

comment on table public.payment_receipt_publications is
  'Recibo de pagamento publicado pro FUNCIONARIO ver na aba de erros dele. '
  'PDF no bucket privado payment-receipts; o funcionario recebe link assinado pela '
  'edge fn employee-public-api (ele nao tem JWT). Decisao do Victor, 10/09/2026.';

-- ---------- Bucket PRIVADO ----------
-- Documento com dinheiro de gente real: privado, como o dos espelhos. O
-- funcionario NUNCA le o bucket direto — so por URL assinada de curta duracao.
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

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
