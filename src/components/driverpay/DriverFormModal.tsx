import React, { useEffect, useRef, useState } from 'react';
import { Truck, KeyRound, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Driver,
  DriverPlatform,
  createDriver,
  updateDriver,
  upsertDriverRate,
  getDriverRates,
  resetDriverPassword,
} from '../../services/driverPay';
import { ModalShell } from './ModalShell';

/** Uma taxa (por plataforma) que MUDOU no cadastro do driver: valor antigo -> novo. */
export interface DriverRateChange {
  platformName: string;
  oldRate: number;
  newRate: number;
}

interface DriverFormModalProps {
  mode: 'create' | 'edit';
  driver: Driver | null;
  platforms: DriverPlatform[];
  companyId: string;
  userId: string;
  hasPermission: (permission: string) => boolean;
  onClose: () => void;
  /**
   * Chamado apos persistir. Recebe o id do driver e as taxas por plataforma que
   * REALMENTE mudaram (lista vazia quando nenhuma taxa mudou — ex.: editou so
   * PIX/telefone). Permite reaplicar a taxa aos pacotes do periodo aberto sem
   * atropelar os overrides por rota.
   */
  onSaved: (driverId: string, rateChanges: DriverRateChange[]) => void | Promise<void>;
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
  // Recebedor separado (ex.: esposa emite a nota e recebe o PIX) — relatórios saem no nome/PIX dele.
  const [recebedorNome, setRecebedorNome] = useState(driver?.recebedor_nome ?? '');
  const [recebedorPix, setRecebedorPix] = useState(driver?.recebedor_pix ?? '');
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const pl of platforms) initial[pl.id] = String(pl.default_rate);
    return initial;
  });
  // Taxas por plataforma como estavam AO ABRIR o modal (numero), para detectar no save
  // exatamente o que mudou. Inicia nos defaults; a edicao carrega as taxas reais do driver.
  const originalRatesRef = useRef<Record<string, number>>(
    Object.fromEntries(platforms.map((pl) => [pl.id, pl.default_rate])),
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const canConfigRate = hasPermission('driverpay.configRate');

  // Reset de senha do app: apaga a auth -> volta pro 1234 (troca no próximo acesso) e destrava.
  const handleResetPassword = async () => {
    if (!driver) return;
    if (
      !window.confirm(
        `Resetar a senha do app de ${driver.name}?\n\n` +
          'A senha volta a ser 1234 e o driver cria uma nova no próximo acesso. Também destrava se estiver bloqueado por tentativas.',
      )
    )
      return;
    setResetting(true);
    try {
      await resetDriverPassword(driver.id, userId);
      toast.success('Senha resetada — o driver entra com 1234 e cria uma nova.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao resetar a senha');
    } finally {
      setResetting(false);
    }
  };

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
          // Snapshot das taxas originais (numero) para o diff no save.
          const orig = { ...originalRatesRef.current };
          for (const r of driverRates) orig[r.platform_id] = Number(r.rate);
          originalRatesRef.current = orig;
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
        recebedor_nome: recebedorNome.trim() || null,
        recebedor_pix: recebedorPix.trim() || null,
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

      const rateChanges: DriverRateChange[] = [];
      if (canConfigRate) {
        for (const pl of platforms) {
          const rate = parseRate(rates[pl.id] ?? String(pl.default_rate));
          if (rate > 0) await upsertDriverRate(companyId, driverId, pl.id, rate, userId);
          // So marca como mudanca quando a taxa DE FATO mudou (compara em centavos,
          // robusto a float). Alimenta a reaplicacao seletiva no periodo aberto.
          const oldRate = originalRatesRef.current[pl.id] ?? pl.default_rate;
          if (rate > 0 && Math.round(rate * 100) !== Math.round(Number(oldRate) * 100)) {
            rateChanges.push({ platformName: pl.name, oldRate: Number(oldRate), newRate: rate });
          }
        }
      }

      toast.success(mode === 'create' ? 'Driver cadastrado' : 'Driver atualizado');
      await onSaved(driverId, rateChanges);
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
          {mode === 'edit' && driver && (
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetting || saving}
              title="Volta a senha do app pro 1234 (o driver cria uma nova no próximo acesso)"
              className="mr-auto px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 text-sm font-medium min-h-[40px] inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Resetar senha
            </button>
          )}
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

        <div className="border border-amber-200 bg-amber-50 rounded-md p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Recebedor diferente (opcional)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Preencha só se OUTRA pessoa recebe por este driver (ex.: a esposa emite a nota e o PIX é dela).
              Os relatórios saem no nome e PIX do recebedor; o espelho continua no nome do driver.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Nome do recebedor</label>
              <input
                type="text"
                value={recebedorNome}
                onChange={(e) => setRecebedorNome(e.target.value)}
                placeholder="Ex.: nome de quem emite a nota"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Chave PIX do recebedor</label>
              <input
                type="text"
                value={recebedorPix}
                onChange={(e) => setRecebedorPix(e.target.value)}
                placeholder="CPF, CNPJ, e-mail, telefone…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 min-h-[40px]"
              />
            </div>
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
