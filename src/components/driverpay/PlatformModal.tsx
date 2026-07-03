import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Driver, createPlatform, applyPlatformToAllDrivers, upsertDriverRate } from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface PlatformModalProps {
  companyId: string;
  userId: string;
  drivers: Driver[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

export const PlatformModal: React.FC<PlatformModalProps> = ({ companyId, userId, drivers, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('2,00');
  const [applyMode, setApplyMode] = useState<'all' | 'one'>('all');
  const [driverId, setDriverId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
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
      const platform = await createPlatform(companyId, userId, { name: name.trim(), default_rate: rateValue });
      if (applyMode === 'all') {
        const count = await applyPlatformToAllDrivers(companyId, platform.id, rateValue, userId);
        toast.success(`Plataforma "${platform.name}" adicionada a ${count} driver(s)`);
      } else {
        await upsertDriverRate(companyId, driverId, platform.id, rateValue, userId);
        toast.success(`Plataforma "${platform.name}" adicionada ao driver`);
      }
      await onSaved();
      onClose();
    } catch (e) {
      console.error('Erro ao adicionar plataforma:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar plataforma');
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
      title="Adicionar plataforma"
      subtitle="Nova origem de pacotes além de eMile e ANJUN"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium min-h-[40px] disabled:opacity-50"
          >
            {saving ? 'Adicionando…' : 'Adicionar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Nome da plataforma</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Shopee, Mercado Livre, Loggi…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Valor por pacote (padrão)</label>
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

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Aplicar em</label>
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
            <label className="text-sm font-medium text-gray-700">Driver</label>
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
      </div>
    </ModalShell>
  );
};
