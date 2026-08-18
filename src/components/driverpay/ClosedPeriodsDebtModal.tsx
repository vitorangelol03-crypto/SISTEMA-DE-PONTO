import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listClosedPeriodsDebt, recordCarryover, type DriverPaymentPeriod,
} from '../../services/driverPay';
import type { SaldoQuinzenaFechada } from '../../utils/descontoSaldo';
import {
  chaveLinha, origensDistintas, filtrarPorOrigem, linhasSelecionadasVisiveis,
  todasVisiveisSelecionadas, alternarTodosVisiveis, alternarUma,
} from '../../utils/closedPeriodsDebtScope';
import { ModalShell } from './ModalShell';
import { formatBRL } from './driverPayShared';

interface ClosedPeriodsDebtModalProps {
  companyId: string;
  periods: readonly DriverPaymentPeriod[];
  userId: string;
  onClose: () => void;
  /** Chamado depois de migrar com sucesso, pra tela de trás recarregar (livro-caixa/rows). */
  onMigrated: () => void | Promise<void>;
}

/**
 * "Quem ficou devendo depois que a quinzena fechou", com o botão de migrar (15/08/2026,
 * sub-fase B do pedido do Victor "jogar pra próxima quinzena"). A sub-fase A (14/08) só
 * mostrava o buraco; agora dá pra escolher pra qual quinzena aberta cada saldo vai.
 */
