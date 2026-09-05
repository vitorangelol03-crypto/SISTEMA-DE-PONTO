-- Chave PIX por RECEBEDOR (05/09/2026, decisão do Victor: "cada recebedor deve ter
-- sua chave pix cadastrada no sistema").
--
-- Contexto: com a nota dividida entre 2 CNPJs, o pagamento também se divide — metade
-- pra cada recebedor. Os relatórios (geral e simples) precisam de UMA CHAVE PIX POR
-- LINHA, e até aqui a ficha só guardava nome + CNPJ de cada recebedor autorizado.
--
-- Aditiva e sem risco: coluna nova, opcional. Quem não preencher segue como antes
-- (o relatório cai no CNPJ do recebedor, que também é chave PIX válida).
alter table public.driverpay_driver_nota_names
  add column if not exists pix text;

comment on column public.driverpay_driver_nota_names.pix is
  'Chave PIX deste recebedor. O relatório paga a fatia dele nesta chave; vazio = usa o CNPJ.';
