/**
 * Os três relatórios em PLANILHA (12/09/2026).
 *
 * Regra de desenho que veio do Victor: *"bem dividido por funcionário, nada tipo
 * assim de repetir nomes de funcionário trezentas vezes"*. Então cada pessoa é um
 * BLOCO — o nome aparece uma vez, no alto do bloco, e embaixo vêm os dias (ou as
 * linhas de valor) só dela, com o subtotal fechando o bloco.
 *
 * A aba "Resumo" vem primeiro: uma linha por pessoa, pra bater o olho e achar
 * quem falta. As abas de detalhe vêm depois, na ordem em que a pessoa lê.
 *
 * Os números vão como NÚMERO, não como texto: quem abre a planilha vai querer
 * somar, filtrar e fazer conta em cima. Só data e hora vão como texto, no
 * formato brasileiro.
 */

import * as XLSX from 'xlsx';
import { minutesToHHMMAlways, formatDateBR } from '../mirrorGenerator';
import type { RelatorioMontado, PessoaDoRelatorio } from './relatorioDados';

type Celula = string | number | null;

function horas(min: number): string {
  return minutesToHHMMAlways(min);
}

/** Vínculo como a pessoa entende, não como o banco guarda. */
function vinculo(p: PessoaDoRelatorio): string {
  return p.employee.employment_type ?? '—';
}

function abaResumo(r: RelatorioMontado): Celula[][] {
  const temDinheiro = r.pessoas.some(p => p.linhas.length > 0);
  const temPonto = r.pessoas.some(p => p.espelho !== null);

  const cabecalho: Celula[] = ['Funcionário', 'CPF', 'Função', 'Vínculo'];
  if (temPonto || r.tipo === 'financeiro') cabecalho.push('Dias trabalhados', 'Faltas');
  if (temPonto) cabecalho.push('Horas trabalhadas', 'Horas noturnas', 'Intervalo', 'Previstas', 'Saldo banco de horas');
  if (temDinheiro) cabecalho.push('Proventos (R$)', 'Descontos (R$)', 'Líquido (R$)');
  // FGTS só ganha coluna quando existe — senão todo relatório de diarista levaria uma
  // coluna de zeros (19/09/2026).
  const temCustoEmpresa = temDinheiro && r.totais.custoEmpresa > 0;
  if (temCustoEmpresa) cabecalho.push('FGTS empresa (R$)');

  const linhas: Celula[][] = [cabecalho];

  for (const p of r.pessoas) {
    const linha: Celula[] = [p.employee.name, p.employee.cpf ?? '', p.employee.function_role ?? '—', vinculo(p)];
    if (temPonto || r.tipo === 'financeiro') {
      linha.push(p.resumoPonto?.diasTrabalhados ?? 0, p.resumoPonto?.faltas ?? 0);
    }
    if (temPonto) {
      const rp = p.resumoPonto!;
      linha.push(
        horas(rp.minutosDiurnos + rp.minutosNoturnos),
        horas(rp.minutosNoturnos),
        horas(rp.minutosIntervalo),
        horas(rp.minutosEsperados),
        horas(rp.bancoSaldo),
      );
    }
    if (temDinheiro) {
      linha.push(p.totalProventos, p.totalDescontos, p.totalLiquido);
    }
    if (temCustoEmpresa) linha.push(p.totalCustoEmpresa);
    linhas.push(linha);
  }

  // Linha de fechamento — a mesma conta que o rodapé do PDF mostra.
  const total: Celula[] = ['TOTAL', '', '', ''];
  if (temPonto || r.tipo === 'financeiro') total.push(r.totais.diasTrabalhados, r.totais.faltas);
  if (temPonto) total.push(horas(r.totais.minutosTrabalhados), horas(r.totais.minutosNoturnos), '', '', '');
  if (temDinheiro) total.push(r.totais.proventos, r.totais.descontos, r.totais.liquido);
  if (temCustoEmpresa) total.push(r.totais.custoEmpresa);
  linhas.push([], total);

  return linhas;
}

