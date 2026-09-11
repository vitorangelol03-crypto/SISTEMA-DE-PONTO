-- ════════════════════════════════════════════════════════════════════════════
-- RECIBO DE PAGAMENTO PUBLICADO PRO FUNCIONÁRIO — 1/3: A TABELA
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
-- ROLLBACK:
--   DROP POLICY IF EXISTS payment_receipts_company_all ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'payment-receipts';  -- esvaziar antes
--   DROP TABLE IF EXISTS public.payment_receipt_publications CASCADE;
-- ════════════════════════════════════════════════════════════════════════════

-- ✅ APLICADA em 11/09/2026 (versão 20260911050814). As outras duas partes:
--    20260911050821 (o bucket) e 20260911051000 (a policy — PENDENTE).

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

commit;
