/**
 * App do ENTREGADOR — rota publica /driver (molde da tela /clock: sem login de painel).
 * Fluxo: login (CPF+senha) -> troca de senha (obrigatoria no 1o acesso) -> lista de
 * espelhos por quinzena -> abrir o PDF (link assinado, TTL curto, gerado na portaria).
 * Toda a seguranca vive no servidor (driver-public-api). Sessao em localStorage.
 */
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CircleDollarSign, LogOut, Eye, FileText, KeyRound, Upload, ChevronLeft, CheckCircle2, Download, Scissors } from 'lucide-react';
import {
  driverLogin, driverChangePassword, driverMyMirrors, driverMirrorUrl,
  driverNfSlots, driverNfList, driverNfUpload, driverNfSplitPreview,
  driverProofSlots, driverProofUpload,
  getDriverToken, getDriverName, setDriverSession, clearDriverSession,
  DriverApiError, type DriverMirror, type NfSlot, type NfFile, type NfIssuer,
  type ProofSlot,
} from '../../services/driverApp';
import { estadoBotaoNota } from '../../utils/notaBotao';

type Screen = 'login' | 'change' | 'mirrors' | 'nf' | 'proof';

const Spinner = ({ light = false }: { light?: boolean }) => (
  <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${light ? 'border-white' : 'border-blue-600'}`} />
);

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}
/** R$ da NOTA dividida (o valor da nota o driver PRECISA ver — é o que ele emite). */
function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
/** O iPhone salva foto em HEIC/HEIF — formato que o servidor NAO aceita. */
const ehHeic = (file: File): boolean =>
  /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/**
 * Decodifica a imagem pro canvas. Tenta `createImageBitmap` primeiro porque no iOS ele
 * lida com HEIC melhor que o `<img>`; cai pro `<img>` quando nao existe ou falha.
 */
async function decodificarImagem(file: File, dataUrl: string): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Formato que o bitmap nao entende: tenta pelo <img> logo abaixo.
    }
  }
  return await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('nao consegui abrir a imagem'));
    i.src = dataUrl;
  });
}

/**
 * Prepara a imagem pro envio: reduz pra 1600px e **sempre reencoda em JPEG**.
 *
 * ⚠️ iPhone (04/08/2026): o iOS salva foto em **HEIC**, e a edge function confere a
 * ASSINATURA REAL do arquivo — so passa JPEG, PNG ou WEBP. O reencode resolve isso. Antes,
 * se o reencode falhasse, o codigo mandava o arquivo ORIGINAL: no iPhone isso vira um HEIC
 * recusado com mensagem sem sentido pro entregador. Agora, quando nao da pra converter um
 * HEIC, ele recebe uma instrucao em portugues do que fazer.
 */
async function fileToUpload(file: File): Promise<{ base64: string; contentType: string; filename: string }> {
  if (!file.type.startsWith('image/') && !ehHeic(file)) {
    return { base64: await readAsDataUrl(file), contentType: file.type || 'application/pdf', filename: file.name };
  }
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await decodificarImagem(file, dataUrl);
    const maxDim = 1600;
    let width = (img as HTMLImageElement | ImageBitmap).width;
    let height = (img as HTMLImageElement | ImageBitmap).height;
    if (!width || !height) throw new Error('imagem sem tamanho');
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sem canvas');
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL('image/jpeg', 0.7);
    if (!out.startsWith('data:image/jpeg')) throw new Error('nao virou jpeg');
    return { base64: out, contentType: 'image/jpeg', filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch (err) {
    // HEIC sem conversao = recusa certa no servidor. Melhor explicar aqui.
    if (ehHeic(file)) {
      throw new Error(
        'Seu iPhone salvou a imagem num formato que nao conseguimos abrir. ' +
        'Tire um PRINT da tela (botao lateral + volume) e envie o print, ou mude em ' +
        'Ajustes > Camera > Formatos para "Mais compativel".',
      );
    }
    console.error('[upload] reencode falhou, mandando o arquivo original:', err);
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
  // A CD habilitou este motorista a dividir a nota em 2? (05/09/2026 — pedido do
  // Victor: quem não está habilitado nem vê a opção.)
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [nfFiles, setNfFiles] = useState<NfFile[]>([]);
  const [nfUploading, setNfUploading] = useState<string | null>(null);
  // Quem pode emitir nota por este motorista (nome + CNPJ) — a tela mostra a lista
  // pro driver saber ANTES de emitir (pedido do Victor, 05/09/2026).
  const [nfIssuers, setNfIssuers] = useState<NfIssuer[]>([]);
  // Como ele vai emitir esta quinzena (05/09/2026): a escolha aparece logo ao abrir
  // a tela, antes de qualquer botão de enviar. `null` = ainda não escolheu.
  const [nfMode, setNfMode] = useState<'integral' | 'dividir' | null>(null);
  // Valores exatos da divisão meio a meio, vindos do robô — a MESMA conta que confere.
  const [splitInfo, setSplitInfo] = useState<{ total: number; slices: [number, number] } | null>(null);

  // Espelho do app da Shopee (print da tela) — 04/08/2026.
  // ⚠️ Nada aqui guarda quantidade: o driver so anexa a foto.
  /** Quantos prints ainda faltam — alimenta a faixa no topo da lista. */
  const [proofPendentes, setProofPendentes] = useState(0);
  /** De QUAL app é o print pedido (05/08) — a faixa precisa dizer, não só contar. */
  const [proofApp, setProofApp] = useState<string | null>(null);
  const [proofSlots, setProofSlots] = useState<ProofSlot[] | null>(null);
  const [proofUploading, setProofUploading] = useState<string | null>(null);

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
      // Quantos prints a CD está esperando. Independe de haver espelho publicado.
      driverProofSlots(undefined, tk)
        .then(({ slots }) => {
          const faltando = slots.filter((s) => s.sent === 0);
          setProofPendentes(faltando.length);
          const apps = [...new Set(faltando.map((s) => s.platformName).filter(Boolean))];
          setProofApp(apps.length === 1 ? apps[0] : null);
        })
        .catch(() => { setProofPendentes(0); setProofApp(null); });
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
      const habilitado = slotsRes.splitEnabled === true;
      setSplitEnabled(habilitado);
      setNfIssuers(slotsRes.issuers ?? []);
      // Quem não pode dividir não escolhe nada: é sempre nota por CNPJ.
      setNfMode(habilitado ? null : 'integral');
      // Busca os valores da divisão já na abertura da tela — a escolha aparece com o
      // número na frente, sem o driver ter que clicar em nada antes.
      if (habilitado && slotsRes.slots.length > 0) {
        try {
          const prev = await driverNfSplitPreview(periodId, slotsRes.slots[0].emitterId, token);
          setSplitInfo({ total: prev.total, slices: prev.forms['50'] });
        } catch {
          setSplitInfo(null); // sem valor calculado ainda: some a opção de dividir
        }
      } else {
        setSplitInfo(null);
      }
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

  // ─── Espelho do app da Shopee (print da tela) — 04/08/2026 ────────────────
  // A CD pede o print pra conferir a quantidade de pacotes da planilha. Aqui o
  // driver só anexa a foto — nenhuma informação nossa aparece nesta tela.

  const loadProof = useCallback(async (periodId?: string) => {
    if (!token) return;
    setProofSlots(null);
    try {
      // Só os slots: o histórico separado saiu da tela (repetia o que os
      // próprios cartões já mostram) — uma requisição a menos no celular.
      const { slots } = await driverProofSlots(periodId ?? '', token);
      setProofSlots(slots);
      const faltando = slots.filter((s) => s.sent === 0);
      setProofPendentes(faltando.length);
      const apps = [...new Set(faltando.map((s) => s.platformName).filter(Boolean))];
      setProofApp(apps.length === 1 ? apps[0] : null);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else { setProofSlots([]); toast.error(errMsg(e, 'Nao consegui carregar os espelhos.')); }
    }
  }, [token, logout]);

  function openProof() {
    setScreen('proof');
    loadProof();
  }

  /**
   * Fica olhando a conferencia por ~1 min depois do envio. Para assim que o slot sair de
   * "esperando" (virou enviado ou recusado) — ou quando o tempo acaba, pra nao ficar
   * batendo no servidor a toa no 4G do entregador.
   */
  function acompanharConferencia(chave: string) {
    let tentativas = 0;
    const bater = async () => {
      tentativas += 1;
      try {
        const { slots: novos } = await driverProofSlots('', token!);
        setProofSlots(novos);
        setProofPendentes(novos.filter((x) => x.sent === 0).length);
        const s = novos.find((x) => `${x.driverId}|${x.platformName}` === chave);
        // Recusado ou ja contabilizado como enviado: acabou, nao precisa insistir.
        if (!s || s.rejected > 0 || s.sent > 0) return;
      } catch {
        // Sem rede ou sessao caindo: nao vale insistir nem incomodar com aviso.
        return;
      }
      if (tentativas < 12) setTimeout(bater, 5000);
    };
    setTimeout(bater, 5000);
  }

  async function handleProofFile(slot: ProofSlot, file: File | null | undefined) {
    if (!file || !token) return;
    // Aqui e o CONTRARIO da nota fiscal: so imagem. A edge fn tambem confere a
    // assinatura real do arquivo — este aviso e so pra ser gentil.
    if (!file.type.startsWith('image/')) {
      toast.error('Envie uma imagem — o print ou a foto da tela do app.');
      return;
    }
    const chave = `${slot.driverId}|${slot.platformName}`;
    setProofUploading(chave);
    try {
      const { base64, contentType, filename } = await fileToUpload(file);
      await driverProofUpload(
        {
          periodId: slot.periodId,
          driverId: slot.driverId,
          platformName: slot.platformName,
          contentType, fileBase64: base64, filename,
        },
        token,
      );
      // Mensagem PROPOSITALMENTE simples: o driver nao pode saber se a quantidade
      // bateu. Print divergente chega aqui igualzinho a um print certo.
      toast.success('Espelho enviado!');
      await loadProof();
      // A conferencia agora acontece POR TRAS (04/08): o servidor responde assim que
      // guarda o print, pra ele nao ficar ~40s parado. A recusa por data errada chega
      // alguns segundos depois — entao a tela se atualiza sozinha por um tempinho pra
      // ele ver o motivo sem precisar mexer em nada.
      acompanharConferencia(chave);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else if (errStatus(e) === 422) {
        // Recusa na hora: SO acontece por data errada ou print ilegivel — as duas
        // coisas que o proprio driver resolve reenviando.
        toast.error(errMsg(e, 'Espelho recusado.'), { duration: 12000 });
        await loadProof();
      } else {
        // Pode ser a instrucao do HEIC do iPhone, que e longa — tempo pra ler.
        toast.error(errMsg(e, 'Nao consegui enviar o espelho.'), { duration: 12000 });
      }
    } finally {
      setProofUploading(null);
    }
  }

  async function handleNfFile(
    slot: NfSlot,
    file: File | null | undefined,
    split?: { form: '50'; part: 1 | 2 },
  ) {
    const emitterId = slot.emitterId;
    if (!file || !token || !nfCtx) return;
    // Somente PDF (decisão do Victor, 2026-07-24): foto confundia os drivers.
    // A edge fn também recusa não-PDF (valida a assinatura %PDF) — aqui é só o aviso amigável.
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      toast.error('Envie a nota em PDF — foto não é aceita.');
      return;
    }
    setNfUploading(`${slot.mirrorKey ?? '*'}|${emitterId}`);
    try {
      const { base64, contentType, filename } = await fileToUpload(file);
      const res = await driverNfUpload(
        {
          periodId: nfCtx.periodId, emitterId, contentType, fileBase64: base64, filename,
          mirrorKey: slot.mirrorKey,
          ...(split ? { splitForm: split.form, splitPart: split.part } : {}),
        },
        token,
      );
      // Nota dividida: a 1ª entrou — o relógio dos 30 minutos está correndo.
      if (res.splitOpen) {
        toast.success(
          `1ª nota recebida!${typeof res.splitRemaining === 'number' ? ` Agora envie a 2ª, de ${fmtBRL(res.splitRemaining)},` : ' Agora envie a 2ª'} em até 30 minutos.`,
          { duration: 10000 },
        );
      }
      // Conferência automática: 3 checks verdes = já validada; senão fica pra conferência manual.
      else if (res.validated) toast.success(res.splitClosed ? 'Dupla completa! ✓ As duas notas foram validadas.' : 'Nota enviada e validada! ✓ Valor, CNPJ e nome conferidos.', { duration: 6000 });
      else toast.success('Nota enviada! Ela será conferida.');
      await loadNf(nfCtx.periodId);
      // O card lá da lista mostra "Nota enviada" — mas só se a lista for relida.
      loadMirrors(token);
    } catch (e) {
      if (errStatus(e) === 401) { logout(); toast.error('Sua sessao expirou. Entre de novo.'); }
      else if (errStatus(e) === 422) {
        // Nota RECUSADA pela conferência automática (04/09/2026: não fica gravada —
        // a edge fn já apagou o arquivo). Mostra o motivo no toast; o CNPJ volta
        // pendente na recarga, pronto pra reenvio na hora.
        toast.error(errMsg(e, 'Nota recusada na conferência.'), { duration: 12000 });
        await loadNf(nfCtx.periodId);
        loadMirrors(token);
      }
      else if (errStatus(e) === 409) {
        // Já tem nota nesta vaga (05/08). Acontece de verdade com o app aberto em duas
        // abas ou com bundle antigo em cache — recarregar mostra o estado de verdade.
        toast.error(errMsg(e, 'Você já enviou a nota deste CNPJ.'), { duration: 10000 });
        await loadNf(nfCtx.periodId);
        loadMirrors(token);
      }
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
  // ─── Tela do ESPELHO DO APP (print da tela da Shopee) ────────────────────
  // ⚠️ Nao existe numero nenhum nesta tela, de proposito: o driver so anexa a foto.
  if (screen === 'proof') {
    // ── Ordem da tela (ajustes pedidos pelo Victor em 04/08, olhando o print de
    //    um grupo de 6): quem AINDA FALTA aparece primeiro e chama atenção; quem
    //    já resolveu vai pro fim, apagado. Dentro do que falta, o RECUSADO vem
    //    na frente — é o mais urgente, porque já tomou "não" uma vez.
    const todos = proofSlots ?? [];
    const faltam = todos.filter((s) => s.sent === 0);
    const prontos = todos.filter((s) => s.sent > 0);
    const urgencia = (s: ProofSlot) => (s.rejected > 0 ? 0 : 1);
    const meusFaltam = faltam.filter((s) => !s.doGrupo);
    const grupoFaltam = faltam.filter((s) => s.doGrupo).sort((a, b) => urgencia(a) - urgencia(b));

    // A quinzena é a mesma pra todos na prática. Mostrar em CADA cartão virava
    // ruído (repetia 6 vezes e quebrava linha), então sobe pro topo — e só volta
    // pro cartão se houver mais de uma quinzena aberta ao mesmo tempo.
    const quinzenas = [...new Set(todos.map((s) => s.periodLabel).filter(Boolean))];
    const umaQuinzenaSo = quinzenas.length === 1;

    // 05/08 (pedido do Victor): a tela tem que dizer com todas as letras QUAL app é.
    // "Aplicativo de entregas" era vago — driver que faz iMile e Shopee mandava print
    // do app errado, e o print errado é recusa garantida na conferência.
    // O nome sai do próprio pedido da CD (`platformName`), não de texto fixo: se um
    // dia pedirem print de outra plataforma, a tela acompanha em vez de mentir.
    const plataformas = [...new Set(todos.map((s) => s.platformName).filter(Boolean))];
    const appDoPrint = plataformas.length === 1 ? plataformas[0] : null;

    const cartao = (s: ProofSlot) => {
      const chave = `${s.driverId}|${s.platformName}`;
      const enviando = proofUploading === chave;
      const precisaReenviar = s.sent === 0 && s.rejected > 0;
      return (
        <div key={chave} className="bg-white rounded-xl shadow-sm p-4">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 break-words">{s.driverName}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Print do app <strong>{s.platformName}</strong>{umaQuinzenaSo ? '' : ` · ${s.periodLabel}`}
            </div>
          </div>

          {precisaReenviar && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <strong>Espelho recusado.</strong>
              {s.rejectReason ? ` ${s.rejectReason.replace('[automático] ', '')}` : ' Envie outro.'}
            </div>
          )}

          <label
            className={`mt-3 w-full flex items-center justify-center gap-2 text-sm font-medium rounded-lg px-3 py-2.5 cursor-pointer ${
              enviando ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {enviando ? <Spinner /> : <Upload size={16} />}
            {enviando ? 'Enviando...' : `Enviar print do app ${s.platformName}`}
            <input
              // ⚠️ SEM `capture`: com ele o celular abre a CAMERA direto e o entregador nao
              // consegue escolher o print que ja esta na galeria — e print de tela nasce
              // na galeria. Sem o atributo, o proprio celular oferece as duas opcoes.
              type="file" accept="image/*" className="hidden" disabled={enviando}
              onChange={(e) => { handleProofFile(s, e.target.files?.[0]); e.currentTarget.value = ''; }}
            />
          </label>
        </div>
      );
    };

    /**
     * Já resolvido: fica apagado e discreto, pra não competir com quem falta.
     *
     * ⚠️ Aqui existia um "trocar" que reenviava por cima. Ele SAIU em 04/08/2026,
     * quando o Victor decidiu **um print por entregador**: o servidor passa a
     * recusar (409) enquanto houver um print valendo. Deixar o link seria oferecer
     * um caminho que dá erro — pior que não ter. Print RECUSADO libera a vaga
     * sozinho, e aí o cartão volta a ser o de enviar.
     */
    const cartaoPronto = (s: ProofSlot) => {
      const chave = `${s.driverId}|${s.platformName}`;
      return (
        <div key={chave} className="bg-white/60 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
            <span className="text-sm text-gray-600 break-words">{s.driverName}</span>
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
            enviado
          </span>
        </div>
      );
    };

    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-blue-600 text-white px-4 py-3 flex items-center gap-2 sticky top-0 z-10">
          <button onClick={() => { setScreen('mirrors'); loadMirrors(token!); }} className="p-1 -ml-1 rounded hover:bg-blue-700/60">
            <ChevronLeft size={22} />
          </button>
          <div className="leading-tight">
            <div className="font-semibold text-sm">
              {appDoPrint ? `Espelho do app ${appDoPrint}` : 'Espelho do app'}
            </div>
            <div className="text-blue-100 text-xs">
              {appDoPrint ? `Print da tela do app da ${appDoPrint}` : 'Print da tela do aplicativo'}
            </div>
          </div>
        </header>

        <main className="max-w-md mx-auto p-4 space-y-3">
          {proofSlots === null && <div className="flex items-center justify-center py-16"><Spinner /></div>}

          {proofSlots !== null && proofSlots.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <Upload size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Nada pra enviar aqui.</p>
              <p className="text-sm">A CD ainda não pediu o espelho desta quinzena.</p>
            </div>
          )}

          {proofSlots !== null && proofSlots.length > 0 && (
            <>
              {/* Placar: sem isto o líder de um grupo grande tinha que contar
                  cartão por cartão pra saber quanto falta. */}
              <div
                className={`rounded-xl p-4 text-center ${
                  faltam.length === 0
                    ? 'bg-green-50 border border-green-300'
                    : 'bg-amber-50 border border-amber-300'
                }`}
              >
                {faltam.length === 0 ? (
                  <>
                    <div className="text-green-800 font-bold text-lg flex items-center justify-center gap-2">
                      <CheckCircle2 size={20} /> Tudo enviado!
                    </div>
                    <div className="text-green-700 text-xs mt-0.5">
                      {todos.length === 1 ? 'Seu espelho já chegou na CD.' : `Os ${todos.length} espelhos já chegaram na CD.`}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-amber-900 font-bold text-lg">
                      {todos.length === 1
                        ? 'Falta enviar o seu espelho'
                        : `Faltam ${faltam.length} de ${todos.length}`}
                    </div>
                    <div className="text-amber-800 text-xs mt-0.5">
                      {umaQuinzenaSo ? quinzenas[0] : 'Quinzenas em aberto'}
                    </div>
                  </>
                )}
              </div>

              {/* 05/08, pedido do Victor: "bem específico que o espelho é somente da
                  Shopee". Fica ANTES do passo a passo — quem não entrega naquele app
                  para de ler aqui e não manda print do app errado. */}
              {appDoPrint && (
                <div className="bg-amber-100 border-2 border-amber-400 rounded-xl p-3 text-sm text-amber-950">
                  <p className="font-bold">
                    Atenção: é o print do app da {appDoPrint.toUpperCase()}.
                  </p>
                  <p className="text-xs mt-1">
                    Só quem entrega {appDoPrint} manda este print. Print de outro
                    aplicativo não vale — a conferência recusa.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-900">
                <p className="font-medium mb-1">Como tirar o print</p>
                <ol className="list-decimal list-inside space-y-0.5 text-xs">
                  <li>Abra o app da <strong>{appDoPrint ?? 'plataforma'}</strong> e vá em <strong>Entrega</strong>.</li>
                  <li>Toque em <strong>Selecionar data</strong> e escolha o período desta quinzena.</li>
                  <li>Deixe aparecendo a aba <strong>Encerrado</strong> com o número do lado.</li>
                  <li>Tire o print pelo próprio celular e envie aqui.</li>
                </ol>
              </div>

              {/* O cartão dele agora tem rótulo: antes ficava solto no topo e
                  parecia mais um da lista. */}
              {meusFaltam.length > 0 && (
                <>
                  <div className="pt-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Seu espelho
                  </div>
                  {meusFaltam.map(cartao)}
                </>
              )}

              {grupoFaltam.length > 0 && (
                <>
                  <div className="pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Do seu grupo — falta{grupoFaltam.length > 1 ? 'm' : ''} {grupoFaltam.length}
                  </div>
                  {grupoFaltam.map(cartao)}
                </>
              )}

              {prontos.length > 0 && (
                <>
                  <div className="pt-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Já enviados ({prontos.length})
                  </div>
                  <div className="space-y-1.5">{prontos.map(cartaoPronto)}</div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

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

          {/* ── COMO VOCÊ VAI EMITIR (05/09/2026, pedido do Victor) ──
              Aparece já na abertura da tela, antes de qualquer botão de enviar, e só
              pra quem a CD habilitou a dividir. Junto vão o aviso do CNPJ diferente e
              QUEM pode emitir (nome + CNPJ cadastrados) — o driver fica ciente antes
              de emitir, em vez de descobrir na recusa. */}
          {splitEnabled && nfSlots !== null && nfSlots.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <div className="font-semibold text-gray-800 text-sm">Como você vai emitir as notas desta quinzena?</div>
              <div className="space-y-2">
                <button type="button"
                  onClick={() => setNfMode('integral')}
                  className={`w-full rounded-lg border-2 px-3 py-2.5 text-left ${nfMode === 'integral' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="text-sm font-semibold text-gray-800">Notas no valor integral</div>
                  <div className="text-xs text-gray-600">
                    Uma nota por CNPJ, cada uma com o valor daquele CNPJ:{' '}
                    {nfSlots.map((s) => s.label).join(' e ')}.
                  </div>
                </button>
                {splitInfo && (
                  <button type="button"
                    onClick={() => setNfMode('dividir')}
                    className={`w-full rounded-lg border-2 px-3 py-2.5 text-left ${nfMode === 'dividir' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      <Scissors size={14} /> Dividir em 2 notas (metade cada)
                    </div>
                    <div className="text-xs text-gray-600">
                      Total de {fmtBRL(splitInfo.total)} dividido no meio:{' '}
                      <b>{fmtBRL(splitInfo.slices[0])}</b> + <b>{fmtBRL(splitInfo.slices[1])}</b>.
                    </div>
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠️ <b>Cada nota tem que ser emitida em um CNPJ DIFERENTE.</b> As duas no mesmo CNPJ são recusadas.
              </div>
              {nfIssuers.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-xs font-semibold text-gray-700 mb-1">A nota tem que ser emitida por:</div>
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {nfIssuers.map((i) => (
                      <li key={i.name}>
                        • <b>{i.name}</b>{i.cnpj ? <> — CNPJ {i.cnpj}</> : <span className="text-red-600"> — sem CNPJ cadastrado, avise a CD</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Nome ou CNPJ diferente destes = nota recusada.
                  </div>
                </div>
              )}
            </div>
          )}

          {nfSlots?.map((s) => (
            <div key={`${s.mirrorKey ?? '*'}|${s.emitterId}`} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* 28/07: com 2 espelhos no mesmo CNPJ, o driver precisa saber
                      qual nota esta mandando — o espelho vem primeiro. */}
                  {s.mirrorKey !== null && (
                    <div className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 mb-1">
                      {s.mirrorLabel}
                    </div>
                  )}
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
                  <b>Nota recusada.</b>{s.rejectReason ? ` Motivo: ${s.rejectReason}.` : ''}
                  {' '}Envie outra.
                </div>
              )}
              {/* UMA NOTA POR VAGA (05/08 → revisto 04/09/2026). Só nota ENVIADA
                  (recebida/validada) segura o lugar e esconde o botão — a edge fn
                  recusa o reenvio com 409 nesse caso. Nota RECUSADA não segura mais:
                  o botão de enviar continua aparecendo (banner acima já mostra o
                  motivo). NOTA DIVIDIDA (19/08 → cross-CNPJ desde 04/09): dupla em
                  andamento aparece aqui, no CNPJ que AINDA falta — o CNPJ onde a 1ª
                  já caiu mostra só "Nota enviada" (mais abaixo). */}
              {s.splitOpen ? (
                <>
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <b>1ª nota recebida (outro CNPJ){s.splitOpen.part1Value !== null ? `, de ${fmtBRL(s.splitOpen.part1Value)}` : ''}.</b>
                    {' '}Envie a 2ª AQUI{s.splitOpen.remaining !== null ? <>, de <b>{fmtBRL(s.splitOpen.remaining)}</b>,</> : ''} até{' '}
                    <b>{fmtHora(s.splitOpen.expiresAt)}</b>. Passou da hora, as duas caem e você reenvia a dupla.
                  </div>
                  <label className={`mt-3 w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${nfUploading === `${s.mirrorKey ?? '*'}|${s.emitterId}` ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-amber-600 text-white hover:bg-amber-700 cursor-pointer'}`}>
                    {nfUploading === `${s.mirrorKey ?? '*'}|${s.emitterId}` ? <Spinner /> : <><Upload size={16} /> Enviar 2ª nota{s.splitOpen.remaining !== null ? ` (${fmtBRL(s.splitOpen.remaining)})` : ''}</>}
                    <input
                      type="file" accept="application/pdf" className="hidden"
                      disabled={nfUploading === `${s.mirrorKey ?? '*'}|${s.emitterId}`}
                      onChange={(e) => { handleNfFile(s, e.target.files?.[0], { form: '50', part: 2 }); e.currentTarget.value = ''; }}
                    />
                  </label>
                </>
              ) : s.sent > 0 ? (
                <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-600 text-center">
                  <b className="text-green-700">Nota enviada.</b> Precisa trocar? Peça à CD para excluir a atual.
                </div>
              ) : (() => {
                const k = `${s.mirrorKey ?? '*'}|${s.emitterId}`;
                // Habilitado que ainda não disse COMO vai emitir: nada de botão de
                // enviar (05/09/2026 — era mandando pelo botão errado que o driver
                // queimava nota de verdade).
                if (splitEnabled && nfMode === null) {
                  return (
                    <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 text-center">
                      Escolha lá em cima como você vai emitir — inteira ou dividida — pra liberar o envio.
                    </div>
                  );
                }
                const dividindo = nfMode === 'dividir' && splitInfo !== null;
                return (
                  <>
                    {dividindo && (
                      <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Esta nota tem que ser de <b>{fmtBRL(splitInfo!.slices[0])}</b>, emitida contra o CNPJ{' '}
                        <b>{s.cnpj}</b> ({s.label}). A outra, do mesmo valor, vai no <b>OUTRO CNPJ</b>.
                        <br /><b>⏰ Você tem 30 minutos</b> para enviar a segunda depois da primeira.
                      </div>
                    )}
                    <label className={`mt-3 w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${nfUploading === k ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'}`}>
                      {nfUploading === k ? <Spinner /> : (
                        <><Upload size={16} /> {dividindo ? `Enviar nota de ${fmtBRL(splitInfo!.slices[0])}` : 'Enviar PDF da nota'}</>
                      )}
                      <input
                        type="file" accept="application/pdf" className="hidden" disabled={nfUploading === k}
                        onChange={(e) => {
                          handleNfFile(s, e.target.files?.[0], dividindo ? { form: '50', part: 1 } : undefined);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <p className="mt-1.5 text-[11px] text-gray-400 text-center">Somente arquivo PDF — foto não é aceita.</p>
                  </>
                );
              })()}
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
        {/* Espelho do app (print da tela) — 04/08/2026.
            ⚠️ FICA FORA dos cards de espelho publicado de propósito: a CD pede o
            print ANTES de publicar o pagamento (a conferência é o que libera o
            pagamento). Se este botão dependesse de um espelho publicado, o driver
            não teria por onde enviar — foi o que o E2E do portal pegou. */}
        {proofPendentes > 0 && (
          <button
            onClick={openProof}
            className="w-full bg-amber-50 border border-amber-300 rounded-xl p-4 text-left hover:bg-amber-100"
          >
            <div className="flex items-center gap-3">
              <Upload size={20} className="text-amber-700 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-amber-900 text-sm">
                  {proofPendentes === 1
                    ? `A CD está esperando 1 espelho do app${proofApp ? ` ${proofApp}` : ''}`
                    : `A CD está esperando ${proofPendentes} espelhos do app${proofApp ? ` ${proofApp}` : ''}`}
                </div>
                <div className="text-xs text-amber-800 mt-0.5">
                  {proofApp
                    ? `Toque aqui pra enviar o print da tela do app da ${proofApp} — só de quem entrega ${proofApp}.`
                    : 'Toque aqui pra enviar o print da tela do aplicativo de entregas.'}
                </div>
              </div>
            </div>
          </button>
        )}

        {mirrors === null && (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        )}

        {mirrors !== null && mirrors.length === 0 && proofPendentes === 0 && (
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
                {/* Pagamento por plataforma (28/07): com 2 espelhos na mesma quinzena, o
                    driver PRECISA ver de qual e cada um — antes isso era uma linha cinza. */}
                {m.platformFilter && m.platformFilter.length > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    SOMENTE {m.platformFilter.join(' + ').toUpperCase()}
                  </span>
                )}
              </div>
              {m.platformFilter && m.platformFilter.length > 0 && (
                <div className="text-[11px] text-blue-700 mt-1">
                  Pagamento so das entregas {m.platformFilter.join(' e ')} desta quinzena.
                </div>
              )}
              <div className="text-xs text-gray-500 mt-0.5">
                Enviado em {fmtDate(m.deliveredAt)}
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
              {(() => {
                // 05/08: o botão mostra a SITUAÇÃO da nota, não um convite eterno a
                // mandar outra. Continua clicável nos três estados — é por ele que o
                // driver abre a tela e lê o motivo da recusa.
                const nf = estadoBotaoNota(m);
                const cor = nf.tom === 'ok'
                  ? 'bg-green-50 border-green-600 text-green-700 hover:bg-green-100'
                  : nf.tom === 'recusada'
                    ? 'bg-red-50 border-red-500 text-red-700 hover:bg-red-100'
                    : 'bg-white border-blue-600 text-blue-700 hover:bg-blue-50';
                return (
                  <button onClick={() => openNf(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 border text-sm font-medium rounded-lg px-3 py-2 ${cor}`}>
                    {nf.tom === 'ok' ? <CheckCircle2 size={16} /> : <Upload size={16} />} {nf.texto}
                  </button>
                );
              })()}
            </div>

          </div>
        ))}
      </main>
    </div>
  );
}
