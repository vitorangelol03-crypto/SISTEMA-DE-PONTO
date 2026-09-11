-- ════════════════════════════════════════════════════════════════════════════
-- "PAGO" PASSA A SIGNIFICAR QUE ALGUÉM CONFIRMOU
--
-- ✅ APLICADA em 11/09/2026 (versão 20260911215504, a mesma do nome do arquivo).
--
-- 🔴 O PROBLEMA: o sistema marcava como `paid` TODO período cujo `end_date` já
-- tinha passado, sozinho, toda vez que alguém abria o sistema. Ninguém
-- confirmava nada — por isso as 45 semanas de Caratinga apareciam todas como
-- pagas. "Pago" só queria dizer "a semana acabou".
--
-- Pedido do Victor (11/09/2026): *"como é que vai ser feito agora pra confirmação
-- que está pago ou não… na aba de gerar arquivo de pagamento vai ter um
-- botãozinho, e vai marcar como pago. Aí vai abrir um novo ciclo"*.
--
-- AGORA SÃO TRÊS ESTADOS:
--   open   → a semana está correndo
--   closed → a semana acabou, mas NINGUÉM confirmou o pagamento ainda
--   paid   → alguém confirmou, e fica registrado QUEM (paid_by) e QUANDO (paid_at)
--
-- As 45 já marcadas continuam 'paid' — decisão dele: são passado e ele pagou.
-- Ficam sem `paid_by`/`paid_at`, e é assim que se reconhece que vieram do
-- automático antigo (a tela diz isso ao passar o mouse).
--
-- REVERSÃO:
--   update public.payment_periods set status='paid' where status='closed';
--   alter table public.payment_periods drop constraint payment_periods_status_check;
--   alter table public.payment_periods add constraint payment_periods_status_check
--     check (status = any (array['open','paid']));
--   alter table public.payment_periods drop column paid_at, drop column paid_by;
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.payment_periods
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by text references public.users(id) on delete set null;

comment on column public.payment_periods.paid_at is
  'Quando o pagamento da semana foi CONFIRMADO por uma pessoa. Nulo em semana '
  'que ainda nao foi confirmada — e nas 45 antigas, que o automatico marcou como '
  'paga so porque a data passou (11/09/2026).';

comment on column public.payment_periods.paid_by is
  'Quem confirmou o pagamento da semana. Nulo nas semanas marcadas pelo '
  'automatico antigo.';

alter table public.payment_periods
  drop constraint if exists payment_periods_status_check;

alter table public.payment_periods
  add constraint payment_periods_status_check
  check (status in ('open', 'closed', 'paid'));

comment on column public.payment_periods.status is
  'open = a semana esta correndo; closed = acabou mas NINGUEM confirmou o '
  'pagamento; paid = alguem confirmou (ver paid_by/paid_at). Ate 11/09/2026 so '
  'existiam open e paid, e o sistema marcava paid sozinho quando a data passava '
  '— "pago" nao significava que alguem pagou.';

commit;
