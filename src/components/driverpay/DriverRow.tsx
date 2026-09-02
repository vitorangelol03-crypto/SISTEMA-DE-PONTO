import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronUp,
  MapPin,
  Plus,
  X,
  Settings,
  Minus,
  Wallet,
  Zap,
  FileText,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clipboard,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import type { DriverPlatform } from '../../services/driverPay';
import {
  DriverRowData,
  RowHandlers,
  computeRowTotals,
  platformPackages,
  isMultiRoute,
  formatBRLIf,
  formatInt,
  type NfProgress,
  type ProofProgress,
  type PagamentoDoDriver,
  rotuloDaEtiquetaDePagamento,
} from './driverPayShared';

interface DriverRowProps {
  row: DriverRowData;
  /** Posição do driver na lista (0-based) — base do zebra striping (linhas alternadas). */
  index: number;
  platforms: DriverPlatform[];
  expanded: boolean;
  readOnly: boolean;
  canEdit: boolean;
  canConfig: boolean;
  canDiscount: boolean;
  canVale: boolean;
  canMirror: boolean;
  /** Marcar como pago manualmente, sem gerar relatório (14/08/2026). */
  canMarkPaid: boolean;
  /** Ver valores em R$ (02/09/2026) — false esconde os números desta linha. */
  canViewValues: boolean;
  handlers: RowHandlers;
  /** Espelho já publicado no app do driver (selo "no app"). */
  publishedInApp?: boolean;
  /** Progresso da NF (validadas/esperadas, ciente de grupo). Ausente = sem dado. */
  nfProgress?: NfProgress;
  /** Espelho do app (print da Shopee) — 04/08. Ausente = ninguem solicitou. */
  proofProgress?: ProofProgress;
  /** Plataformas em que ele ficou de fora do pedido geral por nao ter grupo. */
  semGrupoFora?: string[];
  /** Situacao de PAGAMENTO deste driver (tag "pago"/"parcial"). */
  pagamento?: PagamentoDoDriver;
  /** Seleção para "Espelhos da seleção" (2026-07-18). Ausente = sem checkbox. */
  selected?: boolean;
  /** Driver já coberto por um GRUPO selecionado: checkbox marcado e travado. */
  selectionLocked?: boolean;
  /** Clique começou nesta linha: guarda a âncora do arrasto de seleção (04/08/2026). */
  onSelArrastoInicio?: () => void;
  /** Mouse passou por esta linha com o botão preso. */
  onSelArrastoSobre?: () => void;
  onToggleSelect?: (paymentId: string) => void;
}

