import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { formatarContagem, segundosRestantes } from './supervisorUi';

/**
 * O QR GRANDE na tela do celular do supervisor (07/10/2026, entrega E). Fundo branco, correção de
 * erro "M". Ocupa a largura da tela, com a borda do QR fina (2 quadradinhos + o fundo branco em
 * volta): o tablet REAL não leu o QR de teste de ~5 cm a 640×480 (07/10) — cada quadradinho maior
 * vira mais pontos na câmera dele. O texto do QR também vai em `data-qr` (é o mesmo conteúdo da
 * imagem; serve aos testes e ao suporte).
 *
 * Enquanto o QR aparece, pede pra tela NÃO APAGAR (Wake Lock, quando o navegador tem); se não tiver,
 * nada quebra — a tela só pode apagar sozinha no tempo normal do celular.
 */
export function QrNaTela({ texto, expiraEm, legenda }: { texto: string; expiraEm: string; legenda: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!canvasRef.current) return;
    const lado = Math.floor(Math.min(window.innerWidth - 40, window.innerHeight * 0.6, 520));
    QRCode.toCanvas(canvasRef.current, texto, { errorCorrectionLevel: 'M', margin: 2, width: lado }).catch(
      (err: unknown) => console.error('Não foi possível desenhar o QR:', err),
    );
  }, [texto]);

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, []);

  useEffect(() => {
    let trava: WakeLockSentinel | null = null;
    let cancelado = false;
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen')
        .then((t) => { if (cancelado) void t.release(); else trava = t; })
        .catch((err: unknown) => console.warn('Tela acesa durante o QR: o navegador não deixou.', err));
    }
    return () => {
      cancelado = true;
      if (trava) void trava.release().catch((err: unknown) => console.warn('Soltar a tela acesa falhou:', err));
    };
  }, []);

  const restam = segundosRestantes(expiraEm, agora);
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="qr-na-tela" data-qr={texto}>
      <div className="bg-white rounded-xl p-2 shadow-lg">
        <canvas ref={canvasRef} aria-label="QR para a câmera do tablet" />
      </div>
      <p className="text-base font-semibold text-gray-900">{legenda}</p>
      <p className="text-sm text-gray-600">Aproxime o celular da câmera do tablet (uns 30 cm), com o brilho da tela no máximo.</p>
      <p className={`text-sm font-mono ${restam <= 20 ? 'text-red-600' : 'text-gray-500'}`} data-testid="qr-contagem">
        {restam > 0 ? `Vale por mais ${formatarContagem(restam)}` : 'Código vencido'}
      </p>
    </div>
  );
}
