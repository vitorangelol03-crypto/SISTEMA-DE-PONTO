import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, ScanFace, Smartphone, XCircle } from 'lucide-react';
import { ErroDoSupervisor, tabletEnviaRosto, tabletLeuQr, type LeituraDoQr } from '../../../services/supervisorTablet';
import { fotoPequenaDoQuadro } from './leitorDeQr';

export type LeituraDoRosto = Extract<LeituraDoQr, { tipo: 'rosto' }>;

export type FimDoSupervisor =
  | { tipo: 'parear'; ignorarFuncionario: string | null }
  | { tipo: 'rosto-enviado'; leitura: LeituraDoRosto }
  | { tipo: 'erro' };

/** Quantas fotos do rosto o tablet manda (o servidor aceita de 3 a 5 e confere se são da mesma pessoa parada). */
export const AMOSTRAS_DO_ROSTO = 4;
/** De quanto em quanto tempo o tablet olha a câmera durante a captura (fotos espaçadas = variação natural). */
const OLHA_A_CADA_MS = 350;
/** Mensagens (conectado, erro) ficam este tempo e somem sozinhas — ninguém toca no tablet. */
const MENSAGEM_MS = 3000;
/** Folga pra o envio chegar antes de o prazo de captura do servidor vencer. */
const FOLGA_DO_PRAZO_MS = 5000;

type Etapa =
  | { e: 'lendo' }
  | { e: 'pareado'; nome: string | null; ignorar: string | null }
  | { e: 'capturando'; leitura: LeituraDoRosto }
  | { e: 'enviando'; leitura: LeituraDoRosto }
  | { e: 'aviso'; texto: string };

/**
 * O TABLET no modo supervisor (07/10/2026, plano do tablet sem toque, entrega F) — aparece por cima
 * da câmera quando o tablet vê o QR do celular do supervisor (o reconhecimento fica pausado só
 * enquanto este cartão está na tela):
 *   - QR de conectar → "Celular de João conectado ✓ — siga pelo celular" e volta a bater ponto;
 *   - QR do rosto → "MARIA, olhe para a câmera" (só UMA pessoa na frente), tira as fotos e manda;
 *     o supervisor confirma no celular enquanto o tablet volta a bater o ponto dos outros;
 *   - erro (QR vencido/usado, rosto parecido com outra pessoa) → o aviso e volta sozinho.
 */
