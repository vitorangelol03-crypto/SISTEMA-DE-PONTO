-- 19/09/2026 — O PAPEL COMO ELE SAIU, para a 2ª via ser fiel.
--
-- O problema que isto resolve: `payroll_thirteenth` e `payroll_termination` guardam os
-- VALORES do acerto, mas não as referências impressas — os dias, os avos, a faixa do
-- imposto ("Férias vencidas (90,00)", "INSS (9,00%)"). Reimprimir a partir só dos
-- valores daria um papel parecido, não o MESMO papel.
--
-- Num 13º isso é chato; numa rescisão é grave: é o documento que vale num processo, e
-- duas vias diferentes do mesmo acerto é exatamente o que não pode existir.
--
-- Guardar o objeto inteiro (e não mais colunas soltas) é de propósito: o dia em que o
-- desenho do papel mudar, a 2ª via de um acerto velho continua saindo como saiu, porque
-- ela não é recalculada — é relida.
--
-- Tudo ADITIVO: coluna nova com default, as duas tabelas estão vazias em produção.

alter table public.payroll_thirteenth
  add column if not exists papel jsonb not null default '{}'::jsonb;

alter table public.payroll_termination
  add column if not exists papel jsonb not null default '{}'::jsonb;

comment on column public.payroll_thirteenth.papel is
  'O cálculo INTEIRO como foi emitido (DecimoCalculado). A 2ª via relê isto em vez de recalcular — se o salário ou a tabela mudarem, o papel velho continua o mesmo.';
comment on column public.payroll_termination.papel is
  'O acerto INTEIRO como foi emitido (RescisaoCalculada). Idem: 2ª via é releitura, nunca recálculo.';
