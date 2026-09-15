/**
 * A aba RELATÓRIOS, agora dentro do Financeiro (12/09/2026).
 *
 * Pedido do Victor: *"migrar a aba de relatórios para dentro da aba de
 * financeiro, onde com clique eu baixo o relatório do mês em PDF ou planilha bem
 * detalhado e organizado; vou poder filtrar semana, ou funcionário, ou função ou
 * vínculo"* — e depois: *"tirar do ano"* e *"cada folha um funcionário"*.
 *
 * São três relatórios (ponto · financeiro · geral), cada um em PDF e planilha.
 * O que cada um leva está em `utils/relatorios/relatorioDados.ts`; aqui é só a
 * escolha e o disparo.
 *
 * Por que os dados só são buscados no clique: o recorte pode ser um ANO inteiro
 * de uma empresa com 92 funcionários. Carregar isso a cada mexida de filtro
 * deixaria a tela pesada para, na maioria das vezes, jogar fora. Então a tela
 * carrega só a lista de gente (leve, para marcar quem entra) e busca o resto
 * quando a pessoa manda gerar.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, FileSpreadsheet, Loader2, Users, Search, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAllEmployees,
  getPayments,
  getAttendanceHistory,
  getErrorRecords,
  getTriageDistributionsForEmployees,
  getPaymentPeriods,
  type Company,
  type Employee,
  type PaymentPeriod,
} from '../../services/database';
import EmploymentTypeFilter, { type EmploymentType } from '../common/EmploymentTypeFilter';
import FunctionRoleFilter, { FUNCTION_ROLE_ALL, FUNCTION_ROLE_NONE, type FunctionRoleFilterValue } from '../common/FunctionRoleFilter';
import { agregarFinanceiroPorPessoa } from '../../utils/financeiroPorPessoa';
import { montarRelatorio, type TipoRelatorio } from '../../utils/relatorios/relatorioDados';
import { baixarRelatorioExcel } from '../../utils/relatorios/relatorioExcel';
import { baixarRelatorioPdf } from '../../utils/relatorios/relatorioPdf';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';
import { mensagemDeErro } from '../../utils/mensagemDeErro';

type ModoDePeriodo = 'semana' | 'mes' | 'ano' | 'livre';

interface RelatoriosPanelProps {
  company: Company;
  /** Sem permissão de ver valores, os relatórios com dinheiro ficam travados. */
  canViewValues: boolean;
  /**
   * As permissões `reports.exportPDF` e `reports.exportExcel` continuam valendo:
   * a aba Relatórios sumiu do menu em 12/09/2026, mas quem já tinha (ou não
   * tinha) o direito de exportar continua igual — a permissão não morreu junto
   * com a aba.
   */
  hasPermission: (permission: string) => boolean;
}

const TIPOS: Array<{ id: TipoRelatorio; nome: string; descricao: string; precisaValores: boolean }> = [
  { id: 'ponto', nome: 'Ponto', descricao: 'Dia a dia das batidas, horas, noturnas, intervalo e banco de horas. Sem dinheiro.', precisaValores: false },
  { id: 'financeiro', nome: 'Financeiro', descricao: 'Diárias, bonificações, descontos e o líquido — com os dias e horas trabalhadas.', precisaValores: true },
  { id: 'geral', nome: 'Geral', descricao: 'Os dois inteiros: a folha do ponto e a do financeiro, por pessoa.', precisaValores: true },
];

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function doisDigitos(n: number): string {
  return n.toString().padStart(2, '0');
}

function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

