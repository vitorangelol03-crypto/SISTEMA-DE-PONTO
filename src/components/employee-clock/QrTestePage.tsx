import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { abrirCameraFrontal } from './cameraAccess';
import { desenharQrNitido } from './supervisor/desenharQrNitido';
import { useFaceApi } from '../../hooks/useFaceApi';
import {
  MEDICOES_ZERADAS,
  ehCodigoDeTeste,
  gerarCodigoDeTeste,
  mediaMs,
  somarMedicao,
  type Medicoes,
} from '../../utils/qrTeste';

/**
 * PÁGINA DE TESTE DO QR NO TABLET — `/qr-teste` (entrega B do plano do tablet sem toque,
 * 06/10/2026). Sem banco e sem login: não grava nada em lugar nenhum.
 *
 *  - No TABLET: abre `/qr-teste`. A câmera frontal (640×480, igual à tela de ponto) procura QR a
 *    cada 250 ms e mostra o que leu, quantas vezes acertou e quanto tempo cada leitura levou.
 *    O botão "Ligar o reconhecimento de rosto junto" roda, ao mesmo tempo, o MESMO
 *    reconhecimento da tela de ponto (a cada 700 ms) — é o que mede se os dois convivem.
 *  - No CELULAR: abre `/qr-teste?mostrar=1` e mostra um QR curto ("PT-XXXXXX") que troca a cada
 *    10 s, pra provar que o tablet lê códigos NOVOS e não só o primeiro.
 *
 * Responde o risco nº 1 do plano: ninguém testou ainda a câmera FRONTAL do tablet lendo a tela de
 * um celular (foco fixo, reflexo, brilho).
 */
export const QrTestePage: React.FC = () => {
  const mostrar = new URLSearchParams(window.location.search).get('mostrar') === '1';
  return mostrar ? <CelularMostraQr /> : <TabletLeQr />;
};

const TAMANHOS = [
  { rotulo: 'Pequeno', px: 180 },
  { rotulo: 'Médio', px: 260 },
  { rotulo: 'Grande', px: 340 },
] as const;

/**
 * 07/10/2026: o tablet REAL não leu o QR "Médio" — o QR passa a ocupar a tela do celular de PONTA A
 * PONTA (o fundo branco da página é o respiro), e é o que abre primeiro. Os outros ficam pra comparar.
 */
const tamanhoDaTelaCheia = () => Math.max(180, Math.floor(Math.min(window.innerWidth, window.innerHeight * 0.7)));

const TROCA_A_CADA_S = 10;

