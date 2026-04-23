import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, ChevronLeft, Loader2, LogOut, Moon, AlertCircle } from 'lucide-react';
import {
  getEmployeeByCpf,
  getEmployeeTodayAttendance,
  getEmployeeAttendanceHistory,
  verifyEmployeePin,
  setEmployeePin,
  getFaceRecognitionConfig,
  Employee,
  Attendance,
} from '../../services/database';
import { FaceRegistration } from './FaceRegistration';
import { FaceVerification } from './FaceVerification';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--:--:--';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatHours(h: number | null | undefined): string {
  if (h == null) return '-';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins.toString().padStart(2, '0')}min`;
}

function formatDateBR(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const APPROVAL_BADGE: Record<string, { label: string; cls: string }> = {
  pending:  { label: '🟡 Aguardando aprovação', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '✅ Aprovado',             cls: 'bg-green-100 text-green-800' },
  rejected: { label: '❌ Rejeitado',            cls: 'bg-red-100 text-red-800' },
  manual:   { label: '📝 Manual',               cls: 'bg-gray-100 text-gray-700' },
};

type Step = 'cpf' | 'pin' | 'setup-pin' | 'face-register' | 'dashboard' | 'error';

/** Solicita geolocalização. Resolve com a position, ou rejeita com o código do erro. */
function requestGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 2 }); // POSITION_UNAVAILABLE
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    });
  });
}

function formatCPFMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EmployeeClockIn: React.FC = () => {
  const [step, setStep] = useState<Step>('cpf');
  const [cpfInput, setCpfInput] = useState('');
  const [pin, setPin] = useState('');
  const [setupField, setSetupField] = useState<'new' | 'confirm'>('new');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockMsg, setClockMsg] = useState<string | null>(null);

  // Facial: se ativo, verifica rosto ao clicar em Registrar Entrada/Saída
  const [faceGateActive, setFaceGateActive] = useState(false);
  const [pendingClockType, setPendingClockType] = useState<'entry' | 'exit' | null>(null);

  // Guards anti-duplo-clique e watchdog do botão de ponto
  const inFlightClockRef = useRef(false);
  const clockWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load dashboard data ──────────────────────────────────────────────────

  const loadDashboard = useCallback(async (emp: Employee, silent = false) => {
    if (!silent) setLoading(true);
    // Reset mensagem residual: evita que um erro antigo persista
    // quando o polling (30s) ou um reload posterior confirma o registro.
    setClockMsg(null);
    try {
      const [today, hist] = await Promise.all([
        getEmployeeTodayAttendance(emp.id),
        getEmployeeAttendanceHistory(emp.id, 30),
      ]);
      // Merge inteligente: só atualiza o state se houve mudança real
      setTodayRecord(prev => JSON.stringify(prev) === JSON.stringify(today) ? prev : today);
      setHistory(prev => JSON.stringify(prev) === JSON.stringify(hist) ? prev : hist);
    } catch {
      if (!silent) {
        setErrorMsg('Erro ao carregar dados. Tente novamente.');
        setStep('error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Atualiza dashboard a cada 30s enquanto está na tela (silencioso — sem flash)
  useEffect(() => {
    if (step !== 'dashboard' || !employee) return;
    const interval = setInterval(() => loadDashboard(employee, true), 30000);
    return () => clearInterval(interval);
  }, [step, employee, loadDashboard]);

  // Limpa watchdog ao desmontar
  useEffect(() => () => {
    if (clockWatchdogRef.current) clearTimeout(clockWatchdogRef.current);
  }, []);

  // ─── Face recognition gate ────────────────────────────────────────────────
  // Decide o próximo passo após autenticação por PIN:
  // - Primeiro acesso (ou admin pediu reset) com facial ativo → face-register
  // - Caso contrário → dashboard direto; a verificação facial acontece no
  //   momento de bater o ponto (gate controlado por faceGateActive).
  const continueAfterPin = useCallback(async (emp: Employee) => {
    try {
      const cfg = await getFaceRecognitionConfig();
      const empEnabled = emp.face_recognition_enabled !== false; // null/undefined = habilitado por padrão
      const activeGlobally = cfg.enabled && empEnabled;

      if (activeGlobally && (!emp.face_registered || emp.face_reset_requested)) {
        setFaceGateActive(true); // após cadastrar, próximos pontos vão exigir verificação
        setStep('face-register');
        return;
      }

      setFaceGateActive(activeGlobally && !!emp.face_registered && !emp.face_reset_requested);
      await loadDashboard(emp);
      setClockMsg(null); // entrada fresca no dashboard: zera qualquer msg residual
      setStep('dashboard');
    } catch (err) {
      console.error('Erro no gate facial, seguindo sem facial:', err);
      setFaceGateActive(false);
      await loadDashboard(emp);
      setClockMsg(null);
      setStep('dashboard');
    }
  }, [loadDashboard]);

  // ─── CPF ────────────────────────────────────────────────────────────────────

  const handleCpfSubmit = async () => {
    setLoading(true);
    try {
      const emp = await getEmployeeByCpf(cpfInput);
      if (!emp) {
        setErrorMsg('Funcionário não encontrado. Verifique o CPF digitado.');
        setStep('error');
        return;
      }
      setEmployee(emp);
      if (!emp.pin_configured) {
        setSetupField('new');
        setNewPin('');
        setConfirmPin('');
        setSetupError('');
        setStep('setup-pin');
      } else {
        setStep('pin');
      }
    } catch {
      setErrorMsg('Erro ao buscar funcionário. Tente novamente.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // ─── PIN keypad ───────────────────────────────────────────────────────────

  const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  const handlePinSubmit = async () => {
    if (!employee) return;
    setLoading(true);
    try {
      const valid = await verifyEmployeePin(employee.id, pin);
      if (!valid) {
        setPin('');
        setErrorMsg('PIN incorreto. Tente novamente.');
        setStep('error');
        return;
      }
      await continueAfterPin(employee);
    } catch {
      setErrorMsg('Erro ao verificar PIN. Tente novamente.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Setup PIN (first login) ──────────────────────────────────────────────

  const handleSavePin = async () => {
    if (!employee) return;
    if (newPin !== confirmPin) {
      setSetupError('As senhas não conferem');
      setConfirmPin('');
      setSetupField('confirm');
      return;
    }
    setLoading(true);
    setSetupError('');
    try {
      await setEmployeePin(employee.id, newPin);
      await continueAfterPin(employee);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Erro ao salvar PIN');
    } finally {
      setLoading(false);
    }
  };

  // ─── Clock in / out (server-side validation via Edge Function) ─────────

  const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-in-validated`;

  const callClockValidated = async (
    clockType: 'entry' | 'exit',
    signal?: AbortSignal,
  ): Promise<{ success: boolean; fraud: boolean; geo_warning?: boolean; distance_meters: number | null; attendance?: Attendance; error?: string }> => {
    if (!employee) throw new Error('Funcionário não carregado');

    let latitude: number | null = null;
    let longitude: number | null = null;
    let accuracy: number | null = null;

    try {
      const position = await requestGeolocation();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      accuracy = position.coords.accuracy;
    } catch {
      // GPS denied/unavailable/timeout → send null coords, server handles silently
    }

    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        employee_id: employee.id,
        cpf: employee.cpf,
        clock_type: clockType,
        latitude,
        longitude,
        accuracy,
      }),
      signal,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no servidor');
    return data;
  };

  // Executa a batida de ponto de fato (chamada à Edge Function + feedback).
  // Em caso de timeout (30s), consulta o banco para ver se o servidor
  // registrou mesmo assim antes de mostrar erro ao usuário.
  const executeClock = async (type: 'entry' | 'exit') => {
    if (!employee) return;
    // Guard síncrono: bloqueia qualquer segundo clique enquanto um registro
    // estiver em voo (ou no debounce de 3s pós-clique). React schedula o
    // setClockLoading, mas o ref é atualizado imediatamente.
    if (inFlightClockRef.current) return;
    inFlightClockRef.current = true;

    setClockLoading(true);
    setClockMsg(null);

    // AbortController para cortar o fetch em 30s (antes era 15s).
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 30_000);

    // Watchdog extra (35s): segurança se o try/catch não chegar a rodar.
    if (clockWatchdogRef.current) clearTimeout(clockWatchdogRef.current);
    clockWatchdogRef.current = setTimeout(() => {
      setClockLoading(false);
      setClockMsg('❌ Tempo esgotado. Verifique sua conexão e tente novamente.');
      inFlightClockRef.current = false;
      clockWatchdogRef.current = null;
    }, 35_000);

    const now = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Helper: verifica no banco se o ponto já foi registrado. Usado em
    // success=false e AbortError — o servidor pode ter gravado mesmo quando
    // respondeu com erro / timeout.
    const verifyRegisteredInDb = async (): Promise<boolean> => {
      try {
        const today = await getEmployeeTodayAttendance(employee.id);
        return type === 'entry' ? !!today?.entry_time : !!today?.exit_time_full;
      } catch {
        return false;
      }
    };

    const setSuccessMsg = async (att?: Attendance | null) => {
      // 1) Limpa qualquer erro residual ANTES de recarregar o dashboard
      setClockMsg(null);
      // 2) Recarrega dados (loadDashboard também reseta clockMsg)
      await loadDashboard(employee, true);
      // 3) Define a mensagem de sucesso como estado final, após o reload
      if (type === 'entry') {
        setClockMsg(`✅ Entrada registrada às ${now()}`);
      } else {
        setClockMsg(`✅ Saída registrada às ${now()}${att ? ` — ${formatHours(att.hours_worked)}` : ''}`);
      }
    };

    try {
      const result = await callClockValidated(type, controller.signal);
      if (!result.success) {
        // Mesmo com success=false, o servidor pode ter gravado. Confirma.
        if (await verifyRegisteredInDb()) {
          await setSuccessMsg(result.attendance);
          return;
        }
        setClockMsg(result.error ? `❌ ${result.error}` : '❌ Erro ao registrar ponto. Tente novamente.');
        return;
      }
      await setSuccessMsg(result.attendance);
    } catch (err) {
      // Timeout (AbortError) → o servidor pode ter registrado mesmo assim.
      // Consultamos o estado atual antes de declarar falha.
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) {
        setClockMsg('⏳ Conexão lenta. Verificando registro...');
        try {
          const today = await getEmployeeTodayAttendance(employee.id);
          const registered = type === 'entry' ? !!today?.entry_time : !!today?.exit_time_full;
          if (registered) {
            await setSuccessMsg(today);
            return;
          }
        } catch { /* sem internet — cai na mensagem final */ }
        setClockMsg('❌ Tempo esgotado. Verifique sua conexão e tente novamente.');
      } else {
        // Erro genérico → verifica uma última vez no DB antes de declarar falha
        if (await verifyRegisteredInDb()) {
          await setSuccessMsg();
          return;
        }
        setClockMsg('❌ Erro ao registrar ponto. Tente novamente.');
      }
    } finally {
      clearTimeout(abortTimer);
      if (clockWatchdogRef.current) {
        clearTimeout(clockWatchdogRef.current);
        clockWatchdogRef.current = null;
      }
      setClockLoading(false);
      // Debounce de 3s — evita duplo clique mesmo que o usuário insista
      setTimeout(() => { inFlightClockRef.current = false; }, 3000);
    }
  };

  // Entrada principal do botão de ponto:
  // - se facial está ativo → abre overlay de verificação; ao acertar, chama executeClock
  // - se não está ativo → executa direto
  const performClock = (type: 'entry' | 'exit') => {
    if (!employee) return;
    if (inFlightClockRef.current || pendingClockType) return;
    setClockMsg(null);
    if (faceGateActive) {
      setPendingClockType(type);
      return;
    }
    executeClock(type);
  };

  const handleClockIn = () => performClock('entry');
  const handleClockOut = () => performClock('exit');

  // ─── Face recognition completion handlers ────────────────────────────────
  const handleFaceRegistrationComplete = async () => {
    if (!employee) return;
    // Recarrega employee p/ pegar face_registered atualizado e pula pro dashboard
    try {
      const fresh = await getEmployeeByCpf(employee.cpf);
      if (fresh) setEmployee(fresh);
    } catch { /* segue com o que tem */ }
    setFaceGateActive(true); // agora cadastrado, próximas batidas precisam verificar
    await loadDashboard(employee);
    setClockMsg(null); // entrada fresca no dashboard: zera qualquer msg residual
    setStep('dashboard');
  };

  const handleFaceClockVerifySuccess = () => {
    const type = pendingClockType;
    setPendingClockType(null);
    if (type) executeClock(type);
  };

  const handleFaceClockVerifyFail = () => {
    setPendingClockType(null);
    setClockMsg('❌ Reconhecimento facial falhou. Procure o supervisor.');
  };

  const handleLogout = () => {
    setStep('cpf');
    setCpfInput('');
    setPin('');
    setNewPin('');
    setConfirmPin('');
    setSetupError('');
    setEmployee(null);
    setTodayRecord(null);
    setHistory([]);
    setClockMsg(null);
    setFaceGateActive(false);
    setPendingClockType(null);
  };

  // ─── Resume do mês ────────────────────────────────────────────────────────

  const monthSummary = () => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthRecords = history.filter(r => r.date.startsWith(monthStr) && r.status === 'present');
    const totalDays = monthRecords.length;
    const totalHours = monthRecords.reduce((s, r) => s + (r.hours_worked ?? 0), 0);
    const totalNight = monthRecords.reduce((s, r) => s + (r.night_hours ?? 0), 0);
    return { totalDays, totalHours, totalNight };
  };

  const hasEntry = todayRecord?.entry_time != null;
  const hasExit = todayRecord?.exit_time_full != null;
  const summary = step === 'dashboard' ? monthSummary() : null;

  // ─── UI ───────────────────────────────────────────────────────────────────

  const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="bg-blue-600 px-6 py-5 text-white text-center">
      <Clock className="w-10 h-10 mx-auto mb-2 opacity-90" />
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <p className="text-blue-100 text-sm mt-1">{subtitle}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* ── CPF ── */}
        {step === 'cpf' && (
          <>
            <Header
              title="Registro de Ponto"
              subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            />
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Digite seu CPF
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpfInput}
                  onChange={e => setCpfInput(formatCPFMask(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full text-center text-2xl font-mono tracking-widest px-4 py-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && cpfInput.replace(/\D/g, '').length === 11 && handleCpfSubmit()}
                />
                <p className="text-xs text-gray-400 text-center mt-2">Digite apenas os números do CPF</p>
              </div>
              <button
                onClick={handleCpfSubmit}
                disabled={cpfInput.replace(/\D/g, '').length !== 11 || loading}
                className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continuar'}
              </button>
            </div>
          </>
        )}

        {/* ── PIN ── */}
        {step === 'pin' && employee && (
          <>
            <Header title={`Olá, ${employee.name.split(' ')[0]}!`} subtitle="Digite seu PIN para continuar" />
            <div className="p-6 space-y-4">
              <div className="flex justify-center gap-3 mb-2">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {KEYPAD.map((key, idx) => {
                  if (key === '') return <div key={idx} />;
                  if (key === '⌫') return (
                    <button key={idx} onClick={() => setPin(p => p.slice(0, -1))} className="py-4 text-xl font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all">⌫</button>
                  );
                  return (
                    <button key={idx} onClick={() => pin.length < 6 && setPin(p => p + key)} className="py-4 text-2xl font-bold text-gray-800 bg-gray-50 rounded-xl hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all border border-gray-200">
                      {key}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handlePinSubmit}
                disabled={pin.length < 4 || loading}
                className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar PIN'}
              </button>
              <button onClick={() => { setStep('cpf'); setPin(''); }} className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-2">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            </div>
          </>
        )}

        {/* ── SETUP PIN ── */}
        {step === 'setup-pin' && employee && (() => {
          const activePin = setupField === 'new' ? newPin : confirmPin;
          const setActivePin = setupField === 'new' ? setNewPin : setConfirmPin;
          return (
            <>
              <Header title={`Olá, ${employee.name.split(' ')[0]}!`} subtitle="Criar sua senha de acesso" />
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  Este é seu primeiro acesso. Defina uma senha numérica de 4 a 6 dígitos para registrar seu ponto.
                </p>

                {/* Field switcher */}
                <div className="flex gap-3">
                  {(['new', 'confirm'] as const).map(f => (
                    <div key={f} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium border-2 transition-all ${setupField === f ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400'}`}>
                      {f === 'new' ? 'Nova senha' : 'Confirmar senha'}
                    </div>
                  ))}
                </div>

                {/* Dot indicators */}
                <div className="flex justify-center gap-3 my-2">
                  {Array.from({ length: Math.max(4, activePin.length) }).map((_, i) => (
                    <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < activePin.length ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} />
                  ))}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {KEYPAD.map((key, idx) => {
                    if (key === '') return <div key={idx} />;
                    if (key === '⌫') return (
                      <button key={idx} onClick={() => setActivePin(p => p.slice(0, -1))} className="py-4 text-xl font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all">⌫</button>
                    );
                    return (
                      <button key={idx} onClick={() => activePin.length < 6 && setActivePin(p => p + key)} className="py-4 text-2xl font-bold text-gray-800 bg-gray-50 rounded-xl hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all border border-gray-200">
                        {key}
                      </button>
                    );
                  })}
                </div>

                {setupError && (
                  <p className="text-sm text-red-600 text-center font-medium">{setupError}</p>
                )}

                {setupField === 'new' ? (
                  <button
                    onClick={() => { setSetupField('confirm'); setConfirmPin(''); setSetupError(''); }}
                    disabled={newPin.length < 4}
                    className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Próximo
                  </button>
                ) : (
                  <button
                    onClick={handleSavePin}
                    disabled={confirmPin.length < 4 || loading}
                    className="w-full py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar senha'}
                  </button>
                )}

                {setupField === 'confirm' && (
                  <button onClick={() => { setSetupField('new'); setSetupError(''); }} className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-2">
                    <ChevronLeft className="w-4 h-4" /> Corrigir nova senha
                  </button>
                )}
              </div>
            </>
          );
        })()}

        {/* ── DASHBOARD ── */}
        {step === 'dashboard' && employee && (
          <>
            {/* Header com nome e logout */}
            <div className="bg-blue-600 px-5 py-4 text-white flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-200">Olá,</p>
                <p className="font-bold text-lg leading-tight">{employee.name.split(' ')[0]}</p>
                <p className="text-xs text-blue-200">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>

            <div className="overflow-y-auto max-h-[80vh] pb-4">
              {/* ── Card do dia ── */}
              <div className="m-4 p-4 border-2 border-blue-200 rounded-xl bg-blue-50 space-y-3">
                <h2 className="font-semibold text-blue-900 text-sm uppercase tracking-wide">📅 Hoje</h2>

                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Entrada</p>
                        <p className={`font-mono font-bold text-lg ${hasEntry ? 'text-green-700' : 'text-gray-400'}`}>
                          {hasEntry ? formatTime(todayRecord?.entry_time) : '--:--:--'}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Saída</p>
                        <p className={`font-mono font-bold text-lg ${hasExit ? 'text-orange-600' : 'text-gray-400'}`}>
                          {hasExit ? formatTime(todayRecord?.exit_time_full) : '--:--:--'}
                        </p>
                      </div>
                    </div>

                    {hasEntry && hasExit && todayRecord?.hours_worked != null && (
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Total trabalhado</p>
                        <p className="font-bold text-blue-700 text-lg">{formatHours(todayRecord.hours_worked)}</p>
                        {todayRecord.night_hours != null && todayRecord.night_hours > 0 && (
                          <p className="text-xs text-indigo-600 mt-1 flex items-center justify-center gap-1">
                            <Moon className="w-3 h-3" />
                            {formatHours(todayRecord.night_hours)} noturnas
                          </p>
                        )}
                      </div>
                    )}

                    {/* Status de aprovação */}
                    {todayRecord?.approval_status && (
                      <div className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${APPROVAL_BADGE[todayRecord.approval_status]?.cls ?? ''}`}>
                        {APPROVAL_BADGE[todayRecord.approval_status]?.label ?? todayRecord.approval_status}
                        {todayRecord.rejection_reason && (
                          <p className="font-normal mt-0.5">Motivo: {todayRecord.rejection_reason}</p>
                        )}
                      </div>
                    )}

                    {/* Mensagem de ação */}
                    {clockMsg && (
                      <div className={`rounded-lg px-3 py-2 text-sm font-medium ${clockMsg.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {clockMsg}
                      </div>
                    )}

                    {/* Botões de ponto */}
                    {!hasEntry && (
                      <button
                        onClick={handleClockIn}
                        disabled={clockLoading}
                        aria-busy={clockLoading}
                        className="w-full py-4 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {clockLoading
                          ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                          : <><Clock className="w-5 h-5" /> REGISTRAR ENTRADA</>}
                      </button>
                    )}
                    {hasEntry && !hasExit && (
                      <button
                        onClick={handleClockOut}
                        disabled={clockLoading}
                        aria-busy={clockLoading}
                        className="w-full py-4 bg-orange-500 text-white font-bold text-lg rounded-xl hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {clockLoading
                          ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                          : <><Clock className="w-5 h-5" /> REGISTRAR SAÍDA</>}
                      </button>
                    )}
                    {hasEntry && hasExit && (
                      <div className="flex items-center justify-center gap-2 py-2 text-green-700 font-medium text-sm">
                        <CheckCircle className="w-5 h-5" />
                        Ponto completo hoje!
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Resumo do mês ── */}
              {summary && (
                <div className="mx-4 mb-4 p-4 border border-gray-200 rounded-xl bg-white">
                  <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">📊 Resumo do Mês</h2>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-blue-700">{summary.totalDays}</p>
                      <p className="text-xs text-blue-600 mt-0.5">Dias presentes</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-lg font-bold text-green-700">{formatHours(summary.totalHours)}</p>
                      <p className="text-xs text-green-600 mt-0.5">Horas totais</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-3">
                      <p className="text-lg font-bold text-indigo-700">{formatHours(summary.totalNight)}</p>
                      <p className="text-xs text-indigo-600 mt-0.5">Hs noturnas</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Histórico 30 dias ── */}
              <div className="mx-4">
                <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">📋 Últimos 30 dias</h2>
                {history.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Nenhum registro encontrado
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Data</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Entrada</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Saída</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Horas</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Adic. Not.</th>
                          <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {history.map(rec => {
                          const ab = rec.approval_status ? APPROVAL_BADGE[rec.approval_status] : null;
                          return (
                            <tr key={rec.id} className={`${rec.status === 'absent' ? 'bg-red-50' : ''}`}>
                              <td className="px-3 py-2 font-medium text-gray-800">{formatDateBR(rec.date)}</td>
                              <td className="px-3 py-2 text-gray-600 font-mono">
                                {rec.entry_time ? formatTime(rec.entry_time) : (rec.status === 'absent' ? <span className="text-red-500">Falta</span> : '-')}
                              </td>
                              <td className="px-3 py-2 text-gray-600 font-mono">{formatTime(rec.exit_time_full)}</td>
                              <td className="px-3 py-2 text-gray-600">{formatHours(rec.hours_worked)}</td>
                              <td className="px-3 py-2 text-gray-600">
                                {rec.night_additional != null && rec.night_additional > 0
                                  ? `R$${Number(rec.night_additional).toFixed(2)}`
                                  : '-'}
                              </td>
                              <td className="px-3 py-2">
                                {ab ? (
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${ab.cls}`}>
                                    {ab.label.split(' ')[0]}
                                  </span>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <>
            <Header title="Ops!" />
            <div className="p-6 text-center space-y-4">
              <XCircle className="w-16 h-16 text-red-500 mx-auto" />
              <p className="text-gray-600">{errorMsg}</p>
              <button onClick={() => setStep('cpf')} className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-colors">
                Tentar novamente
              </button>
            </div>
          </>
        )}

      </div>

      {/* ── FACE REGISTRATION (overlay full-screen — primeiro acesso) ── */}
      {step === 'face-register' && employee && (
        <FaceRegistration
          employee={employee}
          onComplete={handleFaceRegistrationComplete}
          onSkip={handleLogout}
        />
      )}

      {/* ── FACE VERIFICATION (overlay disparado pelo botão de ponto) ── */}
      {step === 'dashboard' && pendingClockType && employee && (
        <FaceVerification
          employee={employee}
          onSuccess={handleFaceClockVerifySuccess}
          onFail={handleFaceClockVerifyFail}
          clockType={pendingClockType}
        />
      )}

    </div>
  );
};
