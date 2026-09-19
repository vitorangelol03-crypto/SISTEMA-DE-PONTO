/**
 * 13º SALÁRIO — a tela (19/09/2026).
 *
 * Fica dentro do Financeiro, ao lado dos Relatórios, porque é lá que o dinheiro mora.
 * O caminho é: escolher o ano, escolher a parcela, conferir a lista, baixar os recibos
 * e registrar o que foi pago.
 *
 * ## Por que BAIXAR e REGISTRAR são dois botões
 *
 * Baixar é seguro: gera papel e não grava nada, então dá pra conferir à vontade antes.
 * Registrar grava — e é o que faz a 2ª parcela saber quanto a 1ª pagou. Juntar os dois
 * num clique só faria uma conferência virar pagamento sem querer.
 *
 * ## Por que os dados só são buscados no clique
 *
 * O 13º precisa do PONTO DO ANO INTEIRO de todo mundo (para as faltas e a média do
 * adicional noturno). Carregar isso ao abrir a aba deixaria o Financeiro pesado para,
 * na maioria das vezes, jogar fora — é a mesma escolha do painel de Relatórios.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Calendar, Download, Loader2, RefreshCw, Save, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAllEmployees,
  getAttendanceHistory,
  getPayrollConfig,
  getTabelasDeImposto,
  getDecimoTerceiroDoAno,
  registrarDecimoTerceiro,
  type Company,
  type Employee,
  type Attendance,
  type DecimoTerceiroPago,
} from '../../services/database';
import { CONFIGURACAO_DA_FOLHA_PADRAO } from '../../utils/folha/folhaCalc';
import { decimoDaPessoa } from '../../utils/folha/decimoDaPessoa';
import type { DecimoCalculado, ParcelaDoDecimo } from '../../utils/folha/decimoTerceiro';
import { generateLoteHoleritePdf } from '../../utils/holeritePdf';
import { moneyBRL } from '../../utils/moneyMask';
import { mensagemDeErro } from '../../utils/mensagemDeErro';
import { getBrazilDate } from '../../utils/dateUtils';

interface Props {
  company: Company;
  userId: string;
  canViewValues: boolean;
  hasPermission: (permission: string) => boolean;
}

/** Uma pessoa na lista, já com a conta feita. */
interface LinhaDoDecimo {
  employee: Employee;
  decimo?: DecimoCalculado;
  motivo?: 'nao-e-mensalista' | 'sem-salario' | 'sem-avos';
  /** A parcela desta tela, se já foi registrada antes. */
  jaRegistrado?: DecimoTerceiroPago;
  /** O que a 1ª parcela pagou (usado pela 2ª). */
  adiantamentoPago: number;
}

const PARCELAS: Array<{ id: ParcelaDoDecimo; nome: string; ajuda: string }> = [
  { id: 'primeira', nome: '1ª parcela', ajuda: 'Adiantamento até 30/11 — metade do 13º, sem nenhum desconto.' },
  { id: 'segunda', nome: '2ª parcela', ajuda: 'Até 20/12 — desconta INSS e IR do 13º inteiro e abate o adiantamento.' },
  { id: 'unica', nome: 'Parcela única', ajuda: 'Tudo de uma vez, com INSS e IR descontados no mesmo papel.' },
];

const MOTIVO_TEXTO: Record<NonNullable<LinhaDoDecimo['motivo']>, string> = {
  'nao-e-mensalista': 'Diarista — o 13º não sai por aqui',
  'sem-salario': 'Sem salário na ficha',
  'sem-avos': 'Sem nenhum mês completo no ano',
};