const parsePackages = (raw: string): number => {
  const digits = raw.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

/** Aceita "R$ 2,00" / "2,5" / "2.5" -> 2.5 (mesmo parser do DriverFormModal). */
const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

/** Numero -> string editavel em pt-BR (ex.: 2 -> "2,00"). */
const formatRateInput = (n: number): string => n.toFixed(2).replace('.', ',');

export const DriverRow: React.FC<DriverRowProps> = ({
  row,
  index,
  platforms,
  expanded,
  readOnly,
  canEdit,
  canConfig,
  canDiscount,
  canVale,
  canMirror,
  canMarkPaid,
  canViewValues,
  handlers,
  publishedInApp,
  nfProgress,
  proofProgress,
  semGrupoFora = [],
  pagamento,
  selected,
  selectionLocked,
  onSelArrastoInicio,
  onSelArrastoSobre,
  onToggleSelect,
}) => {
  const multi = isMultiRoute(row);
  const totals = computeRowTotals(row);
  // driver+grupo (2) + plataformas + 5 totais (pacotes, ZAPEX, desconto, vale, receber)
  // + NF (1) + Espelho (1) + acoes (1). A coluna "Print" saiu em 05/08 — virou selo
  // dentro do Espelho; se o colspan nao acompanhasse, a linha das rotas desalinharia.
  const totalCols = 2 + platforms.length + 5 + 1 + 1 + 1;
  const inputsDisabled = readOnly || !canEdit;
  // Ganho Zapex do driver: qtd de itens x valor unitario individual (soma no total a receber).
  const zapexCount = row.zapex.length;
  const zapexAmount = zapexCount * row.zapexRate;

  // Rascunhos locais dos inputs de taxa por rota (chave `${routeIndex}:${plataforma}`),
  // para permitir digitar decimais com virgula sem o valor "colapsar" a cada tecla.
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});

  // Zebra striping: linhas alternadas (branca / cinza) para não perder a linha ao ler
  // a tabela larga. Cores OPACAS porque a 1ª coluna é sticky (precisa cobrir as demais
  // ao rolar na horizontal). Hover acende a linha inteira; foco em qualquer input dela
  // (editando) destaca mais forte via focus-within.
  // "Espelho conferido" pinta a linha INTEIRA de verde (sobrepõe a zebra) — fácil de
  // bater o olho e ver quem já foi conferido.
  const confirmed = row.espelhoConferido;
  const zebra = index % 2 === 1 ? 'bg-slate-300' : 'bg-white';
  const rowBg = confirmed ? 'bg-green-300' : zebra;
  const rowHover = confirmed
    ? 'hover:bg-green-400 focus-within:bg-green-400'
    : 'hover:bg-sky-100 focus-within:bg-sky-200';
  const stickyHover = confirmed
    ? 'group-hover:bg-green-400 group-focus-within:bg-green-400'
    : 'group-hover:bg-sky-100 group-focus-within:bg-sky-200';

  return (
    <>
      <tr
        // Arrasto de seleção: a LINHA INTEIRA é alvo, não só a caixinha de 16px.
        onMouseEnter={(e) => { if (e.buttons === 1) onSelArrastoSobre?.(); }}
        className={`group ${rowBg} transition-colors ${rowHover}`}
      >
        {/* Driver / Rota — coluna "grudada" (sticky) ao rolar na horizontal */}
        <td
          /* 07/08/2026 — largura minima + alinhamento pelo TOPO: sem isso o nome longo
             quebrava em 4 linhas e as etiquetas caiam em lugares diferentes a cada linha
             ("esta muito feio", palavras dele). */
          className={`sticky left-0 z-10 border-r border-gray-200 px-3 py-3 align-top min-w-[17rem] ${rowBg} ${stickyHover}`}
        >
          <div className="flex items-start gap-2">
            <span className="flex items-center gap-1.5 pt-0.5 flex-shrink-0">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  data-testid="check-driver"
                  checked={!!selected || !!selectionLocked}
                  disabled={!!selectionLocked}
                  onChange={() => onToggleSelect(row.paymentId)}
                  // O clique simples segue no `onChange`; aqui só guarda a âncora.
                  onMouseDown={() => { if (!selectionLocked) onSelArrastoInicio?.(); }}
                  title={selectionLocked
                    ? 'Já incluído pelo grupo selecionado'
                    : 'Selecionar para espelho — segure e arraste para marcar vários'}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 flex-shrink-0 disabled:opacity-60"
                />
              )}
              {multi && (
                <button
                  type="button"
                  onClick={() => handlers.onToggleExpand(row.paymentId)}
                  title="Editar rotas"
                  className="text-gray-400 hover:text-blue-600"
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  />
                </button>
              )}
            </span>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="font-semibold text-gray-900 leading-snug break-words">{row.name}</span>
              <div className="flex flex-wrap items-center gap-1.5">
              {/* Tag de PAGAMENTO (04/08/2026) — some quando ele nao tem pacote nenhum. */}
              {pagamento && pagamento.estado !== 'sem_pacote' && pagamento.estado !== 'pendente' && (
                /* CLICÁVEL desde 04/08/2026 (pedido do Victor): a marca é gravada sozinha
                   ao gerar relatório — inclusive numa geração feita só pra conferir o
                   layout. Sem um jeito de desfazer pelo painel, o único caminho era SQL. */
                <button
                  type="button"
                  data-testid="row-selo-pago"
                  onClick={() => handlers.onDesmarcarPagamento(row.driverId, row.name)}
                  title={`${pagamento.estado === 'concluido'
                    ? `Pagamento concluído em ${pagamento.ultimoPagamento ? new Date(pagamento.ultimoPagamento).toLocaleDateString('pt-BR') : ''}.\nPlataformas pagas: ${pagamento.pagas.join(', ')}.`
                    : `Plataformas pagas: ${pagamento.pagas.join(', ')}.\nAinda falta: ${pagamento.faltando.join(', ')}.`}\n\nClique para DESMARCAR.`}
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap cursor-pointer hover:line-through hover:opacity-80 ${
                    pagamento.estado === 'concluido'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}
                >
                  {/* 05/08/2026 — a etiqueta agora NOMEIA as plataformas também no pagamento
                      completo (antes só mostrava a data). A dica traz a lista inteira. */}
                  {rotuloDaEtiquetaDePagamento(pagamento)}
                </button>
              )}
              {/* Pagou, mas o vale/perda NAO foi descontado: fica pendente e some fácil (04/08/2026) */}
              {pagamento?.descontoPendente && (
                <span
                  data-testid="row-selo-sem-desconto"
                  title="Este entregador foi pago SEM o desconto de vale/perda — o desconto ficou pendente pro pagamento das demais plataformas."
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 whitespace-nowrap"
                >
                  vale a descontar
                </span>
              )}
              {/* Saldo herdado de quinzena fechada (15/08/2026) — não se mistura com
                  vale/perda de verdade, mas conta na mesma dívida (deductionsOf). */}
              {row.carryover > 0 && (
                <span
                  data-testid="row-selo-herdado"
                  title={`${formatBRLIf(row.carryover, canViewValues)} de vale/perda que ficou sem descontar numa quinzena fechada, migrado pra cá.`}
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap"
                >
                  {formatBRLIf(row.carryover, canViewValues)} herdado
                </span>
              )}
              </div>
              <span className="text-sm text-gray-600 flex items-center gap-1 flex-wrap">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {multi ? (
                <>
                  <span className="text-gray-900">{row.routes[0]?.route || '—'}</span>
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    {row.routes.length} rotas
                  </span>
                </>
              ) : (
                <>
                  <span>{row.routes[0]?.route || row.route || '—'}</span>
                  {!inputsDisabled && (
                    <button
                      type="button"
                      onClick={() => handlers.onAddRoute(row.paymentId)}
                      className="text-blue-600 hover:bg-blue-50 rounded px-1 inline-flex items-center gap-0.5 text-xs font-medium"
                    >
                      <Plus className="w-4 h-4" /> rota
                    </button>
                  )}
                </>
              )}
              </span>
            </div>
          </div>
        </td>

        {/* Grupo */}
        <td className="px-3 py-3 align-middle">
          {row.groupName ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
              {row.groupName}
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">—</span>
          )}
        </td>

        {/* Colunas por plataforma */}
        {platforms.map((pl) => {
          const sum = platformPackages(row, pl.name);
          // Taxa por rota: em multi-rota o resumo mostra a taxa comum, ou "vários"
          // quando as rotas divergem naquela plataforma. O total em R$ (coluna
          // "Total pacotes") ja soma corretamente via computeRowTotals.
          const routeRates = row.routes.map(
            (rl) => rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate,
          );
          const allSameRate = routeRates.every((r) => r === routeRates[0]);
          const plColor = pl.color;
          return (
            <td key={pl.id} className="px-2 py-3 text-center align-middle">
              {/* 07/08/2026 — o nome da plataforma passou a aparecer SEMPRE, em cima da
                  caixinha (pedido dele: "quero os nomes das plataformas aparecendo para
                  ficar mais facil de identificar"). Antes so aparecia ao passar o mouse, e
                  quem rolava a lista perdia de vista qual coluna era qual.
                  Fica na cor da propria plataforma, entao a coluna se identifica sozinha. */}
              <div className="inline-flex flex-col items-center gap-0.5">
                <span
                  title={pl.name}
                  className="max-w-[6.5rem] truncate text-[11px] font-bold leading-none"
                  style={{ color: plColor ?? '#4b5563' }}
                >
                  {pl.name}
                </span>
                {multi ? (
                  /*
                    06/08/2026 — a linha de multi-rota mostrava NÚMERO SOLTO enquanto as
                    outras mostravam caixinha: as colunas das plataformas não alinhavam de
                    uma linha pra outra (dá pra ver no print do Victor). Agora ela usa a
                    MESMA caixa, com a MESMA borda colorida da plataforma — só tracejada e
                    com fundo cinza, que é como a tela diz "aqui não se digita, some as
                    rotas". Nada mudou no valor nem em quem pode editar.
                  */
                  <span
                    title="soma das rotas — para editar, abra as rotas"
                    style={plColor ? { borderColor: plColor } : undefined}
                    className={`w-14 inline-block text-right rounded-md px-1.5 py-1.5 text-sm font-semibold tabular-nums bg-gray-50 text-gray-600 ${
                      plColor ? 'border-2 border-dashed' : 'border border-dashed border-gray-300'
                    }`}
                  >
                    {formatInt(sum)}
                  </span>
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={inputsDisabled}
                    value={row.routes[0]?.packages[pl.name] ?? 0}
                    onChange={(e) =>
                      handlers.onPackageChange(row.paymentId, 0, pl.name, parsePackages(e.target.value))
                    }
                    onBlur={() => handlers.onPackageBlur(row.paymentId, 0, pl.name)}
                    style={plColor ? ({ borderColor: plColor, ['--tw-ring-color']: plColor } as React.CSSProperties) : undefined}
                    className={`w-14 text-right rounded-md px-1.5 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                      plColor ? 'border-2' : 'border border-gray-300 focus:ring-blue-500/30 focus:border-blue-500'
                    }`}
                  />
                )}
                {multi && !allSameRate ? (
                  <span
                    className="text-gray-700 text-xs font-semibold whitespace-nowrap"
                    title="taxas diferentes por rota — abra as rotas para editar"
                  >
                    vários
                  </span>
                ) : (
                  <span className="text-gray-700 text-xs font-semibold whitespace-nowrap">
                    {formatBRLIf(routeRates[0] ?? 0, canViewValues)}
                  </span>
                )}
              </div>
            </td>
          );
        })}

        {/* Total pacotes (R$) */}
        <td className="px-2 py-3 text-right align-middle tabular-nums text-gray-900">
          {formatBRLIf(totals.packagesAmount, canViewValues)}
        </td>

        {/* Zapex (ganho por item = qtd x valor unitario do driver) */}
        <td className="px-2 py-3 text-right align-middle">
          {zapexCount > 0 ? (
            <div className="inline-flex flex-col items-end leading-tight">
              <span className="font-semibold text-green-600 whitespace-nowrap tabular-nums">
                {formatBRLIf(zapexAmount, canViewValues)}
              </span>
              <span className="text-[11px] text-gray-400">
                {zapexCount} Zapex
              </span>
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>

        {/* Desconto */}
        <td className="px-2 py-3 text-right align-middle">
          {totals.discounts > 0 ? (
            <span className="font-semibold text-red-600 whitespace-nowrap">− {formatBRLIf(totals.discounts, canViewValues)}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>

        {/* Vale */}
        <td className="px-2 py-3 text-right align-middle">
          {totals.vales > 0 ? (
            <span className="font-semibold text-amber-600 whitespace-nowrap">− {formatBRLIf(totals.vales, canViewValues)}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>

        {/* Total a receber */}
        <td className="px-2 py-3 text-right align-middle">
          <span
            className={`font-bold tabular-nums whitespace-nowrap ${
              totals.net < 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatBRLIf(totals.net, canViewValues)}
          </span>
        </td>

        {/* Nota Fiscal: progresso "validadas/esperadas" (ciente de grupo — só o líder anexa).
            Verde = todas validadas OU marcado na mão. Clique marca/desmarca na mão;
            validar cada nota é no botão "Notas recebidas". Sem CNPJ esperado = círculo manual. */}
        <td className="px-2 py-3 text-center align-middle">
          {nfProgress && nfProgress.expected > 0 ? (
            <button
              type="button"
              onClick={() => handlers.onToggleNota(row.paymentId, row.notaFiscal)}
              disabled={inputsDisabled}
              aria-pressed={nfProgress.complete}
              title="NF: notas validadas / esperadas (CNPJs). Verde = todas validadas. Clique marca/desmarca na mão; valide cada nota em 'Notas recebidas'."
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tabular-nums border disabled:opacity-40 disabled:cursor-not-allowed ${
                nfProgress.complete
                  ? 'bg-green-100 text-green-700 border-green-300'
                  : nfProgress.pending > 0
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-gray-100 text-gray-500 border-gray-300'
              }`}
            >
              {nfProgress.complete ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              {nfProgress.manual && nfProgress.complete ? 'na mão' : `${nfProgress.validated}/${nfProgress.expected}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handlers.onToggleNota(row.paymentId, row.notaFiscal)}
              disabled={inputsDisabled}
              title={row.notaFiscal ? 'Nota fiscal recebida (na mão)' : 'Sem CNPJ esperado — clique p/ marcar recebida na mão'}
              aria-pressed={row.notaFiscal}
              className="inline-flex items-center justify-center rounded-full hover:bg-gray-100 p-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              {row.notaFiscal ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 fill-green-100" />
              ) : (
                <Circle className="w-6 h-6 text-gray-500" />
              )}
            </button>
          )}
        </td>

        {/* ══════════════════════════════════════════════════════════════════════
            ESPELHO — UMA COLUNA SÓ (05/08/2026, pedido do Victor)
            *"esses dois são a mesma coisa […] remove o do print e deixa somente do
            espelho"*. Existiam "Print" e "Espelho" lado a lado contando a MESMA
            história: o print é o meio, o espelho conferido é o fim. Duas colunas pro
            mesmo assunto viravam dúvida ("qual eu olho?").

            Agora: verde = conferido — não importa se foi o print que bateu, se ele não
            entrega Shopee (o sistema marca sozinho) ou se alguém marcou na mão.

            O aviso do print sobrou aqui **só quando exige ação**: recusado ou quantidade
            que não bate. Isso não podia sumir com a coluna — é o único lugar da grade
            que mostra que tem entregador esperando resposta. O resto (quantos, quem,
            quando) continua em "Espelhos recebidos".
            ══════════════════════════════════════════════════════════════════════ */}
        <td className="px-2 py-3 text-center align-middle">
          <div className="inline-flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => handlers.onToggleEspelho(row.paymentId, row.espelhoConferido)}
              disabled={inputsDisabled}
              title={row.espelhoConferido ? 'Espelho conferido (bate com a planilha)' : 'Marcar espelho conferido'}
              aria-pressed={row.espelhoConferido}
              className="inline-flex items-center justify-center rounded-full hover:bg-white/50 p-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              {row.espelhoConferido ? (
                <ClipboardCheck className="w-6 h-6 text-green-700" />
              ) : (
                <Clipboard className="w-6 h-6 text-gray-500" />
              )}
            </button>
            {!row.espelhoConferido && proofProgress && (proofProgress.needsAttention || proofProgress.rejected > 0) && (
              <button
                type="button"
                onClick={() => handlers.onVerEspelhoAtencao(row)}
                title={
                  proofProgress.rejected > 0
                    ? 'Print recusado (data errada ou ilegivel) — clique para ver o motivo e validar'
                    : 'O print chegou mas a quantidade NAO bate com a planilha — clique para ver e validar'
                }
                data-testid="espelho-atencao"
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold border bg-amber-100 text-amber-700 border-amber-300 whitespace-nowrap hover:bg-amber-200 hover:border-amber-400 cursor-pointer"
              >
                <AlertTriangle className="w-3 h-3" />
                {proofProgress.rejected > 0 ? 'recusado' : 'não bate'}
              </button>
            )}
            {!row.espelhoConferido && semGrupoFora.length > 0 && (
              /* Regra de logistica (04/08/2026): o pedido "pra todos" nao cobra quem esta
                 sem grupo. Sem este selo, ele viraria um cadeado mudo — cinza pra sempre e
                 sem ninguem entender por que o print nunca chega. */
              <span
                title={`Nao foi pedido: este entregador nao esta em nenhum grupo (${semGrupoFora.join(', ')}). Coloque-o num grupo ou peca o print so dele.`}
                data-testid="espelho-sem-grupo"
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold border bg-gray-50 text-gray-500 border-gray-300 whitespace-nowrap"
              >
                <Circle className="w-3 h-3" />
                sem grupo
              </span>
            )}
            {publishedInApp && (
              <span
                title="Espelho publicado no app do driver"
                className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap inline-flex items-center gap-0.5"
              >
                <Smartphone className="w-3 h-3" /> no app
              </span>
            )}
          </div>
        </td>

        {/* Acoes */}
        {/* 07/08/2026 — acoes: os icones ficavam espremidos e desalinhados no canto.
            Agora cada um tem area de clique propria e o bloco fica encostado a direita,
            na mesma altura em todas as linhas. */}
        <td className="px-2 py-3 text-right align-middle whitespace-nowrap">
          <div className="inline-flex items-center gap-0.5 justify-end">
            {canConfig && (
              <button
                type="button"
                onClick={() => handlers.onConfigDriver(row)}
                title="Configurar valores / PIX"
                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md p-1.5"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {canDiscount && (
              <button
                type="button"
                onClick={() => handlers.onDiscount(row)}
                disabled={readOnly}
                title="Lançar desconto"
                className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md p-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            {canVale && (
              <button
                type="button"
                onClick={() => handlers.onVale(row)}
                disabled={readOnly}
                title="Lançar vale"
                className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-md p-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Wallet className="w-4 h-4" />
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => handlers.onZapex(row)}
                disabled={readOnly}
                title="Lançar Zapex"
                className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md p-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
            {canMirror && (
              <button
                type="button"
                onClick={() => handlers.onMirror(row)}
                title="Ver / gerar espelho"
                className="text-gray-500 hover:text-blue-600"
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
            {canMarkPaid && pagamento && pagamento.estado !== 'sem_pacote' && pagamento.estado !== 'concluido' && (
              <button
                type="button"
                onClick={() => handlers.onMarkPaid(row)}
                disabled={readOnly}
                title="Marcar como pago manualmente, sem gerar relatório"
                className="text-green-600 hover:text-green-800 hover:bg-green-50 rounded-md p-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Sub-linhas: edicao por rota (multi-rota expandida) */}
      {multi && expanded &&
        row.routes.map((rl, ri) => (
          <tr key={`${row.paymentId}-route-${ri}`} className="bg-blue-50/40">
            <td colSpan={2} className="px-4 py-2 align-middle">
              <div className="flex items-center gap-2 pl-5">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  disabled={inputsDisabled}
                  value={rl.route}
                  placeholder="cidade"
                  onFocus={(e) => {
                    e.currentTarget.dataset.prev = rl.route;
                  }}
                  onChange={(e) => handlers.onCityChange(row.paymentId, ri, e.target.value)}
                  onBlur={(e) => handlers.onCityBlur(row.paymentId, ri, e.currentTarget.dataset.prev ?? rl.route)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full max-w-[190px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50"
                />
                {!inputsDisabled && row.routes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handlers.onRemoveRoute(row.paymentId, ri)}
                    title="Remover rota"
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md p-1.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </td>
            {platforms.map((pl) => {
              const rateKey = `${ri}:${pl.name}`;
              const rateNum = rl.rates[pl.name] ?? row.ratesByPlatform[pl.name] ?? pl.default_rate;
              const rateValue = rateDrafts[rateKey] ?? formatRateInput(rateNum);
              return (
                <td key={pl.id} className="px-3 py-2 text-center align-middle">
                  <div className="inline-flex flex-col items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={inputsDisabled}
                      value={rl.packages[pl.name] ?? 0}
                      title="Pacotes desta rota"
                      onChange={(e) =>
                        handlers.onPackageChange(row.paymentId, ri, pl.name, parsePackages(e.target.value))
                      }
                      onBlur={() => handlers.onPackageBlur(row.paymentId, ri, pl.name)}
                      className="w-14 text-right border border-gray-300 rounded-md px-1.5 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    {/* Taxa (R$/pacote) DESTA rota — editavel por rota */}
                    <div className="relative">
                      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">
                        R$
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={inputsDisabled}
                        value={rateValue}
                        title="Valor por pacote desta rota"
                        onFocus={(e) => {
                          setRateDrafts((prev) => ({ ...prev, [rateKey]: formatRateInput(rateNum) }));
                          e.currentTarget.select();
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setRateDrafts((prev) => ({ ...prev, [rateKey]: raw }));
                          handlers.onRateChange(row.paymentId, ri, pl.name, parseRate(raw));
                        }}
                        onBlur={() => {
                          setRateDrafts((prev) => {
                            const next = { ...prev };
                            delete next[rateKey];
                            return next;
                          });
                          handlers.onRateBlur(row.paymentId, ri, pl.name);
                        }}
                        className="w-20 pl-6 pr-1.5 text-right border border-gray-200 rounded-md py-1 text-xs tabular-nums text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                </td>
              );
            })}
            <td className="px-3 py-2 text-right text-xs text-gray-400 align-middle">
              {formatInt(Object.values(rl.packages).reduce((s, n) => s + n, 0))} pct
            </td>
            {/* ZAPEX + Desconto + Vale + Total a receber + NF + Espelho + Ações (Zapex é por driver, não por rota) */}
            <td colSpan={7} />
          </tr>
        ))}

      {/* Sub-linha: adicionar rota / juntar */}
      {multi && expanded && !inputsDisabled && (
        <tr className="bg-blue-50/40">
          <td colSpan={totalCols} className="px-4 py-2">
            <div className="flex gap-4 pl-5">
              <button
                type="button"
                onClick={() => handlers.onAddRoute(row.paymentId)}
                className="text-blue-600 hover:bg-blue-50 rounded px-1 inline-flex items-center gap-1 text-xs font-medium"
              >
                <Plus className="w-4 h-4" /> Adicionar rota
              </button>
              <button
                type="button"
                onClick={() => handlers.onToggleExpand(row.paymentId)}
                title="Recolhe a edição por rota; mantém cada rota e seu valor unitário (não destrói nada)."
                className="text-blue-600 hover:bg-blue-50 rounded px-1 inline-flex items-center gap-1 text-xs font-medium"
              >
                <ChevronUp className="w-4 h-4" /> Recolher (ver só o total)
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
