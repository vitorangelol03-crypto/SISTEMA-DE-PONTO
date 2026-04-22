import { useCallback, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODELS_URL = '/models';

let modelsLoadingPromise: Promise<void> | null = null;
let modelsLoaded = false;

async function loadModelsOnce(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoadingPromise) return modelsLoadingPromise;
  modelsLoadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    modelsLoaded = true;
  })();
  return modelsLoadingPromise;
}

export interface UseFaceApi {
  loading: boolean;
  ready: boolean;
  error: string | null;
  detectFace: (video: HTMLVideoElement) => Promise<Float32Array | null>;
  compareFaces: (a: Float32Array | number[], b: Float32Array | number[]) => number;
  faceapi: typeof faceapi;
}

export function useFaceApi(): UseFaceApi {
  const [loading, setLoading] = useState(!modelsLoaded);
  const [ready, setReady] = useState(modelsLoaded);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  const detectFace = useCallback(
    async (video: HTMLVideoElement): Promise<Float32Array | null> => {
      if (!modelsLoaded) return null;
      if (video.readyState < 2 || video.videoWidth === 0) return null;
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      return detection?.descriptor ?? null;
    },
    []
  );

  const compareFaces = useCallback(
    (a: Float32Array | number[], b: Float32Array | number[]): number => {
      const arrA = a instanceof Float32Array ? a : new Float32Array(a);
      const arrB = b instanceof Float32Array ? b : new Float32Array(b);
      return faceapi.euclideanDistance(arrA, arrB);
    },
    []
  );

  return { loading, ready, error, detectFace, compareFaces, faceapi };
}
