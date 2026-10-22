/**
 * Chip "Zapex" na janela de relatório (22/10/2026 — caso Fafá).
 *
 * O bug: 'Zapex' não é plataforma cadastrada, então nunca aparecia nos chips — e o arquivo
 * com QUALQUER filtro de plataforma saía sem o Zapex, em silêncio (R$ 266,00 fora da
 * planilha da 2ª quinzena de setembro, R$ 98 só do Fafá). Agora, quando o escopo tem Zapex,
 * o chip existe, começa MARCADO, e a janela avisa quando ele fica de fora.
 *
 * Roda com: npx vitest run reportOptionsModalZapex
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ReportOptionsModal, type ReportOptions } from '../../src/components/driverpay/ReportOptionsModal';

// As mesmas plataformas do fluxo real do Victor (paga tudo-menos-eMile + só-eMile).
const PLATAFORMAS = ['LOGGI', 'SHOPEE', 'ANJUN', 'Coleta Shopee', 'eMile'];

function renderModal(zapexTotal: number) {
  const onConfirm = vi.fn(async (_: ReportOptions) => {});
  const utils = render(
    <ReportOptionsModal
      kind="simples"
      platformOptions={PLATAFORMAS}
      zapexTotal={zapexTotal}
      deductionsTotal={0}
      alreadyDeducted={[]}
      scopeLabel="6 driver(s) da lista atual"
      checksPreview={() => ({ kept: [], removed: [], recipientsBefore: 6, recipientsAfter: 6 })}
      jaPagos={() => []}
      pessoasDesconto={() => []}
      onClose={() => {}}
      onConfirm={onConfirm}
      canViewValues
    />,
  );
  return { ...utils, onConfirm };
}

async function baixar(onConfirm: ReturnType<typeof vi.fn>, getByTestId: (id: string) => HTMLElement) {
  fireEvent.click(getByTestId('report-confirm'));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  return onConfirm.mock.calls[0][0] as ReportOptions;
}

afterEach(() => cleanup());

describe('ReportOptionsModal — chip Zapex', () => {
  it('escopo SEM Zapex: nenhum chip Zapex, tudo marcado = sem filtro (janela de sempre)', async () => {
    const { queryByTestId, getByTestId, onConfirm } = renderModal(0);
    expect(queryByTestId('report-plat-Zapex')).toBeNull();
    const opts = await baixar(onConfirm, getByTestId);
    expect(opts.allowed).toBeNull();
  });

  it('escopo COM Zapex: chip existe, começa marcado, e com tudo marcado o arquivo sai completo', async () => {
    const { getByTestId, onConfirm } = renderModal(266);
    expect(getByTestId('report-plat-Zapex').textContent).toContain('✓');
    const opts = await baixar(onConfirm, getByTestId);
    expect(opts.allowed).toBeNull();
  });

  it('🎯 caso Fafá: desmarcar só o eMile mantém o Zapex no arquivo (antes ele caía fora)', async () => {
    const { getByTestId, onConfirm } = renderModal(266);
    fireEvent.click(getByTestId('report-plat-eMile'));
    // Intl pt-BR separa "R$" do número com espaço inquebrável — confere só o número.
    expect(getByTestId('report-zapex-dentro').textContent).toContain('266,00');
    const opts = await baixar(onConfirm, getByTestId);
    expect(opts.allowed).toContain('Zapex');
    expect(opts.allowed).not.toContain('eMile');
    expect(opts.allowed).toEqual(expect.arrayContaining(['LOGGI', 'SHOPEE', 'ANJUN', 'Coleta Shopee']));
  });

  it('desmarcar o Zapex num relatório filtrado acende o aviso de que ele fica de fora', async () => {
    const { getByTestId, queryByTestId, onConfirm } = renderModal(266);
    fireEvent.click(getByTestId('report-plat-eMile'));
    fireEvent.click(getByTestId('report-plat-Zapex'));
    expect(getByTestId('report-zapex-fora').textContent).toContain('266,00');
    expect(queryByTestId('report-zapex-dentro')).toBeNull();
    const opts = await baixar(onConfirm, getByTestId);
    expect(opts.allowed).not.toContain('Zapex');
  });
});
