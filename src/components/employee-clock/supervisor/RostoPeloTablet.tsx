import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, ScanFace, WifiOff, XCircle } from 'lucide-react';
import {
  ErroDoSupervisor, decidirRostoCapturado, gerarQrDoRosto, type PontoDoDia, type QrGerado,
} from '../../../services/supervisorTablet';
import { QrNaTela } from './QrNaTela';
import { useEstadoDoQr } from './useEstadoDoQr';
import { avisoDaFoto, motivoDaRecusa, ultimaMarcacao } from './supervisorUi';

/** Depois do rosto confirmado, o celular espera a batida da pessoa no tablet por este tempo. */
const ESPERA_A_BATIDA_MS = 2 * 60_000;

/**
 * O rosto pelo tablet (07/10/2026, entrega E): o QR de ROSTO, que só o tablet pareado lê. O tablet
 * tira o rosto; o supervisor vê a foto pequena e confirma — ou manda tirar de novo. Confirmado, o
 * rosto entra na ficha e (com "bater o ponto agora") o tablet reconhece a pessoa e bate pelo caminho
 * de sempre; o celular mostra a marcação quando ela entra.
 */
export function RostoPeloTablet({ session, funcionario, modo, onFim, onSessaoAcabou }: {
  session: string;
  funcionario: { employeeId: string; nome: string };
  modo: 'novo' | 'refazer';
  onFim: () => void;
  onSessaoAcabou: () => void;
}) {
  const [baterPonto, setBaterPonto] = useState(true);
  const [qr, setQr] = useState<QrGerado | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState(false);
  const [esperandoBatida, setEsperandoBatida] = useState(false);
  /** O ponto de hoje no instante da confirmação (JSON) — a batida NOVA é quando ele muda. */
  const [pontoNaConfirmacao, setPontoNaConfirmacao] = useState<string | undefined>(undefined);
  const { estado, semRede, sessaoAcabou } = useEstadoDoQr(session, qr?.qrId ?? null, {
    ativo: !!qr,
    seguirDepoisDeConfirmar: esperandoBatida,
  });
  const primeiroNome = funcionario.nome.split(' ')[0];

  useEffect(() => { if (sessaoAcabou) onSessaoAcabou(); }, [sessaoAcabou, onSessaoAcabou]);

  const gerar = useCallback(async () => {
    setGerando(true);
    setErro(null);
    try {
      setQr(await gerarQrDoRosto(session, funcionario.employeeId, modo, baterPonto));
    } catch (err) {
      if (err instanceof ErroDoSupervisor && err.status === 401) { onSessaoAcabou(); return; }
      setErro(err instanceof ErroDoSupervisor ? err.message : 'Sem conexão. Tente de novo.');
    } finally {
      setGerando(false);
    }
  }, [session, funcionario.employeeId, modo, baterPonto, onSessaoAcabou]);

  // Confirmado com "bater o ponto agora": espera a batida nova por ESPERA_A_BATIDA_MS.
  const confirmado = estado?.status === 'confirmado';
  useEffect(() => {
    if (!confirmado || !qr || pontoNaConfirmacao !== undefined) return;
    setPontoNaConfirmacao(JSON.stringify(estado?.pontoDeHoje ?? null));
    if (baterPonto) setEsperandoBatida(true);
  }, [confirmado, qr, estado, baterPonto, pontoNaConfirmacao]);
  const batidaNova = confirmado && pontoNaConfirmacao !== undefined
    && JSON.stringify(estado?.pontoDeHoje ?? null) !== pontoNaConfirmacao;
  useEffect(() => {
    if (!esperandoBatida) return;
    if (batidaNova) { setEsperandoBatida(false); return; }
    const t = setTimeout(() => setEsperandoBatida(false), ESPERA_A_BATIDA_MS);
    return () => clearTimeout(t);
  }, [esperandoBatida, batidaNova]);

  const decidir = async (aceitar: boolean) => {
    if (!qr) return;
    setDecidindo(true);
    setErro(null);
    try {
      await decidirRostoCapturado(session, qr.qrId, aceitar);
    } catch (err) {
      if (err instanceof ErroDoSupervisor && err.status === 401) { onSessaoAcabou(); return; }
      setErro(err instanceof ErroDoSupervisor ? err.message : 'Sem conexão. Tente de novo.');
    } finally {
      setDecidindo(false);
    }
  };

  // ── Antes do QR: confirmar quem é e se bate o ponto junto ──
  if (!qr) {
    return (
      <div className="space-y-4" data-testid="rosto-preparar">
        <h2 className="text-lg font-bold text-gray-900">{modo === 'novo' ? 'Cadastrar o rosto' : 'Refazer o rosto'} de {funcionario.nome}</h2>
        <label className="flex items-start gap-3 bg-gray-50 rounded-xl p-3 cursor-pointer">
          <input type="checkbox" checked={baterPonto} onChange={(e) => setBaterPonto(e.target.checked)} className="w-5 h-5 mt-0.5" />
          <span className="text-sm text-gray-800"><strong>Bater o ponto agora</strong> — depois do rosto confirmado, o tablet registra a próxima marcação de {primeiroNome}.</span>
        </label>
        {erro && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">{erro}</p>}
        <button type="button" onClick={() => void gerar()} disabled={gerando} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[52px]">
          {gerando ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanFace className="w-5 h-5" />} Gerar o código do rosto
        </button>
        <button type="button" onClick={onFim} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]">Voltar à lista</button>
      </div>
    );
  }

  const status = estado?.status ?? 'pendente';
  const voltar = (
    <button type="button" onClick={onFim} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]">
      Voltar à lista
    </button>
  );

  if (status === 'confirmado') {
    const marcacao = batidaNova ? ultimaMarcacao(estado?.pontoDeHoje as PontoDoDia | null) : null;
    return (
      <div className="space-y-3 text-center py-2" data-testid="rosto-confirmado">
        <CheckCircle className="w-14 h-14 text-green-600 mx-auto" />
        <p className="text-lg font-bold text-gray-900">Rosto de {primeiroNome} {modo === 'novo' ? 'cadastrado' : 'refeito'} ✓</p>
        {baterPonto && (marcacao ? (
          <p className="text-green-800 bg-green-50 rounded-lg px-3 py-2 font-semibold" data-testid="rosto-ponto">{marcacao.rotulo} registrada às {marcacao.hora}</p>
        ) : esperandoBatida ? (
          <p className="text-sm text-gray-600 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Esperando {primeiroNome} bater o ponto no tablet…</p>
        ) : (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">O ponto ainda não entrou. Peça pra {primeiroNome} parar na frente do tablet.</p>
        ))}
        {voltar}
      </div>
    );
  }

  if (status === 'recusado' || status === 'vencido' || status === 'cancelado') {
    return (
      <div className="space-y-3 text-center" data-testid="rosto-falhou">
        <XCircle className="w-12 h-12 text-red-500 mx-auto" />
        <p className="text-gray-900">{status === 'recusado' ? motivoDaRecusa(estado?.qualidade) : 'O código venceu antes de o rosto ser confirmado.'}</p>
        <button type="button" onClick={() => { setQr(null); setPontoNaConfirmacao(undefined); }} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 min-h-[48px]">
          <RefreshCw className="w-5 h-5" /> Gerar outro código
        </button>
        {voltar}
      </div>
    );
  }

  if (status === 'capturado') {
    const aviso = avisoDaFoto(estado?.qualidade);
    return (
      <div className="space-y-3 text-center" data-testid="rosto-capturado">
        <p className="text-lg font-bold text-gray-900">É {primeiroNome}?</p>
        {estado?.foto && <img src={estado.foto} alt={`Rosto tirado no tablet de ${funcionario.nome}`} className="mx-auto w-40 h-40 object-cover rounded-xl border" />}
        {aviso && <p className="text-sm text-amber-900 bg-amber-100 rounded-lg px-3 py-2" data-testid="rosto-aviso">{aviso}</p>}
        {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void decidir(false)} disabled={decidindo} className="py-3 bg-gray-100 text-gray-800 font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 min-h-[48px]">Tirar de novo</button>
          <button type="button" onClick={() => void decidir(true)} disabled={decidindo} className="py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 min-h-[48px]">Confirmar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="rosto-qr">
      {status === 'pendente' ? (
        <QrNaTela texto={qr.qrText} expiraEm={qr.expiresAt} legenda={`Peça pra ${primeiroNome} ficar sozinho(a) na frente do tablet e mostre este código`} />
      ) : (
        <p className="text-center text-gray-800 flex items-center justify-center gap-2 py-6" data-testid="rosto-lendo">
          <Loader2 className="w-5 h-5 animate-spin" /> O tablet está tirando o rosto de {primeiroNome}…
          {estado && estado.tentativas > 0 ? ` (tentativa ${estado.tentativas + 1})` : ''}
        </p>
      )}
      {semRede && <p className="text-sm text-amber-800 flex items-center gap-2 justify-center"><WifiOff className="w-4 h-4" /> Sem internet — tentando de novo…</p>}
      {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
      {voltar}
    </div>
  );
}
