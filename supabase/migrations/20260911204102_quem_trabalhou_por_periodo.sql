-- ════════════════════════════════════════════════════════════════════════════
-- QUEM BATEU PONTO EM CADA PERÍODO — o "de quantos" do "25 pagos de 28"
--
-- ✅ APLICADA em 11/09/2026 (versão 20260911204102, a mesma do nome do arquivo).
--
-- Pedido do Victor: *"às vezes pode faltar pagar e vai ficar 25 pagos, 26
-- funcionários"* — ele quer ver na hora que alguém trabalhou e não recebeu.
--
-- ⚠️ O denominador é quem TRABALHOU, não o quadro da empresa. A diferença é
-- enorme e foi medida: Caratinga tem 92 funcionários, mas na semana 31/08–06/09
-- só 28 bateram ponto e 25 receberam. "25 de 92" seria barulho; "25 de 28"
-- aponta as 3 pessoas que podem estar sem pagamento. Diarista não trabalha toda
-- semana — por isso o quadro inteiro não serve.
--
-- POR QUE UMA FUNÇÃO, e não busca do frontend: o histórico já faz 2 chamadas por
-- período (46 períodos = 92); buscar a presença período a período viraria 138. E
-- buscar tudo de uma vez esbarra no corte de 1.000 linhas do Supabase — a
-- `attendance` de um ano passa muito disso. Aqui o banco agrupa e devolve uma
-- linha por período.
--
-- ⚠️ SEM `security definer` de propósito: a RLS de `attendance` e `employees`
-- continua valendo pra quem chama, como nas outras buscas da tela.
--
-- REVERSÃO: drop function public.quem_trabalhou_por_periodo(uuid);
-- ════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.quem_trabalhou_por_periodo(p_company_id uuid)
returns table (
  period_id uuid,
  trabalharam integer,
  trabalharam_diarista integer,
  trabalharam_clt integer
)
language sql
stable
as $$
  select
    per.id as period_id,
    count(distinct a.employee_id)::int as trabalharam,
    count(distinct a.employee_id) filter (where e.employment_type = 'Diarista')::int
      as trabalharam_diarista,
    count(distinct a.employee_id) filter (where e.employment_type = 'Carteira Assinada')::int
      as trabalharam_clt
  from public.payment_periods per
  left join public.attendance a
    on a.company_id = per.company_id
   and a.date between per.start_date and per.end_date
  left join public.employees e
    on e.id = a.employee_id
  where per.company_id = p_company_id
  group by per.id;
$$;

comment on function public.quem_trabalhou_por_periodo(uuid) is
  'Quantas pessoas bateram ponto em cada periodo de pagamento, por vinculo. '
  'E o denominador do "25 pagos de 28" das gavetas do Financeiro. Sem SECURITY '
  'DEFINER: a RLS de attendance/employees continua valendo pra quem chama.';

revoke all on function public.quem_trabalhou_por_periodo(uuid) from public;
grant execute on function public.quem_trabalhou_por_periodo(uuid) to authenticated;

commit;
