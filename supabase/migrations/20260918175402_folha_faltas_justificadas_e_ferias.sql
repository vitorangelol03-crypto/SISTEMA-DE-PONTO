-- 18/09/2026 — FALTA JUSTIFICADA E FÉRIAS na folha de carteira assinada.
--
-- Decisões do Victor: quer os DOIS tipos de falta e a regra do DSR como chave
-- configurável (nasce desligada); e SIM ao 1/3 de férias.
--
-- Tudo aditivo: nada existente muda de valor. Aplicada em produção pelo MCP e provada
-- por simulação que se desfaz (ver o checkpoint de 18/09, LEVA 3).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A falta ganha "tem atestado?"
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem mexer no `status`, que meia dúzia de telas conferem como 'present'/'absent' —
-- inventar um status novo quebraria contagem de presença, espelho e relatórios de uma
-- vez. Falso = injustificada, que é exatamente o que já existe hoje.
alter table public.attendance
  add column if not exists absence_justified boolean not null default false,
  add column if not exists absence_note text;

comment on column public.attendance.absence_justified is
  'Falta com atestado/justificada: NÃO desconta na folha. Padrão false = como sempre foi.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Férias: período por funcionário
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.employee_vacations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint employee_vacations_periodo_check check (end_date >= start_date)
);

create index if not exists employee_vacations_employee_idx
  on public.employee_vacations (employee_id, start_date);
create index if not exists employee_vacations_company_idx
  on public.employee_vacations (company_id, start_date);

alter table public.employee_vacations enable row level security;

drop policy if exists rls_company_match_modify on public.employee_vacations;
create policy rls_company_match_modify on public.employee_vacations
  for all
  using (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  )
  with check (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  );

revoke all on public.employee_vacations from anon, authenticated;
grant select, insert, update, delete on public.employee_vacations to authenticated;

-- Lançar férias mexe no salário do mês: exige a mesma permissão que edita folha na
-- ficha (`employees.editPayroll`), travado no banco e não só na tela. O chamador sai do
-- JWT, nunca de `current_user` (lição de 08/09: dentro de SECURITY DEFINER vira postgres).
create or replace function public.enforce_employee_vacations_permission_check()
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
    raise exception 'Você não tem permissão para lançar férias (employees.editPayroll)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.enforce_employee_vacations_permission_check() from public, anon, authenticated;

drop trigger if exists employee_vacations_permission_check on public.employee_vacations;
create trigger employee_vacations_permission_check
  before insert or update or delete on public.employee_vacations
  for each row execute function public.enforce_employee_vacations_permission_check();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A chave do DSR, junto do resto da folha (por empresa e por ano)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.payroll_config
  add column if not exists dsr_on_unjustified_absence boolean not null default false;

comment on column public.payroll_config.dsr_on_unjustified_absence is
  'Falta injustificada derruba TAMBÉM o descanso da semana (na prática 2 dias). Nasce desligada.';
