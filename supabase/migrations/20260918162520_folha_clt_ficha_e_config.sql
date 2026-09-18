-- 18/09/2026 — FOLHA DE CARTEIRA ASSINADA, Etapa 3 do PLANO_FINANCEIRO_2026-09.md.
-- Decisões do Victor (18/09): espelho antes do vale · adicional noturno só pra CLT ·
-- salário família pela QUANTIDADE de filhos digitada · entram os 21 "Carteira Assinada".
--
-- Tudo ADITIVO: nenhuma coluna existente muda, nenhum valor gravado é tocado. Quem é
-- diarista continua sendo pago por `payments` exatamente como antes.
--
-- As colunas nascem nulas/zeradas: sem ninguém preencher, a folha não inventa valor
-- (o cálculo devolve 0 e o recibo sai sem a linha).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A ficha de folha, na tabela que já existe
-- ─────────────────────────────────────────────────────────────────────────────
-- `employees` tem GRANT de tabela inteira (não por coluna) pro anon e pro
-- authenticated, conferido antes de escrever isto: as colunas novas já entram no
-- grant sozinhas. Sem isso, o PostgREST devolveria 403 em qualquer leitura que as
-- pedisse — foi exatamente o que quebrou a distribuição de triagem em 03/09.
alter table public.employees
  add column if not exists monthly_salary numeric(12,2),
  add column if not exists family_allowance_children integer not null default 0,
  add column if not exists ctps_number text,
  add column if not exists ctps_series text,
  add column if not exists cbo text,
  add column if not exists fgts_enabled boolean not null default false;

comment on column public.employees.monthly_salary is
  'Salário do contrato, cheio. Só carteira assinada usa. Nulo = ninguém preencheu ainda.';
comment on column public.employees.family_allowance_children is
  'Quantos filhos dão direito à cota do salário família (digitado — decisão do Victor de 18/09, em vez de guardar data de nascimento).';
comment on column public.employees.fgts_enabled is
  'FGTS é ligado POR PESSOA. É custo da empresa: entra no recibo como informação e não abate o líquido.';

-- Restrição de sanidade: número de filhos não é negativo nem absurdo.
alter table public.employees
  drop constraint if exists employees_family_allowance_children_check;
alter table public.employees
  add constraint employees_family_allowance_children_check
  check (family_allowance_children >= 0 and family_allowance_children <= 20);

-- Salário negativo não existe; nulo continua permitido (é o "não preenchido").
alter table public.employees
  drop constraint if exists employees_monthly_salary_check;
alter table public.employees
  add constraint employees_monthly_salary_check
  check (monthly_salary is null or monthly_salary >= 0);

-- Decisão 4 do Victor: quem entra nesta primeira folha são os marcados "Carteira
-- Assinada" no campo OPERACIONAL (`employment_type` — o que manda, conforme a
-- correção de 11/09; `contract_type` é só cadastro e discorda em 21 pessoas).
-- Ligar o FGTS não muda nada sozinho: sem salário preenchido, a base é zero.
update public.employees
   set fgts_enabled = true
 where employment_type = 'Carteira Assinada'
   and fgts_enabled = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A configuração da folha, por empresa e por ANO de vigência
-- ─────────────────────────────────────────────────────────────────────────────
-- Por que por ano: cota e teto do salário família mudam por lei todo ano. Sem o ano,
-- recalcular um mês antigo sairia com o valor de hoje e o papel deixaria de bater com
-- o que a pessoa recebeu. O ano aparece na tela junto dos valores.
create table if not exists public.payroll_config (
  company_id uuid not null references public.companies(id) on delete cascade,
  ano integer not null,
  fgts_percent numeric(6,3) not null default 8,
  family_allowance_quota numeric(12,2) not null default 0,
  family_allowance_ceiling numeric(12,2) not null default 0,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (company_id, ano),
  constraint payroll_config_ano_check check (ano between 2000 and 2100),
  constraint payroll_config_fgts_check check (fgts_percent >= 0 and fgts_percent <= 100),
  constraint payroll_config_quota_check check (family_allowance_quota >= 0),
  constraint payroll_config_ceiling_check check (family_allowance_ceiling >= 0)
);

alter table public.payroll_config enable row level security;

create policy rls_company_match_modify on public.payroll_config
  for all
  using (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  )
  with check (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  );

-- Anônimo não tem nada a fazer aqui; logado lê e grava, não apaga (mesmo desenho do
-- `triage_config` de 15/09).
revoke all on public.payroll_config from anon, authenticated;
grant select, insert, update on public.payroll_config to authenticated;

-- Mexer em % de FGTS, cota e teto é mexer em dinheiro: exige `settings.editDailyRate`,
-- a mesma permissão que já guarda o valor da diária. Travado no banco, não só na tela.
-- O chamador sai do JWT, nunca de `current_user` (lição de 08/09: dentro de SECURITY
-- DEFINER o `current_user` vira postgres). Sem claims (migration/SQL direto) ou
-- service_role passa; 2626 passa (não tem linha em user_permissions, usa o bypass).
create or replace function public.enforce_payroll_config_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_sub text := v_claims ->> 'sub';
begin
  if v_claims is null or v_claims ->> 'role' = 'service_role' then
    return new;
  end if;
  if v_sub = '2626' then
    return new;
  end if;
  if not coalesce(public.user_has_module_permission(v_sub, 'settings', 'editDailyRate'), false) then
    raise exception 'Você não tem permissão para mudar a configuração da folha (settings.editDailyRate)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_payroll_config_permission_check() from public, anon, authenticated;

drop trigger if exists payroll_config_permission_check on public.payroll_config;
create trigger payroll_config_permission_check
  before insert or update on public.payroll_config
  for each row execute function public.enforce_payroll_config_permission_check();

-- Valores de 2026 conferidos no recibo real de Julho/2026 da contabilidade Arruda:
-- cota de R$ 67,54 por filho (Camila e Edilaine) e FGTS de 8%. O teto é o da tabela
-- do INSS de 2026 e NÃO aparece no recibo — ninguém dos 12 esbarra nele.
insert into public.payroll_config (company_id, ano, fgts_percent, family_allowance_quota, family_allowance_ceiling, updated_by)
select c.id, 2026, 8, 67.54, 1906.04, 'migration 18/09 (valores do recibo de Julho/2026)'
from public.companies c
on conflict (company_id, ano) do nothing;
