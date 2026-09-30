import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  abrirCameraFrontal,
  CameraIndisponivelError,
  classificarErroDeCamera,
  lerPermissaoDaCamera,
  streamVivo,
} from '../../src/components/employee-clock/cameraAccess';

/**
 * "Às vezes fala que a câmera está bloqueada, mas não está" (queixa levada ao Victor, 30/09/2026).
 *
 * A tela tratava QUALQUER NotAllowedError como "você bloqueou a câmera". O navegador devolve
 * esse mesmo erro quando o pedido de permissão foi FECHADO (e o Chrome, depois de 3 vezes,
 * passa a recusar sozinho por dias com o site em "Perguntar"), quando o APARELHO não deixa o
 * navegador usar a câmera, e em outros casos com a permissão em "granted"/"prompt". Estes
 * testes travam: cada causa vira a instrução certa — e "bloqueada" só quando é mesmo.
 */

const erro = (name: string, message = '') => new DOMException(message, name);

describe('classificarErroDeCamera', () => {
  it('🎯 o caso da queixa: pedido fechado, permissão ainda "Perguntar" → NÃO é bloqueio, é pedir de novo', () => {
    expect(classificarErroDeCamera(erro('NotAllowedError', 'Permission dismissed'), 'prompt')).toBe('permissao-pendente');
  });

  it('bloqueada DE VERDADE (estado denied) → instrução de liberar no site', () => {
    expect(classificarErroDeCamera(erro('NotAllowedError', 'Permission denied'), 'denied')).toBe('bloqueada-no-navegador');
  });

  it('o APARELHO não deixa o navegador usar a câmera → instrução das configurações do aparelho', () => {
    expect(classificarErroDeCamera(erro('NotAllowedError', 'Permission denied by system'), 'granted')).toBe('bloqueada-no-aparelho');
  });

  it('permissão "granted" e mesmo assim recusou → pede de novo com um toque', () => {
    expect(classificarErroDeCamera(erro('NotAllowedError'), 'granted')).toBe('permissao-pendente');
  });

  it('Safari (não informa o estado) → pede de novo com um toque', () => {
    expect(classificarErroDeCamera(erro('NotAllowedError'), 'unknown')).toBe('permissao-pendente');
  });

  it('já pediu com o toque da pessoa e recusou de novo → aí sim é configuração (bloqueio)', () => {
    expect(classificarErroDeCamera(erro('NotAllowedError', 'Permission denied'), 'prompt', true)).toBe('bloqueada-no-navegador');
  });

  it('nome antigo do erro (PermissionDeniedError) segue a mesma regra', () => {
    expect(classificarErroDeCamera(erro('PermissionDeniedError'), 'denied')).toBe('bloqueada-no-navegador');
  });

  it('câmera ocupada por outro app / travada', () => {
    expect(classificarErroDeCamera(erro('NotReadableError', 'Could not start video source'), 'granted')).toBe('em-uso');
    expect(classificarErroDeCamera(erro('TrackStartError'), 'granted')).toBe('em-uso');
    expect(classificarErroDeCamera(erro('AbortError'), 'granted')).toBe('em-uso');
  });

  it('sem câmera', () => {
    expect(classificarErroDeCamera(erro('NotFoundError'), 'granted')).toBe('sem-camera');
    expect(classificarErroDeCamera(erro('OverconstrainedError'), 'granted')).toBe('sem-camera');
  });

  it('sem HTTPS / navegador sem câmera', () => {
    expect(classificarErroDeCamera(new CameraIndisponivelError(), 'unknown')).toBe('sem-https');
    expect(classificarErroDeCamera(erro('SecurityError'), 'unknown')).toBe('sem-https');
  });

  it('qualquer outra coisa → desconhecido (com botão de tentar de novo)', () => {
    expect(classificarErroDeCamera(new TypeError('boom'), 'granted')).toBe('desconhecido');
    expect(classificarErroDeCamera('texto solto', 'granted')).toBe('desconhecido');
  });
});

describe('lerPermissaoDaCamera', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'permissions');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'permissions', original);
    else delete (navigator as { permissions?: unknown }).permissions;
  });

  it('devolve o estado do navegador', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    });
    expect(await lerPermissaoDaCamera()).toBe('denied');
  });

  it('navegador que não conhece "camera" (Safari) = unknown, sem derrubar a tela', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockRejectedValue(new TypeError("'camera' is not a valid value")) },
    });
    expect(await lerPermissaoDaCamera()).toBe('unknown');
  });

  it('sem a API de permissões = unknown', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
    expect(await lerPermissaoDaCamera()).toBe('unknown');
  });
});

describe('abrirCameraFrontal', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  it('aparelho sem câmera frontal que satisfaça o pedido → tenta de novo com qualquer câmera', async () => {
    const stream = { id: 's' };
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(erro('OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });

    expect(await abrirCameraFrontal()).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0]).toEqual({ video: true, audio: false });
  });

  it('recusa de permissão NÃO insiste (não pede duas vezes seguidas sozinha)', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(erro('NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });

    await expect(abrirCameraFrontal()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('navegador sem câmera nenhuma → erro de HTTPS/suporte', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await expect(abrirCameraFrontal()).rejects.toBeInstanceOf(CameraIndisponivelError);
  });
});

describe('streamVivo', () => {
  it('só é vivo com trilha de vídeo "live"', () => {
    const com = (estado: string) => ({ getVideoTracks: () => [{ readyState: estado }] }) as unknown as MediaStream;
    expect(streamVivo(com('live'))).toBe(true);
    expect(streamVivo(com('ended'))).toBe(false);
    expect(streamVivo(null)).toBe(false);
  });
});
