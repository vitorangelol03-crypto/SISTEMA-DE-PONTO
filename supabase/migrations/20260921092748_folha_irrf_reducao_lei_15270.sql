-- REDUÇÃO DO IMPOSTO DE RENDA — Lei nº 15.270, de 26/11/2025 (21/09/2026)
--
-- A partir de janeiro/2026 a lei criou uma REDUÇÃO aplicada sobre o imposto já
-- apurado (não sobre a base):
--
--   rendimento tributável ate R$ 5.000,00  -> reducao de ate R$ 312,89, que ZERA o
--                                             imposto (a tabela da exatamente 312,89
--                                             nesse ponto, pelo caminho simplificado)
--   de R$ 5.000,01 a R$ 7.350,00           -> reducao = 978,62 - (0,133145 x rendimento)
--   acima de R$ 7.350,00                   -> sem reducao
--
-- O sistema NAO tinha nada disso: cobrava IRRF de quem a lei isenta. Medido antes
-- desta correcao (salario -> IRRF que o sistema descontava, devendo ser zero):
--   3.200 -> 12,30    4.000 -> 114,76    5.000 -> 312,89
--   5.500 -> 436,79 (devia 190,47)       6.000 -> 564,86 (devia 385,11)
--
-- Vai em COLUNA no banco, e nao chumbado no codigo, porque muda por lei — que e
-- exatamente a licao da tabela do INSS errada, corrigida horas atras.
--
-- NULO = ano sem reducao. So o IRRF usa; a linha do INSS fica nula.
--
-- FONTE: Lei 15.270/2025 e a pagina de exemplos da Receita Federal
--   ("Exemplos de Aplicacao da Lei 15.270/2025"), cujo caso oficial e:
--   Rita, R$ 6.000,00 com INSS de R$ 649,60 -> base 5.350,40 -> imposto 562,63
--   -> reducao 179,75 -> IRRF 382,88. Este caso virou teste com gabarito.
--
-- ⚠️ SO VALE NA FOLHA DO MES. A lei fala em "rendimentos sujeitos a incidencia
-- MENSAL", e o 13o e tributado a parte — decisao do Victor em 21/09: nao aplicar no
-- 13o nem na rescisao, e perguntar ao contador. Aplicar por engano faria a empresa
-- recolher imposto a menos. No codigo isso e explicito: `calcularIrrf` so reduz se o
-- chamador passar `incidenciaMensal`, e o padrao e NAO reduzir.

ALTER TABLE public.payroll_tax_tables
  ADD COLUMN IF NOT EXISTS reducao jsonb;

COMMENT ON COLUMN public.payroll_tax_tables.reducao IS
  'Reducao do imposto apurado (Lei 15.270/2025). Formato: {"ate": 5000, "maxima": 312.89, "coef": 978.62, "taxa": 0.133145, "limite": 7350}. NULO = ano sem reducao. So a linha do IRRF usa.';

UPDATE public.payroll_tax_tables
SET reducao = '{"ate": 5000.00, "maxima": 312.89, "coef": 978.62, "taxa": 0.133145, "limite": 7350.00}'::jsonb,
    updated_at = now(),
    updated_by = 'migration 21/09 - reducao da Lei 15.270/2025; confirmado segue false ate o contador conferir'
WHERE ano = 2026 AND tipo = 'irrf';
