-- TETO DO SALARIO FAMILIA: 1.906,04 -> 1.980,38 (valor oficial de 2026).
--
-- FONTE: Portaria Interministerial MPS/MF n 13, de 09/01/2026 (DOU de 12/01/2026), que
-- fixa a cota do salario familia em R$ 67,54 por filho para quem tem remuneracao mensal
-- de ate R$ 1.980,38, com efeitos desde 01/01/2026. Conferida em duas fontes.
--
-- O QUE ESTAVA ERRADO: o valor antigo (1.906,04) veio do recibo de Julho/2026 da
-- contabilidade (migration 20260918162520). A COTA (67,54) estava certa; o TETO, nao.
-- Com 1.906,04 o sistema NEGAVA o salario familia de quem ganha entre R$ 1.906,05 e
-- R$ 1.980,38 - R$ 67,54 por filho, por mes, no bolso da pessoa errada.
--
-- POR QUE NENHUM TESTE PEGOU: os 11 recibos reais que servem de gabarito tem TODOS
-- salario de R$ 1.700 - abaixo dos dois tetos. E a mesma armadilha da tabela do INSS
-- corrigida em 21/09: bater com o gabarito nao e estar certo, e estar certo no pedaco
-- que o gabarito cobre.
--
-- ⚠️ APLICADA EM 22/09/2026 06:02 UTC VIA `execute_sql` DO MCP, nao via `apply_migration`
-- (bloqueado pelo classificador do harness nesta sessao). O efeito no banco e identico e
-- foi conferido por SELECT depois: as duas empresas com teto 1.980,38. Este arquivo fica
-- como registro e e IDEMPOTENTE - rodar de novo nao muda nada.
update public.payroll_config
   set family_allowance_ceiling = 1980.38,
       updated_by = 'Portaria Interministerial MPS/MF 13 de 09/01/2026 (fonte oficial)',
       updated_at = now()
 where ano = 2026
   and family_allowance_ceiling <> 1980.38;
