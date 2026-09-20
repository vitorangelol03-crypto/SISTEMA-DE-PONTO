-- 19/09/2026 — RESCISÃO (acerto de contas), leva 4 e última do que ficou da folha.
--
-- Decisões do Victor (19/09): os QUATRO motivos · o saldo do FGTS é DIGITADO (o sistema
-- não tem histórico de depósitos) · aviso de 30 dias + 3 por ano, teto 90 · e gerar o
-- acerto **só grava a data de saída**, sem sumir com a pessoa das telas.
--
-- Tudo ADITIVO. Duas colunas novas que nascem nulas e uma tabela nova que nasce vazia:
-- sem ninguém gerar uma rescisão, nada em produção muda.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A saída, na ficha
-- ─────────────────────────────────────────────────────────────────────────────
-- Decisão 4: a ficha passa a guardar QUANDO e POR QUE a pessoa saiu, e só isso. Esconder
-- o desligado das listas de ponto, financeiro e relatórios mexeria em todas as abas de
-- uma vez — é mudança larga demais para entrar de carona numa leva de cálculo.
alter table public.employees
  add column if not exists termination_date date,
  add column if not exists termination_reason text;

comment on column public.employees.termination_date is
  'Data de saída. Nula = pessoa ativa. Gravada ao registrar a rescisão (19/09/2026).';
comment on column public.employees.termination_reason is
  'sem-justa-causa · pedido-de-demissao · justa-causa · acordo.';

alter table public.employees
  drop constraint if exists employees_termination_reason_check;
alter table public.employees
  add constraint employees_termination_reason_check
  check (termination_reason is null or termination_reason in
    ('sem-justa-causa', 'pedido-de-demissao', 'justa-causa', 'acordo'));

-- Saída antes da admissão não existe.
alter table public.employees
  drop constraint if exists employees_termination_after_hire_check;
alter table public.employees
  add constraint employees_termination_after_hire_check
  check (termination_date is null or hire_date is null or termination_date >= hire_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O acerto gerado
-- ─────────────────────────────────────────────────────────────────────────────
-- Guardado inteiro, como o 13º e pelo mesmo motivo: é o que permite reimprimir o MESMO
-- termo daqui a um ano, com o salário e as tabelas que eram, e não com as de hoje. Numa
-- rescisão isso não é conforto — é o documento que vale num processo.
create table if not exists public.payroll_termination (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  data_de_saida date not null,
  motivo text not null,
  aviso text not null,
  dias_de_aviso integer not null default 0,
  anos_de_casa integer not null default 0,

  saldo_de_salario numeric(12,2) not null default 0,
  aviso_previo numeric(12,2) not null default 0,
  aviso_descontado numeric(12,2) not null default 0,
  decimo_proporcional numeric(12,2) not null default 0,
  ferias_vencidas numeric(12,2) not null default 0,
  terco_vencidas numeric(12,2) not null default 0,
  ferias_proporcionais numeric(12,2) not null default 0,
  terco_proporcionais numeric(12,2) not null default 0,
  -- O saldo que o Victor DIGITOU, junto com a multa que saiu dele: sem guardar os dois,
  -- ninguém consegue refazer a conta depois.
  saldo_fgts_informado numeric(12,2) not null default 0,
  multa_fgts numeric(12,2) not null default 0,
  inss numeric(12,2) not null default 0,
  irrf numeric(12,2) not null default 0,
  inss_decimo numeric(12,2) not null default 0,
  irrf_decimo numeric(12,2) not null default 0,
  total_proventos numeric(12,2) not null default 0,
  total_descontos numeric(12,2) not null default 0,
  liquido numeric(12,2) not null default 0,

  created_by text,
  created_at timestamptz not null default now(),

  constraint payroll_termination_motivo_check
    check (motivo in ('sem-justa-causa', 'pedido-de-demissao', 'justa-causa', 'acordo')),
  constraint payroll_termination_aviso_check
    check (aviso in ('trabalhado', 'indenizado', 'dispensado')),
  -- Uma rescisão por pessoa por data. Regerar é UPDATE, não uma segunda linha.
  constraint payroll_termination_unica
    unique (employee_id, data_de_saida)
);

comment on table public.payroll_termination is
  'Acerto de rescisão gerado (19/09/2026). Retrato da conta no dia — é o documento que vale depois.';

create index if not exists payroll_termination_employee_idx
  on public.payroll_termination (employee_id, data_de_saida);
create index if not exists payroll_termination_company_idx
  on public.payroll_termination (company_id, data_de_saida);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS + trava de permissão, iguais às outras tabelas da folha
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.payroll_termination enable row level security;

drop policy if exists rls_company_match_modify on public.payroll_termination;
create policy rls_company_match_modify on public.payroll_termination
  for all
  using (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  )
  with check (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  );

revoke all on public.payroll_termination from anon, authenticated;
grant select, insert, update, delete on public.payroll_termination to authenticated;

create or replace function public.enforce_payroll_termination_permission_check()
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
    raise exception 'Você não tem permissão para lançar rescisão (employees.editPayroll)'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.enforce_payroll_termination_permission_check() from public, anon, authenticated;

drop trigger if exists payroll_termination_permission_check on public.payroll_termination;
create trigger payroll_termination_permission_check
  before insert or update or delete on public.payroll_termination
  for each row execute function public.enforce_payroll_termination_permission_check();
