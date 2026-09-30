import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, X, Loader2 } from 'lucide-react';
import { getFaceDescriptor, logFaceAttempt, Employee } from '../../services/database';
import { useFaceApi } from '../../hooks/useFaceApi';
import { useCompany } from '../../contexts/useCompany';
import { FaceScanFrame, FaceScanVisual } from './FaceScanFrame';
import { FACE_MATCH_THRESHOLD } from './clockGuards';
import { useFrontCamera } from './useFrontCamera';
import { CameraProblem } from './CameraProblem';

interface FaceVerificationProps {
  employee: Employee;
  /** PIN que a pessoa acabou de digitar — o servidor só entrega o rosto cadastrado com ele (30/09/2026). */
  pin: string;
  /** Recebe o descriptor do rosto reconhecido (128 nºs) — vai pro servidor reconferir. */
  onSuccess: (descriptor: number[]) => void;
  onFail: () => void;
  /**
   * Saída quando a CÂMERA não abre (30/09/2026). Separada de `onFail` porque "reconhecimento
   * facial falhou, procure o supervisor" é mentira quando o rosto nem chegou a ser olhado.
   * Sem ela, cai em `onFail` (comportamento de antes).
   */
  onCameraExit?: () => void;
  maxAttempts?: number;
  clockType?: 'entry' | 'exit' | null;
}

type Phase =
  | 'loading'
  | 'no-face'
  | 'detecting'
  | 'success'
  | 'fail-retry'
  | 'fail-final'
  | 'error';

const MATCH_THRESHOLD = FACE_MATCH_THRESHOLD; // distância < 0.5 = mesmo rosto (o servidor usa o mesmo)
const DETECT_WINDOW_MS = 3000; // tempo com rosto detectado antes de declarar falha

