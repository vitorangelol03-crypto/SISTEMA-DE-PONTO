import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, X, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompany } from '../../contexts/CompanyContext';
import {
  getBonusTypes,
  createBonusType,
  updateBonusType,
  deactivateBonusType,
  BonusTypeRecord,
} from '../../services/database';

const CODE_REGEX = /^[A-Z0-9]{1,6}$/;

interface FormState {
  name: string;
  code: string;
  default_value: string;
  order_index: string;
  active: boolean;
}

const emptyForm = (nextOrder: number): FormState => ({
  name: '',
  code: '',
  default_value: '0',
  order_index: String(nextOrder),
  active: true,
});

export const BonusTypesManager: React.FC = () => {
  const { company } = useCompany();
  const [items, setItems] = useState<BonusTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BonusTypeRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(1));
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const data = await getBonusTypes(company.id, false);
      setItems(data);
    } catch (err) {
      console.error('Erro ao carregar tipos de bônus:', err);
      toast.error('Erro ao carregar tipos de bonificação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  useEffect(() => {
    if (showModal) {
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [showModal]);

  const openNew = () => {
    const nextOrder = items.length === 0 ? 1 : Math.max(...items.map(i => i.order_index)) + 1;
    setEditing(null);
    setForm(emptyForm(nextOrder));
    setShowModal(true);
  };

  const openEdit = (rec: BonusTypeRecord) => {
    setEditing(rec);
    setForm({
      name: rec.name,
      code: rec.code,
      default_value: String(rec.default_value),
      order_index: String(rec.order_index),
      active: rec.active,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditing(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!company?.id) return;

    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const defaultValue = Number(form.default_value);
    const orderIndex = Number(form.order_index);

    if (!name) return toast.error('Nome é obrigatório');
    if (!CODE_REGEX.test(code)) return toast.error('Código deve ter 1 a 6 caracteres (A-Z e 0-9)');
    if (!Number.isFinite(defaultValue) || defaultValue < 0) return toast.error('Valor padrão inválido');
    if (!Number.isInteger(orderIndex) || orderIndex < 0) return toast.error('Ordem inválida');

    setSaving(true);
    try {
      if (editing) {
        await updateBonusType(editing.id, {
          name,
          code,
          default_value: defaultValue,
          order_index: orderIndex,
          active: form.active,
        });
        toast.success('Tipo atualizado');
      } else {
        await createBonusType(company.id, {
          name,
          code,
          default_value: defaultValue,
          order_index: orderIndex,
          active: true,
        });
        toast.success('Tipo criado');
      }
      setShowModal(false);
      setEditing(null);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique|23505/i.test(msg)) {
        toast.error(`Código "${code}" já existe nesta empresa`);
      } else {
        toast.error(`Erro ao salvar: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rec: BonusTypeRecord) => {
    if (!confirm(
      rec.active
        ? `Desativar "${rec.name}"?\n\nO tipo deixará de aparecer para aplicar bônus, mas o histórico fica preservado.`
        : `Reativar "${rec.name}"?`,
    )) return;

    setActingId(rec.id);
    try {
      if (rec.active) {
        await deactivateBonusType(rec.id);
        toast.success('Tipo desativado');
      } else {
        await updateBonusType(rec.id, { active: true });
        toast.success('Tipo reativado');
      }
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro: ${msg}`);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-base font-semibold text-gray-800">
          Tipos de Bonificação
          {company?.display_name && <span className="text-gray-500 font-normal"> — {company.display_name}</span>}
        </h3>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors min-h-[40px]"
        >
          <Plus className="w-4 h-4" />
          Novo Tipo
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-4">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum tipo cadastrado</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase font-medium">Código</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase font-medium">Nome</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase font-medium">Valor padrão</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase font-medium">Ordem</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-500 uppercase font-medium">Status</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 uppercase font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(it => (
                  <tr key={it.id} className={it.active ? '' : 'bg-gray-50 opacity-60'}>
                    <td className="px-3 py-2 font-mono font-semibold text-gray-800">{it.code}</td>
                    <td className="px-3 py-2 text-gray-700">{it.name}</td>
                    <td className="px-3 py-2 text-right text-gray-700">R$ {it.default_value.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{it.order_index}</td>
                    <td className="px-3 py-2 text-center">
                      {it.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Ativo</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">Inativo</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(it)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-blue-700 hover:bg-blue-50 rounded text-xs font-medium"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleActive(it)}
                        disabled={actingId === it.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 ml-1 rounded text-xs font-medium disabled:opacity-50 ${
                          it.active ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {it.active ? <ToggleLeft className="w-3.5 h-3.5" /> : <ToggleRight className="w-3.5 h-3.5" />}
                        {it.active ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {items.map(it => (
              <div key={it.id} className={`border rounded-lg p-3 ${it.active ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-gray-800">{it.code}</div>
                    <div className="text-sm text-gray-700 truncate">{it.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Padrão R$ {it.default_value.toFixed(2)} · Ordem {it.order_index}
                    </div>
                  </div>
                  {it.active ? (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">Ativo</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600 whitespace-nowrap">Inativo</span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openEdit(it)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded text-sm font-medium min-h-[40px]"
                  >
                    <Edit2 className="w-4 h-4" /> Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(it)}
                    disabled={actingId === it.id}
                    className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded text-sm font-medium min-h-[40px] disabled:opacity-50 ${
                      it.active ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-green-700 bg-green-50 hover:bg-green-100'
                    }`}
                  >
                    {it.active ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <form onSubmit={handleSubmit}>
              <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-800">
                  {editing ? 'Editar Tipo' : 'Novo Tipo de Bonificação'}
                </h4>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nome <span className="text-red-600">*</span></label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex.: Bônus B"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:outline-none min-h-[40px]"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Código <span className="text-red-600">*</span>
                    <span className="text-gray-400 font-normal ml-1">(A-Z e 0-9, máximo 6)</span>
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={e => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="Ex.: B"
                    maxLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:border-blue-500 focus:outline-none min-h-[40px] uppercase"
                    disabled={saving}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Valor padrão (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_value}
                      onChange={e => setForm(prev => ({ ...prev, default_value: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:outline-none min-h-[40px]"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Ordem</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.order_index}
                      onChange={e => setForm(prev => ({ ...prev, order_index: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:outline-none min-h-[40px]"
                      disabled={saving}
                    />
                  </div>
                </div>

                {editing && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
                      className="w-4 h-4 rounded"
                      disabled={saving}
                    />
                    Ativo
                  </label>
                )}
              </div>

              <div className="p-4 sm:p-5 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="w-full sm:w-auto px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium disabled:opacity-50 min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50 min-h-[40px]"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar tipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
