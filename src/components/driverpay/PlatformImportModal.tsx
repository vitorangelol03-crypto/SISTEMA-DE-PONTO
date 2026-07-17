import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { ModalShell } from './ModalShell';
import { parseDriverSheetFileInWorker, type DriverSheetResult } from '../../utils/driverSheetImport';
import {
  matchDriver,
  normalizeDriverName,
  type DriverCandidate,
  type DriverAlias,
  type DriverMatch,
} from '../../utils/driverNameMatch';
import {
  summarizeDriverImport,
  type ImportResolvedItem,
  type ImportResolution,
} from '../../utils/driverImportApply';
import {
  getDriverMatchContext,
  applyDriverImport,
  getPeriods,
  type DriverPaymentPeriod,
} from '../../services/driverPay';
import { formatInt } from './driverPayShared';

const PLATFORM_LABEL: Record<string, string> = { imile: 'iMile', shopee: 'Shopee', anjun: 'Anjun' };

/** Nome legivel para pre-preencher ao criar um driver novo (tira codigo/XPT/parenteses). */
function suggestName(raw: string): string {
  const s = raw
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/\bxpt\b/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || raw;
}

interface PlatformImportModalProps {
  companyId: string;
  userId: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

export const PlatformImportModal: React.FC<PlatformImportModalProps> = ({
  companyId,
  userId,
  onClose,
  onImported,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<DriverSheetResult | null>(null);
  const [drivers, setDrivers] = useState<DriverCandidate[]>([]);
  const [aliases, setAliases] = useState<DriverAlias[]>([]);
  const [periods, setPeriods] = useState<DriverPaymentPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  // resolucao manual por entregador (driverRaw); ausente => usa o match automatico.
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
  const [applying, setApplying] = useState(false);

  const source = result?.platform ?? '';

  const onFile = useCallback(
    async (file: File) => {
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        toast.error('Envie um arquivo .xlsx ou .xls');
        return;
      }
      setParsing(true);
      setResult(null);
      try {
        const [parsed, ctx, pers] = await Promise.all([
          parseDriverSheetFileInWorker(file),
          getDriverMatchContext(companyId),
          getPeriods(companyId),
        ]);
        setResult(parsed);
        setDrivers(ctx.drivers);
        setAliases(ctx.aliases);
        setPeriods(pers);
        const open = pers.filter((p) => p.status === 'aberto');
        setPeriodId(open[0]?.id ?? pers[0]?.id ?? '');
        setResolutions({});
        if (parsed.warnings.length) parsed.warnings.forEach((w) => toast(w, { icon: '⚠️' }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao ler planilha');
      } finally {
        setParsing(false);
      }
    },
    [companyId],
  );

  // entregadores distintos (driverRaw) + total de pacotes + match automatico
  const distinctDrivers = useMemo(() => {
    if (!result) return [] as { driverRaw: string; packages: number; match: DriverMatch }[];
    const packagesByRaw = new Map<string, number>();
    for (const r of result.rows) packagesByRaw.set(r.driverRaw, (packagesByRaw.get(r.driverRaw) ?? 0) + r.packages);
    return [...packagesByRaw.entries()]
      .map(([driverRaw, packages]) => ({ driverRaw, packages, match: matchDriver(driverRaw, drivers, aliases) }))
      .sort((a, b) => b.packages - a.packages);
  }, [result, drivers, aliases]);

  const needsReview = distinctDrivers.filter((d) => d.match.status !== 'matched');
  const autoCount = distinctDrivers.length - needsReview.length;

  const resolutionFor = useCallback(
    (driverRaw: string, match: DriverMatch): ImportResolution => {
      const manual = resolutions[driverRaw];
      if (manual) return manual;
      if (match.status === 'matched' && match.driverId) {
        const d = drivers.find((x) => x.id === match.driverId);
        return { kind: 'existing', driverId: match.driverId, driverName: d?.name ?? driverRaw, learnAlias: false };
      }
      return { kind: 'create', name: suggestName(driverRaw) };
    },
    [resolutions, drivers],
  );

  const items: ImportResolvedItem[] = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => ({
      driverRaw: r.driverRaw,
      aliasNorm: normalizeDriverName(r.driverRaw),
      city: r.city,
      platform: r.platform,
      packages: r.packages,
      resolution: resolutionFor(r.driverRaw, matchDriver(r.driverRaw, drivers, aliases)),
    }));
  }, [result, drivers, aliases, resolutionFor]);

  const summary = useMemo(() => summarizeDriverImport(items), [items]);

  const setResolution = (driverRaw: string, res: ImportResolution) =>
    setResolutions((prev) => ({ ...prev, [driverRaw]: res }));

  /** Valor do <select> de conferencia: 'create' | 'ignore' | driverId. */
  const selectValue = (driverRaw: string, match: DriverMatch): string => {
    const res = resolutionFor(driverRaw, match);
    if (res.kind === 'create') return 'create';
    if (res.kind === 'ignore') return 'ignore';
    return res.driverId;
  };

