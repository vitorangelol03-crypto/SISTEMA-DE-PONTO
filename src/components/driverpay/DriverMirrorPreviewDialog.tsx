import React, { useEffect, useState } from 'react';
import { FileText, Eye, Download, Printer, Loader2, AlarmClock } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  downloadDriverMirrorPdf,
  downloadDriverGroupMirrorPdf,
  downloadDriverMirrorsBatchPdf,
  downloadDriverSelectionMirrorPdf,
  type DriverMirrorData,
  type DriverGroupMirrorData,
  type MirrorCutoffLine,
} from '../../utils/driverMirrorPdf';
import { getMirrorCutoffNotice, saveMirrorCutoffNotice } from '../../services/driverPay';
import { ModalShell } from './ModalShell';
import { formatBRL, formatInt, sanitizeFile } from './driverPayShared';

export type MirrorRequest =
  | { mode: 'individual'; data: DriverMirrorData }
  | { mode: 'group'; data: DriverGroupMirrorData }
  | { mode: 'mass'; list: DriverMirrorData[] }
  | { mode: 'selection'; groups: DriverGroupMirrorData[]; singles: DriverMirrorData[] };

interface DriverMirrorPreviewDialogProps {
  request: MirrorRequest;
  canGenerate: boolean;
  onClose: () => void;
  /** Aviso de corte (2026-07-19): empresa + usuário p/ carregar/salvar as datas. */
  companyId?: string;
  userId?: string;
}

/** Faixa amarela do corte — mesma cara do PDF (prévia fiel). */
const CutoffBandPreview: React.FC<{ cutoff: MirrorCutoffLine }> = ({ cutoff }) => (
  <div className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-3 py-2 text-center">
    <p className="text-[13px] font-bold text-gray-900">
      As notas deverão ser enviadas até as{' '}
      <span className="text-red-700 text-[15px]">{cutoff.time}H do dia {cutoff.date}</span>
      , fiquem atentos para que não ocorra atrasos no pagamento!
    </p>
    <p className="text-[11px] text-gray-800">
      Caso exceda o horário de corte seu pagamento vai ocorrer dia{' '}
      <span className="font-bold text-red-700">{cutoff.lateDate}</span>
    </p>
  </div>
);

/** Faixas de aviso por plataforma — mesma cara do PDF. */
const PlatformNoticeBandsPreview: React.FC<{ data: DriverMirrorData }> = ({ data }) => {
  const notices = data.platforms.filter((p) => p.highlight && p.notice);
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.map((p, i) => (
        <div key={i} className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-3 py-2">
          <p className="text-[13px] font-bold">
            <span className="text-red-700">AVISO {p.platform.toUpperCase()}: </span>
            <span className="text-gray-900">{p.notice}</span>
          </p>
        </div>
      ))}
    </div>
  );
};

/** Ganho Zapex (R$) de um espelho: a Zapex e modelada como uma "plataforma". */
const zapexValueOf = (d: DriverMirrorData): number =>
  d.platforms.find((p) => p.platform === 'Zapex')?.subtotal ?? 0;

