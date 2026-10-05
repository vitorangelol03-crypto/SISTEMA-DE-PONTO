/**
 * Troca de empresa da TELA (05/10/2026 — tablet que atende Caratinga e Ponte Nova no mesmo galpão):
 *
 * - `persistir: false` troca só a tela: a empresa gravada no aparelho (a "de casa" do tablet) fica.
 *   Antes a troca pelo CPF era gravada, e uma recarga ou um soluço de rede na hora da volta deixava o
 *   tablet "morando" na outra empresa (a câmera passava a procurar só o pessoal dela).
 * - O ÚLTIMO pedido ganha: a volta do tablet pra casa + o CPF do próximo da fila podem responder fora
 *   de ordem; antes ficava a resposta que chegasse por último.
 * - Sem a opção, grava como sempre (celular, painel).
 *
 * Roda com: npx vitest run trocaDeEmpresaDaTela
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';

const getCompanyById = vi.fn();
const getCompanies = vi.fn();

vi.mock('../../src/services/database', () => ({
  getCompanyById: (...a: unknown[]) => getCompanyById(...a),
  getCompanies: (...a: unknown[]) => getCompanies(...a),
  DEFAULT_COMPANY_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}));

import { CompanyProvider } from '../../src/contexts/CompanyContext';
import { useCompany } from '../../src/contexts/useCompany';
import { COMPANY_STORAGE_KEY } from '../../src/contexts/companyHelpers';

const CARATINGA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: 'Caratinga' };
const PONTE_NOVA = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'Ponte Nova' };
const POR_ID: Record<string, unknown> = { [CARATINGA.id]: CARATINGA, [PONTE_NOVA.id]: PONTE_NOVA };

let setCompany: ReturnType<typeof useCompany>['setCompany'];
function Tela() {
  const ctx = useCompany();
  setCompany = ctx.setCompany;
  return <p data-testid="empresa">{ctx.company?.id ?? ''}</p>;
}

async function abrirEmCaratinga() {
  localStorage.setItem(COMPANY_STORAGE_KEY, CARATINGA.id);
  render(<CompanyProvider><Tela /></CompanyProvider>);
  await waitFor(() => expect(screen.getByTestId('empresa').textContent).toBe(CARATINGA.id));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getCompanyById.mockImplementation(async (id: string) => POR_ID[id] ?? null);
  getCompanies.mockResolvedValue([CARATINGA, PONTE_NOVA]);
});

afterEach(() => { cleanup(); });

describe('troca de empresa da tela', () => {
  it('sem opção (celular): troca e GRAVA no aparelho, como sempre', async () => {
    await abrirEmCaratinga();
    await act(async () => { await setCompany(PONTE_NOVA.id); });
    expect(screen.getByTestId('empresa').textContent).toBe(PONTE_NOVA.id);
    expect(localStorage.getItem(COMPANY_STORAGE_KEY)).toBe(PONTE_NOVA.id);
  });

  it('persistir: false (tablet): troca só a tela — a empresa gravada continua a de casa', async () => {
    await abrirEmCaratinga();
    await act(async () => { await setCompany(PONTE_NOVA.id, { persistir: false }); });
    expect(screen.getByTestId('empresa').textContent).toBe(PONTE_NOVA.id);
    expect(localStorage.getItem(COMPANY_STORAGE_KEY)).toBe(CARATINGA.id);
  });

  it('o ÚLTIMO pedido ganha, mesmo quando o pedido anterior responde depois', async () => {
    await abrirEmCaratinga();
    let responderPonteNova: (c: unknown) => void = () => {};
    getCompanyById.mockImplementation((id: string) => (id === PONTE_NOVA.id
      ? new Promise((r) => { responderPonteNova = r; })
      : Promise.resolve(POR_ID[id] ?? null)));
    let pedidoVelho: Promise<void> = Promise.resolve();
    await act(async () => {
      pedidoVelho = setCompany(PONTE_NOVA.id);        // lento (CPF do próximo da fila, digamos)
      await setCompany(CARATINGA.id, { persistir: false }); // mais novo (o tablet voltando pra casa)
    });
    await act(async () => { responderPonteNova(PONTE_NOVA); await pedidoVelho; });
    expect(screen.getByTestId('empresa').textContent).toBe(CARATINGA.id);
    expect(localStorage.getItem(COMPANY_STORAGE_KEY)).toBe(CARATINGA.id); // o velho nem gravou
  });

  it('pedido que falha (rede): avisa quem pediu e a tela fica onde estava', async () => {
    await abrirEmCaratinga();
    getCompanyById.mockRejectedValueOnce(new Error('sem rede'));
    await act(async () => {
      await expect(setCompany(PONTE_NOVA.id, { persistir: false })).rejects.toThrow('sem rede');
    });
    expect(screen.getByTestId('empresa').textContent).toBe(CARATINGA.id);
    expect(localStorage.getItem(COMPANY_STORAGE_KEY)).toBe(CARATINGA.id);
  });
});
