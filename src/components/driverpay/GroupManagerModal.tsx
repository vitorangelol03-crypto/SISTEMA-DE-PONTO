import React, { useEffect, useState } from 'react';
import { Tag, Plus, Trash2, Edit2, Users, Save, X, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Driver,
  DriverGroup,
  DriverPlatform,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  addDriverToGroup,
  removeDriverFromGroup,
  applyGroupRate,
} from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface GroupManagerModalProps {
  companyId: string;
  userId: string;
  groups: DriverGroup[];
  drivers: Driver[];
  platforms: DriverPlatform[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

export const GroupManagerModal: React.FC<GroupManagerModalProps> = ({
  companyId,
  userId,
  groups,
  drivers,
  platforms,
  onClose,
  onChanged,
}) => {
  const [membersByGroup, setMembersByGroup] = useState<Record<string, string[]>>({});
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [busy, setBusy] = useState(false);

  // Carrega os membros de cada grupo (recarrega quando groups muda apos onChanged).
  useEffect(() => {
    let cancelled = false;
    Promise.all(groups.map(async (g) => [g.id, await getGroupMembers(g.id)] as const))
      .then((entries) => {
        if (!cancelled) setMembersByGroup(Object.fromEntries(entries));
      })
      .catch((e) => console.error('Erro ao carregar membros dos grupos:', e));
    return () => {
      cancelled = true;
    };
  }, [groups]);

  // Sincroniza os inputs de taxa sem sobrescrever o que o usuario esta digitando.
  useEffect(() => {
    setRateInputs((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.id] === undefined) next[g.id] = g.default_rate != null ? String(g.default_rate) : '';
      }
      return next;
    });
  }, [groups]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Informe o nome do grupo');
      return;
    }
    setBusy(true);
    try {
      const rateValue = newRate.trim() ? parseRate(newRate) : null;
      await createGroup(companyId, userId, { name: newName.trim(), default_rate: rateValue });
      setNewName('');
      setNewRate('');
      toast.success('Grupo criado');
      await onChanged();
    } catch (e) {
      console.error('Erro ao criar grupo:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao criar grupo');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (group: DriverGroup) => {
    if (!editingName.trim()) {
      toast.error('Nome não pode ficar vazio');
      return;
    }
    setBusy(true);
    try {
      await updateGroup(group.id, userId, { name: editingName.trim() });
      setEditingGroupId(null);
      setEditingName('');
      toast.success('Grupo renomeado');
      await onChanged();
    } catch (e) {
      console.error('Erro ao renomear grupo:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao renomear grupo');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (group: DriverGroup) => {
    if (!window.confirm(`Excluir o grupo "${group.name}"? Os drivers continuam cadastrados.`)) return;
    setBusy(true);
    try {
      await deleteGroup(group.id, userId);
      toast.success('Grupo excluído');
      await onChanged();
    } catch (e) {
      console.error('Erro ao excluir grupo:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir grupo');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyRate = async (group: DriverGroup) => {
    const rateValue = parseRate(rateInputs[group.id] ?? '');
    if (rateValue <= 0) {
      toast.error('Informe um valor por pacote válido');
      return;
    }
    setBusy(true);
    try {
      if (platforms.length === 0) {
        await updateGroup(group.id, userId, { default_rate: rateValue });
      } else {
        for (const pl of platforms) {
          await applyGroupRate(companyId, group.id, pl.id, rateValue, userId);
        }
      }
      toast.success(`Valor por pacote aplicado aos membros de "${group.name}"`);
      await onChanged();
    } catch (e) {
      console.error('Erro ao aplicar valor do grupo:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao aplicar valor do grupo');
    } finally {
      setBusy(false);
    }
  };

  const toggleMember = async (group: DriverGroup, driverId: string, isMember: boolean) => {
    setBusy(true);
    try {
      if (isMember) {
        await removeDriverFromGroup(group.id, driverId, userId);
      } else {
        await addDriverToGroup(companyId, group.id, driverId, userId);
      }
      setMembersByGroup((prev) => {
        const current = prev[group.id] ?? [];
        const next = isMember ? current.filter((id) => id !== driverId) : [...current, driverId];
        return { ...prev, [group.id]: next };
      });
      await onChanged();
    } catch (e) {
      console.error('Erro ao atualizar membros do grupo:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar membros do grupo');
    } finally {
      setBusy(false);
    }
  };

  // Normaliza para busca sem acento e sem caixa (ex.: "Sao" encontra "São").
  const normalizeSearch = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const filteredDrivers = (group: DriverGroup, members: string[]): Driver[] => {
    // Driver ja vinculado a OUTRO grupo nao aparece aqui (evita vinculo duplo);
    // quem ja e membro DESTE grupo continua na lista para poder ser desmarcado.
    const inOtherGroup = new Set<string>();
    for (const [gid, ids] of Object.entries(membersByGroup)) {
      if (gid === group.id) continue;
      for (const id of ids) inOtherGroup.add(id);
    }
    const available = drivers.filter((d) => members.includes(d.id) || !inOtherGroup.has(d.id));
    const q = normalizeSearch(memberSearch.trim());
    if (!q) return available;
    // Busca por nome do driver OU por nome da rota.
    return available.filter(
      (d) => normalizeSearch(d.name).includes(q) || (d.route ? normalizeSearch(d.route).includes(q) : false)
    );
  };

  return (
    <ModalShell
      icon={<Tag className="w-5 h-5" />}
      title="Gerenciar grupos"
      subtitle="Criar/editar grupos, definir o valor por pacote (opcional) e vincular drivers"
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
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum grupo criado ainda.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const members = membersByGroup[group.id] ?? [];
              const isExpanded = expandedGroupId === group.id;
              const isEditing = editingGroupId === group.id;
              const visibleDrivers = isExpanded ? filteredDrivers(group, members) : [];
              return (
                <div key={group.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-3 bg-gray-50 flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(group)}
                          disabled={busy}
                          className="text-green-600 hover:text-green-800 disabled:opacity-40"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGroupId(null);
                            setEditingName('');
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-semibold text-gray-900 flex items-center gap-2 flex-1 min-w-0">
                        <Tag className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span className="break-words">{group.name}</span>
                        <span className="text-xs font-normal text-gray-500">· {members.length} driver(s)</span>
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={rateInputs[group.id] ?? ''}
                          onChange={(e) => setRateInputs((prev) => ({ ...prev, [group.id]: e.target.value }))}
                          placeholder="valor/pacote"
                          className="w-24 pl-7 pr-2 py-1.5 border border-gray-300 rounded-md text-sm tabular-nums"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyRate(group)}
                        disabled={busy}
                        className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        Aplicar
                      </button>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGroupId(group.id);
                            setEditingName(group.name);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Renomear grupo"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedGroupId(isExpanded ? null : group.id);
                          setMemberSearch('');
                        }}
                        className="text-gray-600 hover:text-gray-800"
                        title="Membros"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(group)}
                        disabled={busy}
                        className="text-red-600 hover:text-red-800 disabled:opacity-40"
                        title="Excluir grupo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3 space-y-2">
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Buscar driver ou rota…"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                      <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-md divide-y divide-gray-100">
                        {visibleDrivers.map((d) => {
                          const isMember = members.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isMember}
                                disabled={busy}
                                onChange={() => toggleMember(group, d.id, isMember)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="text-sm text-gray-900 block truncate">{d.name}</span>
                                {d.route && <span className="text-xs text-gray-500 block truncate">{d.route}</span>}
                              </span>
                            </label>
                          );
                        })}
                        {visibleDrivers.length === 0 && (
                          <p className="text-center text-sm text-gray-500 py-4">
                            {memberSearch.trim()
                              ? 'Nenhum driver encontrado.'
                              : drivers.length > 0
                                ? 'Nenhum driver disponível — os demais já estão vinculados a outros grupos.'
                                : 'Nenhum driver cadastrado.'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-md p-3">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <span>
            Ao aplicar o <b>valor/pacote do grupo</b>, ele é gravado em todos os membros e{' '}
            <b>já atualiza os pacotes lançados nas quinzenas abertas</b> (rotas com valor próprio são preservadas).
            Se criar o grupo <b>sem valor</b>, ele serve só para organizar os drivers — cada um continua usando a
            config individual dele por pacote.
          </span>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <label className="text-sm font-medium text-gray-700">Novo grupo</label>
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do grupo (ex.: Equipe Caratinga)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
            />
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="opcional"
                className="w-full sm:w-32 pl-7 pr-2 py-2 border border-gray-300 rounded-md text-sm tabular-nums min-h-[40px]"
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Criar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            O valor por pacote é <b>opcional</b>. Deixe em branco para o grupo só organizar os drivers — cada um usa a
            config individual dele por pacote.
          </p>
        </div>
      </div>
    </ModalShell>
  );
};
