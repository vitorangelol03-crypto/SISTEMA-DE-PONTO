import React from 'react';
import { Search, List, Grid3x3 } from 'lucide-react';
import { MultiSelectFilter } from './MultiSelectFilter';

export const GROUP_NONE = '__none__';

interface DriverFiltersProps {
  search: string;
  onSearch: (value: string) => void;
  /**
   * Filtros de MARCAR VÁRIOS (05/08/2026). Rota e plataforma são "tem que ter TODAS as
   * marcadas" (decisão do Victor); grupo é "qualquer um dos marcados", porque um entregador
   * está em um grupo só e exigir dois daria lista vazia sempre.
   */
  routeFilter: string[];
  onRoute: (value: string) => void;
  onClearRoute: () => void;
  routeOptions: string[];
  groupFilter: string[];
  onGroup: (value: string) => void;
  onClearGroup: () => void;
  groupOptions: string[];
  /** Filtro por status da NF: '' todas | 'pending' falta nota | 'ok' validada/completa. */
  nfFilter: string;
  onNf: (value: string) => void;
  /** Filtro por espelho no app: '' todos | 'published' publicado | 'unpublished' não. */
  espelhoFilter: string;
  onEspelho: (value: string) => void;
  /** Filtro por plataforma: passa quem tem pacote em TODAS as marcadas. */
  platFilter: string[];
  onPlat: (value: string) => void;
  onClearPlat: () => void;
  platformOptions: string[];
  /** Filtro por espelho CONFERIDO (o print da Shopee): '' todos | 'ok' | 'pending'. */
  conferidoFilter: string;
  onConferido: (value: string) => void;
  view: 'list' | 'groups';
  onView: (view: 'list' | 'groups') => void;
}

const LABEL = 'text-sm font-medium text-gray-700';
const FIELD =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]';

export const DriverFilters: React.FC<DriverFiltersProps> = ({
  search,
  onSearch,
  routeFilter,
  onRoute,
  onClearRoute,
  routeOptions,
  groupFilter,
  onGroup,
  onClearGroup,
  groupOptions,
  nfFilter,
  onNf,
  espelhoFilter,
  onEspelho,
  platFilter,
  onPlat,
  onClearPlat,
  platformOptions,
  conferidoFilter,
  onConferido,
  view,
  onView,
}) => {
  return (
    <div className="p-3 sm:p-4 border-b border-gray-200 space-y-3">
      {/* 7 filtros num grid simétrico (3 col no desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Pesquisar (nome, rota ou grupo)</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Nome do driver, rota ou grupo…"
              className={`${FIELD} pl-9`}
            />
          </div>
        </div>

        <MultiSelectFilter
          label="Rota"
          regra="quem roda TODAS as marcadas"
          vazio="Todas as rotas"
          options={routeOptions}
          selected={routeFilter}
          onToggle={onRoute}
          onClear={onClearRoute}
        />

        <MultiSelectFilter
          label="Grupo"
          regra="qualquer um dos marcados"
          vazio="Todos os grupos"
          options={[...groupOptions, GROUP_NONE]}
          selected={groupFilter}
          onToggle={onGroup}
          onClear={onClearGroup}
        />

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Nota fiscal</label>
          <select value={nfFilter} onChange={(e) => onNf(e.target.value)} className={FIELD}>
            <option value="">Todas as notas</option>
            <option value="pending">Falta nota (pendente)</option>
            <option value="ok">NF ok (validada)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Espelho no app</label>
          <select value={espelhoFilter} onChange={(e) => onEspelho(e.target.value)} className={FIELD}>
            <option value="">Todos</option>
            <option value="published">Publicado</option>
            <option value="unpublished">Não publicado</option>
          </select>
        </div>

        <MultiSelectFilter
          label="Plataforma"
          regra="quem tem TODAS as marcadas"
          vazio="Todas as plataformas"
          options={platformOptions}
          selected={platFilter}
          onToggle={onPlat}
          onClear={onClearPlat}
        />

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Espelho conferido (print)</label>
          <select value={conferidoFilter} onChange={(e) => onConferido(e.target.value)} className={FIELD}>
            <option value="">Todos</option>
            <option value="ok">Conferido</option>
            <option value="pending">Falta conferir</option>
          </select>
        </div>
      </div>

      {/* Alternância de visão — alinhada à direita, largura própria */}
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => onView('list')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-1.5 min-h-[36px] transition-colors ${
              view === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <List className="w-4 h-4" /> Lista
          </button>
          <button
            type="button"
            onClick={() => onView('groups')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-1.5 min-h-[36px] transition-colors ${
              view === 'groups' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Grid3x3 className="w-4 h-4" /> Grupos
          </button>
        </div>
      </div>
    </div>
  );
};
