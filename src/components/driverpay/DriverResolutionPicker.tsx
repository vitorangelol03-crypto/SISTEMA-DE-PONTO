import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, UserPlus, Ban, Link2 } from 'lucide-react';
import type { DriverCandidate } from '../../utils/driverNameMatch';
import type { ImportResolution } from '../../utils/driverImportApply';

interface DriverResolutionPickerProps {
  drivers: DriverCandidate[];
  resolution: ImportResolution;
  /** Nome sugerido ao criar novo (do nome que veio na planilha, limpo). */
  suggestedName: string;
  onChange: (res: ImportResolution) => void;
}

/** Posição/direção do painel, calculada a partir do botão no momento de abrir. */
interface MenuPos {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/**
 * Seletor pesquisável da resolução de um entregador não reconhecido:
 * "Criar novo", "Ignorar" ou vincular a um driver existente — este último com
 * BUSCA (digita o nome e a lista filtra).
 *
 * O painel é renderizado em um PORTAL (position: fixed no body) para NÃO ser
 * cortado pelos containers com overflow (a lista "Precisa conferir" e o corpo do
 * modal). Fica largo, alto e com itens grandes — fácil de tocar.
 */
export const DriverResolutionPicker: React.FC<DriverResolutionPickerProps> = ({
  drivers,
  resolution,
  suggestedName,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? drivers.filter((d) => d.name.toLowerCase().includes(q)) : drivers;
    return base.slice(0, 60);
  }, [drivers, query]);

  const label =
    resolution.kind === 'create'
      ? `➕ Criar: ${resolution.name || suggestedName}`
      : resolution.kind === 'ignore'
        ? '🚫 Ignorar'
        : `🔗 ${resolution.driverName}`;

  const openMenu = () => {
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
      const width = Math.max(r.width, 360);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const maxHeight = Math.min(440, (openUp ? spaceAbove : spaceBelow) - 12);
      setPos(
        openUp
          ? { left, width, maxHeight, bottom: window.innerHeight - r.top + 4 }
          : { left, width, maxHeight, top: r.bottom + 4 },
      );
    }
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="flex-1 min-w-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px] bg-white hover:bg-gray-50"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            {/* overlay para fechar ao clicar fora (acima do modal, z-50) */}
            <div className="fixed inset-0 z-[60]" onClick={close} />
            <div
              className="fixed z-[70] flex flex-col overflow-hidden bg-white border border-gray-200 rounded-lg shadow-2xl"
              style={{ left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
            >
              <div className="bg-white p-2.5 border-b border-gray-100">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar driver pelo nome…"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    onChange({ kind: 'create', name: suggestedName });
                    close();
                  }}
                  className="w-full text-left px-3.5 py-3 text-sm flex items-center gap-2.5 hover:bg-blue-50 border-b border-gray-50"
                >
                  <UserPlus className="w-4 h-4 text-blue-600 flex-shrink-0" /> Criar como novo driver
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ kind: 'ignore' });
                    close();
                  }}
                  className="w-full text-left px-3.5 py-3 text-sm flex items-center gap-2.5 hover:bg-blue-50 border-b border-gray-100"
                >
                  <Ban className="w-4 h-4 text-gray-500 flex-shrink-0" /> Ignorar
                </button>

                <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  <Link2 className="w-3 h-3" /> Vincular a um driver existente
                </div>
                {filtered.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      onChange({ kind: 'existing', driverId: d.id, driverName: d.name, learnAlias: true });
                      close();
                    }}
                    className="w-full text-left px-3.5 py-3 text-sm hover:bg-blue-50 truncate"
                  >
                    {d.name}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3.5 py-4 text-sm text-gray-400">Nenhum driver com esse nome.</div>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
};