export const DecimoTerceiroPanel: React.FC<Props> = ({ company, userId, canViewValues, hasPermission }) => {
  const hoje = getBrazilDate();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [parcela, setParcela] = useState<ParcelaDoDecimo>('unica');
  const [linhas, setLinhas] = useState<LinhaDoDecimo[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState<'pdf' | 'registrar' | null>(null);

  const podeRegistrar = hasPermission('employees.editPayroll');

  const comDireito = useMemo(
    () => (linhas ?? []).filter(l => l.decimo && l.decimo.bruto > 0),
    [linhas],
  );
  const semDireito = useMemo(() => (linhas ?? []).filter(l => !l.decimo), [linhas]);

  const calcular = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const inicio = `${ano}-01-01`;
      const fim = `${ano}-12-31`;

      const [pessoas, pontos, config, tabelas, jaPagos] = await Promise.all([
        getAllEmployees('Carteira Assinada', company.id),
        getAttendanceHistory(inicio, fim, undefined, undefined, undefined, company.id),
        getPayrollConfig(company.id, ano).catch(() => CONFIGURACAO_DA_FOLHA_PADRAO),
        getTabelasDeImposto(ano).catch(() => ({ inss: null, irrf: null, confirmadas: false })),
        getDecimoTerceiroDoAno(company.id, ano).catch(() => [] as DecimoTerceiroPago[]),
      ]);

      const pontoPorPessoa = new Map<string, Attendance[]>();
      for (const p of pontos) {
        const lista = pontoPorPessoa.get(p.employee_id);
        if (lista) lista.push(p);
        else pontoPorPessoa.set(p.employee_id, [p]);
      }

      const montadas: LinhaDoDecimo[] = pessoas.map(employee => {
        const daPessoa = jaPagos.filter(r => r.employee_id === employee.id);
        // O adiantamento vem do que FOI PAGO, nunca de uma conta refeita.
        const adiantamentoPago = daPessoa.find(r => r.parcela === 'primeira')?.valor ?? 0;
        const r = decimoDaPessoa({
          ficha: employee,
          ano,
          parcela,
          pontos: pontoPorPessoa.get(employee.id) ?? [],
          config,
          tabelas,
          jaPagoNaPrimeira: adiantamentoPago,
        });
        return {
          employee,
          decimo: r.decimo,
          motivo: r.motivo,
          jaRegistrado: daPessoa.find(x => x.parcela === parcela),
          adiantamentoPago,
        };
      });

      montadas.sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'pt-BR'));
      setLinhas(montadas);
    } catch (err) {
      console.error('Erro ao calcular o 13º:', err);
      setErro(mensagemDeErro(err, 'Não consegui montar o 13º. Tente de novo.'));
      setLinhas(null);
    } finally {
      setCarregando(false);
    }
  }, [ano, parcela, company.id]);

  const baixarRecibos = useCallback(async () => {
    if (comDireito.length === 0) return;
    setTrabalhando('pdf');
    try {
      const lote = comDireito.map(l => ({
        company: { name: company.display_name || company.legal_name || 'Empresa', cnpj: company.cnpj || undefined },
        employee: {
          name: l.employee.name,
          cpf: l.employee.cpf,
          employmentType: l.employee.employment_type || undefined,
          functionRole: l.employee.function_role || undefined,
          hireDate: l.employee.hire_date || undefined,
        },
        period: { start: `${ano}-01-01`, end: `${ano}-12-31` },
        payments: [],
        errorDiscount: 0,
        triageDiscount: 0,
        totalDailyRate: 0,
        totalBonusB: 0,
        totalBonusC1: 0,
        totalBonusC2: 0,
        totalGross: 0,
        totalNet: 0,
        decimo: l.decimo,
      }));

      const blob = await generateLoteHoleritePdf(lote);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `13o_${PARCELAS.find(p => p.id === parcela)!.nome.replace(/\s+/g, '_')}_${ano}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${lote.length} ${lote.length === 1 ? 'recibo' : 'recibos'} de 13º — um por folha.`);
    } catch (err) {
      console.error('Erro ao gerar os recibos de 13º:', err);
      toast.error(mensagemDeErro(err, 'Não consegui gerar os recibos.'));
    } finally {
      setTrabalhando(null);
    }
  }, [comDireito, company, ano, parcela]);

  const registrar = useCallback(async () => {
    if (comDireito.length === 0) return;
    if (!podeRegistrar) {
      toast.error('Você não tem permissão para lançar 13º (employees.editPayroll).');
      return;
    }
    const jaTem = comDireito.filter(l => l.jaRegistrado).length;
    const aviso = jaTem > 0
      ? `\n\n${jaTem} ${jaTem === 1 ? 'pessoa já tem' : 'pessoas já têm'} esta parcela registrada — o valor será REESCRITO com a conta de agora.`
      : '';
    if (!window.confirm(
      `Registrar a ${PARCELAS.find(p => p.id === parcela)!.nome} de ${ano} para ${comDireito.length} `
      + `${comDireito.length === 1 ? 'pessoa' : 'pessoas'}?${aviso}`
    )) return;

    setTrabalhando('registrar');
    try {
      for (const l of comDireito) {
        const d = l.decimo!;
        await registrarDecimoTerceiro({
          employee_id: l.employee.id,
          company_id: company.id,
          ano,
          parcela,
          avos: d.avos,
          base: d.base,
          bruto: d.bruto,
          inss: d.inss,
          irrf: d.irrf,
          fgts: d.fgts,
          adiantamento: d.adiantamento,
          valor: d.valor,
          pago_em: hoje,
          created_by: userId,
        });
      }
      toast.success(`${comDireito.length} ${comDireito.length === 1 ? 'parcela registrada' : 'parcelas registradas'}.`);
      await calcular();
    } catch (err) {
      console.error('Erro ao registrar o 13º:', err);
      toast.error(mensagemDeErro(err, 'Não consegui registrar. Nada foi perdido — confira e tente de novo.'));
    } finally {
      setTrabalhando(null);
    }
  }, [comDireito, podeRegistrar, parcela, ano, company.id, hoje, userId, calcular]);

  const totalDaParcela = comDireito.reduce((s, l) => s + (l.decimo?.valor ?? 0), 0);
  const totalFgts = comDireito.reduce((s, l) => s + (l.decimo?.fgts ?? 0), 0);
  const tabelasNaoConferidas = comDireito.some(l => l.decimo && !l.decimo.tabelasConfirmadas && (l.decimo.inss > 0 || l.decimo.irrf > 0));

  return (
    <div className="space-y-4" data-testid="decimo-panel">
      {/* ─── Ano e parcela ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ano do 13º</label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="number"
              min={2020}
              max={2100}
              value={ano}
              onChange={e => { setAno(Number(e.target.value)); setLinhas(null); }}
              data-testid="decimo-ano"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Qual parcela</label>
          <div className="flex flex-wrap gap-2">
            {PARCELAS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setParcela(p.id); setLinhas(null); }}
                title={p.ajuda}
                data-testid={`parcela-${p.id}`}
                className={`px-3 py-2 rounded-md border-2 text-sm min-h-[44px] transition-colors ${
                  parcela === p.id ? 'border-green-600 bg-green-50 font-semibold' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-600" data-testid="decimo-ajuda">
        {PARCELAS.find(p => p.id === parcela)!.ajuda}
      </p>

      <button
        type="button"
        onClick={calcular}
        disabled={carregando}
        data-testid="decimo-calcular"
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
      >
        {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        <span>{carregando ? 'Montando…' : 'Calcular o 13º do ano'}</span>
      </button>

      {/* ─── Erro ─── */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" data-testid="decimo-erro">
          <p className="text-sm text-red-800">{erro}</p>
        </div>
      )}

      {/* ─── Vazio ─── */}
      {linhas !== null && comDireito.length === 0 && !erro && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center" data-testid="decimo-vazio">
          <Users className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            Ninguém tem 13º a receber em {ano}. Carteira assinada com salário preenchido na ficha é o que entra aqui.
          </p>
        </div>
      )}

      {/* ─── A lista ─── */}
      {comDireito.length > 0 && (
        <>
          {tabelasNaoConferidas && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3" data-testid="decimo-em-conferencia">
              <p className="text-sm text-yellow-900">
                <strong>Valores em conferência.</strong> As tabelas de INSS e IR de {ano} ainda não foram
                marcadas como conferidas com a contabilidade — os recibos saem com essa tarja.
              </p>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Funcionário</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-700">Avos</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">13º bruto</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Descontos</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Esta parcela</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-700">Registrado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {comDireito.map(l => (
                  <tr key={l.employee.id} data-testid="decimo-linha">
                    <td className="px-4 py-2">
                      <span className="font-medium text-gray-900">{l.employee.name}</span>
                      {l.decimo!.parcelaNegativa && (
                        <span className="block text-xs text-red-600">
                          Negativa: o adiantamento pago passou do 13º de agora.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-gray-700">{l.decimo!.avos}/12</td>
                    <td className="px-4 py-2 text-right text-gray-700">{moneyBRL(l.decimo!.bruto, canViewValues)}</td>
                    <td className="px-4 py-2 text-right text-gray-700">
                      {l.decimo!.totalDescontos > 0 ? `−${moneyBRL(l.decimo!.totalDescontos, canViewValues)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">
                      {moneyBRL(l.decimo!.valor, canViewValues)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {l.jaRegistrado ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {l.jaRegistrado.pago_em.split('-').reverse().join('/')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 font-semibold text-gray-900" colSpan={4}>
                    {comDireito.length} {comDireito.length === 1 ? 'pessoa' : 'pessoas'} · FGTS da empresa: {moneyBRL(totalFgts, canViewValues)}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-green-700" data-testid="decimo-total">
                    {moneyBRL(totalDaParcela, canViewValues)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={baixarRecibos}
              disabled={trabalhando !== null}
              data-testid="decimo-baixar"
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 min-h-[44px]"
            >
              {trabalhando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Baixar os recibos</span>
            </button>

            <button
              type="button"
              onClick={registrar}
              disabled={trabalhando !== null || !podeRegistrar}
              title={!podeRegistrar ? 'Precisa da permissão de editar folha (employees.editPayroll)' : ''}
              data-testid="decimo-registrar"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {trabalhando === 'registrar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Registrar como pago</span>
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Baixar não grava nada — dá pra conferir à vontade. Registrar é o que faz a 2ª parcela
            saber quanto a 1ª pagou.
          </p>
        </>
      )}

      {/* ─── Quem ficou de fora, e por quê ─── */}
      {semDireito.length > 0 && (
        <details className="text-sm" data-testid="decimo-fora">
          <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
            {semDireito.length} {semDireito.length === 1 ? 'pessoa ficou' : 'pessoas ficaram'} de fora — ver por quê
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {semDireito.map(l => (
              <li key={l.employee.id} className="text-gray-600">
                <span className="font-medium text-gray-800">{l.employee.name}</span>
                {' — '}
                {MOTIVO_TEXTO[l.motivo ?? 'sem-salario']}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
