/**
 * FÉRIAS — o direito adquirido, de todo mundo numa tela (19/09/2026).
 *
 * A pergunta que esta tela responde: *quem tem férias para tirar, e quem está prestes a
 * vencer?* — porque férias vencida a lei manda pagar em DOBRO, e esse é o erro mais caro
 * que uma folha pequena comete sem perceber.
 *
 * O lançamento das férias continua na ficha do funcionário, onde já era. Aqui é a visão
 * de cima: a lista inteira, com quem está vencido no topo.
 *
 * ## Os dois números lado a lado (decisão do Victor, 19/09)
 *
 * A coluna "Direito" mostra os 30 dias cheios e, quando a tabela de faltas do art. 130
 * corta, o número cortado entre parênteses. Qual usar é decisão dele, caso a caso —
 * por isso a tela mostra os dois em vez de escolher sozinha.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, RefreshCw, Users } from 'lucide-react';
import {
  getAllEmployees,
  getAttendanceHistory,
  getEmployeeVacations,
  type Company,
  type Employee,
  type Attendance,
  type EmployeeVacation,
} from '../../services/database';
import { feriasPorAvos, type FeriasDaPessoa } from '../../utils/folha/feriasPorAvos';
import { mensagemDeErro } from '../../utils/mensagemDeErro';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';

interface Props {
  company: Company;
}

interface LinhaDeFerias {
  employee: Employee;
  ferias: FeriasDaPessoa;
}

/** Quem está vencido vem primeiro, depois quem está perto, depois por nome. */
function ordem(a: LinhaDeFerias, b: LinhaDeFerias): number {
  const peso = (l: LinhaDeFerias) => (l.ferias.vencida ? 0 : l.ferias.perto ? 1 : 2);
  const d = peso(a) - peso(b);
  return d !== 0 ? d : a.employee.name.localeCompare(b.employee.name, 'pt-BR');
}

