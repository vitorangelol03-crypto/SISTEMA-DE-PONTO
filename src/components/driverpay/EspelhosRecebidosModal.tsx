/**
 * "Espelhos recebidos": o painel (2626) vê os PRINTS da tela do app que os
 * entregadores anexaram, com a foto ao lado do que a planilha diz, e valida /
 * recusa / exclui cada um.
 *
 * O que o driver NUNCA vê e aqui aparece: a quantidade esperada e a divergência.
 * Decisão do Victor (04/08) — o driver só anexa a foto; a diferença é assunto de
 * vocês. Por isso o filtro "só o que precisa de atenção" já vem ligado: numa leva
 * de 89 drivers, o que importa são os poucos que não bateram.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon, Eye, Loader2, Check, X, Trash2, AlertTriangle,
  Clock, RefreshCw, Copy, Search, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { contemSemAcento } from '../../utils/buscaTexto';
import {
  listDeliveryProofs,
  proofFileUrl,
  setProofStatus,
  deleteDeliveryProof,
  getProofSettings,
  setProofSettings,
  aplicarCorrecaoDePacotes,
  type DeliveryProofRow,
} from '../../services/driverPay';
import {
  platformPackages, planejarCorrecaoDePacotes, formatBRLIf, proofPrecisaAtencao, printsRepetidos,
  type DriverRowData,
} from './driverPayShared';
import { ModalShell } from './ModalShell';

interface EspelhosRecebidosModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  /** Linhas da grade — pra saber o que a planilha diz HOJE. */
  rows: DriverRowData[];
  userId: string;
  /** Nome do driver pra abrir já filtrado (19/08/2026) — clique na tag "não bate" da grade. */
  initialBusca?: string;
  onClose: () => void;
  onChanged: () => void;
  /** Ver valores em R$ (02/09/2026) — false esconde o efeito em R$ da correção de contagem. */
  canViewValues: boolean;
}

