-- 19/09/2026 — PREMIAÇÃO (prêmio, PLR, bonificação) na folha de carteira assinada.
--
-- Decisões do Victor: *"tem que ser premiação para sair como bônus e não gera imposto"*,
-- NÃO entra na base do FGTS nem do INSS, e é lançada na tela do Financeiro do mês.
--
-- Não é invenção: é o que a contabilidade dele já faz. No recibo real do Maycon
-- (salário 2.200 + noturno 115,78) a base do FGTS é 2.315,78 — a PLR ficou de fora.
--
-- Tudo ADITIVO: tabela nova, nasce vazia. Sem lançamento, nenhum recibo muda.

create table if not exists public.payroll_awards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- A data manda em QUAL recibo a premiação aparece: a do mês que contém esta data.
  -- Mesma ideia das férias, que também entram pelo período.
  data date not null,
  valor numeric(12,2) not null,
  -- O motivo sai impresso no recibo ("Premiação — Meta de agosto"): é o que faz o
  -- funcionário entender de onde veio o dinheiro, em vez de ver um valor solto.
  descricao text,
  created_by text,
  created_at timestamptz not null default now(),

  constraint payroll_awards_valor_check check (valor > 0)
);

comment on table public.payroll_awards is
  'Premiação/PLR por pessoa e data (19/09/2026). Sai como bônus: entra no líquido e em NENHUMA base — nem FGTS, nem INSS, nem IRRF.';
comment on column public.payroll_awards.data is
  'Define em qual recibo aparece: o do mês que contém esta data.';

create index if not exists payroll_awards_employee_idx
  on public.payroll_awards (employee_id, data);
create index if not exists payroll_awards_company_idx
  on public.payroll_awards (company_id, data);

alter table public.payroll_awards enable row level security;

drop policy if exists rls_company_match_modify on public.payroll_awards;
create policy rls_company_match_modify on public.payroll_awards
  for all
  using (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  )
  with check (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  );

revoke all on public.payroll_awards from anon, authenticated;
grant select, insert, update, delete on public.payroll_awards to authenticated;

-- Lançar premiação é mexer em dinheiro da folha: mesma permissão das férias e do 13º,
-- travada no BANCO e não só na tela. O chamador sai do JWT, nunca de `current_user`
-- (lição de 08/09: dentro de SECURITY DEFINER ele vira `postgres`).
create or replace function public.enforce_payroll_awards_permission_check()
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
    raise exception 'Você não tem permissão para lançar premiação (employees.editPayroll)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.enforce_payroll_awards_permission_check() from public, anon, authenticated;

drop trigger if exists payroll_awards_permission_check on public.payroll_awards;
create trigger payroll_awards_permission_check
  before insert or update or delete on public.payroll_awards
  for each row execute function public.enforce_payroll_awards_permission_check();
