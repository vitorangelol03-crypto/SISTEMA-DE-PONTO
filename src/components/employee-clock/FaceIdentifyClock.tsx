import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, X, Loader2, UserCircle2 } from 'lucide-react';
import { identifyFace, getEmployeeTodayAttendance, getEmployeeByCpf, Employee, Company } from '../../services/database';
import { useFaceApi } from '../../hooks/useFaceApi';
import { FaceScanFrame, FaceScanVisual } from './FaceScanFrame';
import { MarkingPosition, resolveMarkingCount, resolveNextClockAction } from './clockGuards';

interface FaceIdentifyClockProps {
  company: Company;
  /** Depois de "NOME, confirma?" contar 3s sem cancelar — o pai faz o registro de fato. */
  onConfirmed: (employee: Employee, descriptor: number[], type: 'entry' | 'exit', markingPosition?: MarkingPosition) => void;
  onUseCpf: () => void;
}

type Phase =
  | 'loading'
  | 'scanning'
  | 'identifying'
  | 'identified'
  | 'no-match'
  | 'already-done'
  | 'error'
  | 'camera-blocked';

// Pedido do Victor (04/09/2026): "não pode confundir, tem que ser robusta" —
// nunca gravamos ponto sem a pessoa ver o próprio nome e ter uma chance real
// de cancelar. 3s é o mesmo tipo de janela que o app já usa noutros lugares
// (ex.: auto-logout), curto o bastante pra não travar a fila de gente.
const CONFIRM_COUNTDOWN_SECONDS = 3;
// Depois de identificado (confirmado OU cancelado), ignora esta pessoa por um
// tempo — evita reconhecer a mesma pessoa de novo enquanto ela ainda está
// saindo de frente da câmera.
const SAME_PERSON_COOLDOWN_MS = 6000;
const SCAN_INTERVAL_MS = 700;
const IDENTIFY_COOLDOWN_MS = 1200; // não martela o servidor a cada frame