const dataBr = (iso: string | null): string => {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Selo do resultado da conferência, em português leigo. */
/**
 * Botõezinhos pra corrigir a contagem sem fechar a janela (04/08/2026, pedido do Victor).
 *
 * Só aparece pra quem NÃO bateu. O operador escolhe qual número fica — o do print, o da
 * planilha, ou um digitado. A diferença cai na MAIOR rota (decisão dele); quando as rotas
 * têm preços diferentes, o efeito em R$ é mostrado ANTES de aplicar, porque aí a escolha
 * muda o valor a receber.
 */
const CorrigirContagem: React.FC<{
  row: DriverRowData | undefined;
  platformName: string;
  doPrint: number;
  daPlanilha: number;
  aplicando: boolean;
  /** Nomes de quem mandou um print IDENTICO a este (o app da Shopee nao mostra o dono). */
  printRepetidoDe?: string[];
  onAplicar: (novoTotal: number) => void;
  canViewValues: boolean;
}> = ({ row, platformName, doPrint, daPlanilha, aplicando, printRepetidoDe, onAplicar, canViewValues }) => {
  const [outro, setOutro] = useState('');
  const alvo = outro.trim() ? Number(outro.trim()) : doPrint;
  const plano = useMemo(
    () => (row && Number.isFinite(alvo) ? planejarCorrecaoDePacotes(row, platformName, alvo) : null),
    [row, platformName, alvo],
  );

  if (!row) return null;
  const rotas = plano?.ajustes.length ?? 0;
  const repetido = (printRepetidoDe?.length ?? 0) > 0;

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" data-testid="corrigir-contagem">
      <p className="text-xs font-semibold text-blue-900 mb-1.5">
        Corrigir a contagem deste entregador (a planilha diz {daPlanilha})
      </p>
      {repetido && (
        <p className="text-xs text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1 mb-1.5">
          ⚠ <b>Cuidado:</b> este print e identico ao de <b>{printRepetidoDe!.join(', ')}</b> — o numero{' '}
          <b>{doPrint}</b> pode nao ser deste entregador.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {/* ⚠️ PRINT REPETIDO: a foto e identica a de outro entregador, entao o numero
             dela pode nao ser deste driver. Gravar as cegas aqui paga a pessoa errada —
             por isso o botao sai do caminho e vira uma confirmacao explicita. */}
        <button
          type="button" disabled={aplicando} data-testid="usar-do-print"
          onClick={() => {
            if (repetido && !window.confirm(
              `ATENCAO: este print e IDENTICO ao de ${printRepetidoDe!.join(', ')}.\n\n` +
              `O app da Shopee nao mostra o nome do entregador na tela, entao o sistema nao tem ` +
              `como saber de quem e a foto — o numero ${doPrint} pode nao ser deste driver.\n\n` +
              `Gravar ${doPrint} para ${row.name} mesmo assim?`,
            )) return;
            onAplicar(doPrint);
          }}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 ${
            repetido ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {repetido ? '⚠ ' : ''}Usar {doPrint} (do print)
        </button>
        <button
          type="button" disabled={aplicando} data-testid="usar-da-planilha"
          onClick={() => onAplicar(daPlanilha)}
          className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Usar {daPlanilha} (da planilha)
        </button>
        <span className="text-xs text-gray-500">ou</span>
        <input
          type="number" value={outro} onChange={(e) => setOutro(e.target.value)}
          placeholder="outro numero" data-testid="corrigir-outro"
          className="w-28 border border-gray-300 rounded-md px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={aplicando || !outro.trim() || !Number.isFinite(alvo) || !!plano?.erro}
          onClick={() => onAplicar(alvo)}
          className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-blue-600 text-blue-700 hover:bg-blue-100 disabled:opacity-40"
        >
          Aplicar
        </button>
      </div>
      {plano?.erro && <p className="text-xs text-red-700 mt-1.5">{plano.erro}</p>}
      {plano && !plano.erro && plano.ajustes.length > 0 && (
        <div className="text-xs text-blue-900 mt-1.5">
          <p>
            Vai gravar <strong>{plano.totalDepois}</strong> no lugar de {plano.totalAntes}
            {/* Rota única: a frase curta já diz tudo. Com 2+, a lista abaixo é que explica. */}
            {plano.linhas.length === 1 && rotas > 0 &&
              ` — ${plano.ajustes[0].route || '(sem rota)'}: ${plano.ajustes[0].de} → ${plano.ajustes[0].para}`}
            . Total a receber muda em{' '}
            <strong className={plano.deltaReais < 0 ? 'text-red-700' : 'text-green-700'}>
              {plano.deltaReais >= 0 ? '+' : ''}{formatBRLIf(plano.deltaReais, canViewValues)}
            </strong>
          </p>

          {/* ── MAIS DE UMA ROTA (pedido do Victor, 04/08/2026) ──
               Antes só saía a rota que mudou, e ficava sem resposta a pergunta óbvia:
               "em qual rota entrou, e a outra ficou como?". Com preços diferentes por
               rota, é ONDE a diferença cai que define o valor — então cada rota aparece
               com o seu preço, e a que recebeu a diferença fica marcada. */}
          {plano.linhas.length > 1 && (
            <div className="mt-1.5 rounded-md border border-blue-200 bg-white overflow-hidden" data-testid="rotas-da-correcao">
              {plano.linhas.map((l) => (
                <div
                  key={l.indice}
                  className={`flex items-center justify-between gap-2 px-2 py-1 border-b last:border-b-0 border-blue-100 ${
                    l.mudou ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {l.mudou && <strong className="text-blue-800">➜ </strong>}
                    {l.route || '(sem rota)'}
                    <span className="text-gray-500"> · {formatBRLIf(l.rate, canViewValues)}/pct</span>
                  </span>
                  <span className={`whitespace-nowrap tabular-nums ${l.mudou ? 'font-bold text-blue-900' : 'text-gray-500'}`}>
                    {l.mudou ? (
                      <>
                        {l.de} → {l.para}{' '}
                        <span className={l.para >= l.de ? 'text-green-700' : 'text-red-700'}>
                          ({l.para >= l.de ? '+' : ''}
                          {l.para - l.de})
                        </span>
                      </>
                    ) : (
                      <>{l.de} (não muda)</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {plano.precosDiferentes && (
            <p className="text-amber-800 mt-1">
              ⚠ As rotas deste entregador têm <strong>preços diferentes</strong> — a diferença vai
              para a <strong>maior rota</strong> (a marcada com ➜), e é por isso que o valor acima é
              o que realmente muda.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const SeloConferencia: React.FC<{ p: DeliveryProofRow }> = ({ p }) => {
  const base = 'text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap';
  if (p.status === 'rejeitado') return <span className={`${base} bg-red-100 text-red-800`}>recusado</span>;
  if (p.status === 'validado') return <span className={`${base} bg-green-100 text-green-800`}>confere ✓</span>;
  if (p.checkStatus === 'divergente') return <span className={`${base} bg-amber-100 text-amber-800`}>quantidade diferente</span>;
  if (p.nextCheckAt) return <span className={`${base} bg-blue-100 text-blue-800`}>na fila de conferência</span>;
  if (p.checkStatus === 'pendente') return <span className={`${base} bg-gray-100 text-gray-700`}>conferir na mão</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>recebido</span>;
};

export const EspelhosRecebidosModal: React.FC<EspelhosRecebidosModalProps> = ({
  companyId, periodId, periodLabel, rows, userId, initialBusca, onClose, onChanged, canViewValues,
}) => {
  const [carregando, setCarregando] = useState(true);
  const [proofs, setProofs] = useState<DeliveryProofRow[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  /**
   * Aba da lista (04/08/2026, pedido do Victor): dá pra ver só os conferidos ou só os que
   * ainda faltam, em vez de rolar 79 prints atrás dos que importam.
   */
  const [aba, setAba] = useState<'atencao' | 'conferidos' | 'fila' | 'todos'>('atencao');
  // Busca por nome (05/08/2026, pedido do Victor): com 84 prints, achar um entregador
  // rolando a lista não é possível. Filtra enquanto digita e IGNORA ACENTO.
  // `initialBusca` (19/08/2026) pré-preenche quando o modal abre a partir do clique
  // na tag "não bate"/"recusado" de um driver específico da grade.
  const [busca, setBusca] = useState(initialBusca ?? '');
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const recarregar = useCallback(async () => {
    try {
      const [lista, cfg] = await Promise.all([
        listDeliveryProofs(companyId, periodId),
        getProofSettings(companyId),
      ]);
      setProofs(lista);
      setAutoConfirm(cfg.autoConfirm);
      // Miniaturas: link assinado de 5 min, um por print.
      const pares = await Promise.all(
        lista.map(async (p) => [p.id, await proofFileUrl(p.filePath)] as const),
      );
      setUrls(Object.fromEntries(pares.filter((x): x is [string, string] => Boolean(x[1]))));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao consegui carregar os espelhos.');
    } finally {
      setCarregando(false);
    }
  }, [companyId, periodId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /** O que a planilha diz HOJE pra (driver, plataforma). */
  const esperadoHoje = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const rl of r.routes) {
        for (const plat of Object.keys(rl.packages)) {
          const k = `${r.driverId}|${plat}`;
          m.set(k, platformPackages(r, plat));
        }
      }
    }
    return m;
  }, [rows]);

  /** Prints cujo arquivo é idêntico ao de OUTRO driver (o app não mostra o nome na tela). */
  // A MESMA função usada pelo numerozinho do botão no cabeçalho — dois cálculos
  // parecidos acabariam divergindo, e o número de fora não bateria com o de dentro.
  const repetidos = useMemo(() => printsRepetidos(proofs), [proofs]);

  // A regra mora em driverPayShared (testada): validação HUMANA encerra o assunto, senão
  // um print que já foi divergente uma vez ficaria preso aqui pra sempre.
  const precisaAtencao = (p: DeliveryProofRow): boolean =>
    proofPrecisaAtencao(p, new Set(repetidos.keys()));

  /** Conferido = o sistema aprovou (ou você validou) e não há nada pendente nele. */
  const jaConferido = (p: DeliveryProofRow): boolean =>
    p.status === 'validado' && !precisaAtencao(p);

  /**
   * Grupo de cada entregador (18/08/2026, pedido do Victor: "adicione para aparecer
   * os nomes dos grupos"). Vem das linhas da grade, que já trazem `groupName` — sem
   * consulta nova ao banco.
   */
  const grupoPorDriver = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.groupName) m.set(r.driverId, r.groupName);
    return m;
  }, [rows]);

  const naFila = proofs.filter((p) => p.nextCheckAt).length;
  const atencao = proofs.filter(precisaAtencao).length;
  const conferidos = proofs.filter(jaConferido).length;
  const daAba =
    aba === 'atencao' ? proofs.filter(precisaAtencao)
    : aba === 'conferidos' ? proofs.filter(jaConferido)
    : aba === 'fila' ? proofs.filter((p) => p.nextCheckAt)
    : proofs;
  // A busca vale DENTRO da aba escolhida — os contadores das abas seguem contando tudo,
  // senão procurar um nome faria parecer que as pendências sumiram.
  const q = busca.trim();
  // Busca acha por nome OU por grupo (18/08/2026) — com o grupo na tela, procurar por
  // ele e o gesto natural ("cadê o pessoal do Lucas Aredes?").
  const visiveis = q
    ? daAba.filter((p) =>
        contemSemAcento(p.driverName, q) || contemSemAcento(grupoPorDriver.get(p.driverId) ?? '', q))
    : daAba;

  const agir = async (fn: () => Promise<void>, id: string, ok: string) => {
    setOcupado(id);
    try { await fn(); toast.success(ok); await recarregar(); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Nao consegui fazer isso.'); }
    finally { setOcupado(null); }
  };

  /**
   * Aplica a contagem escolhida e reconfere o print — sem fechar a janela.
   * Reusa a MESMA reconferencia que roda depois de importar a planilha, entao a regra de
   * marcar o espelho e uma so.
   */
  const aplicarContagem = async (p: DeliveryProofRow, novoTotal: number) => {
    const row = rows.find((r) => r.driverId === p.driverId);
    if (!row) { toast.error('Nao achei este entregador na lista.'); return; }
    const plano = planejarCorrecaoDePacotes(row, p.platformName, novoTotal);
    if (plano.erro) { toast.error(plano.erro); return; }
    if (plano.ajustes.length === 0) { toast('A contagem ja esta nesse numero.'); return; }
    setOcupado(p.id);
    try {
      const r = await aplicarCorrecaoDePacotes(
        companyId, periodId, row.paymentId, p.platformName,
        plano.ajustes.map((a) => ({ route: a.route, para: a.para, rate: a.rate })), userId,
      );
      toast.success(
        `Contagem corrigida pra ${plano.totalDepois}` +
        `${r.conferidos ? ' — print conferido e espelho marcado' : ''}.`,
        { duration: 8000 },
      );
      await recarregar();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao consegui corrigir a contagem.');
    } finally {
      setOcupado(null);
    }
  };

  const handleToggleAuto = async () => {
    const novo = !autoConfirm;
    setAutoConfirm(novo);
    try {
      await setProofSettings(companyId, { autoConfirm: novo }, userId);
      toast.success(novo
        ? 'Ligado: o espelho fica conferido sozinho quando o print bate.'
        : 'Desligado: a conferencia continua, mas o clique final e seu.');
    } catch {
      setAutoConfirm(!novo);
      toast.error('Nao consegui mudar essa opcao.');
    }
  };

  return (
    <ModalShell
      icon={<ImageIcon className="w-5 h-5" />}
      title="Espelhos recebidos"
      subtitle={`${periodLabel} · ${proofs.length} print(s)`}
      onClose={onClose}
      maxWidth="sm:max-w-4xl"
      footer={
        <button
          type="button" onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
        >
          Fechar
        </button>
      }
    >
      {carregando ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-4">
          {/* ── Liga/desliga do automatico ────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-700">
              <strong>Marcar o espelho conferido sozinho</strong>
              <p className="text-xs text-gray-500 mt-0.5">
                Desligado, a conferencia e a recusa continuam iguais — so o clique final fica com voce.
              </p>
            </div>
            <button
              type="button" onClick={handleToggleAuto}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border min-h-[36px] ${
                autoConfirm ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {autoConfirm ? 'Ligado' : 'Desligado'}
            </button>
          </div>

          {/* ── Resumo + filtro ───────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600 flex items-center gap-3 flex-wrap">
              {atencao > 0 && (
                <span className="text-amber-700 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {atencao} precisa(m) da sua atencao
                </span>
              )}
              {naFila > 0 && (
                <span className="text-blue-700 flex items-center gap-1">
                  <Clock className="w-4 h-4" /> {naFila} na fila (o sistema reconfere sozinho)
                </span>
              )}
              {atencao === 0 && naFila === 0 && proofs.length > 0 && (
                <span className="text-green-700">Tudo conferido.</span>
              )}
            </div>
          </div>

          {/* Busca por nome — fica ACIMA das abas porque vale dentro da aba escolhida. */}
          <div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                data-testid="print-busca"
                placeholder="Procurar pelo nome do entregador ou do grupo…"
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {q && (
              <p className="mt-1 text-xs text-gray-500">
                {visiveis.length === 0
                  ? 'Ninguém com esse nome nesta aba — tente a aba "Todos".'
                  : `${visiveis.length} print(s) nesta aba.`}
              </p>
            )}
          </div>

          {/* ── Abas (04/08/2026) — antes era uma chavinha "so o que precisa de atencao",
               que nao deixava ver SO os conferidos. Com 79 prints, rolar tudo atras dos
               que importam nao era possivel. ── */}
          <div className="flex items-center gap-1 flex-wrap border-b border-gray-200">
            {([
              ['atencao', `Precisam de voce (${atencao})`],
              ['conferidos', `Conferidos (${conferidos})`],
              ['fila', `Na fila (${naFila})`],
              ['todos', `Todos (${proofs.length})`],
            ] as const).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                data-testid={`aba-${id}`}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  aba === id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {visiveis.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {proofs.length === 0
                ? 'Nenhum print recebido nesta quinzena ainda.'
                : aba === 'conferidos' ? 'Nenhum print conferido ainda.'
                : aba === 'fila' ? 'Nada na fila — o sistema ja leu todos.'
                : 'Nada precisando de atencao — todos os prints bateram.'}
            </p>
          ) : (
            <div className="space-y-3">
              {visiveis.map((p) => {
                const hoje = esperadoHoje.get(`${p.driverId}|${p.platformName}`) ?? null;
                const mudou = p.expectedPackages !== null && hoje !== null && p.expectedPackages !== hoje;
                const diff = p.readPackages !== null && hoje !== null ? p.readPackages - hoje : null;
                const iguais = repetidos.get(p.id);
                return (
                  <div key={p.id} className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex flex-col sm:flex-row">
                      {/* A foto, do lado do numero — e o ponto da tela */}
                      <a
                        href={urls[p.id] ?? '#'} target="_blank" rel="noreferrer"
                        className="sm:w-44 flex-shrink-0 bg-gray-100 flex items-center justify-center min-h-[120px] hover:opacity-90"
                        title="Abrir o print em tamanho real"
                      >
                        {urls[p.id]
                          ? <img src={urls[p.id]} alt={`Print de ${p.driverName}`} className="max-h-40 w-full object-contain" />
                          : <ImageIcon className="w-8 h-8 text-gray-400" />}
                      </a>

                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 break-words">{p.driverName}</p>
                            {grupoPorDriver.get(p.driverId) && (
                              <p className="text-xs text-indigo-700 flex items-center gap-1 mt-0.5" data-testid="proof-grupo">
                                <Users className="w-3 h-3 flex-shrink-0" />
                                {grupoPorDriver.get(p.driverId)}
                              </p>
                            )}
                            <p className="text-xs text-gray-500">
                              {p.platformName} · {p.uploadSource === 'painel' ? 'anexado por voce' : 'enviado pelo portal'}
                            </p>
                          </div>
                          <SeloConferencia p={p} />
                        </div>

                        {/* A comparacao, em portugues */}
                        <div className="mt-2 text-sm">
                          {p.readPackages !== null ? (
                            <p className={diff && diff !== 0 ? 'text-amber-800' : 'text-gray-700'}>
                              planilha <strong>{hoje ?? '—'}</strong> · print <strong>{p.readPackages}</strong>
                              {diff !== null && diff !== 0 && (
                                <strong> · {diff > 0 ? `${diff} a mais` : `${Math.abs(diff)} a menos`} no print</strong>
                              )}
                            </p>
                          ) : (
                            <p className="text-gray-500">
                              {p.nextCheckAt ? 'Ainda nao foi lido — o sistema tenta de novo sozinho.' : 'Nao deu pra ler o print.'}
                            </p>
                          )}
                          {p.readStartDate && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              periodo do print: {dataBr(p.readStartDate)} a {dataBr(p.readEndDate)}
                            </p>
                          )}
                        </div>

                        {mudou && (
                          /* Se a planilha mudou e AGORA bate com o print, o aviso tem que dizer
                             isso — senão parece pendência (foi o susto do print do Meirivaldo:
                             1401 → 1402, igual ao print, e o texto ainda soava a problema). */
                          <p
                            className={`mt-2 text-xs rounded px-2 py-1 flex items-start gap-1.5 border ${
                              p.readPackages === hoje
                                ? 'text-green-800 bg-green-50 border-green-200'
                                : 'text-amber-800 bg-amber-50 border-amber-200'
                            }`}
                          >
                            <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            {p.readPackages === hoje ? (
                              <>
                                Quando conferimos, a planilha dizia <strong>{p.expectedPackages}</strong>; hoje diz{' '}
                                <strong>{hoje}</strong> — <strong>igual ao print</strong>. Nada a fazer.
                              </>
                            ) : (
                              <>
                                Quando conferimos, a planilha dizia <strong>{p.expectedPackages}</strong>; hoje diz{' '}
                                <strong>{hoje}</strong> — a planilha mudou depois deste print.
                              </>
                            )}
                          </p>
                        )}

                        {iguais && iguais.length > 0 && (
                          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1.5">
                            <Copy className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            Este print e <strong>identico</strong> ao de: {iguais.join(', ')}. O app da Shopee nao
                            mostra o nome do entregador na tela, entao o sistema nao tem como saber de quem e a foto.
                          </p>
                        )}

                        {p.rejectReason && (
                          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                            {p.rejectReason}
                          </p>
                        )}

                        {/* ── Corrigir a contagem sem sair daqui (04/08/2026) ──
                             So aparece pra quem NAO bateu. A diferenca cai na MAIOR rota
                             (decisao do Victor); com precos diferentes entre rotas o valor
                             a receber muda, entao a tela diz quanto ANTES de aplicar.
                             ⚠️ Nada disso roda sozinho: automatico so quando a contagem bate. */}
                        {p.readPackages !== null && hoje !== null && p.readPackages !== hoje && (
                          <CorrigirContagem
                            row={rows.find((r) => r.driverId === p.driverId)}
                            platformName={p.platformName}
                            doPrint={p.readPackages}
                            daPlanilha={hoje}
                            aplicando={ocupado === p.id}
                            printRepetidoDe={iguais}
                            onAplicar={(novoTotal) => aplicarContagem(p, novoTotal)}
                            canViewValues={canViewValues}
                          />
                        )}

                        {/* Acoes */}
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          <a
                            href={urls[p.id] ?? '#'} target="_blank" rel="noreferrer"
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Ver o print"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          {p.status !== 'validado' && (
                            <button
                              type="button" disabled={ocupado === p.id}
                              onClick={() => agir(() => setProofStatus(companyId, p.id, 'validado', userId), p.id, 'Print validado.')}
                              title="Aceitar este print (marca o espelho conferido)"
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {p.status !== 'rejeitado' && (
                            <button
                              type="button" disabled={ocupado === p.id}
                              onClick={() => {
                                const motivo = window.prompt('Por que esta recusando? (o entregador vai ver este texto)');
                                if (motivo === null) return;
                                void agir(
                                  () => setProofStatus(companyId, p.id, 'rejeitado', userId, motivo || 'Print recusado.'),
                                  p.id, 'Print recusado — o entregador vai reenviar.',
                                );
                              }}
                              title="Recusar e pedir outro print"
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button" disabled={ocupado === p.id}
                            onClick={() => {
                              if (!window.confirm(`Excluir o print de ${p.driverName}? Isso apaga o registro.`)) return;
                              void agir(() => deleteDeliveryProof(companyId, p.id, userId), p.id, 'Print excluido.');
                            }}
                            title="Excluir de vez"
                            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {ocupado === p.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};
