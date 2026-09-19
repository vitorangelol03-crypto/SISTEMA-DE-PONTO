-- 19/09/2026 — 13º SALÁRIO (gratificação natalina), leva 2 do que ficou da folha.
--
-- Decisões do Victor (19/09): as DUAS opções de parcela (1ª+2ª ou única, escolhidas na
-- hora) · base = salário + média do adicional noturno do ano · avos pela regra dos
-- 15 dias.
--
-- Tudo ADITIVO: tabela nova, nada existente muda. Sem ninguém gerar um 13º, nenhuma
-- linha nasce e nenhum valor em produção se mexe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O que foi PAGO de 13º, por pessoa / ano / parcela
-- ─────────────────────────────────────────────────────────────────────────────
-- Por que guardar em vez de recalcular na hora: a 2ª parcela abate o que a 1ª PAGOU.
-- Se o salário mudar entre novembro e dezembro, refazer a conta abateria um valor que
-- a pessoa nunca recebeu. É a mesma razão pela qual `payments` guarda o total em vez de
-- recalcular a partir da diária.
create table if not exists public.payroll_thirteenth (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ano integer not null,
  parcela text not null,
  -- O retrato da conta no dia em que o papel saiu. Guardado inteiro de propósito: é o
  -- que permite reimprimir o MESMO recibo daqui a um ano, com a tabela de imposto do
  -- ano que era, e não com a de hoje.
  avos integer not null,
  base numeric(12,2) not null,
  bruto numeric(12,2) not null,
  inss numeric(12,2) not null default 0,
  irrf numeric(12,2) not null default 0,
  fgts numeric(12,2) not null default 0,
  adiantamento numeric(12,2) not null default 0,
  valor numeric(12,2) not null,
  pago_em date not null,
  created_by text,
  created_at timestamptz not null default now(),

  constraint payroll_thirteenth_parcela_check
    check (parcela in ('primeira', 'segunda', 'unica')),
  constraint payroll_thirteenth_avos_check
    check (avos >= 0 and avos <= 12),
  constraint payroll_thirteenth_ano_check
    check (ano >= 2020 and ano <= 2100),
  -- Uma parcela por pessoa por ano. Gerar de novo é UPDATE, não uma segunda linha:
  -- duas linhas "primeira" fariam a 2ª parcela abater o adiantamento duas vezes.
  constraint payroll_thirteenth_unica_por_parcela
    unique (employee_id, ano, parcela)
);

comment on table public.payroll_thirteenth is
  '13º salário PAGO, por pessoa/ano/parcela (19/09/2026). Retrato da conta no dia do pagamento — a 2ª parcela abate o que a 1ª de fato pagou, não uma conta refeita.';
comment on column public.payroll_thirteenth.parcela is
  'primeira (adiantamento, sem desconto) · segunda (com INSS/IRRF do 13º inteiro) · unica (tudo de uma vez).';
comment on column public.payroll_thirteenth.base is
  'Salário + média mensal do adicional noturno do ano (decisão do Victor de 19/09).';

create index if not exists payroll_thirteenth_employee_idx
  on public.payroll_thirteenth (employee_id, ano);
create index if not exists payroll_thirteenth_company_idx
  on public.payroll_thirteenth (company_id, ano);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — mesma regra das outras tabelas da folha
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.payroll_thirteenth enable row level security;

drop policy if exists rls_company_match_modify on public.payroll_thirteenth;
create policy rls_company_match_modify on public.payroll_thirteenth
  for all
  using (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  )
  with check (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  );

-- O anônimo não encosta. (Regra de 31/08: RPC e tabela nova nascem com REVOKE.)
revoke all on public.payroll_thirteenth from anon, authenticated;
grant select, insert, update, delete on public.payroll_thirteenth to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trava de permissão NO BANCO, não só na tela
-- ─────────────────────────────────────────────────────────────────────────────
-- Gerar 13º é mexer em salário: exige a mesma `employees.editPayroll` das férias e da
-- ficha de folha. O chamador sai do JWT, nunca de `current_user` (lição de 08/09:
-- dentro de SECURITY DEFINER ele vira `postgres`).
create or replace function public.enforce_payroll_thirteenth_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_sub text := v_claims ->> 'sub';
begin
  if v_claims is null or v_claims ->> 'role' = 'service_role' then
    return coalesce(new, old);
  end if;
  if v_sub = '2626' then
    return coalesce(new, old);
  end if;
  if not coalesce(public.user_has_module_permission(v_sub, 'employees', 'editPayroll'), false) then
    raise exception 'Você não tem permissão para lançar 13º salário (employees.editPayroll)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.enforce_payroll_thirteenth_permission_check() from public, anon, authenticated;

drop trigger if exists payroll_thirteenth_permission_check on public.payroll_thirteenth;
create trigger payroll_thirteenth_permission_check
  before insert or update or delete on public.payroll_thirteenth
  for each row execute function public.enforce_payroll_thirteenth_permission_check();
