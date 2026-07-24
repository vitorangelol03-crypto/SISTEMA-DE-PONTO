/**
 * App do ENTREGADOR — rota publica /driver (molde da tela /clock: sem login de painel).
 * Fluxo: login (CPF+senha) -> troca de senha (obrigatoria no 1o acesso) -> lista de
 * espelhos por quinzena -> abrir o PDF (link assinado, TTL curto, gerado na portaria).
 * Toda a seguranca vive no servidor (driver-public-api). Sessao em localStorage.
 */
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CircleDollarSign, LogOut, Eye, FileText, KeyRound, Upload, ChevronLeft, CheckCircle2, Download } from 'lucide-react';
import {
  driverLogin, driverChangePassword, driverMyMirrors, driverMirrorUrl,
  driverNfSlots, driverNfList, driverNfUpload,
  getDriverToken, getDriverName, setDriverSession, clearDriverSession,
  DriverApiError, type DriverMirror, type NfSlot, type NfFile,
} from '../../services/driverApp';

type Screen = 'login' | 'change' | 'mirrors' | 'nf';

const Spinner = ({ light = false }: { light?: boolean }) => (
  <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${light ? 'border-white' : 'border-blue-600'}`} />
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

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Não consegui ler o arquivo'));
    r.readAsDataURL(file);
  });

/** Prepara o arquivo pra subir: foto vira JPEG reduzido (máx 1600px, q0.7); PDF vai como está. */
async function fileToUpload(file: File): Promise<{ base64: string; contentType: string; filename: string }> {
  if (!file.type.startsWith('image/')) {
    return { base64: await readAsDataUrl(file), contentType: file.type || 'application/pdf', filename: file.name };
  }
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('img'));
      i.src = dataUrl;
    });
    const maxDim = 1600;
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { base64: dataUrl, contentType: file.type, filename: file.name };
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL('image/jpeg', 0.7);
    return { base64: out, contentType: 'image/jpeg', filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch {
    return { base64: dataUrl, contentType: file.type || 'image/jpeg', filename: file.name };
  }
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Anexar nota (Fase 3)
  const [nfCtx, setNfCtx] = useState<{ periodId: string; periodLabel: string } | null>(null);
  const [nfSlots, setNfSlots] = useState<NfSlot[] | null>(null);
  const [nfFiles, setNfFiles] = useState<NfFile[]>([]);
  const [nfUploading, setNfUploading] = useState<string | null>(null);

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

  /** Baixa o PDF do espelho no aparelho (link assinado -> blob -> download nomeado). */
  async function handleDownload(m: DriverMirror) {
    if (!token) { logout(); return; }
    setDownloadingId(m.id);
    try {
      const { url } = await driverMirrorUrl(m.id, token);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Falha ao baixar o espelho');
      const blob = await resp.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = `Espelho - ${(m.periodLabel || 'quinzena').replace(/[/\\:*?"<>|]+/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 4000);
      toast.success('Espelho baixado!');
      loadMirrors(token); // atualiza o marcador de "visto"
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else toast.error(errMsg(e, 'Nao consegui baixar o espelho.'));
    } finally { setDownloadingId(null); }
  }

  async function loadNf(periodId: string) {
    if (!token) { logout(); return; }
    setNfSlots(null); setNfFiles([]);
    try {
      const [slotsRes, filesRes] = await Promise.all([driverNfSlots(periodId, token), driverNfList(periodId, token)]);
      setNfSlots(slotsRes.slots); setNfFiles(filesRes.files);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else { setNfSlots([]); toast.error(errMsg(e, 'Nao consegui carregar os CNPJs.')); }
    }
  }

  function openNf(m: DriverMirror) {
    setNfCtx({ periodId: m.periodId, periodLabel: m.periodLabel });
    setScreen('nf');
    loadNf(m.periodId);
  }

  async function handleNfFile(emitterId: string, file: File | null | undefined) {
    if (!file || !token || !nfCtx) return;
    // Somente PDF (decisão do Victor, 2026-07-24): foto confundia os drivers.
    // A edge fn também recusa não-PDF (valida a assinatura %PDF) — aqui é só o aviso amigável.
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      toast.error('Envie a nota em PDF — foto não é aceita.');
      return;
    }
    setNfUploading(emitterId);
    try {
      const { base64, contentType, filename } = await fileToUpload(file);
      await driverNfUpload({ periodId: nfCtx.periodId, emitterId, contentType, fileBase64: base64, filename }, token);
      toast.success('Nota enviada!');
      await loadNf(nfCtx.periodId);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else toast.error(errMsg(e, 'Nao consegui enviar a nota.'));
    } finally { setNfUploading(null); }
  }

  // ─── LOGIN ──────────────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center">
              <CircleDollarSign className="text-white" size={30} />
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
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="Sua senha (primeira vez: 1234)"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handleChange} className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center">
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
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repita a senha</label>
            <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
              autoComplete="new-password" placeholder="Digite de novo"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Spinner light /> : 'Salvar senha'}
          </button>
        </form>
      </div>
    );
  }

  // ─── ANEXAR NOTA (por CNPJ) ──────────────────────────────────────────────────
  if (screen === 'nf') {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-blue-600 text-white px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
          <button onClick={() => { setScreen('mirrors'); setNfCtx(null); }} className="p-1 -ml-1 rounded hover:bg-blue-700/60">
            <ChevronLeft size={22} />
          </button>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Anexar nota</div>
            {nfCtx && <div className="text-blue-100 text-xs">{nfCtx.periodLabel}</div>}
          </div>
        </header>

        <main className="max-w-md mx-auto p-4 space-y-3">
          {nfSlots === null && <div className="flex items-center justify-center py-16"><Spinner /></div>}

          {nfSlots !== null && nfSlots.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <FileText size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Nenhuma nota a enviar aqui.</p>
              <p className="text-sm">Não há CNPJ com entregas suas nesta quinzena.</p>
            </div>
          )}

          {nfSlots?.map((s) => (
            <div key={s.emitterId} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800">{s.label}</div>
                  <div className="text-xs text-gray-500">CNPJ {s.cnpj}</div>
                </div>
                {s.sent > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                    <CheckCircle2 size={14} /> {s.sent} enviada{s.sent > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {s.sent === 0 && s.rejected > 0 && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <b>Nota recusada.</b>{s.rejectReason ? ` Motivo: ${s.rejectReason}.` : ''} Envie outra, por favor.
                </div>
              )}
              <label className={`mt-3 w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${nfUploading === s.emitterId ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'}`}>
                {nfUploading === s.emitterId ? <Spinner /> : <><Upload size={16} /> {s.sent === 0 && s.rejected > 0 ? 'Reenviar nota (PDF)' : s.sent > 0 ? 'Enviar outro PDF' : 'Enviar PDF da nota'}</>}
                <input
                  type="file" accept="application/pdf" className="hidden"
                  disabled={nfUploading === s.emitterId}
                  onChange={(e) => { handleNfFile(s.emitterId, e.target.files?.[0]); e.currentTarget.value = ''; }}
                />
              </label>
              <p className="mt-1.5 text-[11px] text-gray-400 text-center">Somente arquivo PDF — foto não é aceita.</p>
            </div>
          ))}

          {nfFiles.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Notas enviadas</div>
              {nfFiles.map((f) => (
                <div key={f.id} className="text-xs text-gray-600 flex items-center gap-1.5 py-0.5">
                  <CheckCircle2 size={12} className="text-green-600" /> {f.emitterLabel} · {fmtDate(f.uploadedAt)}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── LISTA DE ESPELHOS ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <CircleDollarSign size={22} />
          <div className="leading-tight">
            <div className="font-semibold text-sm">Meus Pagamentos</div>
            {driverName && <div className="text-blue-100 text-xs">{driverName}</div>}
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-sm bg-blue-700/60 hover:bg-blue-700 rounded-lg px-3 py-1.5">
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
          <div key={m.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold text-gray-800">{m.periodLabel || 'Espelho'}</div>
                {/* Tag da quinzena: ATUAL (aberta) vira FECHADA quando o painel conclui o período. */}
                {m.periodStatus === 'concluido' ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Fechada</span>
                ) : m.periodStatus === 'aberto' ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Atual</span>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Enviado em {fmtDate(m.deliveredAt)}
                {m.platformFilter && m.platformFilter.length > 0 && (
                  <> · {m.platformFilter.join(', ')}</>
                )}
              </div>
              {m.viewedAt && <div className="text-[11px] text-green-600 mt-0.5">Já visualizado</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleView(m.id)} disabled={opening === m.id}
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-3 py-2">
                {opening === m.id ? <Spinner light /> : <><Eye size={16} /> Ver</>}
              </button>
              <button onClick={() => handleDownload(m)} disabled={downloadingId === m.id}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-60 text-sm font-medium rounded-lg px-3 py-2">
                {downloadingId === m.id ? <Spinner /> : <><Download size={16} /> Baixar</>}
              </button>
              <button onClick={() => openNf(m)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-blue-600 text-blue-700 hover:bg-blue-50 text-sm font-medium rounded-lg px-3 py-2">
                <Upload size={16} /> Anexar nota
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
