import { useCallback, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODELS_URL = '/models';

let modelsLoadingPromise: Promise<void> | null = null;
let modelsLoaded = false;

async function loadModelsOnce(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoadingPromise) return modelsLoadingPromise;
  const tentativa = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    // Warmup invisível: compila shaders WebGL antes do 1º uso real.
    // Elimina 1-3s de cold start na primeira inferência em mobile.
    try {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 224;
        canvas.height = 224;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, 224, 224);
        }
        await faceapi
          .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks(true)
          .withFaceDescriptor();
      }
    } catch {
      // Warmup pode falhar (ex: ambiente sem WebGL) — não bloqueia uso real
    }
    modelsLoaded = true;
  })();
  // 06/10/2026 (plano do tablet sem toque): falhou o download (rede caiu no galpão)? Esquece a
  // tentativa. Antes a promessa REJEITADA ficava guardada pra sempre e nenhuma tela conseguia
  // carregar de novo sem recarregar a página — no tablet sem toque, ninguém recarrega.
  modelsLoadingPromise = tentativa.catch((err: unknown) => {
    modelsLoadingPromise = null;
    throw err;
  });
  return modelsLoadingPromise;
}

export interface UseFaceApi {
  loading: boolean;
  ready: boolean;
  error: string | null;
  /** Tenta carregar de novo depois de um erro (06/10/2026 — o tablet sem toque se recupera sozinho). */
  tentarDeNovo: () => void;
  detectFace: (video: HTMLVideoElement) => Promise<Float32Array | null>;
  /**
   * Quantos rostos há no quadro agora (07/10/2026, modo supervisor do tablet: o rosto de quem está
   * sendo cadastrado só vale com UMA pessoa na frente — detectFace pega só o maior).
   */
  contarRostos: (video: HTMLVideoElement) => Promise<number>;
  compareFaces: (a: Float32Array | number[], b: Float32Array | number[]) => number;
  faceapi: typeof faceapi;
}

export function useFaceApi(): UseFaceApi {
  const [loading, setLoading] = useState(!modelsLoaded);
  const [ready, setReady] = useState(modelsLoaded);
  const [error, setError] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (modelsLoaded) {
      setLoading(false);
      setReady(true);
      return;
    }
    setLoading(true);
    loadModelsOnce()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Erro ao carregar modelos';
        setError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tentativa]);

  const detectFace = useCallback(
    async (video: HTMLVideoElement): Promise<Float32Array | null> => {
      if (!modelsLoaded) return null;
      if (video.readyState < 2 || video.videoWidth === 0) return null;
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      return detection?.descriptor ?? null;
    },
    []
  );

  const contarRostos = useCallback(async (video: HTMLVideoElement): Promise<number> => {
    if (!modelsLoaded) return 0;
    if (video.readyState < 2 || video.videoWidth === 0) return 0;
    const deteccoes = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }));
    return deteccoes.length;
  }, []);

  const compareFaces = useCallback(
    (a: Float32Array | number[], b: Float32Array | number[]): number => {
      const arrA = a instanceof Float32Array ? a : new Float32Array(a);
      const arrB = b instanceof Float32Array ? b : new Float32Array(b);
      return faceapi.euclideanDistance(arrA, arrB);
    },
    []
  );

  return { loading, ready, error, tentarDeNovo, detectFace, contarRostos, compareFaces, faceapi };
}
