/**
 * ATUALIZAÇÃO AUTOMÁTICA das telas do funcionário (01/10/2026).
 *
 * O caso real: o iPhone do Washington usou às 02:08 de 01/10 uma tela de ponto de antes de 30/09
 * (o Safari não recarrega a aba aberta) e a facial quebrou porque o servidor já tinha mudado. O que
 * trava:
 *  - versão publicada IGUAL → nada acontece;
 *  - versão NOVA com a tela livre → recarrega;
 *  - versão NOVA com alguém usando → espera; recarrega quando a tela fica livre;
 *  - voltar pra aba (visibilitychange) confere de novo — é o caso do Safari;
 *  - a mesma versão nova não recarrega duas vezes (trava contra recarregar em círculo);
 *  - sem internet → fica onde está, sem quebrar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import {
  useAtualizacaoAutomatica, versaoPublicada, type Buscar,
} from '../../src/components/employee-clock/useAtualizacaoAutomatica';

function servidorCom(versao: string | null, falha = false) {
  return vi.fn<Buscar>(async () => {
    if (falha) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(versao === null ? {} : { versao }), { status: 200 });
  });
}

/** `semEtiqueta`: não passa versaoLocal — vale a do build, que nos testes não existe. */
const Tela: React.FC<{ pode: boolean; buscar: Buscar; recarregar: () => void; semEtiqueta?: boolean }> = ({
  pode, buscar, recarregar, semEtiqueta = false,
}) => {
  useAtualizacaoAutomatica(semEtiqueta
    ? { podeRecarregar: pode, buscar, recarregar }
    : { podeRecarregar: pode, versaoLocal: 'v1', buscar, recarregar });
  return null;
};

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => cleanup());

describe('atualização automática', () => {
  it('versão publicada igual: não recarrega', async () => {
    const recarregar = vi.fn();
    const buscar = servidorCom('v1');
    render(<Tela pode buscar={buscar} recarregar={recarregar} />);
    await waitFor(() => expect(buscar).toHaveBeenCalled());
    await flush();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('🎯 versão nova com a tela livre: recarrega', async () => {
    const recarregar = vi.fn();
    render(<Tela pode buscar={servidorCom('v2')} recarregar={recarregar} />);
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
  });

  it('versão nova com alguém usando: espera e recarrega quando a tela fica livre', async () => {
    const recarregar = vi.fn();
    const buscar = servidorCom('v2');
    const { rerender } = render(<Tela pode={false} buscar={buscar} recarregar={recarregar} />);
    await waitFor(() => expect(buscar).toHaveBeenCalled());
    await flush();
    expect(recarregar).not.toHaveBeenCalled();

    rerender(<Tela pode buscar={buscar} recarregar={recarregar} />);
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
  });

  it('voltar pra aba (o caso do Safari) confere de novo', async () => {
    const recarregar = vi.fn();
    let publicada = 'v1';
    const buscar = vi.fn<Buscar>(async () => new Response(JSON.stringify({ versao: publicada })));
    render(<Tela pode buscar={buscar} recarregar={recarregar} />);
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));

    publicada = 'v2'; // saiu versão nova enquanto o celular estava bloqueado
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
  });

  it('a mesma versão nova não recarrega em círculo', async () => {
    const recarregar = vi.fn();
    render(<Tela pode buscar={servidorCom('v2')} recarregar={recarregar} />);
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
    cleanup();

    // "Recarregou" e a página ainda é a velha (cache do caminho): não recarrega de novo.
    const recarregar2 = vi.fn();
    const buscar2 = servidorCom('v2');
    render(<Tela pode buscar={buscar2} recarregar={recarregar2} />);
    await waitFor(() => expect(buscar2).toHaveBeenCalled());
    await flush();
    expect(recarregar2).not.toHaveBeenCalled();
  });

  it('etiqueta que muda a CADA consulta: recarrega uma vez só (não fica em círculo)', async () => {
    // O E2E pegou: uma etiqueta assim deixava a página em branco, recarregando sem parar.
    let n = 0;
    const buscar = vi.fn<Buscar>(async () => new Response(JSON.stringify({ versao: `v-${++n}` })));
    const recarregar = vi.fn();
    render(<Tela pode buscar={buscar} recarregar={recarregar} />);
    await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
    cleanup();

    // A página "recarregou" (montou de novo) e a etiqueta já é outra: dentro dos 2 min, não recarrega.
    const recarregar2 = vi.fn();
    render(<Tela pode buscar={buscar} recarregar={recarregar2} />);
    await waitFor(() => expect(buscar.mock.calls.length).toBeGreaterThanOrEqual(2));
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(recarregar2).not.toHaveBeenCalled();
  });

  it('sem internet ou resposta estranha: fica onde está, sem quebrar', async () => {
    const recarregar = vi.fn();
    const semRede = servidorCom(null, true);
    render(<Tela pode buscar={semRede} recarregar={recarregar} />);
    await waitFor(() => expect(semRede).toHaveBeenCalled());
    await flush();
    expect(recarregar).not.toHaveBeenCalled();

    expect(await versaoPublicada(servidorCom(null))).toBeNull();
    expect(await versaoPublicada(vi.fn<Buscar>(async () => new Response('x', { status: 500 })))).toBeNull();
  });

  it('sem etiqueta local (fora do build): não faz nada', async () => {
    const recarregar = vi.fn();
    const buscar = servidorCom('v2');
    render(<Tela pode buscar={buscar} recarregar={recarregar} semEtiqueta />);
    await flush();
    expect(buscar).not.toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();
  });
});