function abaPonto(r: RelatorioMontado): Celula[][] {
  const linhas: Celula[][] = [];

  for (const p of r.pessoas) {
    if (!p.espelho) continue;
    const rp = p.resumoPonto!;

    // Cabeçalho do bloco: o nome aparece UMA vez.
    linhas.push([`${p.employee.name}`, `CPF ${p.employee.cpf ?? '—'}`, `Função: ${p.employee.function_role ?? '—'}`, `Vínculo: ${vinculo(p)}`]);
    linhas.push(['Data', 'Entrada', 'Saída almoço', 'Volta almoço', 'Saída', 'Previstas', 'Diurnas', 'Noturnas', 'Intervalo', 'Crédito banco', 'Débito banco']);

    for (const dia of p.espelho.rows) {
      linhas.push([
        formatDateBR(dia.date),
        dia.ent1.display || '',
        dia.sai1.display || '',
        dia.ent2.display || '',
        dia.sai2.display || '',
        horas(dia.expected),
        horas(dia.daytime),
        horas(dia.nighttime),
        horas(dia.interval),
        horas(dia.bankCredit),
        horas(dia.bankDebit),
      ]);
    }

    linhas.push([
      'Subtotal', '', '', '', '',
      horas(rp.minutosEsperados), horas(rp.minutosDiurnos), horas(rp.minutosNoturnos),
      horas(rp.minutosIntervalo), horas(rp.bancoCredito), horas(rp.bancoDebito),
    ]);
    linhas.push([`Dias trabalhados: ${rp.diasTrabalhados}`, `Faltas: ${rp.faltas}`, `Saldo do banco de horas: ${horas(rp.bancoSaldo)}`]);
    linhas.push([]); // respiro entre uma pessoa e outra
  }

  return linhas;
}

function abaFinanceiro(r: RelatorioMontado): Celula[][] {
  const linhas: Celula[][] = [];

  for (const p of r.pessoas) {
    // Quem tem salário e caiu num recorte menor que o mês entra MESMO zerado: é a linha
    // do aviso que explica por que o salário dela não está aqui.
    if (p.linhas.length === 0 && p.totalLiquido === 0 && !p.folhaForaDoMes) continue;

    linhas.push([`${p.employee.name}`, `CPF ${p.employee.cpf ?? '—'}`, `Função: ${p.employee.function_role ?? '—'}`, `Vínculo: ${vinculo(p)}`]);
    linhas.push(['Descrição', 'Quantidade', 'Valor (R$)', 'Tipo']);

    for (const l of p.linhas) {
      linhas.push([
        l.rotulo,
        l.quantidade,
        l.valor,
        l.natureza === 'provento' ? 'Provento' : l.natureza === 'desconto' ? 'Desconto' : 'Custo da empresa',
      ]);
    }

    linhas.push(['Total de proventos', null, p.totalProventos, '']);
    linhas.push(['Total de descontos', null, p.totalDescontos, '']);
    linhas.push(['LÍQUIDO RECEBIDO', null, p.totalLiquido, '']);
    if (p.totalCustoEmpresa > 0) {
      linhas.push(['FGTS depositado pela empresa', null, p.totalCustoEmpresa, 'Não sai do bolso do funcionário']);
    }
    if (p.folhaForaDoMes) {
      linhas.push(['O salário de carteira assinada aparece no relatório do MÊS — este período é menor que um mês.']);
    }
    if (p.resumoPonto) {
      linhas.push([`Dias trabalhados: ${p.resumoPonto.diasTrabalhados}`, `Faltas: ${p.resumoPonto.faltas}`]);
    }
    linhas.push([]);
  }

  return linhas;
}

function planilhaDe(linhas: Celula[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(linhas.map(l => l.map(c => (c === null ? '' : c))));
  // Larguras que cabem nome, CPF e valores sem cortar — planilha cortada é o
  // tipo de detalhe que faz a pessoa achar que o dado está errado.
  ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

export function nomeDoArquivo(r: RelatorioMontado, extensao: 'xlsx' | 'pdf'): string {
  const tipo = r.tipo === 'ponto' ? 'Ponto' : r.tipo === 'financeiro' ? 'Financeiro' : 'Geral';
  const periodo = r.periodo.rotulo.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
  return `Relatorio_${tipo}_${periodo}.${extensao}`;
}

/** Monta o arquivo da planilha. Separado do download pra poder testar. */
export function montarPlanilha(r: RelatorioMontado): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, planilhaDe(abaResumo(r)), 'Resumo');

  if (r.tipo === 'ponto' || r.tipo === 'geral') {
    XLSX.utils.book_append_sheet(wb, planilhaDe(abaPonto(r)), 'Ponto');
  }
  if (r.tipo === 'financeiro' || r.tipo === 'geral') {
    XLSX.utils.book_append_sheet(wb, planilhaDe(abaFinanceiro(r)), 'Financeiro');
  }

  return wb;
}

export function baixarRelatorioExcel(r: RelatorioMontado): void {
  XLSX.writeFile(montarPlanilha(r), nomeDoArquivo(r, 'xlsx'));
}
