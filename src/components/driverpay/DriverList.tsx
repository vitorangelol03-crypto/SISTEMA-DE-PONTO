import React, { useState } from 'react';
import {
  MapPin,
  Settings,
  Minus,
  Wallet,
  Zap,
  FileText,
  ChevronRight,
  Users,
  Tag,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clipboard,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import type { DriverPlatform } from '../../services/driverPay';
import { DriverRow } from './DriverRow';
import {
  DriverRowData,
  RowHandlers,
  computeRowTotals,
  platformPackages,
  formatBRL,
  formatInt,
} from './driverPayShared';

interface DriverListProps {
  rows: DriverRowData[];
  platforms: DriverPlatform[];
  expanded: Set<string>;
  view: 'list' | 'groups';
  readOnly: boolean;
  canEdit: boolean;
  canConfig: boolean;
  canDiscount: boolean;
  canVale: boolean;
  canMirror: boolean;
  handlers: RowHandlers;
  onGroupMirror: (groupName: string, rows: DriverRowData[]) => void;
}

const NO_GROUP = 'Sem grupo';

interface Totals {
  drivers: number;
  packagesAmount: number;
  zapex: number;
  discounts: number;
  vales: number;
  net: number;
}

function sumTotals(rows: DriverRowData[]): Totals {
  return rows.reduce<Totals>(
    (acc, row) => {
      const t = computeRowTotals(row);
      return {
        drivers: acc.drivers + 1,
        packagesAmount: acc.packagesAmount + t.packagesAmount,
        zapex: acc.zapex + t.zapex,
        discounts: acc.discounts + t.discounts,
        vales: acc.vales + t.vales,
        net: acc.net + t.net,
      };
    },
    { drivers: 0, packagesAmount: 0, zapex: 0, discounts: 0, vales: 0, net: 0 },
  );
}

export const DriverList: React.FC<DriverListProps> = ({
  rows,
  platforms,
  expanded,
  view,
  readOnly,
  canEdit,
  canConfig,
  canDiscount,
  canVale,
  canMirror,
  handlers,
  onGroupMirror,
}) => {
  // Ordenacao pelo cabecalho: 1 clique = maior→menor (desc), 2 cliques = menor→maior
  // (asc), 3 cliques = desativa. So reordena (mostra todos), nao esconde ninguem.
  type SortDir = 'asc' | 'desc';
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  // 1 clique: maior→menor (desc). 2 cliques: menor→maior (asc). 3 cliques: desativa.
  const toggleSort = (key: string) =>
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: 'desc' };
      if (cur.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });

  const sortValue = (row: DriverRowData, key: string): number | string => {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'group') return (row.groupName ?? '').toLowerCase();
    if (key.startsWith('pl:')) return platformPackages(row, key.slice(3));
    const t = computeRowTotals(row);
    switch (key) {
      case 'packages':
        return t.totalPackages;
      case 'zapex':
        return t.zapex;
      case 'discount':
        return t.discounts;
      case 'vale':
        return t.vales;
      case 'net':
        return t.net;
      case 'nf':
        return row.notaFiscal ? 1 : 0;
      case 'espelho':
        return row.espelhoConferido ? 1 : 0;
      default:
        return 0;
    }
  };

  const sortRows = (list: DriverRowData[]): DriverRowData[] => {
    if (!sort) return list;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return list
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const va = sortValue(a.row, sort.key);
        const vb = sortValue(b.row, sort.key);
        const cmp =
          typeof va === 'string' || typeof vb === 'string'
            ? String(va).localeCompare(String(vb), 'pt-BR')
            : (va as number) - (vb as number);
        return cmp !== 0 ? cmp * mul : a.i - b.i; // desempate estavel = ordem original
      })
      .map((x) => x.row);
  };

  /** Conteudo clicavel de um cabecalho: label + seta (↑/↓ quando ativo, ↕ quando nao). */
  const sortBtn = (key: string, label: string, color?: string | null) => {
    const activeDir = sort && sort.key === key ? sort.dir : null;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        title="Ordenar: 1x maior→menor · 2x menor→maior · 3x desativa"
        className={`group/sort inline-flex items-center gap-1 hover:text-gray-800 ${activeDir ? 'text-blue-600' : ''}`}
      >
        <span className={color ? 'font-bold' : ''} style={color ? { color } : undefined}>
          {label}
        </span>
        {activeDir === 'asc' ? (
          <ArrowUp className="w-3.5 h-3.5" />
        ) : activeDir === 'desc' ? (
          <ArrowDown className="w-3.5 h-3.5" />
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-30 group-hover/sort:opacity-70" />
        )}
      </button>
    );
  };

  const renderTable = (subset: DriverRowData[], withFooter: boolean, footerLabel = 'TOTAL GERAL') => {
    const totals = withFooter ? sumTotals(subset) : null;
    const nfCount = subset.filter((r) => r.notaFiscal).length;
    const espelhoCount = subset.filter((r) => r.espelhoConferido).length;
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('name', 'Driver / Rota')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('group', 'Grupo')}
              </th>
              {platforms.map((pl) => (
                <th
                  key={pl.id}
                  className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {sortBtn(`pl:${pl.name}`, pl.name, pl.color)}
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('packages', 'Total pacotes')}
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('zapex', 'Zapex', '#9333ea')}
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('discount', 'Desconto')}
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('vale', 'Vale')}
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                {sortBtn('net', 'Total a receber')}
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('nf', 'NF')}
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {sortBtn('espelho', 'Espelho')}
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortRows(subset).map((row, index) => (
              <DriverRow
                key={row.paymentId}
                row={row}
                index={index}
                platforms={platforms}
                expanded={expanded.has(row.paymentId)}
                readOnly={readOnly}
                canEdit={canEdit}
                canConfig={canConfig}
                canDiscount={canDiscount}
                canVale={canVale}
                canMirror={canMirror}
                handlers={handlers}
              />
            ))}
          </tbody>
          {totals && (
            <tfoot className="bg-gray-50">
              <tr className="border-t-2 border-gray-300">
                <td colSpan={3 + platforms.length} className="px-4 py-3.5 text-sm font-bold text-gray-900">
                  {footerLabel} — {totals.drivers} driver(s)
                </td>
                <td className="px-3 py-3.5 text-right text-sm font-bold text-green-600 whitespace-nowrap">
                  {totals.zapex > 0 ? formatBRL(totals.zapex) : '—'}
                </td>
                <td className="px-3 py-3.5 text-right text-sm font-bold text-red-600 whitespace-nowrap">
                  {totals.discounts > 0 ? `− ${formatBRL(totals.discounts)}` : '—'}
                </td>
                <td className="px-3 py-3.5 text-right text-sm font-bold text-amber-600 whitespace-nowrap">
                  {totals.vales > 0 ? `− ${formatBRL(totals.vales)}` : '—'}
                </td>
                <td className="px-3 py-3.5 text-right text-base font-bold text-green-600 whitespace-nowrap">
                  {formatBRL(totals.net)}
                </td>
                <td className="px-3 py-3.5 text-center text-xs font-bold text-gray-700 whitespace-nowrap">
                  NF {nfCount}/{totals.drivers}
                </td>
                <td className="px-3 py-3.5 text-center text-xs font-bold text-green-700 whitespace-nowrap">
                  Espelho {espelhoCount}/{totals.drivers}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  const renderMobileCard = (row: DriverRowData) => {
    const t = computeRowTotals(row);
    const multi = row.routes.length > 1;
    return (
      <div
        key={row.paymentId}
        className={`p-4 ${row.espelhoConferido ? 'bg-green-300 hover:bg-green-400' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 break-words">{row.name}</div>
            <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5 flex-wrap">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {multi ? `${row.routes[0]?.route || '—'} · ${row.routes.length} rotas` : row.routes[0]?.route || row.route || '—'}
            </div>
          </div>
          {row.groupName ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 whitespace-nowrap flex-shrink-0">
              {row.groupName}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          {platforms.map((pl) => {
            const sum = platformPackages(row, pl.name);
            const rate = row.ratesByPlatform[pl.name] ?? pl.default_rate;
            return (
              <div key={pl.id} className="bg-gray-50 rounded p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span
                    className={`text-[11px] block truncate ${pl.color ? 'font-bold' : 'text-gray-500'}`}
                    style={pl.color ? { color: pl.color } : undefined}
                  >
                    {pl.name}
                  </span>
                  <span className="text-[10px] text-gray-400">{formatBRL(rate)}/pc</span>
                </div>
                {multi ? (
                  <span className="text-sm font-bold text-gray-700 tabular-nums">{formatInt(sum)}</span>
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={readOnly || !canEdit}
                    value={row.routes[0]?.packages[pl.name] ?? 0}
                    onChange={(e) =>
                      handlers.onPackageChange(row.paymentId, 0, pl.name, Number(e.target.value.replace(/\D/g, '') || 0))
                    }
                    onBlur={() => handlers.onPackageBlur(row.paymentId, 0, pl.name)}
                    style={pl.color ? { borderColor: pl.color } : undefined}
                    className={`w-16 text-right rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums disabled:bg-gray-100 disabled:text-gray-500 ${
                      pl.color ? 'border-2' : 'border border-gray-300'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {multi && (
          <p className="text-[11px] text-gray-400 mb-2">
            Multi-rota: edite os pacotes por rota no computador (visão de tabela).
          </p>
        )}

        {/* Nota fiscal — check grande e obvio */}
        <button
          type="button"
          onClick={() => handlers.onToggleNota(row.paymentId, row.notaFiscal)}
          disabled={readOnly || !canEdit}
          aria-pressed={row.notaFiscal}
          className={`w-full mb-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium min-h-[40px] border ${
            row.notaFiscal
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-gray-50 border-gray-200 text-gray-500'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {row.notaFiscal ? (
            <CheckCircle2 className="w-5 h-5 fill-green-100" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
          {row.notaFiscal ? 'Nota fiscal recebida' : 'Marcar nota fiscal'}
        </button>

        {/* Espelho conferido — deixa o card inteiro verde */}
        <button
          type="button"
          onClick={() => handlers.onToggleEspelho(row.paymentId, row.espelhoConferido)}
          disabled={readOnly || !canEdit}
          aria-pressed={row.espelhoConferido}
          className={`w-full mb-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium min-h-[40px] border ${
            row.espelhoConferido
              ? 'bg-green-600 border-green-700 text-white'
              : 'bg-gray-50 border-gray-200 text-gray-500'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {row.espelhoConferido ? <ClipboardCheck className="w-5 h-5" /> : <Clipboard className="w-5 h-5" />}
          {row.espelhoConferido ? 'Espelho conferido' : 'Marcar espelho conferido'}
        </button>

        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-500">
            Desc. {t.discounts > 0 ? <span className="text-red-600">− {formatBRL(t.discounts)}</span> : '—'} · Vale{' '}
            {t.vales > 0 ? <span className="text-amber-600">− {formatBRL(t.vales)}</span> : '—'}
            {row.zapex.length > 0 && (
              <>
                {' '}· Zapex{' '}
                <span className="text-green-600">
                  + {formatBRL(t.zapex)} <span className="text-gray-400">({row.zapex.length})</span>
                </span>
              </>
            )}
          </span>
          <span className={`font-bold ${t.net < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatBRL(t.net)}</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {canConfig && (
            <button
              type="button"
              onClick={() => handlers.onConfigDriver(row)}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-blue-50 text-blue-700 rounded-md text-xs font-medium min-h-[40px]"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          {canDiscount && (
            <button
              type="button"
              onClick={() => handlers.onDiscount(row)}
              disabled={readOnly}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-red-50 text-red-700 rounded-md text-xs font-medium min-h-[40px] disabled:opacity-40"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          {canVale && (
            <button
              type="button"
              onClick={() => handlers.onVale(row)}
              disabled={readOnly}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-amber-50 text-amber-700 rounded-md text-xs font-medium min-h-[40px] disabled:opacity-40"
            >
              <Wallet className="w-4 h-4" />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => handlers.onZapex(row)}
              disabled={readOnly}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium min-h-[40px] disabled:opacity-40"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}
          {canMirror && (
            <button
              type="button"
              onClick={() => handlers.onMirror(row)}
              className="inline-flex items-center justify-center gap-1 px-2 py-2 bg-gray-100 text-gray-700 rounded-md text-xs font-medium min-h-[40px]"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Agrupamento (visao "Grupos") ──────────────────────────────────────────
  const groupsOrdered = (): Array<{ name: string; rows: DriverRowData[] }> => {
    const map = new Map<string, DriverRowData[]>();
    for (const row of rows) {
      const key = row.groupName ?? NO_GROUP;
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    const names = Array.from(map.keys()).sort((a, b) => {
      if (a === NO_GROUP) return 1;
      if (b === NO_GROUP) return -1;
      return a.localeCompare(b, 'pt-BR');
    });
    return names.map((name) => ({ name, rows: map.get(name) ?? [] }));
  };

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        Nenhum driver neste período com os filtros atuais.
      </div>
    );
  }

  if (view === 'groups') {
    return (
      <div className="p-2 sm:p-3 space-y-3">
        {groupsOrdered().map(({ name, rows: groupRows }) => {
          const t = sumTotals(groupRows);
          const packages = groupRows.reduce((s, r) => s + computeRowTotals(r).totalPackages, 0);
          return (
            <details key={name} open={name !== NO_GROUP} className="border border-gray-200 rounded-lg overflow-hidden">
              <summary className="list-none cursor-pointer px-4 py-3 bg-gray-50 flex items-center gap-3">
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <span className="font-semibold text-gray-900 flex items-center gap-2">
                  {name === NO_GROUP ? <Users className="w-4 h-4 text-gray-400" /> : <Tag className="w-4 h-4 text-blue-600" />}
                  {name}
                </span>
                <span className="text-xs text-gray-500">
                  · {t.drivers} drivers · {formatInt(packages)} pacotes
                  {t.zapex > 0 && (
                    <> · <span className="font-medium text-green-600">Zapex {formatBRL(t.zapex)}</span></>
                  )}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  {canMirror && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onGroupMirror(name, groupRows);
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 inline-flex items-center gap-1"
                    >
                      <FileText className="w-4 h-4" /> Espelho do grupo
                    </button>
                  )}
                  <span className={`font-bold ${t.net < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatBRL(t.net)}</span>
                </span>
              </summary>
              <div className="hidden md:block">{renderTable(groupRows, true, 'SUBTOTAL DO GRUPO')}</div>
              <div className="md:hidden divide-y divide-gray-200">{groupRows.map(renderMobileCard)}</div>
            </details>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">{renderTable(rows, true)}</div>
      <div className="md:hidden divide-y divide-gray-200">
        {rows.map(renderMobileCard)}
        <div className="p-4 bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">{rows.length} driver(s)</span>
          <span className="text-sm font-bold text-green-600">{formatBRL(sumTotals(rows).net)}</span>
        </div>
      </div>
    </>
  );
};
