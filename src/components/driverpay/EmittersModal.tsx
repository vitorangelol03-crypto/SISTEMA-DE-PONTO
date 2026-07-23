/**
 * Cadastro de EMITENTES (CNPJs) da nota fiscal + vínculo plataforma→CNPJ (Fase 3).
 * Cada plataforma (Shopee, iMile, ...) aponta pro CNPJ que a fatura. No app do driver,
 * cada CNPJ vira um "lugar de anexo" — o driver manda a nota certa em cada um.
 */
import React, { useEffect, useState } from 'react';
import { Building2, Plus, Save, X, Pencil, Archive, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  type DriverPlatform,
  type DriverNotaEmitter,
  getNotaEmitters,
  createNotaEmitter,
  updateNotaEmitter,
  setPlatformNotaEmitter,
} from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface EmittersModalProps {
  companyId: string;
  userId: string;
  platforms: DriverPlatform[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export const EmittersModal: React.FC<EmittersModalProps> = ({ companyId, userId, platforms, onClose, onSaved }) => {
  const [emitters, setEmitters] = useState<DriverNotaEmitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCnpj, setEditCnpj] = useState('');

  // Vínculo local plataforma->emitente (parte do prop; atualiza otimista ao salvar).
  const [links, setLinks] = useState<Record<string, string | null>>({});

  const loadEmitters = async () => {
    setLoading(true);
    try {
      setEmitters(await getNotaEmitters(companyId, false)); // inclui inativos (pra reativar)
    } catch {
      toast.error('Não consegui carregar os CNPJs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmitters();
    setLinks(Object.fromEntries(platforms.map((p) => [p.id, p.nota_emitter_id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const activeEmitters = emitters.filter((e) => e.active);

  const handleAdd = async () => {
    if (!newLabel.trim() || !newCnpj.trim()) {
      toast.error('Preencha o nome e o CNPJ.');
      return;
    }
    setBusy(true);
    try {
      await createNotaEmitter(companyId, userId, { label: newLabel, cnpj: newCnpj, sort_order: emitters.length });
      setNewLabel(''); setNewCnpj('');
      await loadEmitters();
      await onSaved();
      toast.success('CNPJ cadastrado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui cadastrar.');
    } finally { setBusy(false); }
  };

  const startEdit = (e: DriverNotaEmitter) => { setEditId(e.id); setEditLabel(e.label); setEditCnpj(e.cnpj); };
  const cancelEdit = () => { setEditId(null); setEditLabel(''); setEditCnpj(''); };

  const handleSaveEdit = async (id: string) => {
    if (!editLabel.trim() || !editCnpj.trim()) { toast.error('Preencha o nome e o CNPJ.'); return; }
    setBusy(true);
    try {
      await updateNotaEmitter(id, userId, { label: editLabel, cnpj: editCnpj });
      cancelEdit();
      await loadEmitters();
      await onSaved();
      toast.success('CNPJ atualizado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally { setBusy(false); }
  };

  const toggleActive = async (e: DriverNotaEmitter) => {
    setBusy(true);
    try {
      await updateNotaEmitter(e.id, userId, { active: !e.active });
      await loadEmitters();
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui alterar.');
    } finally { setBusy(false); }
  };

  const handleLink = async (platformId: string, emitterId: string | null) => {
    setLinks((prev) => ({ ...prev, [platformId]: emitterId })); // otimista
    try {
      await setPlatformNotaEmitter(platformId, userId, emitterId);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui vincular.');
      setLinks((prev) => ({ ...prev, [platformId]: platforms.find((p) => p.id === platformId)?.nota_emitter_id ?? null }));
    }
  };

  const inputCls = 'px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm';

  return (
    <ModalShell
      icon={<Building2 className="w-5 h-5" />}
      title="CNPJs das notas"
      subtitle="Cadastre os CNPJs para os quais os entregadores emitem nota e diga qual CNPJ fatura cada plataforma."
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]">
          Fechar
        </button>
      }
    >
      <div className="space-y-6">
        {/* ── CNPJs ─────────────────────────────────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">CNPJs cadastrados</h3>
          <div className="space-y-2">
            {loading && <p className="text-sm text-gray-400">Carregando…</p>}
            {!loading && emitters.length === 0 && (
              <p className="text-sm text-gray-400">Nenhum CNPJ ainda. Cadastre abaixo (ex.: “iMile” e “Shopee/Anjun/Loggi”).</p>
            )}
            {emitters.map((e) => (
              <div key={e.id} className={`flex items-center gap-2 rounded-lg border p-2 ${e.active ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                {editId === e.id ? (
                  <>
                    <input value={editLabel} onChange={(ev) => setEditLabel(ev.target.value)} placeholder="Nome" className={`${inputCls} w-32`} />
                    <input value={editCnpj} onChange={(ev) => setEditCnpj(ev.target.value)} placeholder="CNPJ" className={`${inputCls} flex-1`} />
                    <button type="button" onClick={() => handleSaveEdit(e.id)} disabled={busy} title="Salvar" className="p-2 text-green-600 hover:bg-green-50 rounded-lg"><Save className="w-4 h-4" /></button>
                    <button type="button" onClick={cancelEdit} title="Cancelar" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm truncate">{e.label}</div>
                      <div className="text-xs text-gray-500">{e.cnpj}</div>
                    </div>
                    <button type="button" onClick={() => startEdit(e)} disabled={busy} title="Editar" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => toggleActive(e)} disabled={busy} title={e.active ? 'Arquivar' : 'Reativar'} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                      {e.active ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nome (ex.: iMile)" className={`${inputCls} w-32`} />
            <input value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)} placeholder="CNPJ" className={`${inputCls} flex-1`} />
            <button type="button" onClick={handleAdd} disabled={busy} className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </section>

        {/* ── Vínculo plataforma → CNPJ ─────────────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Qual CNPJ fatura cada plataforma</h3>
          <div className="space-y-2">
            {platforms.filter((p) => p.active).map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                <select
                  value={links[p.id] ?? ''}
                  onChange={(e) => handleLink(p.id, e.target.value || null)}
                  className={`${inputCls} w-56`}
                >
                  <option value="">— sem CNPJ —</option>
                  {activeEmitters.map((em) => (
                    <option key={em.id} value={em.id}>{em.label} ({em.cnpj})</option>
                  ))}
                </select>
              </div>
            ))}
            {platforms.filter((p) => p.active).length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma plataforma ativa.</p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">Plataforma sem CNPJ não gera lugar de anexo no app do driver.</p>
        </section>
      </div>
    </ModalShell>
  );
};
