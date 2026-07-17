import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck,
  Package,
  Minus,
  Wallet,
  Check,
  Tag,
  Plus,
  FileText,
  Download,
  Upload,
  Loader2,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompany } from '../../contexts/CompanyContext';
import {
  Driver,
  DriverGroup,
  DriverPlatform,
  DriverPaymentPeriod,
  getPeriods,
  getDrivers,
  getPlatforms,
  getGroups,
  getDriverGroupMap,
  getPayments,
  upsertPackage,
  deletePackagesByRoute,
  renameRoutePackages,
  setNotaFiscal,
} from '../../services/driverPay';
import { exportDriverGeneralReportExcel } from '../../utils/driverReport';
import {
  DriverRowData,
  RowHandlers,
  buildRows,
  computeRowTotals,
  buildDriverMirrorData,
  buildGroupMirrorData,
  buildReportRows,
  planRateReapply,
  formatBRL,
  formatInt,
  MIRROR_COMPANY_NAME,
} from './driverPayShared';
import { DriverFilters, GROUP_NONE } from './DriverFilters';
import { DriverPeriodSelector } from './DriverPeriodSelector';
import { DriverList } from './DriverList';
import { DriverFormModal, type DriverRateChange } from './DriverFormModal';
import { DiscountModal } from './DiscountModal';
import { DiscountSearchModal } from './DiscountSearchModal';
import { ValeModal } from './ValeModal';
import { ZapexModal } from './ZapexModal';
import { GroupManagerModal } from './GroupManagerModal';
import { PlatformModal } from './PlatformModal';
import { PeriodCreateModal } from './PeriodCreateModal';
import { PeriodConcludeModal } from './PeriodConcludeModal';
import { DriverPaymentHistory } from './DriverPaymentHistory';
import { DriverImportModal } from './DriverImportModal';
import { PlatformImportModal } from './PlatformImportModal';
import { DriverMirrorPreviewDialog, type MirrorRequest } from './DriverMirrorPreviewDialog';

interface DriverPayTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

type KpiColor = 'blue' | 'purple' | 'red' | 'amber' | 'green';

const KPI_STYLES: Record<KpiColor, string> = {
  blue: 'bg-blue-50 border-blue-100 text-blue-800',
  purple: 'bg-purple-50 border-purple-200 text-purple-800',
  red: 'bg-red-50 border-red-100 text-red-800',
  amber: 'bg-amber-50 border-amber-100 text-amber-800',
  green: 'bg-green-50 border-green-100 text-green-800',
};
const KPI_ICON_COLOR: Record<KpiColor, string> = {
  blue: 'text-blue-600',
  purple: 'text-purple-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  green: 'text-green-600',
};

const KpiCard: React.FC<{ color: KpiColor; icon: React.ReactNode; label: string; value: string }> = ({
  color,
  icon,
  label,
  value,
}) => (
  <div className={`relative rounded-lg border p-4 ${KPI_STYLES[color]}`}>
    <span className={`absolute top-3 right-3 ${KPI_ICON_COLOR[color]}`}>{icon}</span>
    <div className="text-sm font-medium">{label}</div>
    <div className={`text-2xl font-bold mt-1.5 tabular-nums ${KPI_ICON_COLOR[color]}`}>{value}</div>
  </div>
);

