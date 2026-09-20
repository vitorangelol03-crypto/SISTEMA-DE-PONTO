/**
 * RESCISÃO — o acerto de contas, uma pessoa por vez (19/09/2026).
 *
 * Diferente do 13º e das Férias, que são listas: rescisão é sempre individual, e é o
 * documento mais caro que esta folha emite. Por isso a tela mostra a conta ABERTA, linha
 * por linha, antes de deixar gerar qualquer papel — e deixa **baixar** sem **registrar**,
 * para conferir à vontade.
 *
 * ## O que ela exige antes de calcular
 *
 * Data de admissão na ficha (sem ela não há tempo de casa, avos nem aviso prévio) e
 * salário preenchido. Faltando qualquer um, a tela diz o que falta em vez de mostrar
 * um número.
 *
 * ## O saldo do FGTS é digitado (decisão do Victor)
 *
 * O sistema não tem o histórico de depósitos — o FGTS só passou a ser calculado em
 * 18/09/2026. Estimar a multa seria inventar o número mais caro do acerto. Sem o saldo,
 * a linha da multa não sai, e o papel avisa.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, Save, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAllEmployees,
  getAttendanceHistory,
  getEmployeeVacationsOfEmployee,
  getPayrollConfig,
  getTabelasDeImposto,
  getRescisoes,
  registrarRescisao,
  type RescisaoRegistrada,
  type Company,
  type Employee,
  type Attendance,
} from '../../services/database';
import { CONFIGURACAO_DA_FOLHA_PADRAO } from '../../utils/folha/folhaCalc';
import {
  MOTIVOS,
  calcularRescisao,
  type MotivoDaRescisao,
  type RescisaoCalculada,
  type SituacaoDoAviso,
} from '../../utils/folha/rescisao';
import { downloadHoleritePdf } from '../../utils/holeritePdf';
import { moneyBRL } from '../../utils/moneyMask';
import { mensagemDeErro } from '../../utils/mensagemDeErro';
import { formatDateBR, getBrazilDate } from '../../utils/dateUtils';

interface Props {
  company: Company;
  userId: string;
  canViewValues: boolean;
  hasPermission: (permission: string) => boolean;
}

const AVISOS: Array<{ id: SituacaoDoAviso; nome: string; ajuda: string }> = [
  { id: 'indenizado', nome: 'Indenizado', ajuda: 'A pessoa não trabalha o aviso e recebe por ele — e o tempo conta para 13º e férias.' },
  { id: 'trabalhado', nome: 'Trabalhado', ajuda: 'A pessoa cumpriu o aviso trabalhando; já foi pago no salário.' },
  { id: 'dispensado', nome: 'Dispensado', ajuda: 'Ninguém paga nem cumpre.' },
];

export const RescisaoPanel: React.FC<Props> = ({ company, userId, canViewValues, hasPermission }) => {
  const hoje = getBrazilDate();
  const [busca, setBusca] = useState('');
  const [pessoas, setPessoas] = useState<Employee[] | null>(null);
  const [escolhida, setEscolhida] = useState<Employee | null>(null);

  const [motivo, setMotivo] = useState<MotivoDaRescisao>('sem-justa-causa');
  const [aviso, setAviso] = useState<SituacaoDoAviso>('indenizado');
  const [dataDeSaida, setDataDeSaida] = useState(hoje);
  const [saldoFgts, setSaldoFgts] = useState('');

  const [acerto, setAcerto] = useState<RescisaoCalculada | null>(null);
  /** As rescisões já emitidas na empresa — a lista de onde sai a 2ª via. */
  const [geradas, setGeradas] = useState<RescisaoRegistrada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState<'pdf' | 'registrar' | null>(null);

  const podeRegistrar = hasPermission('employees.editPayroll');

  const carregarPessoas = useCallback(async () => {
    try {
      setPessoas(await getAllEmployees('Carteira Assinada', company.id));
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar a lista de funcionários.'));
    }
  }, [company.id]);

  const carregarGeradas = useCallback(async () => {
    try {
      setGeradas(await getRescisoes(company.id));
    } catch {
      // A lista de 2ª via é conforto: se ela falhar, a tela principal continua de pé.
      setGeradas([]);
    }
  }, [company.id]);

  React.useEffect(() => { void carregarPessoas(); }, [carregarPessoas]);
  React.useEffect(() => { void carregarGeradas(); }, [carregarGeradas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = pessoas ?? [];
    return q ? lista.filter(e => e.name.toLowerCase().includes(q)) : lista;
  }, [pessoas, busca]);

  /** O que falta na ficha para a conta existir. Vazio = pode calcular. */
  const faltando = useMemo(() => {
    if (!escolhida) return [];
    const falta: string[] = [];
    if (!(escolhida.hire_date ?? '').trim()) falta.push('a data de admissão');
    if (!(Number(escolhida.monthly_salary ?? 0) > 0)) falta.push('o salário');
    return falta;
  }, [escolhida]);

  const calcular = useCallback(async () => {
    if (!escolhida || faltando.length > 0) return;
    setCarregando(true);
    setErro(null);
    setAcerto(null);
    try {
      const ano = Number(dataDeSaida.slice(0, 4));
      const [pontos, feriasGozadas, config, tabelas] = await Promise.all([
        getAttendanceHistory(escolhida.hire_date!, dataDeSaida, escolhida.id, undefined, undefined, company.id),
        getEmployeeVacationsOfEmployee(escolhida.id).catch(() => []),
        getPayrollConfig(company.id, ano).catch(() => CONFIGURACAO_DA_FOLHA_PADRAO),
        getTabelasDeImposto(ano).catch(() => ({ inss: null, irrf: null, confirmadas: false })),
      ]);

      const faltas = (pontos as Attendance[])
        .filter(p => p.status === 'absent' && !(p as unknown as { absence_justified?: boolean }).absence_justified)
        .map(p => p.date);

      setAcerto(calcularRescisao({
        salarioMensal: Number(escolhida.monthly_salary),
        admissao: escolhida.hire_date!,
        dataDeSaida,
        motivo,
        aviso,
        saldoFgts: Number(saldoFgts.replace(/\./g, '').replace(',', '.')) || 0,
        faltasInjustificadas: faltas,
        feriasGozadas,
        dependentes: escolhida.family_allowance_children ?? 0,
        percentualFgts: config.percentualFgts,
        fgtsAtivo: escolhida.fgts_enabled ?? false,
        tabelaInss: tabelas.inss ?? undefined,
        tabelaIrrf: tabelas.irrf ?? undefined,
        tabelasConfirmadas: tabelas.confirmadas,
      }));
    } catch (err) {
      console.error('Erro ao calcular a rescisão:', err);
      setErro(mensagemDeErro(err, 'Não consegui montar o acerto. Tente de novo.'));
    } finally {
      setCarregando(false);
    }
  }, [escolhida, faltando, dataDeSaida, motivo, aviso, saldoFgts, company.id]);

  const papel = useCallback(() => ({
    company: { name: company.display_name || company.legal_name || 'Empresa', cnpj: company.cnpj || undefined },
    employee: {
      name: escolhida!.name,
      cpf: escolhida!.cpf,
      employmentType: escolhida!.employment_type || undefined,
      functionRole: escolhida!.function_role || undefined,
      hireDate: escolhida!.hire_date || undefined,
    },
    period: { start: escolhida!.hire_date!, end: dataDeSaida },
    payments: [],
    errorDiscount: 0,
    triageDiscount: 0,
    totalDailyRate: 0,
    totalBonusB: 0,
    totalBonusC1: 0,
    totalBonusC2: 0,
    totalGross: 0,
    totalNet: 0,
    rescisao: acerto!,
  }), [company, escolhida, dataDeSaida, acerto]);

  const baixar = useCallback(async () => {
    if (!acerto || !escolhida) return;
    setTrabalhando('pdf');
    try {
      await downloadHoleritePdf(
        papel(),
        `Rescisao_${escolhida.name.replace(/\s+/g, '_')}_${dataDeSaida}.pdf`,
      );
      toast.success('Termo de rescisão baixado.');
    } catch (err) {
      console.error('Erro ao gerar o termo:', err);
      toast.error(mensagemDeErro(err, 'Não consegui gerar o termo.'));
    } finally {
      setTrabalhando(null);
    }
  }, [acerto, escolhida, papel, dataDeSaida]);

  /**
   * A 2ª VIA: relê o acerto gravado e imprime, sem recalcular nada.
   *
   * Numa rescisão isto não é conforto. Recalcular hoje um acerto de meses atrás — com
   * outro salário na ficha, outra tabela de imposto, outras férias lançadas — daria um
   * papel diferente do que a pessoa assinou. Duas vias divergentes do mesmo acerto é
   * exatamente o que não pode existir num documento que vale num processo.
   */
  const reimprimir = useCallback(async (r: RescisaoRegistrada) => {
    const guardado = r.papel as RescisaoCalculada | undefined;
    const pessoa = (pessoas ?? []).find(p => p.id === r.employee_id);
    if (!guardado || !guardado.linhas) {
      toast.error('Esta rescisão foi registrada antes da 2ª via existir — não dá para reimprimir fiel.');
      return;
    }
    setTrabalhando('pdf');
    try {
      await downloadHoleritePdf({
        company: { name: company.display_name || company.legal_name || 'Empresa', cnpj: company.cnpj || undefined },
        employee: {
          name: pessoa?.name ?? 'Funcionário',
          cpf: pessoa?.cpf ?? null,
          employmentType: pessoa?.employment_type || undefined,
          functionRole: pessoa?.function_role || undefined,
          hireDate: pessoa?.hire_date || undefined,
        },
        period: { start: pessoa?.hire_date ?? r.data_de_saida, end: r.data_de_saida },
        payments: [],
        errorDiscount: 0,
        triageDiscount: 0,
        totalDailyRate: 0,
        totalBonusB: 0,
        totalBonusC1: 0,
        totalBonusC2: 0,
        totalGross: 0,
        totalNet: 0,
        rescisao: guardado,
        segundaVia: true,
      }, `Rescisao_2via_${(pessoa?.name ?? 'funcionario').replace(/\s+/g, '_')}_${r.data_de_saida}.pdf`);
      toast.success('2ª via gerada com os valores do acerto original.');
    } catch (err) {
      console.error('Erro ao reimprimir a rescisão:', err);
      toast.error(mensagemDeErro(err, 'Não consegui gerar a 2ª via.'));
    } finally {
      setTrabalhando(null);
    }
  }, [company, pessoas]);

  const registrar = useCallback(async () => {
    if (!acerto || !escolhida) return;
    if (!podeRegistrar) {
      toast.error('Você não tem permissão para lançar rescisão (employees.editPayroll).');
      return;
    }
    if (!window.confirm(
      `Registrar o desligamento de ${escolhida.name} em ${formatDateBR(dataDeSaida)}?\n\n`
      + 'A ficha passa a ter a data de saída, e o acerto fica guardado para reimprimir. '
      + 'A pessoa continua aparecendo nas telas.'
    )) return;

    setTrabalhando('registrar');
    try {
      await registrarRescisao({
        employee_id: escolhida.id,
        company_id: company.id,
        data_de_saida: dataDeSaida,
        motivo,
        aviso,
        dias_de_aviso: acerto.diasDeAviso,
        anos_de_casa: acerto.anosDeCasa,
        saldo_de_salario: acerto.saldoDeSalario,
        aviso_previo: acerto.avisoPrevio,
        aviso_descontado: acerto.avisoDescontado,
        decimo_proporcional: acerto.decimoProporcional,
        ferias_vencidas: acerto.feriasVencidas,
        terco_vencidas: acerto.tercoDasVencidas,
        ferias_proporcionais: acerto.feriasProporcionais,
        terco_proporcionais: acerto.tercoDasProporcionais,
        saldo_fgts_informado: Number(saldoFgts.replace(/\./g, '').replace(',', '.')) || 0,
        multa_fgts: acerto.multaFgts,
        inss: acerto.inss,
        irrf: acerto.irrf,
        inss_decimo: acerto.inssDoDecimo,
        irrf_decimo: acerto.irrfDoDecimo,
        total_proventos: acerto.totalProventos,
        total_descontos: acerto.totalDescontos,
        liquido: acerto.liquido,
        // O acerto INTEIRO como está saindo: a 2ª via relê isto, nunca recalcula.
        papel: acerto,
        created_by: userId,
      });
      toast.success('Desligamento registrado e acerto guardado.');
      await carregarPessoas();
      await carregarGeradas();
    } catch (err) {
      console.error('Erro ao registrar a rescisão:', err);
      toast.error(mensagemDeErro(err, 'Não consegui registrar. Nada foi perdido.'));
    } finally {
      setTrabalhando(null);
    }
  }, [acerto, escolhida, podeRegistrar, dataDeSaida, motivo, aviso, saldoFgts, company.id, userId, carregarPessoas, carregarGeradas]);

  return (
    <div className="space-y-4" data-testid="rescisao-panel">
      {/* ─── Quem ─── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Quem está saindo</label>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome…"
            data-testid="rescisao-busca"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
          />
        </div>
        {busca.trim() && (
          <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
            {visiveis.length === 0 && (
              <p className="p-3 text-sm text-gray-500">Ninguém de carteira assinada com esse nome.</p>
            )}
            {visiveis.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => { setEscolhida(e); setBusca(''); setAcerto(null); }}
                data-testid="rescisao-pessoa"
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 min-h-[44px]"
              >
                <span className="font-medium text-gray-900">{e.name}</span>
                {e.termination_date && (
                  <span className="ml-2 text-xs text-red-700">já desligada em {formatDateBR(e.termination_date)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {escolhida && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3" data-testid="rescisao-escolhida">
          <p className="text-sm font-semibold text-gray-900">{escolhida.name}</p>
          <p className="text-xs text-gray-600">
            Admissão: {escolhida.hire_date ? formatDateBR(escolhida.hire_date) : '—'} ·{' '}
            Salário: {moneyBRL(Number(escolhida.monthly_salary ?? 0), canViewValues)}
          </p>
          {faltando.length > 0 && (
            <p className="mt-2 text-sm text-red-700" data-testid="rescisao-faltando">
              Falta {faltando.join(' e ')} na ficha — sem isso não dá para calcular o acerto.
            </p>
          )}
        </div>
      )}

      {/* ─── Como ─── */}
      {escolhida && faltando.length === 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da saída</label>
              <select
                value={motivo}
                onChange={e => { setMotivo(e.target.value as MotivoDaRescisao); setAcerto(null); }}
                data-testid="rescisao-motivo"
                className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
              >
                {MOTIVOS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Último dia trabalhado</label>
              <input
                type="date"
                value={dataDeSaida}
                onChange={e => { setDataDeSaida(e.target.value); setAcerto(null); }}
                data-testid="rescisao-data"
                className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aviso prévio</label>
              <select
                value={aviso}
                onChange={e => { setAviso(e.target.value as SituacaoDoAviso); setAcerto(null); }}
                data-testid="rescisao-aviso"
                className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
              >
                {AVISOS.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">{AVISOS.find(a => a.id === aviso)!.ajuda}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Saldo do FGTS depositado
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={saldoFgts}
                onChange={e => { setSaldoFgts(e.target.value); setAcerto(null); }}
                placeholder="Ex.: 8500,00"
                data-testid="rescisao-fgts"
                className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Do extrato da Caixa. O sistema não tem o histórico de depósitos — sem este
                número a multa não é calculada.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={calcular}
            disabled={carregando}
            data-testid="rescisao-calcular"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
          >
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{carregando ? 'Montando o acerto…' : 'Calcular o acerto'}</span>
          </button>
        </>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="rescisao-erro">
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      )}

      {/* ─── A conta, aberta ─── */}
      {acerto && (
        <>
          {acerto.multaSemSaldoInformado && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2" data-testid="rescisao-sem-fgts">
              <AlertTriangle className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-900">
                <strong>A multa do FGTS não entrou na conta.</strong> Este motivo dá direito a ela,
                mas o saldo depositado não foi informado — preencha o campo acima.
              </p>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Verba</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-700">Ref.</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Provento</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Desconto</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {acerto.linhas.map((l, i) => (
                  <tr key={`${l.descricao}-${i}`} data-testid="rescisao-linha">
                    <td className="px-4 py-2 text-gray-900">{l.descricao}</td>
                    <td className="px-4 py-2 text-center text-gray-500 text-xs">{l.referencia ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-green-700">
                      {l.provento > 0 ? moneyBRL(l.provento, canViewValues) : ''}
                    </td>
                    <td className="px-4 py-2 text-right text-red-700">
                      {l.desconto > 0 ? moneyBRL(l.desconto, canViewValues) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 font-semibold text-gray-900" colSpan={2}>
                    {acerto.anosDeCasa} ano{acerto.anosDeCasa === 1 ? '' : 's'} de casa ·
                    aviso de {acerto.diasDeAviso} dias · FGTS do mês {moneyBRL(acerto.fgtsDoMes, canViewValues)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-green-700">
                    {moneyBRL(acerto.totalProventos, canViewValues)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-red-700">
                    {moneyBRL(acerto.totalDescontos, canViewValues)}
                  </td>
                </tr>
                <tr className="bg-green-50">
                  <td className="px-4 py-3 font-bold text-gray-900" colSpan={3}>LÍQUIDO A RECEBER</td>
                  <td className="px-4 py-3 text-right font-bold text-lg text-green-700" data-testid="rescisao-liquido">
                    {moneyBRL(acerto.liquido, canViewValues)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={baixar}
              disabled={trabalhando !== null}
              data-testid="rescisao-baixar"
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 min-h-[44px]"
            >
              {trabalhando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Baixar o termo</span>
            </button>

            <button
              type="button"
              onClick={registrar}
              disabled={trabalhando !== null || !podeRegistrar}
              title={!podeRegistrar ? 'Precisa da permissão de editar folha (employees.editPayroll)' : ''}
              data-testid="rescisao-registrar"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {trabalhando === 'registrar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Registrar o desligamento</span>
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Baixar não grava nada. Registrar carimba a data de saída na ficha e guarda o acerto
            para reimprimir depois — a pessoa continua aparecendo nas telas.
          </p>
        </>
      )}

      {/* ─── As rescisões já emitidas, de onde sai a 2ª via ─── */}
      {geradas.length > 0 && (
        <details className="text-sm border-t border-gray-200 pt-4" data-testid="rescisao-geradas">
          <summary className="cursor-pointer text-gray-700 hover:text-gray-900 font-medium">
            {geradas.length} {geradas.length === 1 ? 'rescisão já emitida' : 'rescisões já emitidas'} — tirar 2ª via
          </summary>
          <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-md">
            {geradas.map(r => {
              const pessoa = (pessoas ?? []).find(p => p.id === r.employee_id);
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <span className="font-medium text-gray-900">{pessoa?.name ?? 'Funcionário'}</span>
                    <span className="block text-xs text-gray-600">
                      {formatDateBR(r.data_de_saida)} ·{' '}
                      {MOTIVOS.find(m => m.id === r.motivo)?.nome ?? r.motivo} ·{' '}
                      {moneyBRL(Number(r.liquido), canViewValues)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => reimprimir(r)}
                    disabled={trabalhando !== null}
                    data-testid="rescisao-reimprimir"
                    className="text-xs text-blue-700 underline hover:text-blue-900 disabled:opacity-50 shrink-0"
                  >
                    2ª via
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            A 2ª via relê o acerto que foi gravado — não recalcula. Se o salário ou a tabela de
            imposto mudarem depois, o papel continua o mesmo que a pessoa assinou.
          </p>
        </details>
      )}
    </div>
  );
};
