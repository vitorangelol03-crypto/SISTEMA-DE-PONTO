import React, { useState, useEffect } from 'react';
import { Lock, MapPin, AlertTriangle, ShieldOff, Key, RefreshCw, Unlock, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  verifyAdminSecret,
  updateAdminSecret,
  getGeoRecords,
  getFraudAttempts,
  getBonusBlocks,
  unblockBonus,
  getAllEmployees,
  GeoRecord,
  FraudAttempt,
  BonusBlock,
  Employee,
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

export const AdminTab: React.FC<AdminTabProps> = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [geoRecords, setGeoRecords] = useState<GeoRecord[]>([]);
  const [fraudAttempts, setFraudAttempts] = useState<FraudAttempt[]>([]);
  const [bonusBlocks, setBonusBlocks] = useState<BonusBlock[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const [filterDate, setFilterDate] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const filters: { startDate?: string; endDate?: string; employeeId?: string } = {};
      if (filterDate) {
        filters.startDate = filterDate;
        filters.endDate = filterDate;
      }
      if (filterEmployee) filters.employeeId = filterEmployee;

      const [geo, fraud, blocks, emps] = await Promise.all([
        getGeoRecords(filters),
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

  useEffect(() => {
    if (authenticated) loadData();
  }, [authenticated]);

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

  const mapsLink = (lat: number | null, lon: number | null) => {
    if (lat == null || lon == null) return null;
    return `https://maps.google.com/?q=${lat},${lon}`;
  };

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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data</label>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Funcionário</label>
          <select
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Todos</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1 px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors"
        >
          <Search className="w-4 h-4" />
          Filtrar
        </button>
        <button
          onClick={() => { setFilterDate(''); setFilterEmployee(''); }}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Limpar
        </button>
      </div>

      {/* SECTION 1: Geo Records */}
      <div className="bg-white p-5 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800">
            <MapPin className="w-5 h-5 text-blue-600" />
            Registros de Geolocalização
            <span className="text-xs text-gray-400 font-normal">({geoRecords.length})</span>
          </h3>
          <button onClick={loadData} className="text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : geoRecords.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum registro com geolocalização</p>
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
                {geoRecords.map(r => {
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

      {/* SECTION 2: Fraud Attempts */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          Tentativas Suspeitas
          <span className="text-xs text-gray-400 font-normal">({fraudAttempts.length})</span>
        </h3>

        {fraudAttempts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma tentativa registrada</p>
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
                {fraudAttempts.map(f => {
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

      {/* SECTION 3: Bonus Blocks */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h3 className="text-base font-semibold flex items-center gap-2 text-gray-800 mb-4">
          <ShieldOff className="w-5 h-5 text-amber-600" />
          Bloqueios de Bonificação
          <span className="text-xs text-gray-400 font-normal">({bonusBlocks.length})</span>
        </h3>

        {bonusBlocks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum bloqueio ativo</p>
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
                {bonusBlocks.map(b => (
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

      {/* SECTION 4: Change Password */}
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
