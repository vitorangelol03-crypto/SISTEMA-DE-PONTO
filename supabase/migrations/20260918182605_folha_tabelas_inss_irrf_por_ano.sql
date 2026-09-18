-- 18/09/2026 — TABELAS DE INSS E IRRF, por ano, com marca de "conferida".
--
-- Decisões do Victor: (1) a tela nasce pronta e semeada, ele corrige com o contador;
-- (2) no IRRF vale o caminho que der MENOS imposto; (3) enquanto a tabela do ano não
-- estiver confirmada, o recibo sai com aviso de "valores em conferência".
--
-- São tabelas FEDERAIS: valem para as duas empresas, por isso não têm company_id.
-- Aplicada em produção pelo MCP e provada por simulação que se desfaz (ver o checkpoint
-- de 18/09, LEVA 4).

create table if not exists public.payroll_tax_tables (
  ano integer not null,
  tipo text not null check (tipo in ('inss', 'irrf')),
  -- [{ "ate": 1621.30, "aliquota": 7.5 }, ...] — "ate" nulo = última faixa, sem teto.
  faixas jsonb not null,
  teto numeric(12,2) not null default 0,
  deducao_dependente numeric(12,2) not null default 0,
  desconto_simplificado numeric(12,2) not null default 0,
  -- Nasce FALSO de propósito: o recibo avisa "em conferência" até alguém confirmar.
  confirmado boolean not null default false,
  confirmado_por text,
  confirmado_em timestamptz,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (ano, tipo),
  constraint payroll_tax_tables_ano_check check (ano between 2000 and 2100),
  constraint payroll_tax_tables_faixas_check check (jsonb_typeof(faixas) = 'array' and jsonb_array_length(faixas) > 0)
);

alter table public.payroll_tax_tables enable row level security;

-- Tabela do governo: quem está logado lê (as duas empresas usam a mesma).
drop policy if exists payroll_tax_tables_leitura on public.payroll_tax_tables;
create policy payroll_tax_tables_leitura on public.payroll_tax_tables
  for select using (true);

drop policy if exists payroll_tax_tables_escrita on public.payroll_tax_tables;
create policy payroll_tax_tables_escrita on public.payroll_tax_tables
  for all using (true) with check (true);

revoke all on public.payroll_tax_tables from anon, authenticated;
grant select, insert, update on public.payroll_tax_tables to authenticated;

-- Mexer em faixa de imposto é mexer no dinheiro de todo mundo: exige a mesma permissão
-- do valor da diária. O chamador sai do JWT, nunca de current_user (lição de 08/09).
create or replace function public.enforce_payroll_tax_tables_permission_check()
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
    raise exception 'Você não tem permissão para mudar as tabelas de INSS e IR (settings.editDailyRate)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_payroll_tax_tables_permission_check() from public, anon, authenticated;

drop trigger if exists payroll_tax_tables_permission_check on public.payroll_tax_tables;
create trigger payroll_tax_tables_permission_check
  before insert or update on public.payroll_tax_tables
  for each row execute function public.enforce_payroll_tax_tables_permission_check();

-- ─────────────────────────────────────────────────────────────────────────────
-- Semente de 2026 — NÃO CONFIRMADA
-- ─────────────────────────────────────────────────────────────────────────────
-- INSS: a 1ª e a 2ª faixa saem do recibo real da contabilidade e reproduzem 11 de 11
-- recibos de Julho/2026 (derivadas resolvendo a conta ao contrário, não copiadas de
-- tabela). As de 12% e 14% e o teto NÃO são provados por nada — ninguém do gabarito
-- chega lá. IRRF: nada é provado, porque nenhum dos 12 pagou imposto de renda.
insert into public.payroll_tax_tables (ano, tipo, faixas, teto, updated_by)
values (
  2026, 'inss',
  '[{"ate": 1621.30, "aliquota": 7.5}, {"ate": 3041.65, "aliquota": 9}, {"ate": 4562.47, "aliquota": 12}, {"ate": 9124.94, "aliquota": 14}]'::jsonb,
  9124.94,
  'migration 18/09 — 1a e 2a faixa provadas no recibo; o resto a confirmar'
)
on conflict (ano, tipo) do nothing;

insert into public.payroll_tax_tables (ano, tipo, faixas, deducao_dependente, desconto_simplificado, updated_by)
values (
  2026, 'irrf',
  '[{"ate": 2428.80, "aliquota": 0}, {"ate": 2826.65, "aliquota": 7.5}, {"ate": 3751.05, "aliquota": 15}, {"ate": 4664.68, "aliquota": 22.5}, {"ate": null, "aliquota": 27.5}]'::jsonb,
  189.59, 607.20,
  'migration 18/09 — NADA disto é provado pelo gabarito; a confirmar com o contador'
)
on conflict (ano, tipo) do nothing;