export const ClosedPeriodsDebtModal: React.FC<ClosedPeriodsDebtModalProps> = ({
  companyId, periods, userId, onClose, onMigrated,
}) => {
  const [rows, setRows] = useState<SaldoQuinzenaFechada[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [destino, setDestino] = useState<Record<string, string>>({});
  const [migrando, setMigrando] = useState<string | null>(null);

  // Migração em massa (18/08/2026, pedido do Victor): filtra por quinzena de
  // origem + seleciona vários de uma vez pra migrar todos pro mesmo destino.
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [destinoMassa, setDestinoMassa] = useState('');
  const [migrandoMassa, setMigrandoMassa] = useState(false);

  const closedCount = useMemo(() => periods.filter((p) => p.status === 'concluido').length, [periods]);
  const openPeriods = useMemo(() => periods.filter((p) => p.status === 'aberto'), [periods]);

  const recarregar = async () => {
    setLoading(true);
    try {
      setRows(await listClosedPeriodsDebt(companyId, periods));
    } catch (e) {
      console.error('Erro ao apurar saldo devedor de quinzenas fechadas:', e);
      toast.error('Erro ao apurar saldo devedor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    listClosedPeriodsDebt(companyId, periods)
      .then((res) => { if (active) setRows(res); })
      .catch((e) => {
        console.error('Erro ao apurar saldo devedor de quinzenas fechadas:', e);
        if (active) toast.error('Erro ao apurar saldo devedor');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, periods]);

  const chave = chaveLinha;

  // Quinzenas de origem distintas presentes na lista, na ordem em que aparecem.
  const origensFechadas = useMemo(() => origensDistintas(rows ?? []), [rows]);

  const filteredRows = useMemo(
    () => filtrarPorOrigem(rows ?? [], filtroOrigem),
    [rows, filtroOrigem],
  );

  const total = useMemo(() => filteredRows.reduce((s, r) => s + r.saldo, 0), [filteredRows]);

  // "Selecionar todos" só marca quem está VISÍVEL (respeitando o filtro de origem) —
  // mesma regra do Reset Geral e da Bonificação: nunca migra quem não está na tela.
  const todosVisiveisSelecionados = todasVisiveisSelecionadas(filteredRows, selecionados);

  const toggleTodosVisiveis = () => {
    setSelecionados((prev) => alternarTodosVisiveis(filteredRows, prev));
  };

  const toggleUm = (r: SaldoQuinzenaFechada) => {
    setSelecionados((prev) => alternarUma(r, prev));
  };

  // Recalculado na hora de migrar (não guardado à parte) — se o filtro mudou depois
  // da seleção, só migra quem ainda está visível AGORA, pela mesma regra do select-all.
  const selecionadosVisiveis = linhasSelecionadasVisiveis(filteredRows, selecionados);
  const totalSelecionado = selecionadosVisiveis.reduce((s, r) => s + r.saldo, 0);

  const migrarEmMassa = async () => {
    if (!destinoMassa) {
      toast.error('Escolha pra qual quinzena migrar');
      return;
    }
    const alvo = selecionadosVisiveis;
    if (alvo.length === 0) {
      toast.error('Nada selecionado nesta tela');
      return;
    }
    setMigrandoMassa(true);
    let ok = 0;
    const falhas: string[] = [];
    for (const r of alvo) {
      try {
        await recordCarryover(companyId, r.periodId, destinoMassa, r.driverId, r.saldo, userId);
        ok++;
        setSelecionados((prev) => { const next = new Set(prev); next.delete(chave(r)); return next; });
      } catch (e) {
        falhas.push(`${r.name}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
    const destinoLabel = openPeriods.find((p) => p.id === destinoMassa)?.label ?? destinoMassa;
    if (falhas.length === 0) {
      toast.success(`${ok} saldo(s) migrado(s) pra quinzena ${destinoLabel}.`);
    } else if (ok > 0) {
      toast.error(`${ok} migrado(s), ${falhas.length} falharam: ${falhas.join('; ')}`);
    } else {
      toast.error(`Nenhum migrado. ${falhas.join('; ')}`);
    }
    await recarregar();
    await onMigrated();
    setMigrandoMassa(false);
  };

  const migrar = async (r: SaldoQuinzenaFechada) => {
    const toPeriodId = destino[chave(r)];
    if (!toPeriodId) {
      toast.error('Escolha pra qual quinzena migrar');
      return;
    }
    setMigrando(chave(r));
    try {
      await recordCarryover(companyId, r.periodId, toPeriodId, r.driverId, r.saldo, userId);
      const destinoLabel = openPeriods.find((p) => p.id === toPeriodId)?.label ?? toPeriodId;
      toast.success(`${formatBRL(r.saldo)} de ${r.name} migrado pra quinzena ${destinoLabel}.`);
      await recarregar();
      await onMigrated();
    } catch (e) {
      console.error('Erro ao migrar saldo:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao migrar saldo');
    } finally {
      setMigrando(null);
    }
  };

  return (
    <ModalShell
      icon={<Wallet className="w-5 h-5" />}
      title="Saldo devedor de quinzenas fechadas"
      subtitle={`${closedCount} quinzena(s) fechada(s) — vale/perda lançado mas nunca descontado`}
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-3">
        {loading ? (
          <div className="py-10 flex items-center justify-center text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Apurando quinzena por quinzena…
          </div>
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            Ninguém ficou devendo — todo vale/perda das quinzenas fechadas foi descontado.
          </p>
        ) : (
          <>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Esses valores ficaram lançados e nunca foram abatidos, porque a quinzena fechou antes —
                <b> {formatBRL(total)}</b> no total. Escolha pra qual quinzena aberta cada um migra;
                lá ele entra como pendência de vale/perda de novo, com a etiqueta de onde veio.
              </span>
            </div>
            {openPeriods.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Não há nenhuma quinzena aberta pra receber o saldo — abra uma antes de migrar.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {origensFechadas.length > 1 && (
                <select
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value)}
                  data-testid="closed-debt-filtro-origem"
                  className="text-xs border border-gray-300 rounded-md px-2 py-1.5 min-h-[32px]"
                >
                  <option value="">Todas as quinzenas fechadas</option>
                  {origensFechadas.map((o) => (
                    <option key={o.id} value={o.id}>quinzena {o.label}</option>
                  ))}
                </select>
              )}
              {openPeriods.length > 0 && filteredRows.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={todosVisiveisSelecionados}
                    onChange={toggleTodosVisiveis}
                    data-testid="closed-debt-selecionar-todos"
                  />
                  Selecionar todos ({filteredRows.length})
                </label>
              )}
            </div>

            {selecionados.size > 0 && (
              <div
                className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2"
                data-testid="closed-debt-barra-massa"
              >
                <span className="text-xs font-medium text-blue-800 whitespace-nowrap">
                  {selecionadosVisiveis.length} selecionado(s) — {formatBRL(totalSelecionado)}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                <select
                  value={destinoMassa}
                  onChange={(e) => setDestinoMassa(e.target.value)}
                  disabled={migrandoMassa}
                  data-testid="closed-debt-destino-massa"
                  className="text-xs border border-gray-300 rounded-md px-2 py-1.5 min-h-[32px] disabled:opacity-50"
                >
                  <option value="">quinzena…</option>
                  {openPeriods.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={migrarEmMassa}
                  disabled={migrandoMassa || !destinoMassa || selecionadosVisiveis.length === 0}
                  data-testid="closed-debt-migrar-massa"
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[32px]"
                >
                  {migrandoMassa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Migrar ${selecionadosVisiveis.length} selecionado(s)`}
                </button>
              </div>
            )}

            {filteredRows.length === 0 && (
              <p className="text-sm text-gray-500 py-2">Nenhum saldo pendente dessa quinzena.</p>
            )}
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
              {filteredRows.map((r) => (
                <div
                  key={chave(r)}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  data-testid="closed-debt-row"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {openPeriods.length > 0 && (
                      <input
                        type="checkbox"
                        checked={selecionados.has(chave(r))}
                        onChange={() => toggleUm(r)}
                        data-testid="closed-debt-checkbox"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-500">quinzena {r.periodLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-bold text-red-600 whitespace-nowrap">{formatBRL(r.saldo)}</span>
                    {openPeriods.length > 0 && (
                      <>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                        <select
                          value={destino[chave(r)] ?? ''}
                          onChange={(e) => setDestino((prev) => ({ ...prev, [chave(r)]: e.target.value }))}
                          disabled={migrando === chave(r)}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1.5 min-h-[32px] disabled:opacity-50"
                        >
                          <option value="">quinzena…</option>
                          {openPeriods.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => migrar(r)}
                          disabled={migrando === chave(r) || !destino[chave(r)]}
                          data-testid="closed-debt-migrar"
                          className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[32px]"
                        >
                          {migrando === chave(r) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Migrar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
};
