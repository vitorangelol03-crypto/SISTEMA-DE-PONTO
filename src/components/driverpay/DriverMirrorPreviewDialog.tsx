import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Eye, Download, Printer, Loader2, AlarmClock, Send, Trash2, CheckCircle2 } from 'lucide-react';
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
import {
  platformLineLabel,
  separatedPlatformTotals,
  separatedAmount,
  type SeparatedPlatformTotal,
} from '../../utils/driverMirrorGenerator';
import { ModalShell } from './ModalShell';
import { formatBRL, formatInt, sanitizeFile } from './driverPayShared';

export type MirrorRequest =
  | { mode: 'individual'; data: DriverMirrorData }
  | { mode: 'group'; data: DriverGroupMirrorData }
  | { mode: 'mass'; list: DriverMirrorData[] }
  | { mode: 'selection'; groups: DriverGroupMirrorData[]; singles: DriverMirrorData[] };

/** Nomes de plataforma presentes no espelho (pro filtro de envio da Fase 1b). */
function platformNamesOf(req: MirrorRequest): string[] {
  const set = new Set<string>();
  const add = (d: DriverMirrorData) => d.platforms.forEach((p) => set.add(p.platform));
  if (req.mode === 'individual') add(req.data);
  else if (req.mode === 'group') req.data.drivers.forEach(add);
  else if (req.mode === 'mass') req.list.forEach(add);
  else { req.groups.forEach((g) => g.drivers.forEach(add)); req.singles.forEach(add); }
  return [...set];
}

