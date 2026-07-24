-- Recebedor separado do driver/líder (decisão do Victor, 2026-07-24):
-- ex.: a esposa trabalha com o líder, a NOTA sai no nome dela e o PIX é dela.
-- O ESPELHO continua no nome do líder; os RELATÓRIOS (geral + simples) saem
-- com o nome + chave PIX do recebedor quando preenchido.
-- Vazio (null) = comporta como hoje: o próprio driver é o recebedor.
alter table public.driverpay_drivers
  add column if not exists recebedor_nome text,
  add column if not exists recebedor_pix text;

comment on column public.driverpay_drivers.recebedor_nome is
  'Nome de quem recebe por este driver nos relatórios (ex.: esposa emite a nota). Null = o próprio driver.';
comment on column public.driverpay_drivers.recebedor_pix is
  'Chave PIX do recebedor. Null = usa a pix_key do próprio driver.';