const CelularMostraQr: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [codigo, setCodigo] = useState(() => gerarCodigoDeTeste());
  const [tamanho, setTamanho] = useState<number>(tamanhoDaTelaCheia);
  const [faltam, setFaltam] = useState(TROCA_A_CADA_S);

  useEffect(() => {
    const id = setInterval(() => {
      setFaltam((s) => {
        if (s > 1) return s - 1;
        setCodigo(gerarCodigoDeTeste());
        return TROCA_A_CADA_S;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    desenharQrNitido(canvasRef.current, codigo, tamanho, { margem: 2, correcao: 'L' }).catch(
      (e: unknown) => console.error('Falha ao desenhar o QR de teste:', e),
    );
  }, [codigo, tamanho]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 py-4 text-center overflow-x-hidden">
      <p className="px-4 text-lg font-bold text-gray-900">Mostre este QR para a câmera do tablet</p>
      <canvas ref={canvasRef} data-testid="qr-teste-canvas" className="block" />
      <p className="text-3xl font-extrabold tracking-widest text-gray-900" data-testid="qr-teste-codigo">{codigo}</p>
      <p className="px-4 text-sm text-gray-600">Troca em {faltam} s · deixe o brilho da tela no máximo</p>
      <div className="flex flex-wrap justify-center gap-2 px-4">
        {[...TAMANHOS, { rotulo: 'Tela cheia', px: tamanhoDaTelaCheia() }].map((t) => (
          <button
            key={t.rotulo}
            type="button"
            onClick={() => setTamanho(t.px)}
            className={`px-3 py-2 rounded-md border text-sm font-semibold ${
              tamanho === t.px ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {t.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
};

type EstadoDaCamera = 'abrindo' | 'aberta' | 'erro';

const LEITURA_A_CADA_MS = 250;

/** Câmera do tablet: a do ponto (640×480) ou mais alta — mais pontos por quadradinho do QR. */
const RESOLUCOES = {
  normal: { largura: 640, altura: 480, rotulo: 'Câmera normal (640×480, igual ao ponto)' },
  alta: { largura: 1280, altura: 720, rotulo: 'Câmera alta (1280×720)' },
} as const;

const TabletLeQr: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [estado, setEstado] = useState<EstadoDaCamera>('abrindo');
  const [erro, setErro] = useState<string | null>(null);
  const [resolucao, setResolucao] = useState('');
  const [medQr, setMedQr] = useState<Medicoes>(MEDICOES_ZERADAS);
  const [lidos, setLidos] = useState<Array<{ codigo: string; hora: string }>>([]);
  const [comRosto, setComRosto] = useState(false);
  const [medRosto, setMedRosto] = useState<Medicoes>(MEDICOES_ZERADAS);
  const [qualidade, setQualidade] = useState<keyof typeof RESOLUCOES>('normal');

  // Câmera frontal — a MESMA abertura da tela de ponto (640×480) ou a alta, pra comparar.
  useEffect(() => {
    let cancelado = false;
    let stream: MediaStream | null = null;
    setEstado('abrindo');
    abrirCameraFrontal(RESOLUCOES[qualidade])
      .then(async (s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play().catch(() => undefined);
        setEstado('aberta');
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setEstado('erro');
        setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [qualidade]);

  // Laço do QR: a cada 250 ms, um quadro do vídeo vai pro jsQR.
  useEffect(() => {
    if (estado !== 'aberta') return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const volta = () => {
      if (cancelado) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          setResolucao(`${w}×${h}`);
        }
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          const t0 = performance.now();
          ctx.drawImage(video, 0, 0, w, h);
          const imagem = ctx.getImageData(0, 0, w, h);
          const achado = jsQR(imagem.data, w, h, { inversionAttempts: 'dontInvert' });
          const ms = performance.now() - t0;
          const valido = achado !== null && ehCodigoDeTeste(achado.data);
          setMedQr((m) => somarMedicao(m, ms, valido));
          if (valido && achado) {
            const hora = new Date().toLocaleTimeString('pt-BR');
            setLidos((l) => (l[0]?.codigo === achado.data ? l : [{ codigo: achado.data, hora }, ...l].slice(0, 8)));
          }
        }
      }
      timer = setTimeout(volta, LEITURA_A_CADA_MS);
    };
    volta();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [estado]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col gap-3">
      <h1 className="text-xl font-bold">Teste do QR no tablet</h1>
      <p className="text-sm text-gray-300">
        No celular, abra <b>/qr-teste?mostrar=1</b> e mostre o QR pra câmera. Nada é gravado.
      </p>
      <div className="relative w-full max-w-md self-center">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full rounded-lg bg-black"
          style={{ transform: 'scaleX(-1)' }}
          data-testid="qr-teste-video"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {estado === 'abrindo' && <p className="text-yellow-300">Abrindo a câmera…</p>}
      {estado === 'erro' && <p className="text-red-400" data-testid="qr-teste-erro">Câmera não abriu: {erro}</p>}
      <div className="flex flex-wrap gap-2" data-testid="qr-teste-resolucoes">
        {(Object.keys(RESOLUCOES) as Array<keyof typeof RESOLUCOES>).map((chave) => (
          <button
            key={chave}
            type="button"
            data-testid={`qr-teste-camera-${chave}`}
            onClick={() => {
              if (chave === qualidade) return;
              setMedQr(MEDICOES_ZERADAS);
              setMedRosto(MEDICOES_ZERADAS);
              setQualidade(chave);
            }}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${qualidade === chave ? 'bg-green-600' : 'bg-gray-700'}`}
          >
            {RESOLUCOES[chave].rotulo}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm" data-testid="qr-teste-medicoes">
        <Info rotulo="Câmera" valor={resolucao || '—'} />
        <Info rotulo="Leituras de QR certas" valor={`${medQr.acertos} de ${medQr.tentativas}`} />
        <Info rotulo="Tempo por leitura (média)" valor={`${mediaMs(medQr)} ms`} />
        <Info rotulo="Tempo por leitura (pior)" valor={`${Math.round(medQr.maxMs)} ms`} />
        {comRosto && <Info rotulo="Rosto: tempo médio" valor={`${mediaMs(medRosto)} ms`} />}
        {comRosto && <Info rotulo="Rosto: achou / tentou" valor={`${medRosto.acertos} / ${medRosto.tentativas}`} />}
      </div>
      <div className="bg-gray-800 rounded-lg p-3">
        <p className="text-sm text-gray-300 mb-1">Códigos lidos (o mais novo em cima):</p>
        {lidos.length === 0 ? (
          <p className="text-gray-400">nenhum ainda</p>
        ) : (
          <ul className="space-y-0.5" data-testid="qr-teste-lidos">
            {lidos.map((l) => (
              <li key={`${l.codigo}-${l.hora}`} className="font-mono text-lg">
                <span className="text-green-400 font-bold">{l.codigo}</span> <span className="text-gray-400">às {l.hora}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setMedRosto(MEDICOES_ZERADAS);
          setMedQr(MEDICOES_ZERADAS);
          setComRosto((v) => !v);
        }}
        className="self-start px-4 py-3 rounded-lg bg-blue-600 font-semibold"
      >
        {comRosto ? 'Desligar o reconhecimento de rosto' : 'Ligar o reconhecimento de rosto junto'}
      </button>
      {comRosto && estado === 'aberta' && <LacoDoRosto videoRef={videoRef} onMedicao={setMedRosto} />}
    </div>
  );
};

/**
 * O reconhecimento de rosto da tela de ponto rodando junto (a cada 700 ms) — só existe enquanto
 * o botão está ligado, pra os arquivos do reconhecimento só baixarem quando forem medidos.
 */
const LacoDoRosto: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onMedicao: React.Dispatch<React.SetStateAction<Medicoes>>;
}> = ({ videoRef, onMedicao }) => {
  const { ready, error, detectFace } = useFaceApi();
  useEffect(() => {
    if (!ready) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const volta = async () => {
      if (cancelado) return;
      const video = videoRef.current;
      if (video) {
        const t0 = performance.now();
        const rosto = await detectFace(video).catch(() => null);
        const ms = performance.now() - t0;
        if (!cancelado) onMedicao((m) => somarMedicao(m, ms, rosto !== null));
      }
      if (!cancelado) timer = setTimeout(volta, 700);
    };
    void volta();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, detectFace, videoRef, onMedicao]);
  if (error) return <p className="text-red-400">Reconhecimento não carregou: {error}</p>;
  if (!ready) return <p className="text-yellow-300">Carregando o reconhecimento de rosto…</p>;
  return null;
};

const Info: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div className="bg-gray-800 rounded-lg p-2">
    <p className="text-xs text-gray-400">{rotulo}</p>
    <p className="text-lg font-bold">{valor}</p>
  </div>
);
