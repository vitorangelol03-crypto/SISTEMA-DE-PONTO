import React, { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Driver,
  DriverPlatform,
  createDriver,
  updateDriver,
  upsertDriverRate,
  getDriverRates,
} from '../../services/driverPay';
import { ModalShell } from './ModalShell';

interface DriverFormModalProps {
  mode: 'create' | 'edit';
  driver: Driver | null;
  platforms: DriverPlatform[];
  companyId: string;
  userId: string;
  hasPermission: (permission: string) => boolean;
  onClose: () => void;
  /** Chamado apos persistir. Recebe o id do driver (novo ou editado). */
  onSaved: (driverId: string) => void | Promise<void>;
}

const parseRate = (raw: string): number => {
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  mode,
  driver,
  platforms,
  companyId,
  userId,
  hasPermission,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(driver?.name ?? '');
  const [route, setRoute] = useState(driver?.route ?? '');
  const [pix, setPix] = useState(driver?.pix_key ?? '');
  const [cpf, setCpf] = useState(driver?.cpf ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const pl of platforms) initial[pl.id] = String(pl.default_rate);
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const canConfigRate = hasPermission('driverpay.configRate');

  // Em edicao, carrega as taxas atuais do driver por plataforma.
  useEffect(() => {
    let cancelled = false;
    if (mode === 'edit' && driver) {
      getDriverRates(driver.id)
        .then((driverRates) => {
          if (cancelled) return;
          setRates((prev) => {
            const next = { ...prev };
            for (const r of driverRates) next[r.platform_id] = String(r.rate);
            return next;
          });
        })
        .catch((e) => {
          console.error('Erro ao carregar taxas do driver:', e);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [mode, driver]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome do driver é obrigatório');
      return;
    }
    setSaving(true);
    try {
      let driverId: string;
      const payload = {
        name: name.trim(),
        route: route.trim() || null,
        pix_key: pix.trim() || null,
        cpf: cpf.trim() || null,
        phone: phone.trim() || null,
      };

      if (mode === 'create') {
        const created = await createDriver(companyId, userId, payload);
        driverId = created.id;
      } else if (driver) {
        await updateDriver(driver.id, userId, payload);
        driverId = driver.id;
      } else {
        setSaving(false);
        return;
      }

      if (canConfigRate) {
        for (const pl of platforms) {
          const rate = parseRate(rates[pl.id] ?? String(pl.default_rate));
          if (rate > 0) await upsertDriverRate(companyId, driverId, pl.id, rate, userId);
        }
      }

      toast.success(mode === 'create' ? 'Driver cadastrado' : 'Driver atualizado');
      await onSaved(driverId);
      onClose();
    } catch (e) {
      console.error('Erro ao salvar driver:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      icon={<Truck className="w-5 h-5" />}
      title={mode === 'create' ? 'Novo driver' : 'Editar driver'}
      subtitle={mode === 'create' ? 'Cadastrar entregador' : name}
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando…' : mode === 'create' ? 'Cadastrar driver' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo do driver"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Rota / cidade</label>
            <input
              type="text"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="Ex.: Caratinga"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Chave PIX (opcional)</label>
            <input
              type="text"
              value={pix}
              onChange={(e) => setPix(e.target.value)}
              placeholder="CPF, e-mail, telefone…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">CPF (opcional)</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Telefone (opcional)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
            />
          </div>
        </div>

        {platforms.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Valor por pacote (por plataforma)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {platforms.map((pl) => (
                <div key={pl.id} className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">{pl.name}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!canConfigRate}
                      value={rates[pl.id] ?? ''}
                      onChange={(e) => setRates((prev) => ({ ...prev, [pl.id]: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
              ))}
            </div>
            {!canConfigRate && (
              <p className="text-xs text-amber-600">Você não tem permissão para configurar o valor por pacote.</p>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
