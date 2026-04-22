import React, { useState, useEffect, useMemo } from 'react';
import { Lock, MapPin, AlertTriangle, ShieldOff, Key, RefreshCw, Unlock, Trash2, Settings, Play, X, ScanFace, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  verifyAdminSecret,
  updateAdminSecret,
  getGeoRecords,
  getFraudAttempts,
  getBonusBlocks,
  unblockBonus,
  getAllEmployees,
  previewAdminCleanup,
  runAdminCleanup,
  getAdminCleanupConfig,
  updateAdminCleanupConfig,
  runAutoCleanup,
  getFaceRecognitionConfig,
  setFaceRecognitionGlobal,
  setFaceRecognitionForEmployee,
  resetFaceForEmployee,
  getFaceAuthAttempts,
  GeoRecord,
  FraudAttempt,
  BonusBlock,
  Employee,
  AdminCleanupConfig,
  FaceAuthAttempt,
} from '../../services/database';

interface AdminTabProps {
  userId: string;
}

function formatDateBR(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getBrazilToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() + (-3 * 60) * 60 * 1000);
  return local.toISOString().split('T')[0];
}

const FilterBar: React.FC<{ children: React.ReactNode; onClear: () => void; count: number; total: number }> = ({ children, onClear, count, total }) => (
  <div className="mb-3 space-y-2">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-2 sm:gap-3">{children}
      <button onClick={onClear} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md min-h-[44px] w-full sm:w-auto flex items-center justify-center">
        <X className="w-3 h-3 inline mr-1" />Limpar filtros
      </button>
    </div>
    <p className="text-xs text-gray-500">Exibindo {count} de {total} registros</p>
  </div>
);

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="w-full">
    <label className="block text-xs text-gray-500 mb-1">{label}</label>
    {children}
  </div>
);

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none min-h-[44px]';
const selectCls = `${inputCls} lg:min-w-[140px]`;