  const onSelectChange = (driverRaw: string, value: string) => {
    if (value === 'create') setResolution(driverRaw, { kind: 'create', name: suggestName(driverRaw) });
    else if (value === 'ignore') setResolution(driverRaw, { kind: 'ignore' });
    else {
      const d = drivers.find((x) => x.id === value);
      setResolution(driverRaw, { kind: 'existing', driverId: value, driverName: d?.name ?? '', learnAlias: true });
    }
  };

  const handleApply = async () => {
    if (!result || !periodId) {
      toast.error('Selecione o período de destino.');
      return;
    }
    setApplying(true);
    try {
      const r = await applyDriverImport(companyId, userId, periodId, source, items);
      toast.success(
        `Importado: ${formatInt(r.packagesApplied)} pacotes em ${r.driversAffected} driver(s); ${r.driversCreated} novo(s).`,
      );
      await onImported();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar planilha');
    } finally {
      setApplying(false);
    }
  };

  return (
    <ModalShell
      icon={<Upload className="w-5 h-5" />}
      title="Importar planilha da plataforma"
      subtitle="iMile / Shopee / Anjun — o sistema reconhece a planilha sozinho"
      onClose={onClose}
      maxWidth="sm:max-w-3xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          {result && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !periodId}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {applying ? 'Importando…' : `Importar ${formatInt(summary.packages)} pacotes`}
            </button>
          )}
        </>
      }
    >
      {!result ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Suba a planilha <b>crua</b> como sai do sistema da plataforma. O sistema identifica se é iMile, Shopee ou
            Anjun, conta os pacotes por entregador e cidade, e aplica a taxa já cadastrada.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-10 cursor-pointer hover:bg-gray-50">
            {parsing ? (
              <>
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="text-sm text-gray-600">Processando a planilha…</span>
                <span className="text-xs text-gray-400 text-center max-w-xs">
                  Arquivos grandes (Shopee, ~130 mil linhas) podem levar até 1 minuto. A tela continua respondendo.
                </span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                <span className="text-sm text-gray-600">Clique para escolher o arquivo (.xlsx / .xls)</span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={parsing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-sm text-blue-800">
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            Detectado: <b>{PLATFORM_LABEL[result.platform] ?? result.platform}</b> · {result.totalDrivers} entregadores ·{' '}
            {formatInt(result.totalPackages)} pacotes
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Período de destino</label>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            >
              {periods.length === 0 && <option value="">Nenhum período — crie um antes</option>}
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.status === 'concluido' ? '(concluído)' : '(aberto)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" /> {autoCount} entregador(es) reconhecido(s) automaticamente
          </div>

          {needsReview.length > 0 && (
            <div className="border border-amber-200 rounded-md">
              <div className="flex items-center gap-2 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 border-b border-amber-200">
                <AlertTriangle className="w-4 h-4" /> Precisa conferir ({needsReview.length}) — não reconhecidos
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {needsReview.map((d) => {
                  const val = selectValue(d.driverRaw, d.match);
                  const res = resolutionFor(d.driverRaw, d.match);
                  return (
                    <div key={d.driverRaw} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="min-w-0 sm:w-48 flex-shrink-0">
                        <div className="text-sm font-medium text-gray-900 break-words">{d.driverRaw}</div>
                        <div className="text-xs text-gray-500">
                          {formatInt(d.packages)} pct{d.match.status === 'ambiguous' ? ' · homônimo' : ''}
                        </div>
                      </div>
                      <select
                        value={val}
                        onChange={(e) => onSelectChange(d.driverRaw, e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm min-h-[36px]"
                      >
                        <option value="create">➕ Criar como novo driver</option>
                        <option value="ignore">🚫 Ignorar</option>
                        <optgroup label="Vincular a um driver existente">
                          {drivers.map((dr) => (
                            <option key={dr.id} value={dr.id}>
                              {dr.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      {res.kind === 'create' && (
                        <input
                          type="text"
                          value={res.name}
                          onChange={(e) => setResolution(d.driverRaw, { kind: 'create', name: e.target.value })}
                          placeholder="Nome do driver"
                          className="sm:w-52 px-2 py-1.5 border border-gray-300 rounded-md text-sm min-h-[36px]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            <Users className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>
              Vai lançar <b>{formatInt(summary.packages)}</b> pacotes em <b>{summary.driversAffected}</b> driver(s) ·
              criar <b>{summary.driversToCreate}</b> novo(s) · aprender <b>{summary.aliasesToLearn}</b> apelido(s)
              {summary.ignored > 0 ? <> · ignorar <b>{summary.ignored}</b></> : null}. Nada é gravado até clicar em
              Importar.
            </span>
          </div>
        </div>
      )}
    </ModalShell>
  );
};
