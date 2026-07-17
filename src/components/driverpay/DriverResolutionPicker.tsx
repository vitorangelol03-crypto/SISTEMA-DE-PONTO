import React, { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { DriverCandidate } from '../../utils/driverNameMatch';
import type { ImportResolution } from '../../utils/driverImportApply';

interface DriverResolutionPickerProps {
  drivers: DriverCandidate[];
  resolution: ImportResolution;
  /** Nome sugerido ao criar novo (do nome que veio na planilha, limpo). */
  suggestedName: string;
  onChange: (res: ImportResolution) => void;
}

/**
 * Seletor pesquisável da resolução de um entregador não reconhecido:
 * "Criar novo", "Ignorar" ou vincular a um driver existente — este último com
 * BUSCA (digita o nome e a lista filtra). Substitui o <select> nativo que ficava
 * gigante com 57+ drivers.
 */
export const DriverResolutionPicker: React.FC<DriverResolutionPickerProps> = ({
  drivers,
  resolution,
  suggestedName,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? drivers.filter((d) => d.name.toLowerCase().includes(q)) : drivers;
    return base.slice(0, 40);
  }, [drivers, query]);

  const label =
    resolution.kind === 'create'
      ? `➕ Criar: ${resolution.name || suggestedName}`
      : resolution.kind === 'ignore'
        ? '🚫 Ignorar'
        : `🔗 ${resolution.driverName}`;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="w-full inline-flex items-center justify-between gap-2 px-2 py-1.5 border border-gray-300 rounded-md text-sm min-h-[36px] bg-white hover:bg-gray-50"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <>
          {/* overlay para fechar ao clicar fora */}
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute z-20 mt-1 w-72 max-w-[80vw] max-h-72 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="sticky top-0 bg-white p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar driver pelo nome…"
                  className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onChange({ kind: 'create', name: suggestedName });
                close();
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
            >
              ➕ Criar como novo driver
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ kind: 'ignore' });
                close();
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
            >
              🚫 Ignorar
            </button>
            <div className="border-t border-gray-100 px-3 py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
              Vincular a um driver existente
            </div>
            {filtered.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onChange({ kind: 'existing', driverId: d.id, driverName: d.name, learnAlias: true });
                  close();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 truncate"
              >
                {d.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-400">Nenhum driver com esse nome.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
