import React, { useState, useEffect, useMemo } from 'react';
import { Lock, MapPin, AlertTriangle, ShieldOff, Key, RefreshCw, Unlock, Trash2, Settings, Play, X } from 'lucide-react';
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
  GeoRecord,
  FraudAttempt,
  BonusBlock,
  Employee,
  AdminCleanupConfig,
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
    <div className="flex flex-wrap items-end gap-3">{children}
      <button onClick={onClear} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md">
        <X className="w-3 h-3 inline mr-1" />Limpar filtros
      </button>
    </div>
    <p className="text-xs text-gray-500">Exibindo {count} de {total} registros</p>
  </div>
);

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1">{label}</label>
    {children}
  </div>
);

const inputCls = 'px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none';
const selectCls = `${inputCls} min-w-[140px]`;

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

  useEffect(() => {
    if (!authenticated) return;
    loadData();
    loadCleanupConfig();
    runAutoCleanup().then(ran => {
      if (ran) {
        toast.success('Limpeza automática executada');
        loadData();
        loadCleanupConfig();
      }
    }).catch(() => {});
  }, [authenticated]);

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

  const EmployeeSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      <option value="">Todos</option>
      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );

  // ─── Auth screen ──────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto mt-12">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Acesso restrito</h2>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            placeholder="Senha"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg mb-3 focus:border-blue-500 focus:outline-none"
          />
          {authError && <p className="text-sm text-red-600 mb-3">{authError}</p>}
          <button
            onClick={handleAuth}
            disabled={authLoading || !password}
            className="w-full py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            {authLoading ? 'Verificando...' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Main panel ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Painel Admin</h2>
        <button onClick={loadData} disabled={loading}
          className="flex items-center gap-1 px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recarregar
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Geo Records                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-5 rounded-lg shadow">
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
          <div className="overflow-x-auto">
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
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Fraud Attempts                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-5 rounded-lg shadow">
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
          <div className="overflow-x-auto">
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
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Bonus Blocks                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-5 rounded-lg shadow">
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
          <div className="overflow-x-auto">
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
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: Manual Cleanup                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-5 rounded-lg shadow">
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
            <div className="space-y-2">
              {[
                { key: 'fraud' as const, label: 'geo_fraud_attempts' },
                { key: 'blocks' as const, label: 'bonus_blocks (expirados)' },
                { key: 'geo' as const, label: 'geo records no attendance (só coords)' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={cleanupTables[key]}
                    onChange={e => { setCleanupTables(prev => ({ ...prev, [key]: e.target.checked })); setCleanupPreview(null); }}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={previewLoading || (!cleanupTables.fraud && !cleanupTables.blocks && !cleanupTables.geo)}
              className="flex items-center gap-1 px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-200 disabled:opacity-50 transition-colors"
            >
              {previewLoading ? 'Calculando...' : 'Pré-visualizar'}
            </button>
          </div>

          {cleanupPreview && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-amber-800">Registros que serão processados:</p>
              <div className="grid grid-cols-3 gap-3 text-center">
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
      <div className="bg-white p-5 rounded-lg shadow">
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

            <div className="flex items-end gap-3">
              <FilterField label="Intervalo">
                <select value={autoInterval} onChange={e => setAutoInterval(Number(e.target.value))} className={selectCls}>
                  <option value={3}>A cada 3 meses</option>
                  <option value={6}>A cada 6 meses</option>
                  <option value={12}>A cada 12 meses</option>
                </select>
              </FilterField>
              {autoInterval !== (autoConfig?.interval_months ?? 6) && (
                <button onClick={handleSaveAutoInterval} disabled={autoSaving}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
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

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleToggleAuto}
                disabled={autoSaving}
                className={`flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 transition-colors ${
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
                className="flex items-center gap-1 px-4 py-2 bg-amber-100 text-amber-700 text-sm font-medium rounded-md hover:bg-amber-200 disabled:opacity-50 transition-colors"
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
      <div className="bg-white p-5 rounded-lg shadow max-w-md">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nova senha"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword}
            className="w-full py-2 bg-gray-800 text-white text-sm font-semibold rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            {savingPassword ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </div>
      </div>
    </div>
  );
};
