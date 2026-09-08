/**
 * Provas de desconto: o bucket deixou de ser público em 08/09/2026, então a URL passou a
 * ser ASSINADA (temporária) e a vir de chamada assíncrona. Este hook resolve os caminhos
 * que a tela precisa mostrar.
 *
 * O que precisa ser garantido aqui:
 *  1. resolve os caminhos e devolve o mapa caminho -> url;
 *  2. NÃO fica reassinando à toa quando o componente re-renderiza (o array de caminhos
 *     chega novo a cada render; se o efeito dependesse dele, viraria loop infinito de
 *     chamadas ao Storage);
 *  3. caminho que falha não entra no mapa — a tela mostra vazio em vez de quebrar;
 *  4. lista vazia não chama nada.
 *
 * Roda com: npx vitest run useDiscountProofUrls
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const assinar = vi.fn<(path: string) => Promise<string>>();

vi.mock('../../src/services/driverPay', () => ({
  discountProofSignedUrl: (path: string) => assinar(path),
}));

import { useDiscountProofUrls } from '../../src/hooks/useDiscountProofUrls';

beforeEach(() => {
  assinar.mockReset();
  assinar.mockImplementation(async (p: string) => `https://assinada/${p}?token=abc`);
});

describe('useDiscountProofUrls', () => {
  it('resolve os caminhos e devolve o mapa', async () => {
    const { result } = renderHook(() => useDiscountProofUrls(['a/1.png', 'a/2.png']));
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('a/1.png')).toBe('https://assinada/a/1.png?token=abc');
    expect(result.current.get('a/2.png')).toBe('https://assinada/a/2.png?token=abc');
  });

  it('ignora null/undefined na lista', async () => {
    const { result } = renderHook(() => useDiscountProofUrls(['a/1.png', null, undefined]));
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(assinar).toHaveBeenCalledTimes(1);
  });

  it('lista vazia não chama o Storage', async () => {
    const { result } = renderHook(() => useDiscountProofUrls([null, undefined]));
    await waitFor(() => expect(result.current.size).toBe(0));
    expect(assinar).not.toHaveBeenCalled();
  });

  it('re-render com os MESMOS caminhos não reassina (não vira loop)', async () => {
    const { result, rerender } = renderHook(({ ps }) => useDiscountProofUrls(ps), {
      initialProps: { ps: ['a/1.png', 'a/2.png'] as (string | null)[] },
    });
    await waitFor(() => expect(result.current.size).toBe(2));
    const chamadasIniciais = assinar.mock.calls.length;

    // array NOVO a cada render, mesmo conteúdo — é o que o componente real faz
    rerender({ ps: ['a/1.png', 'a/2.png'] });
    rerender({ ps: ['a/2.png', 'a/1.png'] }); // e fora de ordem também
    await new Promise((r) => setTimeout(r, 20));

    expect(assinar.mock.calls.length).toBe(chamadasIniciais);
  });

  it('caminho novo entra sem perder os anteriores', async () => {
    const { result, rerender } = renderHook(({ ps }) => useDiscountProofUrls(ps), {
      initialProps: { ps: ['a/1.png'] as (string | null)[] },
    });
    await waitFor(() => expect(result.current.size).toBe(1));
    rerender({ ps: ['a/1.png', 'a/3.png'] });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('a/3.png')).toContain('a/3.png');
  });

  it('prova que falha não entra no mapa (tela não quebra)', async () => {
    assinar.mockImplementation(async (p: string) => (p === 'a/ruim.png' ? '' : `https://assinada/${p}`));
    const { result } = renderHook(() => useDiscountProofUrls(['a/boa.png', 'a/ruim.png']));
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.has('a/ruim.png')).toBe(false);
    expect(result.current.get('a/boa.png')).toBe('https://assinada/a/boa.png');
  });
});
