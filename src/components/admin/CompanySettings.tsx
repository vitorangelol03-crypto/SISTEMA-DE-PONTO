import React, { useMemo, useState, useEffect } from 'react';
import { Building2, Save, MapPin, Clock, AlertCircle, Wallet, Calculator, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../hooks/useAuth';
import { updateCompany } from '../../services/database';
import {
  applyBankHours,
  type BankHoursAfterApply,
  type BankHoursCreditAction,
  type BankHoursDebitAction,
  type BankHoursDisplay,
  type BankHoursFormula,
  type BankHoursPeriod,
  type BankHoursSettings,
} from '../../utils/bankHoursCalculator';
import { parseNumericInput, isInRange } from '../../utils/numericInputHelpers';

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

// Defaults usados no load quando a row da company tem null nos campos novos
// (rows criadas antes da migration, ou casos defensivos).
const BANK_HOURS_DEFAULTS = {
  formula: 'daily_div_8' as BankHoursFormula,
  extraMultiplier: 1.5,
  customValue: 0,
  creditAction: 'add_to_net' as BankHoursCreditAction,
  debitAction: 'subtract_from_net' as BankHoursDebitAction,
  period: 'payment_period' as BankHoursPeriod,
  display: 'separate_line' as BankHoursDisplay,
  afterApply: 'zero_balance' as BankHoursAfterApply,
  nightSeparate: false,
  nightMultiplier: 1.20,
};

export const CompanySettings: React.FC = () => {
  const { company, setCompany } = useCompany();
  const { user } = useAuth();
  const isAdminMaster = user?.id === '9999';
  const [city, setCity] = useState('');
  const [addressFull, setAddressFull] = useState('');
  const [defaultFunctionRole, setDefaultFunctionRole] = useState('');
  const [defaultMarkingCount, setDefaultMarkingCount] = useState<2 | 4>(2);
  const [defaultGeoRadius, setDefaultGeoRadius] = useState(50);
  const [bankHoursEnabled, setBankHoursEnabled] = useState(false);
  const [bankHoursApplyInPayment, setBankHoursApplyInPayment] = useState(false);
  const [bankHoursFormula, setBankHoursFormula] = useState<BankHoursFormula>(BANK_HOURS_DEFAULTS.formula);
  // COMBO I FIX #5: state raw (string) preserva digitação intermediária ("2.", "1,5" etc.)
  const [extraMultRaw, setExtraMultRaw] = useState<string>(String(BANK_HOURS_DEFAULTS.extraMultiplier));
  const [customValueRaw, setCustomValueRaw] = useState<string>(String(BANK_HOURS_DEFAULTS.customValue));
  const [bankHoursCreditAction, setBankHoursCreditAction] = useState<BankHoursCreditAction>(BANK_HOURS_DEFAULTS.creditAction);
  const [bankHoursDebitAction, setBankHoursDebitAction] = useState<BankHoursDebitAction>(BANK_HOURS_DEFAULTS.debitAction);
  const [bankHoursPeriod, setBankHoursPeriod] = useState<BankHoursPeriod>(BANK_HOURS_DEFAULTS.period);
  const [bankHoursDisplay, setBankHoursDisplay] = useState<BankHoursDisplay>(BANK_HOURS_DEFAULTS.display);
  const [bankHoursAfterApply, setBankHoursAfterApply] = useState<BankHoursAfterApply>(BANK_HOURS_DEFAULTS.afterApply);
  const [bankHoursNightSeparate, setBankHoursNightSeparate] = useState(BANK_HOURS_DEFAULTS.nightSeparate);
  const [nightMultRaw, setNightMultRaw] = useState<string>(String(BANK_HOURS_DEFAULTS.nightMultiplier));
  const [scheduleMin, setScheduleMin] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [saving, setSaving] = useState(false);

  // COMBO I FIX #5: números derivados dos states raw — consumidos por validação, submit e useMemo.
  const bankHoursExtraMultiplier = parseNumericInput(extraMultRaw) ?? 0;
  const bankHoursCustomValue = parseNumericInput(customValueRaw) ?? 0;
  const bankHoursNightMultiplier = parseNumericInput(nightMultRaw) ?? 0;

  useEffect(() => {
    if (!company) return;
    setCity(company.city ?? '');
    setAddressFull(company.address_full ?? '');
    setDefaultFunctionRole(company.default_function_role ?? '');
    setDefaultMarkingCount(company.default_marking_count);
    setDefaultGeoRadius(company.default_geo_radius);
    setBankHoursEnabled(!!company.bank_hours_enabled);
    setBankHoursApplyInPayment(!!company.bank_hours_apply_in_payment);
    setBankHoursFormula(company.bank_hours_formula ?? BANK_HOURS_DEFAULTS.formula);
    setExtraMultRaw(String(company.bank_hours_extra_multiplier ?? BANK_HOURS_DEFAULTS.extraMultiplier));
    setCustomValueRaw(String(company.bank_hours_custom_value ?? BANK_HOURS_DEFAULTS.customValue));
    setBankHoursCreditAction(company.bank_hours_credit_action ?? BANK_HOURS_DEFAULTS.creditAction);
    setBankHoursDebitAction(company.bank_hours_debit_action ?? BANK_HOURS_DEFAULTS.debitAction);
    setBankHoursPeriod(company.bank_hours_period ?? BANK_HOURS_DEFAULTS.period);
    setBankHoursDisplay(company.bank_hours_display ?? BANK_HOURS_DEFAULTS.display);
    setBankHoursAfterApply(company.bank_hours_after_apply ?? BANK_HOURS_DEFAULTS.afterApply);
    setBankHoursNightSeparate(!!company.bank_hours_night_separate);
    setNightMultRaw(String(company.bank_hours_night_multiplier ?? BANK_HOURS_DEFAULTS.nightMultiplier));
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

    // Validação dos campos do banco de horas (centavos importam — falhar cedo).
    if (bankHoursApplyInPayment) {
      if (bankHoursExtraMultiplier < 1 || bankHoursExtraMultiplier > 3) {
        toast.error('Multiplicador hora extra deve estar entre 1.0 e 3.0');
        return;
      }
      if (bankHoursNightSeparate && (bankHoursNightMultiplier < 1 || bankHoursNightMultiplier > 3)) {
        toast.error('Multiplicador noturno deve estar entre 1.0 e 3.0');
        return;
      }
      if (bankHoursFormula === 'custom_hour_value' && bankHoursCustomValue < 0) {
        toast.error('Valor customizado por hora não pode ser negativo');
        return;
      }
    }

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
        bank_hours_formula: bankHoursFormula,
        bank_hours_extra_multiplier: bankHoursExtraMultiplier,
        bank_hours_custom_value: bankHoursCustomValue,
        bank_hours_credit_action: bankHoursCreditAction,
        bank_hours_debit_action: bankHoursDebitAction,
        bank_hours_period: bankHoursPeriod,
        bank_hours_display: bankHoursDisplay,
        bank_hours_after_apply: bankHoursAfterApply,
        bank_hours_night_separate: bankHoursNightSeparate,
        bank_hours_night_multiplier: bankHoursNightMultiplier,
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

  // Snapshot dos settings consumidos pelo simulador (evita prop drilling pra
  // dezenas de campos individuais; useMemo evita re-render do simulador a cada
  // tecla nos demais campos do form).
  const bankHoursSettings: BankHoursSettings = useMemo(() => ({
    bank_hours_apply_in_payment: bankHoursApplyInPayment,
    bank_hours_formula: bankHoursFormula,
    bank_hours_extra_multiplier: bankHoursExtraMultiplier,
    bank_hours_custom_value: bankHoursCustomValue,
    bank_hours_credit_action: bankHoursCreditAction,
    bank_hours_debit_action: bankHoursDebitAction,
    bank_hours_period: bankHoursPeriod,
    bank_hours_display: bankHoursDisplay,
    bank_hours_after_apply: bankHoursAfterApply,
    bank_hours_night_separate: bankHoursNightSeparate,
    bank_hours_night_multiplier: bankHoursNightMultiplier,
  }), [
    bankHoursApplyInPayment, bankHoursFormula, bankHoursExtraMultiplier, bankHoursCustomValue,
    bankHoursCreditAction, bankHoursDebitAction, bankHoursPeriod, bankHoursDisplay,
    bankHoursAfterApply, bankHoursNightSeparate, bankHoursNightMultiplier,
  ]);

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
        </div>

        {/* ─── Seção 10 — Banco de Horas no Pagamento (combo G) ────────── */}
        <section className="space-y-4 pt-6 border-t border-gray-200">
          <div>
            <h4 className="text-base font-semibold flex items-center gap-2 text-gray-800">
              <Wallet className="w-5 h-5 text-gray-600" />
              Banco de Horas no Pagamento
            </h4>
            <p className="text-sm text-gray-600 mt-1">
              Configura como o saldo de horas (crédito/débito) é convertido em R$ no pagamento.
            </p>
            {!isAdminMaster && (
              <div className="mt-2 flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Apenas administradores master podem alterar essas configurações. Você está em modo somente leitura.</span>
              </div>
            )}
          </div>

          {/* Toggle master */}
          <div className={`flex items-center justify-between gap-4 p-4 rounded-lg ${bankHoursApplyInPayment ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="flex-1">
              <label htmlFor="bh-toggle-master" className="font-medium text-sm text-gray-800 cursor-pointer">
                Banco de horas afeta pagamento?
              </label>
              <p className="text-xs text-gray-600 mt-1">
                Se desligado, todas as outras configurações abaixo são ignoradas.
              </p>
              {!bankHoursEnabled && (
                <p className="text-xs text-amber-700 mt-1">
                  Habilite "Banco de horas" acima primeiro.
                </p>
              )}
            </div>
            <input
              id="bh-toggle-master"
              type="checkbox"
              checked={bankHoursApplyInPayment}
              onChange={e => setBankHoursApplyInPayment(e.target.checked)}
              disabled={saving || !bankHoursEnabled || !isAdminMaster}
              className="w-5 h-5 rounded cursor-pointer"
            />
          </div>

          {/* Campos condicionais — só aparecem se toggle master ON */}
          {bankHoursApplyInPayment && (
            <div className="space-y-4 pl-2 border-l-2 border-blue-100">
              {/* Fórmula */}
              <div>
                <label className={labelCls}>Fórmula de conversão hora → R$</label>
                <select
                  value={bankHoursFormula}
                  onChange={e => setBankHoursFormula(e.target.value as BankHoursFormula)}
                  disabled={saving || !isAdminMaster}
                  className={inputCls}
                >
                  <option value="daily_div_8">A) Diária ÷ 8 (CLT padrão)</option>
                  <option value="daily_div_jornada">B) Diária ÷ horas da jornada do funcionário</option>
                  <option value="hour_extra_multiplier">C) Hora normal × multiplicador (hora extra)</option>
                  <option value="custom_hour_value">D) Valor customizado por hora</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">{getFormulaDescription(bankHoursFormula)}</p>
              </div>

              {/* Multiplicador hora extra (apenas fórmula C) */}
              {bankHoursFormula === 'hour_extra_multiplier' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Multiplicador hora extra</label>
                    {/* COMBO I FIX #5: type=text + inputMode=decimal aceita vírgula brasileira; raw preserva digitação. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={extraMultRaw}
                      onChange={e => setExtraMultRaw(e.target.value)}
                      disabled={saving || !isAdminMaster}
                      className={`${inputCls} ${
                        !isInRange(bankHoursExtraMultiplier, 1.0, 3.0)
                          ? 'border-red-500 ring-1 ring-red-200'
                          : ''
                      }`}
                    />
                    {!isInRange(bankHoursExtraMultiplier, 1.0, 3.0) && (
                      <p className="text-xs text-red-600 mt-1">Valor deve estar entre 1.0 e 3.0</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">CLT mínimo: 1.5x. Domingo/feriado típico: 2.0x.</p>
                  </div>
                </div>
              )}

              {/* Valor customizado (apenas fórmula D) */}
              {bankHoursFormula === 'custom_hour_value' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Valor por hora (R$)</label>
                    {/* COMBO I FIX #5: type=text + inputMode=decimal aceita vírgula brasileira; raw preserva digitação. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customValueRaw}
                      onChange={e => setCustomValueRaw(e.target.value)}
                      disabled={saving || !isAdminMaster}
                      className={`${inputCls} ${
                        bankHoursCustomValue < 0
                          ? 'border-red-500 ring-1 ring-red-200'
                          : ''
                      }`}
                    />
                    {bankHoursCustomValue < 0 && (
                      <p className="text-xs text-red-600 mt-1">Valor não pode ser negativo</p>
                    )}
                  </div>
                </div>
              )}

              {/* Toggle horas noturnas separadas */}
              <div className="flex items-center justify-between gap-4 py-1">
                <div className="flex-1">
                  <label htmlFor="bh-night-separate" className="text-sm text-gray-800 cursor-pointer">
                    Horas noturnas com multiplicador separado?
                  </label>
                  <p className="text-xs text-gray-600 mt-0.5">Se ON, horas das 22h–05h usam multiplier diferente.</p>
                </div>
                <input
                  id="bh-night-separate"
                  type="checkbox"
                  checked={bankHoursNightSeparate}
                  onChange={e => setBankHoursNightSeparate(e.target.checked)}
                  disabled={saving || !isAdminMaster}
                  className="w-4 h-4 rounded cursor-pointer"
                />
              </div>

              {bankHoursNightSeparate && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Multiplicador horas noturnas</label>
                    {/* COMBO I FIX #5: type=text + inputMode=decimal aceita vírgula brasileira; raw preserva digitação. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={nightMultRaw}
                      onChange={e => setNightMultRaw(e.target.value)}
                      disabled={saving || !isAdminMaster}
                      className={`${inputCls} ${
                        !isInRange(bankHoursNightMultiplier, 1.0, 3.0)
                          ? 'border-red-500 ring-1 ring-red-200'
                          : ''
                      }`}
                    />
                    {!isInRange(bankHoursNightMultiplier, 1.0, 3.0) && (
                      <p className="text-xs text-red-600 mt-1">Valor deve estar entre 1.0 e 3.0</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">CLT mínimo: 1.20x (adicional noturno). Combinado com extra: até 2.0x.</p>
                  </div>
                </div>
              )}

              {/* Ações de crédito e débito */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Saldo positivo (crédito) — funcionário trabalhou A MAIS</label>
                  <select
                    value={bankHoursCreditAction}
                    onChange={e => setBankHoursCreditAction(e.target.value as BankHoursCreditAction)}
                    disabled={saving || !isAdminMaster}
                    className={inputCls}
                  >
                    <option value="add_to_net">Somar ao líquido (paga a mais)</option>
                    <option value="no_apply">Não aplicar (só conta como banco)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Saldo negativo (débito) — funcionário trabalhou A MENOS</label>
                  <select
                    value={bankHoursDebitAction}
                    onChange={e => setBankHoursDebitAction(e.target.value as BankHoursDebitAction)}
                    disabled={saving || !isAdminMaster}
                    className={inputCls}
                  >
                    <option value="subtract_from_net">Subtrair do líquido (desconta)</option>
                    <option value="no_apply">Não aplicar (só conta como banco)</option>
                    <option value="warn_only">Apenas avisar, não descontar</option>
                  </select>
                </div>
              </div>

              {/* Período + visualização + após aplicar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Período de aplicação</label>
                  <select
                    value={bankHoursPeriod}
                    onChange={e => setBankHoursPeriod(e.target.value as BankHoursPeriod)}
                    disabled={saving || !isAdminMaster}
                    className={inputCls}
                  >
                    <option value="month">Mês inteiro</option>
                    <option value="payment_period">Período do pagamento</option>
                    <option value="accumulated">Acumulado total</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Como aparece no pagamento</label>
                  <select
                    value={bankHoursDisplay}
                    onChange={e => setBankHoursDisplay(e.target.value as BankHoursDisplay)}
                    disabled={saving || !isAdminMaster}
                    className={inputCls}
                  >
                    <option value="separate_line">Linha separada no breakdown</option>
                    <option value="embedded_total">Embutido no total</option>
                    <option value="as_bonus">Como bônus visível</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Após aplicar saldo</label>
                  <select
                    value={bankHoursAfterApply}
                    onChange={e => setBankHoursAfterApply(e.target.value as BankHoursAfterApply)}
                    disabled={saving || !isAdminMaster}
                    className={inputCls}
                  >
                    <option value="zero_balance">Zerar saldo do banco</option>
                    <option value="keep_history">Manter saldo (continua acumulando)</option>
                  </select>
                </div>
              </div>

              {/* Simulador */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h5 className="font-semibold text-sm flex items-center gap-2 mb-3 text-gray-800">
                  <Calculator className="w-4 h-4 text-gray-600" />
                  Simulador de cálculo
                </h5>
                <BankHoursSimulator settings={bankHoursSettings} />
              </div>
            </div>
          )}
        </section>

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

// ─── Helpers e simulador ──────────────────────────────────────────────────

function getFormulaDescription(formula: BankHoursFormula): string {
  switch (formula) {
    case 'daily_div_8':
      return 'Hora = diária ÷ 8. Padrão CLT — independente da jornada efetiva do funcionário.';
    case 'daily_div_jornada':
      return 'Hora = diária ÷ horas da jornada. Justo quando jornadas variam (ex: 6h vs 8h).';
    case 'hour_extra_multiplier':
      return 'Hora = (diária ÷ 8) × multiplicador. Trata todo banco como hora extra (CLT mín 1.5x).';
    case 'custom_hour_value':
      return 'Hora = valor fixo definido pela empresa. Independente de diária/jornada.';
  }
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

const simInputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:border-gray-500 focus:outline-none';
const simLabelCls = 'block text-xs text-gray-700 mb-1 font-medium';

interface BankHoursSimulatorProps {
  settings: BankHoursSettings;
}

const BankHoursSimulator: React.FC<BankHoursSimulatorProps> = ({ settings }) => {
  const [dailyRate, setDailyRate] = useState(100);
  const [jornadaH, setJornadaH] = useState(8);
  const [jornadaM, setJornadaM] = useState(0);
  const [creditH, setCreditH] = useState(2);
  const [creditM, setCreditM] = useState(0);
  const [debitH, setDebitH] = useState(0);
  const [debitM, setDebitM] = useState(0);
  const [nightCreditH, setNightCreditH] = useState(0);
  const [nightCreditM, setNightCreditM] = useState(0);
  const [nightDebitH, setNightDebitH] = useState(0);
  const [nightDebitM, setNightDebitM] = useState(0);

  const result = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: applyBankHours({
          dailyRate,
          jornadaMinutes: jornadaH * 60 + jornadaM,
          creditMinutes: creditH * 60 + creditM,
          debitMinutes: debitH * 60 + debitM,
          nightCreditMinutes: settings.bank_hours_night_separate ? nightCreditH * 60 + nightCreditM : undefined,
          nightDebitMinutes: settings.bank_hours_night_separate ? nightDebitH * 60 + nightDebitM : undefined,
          settings,
        }),
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [
    dailyRate, jornadaH, jornadaM, creditH, creditM, debitH, debitM,
    nightCreditH, nightCreditM, nightDebitH, nightDebitM, settings,
  ]);

  return (
    <div className="space-y-3">
      {/* Inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={simLabelCls}>Diária (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={dailyRate}
            onChange={e => setDailyRate(Math.max(0, Number(e.target.value) || 0))}
            className={simInputCls}
          />
        </div>
        <div>
          <label className={simLabelCls}>Jornada (h:min)</label>
          <div className="flex gap-1">
            <input
              type="number"
              min="0"
              max="24"
              value={jornadaH}
              onChange={e => setJornadaH(clampInt(Number(e.target.value), 0, 24))}
              className={simInputCls}
              aria-label="Horas da jornada"
            />
            <input
              type="number"
              min="0"
              max="59"
              value={jornadaM}
              onChange={e => setJornadaM(clampInt(Number(e.target.value), 0, 59))}
              className={simInputCls}
              aria-label="Minutos da jornada"
            />
          </div>
        </div>
        <div>
          <label className={simLabelCls}>Crédito (h:min)</label>
          <div className="flex gap-1">
            <input
              type="number"
              min="0"
              value={creditH}
              onChange={e => setCreditH(Math.max(0, clampInt(Number(e.target.value), 0, 999)))}
              className={simInputCls}
              aria-label="Horas de crédito"
            />
            <input
              type="number"
              min="0"
              max="59"
              value={creditM}
              onChange={e => setCreditM(clampInt(Number(e.target.value), 0, 59))}
              className={simInputCls}
              aria-label="Minutos de crédito"
            />
          </div>
        </div>
        <div>
          <label className={simLabelCls}>Débito (h:min)</label>
          <div className="flex gap-1">
            <input
              type="number"
              min="0"
              value={debitH}
              onChange={e => setDebitH(Math.max(0, clampInt(Number(e.target.value), 0, 999)))}
              className={simInputCls}
              aria-label="Horas de débito"
            />
            <input
              type="number"
              min="0"
              max="59"
              value={debitM}
              onChange={e => setDebitM(clampInt(Number(e.target.value), 0, 59))}
              className={simInputCls}
              aria-label="Minutos de débito"
            />
          </div>
        </div>
      </div>

      {/* Inputs noturnos — só se config night_separate */}
      {settings.bank_hours_night_separate && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-yellow-200">
          <div className="sm:col-span-2">
            <label className={simLabelCls}>Crédito noturno (h:min) — subset do crédito acima</label>
            <div className="flex gap-1">
              <input
                type="number"
                min="0"
                value={nightCreditH}
                onChange={e => setNightCreditH(Math.max(0, clampInt(Number(e.target.value), 0, 999)))}
                className={simInputCls}
                aria-label="Horas de crédito noturno"
              />
              <input
                type="number"
                min="0"
                max="59"
                value={nightCreditM}
                onChange={e => setNightCreditM(clampInt(Number(e.target.value), 0, 59))}
                className={simInputCls}
                aria-label="Minutos de crédito noturno"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={simLabelCls}>Débito noturno (h:min) — subset do débito acima</label>
            <div className="flex gap-1">
              <input
                type="number"
                min="0"
                value={nightDebitH}
                onChange={e => setNightDebitH(Math.max(0, clampInt(Number(e.target.value), 0, 999)))}
                className={simInputCls}
                aria-label="Horas de débito noturno"
              />
              <input
                type="number"
                min="0"
                max="59"
                value={nightDebitM}
                onChange={e => setNightDebitM(clampInt(Number(e.target.value), 0, 59))}
                className={simInputCls}
                aria-label="Minutos de débito noturno"
              />
            </div>
          </div>
        </div>
      )}

      {/* Output */}
      <div className="bg-white border border-yellow-200 rounded-md p-3 text-sm space-y-1">
        {!result.ok ? (
          <p className="text-red-700 font-medium">Entrada inválida: {result.error}</p>
        ) : (
          <>
            <p className="flex justify-between">
              <span className="text-gray-700">Hora calculada:</span>
              <strong className="text-gray-900">{formatBRL(result.value.hourValueUsed)}/h</strong>
            </p>
            <p className="flex justify-between">
              <span className="text-gray-700">Crédito:</span>
              <strong className="text-gray-900">{formatBRL(result.value.amountCredit)}</strong>
            </p>
            {settings.bank_hours_night_separate && (result.value.breakdown.creditDay > 0 || result.value.breakdown.creditNight > 0) && (
              <p className="flex justify-between text-xs text-gray-500 pl-3">
                <span>↳ diurno {formatBRL(result.value.breakdown.creditDay)} + noturno {formatBRL(result.value.breakdown.creditNight)}</span>
              </p>
            )}
            <p className="flex justify-between">
              <span className="text-gray-700">Débito:</span>
              <strong className="text-gray-900">{formatBRL(result.value.amountDebit)}</strong>
            </p>
            <p className="flex justify-between border-t border-gray-200 pt-1 mt-1">
              <span className="text-gray-700 font-medium">LÍQUIDO:</span>
              <strong className={result.value.amountNet >= 0 ? 'text-green-700' : 'text-red-700'}>
                {result.value.amountNet >= 0 ? '+' : ''}{formatBRL(result.value.amountNet)}
              </strong>
            </p>
            <p className="flex justify-between text-xs">
              <span className="text-gray-600">Status:</span>
              <span className={result.value.applied ? 'text-green-700' : 'text-gray-500'}>
                {result.value.applied ? '✓ Aplicado' : `✗ Não aplicado${result.value.reason ? ` (${result.value.reason})` : ''}`}
                {result.value.applied && result.value.reason && ` — ${result.value.reason}`}
              </span>
            </p>
            <p className="flex justify-between text-xs">
              <span className="text-gray-600">Fórmula:</span>
              <span className="text-gray-700">{getFormulaDescription(result.value.formulaUsed).split('.')[0]}.</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
