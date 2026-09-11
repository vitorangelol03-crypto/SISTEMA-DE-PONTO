-- ════════════════════════════════════════════════════════════════════════════
-- O PAGAMENTO PASSA A CARIMBAR O VÍNCULO DO DIA EM QUE FOI FEITO
--
-- Decisão do Victor, 10/09/2026:
--   "Começa como diarista, futuramente muda pra CLT — o sistema não exclui o
--    histórico dele. Mantém o histórico de diarista, e os próximos como
--    carteira assinada."
--
-- O PROBLEMA (medido em 10/09/2026): o vínculo vivia SÓ na ficha e `payments`
-- não tinha coluna nenhuma. Trocar a ficha de uma pessoa reescrevia o passado
-- dela — os pagamentos de julho e agosto passavam a contar no vínculo novo sem
-- ninguém ter tocado neles, e o "38 pagos (32 diaristas · 6 CLT)" das gavetas
-- antigas mudava sozinho.
--
-- A SOLUÇÃO: o pagamento guarda o vínculo como CARIMBO, não como espelho da
-- ficha. Mesmo padrão que o driverpay já usa há meses
-- (`driverpay_payments.driver_name_snapshot`, `rate_snapshot`).
--
-- ⚠️ QUAL DOS DOIS CAMPOS DE VÍNCULO (achado em 11/09/2026): a ficha tem DOIS,
-- e eles discordam em 21 pessoas. Carimbamos o `employment_type`
-- ('Diarista' / 'Carteira Assinada') porque é o OPERACIONAL: é por ele que
-- `getAllEmployees` e `getPayments` filtram (database.ts:608 e :634) e é ele que
-- alimenta o filtro "Tipo de Vínculo" da tela. O `contract_type`
-- ('CLT' / 'Diarista') é campo de cadastro — não filtra nada.
--
-- ADITIVA E REVERSÍVEL: só acrescenta coluna e preenche o histórico; nada é
-- apagado nem tem valor alterado. Pra desfazer, basta
-- `alter table public.payments drop column employment_type_snapshot;` e
-- recriar a RPC sem a coluna.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.payments
  add column if not exists employment_type_snapshot text;

comment on column public.payments.employment_type_snapshot is
  'Vínculo (Diarista / Carteira Assinada) do dia em que ESTE pagamento foi feito. '
  'Carimbo, não espelho da ficha: mudar employees.employment_type NÃO mexe aqui, e '
  'é isso que mantém inteiro o histórico de quem muda de diarista para carteira '
  'assinada. Decisão do Victor, 10/09/2026.';

-- O que já está gravado recebe o vínculo ATUAL da ficha — a melhor verdade
-- disponível pro passado. Daí em diante nunca mais muda sozinho.
update public.payments p
   set employment_type_snapshot = e.employment_type
  from public.employees e
 where e.id = p.employee_id
   and p.employment_type_snapshot is null;

-- Quem ficou sem (ficha sem vínculo) entra como Diarista: é o vínculo da
-- esmagadora maioria e o padrão que o Victor confirmou em 10/09/2026.
update public.payments
   set employment_type_snapshot = 'Diarista'
 where employment_type_snapshot is null;

alter table public.payments alter column employment_type_snapshot set default 'Diarista';

-- Filtrar por vínculo dentro de um período é a consulta central das gavetas.
create index if not exists payments_company_date_vinculo_idx
  on public.payments (company_id, date, employment_type_snapshot);

-- ────────────────────────────────────────────────────────────────────────────
-- A RPC PRECISA DEVOLVER A COLUNA NOVA
--
-- `getPayments` não lê a tabela: vai por `get_payments_masked`, que declara as
-- colunas uma a uma no RETURNS TABLE. Sem mexer aqui, a coluna existiria no
-- banco e NUNCA chegaria na tela — o carimbo seria inútil.
--
-- Reescrita byte a byte igual à que está em produção, com DUAS mudanças: a
-- coluna nova no RETURNS TABLE e no SELECT. O vínculo NÃO é mascarado: não é
-- valor em R$, e quem não pode ver dinheiro ainda precisa saber quem é diarista.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_payments_masked(
  p_company_id uuid,
  p_start_date date default null::date,
  p_end_date date default null::date,
  p_employee_id uuid default null::uuid
)
returns table(
  id uuid, employee_id uuid, date date, created_by text,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  company_id uuid, bank_hours_minutes integer,
  bank_hours_applied_at timestamp with time zone,
  daily_rate numeric, bonus numeric, total numeric,
  bonus_b numeric, bonus_c1 numeric, bonus_c2 numeric,
  bonus_breakdown jsonb, bank_hours_amount numeric,
  employment_type_snapshot text,
  employees jsonb
)
language sql
stable security definer
set search_path to 'public'
as $function$
  SELECT
    p.id, p.employee_id, p.date, p.created_by, p.created_at, p.updated_at, p.company_id,
    p.bank_hours_minutes, p.bank_hours_applied_at,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.daily_rate ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.total ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_b ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_c1 ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_c2 ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bonus_breakdown ELSE NULL END,
    CASE WHEN (auth.jwt() ->> 'sub') = '2626'
           OR (public.user_has_module_permission((auth.jwt() ->> 'sub'), 'financial', 'viewPayments')
               AND public.user_has_module_permission((auth.jwt() ->> 'sub'), 'c6payment', 'viewValues'))
         THEN p.bank_hours_amount ELSE NULL END,
    p.employment_type_snapshot,
    jsonb_build_object('id', e.id, 'name', e.name, 'cpf', e.cpf, 'employment_type', e.employment_type)
  FROM public.payments p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.company_id = p_company_id
    AND ((p.company_id::text = COALESCE((auth.jwt() ->> 'company_id'), '')) OR ((auth.jwt() ->> 'sub') = ANY (ARRAY['9999','2626'])))
    AND (p_start_date IS NULL OR p.date >= p_start_date)
    AND (p_end_date IS NULL OR p.date <= p_end_date)
    AND (p_employee_id IS NULL OR p.employee_id = p_employee_id);
$function$;