export function TabletModoSupervisor({ videoRef, deviceToken, inicio, detectFace, contarRostos, onFim }: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  deviceToken: string;
  inicio: { qrText: string } | { rosto: LeituraDoRosto };
  detectFace: (video: HTMLVideoElement) => Promise<Float32Array | null>;
  contarRostos: (video: HTMLVideoElement) => Promise<number>;
  onFim: (fim: FimDoSupervisor) => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>(() => ('rosto' in inicio ? { e: 'capturando', leitura: inicio.rosto } : { e: 'lendo' }));
  /** Dica da volta atual da câmera ("só uma pessoa", "olhe para a câmera") — muda a cada foto. */
  const [dica, setDica] = useState<string | null>(null);
  /** O servidor recusou as fotos porque a pessoa se mexeu: o aviso fica até a captura nova terminar. */
  const [mexeu, setMexeu] = useState(false);
  const [fotos, setFotos] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onFimRef = useRef(onFim);
  useEffect(() => { onFimRef.current = onFim; });

  // 1) Lê o QR no servidor (só o texto vai; quem decide é ele) — UMA leitura por QR. O QR é de 1 uso
  //    e o React pode rodar este efeito 2 vezes pro mesmo QR (no modo estrito, sempre): a 2ª leitura
  //    levava "já usado" e jogava fora a 1ª, que tinha ganhado o QR (achado no E2E 137, 07/10/2026).
  //    O pedido fica guardado e quem roda de novo só espera a MESMA resposta.
  const leituraRef = useRef<{ texto: string; pedido: Promise<LeituraDoQr> } | null>(null);
  const qrText = 'qrText' in inicio ? inicio.qrText : null;
  useEffect(() => {
    if (!qrText) return;
    let cancelado = false;
    if (leituraRef.current?.texto !== qrText) leituraRef.current = { texto: qrText, pedido: tabletLeuQr(deviceToken, qrText) };
    leituraRef.current.pedido
      .then((r) => {
        if (cancelado) return;
        if (r.tipo === 'parear') setEtapa({ e: 'pareado', nome: r.supervisor.nome, ignorar: r.funcionarioDoSupervisorId });
        else setEtapa({ e: 'capturando', leitura: r });
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setEtapa({ e: 'aviso', texto: err instanceof ErroDoSupervisor ? err.message : 'Sem internet — o código não foi lido.' });
      });
    return () => { cancelado = true; };
  }, [qrText, deviceToken]);

  // 2) Mensagens que somem sozinhas.
  useEffect(() => {
    if (etapa.e !== 'pareado' && etapa.e !== 'aviso') return;
    const fim: FimDoSupervisor = etapa.e === 'pareado' ? { tipo: 'parear', ignorarFuncionario: etapa.ignorar } : { tipo: 'erro' };
    const t = setTimeout(() => onFimRef.current(fim), MENSAGEM_MS);
    return () => clearTimeout(t);
  }, [etapa]);

  // 3) A captura: só com UMA pessoa na frente; AMOSTRAS_DO_ROSTO fotos espaçadas; manda pro servidor.
  // 'enviando' usa a MESMA leitura (mesmo objeto): trocar o cartão pra "Enviando…" não pode desmontar
  // a captura no meio do envio. "Mexeu" recomeça com uma leitura nova (cópia) — aí ela reinicia.
  const leituraDaCaptura = etapa.e === 'capturando' || etapa.e === 'enviando' ? etapa.leitura : null;
  useEffect(() => {
    if (!leituraDaCaptura) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const amostras: number[][] = [];
    const prazo = Date.now() + Math.max(10_000, leituraDaCaptura.prazoCapturaMs - FOLGA_DO_PRAZO_MS);
    setFotos(0);
    setDica(null);

    const enviar = async (video: HTMLVideoElement) => {
      canvasRef.current ??= document.createElement('canvas');
      const foto = fotoPequenaDoQuadro(video, canvasRef.current);
      if (!foto) { proxima(); return; }
      setEtapa({ e: 'enviando', leitura: leituraDaCaptura });
      try {
        // As últimas AMOSTRAS_DO_ROSTO: se a foto pequena falhou numa volta, sobrou uma a mais (o servidor aceita até 5).
        await tabletEnviaRosto(deviceToken, leituraDaCaptura.qrId, amostras.slice(-AMOSTRAS_DO_ROSTO), foto);
        if (!cancelado) onFimRef.current({ tipo: 'rosto-enviado', leitura: leituraDaCaptura });
      } catch (err) {
        if (cancelado) return;
        if (err instanceof ErroDoSupervisor && err.motivo === 'mexeu') {
          // Mexeu entre as fotos: recomeça a captura (o QR continua valendo até o prazo).
          setEtapa({ e: 'capturando', leitura: { ...leituraDaCaptura } });
          setMexeu(true);
          return;
        }
        setEtapa({ e: 'aviso', texto: err instanceof ErroDoSupervisor ? err.message : 'Sem internet — o rosto não foi enviado.' });
      }
    };

    const proxima = () => { if (!cancelado) timer = setTimeout(() => { void passo(); }, OLHA_A_CADA_MS); };
    const passo = async () => {
      if (cancelado) return;
      if (Date.now() > prazo) {
        setEtapa({ e: 'aviso', texto: 'O tempo pra tirar o rosto acabou — gere outro código no celular.' });
        return;
      }
      const video = videoRef.current;
      if (!video) { proxima(); return; }
      try {
        const rostos = await contarRostos(video);
        if (cancelado) return;
        if (rostos !== 1) {
          amostras.length = 0;
          setFotos(0);
          setDica(rostos > 1 ? 'Só uma pessoa na frente do tablet.' : 'Olhe para a câmera.');
          proxima();
          return;
        }
        const d = await detectFace(video);
        if (cancelado) return;
        if (d) {
          amostras.push(Array.from(d));
          setFotos(amostras.length);
          setDica(null);
          if (amostras.length >= AMOSTRAS_DO_ROSTO) { await enviar(video); return; }
        }
      } catch (err) {
        console.error('Modo supervisor: a captura do rosto falhou nesta volta:', err);
      }
      proxima();
    };
    void passo();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [leituraDaCaptura, deviceToken, videoRef, detectFace, contarRostos]);

  const cartao = (conteudo: React.ReactNode, cor: string) => (
    <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4" data-testid="tablet-modo-supervisor">
      <div
        className="rounded-2xl shadow-2xl p-5 w-full max-w-md text-center space-y-2 border border-transparent"
        style={{ background: `linear-gradient(rgba(10,8,22,0.94), rgba(10,8,22,0.94)) padding-box, linear-gradient(110deg, ${cor}, #39E6FF) border-box` }}
      >
        {conteudo}
      </div>
    </div>
  );

  if (etapa.e === 'lendo') {
    return cartao(<p className="text-white text-xl font-bold flex items-center justify-center gap-2"><Loader2 className="w-6 h-6 animate-spin" /> Lendo o código…</p>, '#A879FF');
  }
  if (etapa.e === 'pareado') {
    return cartao(<>
      <Smartphone className="w-10 h-10 mx-auto text-[#35F59B]" />
      <p className="text-white text-xl font-bold" data-testid="tablet-celular-conectado">Celular {etapa.nome ? `de ${etapa.nome.split(' ')[0]} ` : ''}conectado ✓</p>
      <p className="text-white/70">Siga pelo celular.</p>
    </>, '#35F59B');
  }
  if (etapa.e === 'aviso') {
    return cartao(<>
      <XCircle className="w-10 h-10 mx-auto text-[#FF4D68]" />
      <p className="text-white text-lg font-semibold" data-testid="tablet-supervisor-aviso">{etapa.texto}</p>
    </>, '#FF4D68');
  }
  const leitura = etapa.leitura;
  return cartao(<>
    <ScanFace className="w-10 h-10 mx-auto text-[#39E6FF]" />
    <p className="text-white text-3xl font-extrabold leading-tight" data-testid="tablet-captura-nome">{leitura.primeiroNome}, olhe para a câmera</p>
    <p className="text-white/80">Só uma pessoa na frente do tablet, parada.</p>
    {etapa.e === 'enviando' ? (
      <p className="text-[#39E6FF] flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Enviando o rosto…</p>
    ) : (
      <div className="flex justify-center gap-2" aria-label={`${fotos} de ${AMOSTRAS_DO_ROSTO} fotos`}>
        {Array.from({ length: AMOSTRAS_DO_ROSTO }, (_, i) => (
          i < fotos ? <CheckCircle key={i} className="w-6 h-6 text-[#35F59B]" /> : <span key={i} className="w-6 h-6 rounded-full border-2 border-white/40 inline-block" />
        ))}
      </div>
    )}
    {mexeu && <p className="text-[#FFC85A] font-semibold" data-testid="tablet-captura-mexeu">Fique parado olhando para a câmera.</p>}
    {dica && <p className="text-[#FFC85A] font-semibold">{dica}</p>}
  </>, '#39E6FF');
}
