import React, { useMemo, useState } from 'react';
import { Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { formatBRL, type AlreadyDeductedDriver, type ChecksFilterOptions, type ChecksFilterResult } from './driverPayShared';

/** Escolhas do operador na hora de baixar o relatório. */
export interface ReportOptions {
  /** Plataformas escolhidas; null = todas (relatório completo, como sempre foi). */
  allowed: string[] | null;
  /** false = vales/perdas NÃO abatidos (pagamento parcial por plataforma). */
  includeDeductions: boolean;
  /** Só quem está com o botão "Espelho conferido" marcado. */
  onlyEspelhoConferido: boolean;
  /** Só quem está com a nota validada (mesma regra da coluna NF da lista). */
  onlyNfValidada: boolean;
}

interface ReportOptionsModalProps {
  /** 'geral' = relatório detalhado por rota/plataforma; 'simples' = nome · valor · PIX · obs. */
  kind: 'geral' | 'simples';
  /** Nomes das plataformas disponíveis no período (ordem das colunas). */
  platformOptions: string[];
  /** Total de vales+perdas no escopo do relatório (0 esconde o botão de descontar). */
  deductionsTotal: number;
  /** Quem já teve vale/perda abatido numa publicação deste período (aviso anti-duplo). */
  alreadyDeducted: AlreadyDeductedDriver[];
  /** Nº de recebedores/drivers no escopo (só informativo no cabeçalho). */
  scopeLabel: string;
  /** Quem sai do relatório com os filtros de conferência marcados (prévia honesta). */
  checksPreview: (opts: ChecksFilterOptions) => ChecksFilterResult;
  onClose: () => void;
  onConfirm: (opts: ReportOptions) => Promise<void>;
}

/**
 * Janela de opções dos relatórios (2026-07-27, decisões do Victor):
 *  - chips de PLATAFORMA (todas marcadas = relatório completo de sempre);
 *  - botão "Descontar vales e perdas" (marcado por padrão) pro pagamento parcial;
 *  - aviso quando alguém do escopo já teve o desconto abatido num espelho publicado.
 */
export const ReportOptionsModal: React.FC<ReportOptionsModalProps> = ({
  kind,
  platformOptions,
  deductionsTotal,
  alreadyDeducted,
  scopeLabel,
  checksPreview,
  onClose,
  onConfirm,
}) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(platformOptions));
  const [includeDeductions, setIncludeDeductions] = useState(true);
  // Desmarcados por padrão: sem tocar em nada, o arquivo sai igual ao de sempre.
  const [onlyEspelhoConferido, setOnlyEspelho] = useState(false);
  const [onlyNfValidada, setOnlyNf] = useState(false);
  const [generating, setGenerating] = useState(false);

  const preview = useMemo(
    () => checksPreview({ onlyEspelhoConferido, onlyNfValidada }),
    [checksPreview, onlyEspelhoConferido, onlyNfValidada],
  );
  const algumFiltro = onlyEspelhoConferido || onlyNfValidada;
  const foraPorMotivo = useMemo(() => {
    let espelho = 0;
    let nota = 0;
    for (const r of preview.removed) {
      if (r.reason === 'espelho' || r.reason === 'ambos') espelho += 1;
      if (r.reason === 'nota' || r.reason === 'ambos') nota += 1;
    }
    return { espelho, nota };
  }, [preview.removed]);
  const unidadesPerdidas = preview.recipientsBefore - preview.recipientsAfter;
  const vaiSairVazio = algumFiltro && preview.kept.length === 0;

  // Todas marcadas => null (sem filtro, arquivo idêntico ao de hoje).
  const allowed = useMemo<string[] | null>(
    () => (selected.size >= platformOptions.length ? null : platformOptions.filter((p) => selected.has(p))),
    [selected, platformOptions],
  );

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const handleConfirm = async () => {
    if (allowed && allowed.length === 0) return;
    if (vaiSairVazio) return;
    setGenerating(true);
    try {
      await onConfirm({ allowed, includeDeductions, onlyEspelhoConferido, onlyNfValidada });
    } finally {
      setGenerating(false);
    }
  };

  const title = kind === 'geral' ? 'Relatório geral' : 'Relatório simples';

  return (
    <ModalShell
      icon={<FileSpreadsheet className="w-5 h-5" />}
      title={`${title} — opções`}
      subtitle={`${scopeLabel} · o arquivo só é baixado quando você clicar em Baixar.`}
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={generating || (allowed !== null && allowed.length === 0) || vaiSairVazio}
            data-testid="report-confirm"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Baixar relatório
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Filtro de plataforma ── */}
        <div className="border border-blue-200 bg-blue-50 rounded-md p-3" data-testid="report-platform-box">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Plataformas deste relatório{' '}
            <span className="font-normal text-gray-500">
              (todas marcadas = relatório completo; desmarque pra pagar só uma plataforma)
            </span>
            :
          </p>
          <div className="flex flex-wrap gap-2">
            {platformOptions.map((name) => {
              const on = selected.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  data-testid={`report-plat-${name}`}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {name}
                </button>
              );
            })}
          </div>
          {allowed !== null && allowed.length > 0 && (
            <p className="text-xs text-blue-800 mt-2">
              O relatório vai sair <b>somente com {allowed.join(' + ')}</b>: quem não tem pacote nessas plataformas
              fica de fora, e os totais contam só elas.
            </p>
          )}
          {allowed !== null && allowed.length === 0 && (
            <p className="text-xs text-red-700 mt-2">Marque ao menos uma plataforma.</p>
          )}
        </div>

        {/* ── Só quem já está conferido (04/08/2026) ──
             Regra "paga o resto": o filtro é driver a driver. Grupo de 10 com 1 pendente
             continua saindo com os 9 — não segura 9 pessoas por causa de 1. */}
        <div
          className={`border rounded-md p-3 ${algumFiltro ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}
          data-testid="report-checks-box"
        >
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Pagar só quem já está conferido{' '}
            <span className="font-normal text-gray-500">(desmarcado = todo mundo, como sempre foi)</span>:
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyEspelhoConferido}
                onChange={(e) => setOnlyEspelho(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-gray-300"
                data-testid="report-only-espelho"
              />
              <span className="text-sm text-gray-800">
                Só quem está com o <b>espelho conferido</b>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyNfValidada}
                onChange={(e) => setOnlyNf(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-gray-300"
                data-testid="report-only-nf"
              />
              <span className="text-sm text-gray-800">
                Só quem está com a <b>nota validada</b>
              </span>
            </label>
          </div>

          {algumFiltro && (
            <div className="mt-2 text-xs" data-testid="report-checks-preview">
              {preview.removed.length === 0 ? (
                <p className="text-emerald-800">
                  <b>Todo mundo do escopo passa.</b> O arquivo sai igual ao sem filtro.
                </p>
              ) : (
                <>
                  <p className="text-emerald-900">
                    <b>{preview.removed.length} driver(s) ficam de fora</b>
                    {onlyEspelhoConferido && onlyNfValidada
                      ? ` — ${foraPorMotivo.espelho} sem espelho, ${foraPorMotivo.nota} sem nota`
                      : ''}
                    . O relatório sai com <b>{preview.recipientsAfter}</b> recebedor(es).
                  </p>
                  {unidadesPerdidas > 0 && (
                    <p className="text-amber-900 mt-1">
                      ⚠ <b>{unidadesPerdidas}</b> recebedor(es) somem por completo (ninguém do grupo passou).
                    </p>
                  )}
                  <p className="text-gray-600 mt-1">
                    Num grupo, quem está pendente sai e <b>o resto continua sendo pago</b> na linha do líder.
                  </p>
                  <ul className="mt-1 max-h-24 overflow-y-auto list-disc list-inside text-gray-700">
                    {preview.removed.slice(0, 20).map((r) => (
                      <li key={r.paymentId}>
                        {r.name}
                        {r.group ? ` (${r.group})` : ''} — falta{' '}
                        {r.reason === 'ambos' ? 'espelho e nota' : r.reason}
                      </li>
                    ))}
                  </ul>
                  {preview.removed.length > 20 && (
                    <p className="text-gray-500">…e mais {preview.removed.length - 20}.</p>
                  )}
                </>
              )}
            </div>
          )}
          {vaiSairVazio && (
            <p className="text-xs text-red-700 mt-2" data-testid="report-checks-empty">
              Ninguém do escopo passa nesses filtros — não há o que baixar.
            </p>
          )}
        </div>

        {/* ── Descontar (ou não) vales e perdas ── */}
        {deductionsTotal > 0 && (
          <div
            className={`border rounded-md p-3 ${
              includeDeductions ? 'border-gray-200 bg-gray-50' : 'border-amber-300 bg-amber-50'
            }`}
            data-testid="report-deductions-box"
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDeductions}
                onChange={(e) => setIncludeDeductions(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-blue-600 rounded border-gray-300"
                data-testid="report-deductions-toggle"
              />
              <span className="text-sm text-gray-800">
                <b>Descontar vales e perdas neste relatório</b> ({formatBRL(deductionsTotal)})
                <span className="block text-xs text-gray-600 mt-0.5">
                  {includeDeductions
                    ? 'Marcado: o total sai com os vales e perdas abatidos (como sempre foi).'
                    : 'Desmarcado: pagamento PARCIAL — as colunas mostram os valores mas o total NÃO abate (eles saem no pagamento das demais plataformas).'}
                </span>
              </span>
            </label>
          </div>
        )}

        {/* ── Aviso anti-desconto-duplo ── */}
        {includeDeductions && alreadyDeducted.length > 0 && (
          <div
            className="border-2 border-amber-400 bg-amber-50 rounded-md p-3 text-sm text-amber-900"
            data-testid="report-already-deducted-warning"
          >
            <p className="font-bold">⚠ Atenção: vale/perda já descontado neste período</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {alreadyDeducted.map((d) => (
                <li key={d.driverId}>
                  <b>{d.name}</b> já teve {formatBRL(d.amount)} abatido num espelho publicado.
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Se baixar assim, o valor é descontado de novo. Desmarque "Descontar vales e perdas" se este for o
              pagamento das demais plataformas.
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
