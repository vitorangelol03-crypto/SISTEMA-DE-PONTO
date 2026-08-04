/**
 * "Solicitar espelho": abre a torneira que faz o portal do entregador pedir o
 * PRINT DA TELA DO APP (aba "Encerrado" + período selecionado) desta quinzena.
 *
 * Por que existe (pedido do Victor, 04/08): a planilha da Shopee pode vir com a
 * quantidade de pacotes errada por driver. O print é a prova do lado do driver, e
 * o sistema compara os dois e marca o "Espelho conferido" sozinho quando batem.
 *
 * ⚠️ As DATAS da quinzena são obrigatórias aqui. A conferência compara o período
 * do print com elas — sem datas (ou com datas erradas) o print CERTO do driver
 * seria recusado. Em 04/08 as duas quinzenas de produção estavam justamente com
 * o mês do fim adiantado, então este campo não é burocracia.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, AlertTriangle, Users, Check, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listProofRequests,
  requestProof,
  cancelProofRequest,
  updatePeriod,
} from '../../services/driverPay';
import { expectedProofPlatforms, proofForaPorSemGrupo, type DriverRowData, type ProofRequest } from './driverPayShared';
import { ModalShell } from './ModalShell';

interface SolicitarEspelhoModalProps {
  companyId: string;
  periodId: string;
  periodLabel: string;
  /** Datas atuais da quinzena (podem vir vazias — o modal exige preencher). */
  periodStart: string | null;
  periodEnd: string | null;
  /** Linhas da grade, pra contar quem vai ser cobrado. */
  rows: DriverRowData[];
  /** Plataformas da empresa que podem ser cobradas. */
  platformNames: string[];
  /**
   * Plataformas cuja planilha ainda NAO foi importada nesta quinzena. Da pra pedir o print
   * mesmo assim (pedido do Victor, 04/08, pra adiantar): cobra todo mundo que esta em grupo,
   * e a conferencia da QUANTIDADE espera a planilha chegar.
   */
  semPlanilha?: ReadonlySet<string>;
  userId: string;
  onClose: () => void;
  /** Chamado depois de gravar, pra grade recarregar. Pode ser async. */
  onChanged: () => void | Promise<void>;
}

/** Só a Shopee vem marcada por padrão — foi a decisão do Victor em 04/08. */
const PADRAO = 'SHOPEE';

/**
 * De quem pedir o print (04/08/2026). `manter` não é escolha do operador: é o estado que
 * aparece quando o pedido já gravado atinge vários entregadores que não formam um grupo
 * nem um só — sem ele, a tela cairia em "todos" e um clique ampliaria o pedido sem querer.
 */
type Escopo = 'todos' | 'grupo' | 'driver' | 'manter';