export const DriverPayTab: React.FC<DriverPayTabProps> = ({ userId, hasPermission }) => {
  const { company } = useCompany();

  const [periods, setPeriods] = useState<DriverPaymentPeriod[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [platforms, setPlatforms] = useState<DriverPlatform[]>([]);
  const [groups, setGroups] = useState<DriverGroup[]>([]);
  const [rows, setRows] = useState<DriverRowData[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [view, setView] = useState<'list' | 'groups'>('list');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Modais
  const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; driver: Driver | null } | null>(null);
  const [discountRowId, setDiscountRowId] = useState<string | null>(null);
  const [valeRowId, setValeRowId] = useState<string | null>(null);
  const [zapexRowId, setZapexRowId] = useState<string | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [showConclude, setShowConclude] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPlatformImport, setShowPlatformImport] = useState(false);
  const [showDiscountSearch, setShowDiscountSearch] = useState(false);
  const [mirror, setMirror] = useState<MirrorRequest | null>(null);

  // Refs para leitura estavel em callbacks assincronos
  const driversRef = useRef<Driver[]>([]);
  const platformsRef = useRef<DriverPlatform[]>([]);
  const rowsRef = useRef<DriverRowData[]>([]);
  const selectedPeriodIdRef = useRef<string | null>(null);
  const isReadOnlyRef = useRef(false);

  useEffect(() => {
    driversRef.current = drivers;
  }, [drivers]);
  useEffect(() => {
    platformsRef.current = platforms;
  }, [platforms]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    selectedPeriodIdRef.current = selectedPeriodId;
  }, [selectedPeriodId]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );
  const isReadOnly = selectedPeriod?.status === 'concluido';
  useEffect(() => {
    isReadOnlyRef.current = isReadOnly;
  }, [isReadOnly]);

  // ── Carregamento ───────────────────────────────────────────────────────────

  const rebuildFromServer = useCallback(
    async (periodId: string | null) => {
      if (!company?.id || !periodId) {
        setRows([]);
        return;
      }
      const [pays, gmap] = await Promise.all([getPayments(periodId, company.id), getDriverGroupMap(company.id)]);
      setRows(buildRows(pays, driversRef.current, platformsRef.current, gmap));
    },
    [company?.id],
  );

  const refresh = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const [per, drv, plat, grp] = await Promise.all([
        getPeriods(company.id),
        getDrivers(company.id),
        getPlatforms(company.id),
        getGroups(company.id),
      ]);
      setPeriods(per);
      setDrivers(drv);
      setPlatforms(plat);
      setGroups(grp);
      driversRef.current = drv;
      platformsRef.current = plat;

      const prev = selectedPeriodIdRef.current;
      const chosen =
        prev && per.some((p) => p.id === prev)
          ? prev
          : per.find((p) => p.status === 'aberto')?.id ?? per[0]?.id ?? null;
      selectedPeriodIdRef.current = chosen;
      setSelectedPeriodId(chosen);

      if (chosen) {
        const [pays, gmap] = await Promise.all([getPayments(chosen, company.id), getDriverGroupMap(company.id)]);
        setRows(buildRows(pays, drv, plat, gmap));
      } else {
        setRows([]);
      }
    } catch (e) {
      console.error('Erro ao carregar Pagamentos Driver:', e);
      toast.error('Erro ao carregar dados de Pagamentos Driver');
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  const reloadPayments = useCallback(async () => {
    try {
      await rebuildFromServer(selectedPeriodIdRef.current);
    } catch (e) {
      console.error('Erro ao recarregar pagamentos:', e);
    }
  }, [rebuildFromServer]);

  // Reset total + recarga ao trocar de empresa (evita vazamento cross-empresa).
  useEffect(() => {
    setPeriods([]);
    setDrivers([]);
    setPlatforms([]);
    setGroups([]);
    setRows([]);
    setSelectedPeriodId(null);
    selectedPeriodIdRef.current = null;
    setSearch('');
    setRouteFilter('');
    setGroupFilter('');
    setView('list');
    setExpanded(new Set());
    setFormModal(null);
    setDiscountRowId(null);
    setValeRowId(null);
    setZapexRowId(null);
    setShowGroups(false);
    setShowPlatform(false);
    setShowCreatePeriod(false);
    setShowConclude(false);
    setShowHistory(false);
    setShowImport(false);
    setShowDiscountSearch(false);
    setMirror(null);
    refresh();
  }, [refresh]);

  const changePeriod = useCallback(
    async (periodId: string) => {
      setSelectedPeriodId(periodId);
      selectedPeriodIdRef.current = periodId;
      setExpanded(new Set());
      setLoading(true);
      try {
        await rebuildFromServer(periodId);
      } catch (e) {
        console.error('Erro ao carregar período:', e);
        toast.error('Erro ao carregar período');
      } finally {
        setLoading(false);
      }
    },
    [rebuildFromServer],
  );

  // ── Handlers de edicao da grade ──────────────────────────────────────────

  const onPackageChange = useCallback(
    (paymentId: string, routeIndex: number, platformName: string, value: number) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.paymentId !== paymentId) return r;
          const routes = r.routes.map((rl, i) =>
            i === routeIndex ? { ...rl, packages: { ...rl.packages, [platformName]: value } } : rl,
          );
          return { ...r, routes };
        }),
      );
    },
    [],
  );

  const onPackageBlur = useCallback(
    async (paymentId: string, routeIndex: number, platformName: string) => {
      if (isReadOnlyRef.current || !company?.id || !hasPermission('driverpay.editDriver')) return;
      const row = rowsRef.current.find((r) => r.paymentId === paymentId);
      const rl = row?.routes[routeIndex];
      if (!row || !rl) return;
      const packages = rl.packages[platformName] ?? 0;
      // Taxa POR ROTA: usa o rate desta rota (fallback no default por plataforma do driver).
      const rate = rl.rates[platformName] ?? row.ratesByPlatform[platformName] ?? 0;
      try {
        await upsertPackage(company.id, paymentId, platformName, rl.route, packages, rate, userId);
      } catch (e) {
        console.error('Erro ao salvar pacotes:', e);
        toast.error('Erro ao salvar pacotes');
        reloadPayments();
      }
    },
    [company?.id, hasPermission, userId, reloadPayments],
  );

  const onCityChange = useCallback((paymentId: string, routeIndex: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.paymentId !== paymentId) return r;
        const routes = r.routes.map((rl, i) => (i === routeIndex ? { ...rl, route: value } : rl));
        return { ...r, routes };
      }),
    );
  }, []);

  const onCityBlur = useCallback(
    async (paymentId: string, routeIndex: number, prevRoute: string) => {
      if (isReadOnlyRef.current || !company?.id || !hasPermission('driverpay.editDriver')) return;
      const row = rowsRef.current.find((r) => r.paymentId === paymentId);
      const rl = row?.routes[routeIndex];
      if (!row || !rl || rl.route === prevRoute) return;
      try {
        // Renomeia a rota de forma ATOMICA (um UPDATE do campo route), preservando
        // packages e rate_snapshot. Substitui o delete+reinsert nao-atomico que dependia
        // de packageIds locais (raiz da rota-fantasma/duplicata numa rota recem-criada).
        await renameRoutePackages(company.id, paymentId, prevRoute, rl.route, userId);
        await reloadPayments();
      } catch (e) {
        console.error('Erro ao renomear rota:', e);
        toast.error('Erro ao renomear rota');
        reloadPayments();
      }
    },
    [company?.id, hasPermission, userId, reloadPayments],
  );

  const onAddRoute = useCallback((paymentId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.paymentId === paymentId
          ? {
              ...r,
              // A nova rota herda a taxa padrao do driver por plataforma (ratesByPlatform,
              // que ja vem do ultimo periodo concluido), em vez de cair no fixo 2,00.
              routes: [...r.routes, { route: '', packages: {}, packageIds: {}, rates: { ...r.ratesByPlatform } }],
            }
          : r,
      ),
    );
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(paymentId);
      return next;
    });
  }, []);

  const onRemoveRoute = useCallback(
    async (paymentId: string, routeIndex: number) => {
      if (isReadOnlyRef.current || !company?.id) return;
      const row = rowsRef.current.find((r) => r.paymentId === paymentId);
      const rl = row?.routes[routeIndex];
      if (!row || !rl) return;
      try {
        // Apaga os pacotes da rota por (payment_id, route) — nao depende dos packageIds
        // locais (vazios numa rota recem-criada), entao a rota removida nao reaparece no
        // reload com o valor ainda somando no total a receber.
        await deletePackagesByRoute(company.id, paymentId, rl.route, userId);
        setRows((prev) =>
          prev.map((r) => {
            if (r.paymentId !== paymentId) return r;
            const routes = r.routes.filter((_, i) => i !== routeIndex);
            return {
              ...r,
              routes: routes.length ? routes : [{ route: r.route ?? '', packages: {}, packageIds: {}, rates: {} }],
            };
          }),
        );
        await reloadPayments();
      } catch (e) {
        console.error('Erro ao remover rota:', e);
        toast.error('Erro ao remover rota');
        reloadPayments();
      }
    },
    [company?.id, userId, reloadPayments],
  );

  // Taxa POR ROTA: atualiza o rate local da rota (reflete no total e no "vários" na hora).
  const onRateChange = useCallback(
    (paymentId: string, routeIndex: number, platformName: string, value: number) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.paymentId !== paymentId) return r;
          const routes = r.routes.map((rl, i) =>
            i === routeIndex ? { ...rl, rates: { ...rl.rates, [platformName]: value } } : rl,
          );
          return { ...r, routes };
        }),
      );
    },
    [],
  );

  const onRateBlur = useCallback(
    async (paymentId: string, routeIndex: number, platformName: string) => {
      if (isReadOnlyRef.current || !company?.id || !hasPermission('driverpay.editDriver')) return;
      const row = rowsRef.current.find((r) => r.paymentId === paymentId);
      const rl = row?.routes[routeIndex];
      if (!row || !rl) return;
      const packages = rl.packages[platformName] ?? 0;
      const rate = rl.rates[platformName] ?? row.ratesByPlatform[platformName] ?? 0;
      try {
        // Persiste a taxa DA ROTA como rate_snapshot do pacote (mesmo padrao do onPackageBlur).
        await upsertPackage(company.id, paymentId, platformName, rl.route, packages, rate, userId);
      } catch (e) {
        console.error('Erro ao salvar taxa da rota:', e);
        toast.error('Erro ao salvar taxa');
        reloadPayments();
      }
    },
    [company?.id, hasPermission, userId, reloadPayments],
  );

  const onToggleNota = useCallback(
    async (paymentId: string, current: boolean) => {
      if (!company?.id || !hasPermission('driverpay.editDriver')) return;
      // Atualiza otimista (check instantaneo) e persiste; em erro, recarrega e reverte.
      setRows((prev) => prev.map((r) => (r.paymentId === paymentId ? { ...r, notaFiscal: !current } : r)));
      try {
        await setNotaFiscal(company.id, paymentId, !current, userId);
        await reloadPayments();
      } catch (e) {
        console.error('Erro ao atualizar nota fiscal:', e);
        toast.error('Erro ao atualizar nota fiscal');
        reloadPayments();
      }
    },
    [company?.id, hasPermission, userId, reloadPayments],
  );

  const onToggleExpand = useCallback((paymentId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }, []);

  const onConfigDriver = useCallback((row: DriverRowData) => {
    const driver = driversRef.current.find((d) => d.id === row.driverId) ?? null;
    if (!driver) {
      toast.error('Cadastro do driver não encontrado');
      return;
    }
    setFormModal({ mode: 'edit', driver });
  }, []);

  const onDiscount = useCallback((row: DriverRowData) => setDiscountRowId(row.paymentId), []);
  const onVale = useCallback((row: DriverRowData) => setValeRowId(row.paymentId), []);
  const onZapex = useCallback((row: DriverRowData) => setZapexRowId(row.paymentId), []);

  const onMirror = useCallback(
    (row: DriverRowData) => {
      if (!company || !selectedPeriod) return;
      const data = buildDriverMirrorData(row, platformsRef.current, company, selectedPeriod);
      setMirror({ mode: 'individual', data });
    },
    [company, selectedPeriod],
  );

  const onGroupMirror = useCallback(
    (groupName: string, groupRows: DriverRowData[]) => {
      if (!company || !selectedPeriod) return;
      const data = buildGroupMirrorData(groupName, groupRows, platformsRef.current, company, selectedPeriod);
      setMirror({ mode: 'group', data });
    },
    [company, selectedPeriod],
  );

  const handlers: RowHandlers = useMemo(
    () => ({
      onPackageChange,
      onPackageBlur,
      onCityChange,
      onCityBlur,
      onAddRoute,
      onRemoveRoute,
      onRateChange,
      onRateBlur,
      onToggleNota,
      onConfigDriver,
      onDiscount,
      onVale,
      onZapex,
      onMirror,
      onToggleExpand,
    }),
    [
      onPackageChange,
      onPackageBlur,
      onCityChange,
      onCityBlur,
      onAddRoute,
      onRemoveRoute,
      onRateChange,
      onRateBlur,
      onToggleNota,
      onConfigDriver,
      onDiscount,
      onVale,
      onZapex,
      onMirror,
      onToggleExpand,
    ],
  );

  // ── Acoes de topo ──────────────────────────────────────────────────────────

  const handleDriverSaved = useCallback(
    async (driverId: string, rateChanges: DriverRateChange[]) => {
      // Reaplica ao periodo aberto SO as taxas que realmente mudaram no cadastro, e SO
      // nas rotas que ainda usavam a taxa antiga — preservando os overrides por rota
      // (taxa por rota). Se nenhuma taxa mudou (ex.: editou so PIX/telefone), nao toca
      // em nenhum pacote.
      if (company?.id && !isReadOnlyRef.current && rateChanges.length > 0) {
        const row = rowsRef.current.find((r) => r.driverId === driverId);
        if (row) {
          try {
            // planRateReapply preserva os overrides por rota: so reaplica onde a rota
            // ainda usava a taxa antiga (ver testes em driverPayRateReapply.spec.ts).
            const plan = planRateReapply(row.routes, row.ratesByPlatform, rateChanges);
            for (const it of plan) {
              await upsertPackage(company.id, row.paymentId, it.platformName, it.route, it.packages, it.newRate, userId);
            }
          } catch (e) {
            console.error('Erro ao aplicar novas taxas ao período:', e);
          }
        }
      }
      await refresh();
    },
    [company?.id, userId, refresh],
  );

  const handleMassMirror = () => {
    if (!company || !selectedPeriod) return;
    if (filteredRows.length === 0) {
      toast.error('Nenhum driver para gerar espelho');
      return;
    }
    const list = filteredRows.map((r) => buildDriverMirrorData(r, platforms, company, selectedPeriod));
    setMirror({ mode: 'mass', list });
  };

  const handleReport = async () => {
    if (!hasPermission('driverpay.exportReport')) {
      toast.error('Você não tem permissão para exportar o relatório');
      return;
    }
    if (filteredRows.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    try {
      const reportRows = buildReportRows(filteredRows, platforms);
      await exportDriverGeneralReportExcel(reportRows, {
        companyName: `${MIRROR_COMPANY_NAME}${company?.city ? ` — ${company.city}` : ''}`,
        periodLabel: selectedPeriod?.label ?? '',
        // Zapex vira coluna do relatório só quando algum driver do filtro tem Zapex
        // (buildReportRows preenche row.platforms['Zapex']; TOTAL PACOTES a inclui, como as demais).
        platforms: [
          ...platforms.map((p) => p.name),
          ...(filteredRows.some((r) => r.zapex.length > 0) ? ['Zapex'] : []),
        ],
      });
      toast.success('Relatório gerado');
    } catch (e) {
      console.error('Erro ao gerar relatório:', e);
      toast.error('Erro ao gerar relatório');
    }
  };

  const handlePeriodCreated = async (periodId: string) => {
    selectedPeriodIdRef.current = periodId;
    setSelectedPeriodId(periodId);
    await refresh();
  };

  const handleConcluded = async (nextPeriodId: string) => {
    selectedPeriodIdRef.current = nextPeriodId;
    setSelectedPeriodId(nextPeriodId);
    await refresh();
  };

  // ── Derivados ────────────────────────────────────────────────────────────

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (routeFilter) {
          const match = (r.route ?? '') === routeFilter || r.routes.some((rl) => rl.route === routeFilter);
          if (!match) return false;
        }
        if (groupFilter) {
          if (groupFilter === GROUP_NONE) {
            if (r.groupName) return false;
          } else if (r.groupName !== groupFilter) {
            return false;
          }
        }
        return true;
      }),
    [rows, search, routeFilter, groupFilter],
  );

  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.route) set.add(r.route);
      for (const rl of r.routes) if (rl.route) set.add(rl.route);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rows]);

  const groupOptions = useMemo(
    () => groups.map((g) => g.name).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [groups],
  );

  const kpis = useMemo(() => {
    let driverCount = 0;
    let packages = 0;
    let discounts = 0;
    let vales = 0;
    let net = 0;
    for (const r of filteredRows) {
      const t = computeRowTotals(r);
      driverCount += 1;
      packages += t.totalPackages;
      discounts += t.discounts;
      vales += t.vales;
      net += t.net;
    }
    return { driverCount, packages, discounts, vales, net };
  }, [filteredRows]);

  const allTotals = useMemo(() => {
    let net = 0;
    for (const r of rows) net += computeRowTotals(r).net;
    return { net, count: rows.length };
  }, [rows]);

  const discountRow = discountRowId ? rows.find((r) => r.paymentId === discountRowId) ?? null : null;
  const valeRow = valeRowId ? rows.find((r) => r.paymentId === valeRowId) ?? null : null;
  const zapexRow = zapexRowId ? rows.find((r) => r.paymentId === zapexRowId) ?? null : null;

  const canEditDriver = hasPermission('driverpay.editDriver');
  const canMirror = hasPermission('driverpay.generateMirror');

  if (!hasPermission('driverpay.view')) return null;

  if (!company) {
    return (
      <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando empresa…
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cabecalho */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" /> Pagamentos Driver
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Pagamento por pacote dos entregadores · quinzenal</p>
        </div>
        <DriverPeriodSelector
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          onSelect={changePeriod}
          onNewPeriod={() => setShowCreatePeriod(true)}
          onConclude={() => setShowConclude(true)}
          onHistory={() => setShowHistory(true)}
          canManagePeriods={hasPermission('driverpay.managePeriods')}
          canComplete={hasPermission('driverpay.complete')}
          canViewHistory={hasPermission('driverpay.viewHistory')}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard color="blue" icon={<Truck className="w-4 h-4" />} label="Drivers" value={formatInt(kpis.driverCount)} />
        <KpiCard color="purple" icon={<Package className="w-4 h-4" />} label="Pacotes" value={formatInt(kpis.packages)} />
        <KpiCard color="red" icon={<Minus className="w-4 h-4" />} label="Descontos" value={formatBRL(kpis.discounts)} />
        <KpiCard color="amber" icon={<Wallet className="w-4 h-4" />} label="Vales" value={formatBRL(kpis.vales)} />
        <KpiCard
          color="green"
          icon={<Check className="w-4 h-4" />}
          label="Total a receber"
          value={formatBRL(kpis.net)}
        />
      </div>

      {/* Painel */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <DriverFilters
          search={search}
          onSearch={setSearch}
          routeFilter={routeFilter}
          onRoute={setRouteFilter}
          routeOptions={routeOptions}
          groupFilter={groupFilter}
          onGroup={setGroupFilter}
          groupOptions={groupOptions}
          view={view}
          onView={setView}
        />

        <div className="px-3 sm:px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-2 bg-gray-50/60">
          {hasPermission('driverpay.manageGroups') && (
            <button
              type="button"
              onClick={() => setShowGroups(true)}
              className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Tag className="w-4 h-4" /> Gerenciar grupos
            </button>
          )}
          {hasPermission('driverpay.managePlatforms') && (
            <button
              type="button"
              onClick={() => setShowPlatform(true)}
              className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Plus className="w-4 h-4" /> Adicionar plataforma
            </button>
          )}
          {hasPermission('driverpay.createDriver') && (
            <>
              <button
                type="button"
                onClick={() => setFormModal({ mode: 'create', driver: null })}
                className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <Plus className="w-4 h-4" /> Novo driver
              </button>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <Upload className="w-4 h-4" /> Importar Excel
              </button>
              <button
                type="button"
                onClick={() => setShowPlatformImport(true)}
                className="px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <Upload className="w-4 h-4" /> Importar planilha
              </button>
            </>
          )}

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => setShowDiscountSearch(true)}
            className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Search className="w-4 h-4" /> Pacotes descontados
          </button>
          {canMirror && (
            <button
              type="button"
              onClick={handleMassMirror}
              className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <FileText className="w-4 h-4" /> Espelhos (em massa)
            </button>
          )}
          {hasPermission('driverpay.exportReport') && (
            <button
              type="button"
              onClick={handleReport}
              className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Download className="w-4 h-4" /> Relatório geral
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <DriverList
            rows={filteredRows}
            platforms={platforms}
            expanded={expanded}
            view={view}
            readOnly={isReadOnly}
            canEdit={canEditDriver}
            canConfig={canEditDriver}
            canDiscount={hasPermission('driverpay.manageDiscount')}
            canVale={hasPermission('driverpay.manageVale')}
            canMirror={canMirror}
            handlers={handlers}
            onGroupMirror={onGroupMirror}
          />
        )}
      </div>

      {isReadOnly && (
        <p className="text-center text-xs text-gray-500">
          Este período está concluído (somente leitura). Abra um período novo para lançar pagamentos.
        </p>
      )}

      {/* ── Modais ────────────────────────────────────────────────────────── */}
      {formModal && (
        <DriverFormModal
          mode={formModal.mode}
          driver={formModal.driver}
          platforms={platforms}
          companyId={company.id}
          userId={userId}
          hasPermission={hasPermission}
          onClose={() => setFormModal(null)}
          onSaved={handleDriverSaved}
        />
      )}

      {discountRow && (
        <DiscountModal
          row={discountRow}
          companyId={company.id}
          userId={userId}
          readOnly={isReadOnly}
          onClose={() => setDiscountRowId(null)}
          onChanged={reloadPayments}
        />
      )}

      {valeRow && (
        <ValeModal
          row={valeRow}
          companyId={company.id}
          userId={userId}
          readOnly={isReadOnly}
          onClose={() => setValeRowId(null)}
          onChanged={reloadPayments}
        />
      )}

      {zapexRow && (
        <ZapexModal
          row={zapexRow}
          userId={userId}
          readOnly={isReadOnly}
          hasPermission={hasPermission}
          onClose={() => setZapexRowId(null)}
          onChanged={reloadPayments}
        />
      )}

      {showGroups && (
        <GroupManagerModal
          companyId={company.id}
          userId={userId}
          groups={groups}
          drivers={drivers}
          platforms={platforms}
          onClose={() => setShowGroups(false)}
          onChanged={refresh}
        />
      )}

      {showPlatform && (
        <PlatformModal
          companyId={company.id}
          userId={userId}
          drivers={drivers}
          onClose={() => setShowPlatform(false)}
          onSaved={refresh}
        />
      )}

      {showCreatePeriod && (
        <PeriodCreateModal
          companyId={company.id}
          userId={userId}
          onClose={() => setShowCreatePeriod(false)}
          onCreated={handlePeriodCreated}
        />
      )}

      {showConclude && selectedPeriod && (
        <PeriodConcludeModal
          period={selectedPeriod}
          companyId={company.id}
          userId={userId}
          totalNet={allTotals.net}
          driverCount={allTotals.count}
          onClose={() => setShowConclude(false)}
          onConcluded={handleConcluded}
        />
      )}

      {showHistory && (
        <DriverPaymentHistory
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          onSelect={changePeriod}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showDiscountSearch && (
        <DiscountSearchModal companyId={company.id} onClose={() => setShowDiscountSearch(false)} />
      )}

      {showImport && (
        <DriverImportModal
          companyId={company.id}
          userId={userId}
          platforms={platforms}
          onClose={() => setShowImport(false)}
          onImported={refresh}
        />
      )}

      {showPlatformImport && (
        <PlatformImportModal
          companyId={company.id}
          userId={userId}
          onClose={() => setShowPlatformImport(false)}
          onImported={refresh}
        />
      )}

      {mirror && (
        <DriverMirrorPreviewDialog request={mirror} canGenerate={canMirror} onClose={() => setMirror(null)} />
      )}
    </div>
  );
};
