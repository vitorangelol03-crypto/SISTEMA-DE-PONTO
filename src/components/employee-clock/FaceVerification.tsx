import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { getFaceDescriptor, logFaceAttempt, Employee } from '../../services/database';
import { useFaceApi } from '../../hooks/useFaceApi';

interface FaceVerificationProps {
  employee: Employee;
  onSuccess: () => void;
  onFail: () => void;
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

const MATCH_THRESHOLD = 0.5; // distância < 0.5 = mesmo rosto
const DETECT_WINDOW_MS = 3000; // tempo com rosto detectado antes de declarar falha

export const FaceVerification: React.FC<FaceVerificationProps> = ({
  employee,
  onSuccess,
  onFail,
  maxAttempts = 3,
  clockType = null,
}) => {
  const { loading: modelsLoading, ready: modelsReady, error: modelsError, detectFace, compareFaces } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const savedDescriptorRef = useRef<number[] | null>(null);
  const faceFirstSeenRef = useRef<number | null>(null);
  const bestDistanceRef = useRef<number>(1);
  const resultHandledRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState(1);
  const [confidence, setConfidence] = useState(0); // 0..1 (1 = match perfeito)
  const [errorMsg, setErrorMsg] = useState('');
  const [debug, setDebug] = useState({ w: 0, h: 0, ready: 0, active: false, retries: 0 });

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // Carrega descriptor salvo + câmera (com auto-retry em caso de vídeo preto)
  useEffect(() => {
    if (!modelsReady) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    const startCamera = async (): Promise<void> => {
      try {
        if (!savedDescriptorRef.current) {
          const saved = await getFaceDescriptor(employee.id);
          if (cancelled) return;
          if (!saved || saved.length === 0) {
            setErrorMsg('Cadastro facial não encontrado.');
            setPhase('error');
            return;
          }
          savedDescriptorRef.current = saved;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('A câmera não está disponível neste navegador. Acesse via HTTPS ou localhost.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.setAttribute('playsinline', 'true');
          video.setAttribute('muted', 'true');
          video.setAttribute('autoplay', 'true');
          video.muted = true;
          video.srcObject = stream;
          await new Promise<void>((resolve) => {
            if (video.readyState >= 1) {
              resolve();
            } else {
              video.onloadedmetadata = () => resolve();
            }
          });
          try {
            await video.play();
          } catch (err) {
            console.warn('video.play() falhou:', err);
          }
        }
        setPhase('no-face');

        // Watchdog: reinicia se após 2s não houver frame
        retryTimer = setTimeout(() => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.videoWidth === 0 && retryCount < 3) {
            retryCount++;
            setDebug(d => ({ ...d, retries: retryCount }));
            console.warn(`Câmera sem frame, retry #${retryCount}`);
            stopStream();
            setTimeout(() => { if (!cancelled) startCamera(); }, 500);
          }
        }, 2000);
      } catch (err) {
        console.error('Erro ao iniciar verificação:', err);
        const msg = err instanceof Error ? err.message : 'Não foi possível acessar a câmera.';
        setErrorMsg(msg.includes('HTTPS') ? msg : 'Não foi possível acessar a câmera.');
        setPhase('error');
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      stopStream();
    };
  }, [modelsReady, employee.id]);

  // Atualiza badge de debug a cada 500ms
  useEffect(() => {
    const iv = setInterval(() => {
      const v = videoRef.current;
      const stream = streamRef.current;
      setDebug(d => ({
        ...d,
        w: v?.videoWidth ?? 0,
        h: v?.videoHeight ?? 0,
        ready: v?.readyState ?? 0,
        active: !!stream && stream.getTracks().some(t => t.readyState === 'live'),
      }));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  const handleSuccess = useCallback(async (distance: number) => {
    if (resultHandledRef.current) return;
    resultHandledRef.current = true;
    setConfidence(Math.max(0, 1 - distance));
    setPhase('success');
    stopStream();
    await logFaceAttempt(employee.id, true, Math.max(0, 1 - distance), clockType);
    setTimeout(() => onSuccess(), 1000);
  }, [employee.id, clockType, onSuccess]);

  const handleFail = useCallback(async (distance: number) => {
    if (resultHandledRef.current) return;
    resultHandledRef.current = true;
    setConfidence(Math.max(0, 1 - distance));
    await logFaceAttempt(employee.id, false, Math.max(0, 1 - distance), clockType);

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
  }, [attempt, maxAttempts, employee.id, clockType, onFail]);

  // Loop de detecção + match
  useEffect(() => {
    if (phase !== 'no-face' && phase !== 'detecting') return;
    const video = videoRef.current;
    if (!video) return;

    let mounted = true;
    const interval = setInterval(async () => {
      if (!mounted) return;
      const saved = savedDescriptorRef.current;
      if (!saved) return;

      try {
        const descriptor = await detectFace(video);
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
          handleSuccess(distance);
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
    }, 400);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [phase, detectFace, compareFaces, handleSuccess, handleFail]);

  // Loading / erro
  if (modelsLoading || phase === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800 mb-1">Preparando verificação...</h2>
          <p className="text-sm text-gray-500">Iniciando reconhecimento facial</p>
        </div>
      </div>
    );
  }

  if (modelsError || phase === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
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
    );
  }

  const flashBg =
    phase === 'success' ? 'rgba(34,197,94,0.3)'
    : phase === 'fail-retry' || phase === 'fail-final' ? 'rgba(239,68,68,0.3)'
    : '';

  const ringColor =
    phase === 'success' ? '#4ade80' // green-400
    : phase === 'fail-retry' || phase === 'fail-final' ? '#f87171' // red-400
    : phase === 'detecting' ? '#60a5fa' // blue-400
    : '#9ca3af'; // gray-400

  const confPct = Math.round(confidence * 100);
  const barColor = confidence >= 0.5 ? 'bg-green-500' : confidence >= 0.3 ? 'bg-yellow-500' : 'bg-red-500';

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

        {/* Overlay escuro com recorte circular */}
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.6)',
          WebkitMaskImage: 'radial-gradient(circle at center, transparent 140px, black 142px)',
          maskImage: 'radial-gradient(circle at center, transparent 140px, black 142px)',
        }} />

        {/* Anel central */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 280,
          height: 280,
          marginTop: -140,
          marginLeft: -140,
          borderRadius: '50%',
          border: `4px solid ${ringColor}`,
          transition: 'border-color 300ms',
          pointerEvents: 'none',
        }}>
          {phase === 'success' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.3)', borderRadius: '50%' }}>
              <Check className="w-24 h-24 text-white drop-shadow-lg" />
            </div>
          )}
          {(phase === 'fail-retry' || phase === 'fail-final') && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.3)', borderRadius: '50%' }}>
              <X className="w-24 h-24 text-white drop-shadow-lg" />
            </div>
          )}
        </div>

        {/* Flash overlay */}
        {flashBg && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: flashBg, transition: 'opacity 300ms' }} />
        )}

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
          stream: {debug.active ? 'ativo' : 'off'} | w: {debug.w} | h: {debug.h} | ready: {debug.ready}{debug.retries > 0 ? ` | retry: ${debug.retries}` : ''}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="relative z-10 px-4 py-4 bg-black/80 text-white">
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-white/70">Confiança</span>
            <span className="font-mono">{confPct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} transition-all duration-300`}
              style={{ width: `${confPct}%` }}
            />
          </div>
        </div>

        {phase === 'no-face' && (
          <p className="text-sm text-center text-white/90">Posicione seu rosto dentro do círculo</p>
        )}
        {phase === 'detecting' && (
          <p className="text-sm text-center text-blue-300">Analisando...</p>
        )}
        {phase === 'success' && (
          <p className="text-sm text-center font-bold text-green-300">✅ Identidade confirmada!</p>
        )}
        {phase === 'fail-retry' && (
          <p className="text-sm text-center text-red-300">❌ Rosto não reconhecido. Tente novamente.</p>
        )}
        {phase === 'fail-final' && (
          <div className="text-center text-red-300">
            <AlertTriangle className="w-6 h-6 mx-auto mb-1" />
            <p className="text-sm font-semibold">Muitas tentativas. Procure o supervisor.</p>
          </div>
        )}
      </div>
    </div>
  );
};
