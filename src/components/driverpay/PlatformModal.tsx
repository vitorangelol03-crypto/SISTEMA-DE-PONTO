import React, { useState } from 'react';
import { Plus, Pencil, Save, X, Archive, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Driver,
  DriverPlatform,
  createPlatform,
  updatePlatform,
  renamePlatform,
  setPlatformsActive,
  applyPlatformToAllDrivers,
  upsertDriverRate,
} from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface PlatformModalProps {
  companyId: string;
  userId: string;
  drivers: Driver[];
  platforms: DriverPlatform[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

/** Paleta fixa de cores (aparecem bem em negrito no cabecalho). */
const PLATFORM_COLORS: { name: string; hex: string }[] = [
  { name: 'Azul', hex: '#2563eb' },
  { name: 'Verde', hex: '#16a34a' },
  { name: 'Laranja', hex: '#ea580c' },
  { name: 'Vermelho', hex: '#dc2626' },
  { name: 'Roxo', hex: '#9333ea' },
  { name: 'Rosa', hex: '#db2777' },
  { name: 'Âmbar', hex: '#d97706' },
  { name: 'Cinza', hex: '#6b7280' },
];

const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

const formatRate = (n: number): string => n.toFixed(2).replace('.', ',');

const ColorPalette: React.FC<{ value: string | null; onPick: (hex: string) => void }> = ({ value, onPick }) => (
  <div className="flex flex-wrap gap-2">
    {PLATFORM_COLORS.map((c) => (
      <button
        key={c.hex}
        type="button"
        onClick={() => onPick(c.hex)}
        title={c.name}
        className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 ring-offset-1 ${
          value === c.hex ? 'ring-gray-900' : 'ring-transparent'
        }`}
        style={{ backgroundColor: c.hex }}
      >
        {value === c.hex && <Check className="w-4 h-4 text-white" />}
      </button>
    ))}
  </div>
);

export const PlatformModal: React.FC<PlatformModalProps> = ({
  companyId,
  userId,
  drivers,
  platforms,
  onClose,
  onSaved,
}) => {
  // criar
  const [name, setName] = useState('');
  const [rate, setRate] = useState('2,00');
  const [color, setColor] = useState<string>(PLATFORM_COLORS[0].hex);
  const [applyMode, setApplyMode] = useState<'all' | 'one'>('all');
  const [driverId, setDriverId] = useState('');
  const [saving, setSaving] = useState(false);
  // editar (inline)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  // arquivar em massa
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome da plataforma');
      return;
    }
    const rateValue = parseRate(rate);
    if (rateValue <= 0) {
      toast.error('Informe um valor por pacote válido');
      return;
    }
    if (applyMode === 'one' && !driverId) {
      toast.error('Selecione o driver');
      return;
    }
    setSaving(true);
    try {
      const platform = await createPlatform(companyId, userId, { name: name.trim(), default_rate: rateValue, color });
      if (applyMode === 'all') {
        const count = await applyPlatformToAllDrivers(companyId, platform.id, rateValue, userId);
        toast.success(`Plataforma "${platform.name}" adicionada a ${count} driver(s)`);
      } else {
        await upsertDriverRate(companyId, driverId, platform.id, rateValue, userId);
        toast.success(`Plataforma "${platform.name}" adicionada ao driver`);
      }
      setName('');
      setRate('2,00');
      setColor(PLATFORM_COLORS[0].hex);
      await onSaved();
    } catch (e) {
      console.error('Erro ao adicionar plataforma:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar plataforma');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (pl: DriverPlatform) => {
    setEditingId(pl.id);
    setEditName(pl.name);
    setEditRate(formatRate(pl.default_rate));
    setEditColor(pl.color);
  };

  const handleSaveEdit = async (pl: DriverPlatform) => {
    if (!editName.trim()) {
      toast.error('Nome não pode ficar vazio');
      return;
    }
    const rateValue = parseRate(editRate);
    if (rateValue <= 0) {
      toast.error('Informe um valor por pacote válido');
      return;
    }
    setSaving(true);
    try {
      if (editName.trim() !== pl.name) {
        // renomeia a plataforma E reconecta os pacotes (guardam o nome, não o id).
        await renamePlatform(companyId, pl.id, editName.trim(), userId);
      }
      await updatePlatform(pl.id, userId, { default_rate: rateValue, color: editColor });
      toast.success('Plataforma atualizada');
      setEditingId(null);
      await onSaved();
    } catch (e) {
      console.error('Erro ao editar plataforma:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao editar plataforma');
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleArchive = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const names = platforms.filter((p) => selected.has(p.id)).map((p) => p.name).join(', ');
    if (
      !window.confirm(
        `Arquivar ${ids.length} plataforma(s) (${names})?\n\nElas somem do painel e os pacotes delas SAEM do total das quinzenas em aberto. As quinzenas já concluídas não mudam. Dá pra reativar depois.`,
      )
    )
      return;
    setSaving(true);
    try {
      await setPlatformsActive(ids, false, userId);
      toast.success(`${ids.length} plataforma(s) arquivada(s)`);
      setSelected(new Set());
      await onSaved();
    } catch (e) {
      console.error('Erro ao arquivar plataformas:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao arquivar plataformas');
    } finally {
      setSaving(false);
    }
  };

  const optionClass = (active: boolean): string =>
    `flex-1 border rounded-md p-3 cursor-pointer text-sm font-medium ${
      active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'
    }`;

  return (
    <ModalShell
      icon={<Plus className="w-5 h-5" />}
      title="Plataformas"
      subtitle="Criar, editar (nome, cor, valor) e arquivar plataformas"
      onClose={onClose}
      maxWidth="sm:max-w-xl"
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
        {/* ── Plataformas existentes ─────────────────────────────────────── */}
        {platforms.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Plataformas ativas</label>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
              {platforms.map((pl) =>
                editingId === pl.id ? (
                  <div key={pl.id} className="p-3 space-y-2 bg-blue-50/40">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nome"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[40px]"
                      />
                      <div className="relative sm:w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-full pl-7 pr-2 py-2 border border-gray-300 rounded-md text-sm tabular-nums min-h-[40px]"
                        />
                      </div>
                    </div>
                    <ColorPalette value={editColor} onPick={setEditColor} />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(pl)}
                        disabled={saving}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" /> Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium inline-flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={pl.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(pl.id)}
                      onChange={() => toggleSelect(pl.id)}
                      className="w-4 h-4 rounded border-gray-300"
                      title="Selecionar para arquivar"
                    />
                    <span
                      className="font-bold flex-1 min-w-0 truncate"
                      style={pl.color ? { color: pl.color } : undefined}
                    >
                      {pl.name}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">R$ {formatRate(pl.default_rate)}/pc</span>
                    <button
                      type="button"
                      onClick={() => startEdit(pl)}
                      className="text-blue-600 hover:text-blue-800"
                      title="Editar plataforma"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                ),
              )}
            </div>

            {selected.size > 0 && (
              <button
                type="button"
                onClick={handleArchive}
                disabled={saving}
                className="w-full px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
              >
                <Archive className="w-4 h-4" /> Arquivar {selected.size} selecionada(s)
              </button>
            )}

            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                Arquivar tira os pacotes daquela plataforma do <b>total das quinzenas em aberto</b>. As quinzenas já{' '}
                <b>concluídas não mudam</b>. Dá pra reativar depois.
              </span>
            </div>
          </div>
        )}

        {/* ── Nova plataforma ────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-4 space-y-4">
          <label className="text-sm font-medium text-gray-700">Nova plataforma</label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Shopee, Mercado Livre, Loggi…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Valor por pacote (padrão)</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">Cor (aparece no cabeçalho, em negrito)</span>
            <ColorPalette value={color} onPick={setColor} />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Aplicar em</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setApplyMode('all')} className={optionClass(applyMode === 'all')}>
                Todos os drivers
                <span className="block text-[11px] font-normal text-gray-500 mt-0.5">em massa</span>
              </button>
              <button type="button" onClick={() => setApplyMode('one')} className={optionClass(applyMode === 'one')}>
                Só um driver
                <span className="block text-[11px] font-normal text-gray-500 mt-0.5">escolher qual</span>
              </button>
            </div>
          </div>

          {applyMode === 'one' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Driver</span>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              >
                <option value="">Selecione…</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.route ? ` — ${d.route}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center justify-center gap-2 min-h-[40px] disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {saving ? 'Salvando…' : 'Adicionar plataforma'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
