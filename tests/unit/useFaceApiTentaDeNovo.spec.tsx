/**
 * Arquivos do reconhecimento que falharam ao baixar (06/10/2026, plano do tablet sem toque): antes a
 * promessa REJEITADA ficava guardada pra sempre e nenhuma tela carregava de novo sem recarregar a
 * página — no tablet sem toque, ninguém recarrega. Agora a falha é esquecida e `tentarDeNovo`
 * carrega de novo (o modo galpão chama sozinho a cada 30 s; as 3 telas de câmera ganham).
 *
 * Roda com: npx vitest run useFaceApiTentaDeNovo
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const carregar = vi.fn();

vi.mock('face-api.js', () => {
  const rede = { loadFromUri: (...a: unknown[]) => carregar(...a) };
  return {
    nets: { tinyFaceDetector: rede, faceLandmark68TinyNet: rede, faceRecognitionNet: rede },
    TinyFaceDetectorOptions: class {},
    detectSingleFace: () => ({ withFaceLandmarks: () => ({ withFaceDescriptor: async () => undefined }) }),
    euclideanDistance: () => 0,
  };
});

import { useFaceApi } from '../../src/hooks/useFaceApi';

describe('useFaceApi — a falha de download não fica guardada pra sempre', () => {
  it('1ª tentativa falha (rede caiu) → erro; tentarDeNovo carrega e fica pronto', async () => {
    carregar.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFaceApi());
    await waitFor(() => expect(result.current.error).toBe('Failed to fetch'));
    expect(result.current.ready).toBe(false);

    act(() => result.current.tentarDeNovo());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();
    // 3 arquivos na 1ª tentativa + 3 na 2ª: a 2ª baixou de novo de verdade.
    expect(carregar).toHaveBeenCalledTimes(6);
  });
});