export const RelatoriosPanel: React.FC<RelatoriosPanelProps> = ({ company, canViewValues, hasPermission }) => {
  const hoje = getBrazilDate();
  const anoCorrente = Number(hoje.slice(0, 4));
  const mesCorrente = Number(hoje.slice(5, 7));

  const [tipo, setTipo] = useState<TipoRelatorio>('ponto');
  const [modo, setModo] = useState<ModoDePeriodo>('mes');
  const [ano, setAno] = useState(anoCorrente);
  const [mes, setMes] = useState(mesCorrente);
  const [semanaId, setSemanaId] = useState('');
  const [inicioLivre, setInicioLivre] = useState(`${anoCorrente}-${doisDigitos(mesCorrente)}-01`);
  const [fimLivre, setFimLivre] = useState(hoje);

  const [periodos, setPeriodos] = useState<PaymentPeriod[]>([]);
  const [funcionarios, setFuncionarios] = useState<Employee[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const [vinculo, setVinculo] = useState<EmploymentType>('all');
  const [funcao, setFuncao] = useState<FunctionRoleFilterValue>(FUNCTION_ROLE_ALL);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState<'pdf' | 'excel' | null>(null);

  // ─── Carga leve: quem existe e quais semanas existem ──────────────────────
  useEffect(() => {
    let cancelado = false;
    setCarregandoLista(true);
    setErroLista(null);

    Promise.all([getAllEmployees(undefined, company.id), getPaymentPeriods(company.id)])
      .then(([emps, pers]) => {
        if (cancelado) return;
        setFuncionarios(emps);
        setPeriodos(pers);
        // Começa com todo mundo marcado: o caso comum é o relatório do mês
        // inteiro, e obrigar a marcar 92 pessoas seria trabalho à toa.
        setMarcados(new Set(emps.map(e => e.id)));
        // A semana aberta é a que a pessoa quer 9 em 10 vezes.
        const aberta = pers.find(p => p.status !== 'paid') ?? pers[0];
        if (aberta) setSemanaId(aberta.id);
      })
      .catch(err => {
        console.error('Erro ao carregar a lista de funcionários/semanas:', err);
        if (!cancelado) setErroLista('Não consegui carregar a lista de funcionários. Tente de novo.');
      })
      .finally(() => { if (!cancelado) setCarregandoLista(false); });

    return () => { cancelado = true; };
  }, [company.id]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>([anoCorrente]);
    periodos.forEach(p => anos.add(Number(p.start_date.slice(0, 4))));
    return Array.from(anos).sort((a, b) => b - a);
  }, [periodos, anoCorrente]);

  /** O recorte escolhido, já em datas — é o que vai pro banco e pro papel. */
  const periodo = useMemo((): { inicio: string; fim: string; rotulo: string } => {
    if (modo === 'ano') {
      return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, rotulo: `Ano de ${ano}` };
    }
    if (modo === 'mes') {
      return {
        inicio: `${ano}-${doisDigitos(mes)}-01`,
        fim: ultimoDiaDoMes(ano, mes),
        rotulo: `${MESES[mes - 1]} de ${ano}`,
      };
    }
    if (modo === 'semana') {
      const p = periodos.find(x => x.id === semanaId);
      if (p) return { inicio: p.start_date, fim: p.end_date, rotulo: p.label || `${formatDateBR(p.start_date)} a ${formatDateBR(p.end_date)}` };
      return { inicio: hoje, fim: hoje, rotulo: 'Semana' };
    }
    return { inicio: inicioLivre, fim: fimLivre, rotulo: `${formatDateBR(inicioLivre)} a ${formatDateBR(fimLivre)}` };
  }, [modo, ano, mes, semanaId, periodos, inicioLivre, fimLivre, hoje]);

  /** Quem a lista mostra agora (função + vínculo + busca). */
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return funcionarios.filter(e => {
      if (vinculo !== 'all' && e.employment_type !== vinculo) return false;
      if (funcao !== FUNCTION_ROLE_ALL) {
        const temFuncao = !!e.function_role && e.function_role.trim() !== '';
        if (funcao === FUNCTION_ROLE_NONE ? temFuncao : e.function_role !== funcao) return false;
      }
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [funcionarios, vinculo, funcao, busca]);

  // Quem vai pro relatório: marcado E visível pelo filtro atual. Assim dá pra
  // misturar (marca os diaristas, troca pra carteira assinada, marca mais dois)
  // sem o filtro desmarcar ninguém — mesma regra do recibo em lote.
  const escolhidos = useMemo(() => visiveis.filter(e => marcados.has(e.id)), [visiveis, marcados]);

  const alternar = useCallback((id: string) => {
    setMarcados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }, []);

  const marcarTodosVisiveis = useCallback(() => {
    setMarcados(prev => {
      const novo = new Set(prev);
      const todosMarcados = visiveis.every(e => novo.has(e.id));
      visiveis.forEach(e => (todosMarcados ? novo.delete(e.id) : novo.add(e.id)));
      return novo;
    });
  }, [visiveis]);

  const tipoBloqueado = TIPOS.find(t => t.id === tipo)?.precisaValores && !canViewValues;
  const podePdf = hasPermission('reports.exportPDF');
  const podeExcel = hasPermission('reports.exportExcel');

  const gerar = useCallback(async (formato: 'pdf' | 'excel') => {
    if (tipoBloqueado) {
      toast.error('Você não tem permissão para ver valores em R$ — só o relatório de Ponto está liberado.');
      return;
    }
    if (formato === 'pdf' && !podePdf) {
      toast.error('Você não tem permissão para exportar em PDF.');
      return;
    }
    if (formato === 'excel' && !podeExcel) {
      toast.error('Você não tem permissão para exportar em planilha.');
      return;
    }
    if (escolhidos.length === 0) {
      toast.error('Marque pelo menos uma pessoa.');
      return;
    }
    if (periodo.inicio > periodo.fim) {
      toast.error('A data de início é depois da data final.');
      return;
    }

    setGerando(formato);
    try {
      const ids = new Set(escolhidos.map(e => e.id));

      const [pagamentos, pontos, erros] = await Promise.all([
        getPayments(periodo.inicio, periodo.fim, undefined, undefined, company.id),
        getAttendanceHistory(periodo.inicio, periodo.fim, undefined, undefined, undefined, company.id),
        getErrorRecords(periodo.inicio, periodo.fim, undefined, undefined, company.id),
      ]);
      const triagem = await getTriageDistributionsForEmployees(
        escolhidos.map(e => e.id), periodo.inicio, periodo.fim, company.id,
      );

      // O corte por pessoa é feito AQUI, não na busca: as funções do banco
      // filtram por UM funcionário só, e aqui são vários escolhidos a dedo.
      const financeiro = agregarFinanceiroPorPessoa(
        escolhidos,
        pagamentos.filter(p => ids.has(p.employee_id)),
        pontos.filter(a => ids.has(a.employee_id)),
        erros.filter(e => ids.has(e.employee_id)),
        triagem,
      );

      const relatorio = montarRelatorio({
        tipo,
        company,
        periodo,
        financeiro,
        attendances: pontos.filter(a => ids.has(a.employee_id)),
        emissionDate: hoje,
      });

      if (relatorio.pessoas.length === 0) {
        toast.error('Ninguém tem registro nesse período com esses filtros — o arquivo sairia vazio.');
        return;
      }

      if (formato === 'pdf') await baixarRelatorioPdf(relatorio);
      else baixarRelatorioExcel(relatorio);

      toast.success(
        `${relatorio.pessoas.length} ${relatorio.pessoas.length === 1 ? 'funcionário' : 'funcionários'} no relatório de ${periodo.rotulo}.`,
      );
    } catch (err) {
      console.error('Erro ao gerar o relatório:', err);
      toast.error(mensagemDeErro(err, 'Não consegui gerar o relatório. Tente de novo.'));
    } finally {
      setGerando(null);
    }
  }, [tipoBloqueado, podePdf, podeExcel, escolhidos, periodo, company, tipo, hoje]);

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every(e => marcados.has(e.id));

  return (
    <div className="space-y-4" data-testid="relatorios-panel">
      {/* ─── Tipo de relatório ─── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">O que você quer no relatório</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TIPOS.map(t => {
            const travado = t.precisaValores && !canViewValues;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                disabled={travado}
                data-testid={`tipo-${t.id}`}
                title={travado ? 'Precisa da permissão de ver valores em R$' : undefined}
                className={`text-left p-3 rounded-lg border-2 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed ${
                  tipo === t.id ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span className="block font-semibold text-gray-900">{t.nome}</span>
                <span className="block text-xs text-gray-600 mt-1">{t.descricao}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Período ─── */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['livre', 'Datas livres']] as Array<[ModoDePeriodo, string]>).map(([id, nome]) => (
            <button
              key={id}
              type="button"
              onClick={() => setModo(id)}
              data-testid={`modo-${id}`}
              className={`px-3 py-2 rounded-md text-sm min-h-[44px] ${
                modo === id ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {modo === 'semana' && (
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Semana</label>
              <select
                value={semanaId}
                onChange={e => setSemanaId(e.target.value)}
                data-testid="seletor-semana"
                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md text-sm"
              >
                {periodos.length === 0 && <option value="">Nenhuma semana cadastrada</option>}
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label || `${formatDateBR(p.start_date)} a ${formatDateBR(p.end_date)}`}
                    {p.status !== 'paid' ? ' — aberta' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(modo === 'mes' || modo === 'ano') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
              <select
                value={ano}
                onChange={e => setAno(Number(e.target.value))}
                data-testid="seletor-ano"
                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md text-sm"
              >
                {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}

          {modo === 'mes' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mês</label>
              <select
                value={mes}
                onChange={e => setMes(Number(e.target.value))}
                data-testid="seletor-mes"
                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md text-sm"
              >
                {MESES.map((nome, i) => <option key={nome} value={i + 1}>{nome}</option>)}
              </select>
            </div>
          )}

          {modo === 'livre' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
                <input
                  type="date" value={inicioLivre} onChange={e => setInicioLivre(e.target.value)}
                  data-testid="data-inicio"
                  className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Até</label>
                <input
                  type="date" value={fimLivre} onChange={e => setFimLivre(e.target.value)}
                  data-testid="data-fim"
                  className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md text-sm"
                />
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-gray-600" data-testid="periodo-escolhido">
          Vai sair: <b>{periodo.rotulo}</b> ({formatDateBR(periodo.inicio)} a {formatDateBR(periodo.fim)})
        </p>
      </div>

      {/* ─── Quem entra ─── */}
      <div className="border border-gray-200 rounded-lg">
        <div className="p-3 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <EmploymentTypeFilter value={vinculo} onChange={setVinculo} showLabel />
          <FunctionRoleFilter value={funcao} onChange={setFuncao} companyId={company.id} showLabel />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Procurar pessoa</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome do funcionário"
                data-testid="busca-funcionario"
                className="w-full pl-9 pr-3 py-2 min-h-[44px] border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        </div>

        <div className="p-3">
          {carregandoLista ? (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando funcionários…
            </p>
          ) : erroLista ? (
            <p className="text-sm text-red-600">{erroLista}</p>
          ) : visiveis.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum funcionário com esses filtros.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={marcarTodosVisiveis}
                  data-testid="marcar-todos"
                  className="text-sm text-green-700 hover:underline flex items-center gap-1 min-h-[44px]"
                >
                  {todosVisiveisMarcados ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  {todosVisiveisMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
                <span className="text-sm text-gray-600 flex items-center gap-1" data-testid="contagem-escolhidos">
                  <Users className="w-4 h-4" />
                  {escolhidos.length} de {visiveis.length} marcados
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto border border-gray-100 rounded divide-y divide-gray-100">
                {visiveis.map(e => (
                  <label key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcados.has(e.id)}
                      onChange={() => alternar(e.id)}
                      className="w-4 h-4"
                    />
                    <span className="flex-1 text-sm text-gray-800">{e.name}</span>
                    <span className="text-xs text-gray-500">{e.function_role || '—'}</span>
                    <span className="text-xs text-gray-400">{e.employment_type ?? '—'}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Baixar ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => gerar('pdf')}
          disabled={gerando !== null || carregandoLista || escolhidos.length === 0 || !!tipoBloqueado || !podePdf}
          title={!podePdf ? 'Você não tem permissão para exportar em PDF' : undefined}
          data-testid="baixar-pdf"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {gerando === 'pdf' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
          {gerando === 'pdf' ? 'Montando o PDF…' : 'Baixar PDF'}
        </button>
        <button
          type="button"
          onClick={() => gerar('excel')}
          disabled={gerando !== null || carregandoLista || escolhidos.length === 0 || !!tipoBloqueado || !podeExcel}
          title={!podeExcel ? 'Você não tem permissão para exportar em planilha' : undefined}
          data-testid="baixar-excel"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-md bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {gerando === 'excel' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
          {gerando === 'excel' ? 'Montando a planilha…' : 'Baixar planilha'}
        </button>
      </div>

      {tipoBloqueado && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          Este relatório mostra valores em R$ e você não tem essa permissão. O relatório de <b>Ponto</b> está liberado.
        </p>
      )}
    </div>
  );
};
