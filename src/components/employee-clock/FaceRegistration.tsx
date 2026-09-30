import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { saveFaceData, Employee } from '../../services/database';
import { useFaceApi } from '../../hooks/useFaceApi';
import { FaceScanFrame, FaceScanVisual } from './FaceScanFrame';
import { useFrontCamera } from './useFrontCamera';
import { CameraProblem } from './CameraProblem';
import toast from 'react-hot-toast';

interface FaceRegistrationProps {
  employee: Employee;
  /** PIN que a pessoa acabou de digitar/criar — o servidor só grava o rosto com ele (30/09/2026). */
  pin: string;
  onComplete: () => void;
  onSkip?: () => void;
}

type Phase = 'loading' | 'no-face' | 'detected' | 'capturing' | 'saving' | 'success' | 'error';

export const FaceRegistration: React.FC<FaceRegistrationProps> = ({ employee, pin, onComplete, onSkip }) => {
  const { loading: modelsLoading, ready: modelsReady, error: modelsError, detectFace } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  // 30/09/2026: câmera em useFrontCamera (erro com a causa certa, reabre quando a tela volta,
  // vigia de vídeo preto) — antes, qualquer erro virava "verifique as permissões".
  const camera = useFrontCamera({
    videoRef,
    habilitada: modelsReady,
    componente: 'FaceRegistration',
    companyId: employee.company_id,
    employeeId: employee.id,
  });
  const { parar: stopStream, streamRef } = camera;
  const lastDescriptorRef = useRef<Float32Array | null>(null);
  const countdownStartedRef = useRef(false);
  const detectInFlightRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [countdown, setCountdown] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [debug, setDebug] = useState({ w: 0, h: 0, ready: 0, active: false });

  // Câmera aberta pela 1ª vez = começa a procurar o rosto.
  useEffect(() => {
    if (camera.estado === 'aberta' && phase === 'loading') setPhase('no-face');
  }, [camera.estado, phase]);

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

  // Loop de detecção a cada 500ms
  useEffect(() => {
    if (phase !== 'no-face' && phase !== 'detected') return;
    const video = videoRef.current;
    if (!video) return;

    let mounted = true;
    const interval = setInterval(async () => {
      // Uma detecção por vez (30/09/2026 — ver o comentário em FaceIdentifyClock): empilhar
      // detecções num aparelho lento é o que deixava a tela "procurando rosto" sem fim.
      if (!mounted || detectInFlightRef.current) return;
      try {
        detectInFlightRef.current = true;
        let descriptor: Float32Array | null;
        try {
          descriptor = await detectFace(video);
        } finally {
          detectInFlightRef.current = false;
        }
        if (!mounted) return;
        if (descriptor) {
          lastDescriptorRef.current = descriptor;
          if (!countdownStartedRef.current) {
            countdownStartedRef.current = true;
            setPhase('detected');
            setCountdown(3);
          }
        } else {
          lastDescriptorRef.current = null;
          countdownStartedRef.current = false;
          setPhase('no-face');
          setCountdown(0);
        }
      } catch (err) {
        console.error('Erro na detecção:', err);
      }
    }, 500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [phase, detectFace]);

  // Countdown 3→2→1→captura
  useEffect(() => {
    if (phase !== 'detected' || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1) {
        capture();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const descriptor = lastDescriptorRef.current;
    if (!video || !descriptor) {
      countdownStartedRef.current = false;
      setPhase('no-face');
      return;
    }
    setPhase('capturing');

    // Captura frame em canvas → JPG
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMsg('Erro ao capturar imagem');
      setPhase('error');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));

    setPhase('saving');
    let photoUrl: string | null = null;

    if (blob) {
      try {
        const path = `${employee.id}/face.jpg`;
        const { error: upErr } = await supabase.storage
          .from('employee-photos')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (upErr) {
          console.warn('Upload da foto falhou, salvando só o descriptor:', upErr.message);
        } else {
          const { data: pub } = supabase.storage.from('employee-photos').getPublicUrl(path);
          photoUrl = pub?.publicUrl ?? null;
        }
      } catch (err) {
        console.warn('Erro no upload da foto:', err);
      }
    }

    try {
      await saveFaceData(employee.id, photoUrl, Array.from(descriptor), pin);
      setPhase('success');
      toast.success('Rosto cadastrado com sucesso!');
      // stop stream antes de chamar onComplete
      stopStream();
      setTimeout(() => onComplete(), 1200);
    } catch (err) {
      console.error('Erro ao salvar descriptor:', err);
      setErrorMsg('Erro ao salvar cadastro. Tente novamente.');
      setPhase('error');
    }
  }, [employee.id, onComplete, stopStream, pin]);

  const retry = () => {
    countdownStartedRef.current = false;
    lastDescriptorRef.current = null;
    setCountdown(0);
    setErrorMsg('');
    setPhase('no-face');
  };

  // O <video> fica SEMPRE montado; carregando/erro aparecem por cima (30/09/2026 — ver o
  // comentário igual em FaceIdentifyClock).
  const sobreposicao =
    camera.estado === 'problema' && camera.problema ? (
      <CameraProblem
        problema={camera.problema}
        onTentarDeNovo={camera.reabrir}
        onSair={onSkip}
        rotuloSair="Voltar"
      />
    ) : (modelsError || phase === 'error') ? (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex overflow-y-auto p-4">
        <div className="m-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 text-center">
          <X className="w-12 h-12 mx-auto mb-4 text-red-600" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Erro no cadastro facial</h2>
          <p className="text-sm text-gray-600 mb-5">{errorMsg || modelsError}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={retry}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 min-h-[48px] flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Tentar novamente
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="w-full py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 min-h-[48px]"
              >
                Voltar
              </button>
            )}
          </div>
        </div>
      </div>
    ) : (modelsLoading || phase === 'loading') ? (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex overflow-y-auto p-4">
        <div className="m-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800 mb-1">Preparando câmera...</h2>
          <p className="text-sm text-gray-500">Carregando reconhecimento facial</p>
        </div>
      </div>
    ) : null;

  const visual: FaceScanVisual =
    phase === 'no-face'   ? { color: 'blue',  pulse: true,  showScanLine: true,  label: '🔍 Procurando rosto...' }
  : phase === 'detected'  ? { color: 'green', pulse: true,                        label: '✅ Rosto detectado! Aguarde...' }
  : phase === 'capturing' ? { color: 'blue',                                       label: '📸 Capturando...' }
  : phase === 'saving'    ? { color: 'blue',                                       label: '💾 Salvando cadastro...' }
  : phase === 'success'   ? { color: 'green', flash: 'success',                   label: '✅ Rosto cadastrado!' }
                          : { color: 'blue',  pulse: true,  showScanLine: true,  label: '🔍 Procurando rosto...' };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/60 text-white">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <div>
            <p className="text-sm font-semibold">Cadastro Facial</p>
            <p className="text-xs text-white/70">{employee.name.split(' ')[0]}</p>
          </div>
        </div>
        {onSkip && phase !== 'success' && phase !== 'saving' && phase !== 'capturing' && (
          <button
            onClick={() => {
              stopStream();
              onSkip();
            }}
            className="p-2 rounded-md hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Cancelar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
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

        <FaceScanFrame
          visual={visual}
          countdown={phase === 'detected' ? countdown : 0}
        />

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
