import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listClosedPeriodsDebt, recordCarryover, type DriverPaymentPeriod,
} from '../../services/driverPay';
import type { SaldoQuinzenaFechada } from '../../utils/descontoSaldo';
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

  const total = useMemo(() => (rows ?? []).reduce((s, r) => s + r.saldo, 0), [rows]);

  const chave = (r: SaldoQuinzenaFechada) => `${r.periodId}:${r.driverId}`;

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
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
              {rows.map((r) => (
                <div
                  key={chave(r)}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  data-testid="closed-debt-row"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                    <p className="text-xs text-gray-500">quinzena {r.periodLabel}</p>
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
