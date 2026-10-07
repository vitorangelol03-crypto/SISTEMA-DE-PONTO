import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { logClockEvent } from '../../services/database';
import {
  abrirCameraFrontal,
  classificarErroDeCamera,
  descreverErro,
  lerPermissaoDaCamera,
  streamVivo,
  type ProblemaDeCamera,
} from './cameraAccess';

/**
 * A câmera frontal das telas de ponto (sem CPF, com CPF e cadastro do rosto) — 30/09/2026.
 *
 * Antes, cada tela tinha a sua cópia do mesmo código e as três erravam igual: qualquer recusa
 * virava "câmera bloqueada" (ver cameraAccess.ts). Aqui fica o código UMA vez, com:
 *  - erro classificado pelo estado real da permissão, e registrado no servidor;
 *  - "tentar de novo" disparado pelo TOQUE da pessoa (é o que faz o navegador perguntar de novo);
 *  - câmera que MORRE com a tela apagada / app em segundo plano (acontece no tablet que fica
 *    ligado o dia todo) é reaberta quando a tela volta — por evento, não por tempo;
 *  - o vigia de "vídeo preto" que já existia (reabre até 3 vezes se não vier imagem).
 */

export type EstadoDaCamera = 'abrindo' | 'aberta' | 'problema';

export interface UseFrontCamera {
  estado: EstadoDaCamera;
  problema: ProblemaDeCamera | null;
  /** Tentar de novo a partir de um TOQUE da pessoa. */
  reabrir: () => void;
  /**
   * Tentar de novo SEM toque (06/10/2026, modo galpão: o tablet sem toque se recupera sozinho).
   * Não conta como toque — o registro do erro no servidor continua dizendo a verdade.
   */
  tentarSozinho: () => void;
  /** Para a câmera (ex.: rosto confirmado). */
  parar: () => void;
  streamRef: RefObject<MediaStream | null>;
  /** Quantas vezes o vigia de vídeo preto reabriu a câmera (badge de diagnóstico). */
  reaberturasPorVideoPreto: number;
}

export function useFrontCamera(opts: {
  videoRef: RefObject<HTMLVideoElement | null>;
  habilitada: boolean;
  componente: 'FaceIdentifyClock' | 'FaceVerification' | 'FaceRegistration';
  companyId: string | null | undefined;
  employeeId?: string | null;
}): UseFrontCamera {
  const { videoRef, habilitada } = opts;
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<EstadoDaCamera>('abrindo');
  const [problema, setProblema] = useState<ProblemaDeCamera | null>(null);
  const [pedido, setPedido] = useState(0);
  const [reaberturasPorVideoPreto, setReaberturas] = useState(0);
  const pediuComToqueRef = useRef(false);
  // O que o registro no servidor precisa, lido na hora (sem derrubar o efeito da câmera).
  const contextoRef = useRef(opts);
  useEffect(() => { contextoRef.current = opts; });

  const parar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const reabrir = useCallback(() => {
    pediuComToqueRef.current = true;
    setPedido((n) => n + 1);
  }, []);

  const tentarSozinho = useCallback(() => {
    pediuComToqueRef.current = false;
    setPedido((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!habilitada) return;
    let cancelado = false;
    let abrindo = false;
    let vigiaVideoPreto: ReturnType<typeof setTimeout> | null = null;
    let reaberturas = 0;

    const limparVigia = () => {
      if (vigiaVideoPreto) { clearTimeout(vigiaVideoPreto); vigiaVideoPreto = null; }
    };

    const registrarErro = (err: unknown, permissao: string, p: ProblemaDeCamera) => {
      const ctx = contextoRef.current;
      if (!ctx.companyId) return;
      const { name, message } = descreverErro(err);
      void logClockEvent({
        companyId: ctx.companyId,
        employeeId: ctx.employeeId ?? null,
        kind: 'camera_error',
        details: {
          component: ctx.componente,
          name,
          message,
          permissao,
          problema: p,
          pediuComToque: pediuComToqueRef.current,
          visibilidade: typeof document !== 'undefined' ? document.visibilityState : null,
        },
      });
    };

    const anexarAoVideo = async (stream: MediaStream) => {
      const video = videoRef.current;
      if (!video) return;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('autoplay', 'true');
      video.muted = true;
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) resolve();
        else video.onloadedmetadata = () => resolve();
      });
      try {
        await video.play();
      } catch (err) {
        console.warn('video.play() falhou:', err);
      }
    };

    // Trilha encerrada (tela apagou, app foi pro fundo): reabre quando a tela estiver à vista.
    const aoEncerrarTrilha = () => {
      if (cancelado) return;
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void abrir();
    };
    const aoMudarVisibilidade = () => {
      if (cancelado || document.visibilityState !== 'visible') return;
      if (!streamVivo(streamRef.current)) void abrir();
    };

    const abrir = async (): Promise<void> => {
      if (cancelado || abrindo) return;
      abrindo = true;
      limparVigia();
      parar();
      setProblema(null);
      setEstado('abrindo');
      try {
        const stream = await abrirCameraFrontal();
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        stream.getVideoTracks().forEach((t) => t.addEventListener('ended', aoEncerrarTrilha));
        await anexarAoVideo(stream);
        if (cancelado) return;
        pediuComToqueRef.current = false;
        setEstado('aberta');

        // Vigia de vídeo preto (já existia nas 3 telas): sem imagem em 2s, reabre (até 3x).
        vigiaVideoPreto = setTimeout(() => {
          if (cancelado) return;
          const v = videoRef.current;
          if (v && v.videoWidth === 0 && reaberturas < 3) {
            reaberturas += 1;
            setReaberturas(reaberturas);
            console.warn(`Câmera sem imagem, reabrindo (${reaberturas}/3)`);
            parar();
            vigiaVideoPreto = setTimeout(() => { void abrir(); }, 500);
          }
        }, 2000);
      } catch (err) {
        if (cancelado) return;
        console.error(`Erro ao abrir a câmera (${contextoRef.current.componente}):`, err);
        const permissao = await lerPermissaoDaCamera();
        if (cancelado) return;
        const p = classificarErroDeCamera(err, permissao, pediuComToqueRef.current);
        setProblema(p);
        setEstado('problema');
        registrarErro(err, permissao, p);
      } finally {
        abrindo = false;
      }
    };

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    void abrir();

    return () => {
      cancelado = true;
      limparVigia();
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      streamRef.current?.getVideoTracks().forEach((t) => t.removeEventListener('ended', aoEncerrarTrilha));
      parar();
    };
  }, [habilitada, pedido, videoRef, parar]);

  return { estado, problema, reabrir, tentarSozinho, parar, streamRef, reaberturasPorVideoPreto };
}
