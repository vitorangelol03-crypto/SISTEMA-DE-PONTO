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
-- ⚠️ QUAL DOS DOIS CAMPOS (achado em 11/09/2026): a ficha tem DOIS e eles
-- discordam em 21 pessoas. Carimbamos `employment_type` ('Diarista' /
-- 'Carteira Assinada'), o OPERACIONAL — é por ele que `getAllEmployees` e
-- `getPayments` filtram (database.ts:608, :634) e é ele no filtro "Tipo de
-- Vínculo". O `contract_type` ('CLT'/'Diarista') é cadastro e não filtra nada.
--
-- 🔴 DUAS CORREÇÕES DE UMA REVISÃO ADVERSARIAL, ANTES DE APLICAR (11/09/2026):
--
--  1. `CREATE OR REPLACE` **não aceita** acrescentar coluna ao RETURNS TABLE —
--     o Postgres recusa com "cannot change return type of existing function".
--     A migration falharia SEMPRE. Por isso o DROP explícito abaixo — e, com
--     ele, os GRANTs precisam voltar: o DROP leva a ACL embora e a função nova
--     nasceria com EXECUTE pro PUBLIC, contra a regra da casa (31/08/2026).
--
--  2. O `default 'Diarista'` sozinho **estragaria o futuro**: os dois únicos
--     caminhos de INSERT (`upsert_payment_rate_masked` e
--     `upsert_payment_bonus_masked`) não preenchem a coluna, então todo
--     pagamento novo — inclusive de carteira assinada — nasceria carimbado
--     "Diarista", calado. Arrumaria o passado e quebraria o amanhã. Trocado por
--     um TRIGGER que lê a ficha no momento do INSERT; o default some.
--
-- TUDO EM UMA TRANSAÇÃO: se qualquer passo falhar, nada fica pela metade — e
-- ninguém pega a RPC inexistente no meio do caminho.
--
-- REVERSÃO (tem ORDEM obrigatória, não basta dropar a coluna: a RPC referencia
-- ela, e dropar sozinho derruba a aba Financeira inteira):
--   1. recriar `get_payments_masked` sem a coluna (DROP + CREATE + os 3 grants);
--   2. `drop trigger payments_carimba_vinculo_trg on public.payments;`
--   3. `drop function public.payments_carimba_vinculo();`
--   4. `alter table public.payments drop column employment_type_snapshot;`
--   ⚠️ o dado do carimbo se perde pra sempre: depois que alguém trocar de
--   vínculo na ficha, não há como reconstruir o que era antes.
-- ✅ APLICADA EM 11/09/2026 (versão 20260911045400, a mesma do nome do arquivo).
--    Provado depois de aplicar: 3.605 pagamentos carimbados, 0 sem vínculo
--    (1.577 Diarista + 2.028 Carteira Assinada); o trigger testado com INSERT que
--    se desfaz sozinho — ficha CLT carimbou "Carteira Assinada", ficha Diarista
--    carimbou "Diarista", e valor passado de propósito NÃO foi sobrescrito; a ACL
--    da RPC voltou idêntica ({postgres, authenticated, service_role}).
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.payments
  add column if not exists employment_type_snapshot text;

comment on column public.payments.employment_type_snapshot is
  'Vinculo (Diarista / Carteira Assinada) do dia em que ESTE pagamento foi feito. '
  'Carimbo, nao espelho da ficha: mudar employees.employment_type NAO mexe aqui, e '
  'e isso que mantem inteiro o historico de quem muda de vinculo. Preenchido pelo '
  'trigger payments_carimba_vinculo_trg. Decisao do Victor, 10/09/2026.';

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

-- ────────────────────────────────────────────────────────────────────────────
-- O CARIMBO DE TODO PAGAMENTO NOVO
--
-- Trigger em vez de default, e em vez de mexer nos dois upserts: o default
-- carimbaria "Diarista" em todo mundo (nem os upserts nem o REST passam a
-- coluna), e alterar as funções de upsert é risco maior do que vale — elas
-- são o caminho de gravação de dinheiro. O trigger lê a ficha na hora, que é
-- exatamente a definição de "o vínculo do dia em que o pagamento foi feito".
--
-- Respeita valor passado explicitamente (só preenche quando vem NULL), então
-- uma importação que já saiba o vínculo continua mandando no que gravou.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.payments_carimba_vinculo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.employment_type_snapshot is null then
    select e.employment_type
      into new.employment_type_snapshot
      from public.employees e
     where e.id = new.employee_id;

    if new.employment_type_snapshot is null then
      new.employment_type_snapshot := 'Diarista';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.payments_carimba_vinculo() is
  'Carimba employment_type_snapshot no INSERT, lendo a ficha naquele momento. '
  'Sem ele, pagamento novo nasceria sem vinculo (os upserts nao passam a coluna).';

drop trigger if exists payments_carimba_vinculo_trg on public.payments;
create trigger payments_carimba_vinculo_trg
  before insert on public.payments
  for each row
  execute function public.payments_carimba_vinculo();

-- ────────────────────────────────────────────────────────────────────────────
-- A RPC PRECISA DEVOLVER A COLUNA NOVA
--
-- `getPayments` não lê a tabela: vai por `get_payments_masked`, que declara as
-- colunas uma a uma no RETURNS TABLE. Sem mexer aqui, a coluna existiria no
-- banco e NUNCA chegaria na tela.
--
-- Byte a byte igual à de produção (20260903201150), com UMA mudança: a coluna
-- nova na penúltima posição, no RETURNS e no SELECT, na mesma ordem. O vínculo
-- NÃO é mascarado: não é valor em R$, e a função já devolve
-- `employees.employment_type` sem máscara no jsonb — seria incoerente esconder.
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_payments_masked(uuid, date, date, uuid);

create function public.get_payments_masked(
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

-- O DROP acima levou a ACL junto: sem estas linhas a função nasceria aberta pro
-- PUBLIC. São as de 20260903201150_get_payments_masked_security_definer_test.sql
-- MAIS o `service_role`, conferido na ACL de produção em 11/09/2026:
--   {postgres=X, authenticated=X, service_role=X}
-- O service_role viria de graça pelo default privilege do schema public, mas
-- depender de default silencioso pra não derrubar o backend é frágil — aqui é
-- explícito, e o resultado bate byte a byte com o que existe hoje.
grant execute on function public.get_payments_masked(uuid, date, date, uuid) to authenticated;
grant execute on function public.get_payments_masked(uuid, date, date, uuid) to service_role;
revoke all on function public.get_payments_masked(uuid, date, date, uuid) from public;
revoke all on function public.get_payments_masked(uuid, date, date, uuid) from anon;

-- A tabela teve o SELECT revogado e recebe grant por LISTA de colunas
-- (20260903204857 e 20260903220447). Conferido em 11/09/2026: o `authenticated`
-- tem SELECT em 9 colunas (as não-dinheiro) e NENHUMA das de R$ — o dinheiro só
-- sai pela RPC mascarada. `postgres`/`service_role`/`anon` têm SELECT no nível
-- da TABELA, então já alcançam a coluna nova sozinhos; só o `authenticated`
-- precisa ser nomeado. O vínculo não é dinheiro: entra na lista das liberadas.
grant select (employment_type_snapshot) on public.payments to authenticated;

commit;

-- 📌 NÃO foi criado índice em `employment_type_snapshot`: a RPC filtra por
-- company_id + date e NUNCA por vínculo (o filtro de tipo é feito em JS). Um
-- índice que ninguém usa é peso morto — criar quando (e se) o filtro descer
-- pro banco.