export const FeriasPanel: React.FC<Props> = ({ company }) => {
  const hoje = getBrazilDate();
  const [linhas, setLinhas] = useState<LinhaDeFerias[] | null>(null);
  const [semData, setSemData] = useState<Employee[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const calcular = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const pessoas = await getAllEmployees('Carteira Assinada', company.id);

      // Sem data de admissão não há período aquisitivo — e o sistema NÃO chuta
      // (decisão do Victor). Elas saem numa lista à parte, dizendo o que falta.
      const comData = pessoas.filter(e => (e.hire_date ?? '').trim());
      setSemData(pessoas.filter(e => !(e.hire_date ?? '').trim()));

      if (comData.length === 0) {
        setLinhas([]);
        return;
      }

      /**
       * O ponto é buscado desde a admissão mais antiga: as faltas de anos atrás ainda
       * cortam o direito daquele período aquisitivo. Limitado a 5 anos para o recorte
       * não virar uma varredura sem fim numa empresa antiga.
       */
      const maisAntiga = comData.reduce((min, e) => (e.hire_date! < min ? e.hire_date! : min), comData[0].hire_date!);
      const cincoAnosAtras = `${Number(hoje.slice(0, 4)) - 5}${hoje.slice(4)}`;
      const inicio = maisAntiga < cincoAnosAtras ? cincoAnosAtras : maisAntiga;

      const [pontos, feriasLancadas] = await Promise.all([
        getAttendanceHistory(inicio, hoje, undefined, undefined, undefined, company.id),
        getEmployeeVacations(company.id, inicio, hoje).catch(() => [] as EmployeeVacation[]),
      ]);

      const faltasPorPessoa = new Map<string, string[]>();
      for (const p of pontos as Attendance[]) {
        const justificada = (p as unknown as { absence_justified?: boolean }).absence_justified;
        if (p.status !== 'absent' || justificada) continue;
        const lista = faltasPorPessoa.get(p.employee_id);
        if (lista) lista.push(p.date);
        else faltasPorPessoa.set(p.employee_id, [p.date]);
      }

      const montadas = comData.map(employee => ({
        employee,
        ferias: feriasPorAvos({
          admissao: employee.hire_date,
          hoje,
          faltasInjustificadas: faltasPorPessoa.get(employee.id) ?? [],
          feriasGozadas: feriasLancadas.filter(f => f.employee_id === employee.id),
        }),
      }));

      montadas.sort(ordem);
      setLinhas(montadas);
    } catch (err) {
      console.error('Erro ao calcular as férias:', err);
      setErro(mensagemDeErro(err, 'Não consegui montar as férias. Tente de novo.'));
      setLinhas(null);
    } finally {
      setCarregando(false);
    }
  }, [company.id, hoje]);

  const vencidas = useMemo(() => (linhas ?? []).filter(l => l.ferias.vencida).length, [linhas]);
  const perto = useMemo(() => (linhas ?? []).filter(l => l.ferias.perto).length, [linhas]);

  return (
    <div className="space-y-4" data-testid="ferias-panel">
      <p className="text-sm text-gray-600">
        Quanto de férias cada pessoa já ganhou, quanto já tirou e até quando tem que tirar.
        O lançamento continua na ficha do funcionário.
      </p>

      <button
        type="button"
        onClick={calcular}
        disabled={carregando}
        data-testid="ferias-calcular"
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
      >
        {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        <span>{carregando ? 'Montando…' : 'Calcular as férias'}</span>
      </button>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="ferias-erro">
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      )}

      {/* ─── O alerta caro, no topo ─── */}
      {vencidas > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 flex items-start gap-2" data-testid="ferias-vencidas">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-900">
            <strong>{vencidas} {vencidas === 1 ? 'pessoa está' : 'pessoas estão'} com férias VENCIDAS.</strong>{' '}
            Passou o prazo de 12 meses para tirar — a lei manda pagar em dobro.
          </p>
        </div>
      )}
      {perto > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2" data-testid="ferias-perto">
          <CalendarClock className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-900">
            {perto} {perto === 1 ? 'pessoa vence' : 'pessoas vencem'} nos próximos 90 dias.
          </p>
        </div>
      )}

      {linhas !== null && linhas.length === 0 && !erro && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center" data-testid="ferias-vazio">
          <Users className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            Ninguém de carteira assinada tem data de admissão na ficha — sem ela não dá para
            contar período aquisitivo.
          </p>
        </div>
      )}

      {linhas !== null && linhas.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Funcionário</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700">Admissão</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700">Direito</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700">Já tirou</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700">Pode tirar</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700">Em formação</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700">Tirar até</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {linhas.map(({ employee, ferias }) => (
                <tr
                  key={employee.id}
                  data-testid="ferias-linha"
                  className={ferias.vencida ? 'bg-red-50' : ferias.perto ? 'bg-yellow-50' : undefined}
                >
                  <td className="px-4 py-2 font-medium text-gray-900">{employee.name}</td>
                  <td className="px-4 py-2 text-center text-gray-700">{formatDateBR(employee.hire_date!)}</td>
                  <td className="px-4 py-2 text-center text-gray-700">
                    {ferias.diasCheios}
                    {/* O corte do art. 130 só aparece quando de fato corta. */}
                    {ferias.diasComFaltas !== ferias.diasCheios && (
                      <span className="text-orange-700" title="Cortado pela tabela de faltas do art. 130">
                        {' '}({ferias.diasComFaltas})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-700">{ferias.diasGozados}</td>
                  <td className="px-4 py-2 text-center font-semibold text-green-700" data-testid="ferias-saldo">
                    {ferias.saldoCheio}
                    {ferias.saldoComFaltas !== ferias.saldoCheio && (
                      <span className="text-orange-700"> ({ferias.saldoComFaltas})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-500" title="Proporcional do período em curso — só vale na rescisão">
                    {ferias.proporcionalCheio > 0 ? `+${ferias.proporcionalCheio}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {ferias.vencimento ? (
                      <span className={ferias.vencida ? 'font-bold text-red-700' : ferias.perto ? 'font-semibold text-yellow-800' : 'text-gray-700'}>
                        {formatDateBR(ferias.vencimento)}
                        {ferias.vencida && ' ⚠'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">ainda não fechou</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {linhas !== null && (
        <p className="text-xs text-gray-500">
          O número entre parênteses é o corte da tabela de faltas do art. 130 — aparece só quando
          as faltas sem atestado reduzem o direito. "Em formação" é o proporcional do período que
          ainda não fechou: não dá para tirar, só entra na rescisão.
        </p>
      )}

      {/* ─── Quem falta a data, e o que fazer ─── */}
      {semData.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4" data-testid="ferias-sem-data">
          <p className="text-sm text-blue-900 font-medium mb-2">
            {semData.length} {semData.length === 1 ? 'pessoa está' : 'pessoas estão'} sem data de admissão na ficha
          </p>
          <p className="text-xs text-blue-800 mb-2">
            Sem ela não dá para contar o período aquisitivo, e o sistema não inventa: férias é
            direito e é dinheiro. Preencha a data em Funcionários → editar → Data de Admissão.
          </p>
          <ul className="text-xs text-blue-900 space-y-0.5 pl-4 list-disc">
            {semData.map(e => <li key={e.id}>{e.name}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
