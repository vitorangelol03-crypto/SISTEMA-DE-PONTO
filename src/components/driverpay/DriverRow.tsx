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
} from 'lucide-react';
import type { DriverPlatform } from '../../services/driverPay';
import {
  DriverRowData,
  RowHandlers,
  computeRowTotals,
  platformPackages,
  isMultiRoute,
  formatBRL,
  formatInt,
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
  handlers: RowHandlers;
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
  handlers,
}) => {
  const multi = isMultiRoute(row);
  const totals = computeRowTotals(row);
  // driver+grupo (2) + plataformas + 5 totais (pacotes, ZAPEX, desconto, vale, receber) + NF (1) + Espelho (1) + acoes (1)
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
      <tr className={`group ${rowBg} transition-colors ${rowHover}`}>
        {/* Driver / Rota — coluna "grudada" (sticky) ao rolar na horizontal */}
        <td
          className={`sticky left-0 z-10 border-r border-gray-200 px-4 py-3 align-middle ${rowBg} ${stickyHover}`}
        >
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-gray-900 flex items-center gap-2">
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
              <span className="break-words">{row.name}</span>
            </span>
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
        </td>

        {/* Grupo */}
        <td className="px-4 py-3 align-middle">
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
            <td key={pl.id} className="px-3 py-3 text-center align-middle relative">
              {/* Mini-cabecalho: nome da plataforma acima do quadradinho, aparece ao passar
                  o mouse na linha (util quando a pessoa esta longe do cabecalho da tabela). */}
              <span
                className="pointer-events-none absolute left-1/2 top-0.5 z-10 -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] font-bold text-white whitespace-nowrap shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                style={{ backgroundColor: plColor ?? '#374151' }}
              >
                {pl.name}
              </span>
              <div className="inline-flex flex-col items-center gap-0.5">
                {multi ? (
                  <span className="min-w-[40px] text-right font-bold text-gray-700 tabular-nums" title="soma das rotas">
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
                    className={`w-14 text-right rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                      plColor ? 'border-2' : 'border border-gray-300 focus:ring-blue-500/30 focus:border-blue-500'
                    }`}
                  />
                )}
                {multi && !allSameRate ? (
                  <span
                    className="text-gray-400 text-xs whitespace-nowrap"
                    title="taxas diferentes por rota — abra as rotas para editar"
                  >
                    vários
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs whitespace-nowrap">{formatBRL(routeRates[0] ?? 0)}</span>
                )}
              </div>
            </td>
          );
        })}

        {/* Total pacotes (R$) */}
        <td className="px-3 py-3 text-right align-middle tabular-nums text-gray-900">
          {formatBRL(totals.packagesAmount)}
        </td>

        {/* Zapex (ganho por item = qtd x valor unitario do driver) */}
        <td className="px-3 py-3 text-right align-middle">
          {zapexCount > 0 ? (
            <div className="inline-flex flex-col items-end leading-tight">
              <span className="font-semibold text-green-600 whitespace-nowrap tabular-nums">
                {formatBRL(zapexAmount)}
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
        <td className="px-3 py-3 text-right align-middle">
          {totals.discounts > 0 ? (
            <span className="font-semibold text-red-600 whitespace-nowrap">− {formatBRL(totals.discounts)}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>

        {/* Vale */}
        <td className="px-3 py-3 text-right align-middle">
          {totals.vales > 0 ? (
            <span className="font-semibold text-amber-600 whitespace-nowrap">− {formatBRL(totals.vales)}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>

        {/* Total a receber */}
        <td className="px-3 py-3 text-right align-middle">
          <span
            className={`font-bold tabular-nums whitespace-nowrap ${
              totals.net < 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatBRL(totals.net)}
          </span>
        </td>

        {/* Nota Fiscal (check grande e obvio) */}
        <td className="px-3 py-3 text-center align-middle">
          <button
            type="button"
            onClick={() => handlers.onToggleNota(row.paymentId, row.notaFiscal)}
            disabled={inputsDisabled}
            title={row.notaFiscal ? 'Nota fiscal recebida' : 'Marcar nota fiscal recebida'}
            aria-pressed={row.notaFiscal}
            className="inline-flex items-center justify-center rounded-full hover:bg-gray-100 p-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            {row.notaFiscal ? (
              <CheckCircle2 className="w-6 h-6 text-green-600 fill-green-100" />
            ) : (
              <Circle className="w-6 h-6 text-gray-500" />
            )}
          </button>
        </td>

        {/* Espelho conferido — quando marcado, a linha inteira do driver fica verde */}
        <td className="px-3 py-3 text-center align-middle">
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
        </td>

        {/* Acoes */}
        <td className="px-3 py-3 text-center align-middle">
          <div className="inline-flex gap-2.5 justify-end">
            {canConfig && (
              <button
                type="button"
                onClick={() => handlers.onConfigDriver(row)}
                title="Configurar valores / PIX"
                className="text-blue-600 hover:text-blue-800"
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
                className="text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="text-amber-600 hover:text-amber-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    className="text-red-600 hover:text-red-800"
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
                      className="w-14 text-right border border-gray-300 rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    {/* Taxa (R$/pacote) DESTA rota — editavel por rota */}
                    <div className="relative">
                      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">
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
