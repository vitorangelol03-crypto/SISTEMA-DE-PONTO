-- A "PARCELA A DEDUZIR" DAS TABELAS OFICIAIS (21/09/2026)
--
-- A tabela oficial publica, junto de cada aliquota, uma "parcela a deduzir": o imposto
-- e `base x aliquota - parcela`. Em teoria da o mesmo que somar faixa a faixa. NA
-- PRATICA NAO DA: a parcela publicada e ARREDONDADA (na 2a faixa do INSS a conta exata
-- da 24,315 e a tabela traz 24,32), e esse meio centavo vira um centavo inteiro depois
-- do truncamento.
--
-- 🔴 Descoberto porque o gabarito dos 11 recibos REAIS da contabilidade Arruda ficou
-- vermelho ao trocar a tabela pela oficial. Conferido nos 11:
--
--   metodo                                erros
--   somando faixa a faixa                   4     (Camila 135,24 x papel 135,23)
--   base x aliquota - parcela a deduzir     0     (11 de 11)
--
-- Isso tambem explica de onde vinha o "1.621,30" da tabela antiga: nao era um valor
-- real, era o limite ENTORTADO pra fazer a soma-por-faixa imitar a conta do contador.
-- Funcionava ate R$ 2.902 e quebrava acima — o pior tipo de erro, o que parece certo.
--
-- Valores oficiais:
--   INSS  0,00 / 24,32 / 111,40 / 198,49
--   IRRF  0,00 / 182,16 / 394,16 / 675,49 / 908,73
--
-- ⚠️ No TETO do INSS os dois metodos discordam em 1 centavo (formula 988,08 x
-- "contribuicao maxima" publicada 988,09). A inconsistencia e do proprio material
-- oficial. Fica o da formula. 📋 A confirmar com o contador.
--
-- Quem nao tiver `deduzir` na faixa continua na soma progressiva (compatibilidade).

UPDATE public.payroll_tax_tables
SET faixas = '[{"ate": 1621.00, "aliquota": 7.5, "deduzir": 0}, {"ate": 2902.84, "aliquota": 9, "deduzir": 24.32}, {"ate": 4354.27, "aliquota": 12, "deduzir": 111.40}, {"ate": 8475.55, "aliquota": 14, "deduzir": 198.49}]'::jsonb,
    updated_at = now(),
    updated_by = 'migration 21/09 - parcela a deduzir oficial; reproduz 11 de 11 recibos reais'
WHERE ano = 2026 AND tipo = 'inss';

UPDATE public.payroll_tax_tables
SET faixas = '[{"ate": 2428.80, "aliquota": 0, "deduzir": 0}, {"ate": 2826.65, "aliquota": 7.5, "deduzir": 182.16}, {"ate": 3751.05, "aliquota": 15, "deduzir": 394.16}, {"ate": 4664.68, "aliquota": 22.5, "deduzir": 675.49}, {"ate": null, "aliquota": 27.5, "deduzir": 908.73}]'::jsonb,
    updated_at = now(),
    updated_by = 'migration 21/09 - parcela a deduzir oficial (o exemplo da Rita, da Receita, usa este metodo)'
WHERE ano = 2026 AND tipo = 'irrf';
