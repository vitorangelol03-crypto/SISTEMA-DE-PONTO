-- ═══════════════════════════════════════════════════════════════════════════════
-- TABELA DO INSS DE 2026 — os valores OFICIAIS (21/09/2026)
--
-- A tabela gravada em 18/09 nasceu derivada dos recibos reais e marcada como
-- "a confirmar". Conferida agora contra a fonte oficial, 3 das 4 faixas e o teto
-- estavam errados:
--
--            ESTAVA         PASSA A SER      (erro)
--   1a faixa  1.621,30  ->    1.621,00       30 centavos
--   2a faixa  3.041,65  ->    2.902,84       R$ 138,81 larga demais
--   3a faixa  4.562,47  ->    4.354,27       R$ 208,20 larga demais
--   teto      9.124,94  ->    8.475,55       R$ 649,39 alto demais
--
-- Efeito medido no sistema ANTES desta correcao (salario -> INSS descontado):
--   3.000 -> 245,68 (devia 248,59)   5.000 -> 493,18 (devia 501,51)
--   9.500 -> 1.070,67 (devia 988,09, que e o teto de contribuicao)
-- Ate R$ 2.902 nao havia erro — por isso bateu nos 11 recibos do gabarito, onde
-- o maior salario era R$ 2.200. O erro comecava onde os recibos nao chegavam.
--
-- FONTE: Portaria Interministerial MPS/MF no 13, de 09/01/2026.
--   https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
-- Conferida em DUAS fontes independentes, e a contribuicao maxima que elas
-- publicam (R$ 988,09) bate com o calculo progressivo destas faixas.
--
-- `confirmado` SEGUE FALSE de proposito: os numeros vem do governo, mas ninguem
-- da contabilidade do Victor olhou ainda. A tarja "VALORES EM CONFERENCIA"
-- continua no recibo ate isso acontecer (decisao do Victor, 21/09).
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.payroll_tax_tables
SET faixas = '[{"ate": 1621.00, "aliquota": 7.5}, {"ate": 2902.84, "aliquota": 9}, {"ate": 4354.27, "aliquota": 12}, {"ate": 8475.55, "aliquota": 14}]'::jsonb,
    teto = 8475.55,
    updated_at = now(),
    updated_by = 'migration 21/09 - valores oficiais da Portaria Interministerial MPS/MF 13 de 09/01/2026; confirmado segue false ate o contador conferir'
WHERE ano = 2026 AND tipo = 'inss';
