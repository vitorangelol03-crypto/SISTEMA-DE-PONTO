import React from 'react';
import { Search, List, Grid3x3 } from 'lucide-react';

export const GROUP_NONE = '__none__';

interface DriverFiltersProps {
  search: string;
  onSearch: (value: string) => void;
  routeFilter: string;
  onRoute: (value: string) => void;
  routeOptions: string[];
  groupFilter: string;
  onGroup: (value: string) => void;
  groupOptions: string[];
  /** Filtro por status da NF: '' todas | 'pending' falta nota | 'ok' validada/completa. */
  nfFilter: string;
  onNf: (value: string) => void;
  /** Filtro por espelho no app: '' todos | 'published' publicado | 'unpublished' não. */
  espelhoFilter: string;
  onEspelho: (value: string) => void;
  /** Filtro por plataforma (só quem tem pacote nela): '' todas | nome da plataforma. */
  platFilter: string;
  onPlat: (value: string) => void;
  platformOptions: string[];
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
  routeOptions,
  groupFilter,
  onGroup,
  groupOptions,
  nfFilter,
  onNf,
  espelhoFilter,
  onEspelho,
  platFilter,
  onPlat,
  platformOptions,
  view,
  onView,
}) => {
  return (
    <div className="p-3 sm:p-4 border-b border-gray-200 space-y-3">
      {/* 6 filtros num grid simétrico (3 col no desktop = 2 linhas de 3) */}
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

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Rota</label>
          <select value={routeFilter} onChange={(e) => onRoute(e.target.value)} className={FIELD}>
            <option value="">Todas as rotas</option>
            {routeOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Grupo</label>
          <select value={groupFilter} onChange={(e) => onGroup(e.target.value)} className={FIELD}>
            <option value="">Todos os grupos</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value={GROUP_NONE}>Sem grupo</option>
          </select>
        </div>

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

        <div className="flex flex-col gap-1">
          <label className={LABEL}>Plataforma</label>
          <select value={platFilter} onChange={(e) => onPlat(e.target.value)} className={FIELD}>
            <option value="">Todas as plataformas</option>
            {platformOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
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
