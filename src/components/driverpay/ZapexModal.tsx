import React, { useState } from 'react';
import { Zap, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { addZapex, updateZapex, removeZapex, setZapexRate } from '../../services/driverPay';
import type { DriverZapex } from '../../services/driverPay';
import { useCompany } from '../../contexts/CompanyContext';
import { getBrazilDate } from '../../utils/dateUtils';
import { ModalShell } from './ModalShell';
import { DriverRowData, formatBRL } from './driverPayShared';

interface ZapexModalProps {
  row: DriverRowData;
  userId: string;
  readOnly: boolean;
  hasPermission: (permission: string) => boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

/** Aceita "R$ 2,00" / "2,5" / "2.5" -> 2.5 (mesmo parser das taxas por rota). */
const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};
const formatRateInput = (n: number): string => n.toFixed(2).replace('.', ',');

/**
 * Linha editavel de um item Zapex (codigo + data de entrega). AUTO-SAVE: persiste ao
 * SAIR do campo (onBlur), sem botao de salvar. Excluir remove na hora.
 */
const ZapexItemRow: React.FC<{
  item: DriverZapex;
  paymentId: string;
  userId: string;
  readOnly: boolean;
  onChanged: () => void | Promise<void>;
}> = ({ item, paymentId, userId, readOnly, onChanged }) => {
  const [code, setCode] = useState(item.code);
  const [date, setDate] = useState(item.delivery_date ?? '');
  const [busy, setBusy] = useState(false);

  const persist = async (nextCode: string, nextDate: string) => {
    const trimmed = nextCode.trim();
    if (!trimmed) {
      setCode(item.code); // reverte: codigo e obrigatorio
      return;
    }
    if (trimmed === item.code && (nextDate || null) === (item.delivery_date ?? null)) return; // nada mudou
    setBusy(true);
    try {
      await updateZapex(item.id, paymentId, trimmed, nextDate || null, userId);
      await onChanged();
    } catch (e) {
      console.error('Erro ao salvar Zapex:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar Zapex');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeZapex(item.id, paymentId, userId);
      await onChanged();
    } catch (e) {
      console.error('Erro ao remover Zapex:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao remover Zapex');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <input
        type="text"
        value={code}
        disabled={readOnly || busy}
        onChange={(e) => setCode(e.target.value)}
        onBlur={() => persist(code, date)}
        placeholder="Código *"
        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:bg-gray-50"
      />
      <input
        type="date"
        value={date}
        disabled={readOnly || busy}
        onChange={(e) => setDate(e.target.value)}
        onBlur={() => persist(code, date)}
        className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:bg-gray-50"
      />
      {!readOnly && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Excluir Zapex"
          className="text-red-600 hover:text-red-800 disabled:opacity-40 flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

/**
 * Modal de Zapex: plataforma-ganho por ITEM. Cada Zapex = 1 entrega (codigo + data),
 * sem valor no lancamento. O ganho vem do valor unitario individual do driver
 * (zapexRate): total = qtd de itens x zapexRate, que soma no total a receber.
 *
 * AUTO-SAVE em tudo: itens (codigo/data) e o valor unitario salvam ao SAIR do campo;
 * excluir remove na hora. So o "Lancar Zapex" tem botao (e a acao de ADICIONAR item).
 * O valor unitario so aparece depois que existe pelo menos 1 Zapex.
 */
export const ZapexModal: React.FC<ZapexModalProps> = ({
  row,
  userId,
  readOnly,
  hasPermission,
  onClose,
  onChanged,
}) => {
  const { company } = useCompany();
  const [code, setCode] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(getBrazilDate());
  const [rateInput, setRateInput] = useState(formatRateInput(row.zapexRate));
  const [busy, setBusy] = useState(false);

  const canConfigRate = hasPermission('driverpay.configRate');
  const count = row.zapex.length;
  const displayRate = canConfigRate && !readOnly ? parseRate(rateInput) : row.zapexRate;
  const totalGanho = count * displayRate;

  const handleAdd = async () => {
    if (!company?.id) return;
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error('Informe o código do Zapex');
      return;
    }
    setBusy(true);
    try {
      await addZapex(company.id, row.paymentId, trimmed, deliveryDate || null, userId);
      setCode('');
      setDeliveryDate(getBrazilDate());
      await onChanged();
    } catch (e) {
      console.error('Erro ao lançar Zapex:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao lançar Zapex');
    } finally {
      setBusy(false);
    }
  };

  // AUTO-SAVE do valor unitario: persiste ao sair do campo, so se mudou.
  const persistRate = async () => {
    if (!company?.id || !canConfigRate || readOnly) return;
    const value = parseRate(rateInput);
    if (value < 0) {
      setRateInput(formatRateInput(row.zapexRate));
      return;
    }
    if (value === row.zapexRate) return;
    setBusy(true);
    try {
      await setZapexRate(company.id, row.paymentId, value, userId);
      await onChanged();
    } catch (e) {
      console.error('Erro ao salvar valor unitário do Zapex:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar valor unitário');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      icon={<Zap className="w-5 h-5" />}
      title="Zapex (ganho por item)"
      subtitle={row.name}
      onClose={onClose}
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
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Tudo salva automático — os itens e o valor unitário são gravados ao sair do campo.
        </p>

        {/* Lista de itens (edicao inline com auto-save) */}
        {count > 0 ? (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {row.zapex.map((z) => (
              <ZapexItemRow
                key={z.id}
                item={z}
                paymentId={row.paymentId}
                userId={userId}
                readOnly={readOnly}
                onChanged={onChanged}
              />
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
              <span className="text-xs font-medium text-gray-500">Total de Zapex</span>
              <span className="text-sm font-bold text-green-600">
                {count} · {formatBRL(totalGanho)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum Zapex lançado ainda.</p>
        )}

        {/* Valor unitario — so aparece com >=1 Zapex; AUTO-SAVE no blur */}
        {count > 0 && (
          <div className="border border-indigo-200 bg-indigo-50/60 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-indigo-700">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-semibold">Valor unitário (R$ por Zapex)</span>
            </div>
            {canConfigRate && !readOnly ? (
              <input
                type="text"
                inputMode="decimal"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                onBlur={persistRate}
                placeholder="0,00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 min-h-[40px]"
              />
            ) : (
              <div className="text-sm text-gray-700">
                Valor unitário atual: <span className="font-semibold">{formatBRL(row.zapexRate)}</span>
                {!canConfigRate && !readOnly && (
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Você não tem permissão para alterar o valor unitário.
                  </span>
                )}
              </div>
            )}
            <div className="text-sm font-semibold text-gray-700">
              {count} × {formatBRL(displayRate)} ={' '}
              <span className="text-green-600">{formatBRL(totalGanho)}</span>
            </div>
          </div>
        )}

        {/* Lancar novo item (o "adicionar" e a unica acao com botao) */}
        {!readOnly && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <span className="text-sm font-semibold text-gray-700">Lançar Zapex</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Código *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                  placeholder="Ex.: ZPX-000123"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 min-h-[40px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Data de entrega</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 min-h-[40px]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Lançar Zapex
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
