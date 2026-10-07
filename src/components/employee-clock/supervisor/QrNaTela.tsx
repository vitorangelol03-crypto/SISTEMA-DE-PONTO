import { useEffect, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { formatarContagem, segundosRestantes } from './supervisorUi';
import { desenharQrNitido } from './desenharQrNitido';

/**
 * O QR na tela do celular do supervisor (07/10/2026, entrega E). Correção de erro "M", borda de 2
 * quadradinhos. ABRE EM TELA CHEIA, branco de ponta a ponta (pedido do Victor no 1º teste no tablet
 * real, 07/10: "aumente o tamanho do QR mesmo assim") — dentro do cartão o QR não passava de ~350
 * pontos; na tela cheia ocupa a largura inteira do celular, e cada quadradinho maior vira mais pontos
 * na câmera do tablet. "Fechar" volta pro QR dentro do cartão. Quando o tablet lê, quem chamou tira o
 * QR da tela (e a tela cheia some junto). O texto do QR também vai em `data-qr` (é o mesmo conteúdo
 * da imagem; serve aos testes e ao suporte).
 *
 * Enquanto o QR aparece, pede pra tela NÃO APAGAR (Wake Lock, quando o navegador tem); se não tiver,
 * nada quebra — a tela só pode apagar sozinha no tempo normal do celular.
 */
export function QrNaTela({ texto, expiraEm, legenda }: { texto: string; expiraEm: string; legenda: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [telaCheia, setTelaCheia] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const lado = telaCheia
      ? Math.floor(Math.min(window.innerWidth, window.innerHeight * 0.72))
      : Math.floor(Math.min(window.innerWidth - 40, window.innerHeight * 0.6, 520));
    desenharQrNitido(canvasRef.current, texto, lado, { margem: 2, correcao: 'M' })
      .catch((err: unknown) => console.error('Não foi possível desenhar o QR:', err));
  }, [texto, telaCheia]);

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
  const contagem = (
    <p className={`text-sm font-mono ${restam <= 20 ? 'text-red-600' : 'text-gray-500'}`} data-testid="qr-contagem">
      {restam > 0 ? `Vale por mais ${formatarContagem(restam)}` : 'Código vencido'}
    </p>
  );

  if (telaCheia) {
    return (
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-3 text-center overflow-y-auto"
        data-testid="qr-na-tela"
        data-qr={texto}
        role="dialog"
        aria-label="QR para a câmera do tablet"
      >
        <p className="px-4 text-base font-semibold text-gray-900">{legenda}</p>
        <canvas ref={canvasRef} className="block" aria-label="QR para a câmera do tablet" />
        <p className="px-4 text-sm text-gray-600">Brilho da tela no máximo, a uns 20–30 cm da câmera do tablet.</p>
        {contagem}
        <button
          type="button"
          onClick={() => setTelaCheia(false)}
          className="flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold"
        >
          <X className="w-4 h-4" /> Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="qr-na-tela" data-qr={texto}>
      <div className="bg-white rounded-xl p-2 shadow-lg">
        <canvas ref={canvasRef} aria-label="QR para a câmera do tablet" />
      </div>
      <p className="text-base font-semibold text-gray-900">{legenda}</p>
      <button
        type="button"
        onClick={() => setTelaCheia(true)}
        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
      >
        <Maximize2 className="w-4 h-4" /> Ampliar o QR
      </button>
      {contagem}
    </div>
  );
}
