import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Ban, Trash2, Loader2, Search, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listDriverAliasesAndIgnored, deleteDriverAlias, updateDriverAliasTarget, deleteDriverIgnored,
  type DriverAliasRecord, type DriverIgnoredRecord,
} from '../../services/driverPay';
import type { DriverCandidate } from '../../utils/driverNameMatch';
import { contemSemAcento } from '../../utils/buscaTexto';
import { ModalShell } from './ModalShell';

interface DriverImportLinksModalProps {
  companyId: string;
  userId: string;
  drivers: DriverCandidate[];
  onClose: () => void;
}

/**
 * "O que a importação de planilha já aprendeu" (18/08/2026, pedido do Victor:
 * "guarda os rejeitados também... poder editar os vinculados também").
 *
 * Vínculo (nome da planilha -> driver) já ficava salvo antes; ignorado agora
 * também fica. Aqui dá pra ver os dois, trocar um vínculo errado pra outro
 * driver, ou desfazer qualquer um dos dois — a linha some daqui e volta a
 * pedir decisão no próximo import.
 */
export const DriverImportLinksModal: React.FC<DriverImportLinksModalProps> = ({
  companyId, userId, drivers, onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [aliases, setAliases] = useState<DriverAliasRecord[]>([]);
  const [ignored, setIgnored] = useState<DriverIgnoredRecord[]>([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listDriverAliasesAndIgnored(companyId);
      setAliases(r.aliases);
      setIgnored(r.ignored);
    } catch (e) {
      console.error('Erro ao carregar vínculos de importação:', e);
      toast.error('Erro ao carregar vínculos de importação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const q = query.trim();
  const filteredAliases = useMemo(
    () => (q ? aliases.filter((a) => contemSemAcento(a.aliasRaw, q) || contemSemAcento(a.driverName, q)) : aliases),
    [aliases, q],
  );
  const filteredIgnored = useMemo(
    () => (q ? ignored.filter((i) => contemSemAcento(i.aliasRaw, q)) : ignored),
    [ignored, q],
  );

  const handleUnlink = async (a: DriverAliasRecord) => {
    setBusyId(a.id);
    try {
      await deleteDriverAlias(a.id, userId);
      toast.success(`Vínculo de "${a.aliasRaw}" desfeito — volta a pedir decisão no próximo import.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desfazer vínculo');
    } finally {
      setBusyId(null);
    }
  };

  const handleRetarget = async (a: DriverAliasRecord, newDriverId: string) => {
    setBusyId(a.id);
    try {
      await updateDriverAliasTarget(a.id, newDriverId, userId);
      toast.success(`"${a.aliasRaw}" agora vincula com outro driver.`);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao editar vínculo');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnignore = async (i: DriverIgnoredRecord) => {
    setBusyId(i.id);
    try {
      await deleteDriverIgnored(i.id, userId);
      toast.success(`"${i.aliasRaw}" volta a aparecer como pendente no próximo import.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desfazer "ignorar"');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModalShell
      icon={<Link2 className="w-5 h-5" />}
      title="Vínculos de importação"
      subtitle="O que já foi aprendido nas planilhas — vinculado ou ignorado"
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome da planilha ou do driver…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
          />
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                Vinculados ({filteredAliases.length})
              </p>
              {filteredAliases.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Nenhum vínculo aprendido ainda.</p>
              ) : (
                <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {filteredAliases.map((a) => (
                    <div key={a.id} data-testid="alias-row" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{a.aliasRaw}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Link2 className="w-3 h-3 flex-shrink-0" /> {a.driverName}
                          {a.source ? ` · ${a.source}` : ''}
                        </p>
                      </div>
                      {editingId === a.id ? (
                        <select
                          autoFocus
                          defaultValue=""
                          disabled={busyId === a.id}
                          onChange={(e) => e.target.value && handleRetarget(a, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1.5 min-h-[32px]"
                        >
                          <option value="">Vincular com…</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingId(a.id)}
                            title="Vincular com outro driver"
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnlink(a)}
                            disabled={busyId === a.id}
                            title="Desfazer vínculo"
                            data-testid="alias-remover"
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40"
                          >
                            {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                Ignorados ({filteredIgnored.length})
              </p>
              {filteredIgnored.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Nenhum nome ignorado ainda.</p>
              ) : (
                <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {filteredIgnored.map((i) => (
                    <div key={i.id} data-testid="ignored-row" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{i.aliasRaw}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Ban className="w-3 h-3 flex-shrink-0" /> Ignorado{i.source ? ` · ${i.source}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnignore(i)}
                        disabled={busyId === i.id}
                        title="Desfazer — volta a pedir decisão"
                        data-testid="ignored-remover"
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40 flex-shrink-0"
                      >
                        {busyId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
};
