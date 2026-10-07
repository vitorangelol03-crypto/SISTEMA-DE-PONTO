import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { ErroDoSupervisor, gerarQrDeConectar, type QrGerado } from '../../../services/supervisorTablet';
import { QrNaTela } from './QrNaTela';
import { useEstadoDoQr } from './useEstadoDoQr';

/**
 * "Conectar ao tablet" (07/10/2026, entrega E): o QR de PAREAR. O tablet do galpão lê e a sessão
 * fica presa a ele — é a prova de que o supervisor está na frente de um tablet ativo da empresa; só
 * então a lista e o cadastro abrem. Vale 2 minutos e 1 uso.
 */
export function ConectarAoTablet({ session, onConectado, onSessaoAcabou }: {
  session: string;
  onConectado: (nomeDoTablet: string | null) => void;
  onSessaoAcabou: () => void;
}) {
  const [qr, setQr] = useState<QrGerado | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { estado, semRede, sessaoAcabou } = useEstadoDoQr(session, qr?.qrId ?? null, { ativo: !!qr });

  const gerar = useCallback(async () => {
    setGerando(true);
    setErro(null);
    try {
      setQr(await gerarQrDeConectar(session));
    } catch (err) {
      if (err instanceof ErroDoSupervisor && err.status === 401) { onSessaoAcabou(); return; }
      setErro(err instanceof ErroDoSupervisor ? err.message : 'Sem conexão. Tente de novo.');
    } finally {
      setGerando(false);
    }
  }, [session, onSessaoAcabou]);

  // O QR nasce UMA vez por tela. Cada QR novo cancela o anterior no servidor, e o React pode rodar
  // este efeito 2 vezes (no modo estrito, sempre): eram 2 QRs, e o celular podia ficar mostrando o
  // cancelado — o que o tablet nunca conseguiria ler (achado no E2E 137, 07/10/2026).
  const jaGerouRef = useRef(false);
  useEffect(() => {
    if (jaGerouRef.current) return;
    jaGerouRef.current = true;
    void gerar();
  }, [gerar]);
  useEffect(() => { if (sessaoAcabou) onSessaoAcabou(); }, [sessaoAcabou, onSessaoAcabou]);
  useEffect(() => {
    if (estado?.status === 'lido') {
      // Um respiro pra a pessoa ver o "✓" antes de a tela trocar.
      const t = setTimeout(() => onConectado(estado.tablet), 900);
      return () => clearTimeout(t);
    }
  }, [estado, onConectado]);

  if (estado?.status === 'lido') {
    return (
      <div className="text-center space-y-3 py-6" data-testid="conectado">
        <CheckCircle className="w-14 h-14 text-green-600 mx-auto" />
        <p className="text-lg font-bold text-gray-900">Lido pelo tablet {estado.tablet ?? ''} ✓</p>
      </div>
    );
  }
  const vencido = estado?.status === 'vencido' || estado?.status === 'cancelado';
  return (
    <div className="space-y-4" data-testid="conectar-ao-tablet">
      <h2 className="text-lg font-bold text-gray-900 text-center">Conectar ao tablet</h2>
      {gerando && !qr && <p className="text-center text-gray-500 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Gerando o código…</p>}
      {erro && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">{erro}</p>}
      {qr && !vencido && <QrNaTela texto={qr.qrText} expiraEm={qr.expiresAt} legenda="Mostre este código para a câmera do tablet" />}
      {semRede && <p className="text-sm text-amber-800 flex items-center gap-2 justify-center"><WifiOff className="w-4 h-4" /> Sem internet — tentando de novo…</p>}
      {(vencido || erro) && (
        <button
          type="button"
          onClick={() => void gerar()}
          disabled={gerando}
          className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
        >
          <RefreshCw className="w-5 h-5" /> {vencido ? 'O código venceu — gerar outro' : 'Tentar de novo'}
        </button>
      )}
    </div>
  );
}