export const SolicitarEspelhoModal: React.FC<SolicitarEspelhoModalProps> = ({
  companyId, periodId, periodLabel, periodStart, periodEnd,
  rows, platformNames, semPlanilha, userId, onClose, onChanged,
}) => {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [jaSolicitadas, setJaSolicitadas] = useState<ProofRequest[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** De quem pedir. 'manter' so aparece quando o pedido atual nao cabe nas outras opcoes. */
  const [escopo, setEscopo] = useState<Escopo>('todos');
  const [grupoEscolhido, setGrupoEscolhido] = useState('');
  const [driverEscolhido, setDriverEscolhido] = useState('');
  const [buscaDriver, setBuscaDriver] = useState('');
  const [inicio, setInicio] = useState(periodStart ?? '');
  const [fim, setFim] = useState(periodEnd ?? '');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const atuais = await listProofRequests(companyId, periodId);
        if (!vivo) return;
        setJaSolicitadas(atuais);
        const plats = [...new Set(atuais.map((r) => r.platformName))];
        setMarcadas(new Set(plats.length ? plats : platformNames.includes(PADRAO) ? [PADRAO] : []));
        // ⚠️ Deriva o alcance do que JA esta gravado. Se cair no 'todos' por engano, um clique
        // em "Solicitar espelho" ampliaria o pedido pra empresa inteira sem querer.
        const alvos = [...new Set(atuais.map((r) => r.driverId))];
        if (atuais.length === 0 || alvos.includes(null)) setEscopo('todos');
        else if (alvos.length === 1) { setEscopo('driver'); setDriverEscolhido(alvos[0] as string); }
        else setEscopo('manter');
      } catch {
        if (vivo) toast.error('Nao consegui carregar o que ja foi solicitado.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [companyId, periodId, platformNames]);

  /** Entregadores que o alcance escolhido atinge (null = todo mundo). */
  const alvos = useMemo<(string | null)[]>(() => {
    if (escopo === 'todos') return [null];
    if (escopo === 'grupo') {
      return grupoEscolhido ? rows.filter((r) => r.groupName === grupoEscolhido).map((r) => r.driverId) : [];
    }
    if (escopo === 'driver') return driverEscolhido ? [driverEscolhido] : [];
    return [...new Set(jaSolicitadas.map((r) => r.driverId))]; // 'manter'
  }, [escopo, grupoEscolhido, driverEscolhido, rows, jaSolicitadas]);

  /** Grupos que tem gente nesta quinzena, com quantos membros — pro seletor. */
  const gruposDisponiveis = useMemo(() => {
    const cont = new Map<string, number>();
    for (const r of rows) if (r.groupName) cont.set(r.groupName, (cont.get(r.groupName) ?? 0) + 1);
    return [...cont].map(([nome, membros]) => ({ nome, membros }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rows]);

  /** Entregadores desta quinzena, filtrados pela busca (a lista tem ~90 nomes). */
  const driversDisponiveis = useMemo(() => {
    const q = buscaDriver.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.groupName ?? '').toLowerCase().includes(q))
      .map((r) => ({ driverId: r.driverId, name: r.name, groupName: r.groupName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, buscaDriver]);

  /** Quantos entregadores distintos ja tem pedido gravado (usado no estado 'manter'). */
  const alvosJaPedidos = useMemo(
    () => new Set(jaSolicitadas.map((r) => r.driverId)).size,
    [jaSolicitadas],
  );

  /** Exatamente o que sera gravado se ele confirmar agora. */
  const pedidosDesejados = useMemo<ProofRequest[]>(() => {
    const out: ProofRequest[] = [];
    for (const platformName of marcadas) for (const driverId of alvos) out.push({ platformName, driverId });
    return out;
  }, [marcadas, alvos]);

  /**
   * Quem TEM pacote mas fica de fora por não estar em grupo (regra de logística de 04/08).
   * Só faz sentido no pedido geral — num pedido individual o operador escolheu a pessoa.
   */
  const foraSemGrupo = useMemo(
    () => rows.filter((r) => proofForaPorSemGrupo(r, pedidosDesejados).length > 0),
    [rows, pedidosDesejados],
  );

  /** Quem vai ser cobrado — mesma funcao que a coluna "Print" da grade usa. */
  const previa = useMemo(() => {
    const cobrados = rows.filter((r) => expectedProofPlatforms(r, pedidosDesejados, semPlanilha).length > 0);
    const prints = cobrados.reduce((s, r) => s + expectedProofPlatforms(r, pedidosDesejados, semPlanilha).length, 0);
    const emGrupo = cobrados.filter((r) => r.groupName);
    const grupos = new Set(emGrupo.map((r) => r.groupName as string));
    return {
      drivers: cobrados.length,
      prints,
      emGrupo: emGrupo.length,
      grupos: grupos.size,
      avulsos: cobrados.length - emGrupo.length,
    };
  }, [rows, pedidosDesejados, semPlanilha]);

  const datasOk = Boolean(inicio && fim && inicio <= fim);
  const duracao = datasOk
    ? Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000)
    : null;
  /** Quinzena tem ~14 dias. Fora disso é quase certo erro de digitação. */
  const duracaoEstranha = duracao !== null && (duracao < 6 || duracao > 20);

  const toggle = (nome: string) => {
    setMarcadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(nome)) novo.delete(nome); else novo.add(nome);
      return novo;
    });
  };

  /**
   * Fecha a torneira de TODAS as plataformas já pedidas nesta quinzena. Os prints que já
   * chegaram FICAM no painel — só para de pedir novos. É destrutivo o bastante pra pedir
   * confirmação, e barato o bastante pra refazer (é só solicitar de novo).
   */
  const handleCancelarPedido = async () => {
    const platsAbertas = [...new Set(jaSolicitadas.map((r) => r.platformName))];
    if (!window.confirm(
      `Parar de pedir o print nesta quinzena (${platsAbertas.join(', ')})?\n\n` +
      'Os entregadores deixam de ver o pedido no portal. Os prints que ja chegaram continuam ' +
      'guardados, e voce pode solicitar de novo quando quiser.',
    )) return;
    setCancelando(true);
    try {
      // '*' apaga o pedido geral E os individuais daquela plataforma.
      for (const nome of platsAbertas) await cancelProofRequest(companyId, periodId, nome, userId, '*');
      setJaSolicitadas([]);
      setMarcadas(new Set());
      toast.success('Solicitacao cancelada. O portal parou de pedir print.');
      try { await onChanged(); } catch (err) { console.error('[solicitar-espelho] recarga falhou:', err); }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao consegui cancelar a solicitacao.');
    } finally {
      setCancelando(false);
    }
  };

  const handleSalvar = async () => {
    if (!datasOk) { toast.error('Preencha as datas da quinzena.'); return; }
    setSalvando(true);
    try {
      // 1. Grava as datas na quinzena (é contra elas que o print é conferido).
      if (inicio !== periodStart || fim !== periodEnd) {
        await updatePeriod(periodId, companyId, userId, { start: inicio, end: fim });
      }
      // 2. Diferenca entre o que ja esta gravado e o que ele quer agora: grava o que falta
      //    e apaga o que sobrou. Sem isso, trocar de "todos" pra um grupo deixaria o pedido
      //    geral no banco e o portal continuaria cobrando a empresa inteira.
      const chave = (r: ProofRequest) => `${r.platformName}|${r.driverId ?? ''}`;
      const atuais = new Set(jaSolicitadas.map(chave));
      const querKeys = new Set(pedidosDesejados.map(chave));
      for (const r of pedidosDesejados) {
        if (!atuais.has(chave(r))) await requestProof(companyId, periodId, r.platformName, userId, r.driverId);
      }
      for (const r of jaSolicitadas) {
        if (!querKeys.has(chave(r))) await cancelProofRequest(companyId, periodId, r.platformName, userId, r.driverId);
      }
      toast.success(
        pedidosDesejados.length
          ? `Espelho solicitado. ${previa.drivers} entregador(es) vao ver o pedido no portal.`
          : 'Solicitacao cancelada. O portal parou de pedir print.',
      );
      // ⚠️ A gravação já foi feita: uma falha ao RECARREGAR a tela não pode prender
      // o modal aberto com cara de erro. Foi o que aconteceu no primeiro E2E — o
      // pedido entrou no banco e o modal ficou lá, parecendo que nada funcionou.
      try { await onChanged(); } catch (err) { console.error('[solicitar-espelho] recarga falhou:', err); }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao consegui salvar a solicitacao.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      icon={<ClipboardList className="w-5 h-5" />}
      title="Solicitar espelho do app"
      subtitle={periodLabel}
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <>
          {/* Cancelar a SOLICITAÇÃO era escondido: só acontecia desmarcando todas as
              plataformas e clicando em "Solicitar espelho" — ninguém adivinha. Agora tem
              botão próprio, e o "Fechar" ao lado não mexe em nada (antes se chamava
              "Cancelar" e parecia que cancelava o pedido). */}
          {jaSolicitadas.length > 0 && (
            <button
              type="button" onClick={handleCancelarPedido} disabled={salvando || carregando}
              data-testid="proof-request-cancel"
              className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 text-sm font-medium min-h-[40px] flex items-center gap-2 mr-auto"
            >
              {cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Cancelar solicitacao
            </button>
          )}
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Fechar
          </button>
          <button
            type="button" onClick={handleSalvar} disabled={salvando || carregando || !datasOk}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium min-h-[40px] flex items-center gap-2"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {marcadas.size ? 'Solicitar espelho' : 'Parar de pedir'}
          </button>
        </>
      }
    >
      {carregando ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Os entregadores vao ver no portal um pedido pra anexar o <strong>print da tela do app</strong>
            {' '}(a aba <strong>Encerrado</strong>, com o periodo selecionado). O sistema le o print,
            compara com a planilha e marca o <strong>Espelho conferido</strong> sozinho quando bate.
          </p>

          {/* ── Datas: a base da conferencia ───────────────────────────── */}
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Periodo desta quinzena</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
              />
              <span className="text-gray-400 text-sm">ate</span>
              <input
                type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
              />
              {duracao !== null && (
                <span className={`text-xs ${duracaoEstranha ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                  {duracao} dias
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              O print traz a data que o entregador selecionou no app. Se nao for exatamente este periodo,
              o print e <strong>recusado na hora</strong> e ele reenvia — por isso as datas precisam estar certas.
            </p>
            {!datasOk && (inicio || fim) && (
              <p className="text-xs text-red-600 mt-1">A data de inicio tem que vir antes da data de fim.</p>
            )}
            {duracaoEstranha && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Uma quinzena costuma ter 14 dias, e esta ficou com <strong>{duracao}</strong>. Confira o mes
                  das duas datas antes de continuar.
                </p>
              </div>
            )}
          </div>

          {/* ── Plataformas ────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">De qual plataforma pedir o print</p>
            <div className="flex flex-wrap gap-2">
              {platformNames.map((nome) => {
                const ativa = marcadas.has(nome);
                return (
                  <button
                    key={nome} type="button" onClick={() => toggle(nome)}
                    className={`px-3 py-1.5 rounded-full text-sm border min-h-[36px] ${
                      ativa
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {nome}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── De quem pedir (04/08/2026) ─────────────────────────────
               Antes o pedido era sempre da quinzena inteira: nao dava pra cobrar
               so um entregador ou so um grupo. */}
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">De quem pedir o print</p>
            <div className="space-y-2">
              {escopo === 'manter' && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" checked readOnly
                    className="w-4 h-4 mt-0.5 text-blue-600" data-testid="proof-scope-manter"
                  />
                  <span className="text-sm text-gray-800">
                    Manter os <b>{alvosJaPedidos} entregador(es)</b> que ja foram pedidos
                    <span className="block text-xs text-gray-500">
                      Escolha outra opcao abaixo pra trocar quem sera cobrado.
                    </span>
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio" name="proof-scope" checked={escopo === 'todos'}
                  onChange={() => setEscopo('todos')}
                  className="w-4 h-4 mt-0.5 text-blue-600" data-testid="proof-scope-todos"
                />
                <span className="text-sm text-gray-800">Todos os entregadores com pacote</span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio" name="proof-scope" checked={escopo === 'grupo'}
                  onChange={() => setEscopo('grupo')}
                  className="w-4 h-4 mt-0.5 text-blue-600" data-testid="proof-scope-grupo"
                />
                <span className="text-sm text-gray-800">So um grupo</span>
              </label>
              {escopo === 'grupo' && (
                <select
                  value={grupoEscolhido} onChange={(e) => setGrupoEscolhido(e.target.value)}
                  data-testid="proof-scope-grupo-select"
                  className="ml-6 w-[calc(100%-1.5rem)] border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
                >
                  <option value="">Escolha o grupo...</option>
                  {gruposDisponiveis.map((g) => (
                    <option key={g.nome} value={g.nome}>{g.nome} ({g.membros} entregador(es))</option>
                  ))}
                </select>
              )}

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio" name="proof-scope" checked={escopo === 'driver'}
                  onChange={() => setEscopo('driver')}
                  className="w-4 h-4 mt-0.5 text-blue-600" data-testid="proof-scope-driver"
                />
                <span className="text-sm text-gray-800">So um entregador</span>
              </label>
              {escopo === 'driver' && (
                <div className="ml-6 space-y-1.5">
                  <input
                    type="text" value={buscaDriver} onChange={(e) => setBuscaDriver(e.target.value)}
                    placeholder="Buscar pelo nome..." data-testid="proof-scope-driver-busca"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
                  />
                  <select
                    value={driverEscolhido} onChange={(e) => setDriverEscolhido(e.target.value)}
                    data-testid="proof-scope-driver-select"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[40px]"
                  >
                    <option value="">Escolha o entregador...</option>
                    {driversDisponiveis.map((d) => (
                      <option key={d.driverId} value={d.driverId}>
                        {d.name}{d.groupName ? ` — ${d.groupName}` : ''}
                      </option>
                    ))}
                  </select>
                  {buscaDriver.trim() && driversDisponiveis.length === 0 && (
                    <p className="text-xs text-gray-500">Ninguem com esse nome nesta quinzena.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Planilha ainda nao importada (04/08) ────────────────────
               Da pra pedir assim mesmo, pra adiantar: o sistema confere a DATA na hora e
               guarda a quantidade pra comparar quando a planilha chegar. */}
          {[...marcadas].some((n) => semPlanilha?.has(n)) && (
            <div
              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-3"
              data-testid="proof-sem-planilha-aviso"
            >
              <p className="text-sm text-blue-900">
                <strong>
                  A planilha de {[...marcadas].filter((n) => semPlanilha?.has(n)).join(' e ')} ainda
                  nao foi importada nesta quinzena.
                </strong>
              </p>
              <p className="text-xs text-blue-800 mt-1">
                Da pra pedir do mesmo jeito, pra adiantar: vai pra <b>todos os entregadores em
                grupo</b> (o lider anexa por cada membro). O sistema ja <b>recusa na hora</b> print
                de quinzena errada; a conferencia da <b>quantidade</b> acontece sozinha quando voce
                importar a planilha — sem gastar leitura de novo, porque o numero do print ja fica
                guardado.
              </p>
            </div>
          )}

          {/* ── Quem fica de fora por nao ter grupo (regra de 04/08) ───── */}
          {foraSemGrupo.length > 0 && (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3"
              data-testid="proof-sem-grupo-aviso"
            >
              <p className="text-sm text-amber-900">
                <strong>{foraSemGrupo.length} entregador(es) ficam de fora por nao ter grupo:</strong>{' '}
                {foraSemGrupo.slice(0, 8).map((r) => r.name).join(', ')}
                {foraSemGrupo.length > 8 ? ` e mais ${foraSemGrupo.length - 8}` : ''}.
              </p>
              <p className="text-xs text-amber-800 mt-1">
                O pedido "pra todos" so vai pra quem esta em grupo — quem anexa e o lider, que ve um
                cartao por membro. Pra cobrar essa gente, coloque cada um num grupo ou use
                <strong> So um entregador</strong> aqui em cima.
              </p>
            </div>
          )}

          {/* ── Previa honesta de quem vai ser cobrado ─────────────────── */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                {previa.drivers === 0 ? (
                  <span>
                    Ninguem tem pacote nas plataformas escolhidas nesta quinzena — <strong>nenhum print
                    sera pedido</strong>.
                  </span>
                ) : (
                  <>
                    <strong>{previa.drivers}</strong> entregador(es) com pacote,{' '}
                    <strong>{previa.prints}</strong> print(s) no total.
                    {previa.grupos > 0 && (
                      <div className="text-xs text-gray-600 mt-1">
                        {previa.emGrupo} deles estao em {previa.grupos} grupo(s): quem anexa e o{' '}
                        <strong>lider</strong>, mas e <strong>um print por entregador</strong> — o portal
                        do lider mostra um cartao pra cada membro.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {jaSolicitadas.length > 0 && (
            <p className="text-xs text-gray-500">
              {/* ⚠️ jaSolicitadas virou ProofRequest[] em 04/08 (plataforma + alcance).
                  Juntar direto imprimia "[object Object]" na tela. */}
              Ja solicitado nesta quinzena:{' '}
              <strong>{[...new Set(jaSolicitadas.map((r) => r.platformName))].join(', ')}</strong>
              {alvosJaPedidos > 0 && ` (${alvosJaPedidos} entregador(es))`}. Desmarcar faz o portal
              parar de pedir — os prints ja enviados continuam guardados.
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
};
