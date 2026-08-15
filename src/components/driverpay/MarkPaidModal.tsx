import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { markPaymentDone, recordDeductions } from '../../services/driverPay';
import {
  resumoDesconto, abaterAgora, saldoDevedor,
  type ModoDesconto, type PessoaDesconto,
} from '../../utils/descontoSaldo';
import { ModalShell } from './ModalShell';
import {
  DriverRowData, computeRowTotals, platformPackages, deductionsOf,
  marcasDoRelatorio, formatBRL,
} from './driverPayShared';

interface MarkPaidModalProps {
  /** Um driver (linha) ou todos os membros de um grupo — mesma tela pros dois casos. */
  rows: DriverRowData[];
  /** Nome do driver ou do grupo, pro cabeçalho. */
  title: string;
  platformNames: string[];
  deductionLedger: ReadonlyMap<string, number>;
  companyId: string;
  periodId: string;
  userId: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

/**
 * Marcar como pago SEM gerar relatório (14/08/2026, pedido do Victor: "quero a opção de
 * marcar pago manualmente também"). Hoje a única forma de marcar era gerar o relatório
 * inteiro — o que serve quando o pagamento realmente saiu por uma planilha, mas não quando
 * o operador só precisa registrar "esse aqui já recebi, foi combinado direto".
 *
 * Reaproveita a MESMA régua de desconto do relatório (`resumoDesconto`/`abaterAgora`) — se
 * o driver ainda tem vale/perda pendente, pergunta antes de marcar, senão reabre o mesmo
 * bug do selo "vale a descontar" corrigido nesta sessão (commit `96fadb0`).
 */
export const MarkPaidModal: React.FC<MarkPaidModalProps> = ({
  rows, title, platformNames, deductionLedger, companyId, periodId, userId, onClose, onChanged,
}) => {
  // Só entram como opção as plataformas em que ALGUÉM do escopo tem pacote — marcar uma
  // plataforma vazia não significa nada.
  const platformOptions = useMemo(
    () => platformNames.filter((name) => rows.some((r) => platformPackages(r, name) > 0)),
    [platformNames, rows],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(platformOptions));
  const [modoDesconto, setModoDesconto] = useState<ModoDesconto>('pendentes');
  const [busy, setBusy] = useState(false);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allowedSet = useMemo(() => (selected.size > 0 ? selected : undefined), [selected]);

  const pessoas = useMemo<PessoaDesconto[]>(
    () =>
      rows.map((r) => {
        const t = computeRowTotals(r, allowedSet, false);
        return {
          driverId: r.driverId,
          name: r.name,
          total: deductionsOf(r),
          jaAbatido: deductionLedger.get(r.driverId) ?? 0,
          brutoNoEscopo: t.packagesAmount + t.zapex,
        };
      }),
    [rows, allowedSet, deductionLedger],
  );
  const temPendencia = useMemo(() => pessoas.some((p) => saldoDevedor(p) > 0), [pessoas]);
  const resumo = useMemo(() => resumoDesconto(modoDesconto, pessoas), [modoDesconto, pessoas]);

  const pares = useMemo(
    () => marcasDoRelatorio(rows, platformOptions, selected),
    [rows, platformOptions, selected],
  );

  const handleConfirm = async () => {
    if (pares.length === 0) {
      toast.error('Nenhum pacote nas plataformas escolhidas — nada para marcar.');
      return;
    }
    setBusy(true);
    try {
      const n = await markPaymentDone(companyId, periodId, pares, 'manual', userId, modoDesconto !== 'nenhum');
      const abates = pessoas
        .map((p) => ({ driverId: p.driverId, amount: abaterAgora(modoDesconto, p, p.brutoNoEscopo) }))
        .filter((l) => l.amount > 0);
      if (abates.length > 0) {
        await recordDeductions(companyId, periodId, abates, 'relatorio', crypto.randomUUID(), userId);
      }
      const pessoasMarcadas = new Set(pares.map((p) => p.driverId)).size;
      toast.success(`${pessoasMarcadas} entregador(es) marcado(s) como pago(s) (${n} plataforma/entregador).`);
      await onChanged();
      onClose();
    } catch (e) {
      console.error('Erro ao marcar pago manualmente:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao marcar como pago');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      icon={<CheckCircle2 className="w-5 h-5" />}
      title="Marcar como pago"
      subtitle={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || pares.length === 0}
            data-testid="mark-paid-confirm"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Marcar como pago
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Registra que {rows.length > 1 ? `${rows.length} entregadores` : title} já recebeu — sem gerar
          nenhum relatório. Não desfaz nem gera arquivo: é só a marca de "já pago".
        </p>

        {platformOptions.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Ninguém aqui tem pacote nesta quinzena — não há o que marcar.
          </p>
        ) : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Plataformas a marcar como pagas</label>
            <div className="flex flex-wrap gap-1.5">
              {platformOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                    selected.has(name)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {temPendencia && (
          <div
            className={`border rounded-md p-3 ${
              modoDesconto === 'nenhum' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'
            }`}
            data-testid="mark-paid-deductions-box"
          >
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Tem vale/perda ainda pendente aqui — descontar neste pagamento?
            </p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Como descontar vale/perda">
              {([
                {
                  modo: 'pendentes' as const,
                  testid: 'mark-paid-modo-pendentes',
                  titulo: 'Descontar só de quem ainda não foi descontado',
                  recomendado: true,
                },
                {
                  modo: 'todos' as const,
                  testid: 'mark-paid-modo-todos',
                  titulo: 'Descontar o valor cheio de todos',
                  recomendado: false,
                },
                {
                  modo: 'nenhum' as const,
                  testid: 'mark-paid-modo-nenhum',
                  titulo: 'Não descontar agora (fica pendente)',
                  recomendado: false,
                },
              ]).map((op) => (
                <label
                  key={op.modo}
                  className={`flex items-start gap-2 cursor-pointer rounded-md p-2 border ${
                    modoDesconto === op.modo ? 'border-blue-400 bg-white' : 'border-transparent hover:bg-white/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="mark-paid-modo-desconto"
                    checked={modoDesconto === op.modo}
                    onChange={() => setModoDesconto(op.modo)}
                    className="w-4 h-4 mt-0.5 text-blue-600 border-gray-300"
                    data-testid={op.testid}
                  />
                  <span className="text-sm text-gray-800">
                    <b>{op.titulo}</b>
                    {op.recomendado && (
                      <span className="ml-1.5 text-[11px] font-semibold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
                        recomendado
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {modoDesconto !== 'nenhum' && resumo.totalDescontar > 0 && (
              <p className="mt-2 text-xs text-emerald-800">
                Vai descontar {formatBRL(resumo.totalDescontar)} de {resumo.vaoDescontar.length}
                {resumo.vaoDescontar.length === 1 ? ' pessoa' : ' pessoas'}.
              </p>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