const PaperMirror: React.FC<{ data: DriverMirrorData }> = ({ data }) => (
  <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto overflow-hidden">
    <div className="p-6 sm:p-8">
      <div className="text-center">
        <div className="text-xl font-extrabold tracking-wide text-gray-900">{data.company.name}</div>
        <div className="text-[11px] text-gray-500 mt-1">
          {[data.company.city, data.company.cnpj ? `CNPJ ${data.company.cnpj}` : null].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div className="mt-4 bg-blue-600 text-white rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <span className="font-bold text-sm">ESPELHO DE PAGAMENTO — DRIVER</span>
        <span className="text-xs text-blue-100">{data.period.label}</span>
      </div>

      {data.cutoff && (
        <div className="mt-3">
          <CutoffBandPreview cutoff={data.cutoff} />
        </div>
      )}
      <div className="mt-3">
        <PlatformNoticeBandsPreview data={data} />
      </div>

      <div className="mt-4 border border-gray-200 bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field k="Driver" v={data.driver.name} />
        <Field k="Grupo" v={data.driver.group || '—'} />
        <Field k="Período" v={data.period.label} />
        <Field k="Rota(s)" v={data.driver.routes.map((r) => r.city).filter(Boolean).join(', ') || '—'} />
      </div>

      {data.driver.routes.length > 1 && (
        <Section title="Pacotes por rota">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs">
                <th className="text-left py-1">Rota / Cidade</th>
                <th className="text-right py-1">Pacotes</th>
              </tr>
            </thead>
            <tbody>
              {data.driver.routes.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1">{r.city || '—'}</td>
                  <td className="py-1 text-right tabular-nums">{formatInt(r.totalPackages ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Valores por plataforma">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs">
              <th className="text-left py-1">Plataforma</th>
              <th className="text-right py-1">Pacotes</th>
              <th className="text-right py-1">Valor/Pacote</th>
              <th className="text-right py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {data.platforms.map((p, i) => (
              <tr key={i} className={`border-t border-gray-100 ${p.highlight ? 'bg-yellow-200 font-semibold' : ''}`}>
                <td className="py-1">{p.highlight ? '➜ ' : ''}{p.platform}</td>
                <td className="py-1 text-right tabular-nums">{formatInt(p.packages)}</td>
                <td className="py-1 text-right tabular-nums">{formatBRL(p.unitValue)}</td>
                <td className="py-1 text-right tabular-nums">{formatBRL(p.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td colSpan={3} className="py-1.5">
                TOTAL A RECEBER DE PACOTES
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatBRL(data.totals.packagesValue)}</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {data.discounts.length > 0 && (
        <Section title="Descontos">
          <table className="w-full text-sm">
            <tbody>
              {data.discounts.map((d, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1">{d.packageId || '—'}</td>
                  <td className="py-1 text-gray-500">{d.description || 'Pacote descontado'}</td>
                  <td className="py-1 text-right text-red-600 tabular-nums">− {formatBRL(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {data.vales.length > 0 && (
        <Section title="Vales / adiantamentos">
          <table className="w-full text-sm">
            <tbody>
              {data.vales.map((v, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1">{v.date || '—'}</td>
                  <td className="py-1 text-gray-500">{v.note || 'Vale'}</td>
                  <td className="py-1 text-right text-red-600 tabular-nums">− {formatBRL(v.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 2ª posição dos avisos de plataforma (paridade com o PDF) */}
      <div className="mt-4">
        <PlatformNoticeBandsPreview data={data} />
      </div>

      <div className="mt-5 border border-gray-200 rounded-lg overflow-hidden">
        <Row k="Total de pacotes" v={`+ ${formatBRL(data.totals.packagesValue)}`} />
        <Row k="Descontos" v={`− ${formatBRL(data.totals.discountsValue)}`} danger={data.totals.discountsValue > 0} />
        <Row k="Vales / adiantamentos" v={`− ${formatBRL(data.totals.valesValue)}`} danger={data.totals.valesValue > 0} />
        <div className="flex items-center justify-between px-4 py-3 bg-green-700 text-white">
          <span className="font-bold text-sm">TOTAL A RECEBER</span>
          <span className="font-extrabold text-lg tabular-nums">{formatBRL(data.totals.toReceive)}</span>
        </div>
      </div>
    </div>
  </div>
);

const Field: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex flex-col">
    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k}</span>
    <span className="text-sm text-gray-900 break-words">{v}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mt-5">
    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">{title}</div>
    <div className="overflow-x-auto">{children}</div>
  </div>
);

const Row: React.FC<{ k: string; v: string; danger?: boolean }> = ({ k, v, danger }) => (
  <div className="flex items-center justify-between px-4 py-2 text-sm border-b border-gray-100">
    <span className="text-gray-500">{k}</span>
    <span className={`font-semibold tabular-nums ${danger ? 'text-red-600' : 'text-gray-900'}`}>{v}</span>
  </div>
);

export const DriverMirrorPreviewDialog: React.FC<DriverMirrorPreviewDialogProps> = ({
  request,
  canGenerate,
  onClose,
  companyId,
  userId,
}) => {
  const [generating, setGenerating] = useState(false);
  const [includeReceipts, setIncludeReceipts] = useState(true);
  // Aviso de corte (2026-07-19): pré-carrega o último salvo; salva automático ao gerar.
  const [cutoffTime, setCutoffTime] = useState('');
  const [cutoffDate, setCutoffDate] = useState('');
  const [lateDate, setLateDate] = useState('');
  useEffect(() => {
    if (!companyId) return;
    getMirrorCutoffNotice(companyId)
      .then((n) => {
        if (n) {
          setCutoffTime(n.cutoff_time);
          setCutoffDate(n.cutoff_date);
          setLateDate(n.late_payment_date);
        }
      })
      .catch((e) => console.error('Erro ao carregar aviso de corte:', e));
  }, [companyId]);

  const cutoff: MirrorCutoffLine | null =
    cutoffTime.trim() && cutoffDate.trim() && lateDate.trim()
      ? { time: cutoffTime.trim(), date: cutoffDate.trim(), lateDate: lateDate.trim() }
      : null;

  /** Injeta o aviso de corte em TODOS os dados do request (todos os modos). */
  const withCutoff = (): MirrorRequest => {
    if (!cutoff) return request;
    switch (request.mode) {
      case 'individual':
        return { ...request, data: { ...request.data, cutoff } };
      case 'group':
        return { ...request, data: { ...request.data, cutoff } };
      case 'mass':
        return { ...request, list: request.list.map((d) => ({ ...d, cutoff })) };
      case 'selection':
        return {
          ...request,
          groups: request.groups.map((g) => ({ ...g, cutoff })),
          singles: request.singles.map((d) => ({ ...d, cutoff })),
        };
    }
  };

  const groupHasZapex =
    request.mode === 'group' && request.data.drivers.some((d) => zapexValueOf(d) > 0);

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('Você não tem permissão para gerar espelhos');
      return;
    }
    setGenerating(true);
    try {
      // Salva o aviso de corte como novo padrão (pedido do Victor: fica salvo até alterar).
      if (cutoff && companyId && userId) {
        await saveMirrorCutoffNotice(companyId, {
          cutoff_time: cutoff.time,
          cutoff_date: cutoff.date,
          late_payment_date: cutoff.lateDate,
        }, userId).catch((e) => console.error('Erro ao salvar aviso de corte:', e));
      }
      const req = withCutoff();
      if (req.mode === 'individual') {
        const file = `espelho-driver-${sanitizeFile(req.data.driver.name)}-${sanitizeFile(req.data.period.label)}.pdf`;
        await downloadDriverMirrorPdf(req.data, file);
      } else if (req.mode === 'group') {
        const file = `espelho-grupo-${sanitizeFile(req.data.groupName)}-${sanitizeFile(req.data.period.label)}.pdf`;
        await downloadDriverGroupMirrorPdf(req.data, file, { compact: !includeReceipts });
      } else if (req.mode === 'selection') {
        if (req.groups.length === 0 && req.singles.length === 0) {
          toast.error('Nada selecionado para gerar espelho');
          return;
        }
        const period = req.groups[0]?.period.label ?? req.singles[0]?.period.label ?? '';
        await downloadDriverSelectionMirrorPdf(
          req.groups,
          req.singles,
          `espelhos-selecao-${sanitizeFile(period)}.pdf`,
          { compact: !includeReceipts },
        );
      } else {
        if (req.list.length === 0) {
          toast.error('Nenhum driver para gerar espelho');
          return;
        }
        const period = req.list[0]?.period.label ?? '';
        await downloadDriverMirrorsBatchPdf(req.list, `espelhos-driver-EM-MASSA-${sanitizeFile(period)}.pdf`);
      }
      toast.success('PDF gerado');
      onClose();
    } catch (e) {
      console.error('Erro ao gerar espelho:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar espelho');
    } finally {
      setGenerating(false);
    }
  };

  const title =
    request.mode === 'individual'
      ? 'Espelho individual'
      : request.mode === 'group'
      ? `Espelho do grupo — ${request.data.groupName}`
      : request.mode === 'selection'
      ? 'Espelhos da seleção'
      : 'Espelhos em massa';

  return (
    <ModalShell
      icon={<FileText className="w-5 h-5" />}
      title={title}
      subtitle="Confira a pré-visualização antes de gerar — nada é baixado até você clicar em Gerar PDF."
      onClose={onClose}
      maxWidth="sm:max-w-3xl"
      footer={
        <>
          {(request.mode === 'group' || (request.mode === 'selection' && request.groups.length > 0)) && (
            <label className="flex items-center gap-2 text-xs text-gray-600 mr-auto">
              <input
                type="checkbox"
                checked={includeReceipts}
                onChange={(e) => setIncludeReceipts(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300"
              />
              Incluir recibo de cada driver
            </label>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px] inline-flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Fechar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !canGenerate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Gerar PDF
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Aviso de corte das notas (sai em TODOS os espelhos; salva ao gerar) ── */}
        <div className="border border-yellow-300 bg-yellow-50 rounded-md p-3">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
            <AlarmClock className="w-4 h-4 text-yellow-600" />
            Aviso de corte das notas — sai em todos os espelhos (a data usada fica salva até você alterar)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-xs text-gray-600">
              Hora do corte
              <input
                type="text"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                placeholder="14:00"
                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Data do corte
              <input
                type="text"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                placeholder="20/07"
                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              Pagamento se exceder
              <input
                type="text"
                value={lateDate}
                onChange={(e) => setLateDate(e.target.value)}
                placeholder="27/07"
                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-sm text-blue-700">
          <Eye className="w-4 h-4" />
          Pré-visualização
        </div>

        {request.mode === 'individual' && (
          <PaperMirror data={cutoff ? { ...request.data, cutoff } : request.data} />
        )}

        {request.mode === 'group' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto p-6">
            <div className="text-center text-xl font-extrabold text-gray-900">{request.data.company.name}</div>
            <div className="mt-4 bg-blue-600 text-white rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-sm">ESPELHO DE GRUPO — {request.data.groupName}</span>
              <span className="text-xs text-blue-100">{request.data.period.label}</span>
            </div>
            {cutoff && (
              <div className="mt-3">
                <CutoffBandPreview cutoff={cutoff} />
              </div>
            )}
            {/* Avisos de plataforma do grupo (presença: só plataformas com pacotes no grupo) */}
            {(() => {
              const seen = new Map<string, string>();
              for (const d of request.data.drivers)
                for (const p of d.platforms)
                  if (p.platform !== 'Zapex' && p.highlight && p.notice) seen.set(p.platform, p.notice);
              return seen.size > 0 ? (
                <div className="mt-3 space-y-2">
                  {Array.from(seen, ([platform, text]) => (
                    <div key={platform} className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-3 py-2">
                      <p className="text-[13px] font-bold">
                        <span className="text-red-700">AVISO {platform.toUpperCase()}: </span>
                        <span className="text-gray-900">{text}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left py-1.5">Driver</th>
                    <th className="text-right py-1.5">Pacotes</th>
                    {groupHasZapex && <th className="text-right py-1.5">Zapex</th>}
                    <th className="text-right py-1.5">Desc.</th>
                    <th className="text-right py-1.5">Vale</th>
                    <th className="text-right py-1.5">A receber</th>
                  </tr>
                </thead>
                <tbody>
                  {request.data.drivers.map((d, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1.5 break-words">{d.driver.name}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatBRL(d.totals.packagesValue - zapexValueOf(d))}
                      </td>
                      {groupHasZapex && (
                        <td className="py-1.5 text-right tabular-nums font-semibold text-green-700">
                          {zapexValueOf(d) > 0 ? `+ ${formatBRL(zapexValueOf(d))}` : '—'}
                        </td>
                      )}
                      <td className="py-1.5 text-right tabular-nums text-red-600">
                        {d.totals.discountsValue > 0 ? `− ${formatBRL(d.totals.discountsValue)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-amber-600">
                        {d.totals.valesValue > 0 ? `− ${formatBRL(d.totals.valesValue)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-green-700">
                        {formatBRL(d.totals.toReceive)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Descontos do grupo (2026-07-19): de quem, código, marca, obs, valor — máx 12 */}
            {(() => {
              const all = request.data.drivers.flatMap((d) =>
                d.discounts.map((dd) => ({ driver: d.driver.name, ...dd })),
              );
              if (all.length === 0) return null;
              const shown = all.slice(0, 12);
              const rest = all.length - shown.length;
              return (
                <div className="mt-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                    Descontos do grupo
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left py-1">Driver</th>
                          <th className="text-left py-1">Código</th>
                          <th className="text-center py-1">Marca</th>
                          <th className="text-left py-1">Obs</th>
                          <th className="text-right py-1">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((s, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-1">{s.driver}</td>
                            <td className="py-1">{s.packageId || '—'}</td>
                            <td className="py-1 text-center">
                              {s.status ? (
                                <span
                                  className={`font-bold ${s.status === 'PNR' ? 'text-purple-700' : 'text-orange-700'}`}
                                >
                                  {s.status}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-1 text-gray-500">{s.description || '—'}</td>
                            <td className="py-1 text-right text-red-600 tabular-nums">− {formatBRL(s.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                      {rest > 0 && (
                        <tfoot>
                          <tr className="border-t border-gray-200">
                            <td colSpan={5} className="py-1.5 text-gray-500 italic">
                              … e mais {rest} desconto(s) — ver o recibo individual de cada driver
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              );
            })()}

            <div className="mt-4 flex items-center justify-between px-4 py-3 bg-green-700 text-white rounded-lg">
              <span className="font-bold text-sm">
                TOTAL — {request.data.groupTotals.driverCount} driver(s)
              </span>
              <span className="font-extrabold text-lg tabular-nums">{formatBRL(request.data.groupTotals.toReceive)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {includeReceipts
                ? 'O PDF terá o resumo acima + o recibo individual de cada driver.'
                : 'O PDF terá apenas o resumo do grupo.'}
            </p>
          </div>
        )}

        {request.mode === 'selection' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto p-6">
            <p className="text-sm text-gray-700 mb-3">
              Um único PDF com{' '}
              {request.groups.length > 0 && (
                <>
                  <b>{request.groups.length}</b> espelho(s) de grupo
                  {includeReceipts ? ' (resumo + recibos)' : ' (só o resumo)'}
                </>
              )}
              {request.groups.length > 0 && request.singles.length > 0 && ' e '}
              {request.singles.length > 0 && (
                <>
                  <b>{request.singles.length}</b> espelho(s) individual(is)
                </>
              )}
              .
            </p>
            <div className="border border-gray-200 rounded-md max-h-72 overflow-y-auto divide-y divide-gray-100">
              {request.groups.map((g, i) => (
                <div key={`g-${i}`} className="flex items-center justify-between px-3 py-2 text-sm bg-blue-50/50">
                  <span className="text-gray-900 truncate font-medium">
                    📋 {g.groupName}{' '}
                    <span className="text-gray-500 font-normal">· {g.groupTotals.driverCount} driver(s)</span>
                  </span>
                  <span className="font-semibold text-green-700 tabular-nums">{formatBRL(g.groupTotals.toReceive)}</span>
                </div>
              ))}
              {request.singles.map((d, i) => (
                <div key={`s-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-900 truncate">{d.driver.name}</span>
                  <span className="font-semibold text-green-700 tabular-nums">{formatBRL(d.totals.toReceive)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {request.mode === 'mass' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto p-6">
            <p className="text-sm text-gray-700 mb-3">
              Serão gerados <b>{request.list.length}</b> espelho(s) num único PDF (1 página por driver).
            </p>
            <div className="border border-gray-200 rounded-md max-h-72 overflow-y-auto divide-y divide-gray-100">
              {request.list.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-900 truncate">{d.driver.name}</span>
                  <span className="font-semibold text-green-700 tabular-nums">{formatBRL(d.totals.toReceive)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
