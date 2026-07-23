/**
 * App do ENTREGADOR — rota publica /driver (molde da tela /clock: sem login de painel).
 * Fluxo: login (CPF+senha) -> troca de senha (obrigatoria no 1o acesso) -> lista de
 * espelhos por quinzena -> abrir o PDF (link assinado, TTL curto, gerado na portaria).
 * Toda a seguranca vive no servidor (driver-public-api). Sessao em localStorage.
 */
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Truck, LogOut, Eye, FileText, KeyRound } from 'lucide-react';
import {
  driverLogin, driverChangePassword, driverMyMirrors, driverMirrorUrl,
  getDriverToken, getDriverName, setDriverSession, clearDriverSession,
  DriverApiError, type DriverMirror,
} from '../../services/driverApp';

type Screen = 'login' | 'change' | 'mirrors';

const Spinner = ({ light = false }: { light?: boolean }) => (
  <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${light ? 'border-white' : 'border-orange-600'}`} />
);

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}
function errStatus(e: unknown): number {
  return e instanceof DriverApiError ? e.status : -1;
}
function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function DriverApp() {
  const [screen, setScreen] = useState<Screen>('login');
  const [token, setToken] = useState<string | null>(() => getDriverToken());
  const [driverName, setDriverName] = useState<string>(() => getDriverName() ?? '');
  const [busy, setBusy] = useState(false);

  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  const [mirrors, setMirrors] = useState<DriverMirror[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const logout = useCallback(() => {
    clearDriverSession();
    setToken(null); setDriverName(''); setMirrors(null);
    setCpf(''); setPassword(''); setNewPass(''); setConfirmPass('');
    setScreen('login');
  }, []);

  const loadMirrors = useCallback(async (tk: string) => {
    setMirrors(null);
    try {
      const { mirrors } = await driverMyMirrors(tk);
      setMirrors(mirrors);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else { setMirrors([]); toast.error(errMsg(e, 'Nao consegui carregar os espelhos.')); }
    }
  }, [logout]);

  // Reabriu o app com sessao salva: vai direto pros espelhos.
  useEffect(() => {
    if (token) { setScreen('mirrors'); loadMirrors(token); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) { toast.error('Digite os 11 numeros do seu CPF.'); return; }
    if (!password) { toast.error('Digite sua senha.'); return; }
    setBusy(true);
    try {
      const res = await driverLogin(digits, password);
      setDriverSession(res.token, res.driver.name);
      setToken(res.token); setDriverName(res.driver.name); setPassword('');
      if (res.mustChange) { setScreen('change'); toast('Crie uma nova senha para continuar.', { icon: '🔑' }); }
      else { setScreen('mirrors'); loadMirrors(res.token); }
    } catch (e) {
      toast.error(errMsg(e, 'Nao consegui entrar. Confira o CPF e a senha.'));
    } finally { setBusy(false); }
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPass.length < 4) { toast.error('A senha precisa ter pelo menos 4 caracteres.'); return; }
    if (newPass === '1234') { toast.error('Escolha uma senha diferente de 1234.'); return; }
    if (newPass !== confirmPass) { toast.error('As duas senhas precisam ser iguais.'); return; }
    if (!token) { logout(); return; }
    setBusy(true);
    try {
      const res = await driverChangePassword(newPass, token);
      setDriverSession(res.token, driverName);
      setToken(res.token); setNewPass(''); setConfirmPass('');
      toast.success('Senha alterada com sucesso!');
      setScreen('mirrors'); loadMirrors(res.token);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else toast.error(errMsg(e, 'Nao consegui trocar a senha.'));
    } finally { setBusy(false); }
  }

  async function handleView(pubId: string) {
    if (!token) { logout(); return; }
    setOpening(pubId);
    try {
      const { url } = await driverMirrorUrl(pubId, token);
      window.open(url, '_blank', 'noopener,noreferrer');
      loadMirrors(token); // atualiza o marcador de "visto"
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else toast.error(errMsg(e, 'Nao consegui abrir o espelho.'));
    } finally { setOpening(null); }
  }

  // ─── LOGIN ──────────────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center">
              <Truck className="text-white" size={30} />
            </div>
            <h1 className="text-xl font-bold text-gray-800">Meus Pagamentos</h1>
            <p className="text-sm text-gray-500">Entre com seu CPF para ver seus espelhos.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
            <input
              value={cpf} onChange={(e) => setCpf(e.target.value)}
              inputMode="numeric" autoComplete="username" maxLength={14}
              placeholder="Somente numeros"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="Sua senha (primeira vez: 1234)"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Spinner light /> : 'Entrar'}
          </button>
          <p className="text-xs text-center text-gray-400">No primeiro acesso a senha e 1234 e voce troca em seguida.</p>
        </form>
      </div>
    );
  }

  // ─── TROCAR SENHA (obrigatoria no 1o acesso) ─────────────────────────────────
  if (screen === 'change') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handleChange} className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center">
              <KeyRound className="text-white" size={28} />
            </div>
            <h1 className="text-xl font-bold text-gray-800">Crie sua senha</h1>
            <p className="text-sm text-gray-500">
              {driverName ? `Ola, ${driverName.split(/\s+/)[0]}! ` : ''}Escolha uma senha so sua (diferente de 1234).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)}
              autoComplete="new-password" placeholder="Ao menos 4 caracteres"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repita a senha</label>
            <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
              autoComplete="new-password" placeholder="Digite de novo"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Spinner light /> : 'Salvar senha'}
          </button>
        </form>
      </div>
    );
  }

  // ─── LISTA DE ESPELHOS ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-orange-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Truck size={22} />
          <div className="leading-tight">
            <div className="font-semibold text-sm">Meus Pagamentos</div>
            {driverName && <div className="text-orange-100 text-xs">{driverName}</div>}
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-sm bg-orange-700/60 hover:bg-orange-700 rounded-lg px-3 py-1.5">
          <LogOut size={16} /> Sair
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-3">
        {mirrors === null && (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        )}

        {mirrors !== null && mirrors.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Nenhum espelho por aqui ainda.</p>
            <p className="text-sm">Quando o escritorio enviar, ele aparece nesta tela.</p>
          </div>
        )}

        {mirrors?.map((m) => (
          <div key={m.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 truncate">{m.periodLabel || 'Espelho'}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Enviado em {fmtDate(m.deliveredAt)}
                {m.platformFilter && m.platformFilter.length > 0 && (
                  <> · {m.platformFilter.join(', ')}</>
                )}
              </div>
              {m.viewedAt && <div className="text-[11px] text-green-600 mt-0.5">Ja visualizado</div>}
            </div>
            <button onClick={() => handleView(m.id)} disabled={opening === m.id}
              className="shrink-0 flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-3 py-2">
              {opening === m.id ? <Spinner light /> : <><Eye size={16} /> Ver</>}
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}
