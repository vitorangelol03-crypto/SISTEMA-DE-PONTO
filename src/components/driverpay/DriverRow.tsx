import React from 'react';
import {
  ChevronRight,
  MapPin,
  Plus,
  Link2,
  X,
  Settings,
  Minus,
  Wallet,
  FileText,
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

export const DriverRow: React.FC<DriverRowProps> = ({
  row,
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
  const totalCols = 2 + platforms.length + 4 + 1;
  const inputsDisabled = readOnly || !canEdit;

  return (
    <>
      <tr className="hover:bg-gray-50">
        {/* Driver / Rota */}
        <td className="px-4 py-3 align-middle">
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
          const rate = row.ratesByPlatform[pl.name] ?? pl.default_rate;
          return (
            <td key={pl.id} className="px-3 py-3 text-center align-middle">
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
                    className="w-14 text-right border border-gray-300 rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                )}
                <span className="text-gray-400 text-xs whitespace-nowrap">{formatBRL(rate)}</span>
              </div>
            </td>
          );
        })}

        {/* Total pacotes (R$) */}
        <td className="px-3 py-3 text-right align-middle tabular-nums text-gray-900">
          {formatBRL(totals.packagesAmount)}
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
            {platforms.map((pl) => (
              <td key={pl.id} className="px-3 py-2 text-center align-middle">
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={inputsDisabled}
                  value={rl.packages[pl.name] ?? 0}
                  onChange={(e) =>
                    handlers.onPackageChange(row.paymentId, ri, pl.name, parsePackages(e.target.value))
                  }
                  onBlur={() => handlers.onPackageBlur(row.paymentId, ri, pl.name)}
                  className="w-14 text-right border border-gray-300 rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </td>
            ))}
            <td className="px-3 py-2 text-right text-xs text-gray-400 align-middle">
              {formatInt(Object.values(rl.packages).reduce((s, n) => s + n, 0))} pct
            </td>
            <td colSpan={4} />
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
                onClick={() => handlers.onJoinRoutes(row.paymentId)}
                className="text-blue-600 hover:bg-blue-50 rounded px-1 inline-flex items-center gap-1 text-xs font-medium"
              >
                <Link2 className="w-4 h-4" /> Juntar num número só
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