interface DriverMirrorPreviewDialogProps {
  request: MirrorRequest;
  canGenerate: boolean;
  onClose: () => void;
  /** Aviso de corte (2026-07-19): empresa + usuário p/ carregar/salvar as datas. */
  companyId?: string;
  userId?: string;
  /** Publicar no app do entregador (1 PDF por driver). `allowed`=plataformas incluídas; null=todas. */
  onPublish?: (allowed: string[] | null) => Promise<void>;
  /** Já existe publicação no app pro destinatário deste espelho (individual/líder do grupo). */
  alreadyPublished?: boolean;
  /** Despublicar (tirar do app) — só faz sentido pro destinatário único (individual/grupo). */
  onUnpublish?: () => Promise<void>;
  /** Reconstrói o espelho com o filtro de plataforma (chips) — a prévia e o PDF seguem a seleção. */
  onRebuild?: (allowed: string[] | null) => MirrorRequest | null;
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

/**
 * Faixas de aviso por plataforma — mesma cara do PDF (dedup: multi-rota gera 1 linha
 * por rota). `exclude`: plataformas com valor separado saem daqui na 2ª posição — o
 * aviso delas desce pra junto da faixa do total separado (pedido do Victor, 20/07).
 */
const PlatformNoticeBandsPreview: React.FC<{ data: DriverMirrorData; exclude?: Set<string> }> = ({
  data,
  exclude,
}) => {
  const seen = new Map<string, string>();
  for (const p of data.platforms) {
    if (p.highlight && p.notice && !exclude?.has(p.platform)) seen.set(p.platform, p.notice);
  }
  if (seen.size === 0) return null;
  return (
    <div className="space-y-2">
      {Array.from(seen, ([platform, text]) => (
        <div key={platform} className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-3 py-2">
          <p className="text-[13px] font-bold">
            <span className="text-red-700">AVISO {platform.toUpperCase()}: </span>
            <span className="text-gray-900">{text}</span>
          </p>
        </div>
      ))}
    </div>
  );
};

/** Faixa amarela do valor separado — mesma cara do PDF (texto explícito pro driver leigo). */
const SeparatedValueBannerPreview: React.FC<{ label: string; amount: number }> = ({ label, amount }) => (
  <div className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-4 py-2.5">
    <div className="flex items-center justify-between gap-2">
      <span className="font-bold text-sm text-gray-900">{label}</span>
      <span className="font-extrabold text-lg tabular-nums text-gray-900">{formatBRL(amount)}</span>
    </div>
    <p className="text-[11px] font-bold text-red-700 mt-0.5">
      ESTE VALOR É PAGO SEPARADO — ELE NÃO ESTÁ SOMADO NO "TOTAL A RECEBER" ACIMA.
    </p>
  </div>
);

/** Ganho Zapex (R$) de um espelho: a Zapex e modelada como uma "plataforma". */
const zapexValueOf = (d: DriverMirrorData): number =>
  d.platforms.find((p) => p.platform === 'Zapex')?.subtotal ?? 0;

/** Valor separado (R$) de um espelho — fica fora do total exibido (2026-07-20). */
const sepValueOf = (d: DriverMirrorData): number => separatedAmount(d.platforms);

/** Totais separados por plataforma de um GRUPO inteiro (soma dos drivers). */
const groupSeparated = (g: DriverGroupMirrorData): SeparatedPlatformTotal[] => {
  const map = new Map<string, SeparatedPlatformTotal>();
  const order: string[] = [];
  for (const d of g.drivers) {
    for (const s of separatedPlatformTotals(d.platforms)) {
      let entry = map.get(s.platform);
      if (!entry) {
        entry = { platform: s.platform, packages: 0, amount: 0 };
        map.set(s.platform, entry);
        order.push(s.platform);
      }
      entry.packages += s.packages;
      entry.amount += s.amount;
    }
  }
  return order.map((name) => map.get(name)!);
};

const PaperMirror: React.FC<{ data: DriverMirrorData }> = ({ data }) => {
  // Valor separado (2026-07-20): plataformas marcadas saem do total exibido.
  const sep = separatedPlatformTotals(data.platforms);
  const sepTotal = sep.reduce((s, x) => s + x.amount, 0);
  const sepNames = sep.map((s) => s.platform.toUpperCase()).join(' + ');
  return (
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
                <td className="py-1">{p.highlight ? '➜ ' : ''}{platformLineLabel(p)}</td>
                <td className="py-1 text-right tabular-nums">{formatInt(p.packages)}</td>
                <td className="py-1 text-right tabular-nums">{formatBRL(p.unitValue)}</td>
                <td className="py-1 text-right tabular-nums">{formatBRL(p.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {sep.map((s) => (
              <tr key={s.platform} className="border-t-2 border-gray-200 font-semibold bg-yellow-200">
                <td colSpan={3} className="py-1.5">
                  TOTAL {s.platform.toUpperCase()} — PAGO SEPARADO, FORA DO TOTAL ABAIXO
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatBRL(s.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td colSpan={3} className="py-1.5">
                TOTAL A RECEBER DE PACOTES{sep.length > 0 ? ` (sem ${sepNames})` : ''}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatBRL(data.totals.packagesValue - sepTotal)}</td>
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

      {/* 2ª posição dos avisos de plataforma (paridade com o PDF) — sem as separadas,
          cujo aviso desce pro bloco do total separado */}
      <div className="mt-4">
        <PlatformNoticeBandsPreview data={data} exclude={new Set(sep.map((s) => s.platform))} />
      </div>

      <div className="mt-5 border border-gray-200 rounded-lg overflow-hidden">
        <Row
          k={sep.length > 0 ? `Total de pacotes (sem ${sepNames})` : 'Total de pacotes'}
          v={`+ ${formatBRL(data.totals.packagesValue - sepTotal)}`}
        />
        <Row k="Descontos" v={`− ${formatBRL(data.totals.discountsValue)}`} danger={data.totals.discountsValue > 0} />
        <Row k="Vales / adiantamentos" v={`− ${formatBRL(data.totals.valesValue)}`} danger={data.totals.valesValue > 0} />
        <div className="flex items-center justify-between px-4 py-3 bg-green-700 text-white">
          <span className="font-bold text-sm">TOTAL A RECEBER</span>
          <span className="font-extrabold text-lg tabular-nums">{formatBRL(data.totals.toReceive - sepTotal)}</span>
        </div>
      </div>

      {/* Valor separado (2026-07-20): faixa amarela por plataforma, colada no total,
          com o aviso da plataforma (ex.: CNPJ da nota) logo embaixo — bloco único */}
      {sep.length > 0 && (
        <div className="mt-3 space-y-2">
          {sep.map((s) => {
            const noticeText = data.platforms.find((p) => p.platform === s.platform && p.notice)?.notice;
            return (
              <React.Fragment key={s.platform}>
                <SeparatedValueBannerPreview
                  label={`TOTAL ${s.platform.toUpperCase()} (${formatInt(s.packages)} pacotes)`}
                  amount={s.amount}
                />
                {noticeText && (
                  <div className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-3 py-2">
                    <p className="text-[13px] font-bold">
                      <span className="text-red-700">AVISO {s.platform.toUpperCase()}: </span>
                      <span className="text-gray-900">{noticeText}</span>
                    </p>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  </div>
  );
};

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
  onPublish,
  alreadyPublished,
  onUnpublish,
  onRebuild,
}) => {
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  // Fase 1b — filtro de plataforma no ENVIO ao app (marca quais entram).
  const availablePlatforms = useMemo(() => platformNamesOf(request), [request]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(availablePlatforms));
  // Plataformas marcadas => null quando todas (sem filtro); subconjunto => só essas.
  const allowedFromSelection = useMemo<string[] | null>(
    () => (selectedPlatforms.size >= availablePlatforms.length ? null : availablePlatforms.filter((p) => selectedPlatforms.has(p))),
    [selectedPlatforms, availablePlatforms],
  );
  // Prévia + "Gerar PDF" seguem os chips: reconstrói o espelho só com as plataformas marcadas
  // (mesma regra do envio ao app). Todas marcadas => request original.
  const activeRequest = useMemo<MirrorRequest>(
    () => (onRebuild && allowedFromSelection !== null ? onRebuild(allowedFromSelection) ?? request : request),
    [onRebuild, allowedFromSelection, request],
  );
  const [includeReceipts, setIncludeReceipts] = useState(true);
  // Aviso de corte (2026-07-19): pré-carrega o último salvo; salva automático ao gerar.
  const [cutoffTime, setCutoffTime] = useState('');
  const [cutoffDate, setCutoffDate] = useState('');
  const [lateDate, setLateDate] = useState('');
  useEffect(() => {
    if (!companyId) return;
    getMirrorCutoffNotice(companyId)
      .then((n) => {
        if (!n) return;
        // Fetch lento não pode APAGAR o que o usuário já digitou enquanto ele
        // estava no ar — só preenche campo que ainda está vazio.
        setCutoffTime((cur) => (cur.trim() ? cur : n.cutoff_time));
        setCutoffDate((cur) => (cur.trim() ? cur : n.cutoff_date));
        setLateDate((cur) => (cur.trim() ? cur : n.late_payment_date));
      })
      .catch((e) => console.error('Erro ao carregar aviso de corte:', e));
  }, [companyId]);

  const cutoff: MirrorCutoffLine | null =
    cutoffTime.trim() && cutoffDate.trim() && lateDate.trim()
      ? { time: cutoffTime.trim(), date: cutoffDate.trim(), lateDate: lateDate.trim() }
      : null;

  /** Injeta o aviso de corte no espelho ATIVO (já filtrado pelos chips), todos os modos. */
  const withCutoff = (): MirrorRequest => {
    if (!cutoff) return activeRequest;
    switch (activeRequest.mode) {
      case 'individual':
        return { ...activeRequest, data: { ...activeRequest.data, cutoff } };
      case 'group':
        return { ...activeRequest, data: { ...activeRequest.data, cutoff } };
      case 'mass':
        return { ...activeRequest, list: activeRequest.list.map((d) => ({ ...d, cutoff })) };
      case 'selection':
        return {
          ...activeRequest,
          groups: activeRequest.groups.map((g) => ({ ...g, cutoff })),
          singles: activeRequest.singles.map((d) => ({ ...d, cutoff })),
        };
    }
  };

  const groupHasZapex =
    activeRequest.mode === 'group' && activeRequest.data.drivers.some((d) => zapexValueOf(d) > 0);

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

  const togglePlatform = (name: string) =>
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const handlePublish = async () => {
    if (!onPublish) return;
    // Todas marcadas => null (todas); subconjunto => só as marcadas (D3 filtra linhas E total).
    const allowed =
      selectedPlatforms.size >= availablePlatforms.length
        ? null
        : availablePlatforms.filter((p) => selectedPlatforms.has(p));
    if (allowed && allowed.length === 0) {
      toast.error('Marque ao menos uma plataforma para enviar');
      return;
    }
    setPublishing(true);
    try {
      await onPublish(allowed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao publicar no app');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!onUnpublish) return;
    if (!window.confirm('Despublicar este espelho? O driver deixa de ver ele no app. Você pode publicar de novo depois.')) return;
    setUnpublishing(true);
    try {
      await onUnpublish();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao despublicar');
    } finally {
      setUnpublishing(false);
    }
  };

  const title =
    activeRequest.mode === 'individual'
      ? 'Espelho individual'
      : activeRequest.mode === 'group'
      ? `Espelho do grupo — ${activeRequest.data.groupName}`
      : activeRequest.mode === 'selection'
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
          {(activeRequest.mode === 'group' || (activeRequest.mode === 'selection' && activeRequest.groups.length > 0)) && (
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
          {onPublish && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || generating || unpublishing || !canGenerate}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {alreadyPublished ? 'Republicar (atualiza)' : 'Publicar no app'}
            </button>
          )}
          {onUnpublish && alreadyPublished && (
            <button
              type="button"
              onClick={handleUnpublish}
              disabled={unpublishing || publishing || generating}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {unpublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Despublicar
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Já publicado no app: aviso + o que os botões fazem ── */}
        {alreadyPublished && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Este espelho <b>já está publicado no app</b> do driver. <b>Republicar</b> substitui o anterior (corrige);{' '}
              <b>Despublicar</b> tira do app (o driver deixa de ver).
            </span>
          </div>
        )}

        {/* ── Fase 1b: filtro de plataforma no ENVIO ao app (chips) ── */}
        {onPublish && availablePlatforms.length > 1 && (
          <div className="border border-blue-200 bg-blue-50 rounded-md p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Plataformas deste espelho <span className="font-normal text-gray-500">(a prévia, o “Gerar PDF” e o envio ao app seguem o que estiver marcado)</span>:
            </p>
            <div className="flex flex-wrap gap-2">
              {availablePlatforms.map((name) => {
                const on = selectedPlatforms.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => togglePlatform(name)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {on ? '✓ ' : ''}{name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

        {activeRequest.mode === 'individual' && (
          <PaperMirror data={cutoff ? { ...activeRequest.data, cutoff } : activeRequest.data} />
        )}

        {activeRequest.mode === 'group' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto p-6">
            <div className="text-center text-xl font-extrabold text-gray-900">{activeRequest.data.company.name}</div>
            <div className="mt-4 bg-blue-600 text-white rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-sm">ESPELHO DE GRUPO — {activeRequest.data.groupName}</span>
              <span className="text-xs text-blue-100">{activeRequest.data.period.label}</span>
            </div>
            {cutoff && (
              <div className="mt-3">
                <CutoffBandPreview cutoff={cutoff} />
              </div>
            )}
            {/* Avisos de plataforma do grupo (presença: só plataformas com pacotes no grupo) */}
            {(() => {
              const seen = new Map<string, string>();
              for (const d of activeRequest.data.drivers)
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
                  {activeRequest.data.drivers.map((d, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1.5 break-words">{d.driver.name}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatBRL(d.totals.packagesValue - zapexValueOf(d) - sepValueOf(d))}
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
                        {formatBRL(d.totals.toReceive - sepValueOf(d))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Descontos do grupo (2026-07-19): de quem, código, marca, obs, valor — máx 12 */}
            {(() => {
              const all = activeRequest.data.drivers.flatMap((d) =>
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

            {(() => {
              const gSep = groupSeparated(activeRequest.data);
              const gSepTotal = gSep.reduce((s, x) => s + x.amount, 0);
              return (
                <>
                  <div className="mt-4 flex items-center justify-between px-4 py-3 bg-green-700 text-white rounded-lg">
                    <span className="font-bold text-sm">
                      TOTAL — {activeRequest.data.groupTotals.driverCount} driver(s)
                    </span>
                    <span className="font-extrabold text-lg tabular-nums">
                      {formatBRL(activeRequest.data.groupTotals.toReceive - gSepTotal)}
                    </span>
                  </div>
                  {gSep.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {gSep.map((s) => {
                        let noticeText: string | null = null;
                        for (const d of activeRequest.data.drivers) {
                          const hit = d.platforms.find((p) => p.platform === s.platform && p.notice);
                          if (hit?.notice) {
                            noticeText = hit.notice;
                            break;
                          }
                        }
                        return (
                          <React.Fragment key={s.platform}>
                            <SeparatedValueBannerPreview
                              label={`TOTAL ${s.platform.toUpperCase()} DO GRUPO (${formatInt(s.packages)} pacotes)`}
                              amount={s.amount}
                            />
                            {noticeText && (
                              <div className="border-2 border-yellow-400 bg-yellow-100 rounded-md px-3 py-2">
                                <p className="text-[13px] font-bold">
                                  <span className="text-red-700">AVISO {s.platform.toUpperCase()}: </span>
                                  <span className="text-gray-900">{noticeText}</span>
                                </p>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
            <p className="text-xs text-gray-500 mt-3">
              {includeReceipts
                ? 'O PDF terá o resumo acima + o recibo individual de cada driver.'
                : 'O PDF terá apenas o resumo do grupo.'}
            </p>
          </div>
        )}

        {activeRequest.mode === 'selection' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto p-6">
            <p className="text-sm text-gray-700 mb-3">
              Um único PDF com{' '}
              {activeRequest.groups.length > 0 && (
                <>
                  <b>{activeRequest.groups.length}</b> espelho(s) de grupo
                  {includeReceipts ? ' (resumo + recibos)' : ' (só o resumo)'}
                </>
              )}
              {activeRequest.groups.length > 0 && activeRequest.singles.length > 0 && ' e '}
              {activeRequest.singles.length > 0 && (
                <>
                  <b>{activeRequest.singles.length}</b> espelho(s) individual(is)
                </>
              )}
              .
            </p>
            <div className="border border-gray-200 rounded-md max-h-72 overflow-y-auto divide-y divide-gray-100">
              {activeRequest.groups.map((g, i) => (
                <div key={`g-${i}`} className="flex items-center justify-between px-3 py-2 text-sm bg-blue-50/50">
                  <span className="text-gray-900 truncate font-medium">
                    📋 {g.groupName}{' '}
                    <span className="text-gray-500 font-normal">· {g.groupTotals.driverCount} driver(s)</span>
                  </span>
                  <span className="font-semibold text-green-700 tabular-nums">
                    {formatBRL(g.groupTotals.toReceive - groupSeparated(g).reduce((s, x) => s + x.amount, 0))}
                  </span>
                </div>
              ))}
              {activeRequest.singles.map((d, i) => (
                <div key={`s-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-900 truncate">{d.driver.name}</span>
                  <span className="font-semibold text-green-700 tabular-nums">
                    {formatBRL(d.totals.toReceive - sepValueOf(d))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeRequest.mode === 'mass' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-[720px] mx-auto p-6">
            <p className="text-sm text-gray-700 mb-3">
              Serão gerados <b>{activeRequest.list.length}</b> espelho(s) num único PDF (1 página por driver).
            </p>
            <div className="border border-gray-200 rounded-md max-h-72 overflow-y-auto divide-y divide-gray-100">
              {activeRequest.list.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-900 truncate">{d.driver.name}</span>
                  <span className="font-semibold text-green-700 tabular-nums">
                    {formatBRL(d.totals.toReceive - sepValueOf(d))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
