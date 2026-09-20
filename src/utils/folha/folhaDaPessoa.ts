/**
 * A FOLHA DE UMA PESSOA num período — decidida num lugar só (19/09/2026).
 *
 * ## Por que isto existe
 *
 * Até 18/09 esta decisão morava dentro do `FinancialTab` (a função `folhaDoRecibo`), e só
 * o PDF do recibo a enxergava. Quando o relatório e a tela do Financeiro precisaram da
 * MESMA folha, copiar a função seria o começo de duas contas que um dia divergiriam — e
 * aí ninguém saberia qual está certa. É a mesma razão pela qual o `financeiroPorPessoa`
 * e o `driverPayCalc` moram fora dos componentes.
 *
 * ## As duas decisões que ela toma
 *
 * 1. **Quem tem folha:** só quem é `Carteira Assinada` E tem salário na ficha. Sem isso,
 *    devolve `undefined` e o papel sai de DIARISTA, exatamente como sempre saiu. É o que
 *    garante que nada mudou em produção enquanto ninguém preencher um salário.
 *
 * 2. **Quando a folha aparece:** só em período de MÊS FECHADO (decisão do Victor,
 *    19/09/2026). Num recorte menor devolve `foraDoMes: true` — e quem desenha o papel
 *    mostra o aviso de onde o salário aparece, em vez de um número que não fecha. O
 *    porquê está no `ehMesInteiro`: INSS e IRRF são progressivos sobre o mês.
 */

import {
  calcularAdicionalNoturno,
  calcularFolha,
  diasDeFeriasNoPeriodo,
  ehMesInteiro,
  type ConfiguracaoDaFolha,
  type FolhaCalculada,
} from './folhaCalc';
import type { TabelaDoInss, TabelaDoIrrf } from './impostos';

/** Só os campos da ficha que a folha usa — de propósito, pra não amarrar no `Employee`. */
export interface FichaParaFolha {
  id: string;
  employment_type?: string | null;
  monthly_salary?: number | null;
  family_allowance_children?: number | null;
  fgts_enabled?: boolean | null;
  hire_date?: string | null;
}

/** Uma premiação lançada, do jeito que o banco guarda. */
export interface PremiacaoParaFolha {
  employee_id: string;
  data: string;
  valor: number;
  descricao?: string | null;
}

/** Um período de férias, do jeito que o banco guarda. */
export interface FeriasParaFolha {
  employee_id: string;
  start_date: string;
  end_date: string;
}

export interface TabelasParaFolha {
  inss: TabelaDoInss | null;
  irrf: TabelaDoIrrf | null;
  confirmadas: boolean;
}

export interface EntradaDaFolhaDaPessoa {
  ficha: FichaParaFolha;
  inicio: string;
  fim: string;
  config: ConfiguracaoDaFolha;
  /** Férias de TODA a empresa no período — filtradas por pessoa aqui dentro. */
  ferias: readonly FeriasParaFolha[];
  tabelas: TabelasParaFolha;
  /** Horas noturnas do período, vindas do ponto. Viram R$ só para mensalista. */
  horasNoturnas: number;
  /** Datas das faltas SEM atestado. As com atestado não descontam nada. */
  faltasInjustificadas: readonly string[];
  /**
   * Premiações de TODA a empresa no período — filtradas por pessoa aqui dentro, como as
   * férias. Saem como bônus: entram no líquido e em nenhuma base.
   */
  premiacoes?: readonly PremiacaoParaFolha[];
}

export interface FolhaDaPessoa {
  /** `undefined` = o papel sai de diarista, como sempre. */
  folha?: FolhaCalculada;
  /**
   * A pessoa TEM salário de mensalista, mas o período pedido não é um mês fechado.
   *
   * Quem desenha usa isto para explicar a ausência — sem o aviso, o salário simplesmente
   * sumiria do papel e ninguém saberia por quê.
   */
  foraDoMes: boolean;
}

const SEM_FOLHA: FolhaDaPessoa = { folha: undefined, foraDoMes: false };

export function folhaDaPessoa({
  ficha,
  inicio,
  fim,
  config,
  ferias,
  tabelas,
  horasNoturnas,
  faltasInjustificadas,
  premiacoes,
}: EntradaDaFolhaDaPessoa): FolhaDaPessoa {
  const salario = Number(ficha.monthly_salary ?? 0);
  if (ficha.employment_type !== 'Carteira Assinada' || salario <= 0) return SEM_FOLHA;

  if (!ehMesInteiro(inicio, fim)) return { folha: undefined, foraDoMes: true };

  // O mês de referência é o do início do período — que, sendo mês fechado, é o mês todo.
  const [ano, mes] = inicio.split('-').map(Number);

  return {
    foraDoMes: false,
    folha: calcularFolha({
      ficha: {
        salarioMensal: salario,
        filhosSalarioFamilia: ficha.family_allowance_children ?? 0,
        fgtsAtivo: ficha.fgts_enabled ?? false,
        admissao: ficha.hire_date,
      },
      config,
      ano,
      mes,
      // Decisão do Victor (18/09): o adicional noturno sai em R$ SÓ pra carteira assinada.
      // O diarista continua como está — a tela dele nunca mostrou valor.
      adicionalNoturno: calcularAdicionalNoturno(salario, horasNoturnas),
      faltasInjustificadas,
      // Férias podem atravessar o mês: conta só os dias que caem neste período.
      diasDeFerias: diasDeFeriasNoPeriodo(
        ferias.filter(f => f.employee_id === ficha.id),
        inicio,
        fim,
      ),
      premiacoes: (premiacoes ?? [])
        .filter(p => p.employee_id === ficha.id)
        .map(p => ({ descricao: p.descricao ?? undefined, valor: Number(p.valor) })),
      tabelaInss: tabelas.inss ?? undefined,
      tabelaIrrf: tabelas.irrf ?? undefined,
      tabelasConfirmadas: tabelas.confirmadas,
    }),
  };
}
