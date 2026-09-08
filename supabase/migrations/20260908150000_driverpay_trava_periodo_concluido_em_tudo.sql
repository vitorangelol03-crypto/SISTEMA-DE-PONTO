-- ═══════════════════════════════════════════════════════════════════════════════
-- Pedido do Victor (08/09/2026): "coloque a trava em tudo".
--
-- SITUAÇÃO ANTES (conferida no banco, não deduzida): o trigger
-- `driverpay_enforce_period_locked` existia em apenas 5 tabelas — driverpay_payments,
-- _payment_packages, _discounts, _vales e _zapex. Ou seja, a quinzena concluída protegia
-- só o DINHEIRO. Espelhos, notas fiscais, marcas de pago, pedidos de print, prints do
-- entregador e o razão de descontos parcelados ficavam livres pra edição mesmo com a
-- quinzena fechada.
--
-- ESCOPO: as 6 tabelas do driverpay que pertencem a uma quinzena e ainda não tinham trava:
--   driverpay_nota_fiscal_files, driverpay_mirror_publications, driverpay_payment_marks,
--   driverpay_proof_requests, driverpay_deduction_ledger, driverpay_delivery_proofs.
-- As outras 14 tabelas driverpay_* NÃO entram porque não pertencem a quinzena nenhuma
-- (cadastro de entregador, grupos, plataformas, tarifas, apelidos, configurações...) —
-- trava de período ali não teria o que checar.
--
-- IMPACTO MEDIDO ANTES DE APLICAR (quantas ações reais foram feitas DEPOIS do período ser
-- concluído — é exatamente o que a trava passaria a barrar):
--   marcar pago .................. 552 registros, 0 depois de fechar
--   publicar espelho ............. 182 registros, 0 depois de fechar
--   pedir print .................... 6 registros, 0 depois de fechar
--   desconto parcelado ............ 60 registros, 0 depois de fechar
--   print do entregador .......... 277 registros, 0 depois de fechar
--   enviar nota fiscal ........... 256 registros, 5 depois de fechar (3 ENTREGADORES)
-- As 5 notas foram enviadas por entregadores pelo app, que passa por service_role — e a
-- função devolve cedo pra service_role. Então nada do fluxo real é quebrado.
--
-- ⚠️ O QUE ESTA MIGRATION **NÃO** RESOLVE: o risco das notas fiscais órfãs vive na quinzena
-- ABERTA (hoje a 1ª de agosto), onde despublicar/republicar espelho é operação normal e
-- permitida. Trava de período CONCLUÍDO não age em período aberto. Aquele conserto é outro
-- (`slotCoberto` voltar a casar pelo CNPJ quando o espelho da chave não existe mais).
--
-- Mantidos de propósito os 2 bypasses que já existiam: service_role/postgres (senão o app
-- do entregador e os backups quebram) e o mestre 2626 (líder único e fixo).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1) A função passa a descobrir o período de forma genérica ──────────────────
-- Antes ela era hardcoded: "se a tabela é driverpay_payments usa period_id, SENÃO busca
-- pelo payment_id". Isso só funcionava nas 5 tabelas originais. Agora ela olha as colunas
-- que a linha realmente tem: usa period_id quando existir, senão cai pro payment_id.
-- Comportamento das 5 tabelas antigas fica IDÊNTICO (payments tem period_id; packages,
-- discounts, vales e zapex não têm period_id e têm payment_id).
create or replace function public.driverpay_enforce_period_locked()
returns trigger
language plpgsql
set search_path to ''
as $function$
DECLARE
  v_row record;
  v_json jsonb;
  v_period_id uuid;
  v_status text;
  v_sub text;
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') THEN RETURN COALESCE(NEW, OLD); END IF;
  v_sub := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  IF v_sub = '2626' THEN RETURN COALESCE(NEW, OLD); END IF;

  v_row  := COALESCE(NEW, OLD);
  v_json := to_jsonb(v_row);

  IF (v_json ? 'period_id') AND (v_json ->> 'period_id') IS NOT NULL THEN
    v_period_id := (v_json ->> 'period_id')::uuid;
  ELSIF (v_json ? 'payment_id') AND (v_json ->> 'payment_id') IS NOT NULL THEN
    SELECT p.period_id INTO v_period_id
      FROM public.driverpay_payments p
     WHERE p.id = (v_json ->> 'payment_id')::uuid;
  END IF;

  -- Sem como saber a qual quinzena a linha pertence, não bloqueia (não inventa trava).
  IF v_period_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT status INTO v_status FROM public.driverpay_periods WHERE id = v_period_id;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'Periodo de pagamento driver concluido e imutavel (somente mestre 2626 ou backend)';
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $function$;

-- ── 2) Instala o trigger nas 6 tabelas que faltavam ────────────────────────────
do $do$
declare
  t text;
  alvos text[] := array[
    'driverpay_nota_fiscal_files',
    'driverpay_mirror_publications',
    'driverpay_payment_marks',
    'driverpay_proof_requests',
    'driverpay_deduction_ledger',
    'driverpay_delivery_proofs'
  ];
begin
  foreach t in array alvos loop
    execute format('drop trigger if exists trg_driverpay_lock_%s on public.%I',
                   replace(t, 'driverpay_', ''), t);
    execute format(
      'create trigger trg_driverpay_lock_%s before insert or update or delete on public.%I
         for each row execute function public.driverpay_enforce_period_locked()',
      replace(t, 'driverpay_', ''), t);
  end loop;
end $do$;
