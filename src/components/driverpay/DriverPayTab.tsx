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
  X,
  Trash2,
  AlertTriangle,
  Link2,
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
  getAllDriverRates,
  reopenPeriod,
  getPlatforms,
  getGroups,
  getDriverGroupMap,
  getPayments,
  upsertPackage,
  deletePackagesByRoute,
  renameRoutePackages,
  setNotaFiscal,
  setEspelhoConferido,
  marcarEspelhoPorDispensa,
  publishDriverMirror,
  listMirrorPublications,
  unpublishDriverMirror,
  unpublishAllMirrorsForPeriod,
  listNotaFiscalFiles,
  type NotaFiscalFileRow,
  reconferirPrintsComPlanilha,
  listPaymentMarks,
  unmarkPayment,
  markPaymentDone,
  listDeductionLedger,
  recordDeductions,
  listCarryoverTo,
  listProofRequests,
  listDeliveryProofs,
  platformsWithProofHistory,
  requestProofForDrivers,
  type MirrorPublicationRow,
  type DeliveryProofRow,
} from '../../services/driverPay';
import { contemSemAcento } from '../../utils/buscaTexto';
import { pagamentosParaMarcarPorDispensa } from '../../utils/espelhoDispensa';
import { driversParaPedirPrint, plataformasQuePedemPrint } from '../../utils/proofAuto';
import { linhasForaDaConfig, diferencaEmReais } from '../../utils/rateSync';
import { abaterAgora, type ModoDesconto, type PessoaDesconto } from '../../utils/descontoSaldo';
import { exportDriverGeneralReportExcel, exportDriverSimpleReportExcel } from '../../utils/driverReport';
import { generateDriverMirrorPdf, generateDriverGroupMirrorPdf } from '../../utils/driverMirrorPdf';
import {
  DriverRowData,
  RowHandlers,
  buildRows,
  computeRowTotals,
  buildDriverMirrorData,
  buildGroupMirrorData,
  buildSelectionMirrorData,
  planejarPublicacao,
  seloDoBotao,
  printsRepetidos,
  passaNoFiltroDePagamento,
  type FiltroDePagamento,
  proofPrecisaAtencao,
  toggleValorDeFiltro,
  temTodasAsRotas,
  temTodasAsPlataformas,
  estaEmAlgumGrupo,
  buildLeaderReportRows,
  buildSimpleReportRows,
  planRateReapply,
  computeNfProgressByPayment,
  nfSlotKey,
  type MirrorPubForNf,
  deductionsOf,
  alreadyDeductedDrivers,
  formatBRL,
  formatInt,
  MIRROR_COMPANY_NAME,
  computeProofProgressByPayment,
  plataformasSemPlanilha,
  nfPrazoStatus,
  indexarMarcas,
  pagamentoDoDriver,
  jaPagosNoRelatorio,
  marcasDoRelatorio,
  type PaymentMark,
  proofForaPorSemGrupo,
  proofDispensadoSemPacote,
  platformPackages,
  expectedProofPlatforms,
  melhorEstado,
  proofStateFromRow,
  type ProofState,
  type ProofRequest,
  applyChecksFilter,
  type ChecksFilterOptions,
  type ChecksFilterResult,
} from './driverPayShared';
import { ReportOptionsModal, type ReportOptions } from './ReportOptionsModal';
import { DriverFilters, GROUP_NONE } from './DriverFilters';
import { DriverPeriodSelector } from './DriverPeriodSelector';
import { DriverList } from './DriverList';
import { DriverFormModal, type DriverRateChange } from './DriverFormModal';
import { DiscountModal } from './DiscountModal';
import { DiscountSearchModal } from './DiscountSearchModal';
import { ValeModal } from './ValeModal';
import { ZapexModal } from './ZapexModal';
import { MarkPaidModal } from './MarkPaidModal';
import { ClosedPeriodsDebtModal } from './ClosedPeriodsDebtModal';
import { GroupManagerModal } from './GroupManagerModal';
import { PlatformModal } from './PlatformModal';
import { EmittersModal } from './EmittersModal';
import { NotasRecebidasModal } from './NotasRecebidasModal';
import { SolicitarEspelhoModal } from './SolicitarEspelhoModal';
import { EspelhosRecebidosModal } from './EspelhosRecebidosModal';
import { PeriodCreateModal } from './PeriodCreateModal';
import { PeriodConcludeModal } from './PeriodConcludeModal';
import { PeriodEditModal } from './PeriodEditModal';
import { DriverPaymentHistory } from './DriverPaymentHistory';
import { DriverImportModal } from './DriverImportModal';
import { PlatformImportModal } from './PlatformImportModal';
import { DriverImportLinksModal } from './DriverImportLinksModal';
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
  <div className={`relative flex flex-col justify-between rounded-xl border shadow-sm p-4 min-h-[92px] ${KPI_STYLES[color]}`}>
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
  // Filtros de MARCAR VÁRIOS (05/08/2026). NÃO ficam salvos — recarregou, volta ao normal
  // (decisão do Victor): filtro grudado é a causa nº 1 de "sumiu gente da tela".
  const [routeFilter, setRouteFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [nfFilter, setNfFilter] = useState(''); // '' | 'pending' | 'ok'
  const [espelhoFilter, setEspelhoFilter] = useState(''); // '' | 'published' | 'unpublished'
  const [platFilter, setPlatFilter] = useState<string[]>([]); // vazio = todas
  const [conferidoFilter, setConferidoFilter] = useState(''); // '' | 'ok' | 'pending'
  const [pagamentoFilter, setPagamentoFilter] = useState<FiltroDePagamento>(''); // '' | 'pago' | 'nao_pago'
  const [view, setView] = useState<'list' | 'groups'>('list');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Seleção para "Espelhos da seleção" (grupos marcados + drivers avulsos).
  // Vive só na tela; zera ao trocar de período (useEffect abaixo).
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [selDrivers, setSelDrivers] = useState<Set<string>>(new Set());

  // Modais
  const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; driver: Driver | null } | null>(null);
  const [discountRowId, setDiscountRowId] = useState<string | null>(null);
  const [valeRowId, setValeRowId] = useState<string | null>(null);
  const [zapexRowId, setZapexRowId] = useState<string | null>(null);
  /** Driver (1 linha) ou grupo inteiro (N linhas) a marcar como pago manualmente (14/08/2026). */
  const [markPaidTarget, setMarkPaidTarget] = useState<{ rows: DriverRowData[]; title: string } | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showEmitters, setShowEmitters] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  // Espelho do app da Shopee (print da tela) — 04/08/2026
  const [showSolicitarEspelho, setShowSolicitarEspelho] = useState(false);
  const [showEspelhosRecebidos, setShowEspelhosRecebidos] = useState(false);
  /** Plataformas com print solicitado nesta quinzena. Vazio = ninguém pediu ainda. */
  const [proofRequests, setProofRequests] = useState<ProofRequest[]>([]);
  /** Estado do print por `driverId|plataforma`, pra pintar a coluna da grade. */
  const [proofStates, setProofStates] = useState<Map<string, ProofState>>(new Map());
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [showConclude, setShowConclude] = useState(false);
  const [editPeriodModal, setEditPeriodModal] = useState<{ period: DriverPaymentPeriod; confirmDelete: boolean } | null>(
    null,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPlatformImport, setShowPlatformImport] = useState(false);
  const [showImportLinks, setShowImportLinks] = useState(false);
  const [showDiscountSearch, setShowDiscountSearch] = useState(false);
  /** Saldo devedor de quinzenas fechadas (14/08/2026, sub-fase A). */
  const [showClosedDebt, setShowClosedDebt] = useState(false);
  const [mirror, setMirror] = useState<MirrorRequest | null>(null);
  // Drivers cobertos pelo espelho aberto — usados pra PUBLICAR no app (1 PDF por driver).
  const [publishRows, setPublishRows] = useState<DriverRowData[]>([]);
  const [publishScope, setPublishScope] = useState<'individual' | 'group' | 'selection'>('individual');
  // Fase 4: contexto do grupo aberto (nome/id/líder) — envio de grupo vai só pro líder.
  const [publishGroupInfo, setPublishGroupInfo] = useState<{ groupName: string; groupId: string | null; leaderId: string | null } | null>(null);
  // Espelhos já publicados no app neste período (selo "no app" + "já publicado" + o aviso
  // anti-desconto-duplo, que precisa saber se a publicação abateu os vales/perdas).
  const [publications, setPublications] = useState<MirrorPublicationRow[]>([]);
  // Opções do relatório (plataformas + abate): abre antes de baixar.
  const [reportModal, setReportModal] = useState<{ kind: 'geral' | 'simples' } | null>(null);
  // Notas do período por driver: CNPJs (emitterIds) com nota validada / recebida-não-rejeitada.
  // Alimenta a coluna NF (validadas/esperadas). Recarrega ao validar/recusar/excluir nota.
  const [nfByDriver, setNfByDriver] = useState<Map<string, { validated: Set<string>; received: Set<string> }>>(new Map());
  /** Linhas cruas dos prints — alimentam o numerozinho do botão "Espelhos recebidos". */
  const [proofRows, setProofRows] = useState<DeliveryProofRow[]>([]);
  /** Notas cruas da quinzena — só o filtro de PRAZO dos relatórios usa (04/08/2026). */
  const [nfFiles, setNfFiles] = useState<NotaFiscalFileRow[]>([]);
  /** Quem JA RECEBEU nesta quinzena, por (entregador, plataforma) — a tag de pago. */
  const [paymentMarks, setPaymentMarks] = useState<PaymentMark[]>([]);
  /**
   * Quanto de vale/perda ja foi abatido de cada entregador nesta quinzena (livro-caixa,
   * 07/08/2026). E o que faz pagar Shopee e depois eMile nao cobrar duas vezes.
   */
  const [deductionLedger, setDeductionLedger] = useState<Map<string, number>>(new Map());

  // Refs para leitura estavel em callbacks assincronos
  const driversRef = useRef<Driver[]>([]);
  const platformsRef = useRef<DriverPlatform[]>([]);
  const driverRatesRef = useRef<Record<string, Record<string, number>>>({});
  const periodsRef = useRef<DriverPaymentPeriod[]>([]);
  const rowsRef = useRef<DriverRowData[]>([]);
  const proofRequestsRef = useRef<ProofRequest[]>([]);
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
  // Pedidos de print numa ref: a marcação pós-importação roda dentro de um
  // `useCallback` e não pode depender do estado sem se recriar a cada render.
  useEffect(() => {
    proofRequestsRef.current = proofRequests;
  }, [proofRequests]);
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

  useEffect(() => {
    periodsRef.current = periods;
  }, [periods]);

  // ── Carregamento ───────────────────────────────────────────────────────────

  const rebuildFromServer = useCallback(
    async (periodId: string | null) => {
      if (!company?.id || !periodId) {
        setRows([]);
        return;
      }
      const [pays, gmap, carryoverIn] = await Promise.all([
        getPayments(periodId, company.id),
        getDriverGroupMap(company.id),
        listCarryoverTo(company.id, periodId),
      ]);
      const frozen = periodsRef.current.find((p) => p.id === periodId)?.status === 'concluido';
      setRows(buildRows(pays, driversRef.current, platformsRef.current, gmap, driverRatesRef.current, frozen, carryoverIn));
    },
    [company?.id],
  );

  const refresh = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const [per, drv, plat, grp, dRates] = await Promise.all([
        getPeriods(company.id),
        getDrivers(company.id),
        getPlatforms(company.id),
        getGroups(company.id),
        getAllDriverRates(company.id),
      ]);
      setPeriods(per);
      setDrivers(drv);
      setPlatforms(plat);
      setGroups(grp);
      driversRef.current = drv;
      platformsRef.current = plat;
      driverRatesRef.current = dRates;
      periodsRef.current = per;

      const prev = selectedPeriodIdRef.current;
      const chosen =
        prev && per.some((p) => p.id === prev)
          ? prev
          : per.find((p) => p.status === 'aberto')?.id ?? per[0]?.id ?? null;
      selectedPeriodIdRef.current = chosen;
      setSelectedPeriodId(chosen);

      if (chosen) {
        const [pays, gmap] = await Promise.all([getPayments(chosen, company.id), getDriverGroupMap(company.id)]);
        const frozen = per.find((p) => p.id === chosen)?.status === 'concluido';
        setRows(buildRows(pays, drv, plat, gmap, dRates, frozen));
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

  // Carrega quem já tem espelho publicado no app neste período (selo "no app").
  const reloadPublished = useCallback(
    async (periodId: string | null) => {
      if (!company?.id || !periodId) {
        setPublications([]);
        return;
      }
      try {
        setPublications(await listMirrorPublications(company.id, periodId));
        // Publicar/despublicar espelho lança e estorna no livro-caixa (07/08/2026), então
        // o saldo precisa ser relido junto — senão a próxima tela decide pelo valor velho.
        setDeductionLedger(await listDeductionLedger(company.id, periodId));
      } catch (e) {
        console.error('Erro ao carregar publicações do app:', e);
      }
    },
    [company?.id],
  );

  /** driver_ids com espelho publicado (derivado das publicações — selo "no app"). */
  const publishedDriverIds = useMemo(
    () => new Set(publications.map((p) => p.driverId)),
    [publications],
  );

  /**
   * Espelhos publicados por driver (28/07): com pagamento por plataforma um driver pode
   * ter VÁRIOS espelhos na mesma quinzena, e cada um pede a sua nota.
   */
  const pubsByDriver = useMemo(() => {
    const m = new Map<string, MirrorPubForNf[]>();
    for (const p of publications) {
      const arr = m.get(p.driverId);
      const item: MirrorPubForNf = { platformKey: p.platformKey, platformFilter: p.platformFilter };
      if (arr) arr.push(item);
      else m.set(p.driverId, [item]);
    }
    return m;
  }, [publications]);

  // Carrega as notas do período e monta, por driver, os CNPJs com nota validada / recebida
  // (não rejeitada). Alimenta a coluna NF (validadas/esperadas, ciente de grupo).
  /**
   * Carrega o estado do ESPELHO DO APP (print da Shopee) da quinzena.
   *
   * Um driver pode ter mandado mais de um print pra mesma plataforma (reenvio
   * depois de recusa), então `melhorEstado` decide qual vale — ver a regra lá.
   */
  const reloadProofs = useCallback(
    async (periodId: string | null) => {
      if (!company?.id || !periodId) {
        setProofRequests([]);
        setProofRows([]);
        setProofStates(new Map());
        return;
      }
      try {
        const [solicitadas, prints] = await Promise.all([
          listProofRequests(company.id, periodId),
          listDeliveryProofs(company.id, periodId),
        ]);
        const porSlot = new Map<string, ProofState[]>();
        for (const p of prints) {
          const k = `${p.driverId}|${p.platformName}`;
          const lista = porSlot.get(k) ?? [];
          lista.push(proofStateFromRow({ status: p.status, checkStatus: p.checkStatus }));
          porSlot.set(k, lista);
        }
        setProofRequests(solicitadas);
        setProofRows(prints);
        setProofStates(new Map([...porSlot].map(([k, v]) => [k, melhorEstado(v)])));
      } catch (e) {
        console.error('Erro ao carregar os espelhos do app:', e);
      }
    },
    [company?.id],
  );

  /**
   * Depois de IMPORTAR A PLANILHA: fecha a conta dos prints que estavam esperando ela.
   *
   * O print pode chegar ANTES da planilha (feature de 04/08) — nesse momento nao ha
   * quantidade pra comparar, entao ele fica lido mas sem veredito e o espelho NAO e
   * marcado. Quando a planilha entra, é aqui que a conta fecha: usa o numero que a IA JA
   * LEU, sem baixar foto e sem chamar a IA de novo (exigencia do Victor: nao travar a fila
   * nem a cota). Sem isto o print ficava "recebido" pra sempre — e a janela de solicitar
   * ja PROMETIA que isso aconteceria sozinho.
   */
  const refreshComReconferencia = useCallback(async () => {
    await refresh();
    const periodId = selectedPeriodIdRef.current;
    if (!company?.id || !periodId) return;
    try {
      // ── Quem NÃO ENTREGA na plataforma já entra como conferido (05/08/2026) ──
      // Com a planilha importada, quem ficou com ZERO pacote não manda print — e o
      // Victor decidiu que isso CONTA como validado, senão a equipe fica marcando um
      // por um. Usa a MESMA regra do selo "não entrega": se divergissem, o painel
      // diria "não entrega" e ainda assim cobraria o espelho.
      // `semPlanilha` sai das MESMAS fontes do memo da tela (linhas + plataformas),
      // recalculado aqui porque este callback lê tudo por ref.
      const semPlanilhaAgora = plataformasSemPlanilha(
        rowsRef.current,
        platformsRef.current.map((p) => p.name),
      );
      const paraMarcar = pagamentosParaMarcarPorDispensa(
        rowsRef.current,
        (row) => expectedProofPlatforms(row, proofRequestsRef.current, semPlanilhaAgora),
        (row) => proofDispensadoSemPacote(row, proofRequestsRef.current, semPlanilhaAgora),
      );
      const marcados = await marcarEspelhoPorDispensa(company.id, paraMarcar, userId);
      if (marcados > 0) {
        toast.success(`${marcados} entregador(es) sem entrega na plataforma — espelho marcado sozinho.`, { duration: 7000 });
      }

      // ── Quem TEM pacote e não mandou print já é cobrado sozinho (05/08/2026) ──
      // Pedido do Victor: "quando subir a planilha da shopee, todo usuário que tiver
      // pacote da shopee e ainda não tiver mandado o print, o sistema pedir de forma
      // automática". Antes, alguém tinha que lembrar de clicar em "Solicitar espelho"
      // depois de cada importação — e quem entrasse na planilha DEPOIS do clique ficava
      // sem pedido nenhum: nem o app pedia, nem o painel cobrava.
      const [pedidosAgora, printsAgora, historico] = await Promise.all([
        listProofRequests(company.id, periodId),
        listDeliveryProofs(company.id, periodId),
        platformsWithProofHistory(company.id),
      ]);
      const comPlanilha = platformsRef.current
        .map((p) => p.name)
        .filter((nome) => !semPlanilhaAgora.has(nome));
      let pedidosCriados = 0;
      for (const plat of plataformasQuePedemPrint(comPlanilha, historico)) {
        const temPedidoGeral = pedidosAgora.some((r) => r.platformName === plat && r.driverId === null);
        const jaPedidoIndividual = new Set(
          pedidosAgora.filter((r) => r.platformName === plat && r.driverId).map((r) => r.driverId as string),
        );
        const jaMandaram = new Set(
          printsAgora.filter((p) => p.platformName === plat).map((p) => p.driverId),
        );
        const ids = driversParaPedirPrint(
          rowsRef.current,
          (row) => platformPackages(row, plat) > 0,
          // ⚠️ Quem NÃO está em grupo continua de fora, igual ao pedido "pra todos"
          // (decisão dele em 04/08: quem anexa é o líder). O automático não é lugar
          // de mudar essa regra por conta própria.
          (row) => row.groupName === null
            || (temPedidoGeral ? row.groupName !== null : jaPedidoIndividual.has(row.driverId)),
          (row) => jaMandaram.has(row.driverId),
        );
        pedidosCriados += await requestProofForDrivers(company.id, periodId, plat, ids, userId);
      }
      if (pedidosCriados > 0) {
        toast.success(
          `${pedidosCriados} entregador(es) com pacote e sem print — o app já está pedindo o espelho deles.`,
          { duration: 8000 },
        );
        await reloadProofs(periodId);
      }

      const r = await reconferirPrintsComPlanilha(company.id, periodId, userId);
      if (r.conferidos > 0 || r.divergentes > 0) {
        toast.success(
          `Prints reconferidos com a planilha: ${r.conferidos} bateram (espelho marcado)` +
          `${r.divergentes ? ` · ${r.divergentes} com quantidade diferente pra voce olhar` : ''}.`,
          { duration: 9000 },
        );
        await reloadProofs(periodId);
      }
    } catch (e) {
      // Falha aqui NAO pode estragar a importacao, que ja terminou e deu certo.
      console.error('[reconferencia] falhou depois da importacao:', e);
      toast.error('A planilha entrou, mas nao consegui reconferir os prints. Abra "Espelhos recebidos".');
    }
  }, [refresh, company?.id, userId, reloadProofs]);


  const reloadNotes = useCallback(
    async (periodId: string | null) => {
      if (!company?.id || !periodId) {
        setNfByDriver(new Map());
        setNfFiles([]);
        setPaymentMarks([]);
        return;
      }
      try {
        const files = await listNotaFiscalFiles(company.id, periodId);
        const map = new Map<string, { validated: Set<string>; received: Set<string> }>();
        for (const f of files) {
          let e = map.get(f.driverId);
          if (!e) {
            e = { validated: new Set(), received: new Set() };
            map.set(f.driverId, e);
          }
          // 28/07: a chave e (espelho, CNPJ) — duas notas no mesmo CNPJ, uma por espelho,
          // contam separado. Nota antiga (sem espelho) vira '*' e vale pro CNPJ inteiro.
          const chave = nfSlotKey(f.mirrorPlatformKey, f.emitterId);
          if (f.status === 'validada') {
            e.validated.add(chave);
            e.received.add(chave);
          } else if (f.status !== 'rejeitada') {
            e.received.add(chave);
          }
        }
        setNfByDriver(map);
        setNfFiles(files);
        setPaymentMarks(await listPaymentMarks(company.id, periodId));
        setDeductionLedger(await listDeductionLedger(company.id, periodId));
      } catch (e) {
        console.error('Erro ao carregar notas do período:', e);
      }
    },
    [company?.id],
  );

  // Recarrega "publicado no app" + notas ao trocar de período (e de empresa via dep).
  useEffect(() => {
    reloadPublished(selectedPeriodId);
    reloadNotes(selectedPeriodId);
    reloadProofs(selectedPeriodId);
  }, [selectedPeriodId, reloadPublished, reloadNotes, reloadProofs]);

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
    setRouteFilter([]);
    setGroupFilter([]);
    setNfFilter('');
    setEspelhoFilter('');
    setPlatFilter([]);
    setConferidoFilter('');
    setPagamentoFilter('');
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

  /**
   * Desfaz a marca de "pago" (04/08/2026, pedido do Victor).
   *
   * A marca nasce sozinha ao gerar relatório — foi assim que a MARIZE apareceu como paga
   * numa geração feita só pra conferir o layout. Pede confirmação porque, ao contrário do
   * espelho conferido, isto é registro de DINHEIRO: apagar sem querer faz o entregador
   * parecer não pago no fechamento.
   */
  const onDesmarcarPagamento = useCallback(
    async (driverId: string, driverName: string) => {
      if (!company?.id || !selectedPeriod || !hasPermission('driverpay.editDriver')) return;
      const ok = window.confirm(
        `Desmarcar o pagamento de ${driverName} nesta quinzena?\n\n` +
          'A etiqueta "pago" some e ele volta a aparecer como não pago. ' +
          'O valor a receber e os lançamentos NÃO mudam — isto é só a marca de que ele já saiu.',
      );
      if (!ok) return;
      try {
        const n = await unmarkPayment(company.id, selectedPeriod.id, driverId, userId);
        if (n === 0) toast('Este entregador já não estava marcado como pago.', { icon: 'ℹ️' });
        else toast.success(`Pagamento de ${driverName} desmarcado.`);
        setPaymentMarks(await listPaymentMarks(company.id, selectedPeriod.id));
      } catch (e) {
        console.error('Erro ao desmarcar pagamento:', e);
        toast.error(e instanceof Error ? e.message : 'Erro ao desmarcar pagamento');
      }
    },
    [company?.id, selectedPeriod, hasPermission, userId],
  );

  const onToggleEspelho = useCallback(
    async (paymentId: string, current: boolean) => {
      if (!company?.id || !hasPermission('driverpay.editDriver')) return;
      // Atualiza otimista (linha fica verde na hora) e persiste; em erro, recarrega e reverte.
      setRows((prev) => prev.map((r) => (r.paymentId === paymentId ? { ...r, espelhoConferido: !current } : r)));
      try {
        await setEspelhoConferido(company.id, paymentId, !current, userId);
        await reloadPayments();
      } catch (e) {
        console.error('Erro ao atualizar espelho conferido:', e);
        toast.error('Erro ao atualizar espelho conferido');
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
      setPublishRows([row]);
      setPublishScope('individual');
      setMirror({ mode: 'individual', data });
    },
    [company, selectedPeriod],
  );

  const onGroupMirror = useCallback(
    (groupName: string, groupRows: DriverRowData[]) => {
      if (!company || !selectedPeriod) return;
      const data = buildGroupMirrorData(groupName, groupRows, platformsRef.current, company, selectedPeriod);
      const grp = groups.find((g) => g.name === groupName);
      setPublishRows(groupRows);
      setPublishScope('group');
      setPublishGroupInfo({ groupName, groupId: grp?.id ?? null, leaderId: grp?.leader_driver_id ?? null });
      setMirror({ mode: 'group', data });
    },
    [company, selectedPeriod, groups],
  );

  /** Abre o modal de "marcar pago manual" pra UM driver (14/08/2026). */
  const onMarkPaid = useCallback(
    (row: DriverRowData) => setMarkPaidTarget({ rows: [row], title: row.name }),
    [],
  );
  /** Mesmo modal, mas cobrindo TODOS os membros do grupo de uma vez. */
  const onGroupMarkPaid = useCallback(
    (groupName: string, groupRows: DriverRowData[]) => setMarkPaidTarget({ rows: groupRows, title: groupName }),
    [],
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
      onToggleEspelho,
      onDesmarcarPagamento,
      onConfigDriver,
      onDiscount,
      onVale,
      onZapex,
      onMirror,
      onToggleExpand,
      onMarkPaid,
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
      onToggleEspelho,
      onDesmarcarPagamento,
      onConfigDriver,
      onDiscount,
      onVale,
      onZapex,
      onMirror,
      onToggleExpand,
      onMarkPaid,
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

      // ══════════════════════════════════════════════════════════════════════
      // VALOR QUE NÃO ALTERAVA DE JEITO NENHUM (05/08/2026)
      //
      // Relato do Victor: *"na config está 2.50, no grupo 2.5, mas está 2 reais a
      // LOGGI e não altera"*. A reaplicação acima só mexe no que MUDOU no cadastro e
      // só onde a rota ainda estava no valor antigo — então uma linha que ficou pra
      // trás (veio da planilha com o padrão da plataforma e depois a config subiu)
      // não era alcançada por caminho nenhum: nem perfil, nem grupo. Eram 12 linhas
      // de LOGGI presas em R$ 2,00.
      //
      // Aqui a divergência é MOSTRADA e ele decide. Sincronizar sozinho seria pior:
      // salvar um PIX passaria por cima dos preços combinados por rota que existem
      // de verdade (rotas "Dom Lara", "Coleta", "LOGGI QUARTEL").
      // ══════════════════════════════════════════════════════════════════════
      if (company?.id && !isReadOnlyRef.current) {
        const row = rowsRef.current.find((r) => r.driverId === driverId);
        const fora = row ? linhasForaDaConfig(row.routes, row.ratesByPlatform) : [];
        if (row && fora.length > 0) {
          const dif = diferencaEmReais(fora);
          const linhas = [
            `O valor gravado nesta quinzena está diferente do cadastro de ${row.name}:`,
            '',
            ...fora.map((l) => `• ${l.platformName}${l.route ? ` (${l.route})` : ''}: ${l.packages} pacote(s) a ${formatBRL(l.de)} → ${formatBRL(l.para)}`),
            '',
            `Atualizar? O total a receber dele ${dif >= 0 ? 'sobe' : 'cai'} ${formatBRL(Math.abs(dif))}.`,
            'Se algum desses valores foi combinado pra aquela rota, clique em Cancelar.',
          ];
          if (window.confirm(linhas.join('\n'))) {
            try {
              for (const l of fora) {
                await upsertPackage(company.id, row.paymentId, l.platformName, l.route, l.packages, l.para, userId);
              }
              toast.success(`Valor atualizado em ${fora.length} linha(s).`);
            } catch (e) {
              console.error('Erro ao sincronizar o valor por pacote:', e);
              toast.error('Não consegui atualizar o valor dos pacotes.');
            }
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
    setPublishRows(filteredRows);
    setPublishScope('individual');
    setMirror({ mode: 'mass', list });
  };

  // ── Espelhos da seleção (grupos e/ou drivers marcados) ────────────────────
  const toggleSelGroup = useCallback((name: string) => {
    setSelGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const toggleSelDriver = useCallback((paymentId: string) => {
    setSelDrivers((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }, []);
  const clearMirrorSelection = () => {
    setSelGroups(new Set());
    setSelDrivers(new Set());
  };
  // Zera a seleção ao trocar de período (os paymentIds são de outro período).
  useEffect(() => {
    setSelGroups(new Set());
    setSelDrivers(new Set());
  }, [selectedPeriodId]);

  const handleSelectionMirror = () => {
    if (!company || !selectedPeriod) return;
    const { groups, singles } = buildSelectionMirrorData(
      filteredRows,
      selGroups,
      selDrivers,
      platforms,
      company,
      selectedPeriod,
    );
    if (groups.length === 0 && singles.length === 0) {
      toast.error('Marque pelo menos um grupo ou driver para gerar os espelhos');
      return;
    }
    // Publicar = 1 espelho individual por driver coberto (membros de grupos marcados + avulsos).
    const covered = filteredRows.filter(
      (r) => selDrivers.has(r.paymentId) || selGroups.has(r.groupName ?? 'Sem grupo'),
    );
    setPublishRows(covered);
    setPublishScope('selection');
    setMirror({ mode: 'selection', groups, singles });
  };

  /**
   * Quanto abater de cada pessoa (driverId -> R$) num conjunto de linhas (07/08/2026).
   *
   * Usa o livro-caixa: quem ja foi descontado vem com 0, quem deve vem com o que CABE no
   * que ele recebe nas plataformas do escopo. Mesma regra pura do relatorio — o espelho e o
   * papel que o entregador recebe, entao os dois numeros tem que nascer do mesmo lugar.
   */
  const mapaDeAbate = useCallback(
    (linhas: DriverRowData[], allowedSet: Set<string> | undefined, modo: ModoDesconto) => {
      const m = new Map<string, number>();
      for (const r of linhas) {
        // includeDeductions=false: aqui interessa o BRUTO das plataformas do escopo.
        const t = computeRowTotals(r, allowedSet, false);
        m.set(r.driverId, abaterAgora(
          modo,
          { total: deductionsOf(r), jaAbatido: deductionLedger.get(r.driverId) ?? 0 },
          t.packagesAmount + t.zapex,
        ));
      }
      return m;
    },
    [deductionLedger],
  );

  // Publica no app do driver: 1 PDF INDIVIDUAL por driver coberto (cada um ve o seu).
  // `allowed` = plataformas incluidas (filtro D3); null/vazio = todas.
  // `modo` = como abater vale/perda (07/08/2026): `pendentes` decide PESSOA POR PESSOA.
  // A escolha vai GRAVADA na publicacao, junto com o TOTAL IMPRESSO — a conferencia
  // automatica da NF passa a LER esse total em vez de recalcular por formula (com abate
  // parcial a formula esperaria o abate cheio e recusaria a nota certa).
  const onPublish = useCallback(
    async (allowed: string[] | null, modo: ModoDesconto, nfDueAt: string | null) => {
      if (!company || !selectedPeriod) return;
      const targets = publishRows;
      if (targets.length === 0) {
        toast.error('Nada para publicar');
        return;
      }
      const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : undefined;
      const filter = allowed && allowed.length > 0 ? allowed : null;
      const includeDeductions = modo !== 'nenhum';
      const abate = mapaDeAbate(targets, allowedSet, modo);
      // As linhas do livro-caixa de UMA publicacao: so quem realmente teve abate.
      const abatesDe = (linhas: DriverRowData[]) => linhas
        .map((r) => ({ driverId: r.driverId, amount: abate.get(r.driverId) ?? 0 }))
        .filter((d) => d.amount > 0);

      // Fase 4: envio de GRUPO = 1 PDF do grupo, só pro LÍDER (regra do Victor).
      if (publishScope === 'group') {
        const info = publishGroupInfo;
        if (!info?.leaderId) {
          toast.error('Defina o líder do grupo em "Gerenciar grupos" antes de publicar no app.');
          return;
        }
        try {
          const data = buildGroupMirrorData(
            info.groupName, targets, platformsRef.current, company, selectedPeriod, allowedSet,
            includeDeductions, abate,
          );
          const blob = await generateDriverGroupMirrorPdf(data, { compact: false });
          await publishDriverMirror({
            companyId: company.id, periodId: selectedPeriod.id, driverId: info.leaderId,
            scope: 'group', groupId: info.groupId, platformFilter: filter, includeDeductions, nfDueAt,
            printedTotal: data.groupTotals.toReceive, deductions: abatesDe(targets),
            pdf: blob, userId,
          });
          toast.success('Espelho do grupo publicado para o líder.');
          await reloadPublished(selectedPeriod.id);
          setMirror(null);
        } catch (e) {
          console.error('Falha ao publicar espelho de grupo', e);
          toast.error('Não consegui publicar o espelho do grupo.');
        }
        return;
      }

      // ESPELHO É SEMPRE DO GRUPO, SEMPRE PRO LÍDER (decisão do Victor, 04/08/2026).
      // A regra mora em `planejarPublicacao` — a MESMA função que monta o aviso da tela,
      // pra prévia e publicação nunca mais discordarem.
      const plano = planejarPublicacao(targets, groups);

      let ok = 0;
      let fail = 0;

      for (const g of plano.grupos) {
        try {
          const data = buildGroupMirrorData(
            g.groupName, g.membros, platformsRef.current, company, selectedPeriod, allowedSet,
            includeDeductions, abate,
          );
          const blob = await generateDriverGroupMirrorPdf(data, { compact: false });
          await publishDriverMirror({
            companyId: company.id, periodId: selectedPeriod.id, driverId: g.leaderId,
            scope: 'group', groupId: g.groupId,
            platformFilter: filter, includeDeductions, nfDueAt,
            printedTotal: data.groupTotals.toReceive, deductions: abatesDe(g.membros),
            pdf: blob, userId,
          });
          ok += 1;
        } catch (e) {
          fail += 1;
          console.error('Falha ao publicar espelho do grupo', g.groupName, e);
        }
      }

      for (const row of plano.avulsos) {
        try {
          const data = buildDriverMirrorData(
            row, platformsRef.current, company, selectedPeriod, allowedSet, includeDeductions,
            abate.get(row.driverId),
          );
          const blob = await generateDriverMirrorPdf(data);
          await publishDriverMirror({
            companyId: company.id,
            periodId: selectedPeriod.id,
            driverId: row.driverId,
            scope: 'individual',
            platformFilter: filter,
            includeDeductions,
            nfDueAt,
            printedTotal: data.totals.toReceive,
            deductions: abatesDe([row]),
            pdf: blob,
            userId,
          });
          ok++;
        } catch (e) {
          fail++;
          console.error('Falha ao publicar espelho de', row.name, e);
        }
      }
      if (plano.semLider.length > 0) {
        toast.error(
          `${plano.semLider.length} grupo(s) SEM LÍDER definido não foram publicados: ` +
          `${plano.semLider.join(', ')}. Defina o líder em "Gerenciar grupos".`,
          { duration: 12000 },
        );
      }
      if (ok > 0) {
        toast.success(
          `${ok} espelho(s) publicado(s): ${plano.grupos.length} de grupo (vão pro líder)` +
          `${plano.avulsos.length ? ` e ${plano.avulsos.length} individual(is) de quem não tem grupo` : ''}` +
          `${fail ? ` · ${fail} falharam` : ''}.`,
          { duration: 10000 },
        );
      } else if (plano.semLider.length === 0) {
        toast.error('Não consegui publicar. Tente de novo.');
      }
      if (ok > 0) await reloadPublished(selectedPeriod.id);
      if (fail === 0) setMirror(null);
    },
    // `mapaDeAbate` na lista de propósito: ele carrega o livro-caixa. Sem isso, publicar
    // depois de um pagamento usaria o saldo VELHO e descontaria de novo de quem já pagou.
    [company, selectedPeriod, publishRows, publishScope, publishGroupInfo, userId, reloadPublished, groups, mapaDeAbate],
  );

  // Despublica o espelho ABERTO no diálogo (individual = o driver; grupo = o líder).
  const onUnpublishCurrent = useCallback(async () => {
    if (!company || !selectedPeriod) return;
    const driverId =
      publishScope === 'group' ? publishGroupInfo?.leaderId ?? null : publishRows[0]?.driverId ?? null;
    if (!driverId) {
      toast.error('Não encontrei o destinatário deste espelho.');
      return;
    }
    await unpublishDriverMirror(company.id, selectedPeriod.id, driverId, userId);
    await reloadPublished(selectedPeriod.id);
    toast.success('Espelho despublicado — o driver não vê mais no app.');
    setMirror(null);
  }, [company, selectedPeriod, publishScope, publishGroupInfo, publishRows, userId, reloadPublished]);

  // Despublica TODOS os espelhos do período (limpeza em massa).
  const handleUnpublishAll = useCallback(async () => {
    if (!company || !selectedPeriod) return;
    if (
      !window.confirm(
        `Despublicar TODOS os espelhos do período "${selectedPeriod.label}"? ` +
          'Todos os drivers deixam de ver o espelho no app. Você pode publicar de novo depois.',
      )
    )
      return;
    try {
      const n = await unpublishAllMirrorsForPeriod(company.id, selectedPeriod.id, userId);
      await reloadPublished(selectedPeriod.id);
      toast.success(n > 0 ? `${n} espelho(s) despublicado(s) do app.` : 'Nada estava publicado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao despublicar todos.');
    }
  }, [company, selectedPeriod, userId, reloadPublished]);

  // Escopo do relatório: se há grupos/drivers marcados (seleção), só eles; senão, o filtro atual.
  const reportScopeRows = (): DriverRowData[] =>
    selCount === 0
      ? filteredRows
      : filteredRows.filter((r) => selDrivers.has(r.paymentId) || selGroups.has(r.groupName ?? 'Sem grupo'));
  const reportMeta = () => ({
    companyName: `${MIRROR_COMPANY_NAME}${company?.city ? ` — ${company.city}` : ''}`,
    periodLabel: selectedPeriod?.label ?? '',
  });

  /** Abre a janela de opções do relatório (plataformas + descontar vales/perdas). */
  const openReport = (kind: 'geral' | 'simples') => {
    if (!hasPermission('driverpay.exportReport')) {
      toast.error('Você não tem permissão para exportar o relatório');
      return;
    }
    if (reportScopeRows().length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    setReportModal({ kind });
  };

  /**
   * Gera o relatório com as opções escolhidas (2026-07-27):
   *  - GERAL: líder como recebedor do grupo (regra da NF), dividido por rota e plataforma;
   *  - SIMPLES: A nome do líder (sem acento) · B valor · C chave PIX · D obs (quinzena).
   * Escopo = seleção (se houver) ou o filtro atual da lista. Sem filtro de plataforma e com
   * o abate marcado, o arquivo sai idêntico ao de antes desta feature.
   */
  const handleGenerateReport = async (opts: ReportOptions) => {
    const kind = reportModal?.kind ?? 'geral';
    const inScope = reportScopeRows();
    if (inScope.length === 0) {
      toast.error('Nenhum dado para exportar');
      return;
    }
    // Filtro de conferência (04/08/2026), driver a driver — "paga o resto": num grupo,
    // quem está pendente sai e o líder continua recebendo pelos que passaram.
    // Já pagos que o operador tirou na própria janela (04/08/2026).
    const removidos = new Set(opts.excluirDriverIds);
    const inScopeSemRemovidos = removidos.size > 0
      ? inScope.filter((r) => !removidos.has(r.driverId))
      : inScope;
    const checks = applyChecksFilter(inScopeSemRemovidos, nfCompleteByPayment, leaderNameByGroup, {
      onlyEspelhoConferido: opts.onlyEspelhoConferido,
      onlyNfValidada: opts.onlyNfValidada,
      onlyNfNoPrazo: opts.onlyNfNoPrazo,
    }, nfNoPrazoByPayment);
    const scoped = checks.kept;
    if (scoped.length === 0) {
      toast.error('Ninguém do escopo está com o espelho/nota conferidos');
      return;
    }
    const allowedSet = opts.allowed && opts.allowed.length > 0 ? new Set(opts.allowed) : undefined;
    // `deductionByDriver` (07/08/2026) manda em cima do `includeDeductions`, pessoa por
    // pessoa: quem já foi descontado vem com 0, quem deve vem com o que cabe no que recebe.
    const buildOpts = {
      allowedPlatformNames: allowedSet,
      includeDeductions: opts.includeDeductions,
      deductionByDriver: opts.modoDesconto === 'pendentes' ? opts.deductionByDriver : undefined,
    };
    const filterLabel = opts.allowed && opts.allowed.length > 0 ? opts.allowed.join(' + ') : null;
    const scopedPlatformNames = (opts.allowed && opts.allowed.length > 0
      ? platforms.filter((p) => allowedSet?.has(p.name))
      : platforms
    ).map((p) => p.name);
    const checksParts: string[] = [];
    if (opts.onlyEspelhoConferido) checksParts.push('espelho conferido');
    if (opts.onlyNfValidada) checksParts.push('nota validada');
    if (opts.onlyNfNoPrazo) checksParts.push('nota no prazo');
    const meta = {
      ...reportMeta(),
      platformFilterLabel: filterLabel,
      deductionsApplied: opts.includeDeductions,
      checksFilterLabel: checksParts.length
        ? `${checksParts.join(' + ')}${checks.removed.length ? ` (${checks.removed.length} driver(s) de fora)` : ''}`
        : null,
    };
    try {
      if (kind === 'geral') {
        const reportRows = buildLeaderReportRows(scoped, platforms, leaderNameByGroup, buildOpts);
        if (reportRows.length === 0) {
          toast.error('Ninguém tem pacote nas plataformas escolhidas');
          return;
        }
        await exportDriverGeneralReportExcel(
          reportRows,
          { ...meta, platforms: scopedPlatformNames, entityLabel: 'recebedor(es)' },
          { includeGroupSheet: false },
        );
      } else {
        const simpleRows = buildSimpleReportRows(scoped, leaderNameByGroup, buildOpts);
        if (simpleRows.length === 0) {
          toast.error('Ninguém tem pacote nas plataformas escolhidas');
          return;
        }
        await exportDriverSimpleReportExcel(simpleRows, { ...meta, platforms: [] });
      }
      // ESTA PLANILHA É O PAGAMENTO: registra quem recebeu, por plataforma (04/08/2026).
      // ⚠️ Só depois de o arquivo ter sido gerado — se a geração falhar, ninguém é marcado.
      if (opts.marcarComoPago && company?.id && selectedPeriod?.id) {
        try {
          const pares = marcasDoRelatorio(scoped, platforms.map((p) => p.name), allowedSet);
          const n = await markPaymentDone(company.id, selectedPeriod.id, pares, kind, userId, opts.includeDeductions);
          setPaymentMarks(await listPaymentMarks(company.id, selectedPeriod.id));
          // LIVRO-CAIXA (07/08/2026): registra QUANTO foi abatido de cada um nesta planilha,
          // pra o próximo relatório saber quem já pagou e quem ainda deve. Só quem realmente
          // saiu no arquivo entra — daí o cruzamento com `scoped`.
          const noArquivo = new Set(scoped.map((r) => r.driverId));
          const abates = [...opts.deductionByDriver]
            .filter(([driverId, valor]) => valor > 0 && noArquivo.has(driverId))
            .map(([driverId, amount]) => ({ driverId, amount }));
          if (abates.length > 0) {
            await recordDeductions(
              company.id, selectedPeriod.id, abates, 'relatorio',
              // Identidade desta rodada, só pra auditoria (de qual geração veio cada abate).
              // ⚠️ NÃO é ela que impede abater duas vezes — quem impede é o SALDO: depois
              // desta gravação o livro já mostra a pessoa quitada, então gerar o mesmo
              // relatório de novo calcula 0 pra ela e não grava nada.
              crypto.randomUUID(), userId,
            );
            setDeductionLedger(await listDeductionLedger(company.id, selectedPeriod.id));
          }
          const pessoas = new Set(pares.map((p) => p.driverId)).size;
          toast.success(`${pessoas} entregador(es) marcados como PAGOS (${n} plataforma/entregador).`,
            { duration: 9000 });
        } catch (e) {
          // O arquivo já foi baixado: não posso fingir que a marcação deu certo.
          console.error('[pagamento] falhou ao marcar como pago:', e);
          toast.error('O relatório saiu, mas NÃO consegui marcar como pago. Gere de novo pra marcar.');
        }
      }
      toast.success(kind === 'geral' ? 'Relatório gerado' : 'Relatório simples gerado');
      setReportModal(null);
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

  // Progresso da NF por pagamento (validadas/esperadas, ciente de grupo — só o líder anexa).
  // Sobre TODOS os rows (não os filtrados) pra o grupo agregar certo mesmo com filtro.
  /** Progresso do ESPELHO DO APP por pagamento (um print por driver — nao agrega grupo). */
  /**
   * Plataformas cuja planilha ainda não foi importada nesta quinzena. Enquanto isso o
   * pedido de print vale pra todo mundo em grupo (pedido do Victor pra adiantar) — ver
   * `plataformasSemPlanilha`.
   */
  const semPlanilha = useMemo(
    () => plataformasSemPlanilha(rows, platforms.map((p) => p.name)),
    [rows, platforms],
  );

  const proofProgressByPayment = useMemo(
    () => computeProofProgressByPayment(rows, proofRequests, proofStates, semPlanilha),
    [rows, proofRequests, proofStates, semPlanilha],
  );

  /**
   * Quem tem pacote numa plataforma pedida "pra todos" mas ficou de fora **por não estar em
   * grupo** (regra de logística de 04/08). Fica fora do contador de propósito — decisão do
   * Victor: contador que nunca fecha vira ruído. Aparece com selo próprio na grade e como
   * aviso na janela de solicitar.
   */
  const semGrupoForaByPayment = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      const fora = proofForaPorSemGrupo(r, proofRequests);
      if (fora.length > 0) m.set(r.paymentId, fora);
    }
    return m;
  }, [rows, proofRequests]);

  /** Quantos drivers precisam da sua atenção no print (divergente ou recusado). */
  const proofAtencao = useMemo(
    () => [...proofProgressByPayment.values()]
      .filter((p) => p.needsAttention || p.rejected > 0).length,
    [proofProgressByPayment],
  );

  /**
   * Os numerozinhos do cabeçalho (05/08/2026, pedido do Victor): tendo pendência, mostra
   * QUANTAS faltam validar; não tendo, mostra em verde o total já validado.
   * Usa exatamente as mesmas regras das telas que os botões abrem, pra o número de fora
   * nunca discordar do de dentro.
   */
  const seloNotas = useMemo(() => {
    const pendentes = nfFiles.filter((f) => f.status !== 'validada').length;
    const validadas = nfFiles.filter((f) => f.status === 'validada').length;
    return seloDoBotao(pendentes, validadas);
  }, [nfFiles]);

  const seloPrints = useMemo(() => {
    const repetidos = new Set(printsRepetidos(proofRows).keys());
    const pendentes = proofRows.filter((p) => proofPrecisaAtencao(p, repetidos)).length;
    const conferidos = proofRows.filter((p) => p.status === 'validado' && !proofPrecisaAtencao(p, repetidos)).length;
    return seloDoBotao(pendentes, conferidos);
  }, [proofRows]);

  const nfProgressByPayment = useMemo(
    () => computeNfProgressByPayment(rows, platforms, nfByDriver, pubsByDriver),
    [rows, platforms, nfByDriver, pubsByDriver],
  );

  // Grupos com espelho publicado: o espelho do grupo vai pro líder, então se qualquer membro
  // tem publicação o grupo conta como publicado. Avulso = o próprio driver.
  const publishedGroups = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.groupName && publishedDriverIds.has(r.driverId)) s.add(r.groupName);
    return s;
  }, [rows, publishedDriverIds]);
  const isRowPublished = useCallback(
    (r: DriverRowData) => (r.groupName ? publishedGroups.has(r.groupName) : publishedDriverIds.has(r.driverId)),
    [publishedGroups, publishedDriverIds],
  );

  /** Índice `driver|plataforma` -> data do pagamento. */
  const indiceMarcas = useMemo(() => indexarMarcas(paymentMarks), [paymentMarks]);

  /** Situação de pagamento de cada linha, pra tag na grade e pro filtro. */
  const pagamentoPorPagamento = useMemo(() => {
    const nomes = platforms.map((p) => p.name);
    const m = new Map<string, ReturnType<typeof pagamentoDoDriver>>();
    for (const r of rows) {
      m.set(r.paymentId, pagamentoDoDriver(r, nomes, indiceMarcas, deductionLedger.get(r.driverId) ?? 0));
    }
    return m;
  }, [rows, platforms, indiceMarcas, deductionLedger]);

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (search.trim()) {
          // Sem acento dos DOIS lados: "jose" acha "José", "cha" acha "Chalé",
          // "conceicao" acha "Conceição" (pedido do Victor, 04/08/2026).
          const q = search.trim();
          const inName = contemSemAcento(r.name, q);
          const inRoute =
            contemSemAcento(r.route, q) || r.routes.some((rl) => contemSemAcento(rl.route, q));
          const inGroup = contemSemAcento(r.groupName, q);
          if (!inName && !inRoute && !inGroup) return false;
        }
        // Rota e grupo: vários marcados de uma vez. As regras (TODAS × QUALQUER UM) moram em
        // driverPayShared, testadas — e estão escritas na tela, ao lado do rótulo.
        if (!temTodasAsRotas(r, routeFilter)) return false;
        if (!estaEmAlgumGrupo(r, groupFilter, GROUP_NONE)) return false;
        // Filtro por status da NF (ciente de grupo, via nfProgressByPayment).
        if (nfFilter) {
          const nf = nfProgressByPayment.get(r.paymentId);
          const complete = nf?.complete ?? r.notaFiscal;
          if (nfFilter === 'ok' && !complete) return false;
          if (nfFilter === 'pending' && (complete || (nf?.expected ?? 0) === 0)) return false;
        }
        // Filtro por espelho publicado (grupo = publicado se o líder recebeu).
        if (espelhoFilter === 'published' && !isRowPublished(r)) return false;
        if (espelhoFilter === 'unpublished' && isRowPublished(r)) return false;
        // Plataforma: marcou SHOPEE + LOGGI, passa SÓ quem tem as duas (decisão do Victor).
        if (!temTodasAsPlataformas(r, platFilter)) return false;
        // Espelho CONFERIDO = o print da Shopee batendo com a planilha (≠ espelho no app).
        if (conferidoFilter === 'ok' && !r.espelhoConferido) return false;
        if (conferidoFilter === 'pending' && r.espelhoConferido) return false;
        // Pagos × não pagos (parcial conta como NÃO pago: ainda falta dinheiro).
        if (!passaNoFiltroDePagamento(pagamentoPorPagamento.get(r.paymentId)?.estado, pagamentoFilter)) return false;
        return true;
      }),
    [rows, search, routeFilter, groupFilter, nfFilter, espelhoFilter, platFilter, conferidoFilter,
     pagamentoFilter, pagamentoPorPagamento, nfProgressByPayment, isRowPublished],
  );

  // Contagem do botão "Espelhos da seleção": grupos marcados + drivers avulsos
  // que NÃO estão em grupo marcado (esses já entram pelo grupo).
  const selCount = useMemo(() => {
    const singles = filteredRows.filter(
      (r) => selDrivers.has(r.paymentId) && !selGroups.has(r.groupName ?? 'Sem grupo'),
    ).length;
    return selGroups.size + singles;
  }, [filteredRows, selGroups, selDrivers]);

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

  // Nome do LÍDER por grupo (recebedor no relatório). Sem líder definido -> o builder cai no 1º membro.
  const leaderNameByGroup = useMemo(() => {
    const nameById = new Map(drivers.map((d) => [d.id, d.name]));
    const m = new Map<string, string>();
    for (const g of groups) {
      const nm = g.leader_driver_id ? nameById.get(g.leader_driver_id) : undefined;
      if (nm) m.set(g.name, nm);
    }
    return m;
  }, [groups, drivers]);

  /**
   * "Nota validada" nos relatórios = a MESMA regra do filtro "NF ok (validada)" da lista
   * (ciente de grupo, com o fallback do sinalizador manual). Se as duas divergissem, o
   * operador veria números diferentes pro mesmo driver em telas vizinhas.
   */
  const nfCompleteByPayment = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of rows) m.set(r.paymentId, nfProgressByPayment.get(r.paymentId)?.complete ?? r.notaFiscal);
    return m;
  }, [rows, nfProgressByPayment]);

  /**
   * Este pagamento mandou TODAS as notas dentro do prazo do espelho dele? (04/08/2026)
   *
   * Ausente do mapa = não dá pra dizer (espelho sem prazo, ou nota nenhuma) — e nesses casos
   * o filtro NÃO corta ninguém: punir por horário que ninguém combinou seria errado.
   */
  const nfNoPrazoByPayment = useMemo(() => {
    const prazoDe = (driverId: string, platformKey: string): string | null =>
      publications.find((p) => p.driverId === driverId && p.platformKey === platformKey)?.nfDueAt ?? null;
    const m = new Map<string, boolean>();
    for (const r of rows) {
      const comPrazo = nfFiles
        .filter((f) => f.driverId === r.driverId)
        .map((f) => nfPrazoStatus(f.uploadedAt, prazoDe(f.driverId, f.mirrorPlatformKey ?? '')))
        .filter((st) => st !== 'sem_prazo');
      if (comPrazo.length === 0) continue; // sem base pra julgar
      m.set(r.paymentId, comPrazo.every((st) => st === 'no_prazo'));
    }
    return m;
  }, [rows, nfFiles, publications]);


  /**
   * Quem, no escopo do relatório, JÁ foi pago nas plataformas escolhidas — com a data.
   * A janela usa isto pra avisar e pra oferecer tirar a pessoa do relatório na hora.
   */
  const jaPagosDoRelatorio = (allowed: string[] | null, excluir: readonly string[]) => {
    const fora = new Set(excluir);
    const escopo = reportScopeRows().filter((r) => !fora.has(r.driverId));
    return jaPagosNoRelatorio(
      escopo, platforms.map((p) => p.name), indiceMarcas,
      allowed && allowed.length > 0 ? new Set(allowed) : undefined,
    );
  };

  /**
   * Quem está no escopo do relatório, do ponto de vista do DESCONTO (07/08/2026).
   *
   * Devolve, por pessoa: quanto ela deve de vale/perda, quanto já foi abatido dela nesta
   * quinzena (livro-caixa) e quanto ela recebe NAS plataformas escolhidas — que é o teto do
   * que dá pra abater sem a linha virar negativa.
   *
   * ⚠️ Recebe os MESMOS filtros que o arquivo vai usar (plataformas, removidos à mão e os
   * filtros de conferência). É a mesma função que alimenta a prévia da janela e a conta do
   * arquivo: se fossem duas, a tela poderia mentir sobre dinheiro.
   */
  const pessoasDoDesconto = (
    allowed: string[] | null,
    excluir: readonly string[],
    checks: ChecksFilterOptions,
  ): PessoaDesconto[] => {
    const fora = new Set(excluir);
    const base = reportScopeRows().filter((r) => !fora.has(r.driverId));
    const escopo = applyChecksFilter(base, nfCompleteByPayment, leaderNameByGroup, checks, nfNoPrazoByPayment).kept;
    const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : undefined;
    return escopo.map((r) => {
      // includeDeductions=false: aqui interessa o BRUTO das plataformas do relatório.
      const t = computeRowTotals(r, allowedSet, false);
      return {
        driverId: r.driverId,
        name: r.name,
        total: deductionsOf(r),
        jaAbatido: deductionLedger.get(r.driverId) ?? 0,
        brutoNoEscopo: t.packagesAmount + t.zapex,
      };
    });
  };

  /**
   * Prévia de quem sai do relatório com os filtros marcados (a janela mostra antes de baixar).
   * Função simples de propósito: memorizar exigiria repetir à mão as dependências de
   * `reportScopeRows` (seleção + filtro da lista), e a conta é pura e barata — roda só
   * enquanto a janela está aberta.
   */
  const checksPreview = (o: ChecksFilterOptions): ChecksFilterResult =>
    applyChecksFilter(reportScopeRows(), nfCompleteByPayment, leaderNameByGroup, o, nfNoPrazoByPayment);

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

  // Reconstrói o espelho ABERTO aplicando o filtro de plataforma (chips) — usado pela prévia
  // e pelo "Gerar PDF" pra mostrarem os valores só das plataformas marcadas (mesma regra do envio ao app).
  const rebuildMirror = useCallback(
    (allowed: string[] | null, modo: ModoDesconto): MirrorRequest | null => {
      if (!company || !selectedPeriod || !mirror) return null;
      const allowedSet = allowed && allowed.length > 0 ? new Set(allowed) : undefined;
      const plats = platformsRef.current;
      const includeDeductions = modo !== 'nenhum';
      // A prévia tem que mostrar o MESMO número que a publicação vai gravar — por isso o
      // mapa de abate é o mesmo, e o escopo é o mesmo (`selection` olha a lista filtrada).
      const abate = mapaDeAbate(
        mirror.mode === 'selection' ? filteredRows : publishRows, allowedSet, modo,
      );
      if (mirror.mode === 'individual') {
        const row = publishRows[0];
        if (!row) return null;
        return {
          mode: 'individual',
          data: buildDriverMirrorData(
            row, plats, company, selectedPeriod, allowedSet, includeDeductions,
            abate.get(row.driverId),
          ),
        };
      }
      if (mirror.mode === 'group') {
        if (!publishGroupInfo) return null;
        return {
          mode: 'group',
          data: buildGroupMirrorData(
            publishGroupInfo.groupName, publishRows, plats, company, selectedPeriod, allowedSet,
            includeDeductions, abate,
          ),
        };
      }
      if (mirror.mode === 'mass') {
        return {
          mode: 'mass',
          list: publishRows.map((r) =>
            buildDriverMirrorData(
              r, plats, company, selectedPeriod, allowedSet, includeDeductions, abate.get(r.driverId),
            ),
          ),
        };
      }
      const sel = buildSelectionMirrorData(
        filteredRows, selGroups, selDrivers, plats, company, selectedPeriod, allowedSet,
        includeDeductions, abate,
      );
      return { mode: 'selection', groups: sel.groups, singles: sel.singles };
    },
    [company, selectedPeriod, mirror, publishRows, publishGroupInfo, filteredRows, selGroups, selDrivers, mapaDeAbate],
  );

  /**
   * O que a publicação vai fazer — a MESMA regra do `onPublish`, só que contada antes.
   * Escopo 'group' já é 1 PDF pro líder; os demais caem na regra "grupo vira 1 PDF pro
   * líder, quem não tem grupo recebe o seu".
   */
  const publishPlan = useMemo(() => {
    if (!mirror || publishRows.length === 0) return null;
    if (publishScope === 'group') {
      return {
        grupos: publishGroupInfo?.leaderId ? 1 : 0,
        avulsos: 0,
        semLider: publishGroupInfo?.leaderId ? [] : [publishGroupInfo?.groupName ?? 'grupo'],
      };
    }
    const plano = planejarPublicacao(publishRows, groups);
    return { grupos: plano.grupos.length, avulsos: plano.avulsos.length, semLider: plano.semLider };
  }, [mirror, publishRows, publishScope, publishGroupInfo, groups]);

  /** O numerozinho ao lado do texto do botão — âmbar quando falta, verde quando fechou. */
  const Selo: React.FC<{ selo: { numero: number; estado: string } }> = ({ selo }) => {
    if (selo.estado === 'vazio') return null;
    return (
      <span
        className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
          selo.estado === 'pendente' ? 'bg-amber-200 text-amber-900' : 'bg-green-200 text-green-900'
        }`}
      >
        {selo.numero}
      </span>
    );
  };

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
          onReopen={async () => {
            if (!company?.id || !selectedPeriod) return;
            try {
              await reopenPeriod(selectedPeriod.id, company.id, userId);
              toast.success('Quinzena reaberta — já pode editar');
              await refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Erro ao reabrir quinzena');
            }
          }}
          onEditPeriod={() => selectedPeriod && setEditPeriodModal({ period: selectedPeriod, confirmDelete: false })}
          onDeletePeriod={() => selectedPeriod && setEditPeriodModal({ period: selectedPeriod, confirmDelete: true })}
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
        {/* Negativo = a empresa tem a receber do entregador (desconto/vale maior que os
            pacotes, ou planilha ainda não importada). Verde com tique ali seria mentira.
            Mesma regra da linha do driver e do card de grupo — telas vizinhas não podem
            discordar sobre o mesmo número. */}
        <KpiCard
          color={kpis.net < 0 ? 'red' : 'green'}
          icon={kpis.net < 0 ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          label="Total a receber"
          value={formatBRL(kpis.net)}
        />
      </div>

      {/* Painel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <DriverFilters
          search={search}
          onSearch={setSearch}
          routeFilter={routeFilter}
          onClearRoute={() => setRouteFilter([])}
          onRoute={(v) => setRouteFilter((cur) => toggleValorDeFiltro(cur, v))}
          routeOptions={routeOptions}
          groupFilter={groupFilter}
          onClearGroup={() => setGroupFilter([])}
          onGroup={(v) => setGroupFilter((cur) => toggleValorDeFiltro(cur, v))}
          groupOptions={groupOptions}
          nfFilter={nfFilter}
          onNf={setNfFilter}
          espelhoFilter={espelhoFilter}
          onEspelho={setEspelhoFilter}
          platFilter={platFilter}
          onClearPlat={() => setPlatFilter([])}
          conferidoFilter={conferidoFilter}
          onConferido={setConferidoFilter}
          pagamentoFilter={pagamentoFilter}
          onPagamento={setPagamentoFilter}
          onPlat={(v) => setPlatFilter((cur) => toggleValorDeFiltro(cur, v))}
          platformOptions={platforms.map((p) => p.name)}
          view={view}
          onView={setView}
        />

        {/*
          06/08/2026 — barra de ações DIDÁTICA (pedido dele: "fácil de entender e de usar").
          Antes eram ~13 botões iguais, todos azuis, quebrando em linhas desiguais: nada
          dizia o que era rotina, o que era conferência e o que gerava arquivo.
          Agora há DOIS grupos com nome ("Organizar e conferir" × "Gerar e baixar"), e a
          cor virou significado: branco = secundário, colorido = ação que produz algo,
          vermelho = tira do ar. Mesmos botões, mesmos textos, mesmos cliques — só a
          leitura mudou.
        */}
        <div className="px-3 sm:px-4 py-3 border-b border-gray-200 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 bg-gray-50/60">
          <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Organizar e conferir</p>
          <div className="ui-toolbar">
          {hasPermission('driverpay.manageGroups') && (
            <button
              type="button"
              onClick={() => setShowGroups(true)}
              className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              <Tag className="w-4 h-4" /> Gerenciar grupos
            </button>
          )}
          {hasPermission('driverpay.managePlatforms') && (
            <button
              type="button"
              onClick={() => setShowPlatform(true)}
              className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              <Plus className="w-4 h-4" /> Adicionar plataforma
            </button>
          )}
          {hasPermission('driverpay.managePlatforms') && (
            <button
              type="button"
              onClick={() => setShowEmitters(true)}
              className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              CNPJs / Notas
            </button>
          )}
          {selectedPeriod && canMirror && (
            <button
              type="button"
              onClick={() => setShowNotas(true)}
              title={
                seloNotas.estado === 'pendente'
                  ? `${seloNotas.numero} nota(s) esperando você validar`
                  : seloNotas.estado === 'ok'
                    ? `${seloNotas.numero} nota(s) validada(s) — nada pendente`
                    : 'Nenhuma nota recebida ainda'
              }
              className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              Notas recebidas
              <Selo selo={seloNotas} />
            </button>
          )}
          {/* Espelho do app da Shopee (print da tela) — 04/08/2026 */}
          {selectedPeriod && canMirror && (
            <button
              type="button"
              onClick={() => setShowSolicitarEspelho(true)}
              title="Pedir aos entregadores o print da tela do app (aba Encerrado), pra conferir a quantidade da planilha"
              className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
            >
              Solicitar espelho
            </button>
          )}
          {selectedPeriod && canMirror && proofRequests.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEspelhosRecebidos(true)}
              title={
                seloPrints.estado === 'pendente'
                  ? `${seloPrints.numero} print(s) precisando da sua atenção`
                  : seloPrints.estado === 'ok'
                    ? `${seloPrints.numero} print(s) conferido(s) — nada pendente`
                    : 'Ver os prints recebidos, com a foto ao lado do que a planilha diz'
              }
              className={`px-3 py-2 text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 min-h-[40px] transition-colors ${
                proofAtencao > 0
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              Espelhos recebidos
              <Selo selo={seloPrints} />
            </button>
          )}
          {selectedPeriod && canMirror && publishedDriverIds.size > 0 && (
            <button
              type="button"
              onClick={handleUnpublishAll}
              title="Tira do app o espelho de TODOS os drivers deste período (dá pra publicar de novo depois)"
              className="px-3 py-2 text-sm font-medium bg-red-50 text-red-700 rounded-md hover:bg-red-100 inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Trash2 className="w-4 h-4" /> Despublicar todos ({publishedDriverIds.size})
            </button>
          )}
          {hasPermission('driverpay.createDriver') && (
            <>
              <button
                type="button"
                onClick={() => setFormModal({ mode: 'create', driver: null })}
                className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
              >
                <Plus className="w-4 h-4" /> Novo driver
              </button>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="px-3 py-2 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
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
              <button
                type="button"
                onClick={() => setShowImportLinks(true)}
                title="Ver/editar quem já foi vinculado ou ignorado nas importações de planilha"
                className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <Link2 className="w-4 h-4" /> Vínculos de importação
              </button>
            </>
          )}

          </div>
          </div>

          <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Gerar e baixar</p>
          <div className="ui-toolbar">
          <button
            type="button"
            onClick={() => setShowDiscountSearch(true)}
            className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Search className="w-4 h-4" /> Pacotes descontados
          </button>
          {hasPermission('driverpay.manageDiscount') && (
            <button
              type="button"
              onClick={() => setShowClosedDebt(true)}
              title="Vale/perda lançado em quinzenas já fechadas que nunca foi descontado"
              className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
            >
              <Wallet className="w-4 h-4" /> Saldo de quinzenas fechadas
            </button>
          )}
          {canMirror && (
            <>
              <button
                type="button"
                onClick={handleSelectionMirror}
                disabled={selCount === 0}
                title={
                  selCount === 0
                    ? 'Marque grupos ou drivers (caixinhas na lista) para gerar só os espelhos deles'
                    : 'Gerar um PDF só com os grupos/drivers marcados'
                }
                className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center gap-1.5 min-h-[40px] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                <FileText className="w-4 h-4" /> Espelhos da seleção{selCount > 0 ? ` (${selCount})` : ''}
              </button>
              {selCount > 0 && (
                <button
                  type="button"
                  onClick={clearMirrorSelection}
                  title="Desmarcar tudo"
                  className="px-2.5 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50 inline-flex items-center gap-1 min-h-[40px]"
                >
                  <X className="w-4 h-4" /> Limpar
                </button>
              )}
              <button
                type="button"
                onClick={handleMassMirror}
                className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <FileText className="w-4 h-4" /> Espelhos (em massa)
              </button>
            </>
          )}
          {hasPermission('driverpay.exportReport') && (
            <>
              <button
                type="button"
                onClick={() => openReport('geral')}
                title={
                  selCount > 0
                    ? 'Relatório detalhado só dos grupos/drivers marcados (escolha as plataformas na próxima tela)'
                    : 'Relatório detalhado de todos (escolha as plataformas na próxima tela)'
                }
                className="px-3 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm inline-flex items-center gap-1.5 min-h-[40px] transition-colors"
              >
                <Download className="w-4 h-4" /> {selCount > 0 ? `Relatório da seleção (${selCount})` : 'Relatório geral'}
              </button>
              <button
                type="button"
                onClick={() => openReport('simples')}
                title="Relatório simples: nome do líder (sem acento) · valor total · chave PIX · obs (quinzena)"
                className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 inline-flex items-center gap-1.5 min-h-[40px]"
              >
                <Download className="w-4 h-4" /> Relatório simples
              </button>
            </>
          )}
          </div>
          </div>
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
            canMarkPaid={canEditDriver}
            handlers={handlers}
            onGroupMirror={onGroupMirror}
            onGroupMarkPaid={onGroupMarkPaid}
            publishedDriverIds={publishedDriverIds}
            nfProgressByPayment={nfProgressByPayment}
            proofProgressByPayment={proofProgressByPayment}
            semGrupoForaByPayment={semGrupoForaByPayment}
            pagamentoByPayment={pagamentoPorPagamento}
            selGroups={canMirror ? selGroups : undefined}
            selDrivers={canMirror ? selDrivers : undefined}
            onToggleSelGroup={canMirror ? toggleSelGroup : undefined}
            onToggleSelDriver={canMirror ? toggleSelDriver : undefined}
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

      {markPaidTarget && company && selectedPeriod && (
        <MarkPaidModal
          rows={markPaidTarget.rows}
          title={markPaidTarget.title}
          platformNames={platforms.map((p) => p.name)}
          deductionLedger={deductionLedger}
          companyId={company.id}
          periodId={selectedPeriod.id}
          userId={userId}
          onClose={() => setMarkPaidTarget(null)}
          onChanged={async () => {
            setPaymentMarks(await listPaymentMarks(company.id, selectedPeriod.id));
            setDeductionLedger(await listDeductionLedger(company.id, selectedPeriod.id));
          }}
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
          platforms={platforms}
          onClose={() => setShowPlatform(false)}
          onSaved={refresh}
        />
      )}

      {showEmitters && (
        <EmittersModal
          companyId={company.id}
          userId={userId}
          platforms={platforms}
          onClose={() => setShowEmitters(false)}
          onSaved={refresh}
        />
      )}

      {showNotas && selectedPeriod && (
        <NotasRecebidasModal
          companyId={company.id}
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          userId={userId}
          onClose={() => setShowNotas(false)}
          onChanged={() => reloadNotes(selectedPeriod.id)}
          publicacoes={publications}
        />
      )}

      {/* Espelho do app da Shopee (print da tela) — 04/08/2026 */}
      {showSolicitarEspelho && selectedPeriod && (
        <SolicitarEspelhoModal
          companyId={company.id}
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          periodStart={selectedPeriod.start_date ?? null}
          periodEnd={selectedPeriod.end_date ?? null}
          rows={rows}
          platformNames={platforms.map((p) => p.name)}
          semPlanilha={semPlanilha}
          userId={userId}
          onClose={() => setShowSolicitarEspelho(false)}
          onChanged={async () => {
            // As datas da quinzena podem ter sido corrigidas aqui dentro — recarrega
            // a lista pra tela não continuar mostrando as antigas.
            await reloadProofs(selectedPeriod.id);
            if (company?.id) setPeriods(await getPeriods(company.id));
          }}
        />
      )}

      {showEspelhosRecebidos && selectedPeriod && (
        <EspelhosRecebidosModal
          companyId={company.id}
          periodId={selectedPeriod.id}
          periodLabel={selectedPeriod.label}
          rows={rows}
          userId={userId}
          onClose={() => setShowEspelhosRecebidos(false)}
          onChanged={() => { reloadProofs(selectedPeriod.id); reloadPayments(); }}
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
          onConcludedOnly={refresh}
        />
      )}

      {editPeriodModal && (
        <PeriodEditModal
          period={editPeriodModal.period}
          companyId={company.id}
          userId={userId}
          initialConfirmDelete={editPeriodModal.confirmDelete}
          onClose={() => setEditPeriodModal(null)}
          onSaved={refresh}
          onDeleted={refresh}
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

      {showClosedDebt && (
        <ClosedPeriodsDebtModal
          companyId={company.id}
          periods={periods}
          userId={userId}
          onClose={() => setShowClosedDebt(false)}
          onMigrated={reloadPayments}
        />
      )}

      {showImport && (
        <DriverImportModal
          companyId={company.id}
          userId={userId}
          platforms={platforms}
          onClose={() => setShowImport(false)}
          onImported={refreshComReconferencia}
        />
      )}

      {showPlatformImport && (
        <PlatformImportModal
          companyId={company.id}
          userId={userId}
          onClose={() => setShowPlatformImport(false)}
          onImported={refreshComReconferencia}
        />
      )}

      {showImportLinks && (
        <DriverImportLinksModal
          companyId={company.id}
          userId={userId}
          drivers={drivers}
          onClose={() => setShowImportLinks(false)}
        />
      )}

      {mirror && (() => {
        // Despublicar só faz sentido pra destinatário único: individual (o driver) ou
        // grupo (o líder). Massa/seleção usam o botão "Despublicar todos do período".
        const recipientId =
          mirror.mode === 'group'
            ? publishGroupInfo?.leaderId ?? null
            : mirror.mode === 'individual'
            ? publishRows[0]?.driverId ?? null
            : null;
        const singleRecipient = mirror.mode === 'individual' || mirror.mode === 'group';
        return (
          <DriverMirrorPreviewDialog
            request={mirror}
            canGenerate={canMirror}
            onClose={() => setMirror(null)}
            companyId={company?.id}
            userId={userId}
            onPublish={canMirror ? onPublish : undefined}
            publishPlan={publishPlan}
            alreadyPublished={!!recipientId && publishedDriverIds.has(recipientId)}
            publishedKeys={new Set((pubsByDriver.get(recipientId ?? '') ?? []).map((p) => p.platformKey))}
            onUnpublish={canMirror && singleRecipient ? onUnpublishCurrent : undefined}
            onRebuild={rebuildMirror}
            alreadyDeducted={alreadyDeductedDrivers(publishRows, publications, rows)}
          />
        );
      })()}

      {reportModal && (() => {
        const scoped = reportScopeRows();
        return (
          <ReportOptionsModal
            kind={reportModal.kind}
            platformOptions={platforms.map((p) => p.name)}
            deductionsTotal={scoped.reduce((s, r) => s + deductionsOf(r), 0)}
            alreadyDeducted={alreadyDeductedDrivers(scoped, publications, rows)}
            scopeLabel={
              selCount > 0 ? `Só o que está marcado (${selCount})` : `${scoped.length} driver(s) da lista atual`
            }
            checksPreview={checksPreview}
            jaPagos={jaPagosDoRelatorio}
            pessoasDesconto={pessoasDoDesconto}
            onClose={() => setReportModal(null)}
            onConfirm={handleGenerateReport}
          />
        );
      })()}
    </div>
  );
};