export const AdminTab: React.FC<AdminTabProps> = () => {
  // ─── Auth ─────────────────────────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // ─── Data ─────────────────────────────────────────────────────────────────
  const [geoRecords, setGeoRecords] = useState<GeoRecord[]>([]);
  const [fraudAttempts, setFraudAttempts] = useState<FraudAttempt[]>([]);
  const [bonusBlocks, setBonusBlocks] = useState<BonusBlock[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // ─── Section 1 filters ────────────────────────────────────────────────────
  const [geoDateStart, setGeoDateStart] = useState('');
  const [geoDateEnd, setGeoDateEnd] = useState('');
  const [geoEmployee, setGeoEmployee] = useState('');
  const [geoStatus, setGeoStatus] = useState<'' | 'inside' | 'outside'>('');

  // ─── Section 2 filters ────────────────────────────────────────────────────
  const [fraudDateStart, setFraudDateStart] = useState('');
  const [fraudDateEnd, setFraudDateEnd] = useState('');
  const [fraudEmployee, setFraudEmployee] = useState('');
  const [fraudType, setFraudType] = useState<'' | 'entry' | 'exit'>('');

  // ─── Section 3 filters ────────────────────────────────────────────────────
  const [blockEmployee, setBlockEmployee] = useState('');
  const [blockWeek, setBlockWeek] = useState('');
  const [blockActiveOnly, setBlockActiveOnly] = useState(true);

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const [cleanupMonths, setCleanupMonths] = useState(6);
  const [cleanupTables, setCleanupTables] = useState({ fraud: true, blocks: true, geo: true });
  const [cleanupPreview, setCleanupPreview] = useState<{ fraud_attempts: number; bonus_blocks: number; geo_records: number } | null>(null);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ─── Auto cleanup ────────────────────────────────────────────────────────
  const [autoConfig, setAutoConfig] = useState<AdminCleanupConfig | null>(null);
  const [autoConfigLoading, setAutoConfigLoading] = useState(true);
  const [autoInterval, setAutoInterval] = useState(6);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  // ─── Password ─────────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // ─── Face Recognition ────────────────────────────────────────────────────
  const [faceGlobalEnabled, setFaceGlobalEnabled] = useState(false);
  const [faceGlobalLoading, setFaceGlobalLoading] = useState(true);
  const [faceGlobalSaving, setFaceGlobalSaving] = useState(false);
  const [faceEmpSaving, setFaceEmpSaving] = useState<string | null>(null);
  const [faceResetting, setFaceResetting] = useState<string | null>(null);
  const [faceAttempts, setFaceAttempts] = useState<FaceAuthAttempt[]>([]);
  const [faceAttemptsLoading, setFaceAttemptsLoading] = useState(false);
  const [faceDateStart, setFaceDateStart] = useState('');
  const [faceDateEnd, setFaceDateEnd] = useState('');
  const [faceEmployeeFilter, setFaceEmployeeFilter] = useState('');
  const [faceResultFilter, setFaceResultFilter] = useState<'' | 'success' | 'fail'>('');

  // ─── Auth handler ─────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const valid = await verifyAdminSecret(password);
      if (valid) {
        setAuthenticated(true);
        setPassword('');
      } else {
        setAuthError('Senha incorreta');
      }
    } catch {
      setAuthError('Erro ao verificar senha');
    } finally {
      setAuthLoading(false);
    }
  };

  // ─── Data loader ──────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [geo, fraud, blocks, emps] = await Promise.all([
        getGeoRecords(),
        getFraudAttempts(),
        getBonusBlocks(),
        getAllEmployees(),
      ]);
      setGeoRecords(geo);
      setFraudAttempts(fraud);
      setBonusBlocks(blocks);
      setEmployees(emps);
    } catch (err) {
      console.error('Erro ao carregar dados admin:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCleanupConfig = async () => {
    setAutoConfigLoading(true);
    try {
      const cfg = await getAdminCleanupConfig();
      setAutoConfig(cfg);
      if (cfg) setAutoInterval(cfg.interval_months);
    } catch {
      // config table may be empty
    } finally {
      setAutoConfigLoading(false);
    }
  };

  const loadFaceConfig = async () => {
    setFaceGlobalLoading(true);
    try {
      const cfg = await getFaceRecognitionConfig();
      setFaceGlobalEnabled(cfg.enabled);
    } catch (err) {
      console.error('Erro ao carregar config facial:', err);
    } finally {
      setFaceGlobalLoading(false);
    }
  };

  const loadFaceAttempts = async () => {
    setFaceAttemptsLoading(true);
    try {
      const attempts = await getFaceAuthAttempts({
        startDate: faceDateStart || undefined,
        endDate: faceDateEnd || undefined,
        employeeId: faceEmployeeFilter || undefined,
        success: faceResultFilter === 'success' ? true : faceResultFilter === 'fail' ? false : undefined,
      });
      setFaceAttempts(attempts);
    } catch (err) {
      console.error('Erro ao carregar tentativas faciais:', err);
      toast.error('Erro ao carregar histórico facial');
    } finally {
      setFaceAttemptsLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    loadData();
    loadCleanupConfig();
    loadFaceConfig();
    loadFaceAttempts();
    runAutoCleanup().then(ran => {
      if (ran) {
        toast.success('Limpeza automática executada');
        loadData();
        loadCleanupConfig();
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    loadFaceAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceDateStart, faceDateEnd, faceEmployeeFilter, faceResultFilter]);

  // ─── Filtered data (client-side) ─────────────────────────────────────────
  const filteredGeo = useMemo(() => geoRecords.filter(r => {
    if (geoDateStart && r.date < geoDateStart) return false;
    if (geoDateEnd && r.date > geoDateEnd) return false;
    if (geoEmployee && r.employee_id !== geoEmployee) return false;
    if (geoStatus === 'inside' && r.geo_valid === false) return false;
    if (geoStatus === 'outside' && r.geo_valid !== false) return false;
    return true;
  }), [geoRecords, geoDateStart, geoDateEnd, geoEmployee, geoStatus]);

  const filteredFraud = useMemo(() => fraudAttempts.filter(f => {
    if (fraudDateStart && f.date < fraudDateStart) return false;
    if (fraudDateEnd && f.date > fraudDateEnd) return false;
    if (fraudEmployee && f.employee_id !== fraudEmployee) return false;
    if (fraudType && f.clock_type !== fraudType) return false;
    return true;
  }), [fraudAttempts, fraudDateStart, fraudDateEnd, fraudEmployee, fraudType]);

  const filteredBlocks = useMemo(() => {
    const today = getBrazilToday();
    return bonusBlocks.filter(b => {
      if (blockEmployee && b.employee_id !== blockEmployee) return false;
      if (blockWeek && b.week_start !== blockWeek) return false;
      if (blockActiveOnly && b.week_end < today) return false;
      return true;
    });
  }, [bonusBlocks, blockEmployee, blockWeek, blockActiveOnly]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleUnblock = async (employeeId: string, weekStart: string) => {
    setUnblockingId(employeeId);
    try {
      await unblockBonus(employeeId, weekStart);
      toast.success('Bonificação desbloqueada');
      const blocks = await getBonusBlocks();
      setBonusBlocks(blocks);
    } catch {
      toast.error('Erro ao desbloquear');
    } finally {
      setUnblockingId(null);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      toast.error('Senha deve ter pelo menos 4 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não conferem');
      return;
    }
    setSavingPassword(true);
    try {
      await updateAdminSecret(newPassword);
      toast.success('Senha alterada com sucesso');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Erro ao alterar senha');
    } finally {
      setSavingPassword(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const preview = await previewAdminCleanup(cleanupMonths);
      setCleanupPreview(preview);
    } catch {
      toast.error('Erro ao pré-visualizar');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (cleanupConfirmText !== 'CONFIRMAR') {
      toast.error('Digite CONFIRMAR para prosseguir');
      return;
    }
    setCleanupLoading(true);
    try {
      const result = await runAdminCleanup(cleanupMonths, cleanupTables, 'admin');
      toast.success(`Limpeza concluída: ${result.deleted} registros processados`);
      setCleanupPreview(null);
      setCleanupConfirmText('');
      loadData();
    } catch (err) {
      console.error('Erro ao executar limpeza:', err);
      toast.error(`Erro ao executar limpeza: ${err instanceof Error ? err.message : 'desconhecido'}`);
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleToggleAuto = async () => {
    setAutoSaving(true);
    try {
      const newEnabled = !autoConfig?.enabled;
      await updateAdminCleanupConfig(newEnabled, autoInterval);
      await loadCleanupConfig();
      toast.success(newEnabled ? 'Limpeza automática ativada' : 'Limpeza automática desativada');
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setAutoSaving(false);
    }
  };

  const handleSaveAutoInterval = async () => {
    setAutoSaving(true);
    try {
      await updateAdminCleanupConfig(autoConfig?.enabled ?? false, autoInterval);
      await loadCleanupConfig();
      toast.success('Intervalo atualizado');
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setAutoSaving(false);
    }
  };

  const handleRunAutoNow = async () => {
    setAutoRunning(true);
    try {
      const months = autoConfig?.interval_months ?? 6;
      const result = await runAdminCleanup(months, { fraud: true, blocks: true, geo: true }, 'admin-manual');
      const now = new Date();
      const newNext = new Date(now);
      newNext.setMonth(newNext.getMonth() + months);
      await updateAdminCleanupConfig(autoConfig?.enabled ?? true, months);
      await loadCleanupConfig();
      toast.success(`Executado: ${result.deleted} registros processados`);
      loadData();
    } catch {
      toast.error('Erro ao executar');
    } finally {
      setAutoRunning(false);
    }
  };

  const mapsLink = (lat: number | null, lon: number | null) => {
    if (lat == null || lon == null) return null;
    return `https://maps.google.com/?q=${lat},${lon}`;
  };

  const handleToggleFaceGlobal = async () => {
    const next = !faceGlobalEnabled;
    setFaceGlobalSaving(true);
    try {
      await setFaceRecognitionGlobal(next, 'admin');
      setFaceGlobalEnabled(next);
      toast.success(next ? 'Reconhecimento facial ativado globalmente' : 'Reconhecimento facial desativado');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar configuração');
    } finally {
      setFaceGlobalSaving(false);
    }
  };

  const handleToggleFaceEmployee = async (employeeId: string, currentEnabled: boolean) => {
    setFaceEmpSaving(employeeId);
    try {
      await setFaceRecognitionForEmployee(employeeId, !currentEnabled, 'admin');
      setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, face_recognition_enabled: !currentEnabled } : e));
      toast.success(!currentEnabled ? 'Ativado para o funcionário' : 'Desativado para o funcionário');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar funcionário');
    } finally {
      setFaceEmpSaving(null);
    }
  };

  const handleResetFace = async (employeeId: string, employeeName: string) => {
    if (!confirm(`Resetar cadastro facial de ${employeeName}?\n\nO funcionário precisará recadastrar o rosto no próximo acesso.`)) return;
    setFaceResetting(employeeId);
    try {
      await resetFaceForEmployee(employeeId, 'admin');
      setEmployees(prev => prev.map(e => e.id === employeeId ? {
        ...e,
        face_registered: false,
        face_descriptor: null,
        face_photo_url: null,
        face_reset_requested: true,
        face_registered_at: null,
      } : e));
      toast.success(`Cadastro facial de ${employeeName} resetado`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao resetar cadastro facial');
    } finally {
      setFaceResetting(null);
    }
  };

  const EmployeeSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      <option value="">Todos</option>
      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );

  // ─── Auth screen ──────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="max-w-[95vw] sm:max-w-sm mx-auto mt-8 sm:mt-12 px-2">
        <div className="bg-white p-6 sm:p-8 rounded-lg shadow text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">Acesso restrito</h2>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            placeholder="Senha"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg mb-3 focus:border-blue-500 focus:outline-none min-h-[48px]"
          />
          {authError && <p className="text-sm text-red-600 mb-3">{authError}</p>}
          <button
            onClick={handleAuth}
            disabled={authLoading || !password}
            className="w-full py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors min-h-[48px]"
          >
            {authLoading ? 'Verificando...' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Main panel ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-base sm:text-lg font-semibold text-gray-800">Painel Admin</h2>
        <button onClick={loadData} disabled={loading}
          className="flex items-center justify-center gap-1 px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors min-h-[44px] w-full sm:w-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recarregar
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Geo Records                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-3">
          <MapPin className="w-5 h-5 text-blue-600" />
          Registros de Geolocalização
        </h3>

        <FilterBar
          count={filteredGeo.length}
          total={geoRecords.length}
          onClear={() => { setGeoDateStart(''); setGeoDateEnd(''); setGeoEmployee(''); setGeoStatus(''); }}
        >
          <FilterField label="Data início">
            <input type="date" value={geoDateStart} onChange={e => setGeoDateStart(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Data fim">
            <input type="date" value={geoDateEnd} onChange={e => setGeoDateEnd(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Funcionário">
            <EmployeeSelect value={geoEmployee} onChange={setGeoEmployee} />
          </FilterField>
          <FilterField label="Status">
            <select value={geoStatus} onChange={e => setGeoStatus(e.target.value as typeof geoStatus)} className={selectCls}>
              <option value="">Todos</option>
              <option value="inside">Dentro da área</option>
              <option value="outside">Fora da área</option>
            </select>
          </FilterField>
        </FilterBar>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : filteredGeo.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum registro encontrado</p>
        ) : (
          <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Data</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Entrada</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Saída</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Distância</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Status</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Mapa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredGeo.map(r => {
                  const entryLink = mapsLink(r.entry_latitude, r.entry_longitude);
                  const exitLink = mapsLink(r.exit_latitude, r.exit_longitude);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{formatDateBR(r.date)}</td>
                      <td className="px-3 py-2 text-gray-800">{r.employee_name}</td>
                      <td className="px-3 py-2 text-gray-600">{formatTime(r.entry_time)}</td>
                      <td className="px-3 py-2 text-gray-600">{formatTime(r.exit_time_full)}</td>
                      <td className="px-3 py-2 text-gray-700">{r.geo_distance_meters != null ? `${r.geo_distance_meters}m` : '-'}</td>
                      <td className="px-3 py-2">
                        {r.geo_valid === false ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Fora</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Dentro</span>
                        )}
                      </td>
                      <td className="px-3 py-2 space-x-1">
                        {entryLink && (
                          <a href={entryLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100">
                            E
                          </a>
                        )}
                        {exitLink && (
                          <a href={exitLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-xs hover:bg-orange-100">
                            S
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filteredGeo.map(r => {
              const entryLink = mapsLink(r.entry_latitude, r.entry_longitude);
              const exitLink = mapsLink(r.exit_latitude, r.exit_longitude);
              return (
                <div key={r.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 break-words">{r.employee_name}</div>
                      <div className="text-xs text-gray-500">{formatDateBR(r.date)}</div>
                    </div>
                    {r.geo_valid === false ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">Fora</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 whitespace-nowrap">Dentro</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-green-50 rounded p-2">
                      <span className="text-gray-500 block">Entrada</span>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-gray-800">{formatTime(r.entry_time)}</span>
                        {entryLink && (
                          <a href={entryLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white text-blue-700 rounded hover:bg-blue-100 border border-blue-200">
                            <MapPin className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded p-2">
                      <span className="text-gray-500 block">Saída</span>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-gray-800">{formatTime(r.exit_time_full)}</span>
                        {exitLink && (
                          <a href={exitLink} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white text-orange-700 rounded hover:bg-orange-100 border border-orange-200">
                            <MapPin className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    <strong>Distância:</strong> {r.geo_distance_meters != null ? `${r.geo_distance_meters}m` : '-'}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1B: Face Recognition — Global                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-3">
          <ScanFace className="w-5 h-5 text-purple-600" />
          Reconhecimento Facial — Configuração Global
        </h3>

        {faceGlobalLoading ? (
          <p className="text-sm text-gray-500">Carregando configuração...</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">Reconhecimento facial ativo para todos</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {faceGlobalEnabled
                    ? 'Funcionários precisam passar pela validação facial ao bater ponto.'
                    : 'Funcionários podem bater ponto sem validação facial.'}
                </p>
              </div>
              <button
                onClick={handleToggleFaceGlobal}
                disabled={faceGlobalSaving}
                className={`relative inline-flex items-center h-8 rounded-full w-14 transition-colors disabled:opacity-50 flex-shrink-0 ${
                  faceGlobalEnabled ? 'bg-green-600' : 'bg-gray-300'
                }`}
                aria-label="Alternar reconhecimento facial global"
              >
                <span
                  className={`inline-block w-6 h-6 transform bg-white rounded-full shadow transition-transform ${
                    faceGlobalEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {!faceGlobalEnabled && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Atenção: com o reconhecimento facial desativado, qualquer pessoa pode bater ponto apenas com o PIN.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1C: Face Recognition — Per Employee                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-3">
          <ScanFace className="w-5 h-5 text-purple-600" />
          Controle por Funcionário
        </h3>

        {employees.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum funcionário cadastrado</p>
        ) : (
          <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Face Cadastrada</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Reconhecimento</th>
                  <th className="px-3 py-2 text-right text-gray-500 uppercase font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map(e => {
                  const enabled = !!e.face_recognition_enabled;
                  const registered = !!e.face_registered;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{e.name}</td>
                      <td className="px-3 py-2">
                        {registered ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Sim
                            {e.face_registered_at && (
                              <span className="text-gray-500 ml-1">
                                ({new Date(e.face_registered_at).toLocaleDateString('pt-BR')})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <XCircle className="w-3.5 h-3.5" />
                            Não
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleToggleFaceEmployee(e.id, enabled)}
                          disabled={faceEmpSaving === e.id}
                          className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors disabled:opacity-50 ${
                            enabled ? 'bg-green-600' : 'bg-gray-300'
                          }`}
                          aria-label="Alternar reconhecimento facial"
                        >
                          <span
                            className={`inline-block w-5 h-5 transform bg-white rounded-full transition-transform ${
                              enabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {registered && (
                          <button
                            onClick={() => handleResetFace(e.id, e.name)}
                            disabled={faceResetting === e.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-md hover:bg-amber-200 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {faceResetting === e.id ? '...' : 'Reset Facial'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {employees.map(e => {
              const enabled = !!e.face_recognition_enabled;
              const registered = !!e.face_registered;
              return (
                <div key={e.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 break-words">{e.name}</div>
                      <div className="mt-1">
                        {registered ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Face cadastrada
                            {e.face_registered_at && (
                              <span className="text-gray-500 ml-1">
                                ({new Date(e.face_registered_at).toLocaleDateString('pt-BR')})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <XCircle className="w-3.5 h-3.5" />
                            Sem cadastro facial
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleFaceEmployee(e.id, enabled)}
                      disabled={faceEmpSaving === e.id}
                      className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors disabled:opacity-50 flex-shrink-0 ${
                        enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                      aria-label="Alternar reconhecimento facial"
                    >
                      <span
                        className={`inline-block w-5 h-5 transform bg-white rounded-full transition-transform ${
                          enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  {registered && (
                    <button
                      onClick={() => handleResetFace(e.id, e.name)}
                      disabled={faceResetting === e.id}
                      className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 bg-amber-100 text-amber-700 text-sm font-medium rounded-md hover:bg-amber-200 disabled:opacity-50 transition-colors min-h-[44px]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {faceResetting === e.id ? 'Resetando...' : 'Reset Facial'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1D: Face Recognition — History                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-3">
          <ScanFace className="w-5 h-5 text-purple-600" />
          Histórico de Tentativas Faciais
        </h3>

        {(() => {
          const total = faceAttempts.length;
          const successes = faceAttempts.filter(a => a.success).length;
          const failures = total - successes;
          const rate = total > 0 ? ((successes / total) * 100).toFixed(1) : '0.0';
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-500">Total</div>
                <div className="text-xl font-bold text-gray-800">{total}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <div className="text-xs text-green-700">Sucessos</div>
                <div className="text-xl font-bold text-green-700">{successes}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <div className="text-xs text-red-700">Falhas</div>
                <div className="text-xl font-bold text-red-700">{failures}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="text-xs text-blue-700">Taxa de Sucesso</div>
                <div className="text-xl font-bold text-blue-700">{rate}%</div>
              </div>
            </div>
          );
        })()}

        <FilterBar
          count={faceAttempts.length}
          total={faceAttempts.length}
          onClear={() => { setFaceDateStart(''); setFaceDateEnd(''); setFaceEmployeeFilter(''); setFaceResultFilter(''); }}
        >
          <FilterField label="Data início">
            <input type="date" value={faceDateStart} onChange={e => setFaceDateStart(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Data fim">
            <input type="date" value={faceDateEnd} onChange={e => setFaceDateEnd(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Funcionário">
            <EmployeeSelect value={faceEmployeeFilter} onChange={setFaceEmployeeFilter} />
          </FilterField>
          <FilterField label="Resultado">
            <select value={faceResultFilter} onChange={e => setFaceResultFilter(e.target.value as typeof faceResultFilter)} className={selectCls}>
              <option value="">Todos</option>
              <option value="success">Sucesso</option>
              <option value="fail">Falha</option>
            </select>
          </FilterField>
        </FilterBar>

        {faceAttemptsLoading ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : faceAttempts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma tentativa registrada</p>
        ) : (
          <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Data/Hora</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Resultado</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Confiança</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {faceAttempts.map(a => {
                  const dt = new Date(a.attempted_at);
                  const dateStr = dt.toLocaleDateString('pt-BR');
                  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <tr key={a.id} className={a.success ? 'hover:bg-green-50' : 'hover:bg-red-50'}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{dateStr} {timeStr}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{a.employee_name}</td>
                      <td className="px-3 py-2">
                        {a.clock_type ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${a.clock_type === 'entry' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {a.clock_type === 'entry' ? 'Entrada' : 'Saída'}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {a.success ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Sucesso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3" />
                            Falha
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {a.confidence != null ? `${(a.confidence * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {faceAttempts.map(a => {
              const dt = new Date(a.attempted_at);
              const dateStr = dt.toLocaleDateString('pt-BR');
              const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={a.id} className={`border rounded-lg p-3 space-y-2 ${a.success ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 break-words">{a.employee_name}</div>
                      <div className="text-xs text-gray-500">{dateStr} · {timeStr}</div>
                    </div>
                    {a.success ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" />
                        Sucesso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">
                        <XCircle className="w-3 h-3" />
                        Falha
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded p-2 border border-gray-100">
                      <span className="text-gray-500 block">Tipo</span>
                      <span className="text-gray-800 font-medium">
                        {a.clock_type === 'entry' ? 'Entrada' : a.clock_type === 'exit' ? 'Saída' : '—'}
                      </span>
                    </div>
                    <div className="bg-white rounded p-2 border border-gray-100">
                      <span className="text-gray-500 block">Confiança</span>
                      <span className="text-gray-800 font-medium">
                        {a.confidence != null ? `${(a.confidence * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Fraud Attempts                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          Tentativas Suspeitas
        </h3>

        <FilterBar
          count={filteredFraud.length}
          total={fraudAttempts.length}
          onClear={() => { setFraudDateStart(''); setFraudDateEnd(''); setFraudEmployee(''); setFraudType(''); }}
        >
          <FilterField label="Data início">
            <input type="date" value={fraudDateStart} onChange={e => setFraudDateStart(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Data fim">
            <input type="date" value={fraudDateEnd} onChange={e => setFraudDateEnd(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Funcionário">
            <EmployeeSelect value={fraudEmployee} onChange={setFraudEmployee} />
          </FilterField>
          <FilterField label="Tipo">
            <select value={fraudType} onChange={e => setFraudType(e.target.value as typeof fraudType)} className={selectCls}>
              <option value="">Todos</option>
              <option value="entry">Entrada</option>
              <option value="exit">Saída</option>
            </select>
          </FilterField>
        </FilterBar>

        {filteredFraud.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma tentativa encontrada</p>
        ) : (
          <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Data</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Distância</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Coordenadas</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Mapa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFraud.map(f => {
                  const link = mapsLink(f.latitude, f.longitude);
                  return (
                    <tr key={f.id} className="hover:bg-red-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{formatDateBR(f.date)}</td>
                      <td className="px-3 py-2 text-gray-800">{f.employee_name}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${f.clock_type === 'entry' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                          {f.clock_type === 'entry' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{f.distance_meters != null ? `${f.distance_meters}m` : 'negada'}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono">
                        {f.latitude != null ? `${Number(f.latitude).toFixed(6)}, ${Number(f.longitude).toFixed(6)}` : '-'}
                      </td>
                      <td className="px-3 py-2">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100">
                            <MapPin className="w-3 h-3" /> Ver
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filteredFraud.map(f => {
              const link = mapsLink(f.latitude, f.longitude);
              return (
                <div key={f.id} className="border border-red-200 bg-red-50/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 break-words">{f.employee_name}</div>
                      <div className="text-xs text-gray-500">{formatDateBR(f.date)}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${f.clock_type === 'entry' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {f.clock_type === 'entry' ? 'Entrada' : 'Saída'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded p-2 border border-gray-100">
                      <span className="text-gray-500 block">Distância</span>
                      <span className="text-gray-800 font-medium">{f.distance_meters != null ? `${f.distance_meters}m` : 'negada'}</span>
                    </div>
                    <div className="bg-white rounded p-2 border border-gray-100">
                      <span className="text-gray-500 block">Coordenadas</span>
                      <span className="text-gray-800 font-mono text-[10px] break-all">
                        {f.latitude != null ? `${Number(f.latitude).toFixed(4)}, ${Number(f.longitude).toFixed(4)}` : '-'}
                      </span>
                    </div>
                  </div>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 min-h-[44px]">
                      <MapPin className="w-4 h-4" />
                      Ver no Mapa
                    </a>
                  ) : (
                    <span className="block text-center text-xs text-gray-400">Sem localização registrada</span>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Bonus Blocks                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-3">
          <ShieldOff className="w-5 h-5 text-amber-600" />
          Bloqueios de Bonificação
        </h3>

        <FilterBar
          count={filteredBlocks.length}
          total={bonusBlocks.length}
          onClear={() => { setBlockEmployee(''); setBlockWeek(''); setBlockActiveOnly(true); }}
        >
          <FilterField label="Funcionário">
            <EmployeeSelect value={blockEmployee} onChange={setBlockEmployee} />
          </FilterField>
          <FilterField label="Semana (início)">
            <input type="date" value={blockWeek} onChange={e => setBlockWeek(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="Exibir">
            <select value={blockActiveOnly ? 'active' : 'all'} onChange={e => setBlockActiveOnly(e.target.value === 'active')} className={selectCls}>
              <option value="active">Apenas ativos</option>
              <option value="all">Todos</option>
            </select>
          </FilterField>
        </FilterBar>

        {filteredBlocks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum bloqueio encontrado</p>
        ) : (
          <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Funcionário</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Semana</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Motivo</th>
                  <th className="px-3 py-2 text-left text-gray-500 uppercase font-medium">Data do bloqueio</th>
                  <th className="px-3 py-2 text-right text-gray-500 uppercase font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBlocks.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{b.employee_name}</td>
                    <td className="px-3 py-2 text-gray-600">{formatDateBR(b.week_start)} — {formatDateBR(b.week_end)}</td>
                    <td className="px-3 py-2 text-gray-700">{b.reason}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {new Date(b.created_at).toLocaleDateString('pt-BR')} {new Date(b.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleUnblock(b.employee_id, b.week_start)}
                        disabled={unblockingId === b.employee_id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-md hover:bg-green-200 disabled:opacity-50 transition-colors"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        {unblockingId === b.employee_id ? '...' : 'Desbloquear'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filteredBlocks.map(b => (
              <div key={b.id} className="border border-amber-200 bg-amber-50/30 rounded-lg p-3 space-y-2">
                <div>
                  <div className="text-sm font-semibold text-gray-900 break-words">{b.employee_name}</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    <strong>Semana:</strong> {formatDateBR(b.week_start)} — {formatDateBR(b.week_end)}
                  </div>
                </div>
                <div className="text-xs text-gray-700 break-words bg-white rounded p-2 border border-gray-100">
                  <strong className="block text-gray-500 mb-0.5">Motivo:</strong>
                  {b.reason}
                </div>
                <div className="text-xs text-gray-500">
                  <strong>Bloqueado em:</strong> {new Date(b.created_at).toLocaleDateString('pt-BR')} {new Date(b.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <button
                  onClick={() => handleUnblock(b.employee_id, b.week_start)}
                  disabled={unblockingId === b.employee_id}
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-md hover:bg-green-200 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  <Unlock className="w-4 h-4" />
                  {unblockingId === b.employee_id ? 'Desbloqueando...' : 'Desbloquear'}
                </button>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: Manual Cleanup                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-4">
          <Trash2 className="w-5 h-5 text-gray-600" />
          Limpeza de Dados
        </h3>

        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Limpar registros anteriores a:</label>
            <select value={cleanupMonths} onChange={e => { setCleanupMonths(Number(e.target.value)); setCleanupPreview(null); }} className={selectCls}>
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>1 ano</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tabelas a limpar:</label>
            <div className="flex flex-col gap-2">
              {[
                { key: 'fraud' as const, label: 'geo_fraud_attempts' },
                { key: 'blocks' as const, label: 'bonus_blocks (expirados)' },
                { key: 'geo' as const, label: 'geo records no attendance (só coords)' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 min-h-[40px] break-words">
                  <input
                    type="checkbox"
                    checked={cleanupTables[key]}
                    onChange={e => { setCleanupTables(prev => ({ ...prev, [key]: e.target.checked })); setCleanupPreview(null); }}
                    className="rounded border-gray-300 w-5 h-5 flex-shrink-0"
                  />
                  <span className="break-all">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handlePreview}
              disabled={previewLoading || (!cleanupTables.fraud && !cleanupTables.blocks && !cleanupTables.geo)}
              className="flex items-center justify-center gap-1 px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-200 disabled:opacity-50 transition-colors min-h-[44px] w-full sm:w-auto"
            >
              {previewLoading ? 'Calculando...' : 'Pré-visualizar'}
            </button>
          </div>

          {cleanupPreview && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-amber-800">Registros que serão processados:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-center">
                {cleanupTables.fraud && (
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-lg font-bold text-red-600">{cleanupPreview.fraud_attempts}</p>
                    <p className="text-xs text-gray-500">Fraudes</p>
                  </div>
                )}
                {cleanupTables.blocks && (
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-lg font-bold text-amber-600">{cleanupPreview.bonus_blocks}</p>
                    <p className="text-xs text-gray-500">Bloqueios</p>
                  </div>
                )}
                {cleanupTables.geo && (
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-lg font-bold text-blue-600">{cleanupPreview.geo_records}</p>
                    <p className="text-xs text-gray-500">Geo coords</p>
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-amber-800">
                Total: {(cleanupTables.fraud ? cleanupPreview.fraud_attempts : 0) + (cleanupTables.blocks ? cleanupPreview.bonus_blocks : 0) + (cleanupTables.geo ? cleanupPreview.geo_records : 0)} registros
              </p>

              <div className="pt-2 border-t border-amber-200">
                <label className="block text-sm text-amber-800 mb-1">
                  Digite <span className="font-bold">CONFIRMAR</span> para executar:
                </label>
                <input
                  type="text"
                  value={cleanupConfirmText}
                  onChange={e => setCleanupConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm focus:border-red-500 focus:outline-none mb-2"
                />
                <button
                  onClick={handleCleanup}
                  disabled={cleanupLoading || cleanupConfirmText !== 'CONFIRMAR'}
                  className="w-full flex items-center justify-center gap-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {cleanupLoading ? 'Executando limpeza...' : 'Confirmar Limpeza'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: Auto Cleanup                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-4">
          <Settings className="w-5 h-5 text-gray-600" />
          Limpeza Automática
        </h3>

        {autoConfigLoading ? (
          <p className="text-sm text-gray-500">Carregando configuração...</p>
        ) : (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              {autoConfig?.enabled ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Ativa</span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Inativa</span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
              <FilterField label="Intervalo">
                <select value={autoInterval} onChange={e => setAutoInterval(Number(e.target.value))} className={selectCls}>
                  <option value={3}>A cada 3 meses</option>
                  <option value={6}>A cada 6 meses</option>
                  <option value={12}>A cada 12 meses</option>
                </select>
              </FilterField>
              {autoInterval !== (autoConfig?.interval_months ?? 6) && (
                <button onClick={handleSaveAutoInterval} disabled={autoSaving}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors min-h-[44px] w-full sm:w-auto">
                  Salvar
                </button>
              )}
            </div>

            {autoConfig?.last_cleanup_at && (
              <p className="text-sm text-gray-600">
                Última limpeza: <span className="font-medium">{new Date(autoConfig.last_cleanup_at).toLocaleDateString('pt-BR')}</span>
              </p>
            )}
            {autoConfig?.next_cleanup_at && autoConfig.enabled && (
              <p className="text-sm text-gray-600">
                Próxima limpeza: <span className="font-medium">{new Date(autoConfig.next_cleanup_at).toLocaleDateString('pt-BR')}</span>
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
              <button
                onClick={handleToggleAuto}
                disabled={autoSaving}
                className={`flex items-center justify-center gap-1 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 transition-colors min-h-[44px] w-full sm:w-auto ${
                  autoConfig?.enabled
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {autoConfig?.enabled ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={handleRunAutoNow}
                disabled={autoRunning}
                className="flex items-center justify-center gap-1 px-4 py-2 bg-amber-100 text-amber-700 text-sm font-medium rounded-md hover:bg-amber-200 disabled:opacity-50 transition-colors min-h-[44px] w-full sm:w-auto"
              >
                <Play className="w-4 h-4" />
                {autoRunning ? 'Executando...' : 'Executar agora'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: Change Password                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-4 sm:p-5 rounded-lg shadow max-w-md">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-4">
          <Key className="w-5 h-5 text-gray-600" />
          Alterar Senha Admin
        </h3>
        <div className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Nova senha"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none min-h-[44px]"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nova senha"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none min-h-[44px]"
          />
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword}
            className="w-full py-3 bg-gray-800 text-white text-sm font-semibold rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {savingPassword ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </div>
      </div>
    </div>
  );
};
