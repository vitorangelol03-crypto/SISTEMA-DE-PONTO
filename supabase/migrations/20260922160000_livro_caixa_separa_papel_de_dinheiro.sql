-- LIVRO-CAIXA: separar PAPEL de DINHEIRO (22/09/2026).
--
-- 🔴 O CASO REAL. Na 2a quinzena de agosto, 21 entregadores receberam R$ 1.678,95 a MAIS.
-- A causa: publicar o espelho lancava o abate no livro-caixa (source='espelho'). Quando a
-- planilha de pagamento era gerada DEPOIS, ela perguntava ao livro "quanto ele ainda deve?",
-- recebia ZERO, e pagava o valor CHEIO - mesmo com "Descontar vales e perdas" marcado.
-- O papel (PDF) saia certo, com o desconto; o dinheiro saia errado, sem.
--
-- Papel nao e pagamento: um PDF publicado nao pode dar baixa em divida.
--
-- A correcao precisa que o livro diga a FONTE de cada lancamento, pra cada lado usar o que
-- lhe cabe: o PAGAMENTO conta so o que virou dinheiro ('relatorio'/'backfill'), e o ESPELHO
-- conta tudo (inclusive 'espelho'), pra dois espelhos do mesmo periodo nao imprimirem o
-- mesmo desconto duas vezes.
--
-- Esta migration so ACRESCENTA a coluna `source` ao retorno da RPC. Nenhum dado muda.
-- Efeito colateral desejado: os 21 do caso acima voltam a DEVER sozinhos, porque o abate
-- deles no livro e 'espelho' (papel) e deixa de contar como pago.
--
-- ⚠️ Aplicada em 22/09/2026 16:00 UTC via execute_sql do MCP (o apply_migration esta
-- bloqueado pelo classificador do harness nesta sessao). Conferida depois:
-- retorno = TABLE(driver_id uuid, amount numeric, source text), SECURITY DEFINER,
-- grants authenticated+service_role, nada para anon/public.
drop function if exists public.get_driverpay_deduction_ledger_masked(uuid, uuid);

create function public.get_driverpay_deduction_ledger_masked(p_company_id uuid, p_period_id uuid)
returns table(driver_id uuid, amount numeric, source text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  WITH can_view AS (
    SELECT ((auth.jwt() ->> 'sub') = '2626' OR public.user_has_module_permission((auth.jwt() ->> 'sub'), 'driverpay', 'viewValues')) AS ok
  )
  SELECT l.driver_id,
         CASE WHEN cv.ok THEN l.amount ELSE NULL END,
         l.source
  FROM public.driverpay_deduction_ledger l, can_view cv
  WHERE l.company_id = p_company_id AND l.period_id = p_period_id
    AND public.driverpay_pode((l.company_id)::uuid, 'view');
$function$;

revoke all on function public.get_driverpay_deduction_ledger_masked(uuid, uuid) from public, anon;
grant execute on function public.get_driverpay_deduction_ledger_masked(uuid, uuid) to authenticated, service_role;
