-- CNPJ de QUEM EMITIU cada nota (07/09/2026, decisão do Victor: "não pode sair os
-- dois pagamentos no mesmo nome — uma nota está num CNPJ e a outra em outro; o nome
-- da nota, o nome da chave e o CNPJ têm que ser os mesmos").
--
-- Contexto: a nota dividida existe pra espalhar o valor entre DOIS CNPJs (teto por
-- nota). A tela do app já prometia "cada nota tem que ser emitida em um CNPJ
-- DIFERENTE", mas o backend só comparava o CNPJ do TOMADOR (Shopee x iMile) — nunca
-- o de quem emite. Resultado real (GESSILEY, 1ª quinzena de agosto): as duas notas
-- saíram no CNPJ do Joaerson (55.857.717/0001-46) e passaram, e o relatório pagou as
-- duas metades no mesmo nome. As notas já validadas ficam como estão (ordem do
-- Victor); a trava vale da próxima dupla em diante.
--
-- Até aqui a nota só guardava `matched_name` — e nome não distingue CNPJ (a mesma
-- pessoa pode ter mais de um cadastrado). Esta coluna guarda o CNPJ da MESMA LINHA
-- do cadastro que a conferência casou, que é o que a trava compara.
--
-- Aditiva e sem risco: coluna nova, opcional, vazia nas notas antigas. Sem valor pra
-- comparar, a trava não recusa nada (nunca recusa no escuro).
alter table public.driverpay_nota_fiscal_files
  add column if not exists matched_cnpj text;

comment on column public.driverpay_nota_fiscal_files.matched_cnpj is
  'CNPJ (só dígitos) do emissor cadastrado que a conferência casou nesta nota — a dupla exige CNPJs diferentes entre as 2 partes. Null = nota anterior à feature ou sem emissor casado.';
