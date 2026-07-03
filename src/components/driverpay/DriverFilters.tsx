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
  view: 'list' | 'groups';
  onView: (view: 'list' | 'groups') => void;
}

export const DriverFilters: React.FC<DriverFiltersProps> = ({
  search,
  onSearch,
  routeFilter,
  onRoute,
  routeOptions,
  groupFilter,
  onGroup,
  groupOptions,
  view,
  onView,
}) => {
  return (
    <div className="p-3 sm:p-4 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Pesquisar por nome</label>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Digite o nome do driver…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Rota</label>
        <select
          value={routeFilter}
          onChange={(e) => onRoute(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
        >
          <option value="">Todas as rotas</option>
          {routeOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Grupo</label>
        <select
          value={groupFilter}
          onChange={(e) => onGroup(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
        >
          <option value="">Todos os grupos</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value={GROUP_NONE}>Sem grupo</option>
        </select>
      </div>

      <div className="flex gap-2 items-end">
        <button
          type="button"
          onClick={() => onView('list')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium inline-flex items-center justify-center gap-1.5 min-h-[40px] ${
            view === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <List className="w-4 h-4" /> Lista
        </button>
        <button
          type="button"
          onClick={() => onView('groups')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium inline-flex items-center justify-center gap-1.5 min-h-[40px] ${
            view === 'groups' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Grid3x3 className="w-4 h-4" /> Grupos
        </button>
      </div>
    </div>
  );
};
