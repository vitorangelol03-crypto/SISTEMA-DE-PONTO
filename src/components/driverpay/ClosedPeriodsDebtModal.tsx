import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { listClosedPeriodsDebt, type DriverPaymentPeriod } from '../../services/driverPay';
import type { SaldoQuinzenaFechada } from '../../utils/descontoSaldo';
import { ModalShell } from './ModalShell';
import { formatBRL } from './driverPayShared';

interface ClosedPeriodsDebtModalProps {
  companyId: string;
  periods: readonly DriverPaymentPeriod[];
  onClose: () => void;
}

/**
 * "Quem ficou devendo depois que a quinzena fechou" (14/08/2026, sub-fase A do pedido do
 * Victor "jogar pra próxima quinzena"). Só leitura — não migra nada ainda, é a tela que
 * faltava pra dar pra VER o buraco antes de mexer em dinheiro.
 */
export const ClosedPeriodsDebtModal: React.FC<ClosedPeriodsDebtModalProps> = ({
  companyId, periods, onClose,
}) => {
  const [rows, setRows] = useState<SaldoQuinzenaFechada[] | null>(null);
  const [loading, setLoading] = useState(true);

  const closedCount = useMemo(() => periods.filter((p) => p.status === 'concluido').length, [periods]);

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
                Esses valores ficaram lançados e nunca foram abatidos, porque a quinzena fechou antes.
                Hoje eles não aparecem em nenhum relatório nem espelho — <b>{formatBRL(total)}</b> no total.
              </span>
            </div>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
              {rows.map((r) => (
                <div
                  key={`${r.periodId}:${r.driverId}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                  data-testid="closed-debt-row"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                    <p className="text-xs text-gray-500">quinzena {r.periodLabel}</p>
                  </div>
                  <span className="text-sm font-bold text-red-600 whitespace-nowrap">{formatBRL(r.saldo)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
};
