import React, { useState, useEffect } from 'react';
import { Building2, Save, MapPin, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompany } from '../../contexts/CompanyContext';
import { updateCompany } from '../../services/database';

const DAY_LABELS: ReadonlyArray<{ index: number; label: string; short: string }> = [
  { index: 0, label: 'Domingo',  short: 'Dom' },
  { index: 1, label: 'Segunda',  short: 'Seg' },
  { index: 2, label: 'Terça',    short: 'Ter' },
  { index: 3, label: 'Quarta',   short: 'Qua' },
  { index: 4, label: 'Quinta',   short: 'Qui' },
  { index: 5, label: 'Sexta',    short: 'Sex' },
  { index: 6, label: 'Sábado',   short: 'Sáb' },
];

function minutesToHHMM(min: number): string {
  const safe = Number.isFinite(min) && min >= 0 ? min : 0;
  const h = Math.floor(safe / 60).toString().padStart(2, '0');
  const m = (safe % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function hhmmToMinutes(s: string): number {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return 0;
  const [h, m] = s.split(':').map(Number);
  return (h * 60) + m;
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none min-h-[44px]';
const labelCls = 'block text-xs text-gray-600 mb-1';

const FOUR_WEEK_HOURS_MIN = 44 * 60;

export const CompanySettings: React.FC = () => {
  const { company, setCompany } = useCompany();
  const [city, setCity] = useState('');
  const [addressFull, setAddressFull] = useState('');
  const [defaultFunctionRole, setDefaultFunctionRole] = useState('');
  const [defaultMarkingCount, setDefaultMarkingCount] = useState<2 | 4>(2);
  const [defaultGeoRadius, setDefaultGeoRadius] = useState(50);
  const [bankHoursEnabled, setBankHoursEnabled] = useState(false);
  const [bankHoursApplyInPayment, setBankHoursApplyInPayment] = useState(false);
  const [scheduleMin, setScheduleMin] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setCity(company.city ?? '');
    setAddressFull(company.address_full ?? '');
    setDefaultFunctionRole(company.default_function_role ?? '');
    setDefaultMarkingCount(company.default_marking_count);
    setDefaultGeoRadius(company.default_geo_radius);
    setBankHoursEnabled(!!company.bank_hours_enabled);
    setBankHoursApplyInPayment(!!company.bank_hours_apply_in_payment);
    const raw = company.default_schedule;
    if (Array.isArray(raw) && raw.length === 7) {
      setScheduleMin(raw.map(n => Number(n) || 0));
    } else {
      setScheduleMin([0, 0, 0, 0, 0, 0, 0]);
    }
  }, [company]);

  const totalWeeklyMin = scheduleMin.reduce((a, b) => a + b, 0);
  const overCLT = totalWeeklyMin > FOUR_WEEK_HOURS_MIN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    try {
      await updateCompany(company.id, {
        city,
        address_full: addressFull || null,
        default_function_role: defaultFunctionRole.trim() || null,
        default_marking_count: defaultMarkingCount,
        default_geo_radius: defaultGeoRadius,
        default_schedule: scheduleMin,
        bank_hours_enabled: bankHoursEnabled,
        bank_hours_apply_in_payment: bankHoursApplyInPayment,
      });
      toast.success('Configurações salvas');
      // Recarrega o contexto pra refletir nas demais telas (ex.: schedule editado).
      await setCompany(company.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro ao salvar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  if (!company) {
    return (
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <p className="text-sm text-gray-500">Carregando empresa...</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
      <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-4">
        <Building2 className="w-5 h-5 text-gray-600" />
        Configurações da Empresa
        <span className="text-gray-500 font-normal"> — {company.display_name}</span>
      </h3>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Razão social</label>
            <input value={company.legal_name} disabled className={`${inputCls} bg-gray-50 text-gray-600`} />
          </div>
          <div>
            <label className={labelCls}>CNPJ</label>
            <input value={company.cnpj} disabled className={`${inputCls} bg-gray-50 text-gray-600`} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Cidade</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Função padrão</label>
            <input
              value={defaultFunctionRole}
              onChange={e => setDefaultFunctionRole(e.target.value)}
              placeholder="Ex.: AUXILIAR DE LOGÍSTICA"
              className={inputCls}
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Endereço completo</label>
          <textarea
            value={addressFull}
            onChange={e => setAddressFull(e.target.value)}
            rows={2}
            placeholder="Rua, número, bairro, cidade — UF"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none resize-none"
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Latitude</label>
            <input value={company.default_geo_lat} disabled className={`${inputCls} bg-gray-50 text-gray-600`} />
          </div>
          <div>
            <label className={labelCls}>Longitude</label>
            <input value={company.default_geo_lng} disabled className={`${inputCls} bg-gray-50 text-gray-600`} />
          </div>
          <div>
            <label className={labelCls}>Raio (m)</label>
            <input
              type="number"
              min={0}
              value={defaultGeoRadius}
              onChange={e => setDefaultGeoRadius(Math.max(0, Number(e.target.value) || 0))}
              className={inputCls}
              disabled={saving}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-3 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Latitude/longitude são editadas em outra tela.
        </p>

        <div>
          <label className={labelCls}>Marcações padrão (novos funcionários)</label>
          <div className="flex gap-3">
            {([2, 4] as const).map(n => (
              <label
                key={n}
                className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer min-h-[44px] ${
                  defaultMarkingCount === n ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="markingCount"
                  checked={defaultMarkingCount === n}
                  onChange={() => setDefaultMarkingCount(n)}
                  disabled={saving}
                />
                <span className="text-sm">{n} marcações</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={`${labelCls} flex items-center gap-1`}>
            <Clock className="w-3 h-3" /> Jornada padrão semanal (HH:MM por dia)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DAY_LABELS.map(({ index, label, short }) => (
              <div key={index}>
                <span className="block text-xs text-gray-600 mb-1">
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{short}</span>
                </span>
                <input
                  type="time"
                  value={minutesToHHMM(scheduleMin[index] ?? 0)}
                  onChange={e => {
                    const next = [...scheduleMin];
                    next[index] = hhmmToMinutes(e.target.value);
                    setScheduleMin(next);
                  }}
                  className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none min-h-[40px]"
                  disabled={saving}
                />
              </div>
            ))}
          </div>
          <p className={`text-xs mt-2 flex items-center gap-1 ${overCLT ? 'text-amber-700' : 'text-gray-500'}`}>
            {overCLT && <AlertCircle className="w-3 h-3" />}
            Total semanal: <strong>{minutesToHHMM(totalWeeklyMin)}</strong>
            {overCLT && ' — acima de 44h CLT'}
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={bankHoursEnabled}
              onChange={e => setBankHoursEnabled(e.target.checked)}
              className="w-4 h-4 rounded"
              disabled={saving}
            />
            Banco de horas habilitado
          </label>
          <label className={`flex items-center gap-2 text-sm cursor-pointer ${bankHoursEnabled ? 'text-gray-700' : 'text-gray-400'}`}>
            <input
              type="checkbox"
              checked={bankHoursApplyInPayment}
              onChange={e => setBankHoursApplyInPayment(e.target.checked)}
              className="w-4 h-4 rounded"
              disabled={saving || !bankHoursEnabled}
            />
            Banco de horas afeta cálculo de pagamento
          </label>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50 min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
  );
};