export const FaceIdentifyClock: React.FC<FaceIdentifyClockProps> = ({ company, onConfirmed, onUseCpf }) => {
  const { loading: modelsLoading, ready: modelsReady, error: modelsError, detectFace } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastIdentifyAtRef = useRef(0);
  const identifyInFlightRef = useRef(false);
  const recentRef = useRef<Map<string, number>>(new Map()); // employeeId -> timestamp do último resultado
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [identified, setIdentified] = useState<{
    employee: Employee;
    descriptor: number[];
    type: 'entry' | 'exit';
    markingPosition?: MarkingPosition;
    label: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const clearTimers = () => {
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    if (resumeTimerRef.current) { clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
  };

  // Câmera (mesmo padrão de FaceVerification.tsx, com auto-retry de vídeo preto)
  useEffect(() => {
    if (!modelsReady) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    const startCamera = async (): Promise<void> => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('A câmera não está disponível neste navegador. Acesse via HTTPS ou localhost.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.setAttribute('playsinline', 'true');
          video.setAttribute('muted', 'true');
          video.setAttribute('autoplay', 'true');
          video.muted = true;
          video.srcObject = stream;
          await new Promise<void>((resolve) => {
            if (video.readyState >= 1) resolve();
            else video.onloadedmetadata = () => resolve();
          });
          try { await video.play(); } catch (err) { console.warn('video.play() falhou:', err); }
        }
        setPhase('scanning');

        retryTimer = setTimeout(() => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.videoWidth === 0 && retryCount < 3) {
            retryCount++;
            console.warn(`Câmera sem frame, retry #${retryCount}`);
            stopStream();
            setTimeout(() => { if (!cancelled) startCamera(); }, 500);
          }
        }, 2000);
      } catch (err) {
        console.error('Erro ao iniciar reconhecimento:', err);
        // 04/09/2026: câmera BLOQUEADA é diferente de qualquer outro erro — o
        // navegador não pergunta de novo sozinho. Mostra como liberar de verdade
        // (o botão de CPF/senha continua disponível como saída, como sempre).
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          setPhase('camera-blocked');
          return;
        }
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
  }, [modelsReady]);

  useEffect(() => () => { clearTimers(); }, []);

  // Volta a escanear depois de um resultado (identificado/recusado/já completo)
  const resumeScanning = useCallback(() => {
    clearTimers();
    setIdentified(null);
    setCountdown(0);
    setPhase('scanning');
  }, []);

  const startConfirmCountdown = useCallback((
    employee: Employee, descriptor: number[], type: 'entry' | 'exit', markingPosition: MarkingPosition | undefined, label: string,
  ) => {
    setIdentified({ employee, descriptor, type, markingPosition, label });
    setPhase('identified');
    setCountdown(CONFIRM_COUNTDOWN_SECONDS);
    let left = CONFIRM_COUNTDOWN_SECONDS;
    countdownTimerRef.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        onConfirmed(employee, descriptor, type, markingPosition);
      }
    }, 1000);
  }, [onConfirmed]);

  const cancelConfirm = () => {
    if (identified) recentRef.current.set(identified.employee.id, Date.now());
    resumeScanning();
  };

  // Loop de escaneamento — detecta um rosto e, respeitando um cooldown entre
  // chamadas, pede pro servidor identificar (1:N roda SÓ no servidor).
  useEffect(() => {
    if (phase !== 'scanning') return;
    const video = videoRef.current;
    if (!video) return;
    let mounted = true;

    const interval = setInterval(async () => {
      if (!mounted || identifyInFlightRef.current) return;
      const now = Date.now();
      if (now - lastIdentifyAtRef.current < IDENTIFY_COOLDOWN_MS) return;

      try {
        const descriptor = await detectFace(video);
        if (!mounted || !descriptor) return;

        lastIdentifyAtRef.current = now;
        identifyInFlightRef.current = true;
        setPhase('identifying');

        const result = await identifyFace(company.id, Array.from(descriptor));
        if (!mounted) return;

        if (!result.matched || !result.employeeId) {
          setPhase('no-match');
          resumeTimerRef.current = setTimeout(() => { if (mounted) resumeScanning(); }, 1500);
          return;
        }

        // Cooldown: acabou de ser identificado/recusado agora mesmo — ignora
        // pra não reconhecer a mesma pessoa de novo enquanto ela some da tela.
        const lastSeen = recentRef.current.get(result.employeeId);
        if (lastSeen && now - lastSeen < SAME_PERSON_COOLDOWN_MS) {
          setPhase('scanning');
          return;
        }

        // Busca o funcionário completo (marking_count etc.) — identifyFace só
        // devolve o mínimo (id/nome/cpf), de propósito.
        const emp = await getEmployeeByCpf(result.cpf!, company.id);
        if (!mounted) return;
        if (!emp) { setPhase('scanning'); return; }

        const today = await getEmployeeTodayAttendance(emp.id, company.id);
        if (!mounted) return;

        const markingCount = resolveMarkingCount(emp, company);
        const action = resolveNextClockAction(today, markingCount);
        if (!action) {
          recentRef.current.set(emp.id, now);
          setPhase('already-done');
          setIdentified({ employee: emp, descriptor: Array.from(descriptor), type: 'entry', label: emp.name.split(' ')[0] });
          resumeTimerRef.current = setTimeout(() => { if (mounted) resumeScanning(); }, 2500);
          return;
        }

        startConfirmCountdown(emp, Array.from(descriptor), action.type, action.markingPosition, action.label);
      } catch (err) {
        console.error('Erro no reconhecimento sem CPF:', err);
        setPhase('scanning');
      } finally {
        identifyInFlightRef.current = false;
      }
    }, SCAN_INTERVAL_MS);

    return () => { mounted = false; clearInterval(interval); };
  }, [phase, detectFace, company, resumeScanning, startConfirmCountdown]);

  if (modelsLoading || phase === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Preparando reconhecimento...</h2>
            <p className="text-sm text-gray-500">Carregando câmera</p>
          </div>
          {/* Conexão lenta pode deixar isto demorado — nunca prende a pessoa sem saída. */}
          <button onClick={onUseCpf} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]">
            Prefere digitar CPF e senha?
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'camera-blocked') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 text-center space-y-3">
          <h2 className="text-lg font-bold text-gray-800">📷 Câmera bloqueada</h2>
          <p className="text-sm text-gray-600 text-left">
            Para bater o ponto pela câmera, ela precisa estar <strong>liberada no navegador</strong>. Libere assim:
          </p>
          <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside bg-gray-50 rounded-xl p-3 text-left">
            <li>Toque no <strong>cadeado</strong> (ou ⓘ) ao lado do endereço do site</li>
            <li>Toque em <strong>Permissões</strong></li>
            <li>Em <strong>Câmera</strong>, escolha <strong>Permitir</strong></li>
          </ol>
          <p className="text-xs text-gray-500 text-left">
            Se não aparecer, vá nas Configurações do celular → Aplicativos → seu navegador → Permissões → Câmera → Permitir.
          </p>
          <button onClick={onUseCpf} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 min-h-[48px]">
            Prefere entrar com CPF e senha?
          </button>
        </div>
      </div>
    );
  }

  if (modelsError || phase === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 text-center space-y-4">
          <X className="w-12 h-12 mx-auto text-red-600" />
          <h2 className="text-lg font-bold text-gray-800">Erro na câmera</h2>
          <p className="text-sm text-gray-600">{errorMsg || modelsError}</p>
          <button onClick={onUseCpf} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 min-h-[48px]">
            Entrar com CPF e senha
          </button>
        </div>
      </div>
    );
  }

  const visual: FaceScanVisual =
    phase === 'scanning'      ? { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Aproxime o rosto da câmera' }
  : phase === 'identifying'   ? { color: 'blue',  pulse: true,                     label: '🔎 Identificando...' }
  : phase === 'identified'    ? { color: 'green', flash: 'success',                label: `👋 ${identified?.employee.name.split(' ')[0]} — ${identified?.label}` }
  : phase === 'already-done'  ? { color: 'green',                                  label: `✅ ${identified?.employee.name.split(' ')[0]}, ponto completo hoje!` }
  : phase === 'no-match'      ? { color: 'red',   shake: true,                     label: '❌ Não reconheci. Tente de novo.' }
                               : { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Aproxime o rosto da câmera' };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/60 text-white">
        <div className="flex items-center gap-2">
          <ScanFace className="w-5 h-5" />
          <p className="text-sm font-semibold">Reconhecimento facial — Registro de Ponto</p>
        </div>
      </div>

      <div style={{ position: 'relative', flex: '1 1 auto', width: '100%', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'cover', transform: 'scaleX(-1)',
          }}
        />
        <FaceScanFrame visual={visual} countdown={phase === 'identified' ? countdown : 0} />
      </div>

      {/* ── Confirmação (cancelável) ── */}
      {phase === 'identified' && identified && (
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-4 w-full max-w-sm text-center space-y-3">
            <UserCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <p className="text-gray-900 font-bold">{identified.employee.name}</p>
            <p className="text-sm text-gray-500">Registrando <strong>{identified.label}</strong> em {countdown}s...</p>
            <button
              onClick={cancelConfirm}
              className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]"
            >
              Não sou eu / Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Alternativa manual (sempre disponível) ── */}
      {(phase === 'scanning' || phase === 'no-match') && (
        <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center px-4">
          <button
            onClick={onUseCpf}
            className="px-5 py-2.5 bg-white/90 text-gray-800 text-sm font-semibold rounded-full shadow-lg hover:bg-white transition-colors"
          >
            Prefere digitar CPF e senha?
          </button>
        </div>
      )}
    </div>
  );
};