export const FaceVerification: React.FC<FaceVerificationProps> = ({
  employee,
  pin,
  onSuccess,
  onFail,
  onCameraExit,
  maxAttempts = 3,
  clockType = null,
}) => {
  const { company } = useCompany();
  const { loading: modelsLoading, ready: modelsReady, error: modelsError, detectFace, compareFaces } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  // 30/09/2026: a câmera (abrir, erro com a causa certa, reabrir quando a tela volta, vigia de
  // vídeo preto) mora em useFrontCamera — antes era uma cópia deste código em cada tela.
  const camera = useFrontCamera({
    videoRef,
    habilitada: modelsReady,
    componente: 'FaceVerification',
    companyId: company?.id,
    employeeId: employee.id,
  });
  const { parar: stopStream, streamRef } = camera;
  const savedDescriptorRef = useRef<number[] | null>(null);
  const faceFirstSeenRef = useRef<number | null>(null);
  const bestDistanceRef = useRef<number>(1);
  const resultHandledRef = useRef(false);
  const detectInFlightRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [descriptorReady, setDescriptorReady] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [confidence, setConfidence] = useState(0); // 0..1 (1 = match perfeito)
  const [errorMsg, setErrorMsg] = useState('');
  const [debug, setDebug] = useState({ w: 0, h: 0, ready: 0, active: false });

  // Rosto cadastrado da pessoa (a comparação 1:1 roda aqui no navegador).
  useEffect(() => {
    if (!modelsReady || savedDescriptorRef.current) return;
    let cancelled = false;
    getFaceDescriptor(employee.id, pin)
      .then((saved) => {
        if (cancelled) return;
        if (!saved || saved.length === 0) {
          setErrorMsg('Cadastro facial não encontrado.');
          setPhase('error');
          return;
        }
        savedDescriptorRef.current = saved;
        setDescriptorReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Erro ao carregar o rosto cadastrado:', err);
        setErrorMsg('Não foi possível carregar o seu rosto cadastrado. Verifique a internet e tente de novo.');
        setPhase('error');
      });
    return () => { cancelled = true; };
  }, [modelsReady, employee.id, pin]);

  // Câmera aberta + rosto cadastrado carregado = começa a procurar o rosto.
  useEffect(() => {
    if (camera.estado === 'aberta' && descriptorReady && phase === 'loading') setPhase('no-face');
  }, [camera.estado, descriptorReady, phase]);

  // Atualiza badge de debug a cada 500ms
  useEffect(() => {
    const iv = setInterval(() => {
      const v = videoRef.current;
      const stream = streamRef.current;
      setDebug({
        w: v?.videoWidth ?? 0,
        h: v?.videoHeight ?? 0,
        ready: v?.readyState ?? 0,
        active: !!stream && stream.getTracks().some(t => t.readyState === 'live'),
      });
    }, 500);
    return () => clearInterval(iv);
  }, [streamRef]);

  const handleSuccess = useCallback(async (distance: number, descriptor: number[]) => {
    if (resultHandledRef.current) return;
    if (!company?.id) return;
    resultHandledRef.current = true;
    setConfidence(Math.max(0, 1 - distance));
    setPhase('success');
    stopStream();
    await logFaceAttempt(employee.id, true, Math.max(0, 1 - distance), clockType, company.id);
    // O rosto reconhecido segue pro servidor reconferir (trava dura por empresa).
    setTimeout(() => onSuccess(descriptor), 1000);
  }, [employee.id, clockType, onSuccess, company?.id, stopStream]);

  const handleFail = useCallback(async (distance: number) => {
    if (resultHandledRef.current) return;
    if (!company?.id) return;
    resultHandledRef.current = true;
    setConfidence(Math.max(0, 1 - distance));
    await logFaceAttempt(employee.id, false, Math.max(0, 1 - distance), clockType, company.id);

    if (attempt >= maxAttempts) {
      setPhase('fail-final');
      stopStream();
      setTimeout(() => onFail(), 2000);
    } else {
      setPhase('fail-retry');
      setTimeout(() => {
        resultHandledRef.current = false;
        faceFirstSeenRef.current = null;
        bestDistanceRef.current = 1;
        setAttempt(a => a + 1);
        setPhase('no-face');
      }, 1500);
    }
  }, [attempt, maxAttempts, employee.id, clockType, onFail, company?.id, stopStream]);

  // Loop de detecção + match
  useEffect(() => {
    if (phase !== 'no-face' && phase !== 'detecting') return;
    const video = videoRef.current;
    if (!video) return;

    let mounted = true;
    const interval = setInterval(async () => {
      if (!mounted) return;
      const saved = savedDescriptorRef.current;
      // Uma detecção por vez (30/09/2026 — ver o comentário em FaceIdentifyClock): empilhar
      // detecções num aparelho lento é o que deixava a tela "procurando rosto" sem fim.
      if (!saved || detectInFlightRef.current) return;

      try {
        detectInFlightRef.current = true;
        let descriptor: Float32Array | null;
        try {
          descriptor = await detectFace(video);
        } finally {
          detectInFlightRef.current = false;
        }
        if (!mounted) return;
        if (!descriptor) {
          setPhase('no-face');
          faceFirstSeenRef.current = null;
          setConfidence(0);
          return;
        }

        const distance = compareFaces(descriptor, saved);
        setConfidence(Math.max(0, 1 - distance));

        if (distance < bestDistanceRef.current) bestDistanceRef.current = distance;

        if (distance < MATCH_THRESHOLD) {
          handleSuccess(distance, Array.from(descriptor));
          return;
        }

        // rosto detectado mas ainda não bateu
        if (faceFirstSeenRef.current == null) {
          faceFirstSeenRef.current = Date.now();
          setPhase('detecting');
        } else if (Date.now() - faceFirstSeenRef.current > DETECT_WINDOW_MS) {
          handleFail(bestDistanceRef.current);
        } else {
          setPhase('detecting');
        }
      } catch (err) {
        console.error('Erro na verificação:', err);
      }
    }, 600);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [phase, detectFace, compareFaces, handleSuccess, handleFail]);

  // O <video> fica SEMPRE montado; carregando/erro aparecem por cima (30/09/2026 — ver o
  // comentário igual em FaceIdentifyClock: sem isto a câmera abria sem ter onde mostrar a
  // imagem e só o vigia de vídeo preto, 2s depois, reabria).
  const sobreposicao =
    camera.estado === 'problema' && camera.problema ? (
      <CameraProblem
        problema={camera.problema}
        onTentarDeNovo={camera.reabrir}
        onSair={onCameraExit ?? onFail}
        rotuloSair="Voltar"
      />
    ) : (modelsError || phase === 'error') ? (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 text-center">
          <X className="w-12 h-12 mx-auto mb-4 text-red-600" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Erro na verificação</h2>
          <p className="text-sm text-gray-600 mb-5">{errorMsg || modelsError}</p>
          <button
            onClick={onFail}
            className="w-full py-3 bg-gray-700 text-white font-semibold rounded-xl hover:bg-gray-800 min-h-[48px]"
          >
            Voltar
          </button>
        </div>
      </div>
    ) : (modelsLoading || phase === 'loading') ? (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800 mb-1">Preparando verificação...</h2>
          <p className="text-sm text-gray-500">Iniciando reconhecimento facial</p>
        </div>
      </div>
    ) : null;

  const visual: FaceScanVisual =
    phase === 'no-face'     ? { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Procurando rosto...' }
  : phase === 'detecting'   ? { color: 'green', pulse: true,                      label: '🔎 Analisando identidade...' }
  : phase === 'success'     ? { color: 'green', flash: 'success',                 label: '✅ Identidade confirmada!' }
  : phase === 'fail-retry'  ? { color: 'red',   flash: 'fail', shake: true,       label: '❌ Não reconhecido. Tente novamente.' }
  : phase === 'fail-final'  ? { color: 'red',   flash: 'fail', shake: true,       label: '⛔ Muitas tentativas. Procure o supervisor.' }
                            : { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Procurando rosto...' };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/60 text-white">
        <div className="flex items-center gap-2">
          <ScanFace className="w-5 h-5" />
          <div>
            <p className="text-sm font-semibold">Verificação Facial</p>
            <p className="text-xs text-white/70">Tentativa {attempt} de {maxAttempts}</p>
          </div>
        </div>
      </div>

      {/* Camera area — layout simplificado para compat Android */}
      <div style={{ position: 'relative', flex: '1 1 auto', width: '100%', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
          }}
        />

        <FaceScanFrame visual={visual} confidence={confidence} />

        {/* Debug badge */}
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          fontSize: 10,
          color: '#fff',
          background: 'rgba(0,0,0,0.7)',
          padding: '3px 6px',
          borderRadius: 4,
          zIndex: 30,
          fontFamily: 'monospace',
          pointerEvents: 'none',
        }}>
          stream: {debug.active ? 'ativo' : 'off'} | w: {debug.w} | h: {debug.h} | ready: {debug.ready}{camera.reaberturasPorVideoPreto > 0 ? ` | retry: ${camera.reaberturasPorVideoPreto}` : ''}
        </div>
      </div>

      {sobreposicao}
    </div>
  );
};
