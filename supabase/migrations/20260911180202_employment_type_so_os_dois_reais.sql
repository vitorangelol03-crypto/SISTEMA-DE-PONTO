-- ════════════════════════════════════════════════════════════════════════════
-- O VÍNCULO SÓ PODE SER UM DOS DOIS QUE O SISTEMA ENTENDE
--
-- ✅ APLICADA em 11/09/2026 (versão 20260911180202, a mesma do nome do arquivo).
--
-- 🔴 O PROBLEMA: o CHECK aceitava QUATRO valores — 'CLT', 'PJ', 'Diarista' e
-- 'Carteira Assinada' — mas o sistema só entende DOIS. São 'Diarista' e
-- 'Carteira Assinada' que a ficha oferece no menu, que os filtros procuram, que
-- as gavetas do Financeiro contam e que o pagamento carimba.
--
-- Quem entrava como 'CLT' ou 'PJ' ficava INVISÍVEL: não aparecia em nenhum dos
-- dois filtros de vínculo, e nas gavetas caía como diarista por descuido do
-- código. Aconteceu de verdade com 22 funcionários da Ponte Nova.
--
-- E o pior estava na importação: quando ela não reconhecia o valor da planilha,
-- o padrão aplicado era justamente **'CLT'** — o valor que some de tudo.
--
-- A TRADUÇÃO (decisão do Victor, 11/09/2026): CLT = Carteira Assinada, e
-- **"PJ é diarista também"**. A planilha continua aceitando as quatro palavras
-- (`normalizeEmploymentType` traduz); o que muda é que agora é IMPOSSÍVEL
-- gravar um valor que o sistema não entende, por qualquer caminho.
--
-- Conferido ANTES de aplicar: 0 pessoas seriam barradas.
-- Conferido DEPOIS: um INSERT com 'CLT' é recusado com check_violation.
--
-- REVERSÃO (volta a aceitar os 4 — não recomendado):
--   alter table public.employees drop constraint employees_employment_type_check;
--   alter table public.employees add constraint employees_employment_type_check
--     check (employment_type = any (array['CLT','PJ','Diarista','Carteira Assinada']));
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.employees
  drop constraint if exists employees_employment_type_check;

alter table public.employees
  add constraint employees_employment_type_check
  check (employment_type in ('Diarista', 'Carteira Assinada'));

comment on column public.employees.employment_type is
  'Vinculo OPERACIONAL — e por ele que a lista, os filtros, as gavetas do '
  'Financeiro e o carimbo do pagamento funcionam. So DOIS valores: Diarista e '
  'Carteira Assinada. Ate 11/09/2026 o CHECK tambem aceitava CLT e PJ, que o '
  'sistema nao entende e deixavam a pessoa invisivel nos filtros. Na planilha de '
  'importacao CLT vira Carteira Assinada e PJ vira Diarista.';

commit;
