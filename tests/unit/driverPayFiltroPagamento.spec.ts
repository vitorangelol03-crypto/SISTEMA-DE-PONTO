/**
 * Filtro "pagos × não pagos" (05/08/2026, pedido do Victor).
 *
 * A tag "pagamento concluído" já existia na grade; faltava poder FILTRAR por ela — a
 * pergunta prática é "quem ainda tenho que pagar?".
 *
 * ⚠️ Duas decisões que evitam erro de dinheiro, e por isso têm teste próprio:
 *  · PARCIAL entra em "falta pagar" — quem recebeu só a SHOPEE ainda tem a receber; colocá-lo
 *    entre os pagos faria alguém ser esquecido no pagamento das demais plataformas;
 *  · quem NÃO TEM PACOTE fica de fora dos DOIS lados — não há o que pagar, e ele só encheria
 *    a lista de "falta pagar" com gente que não devia estar lá.
 *
 * Roda com: npx vitest run driverPayFiltroPagamento
 */
import { describe, it, expect } from 'vitest';
import { passaNoFiltroDePagamento } from '../../src/components/driverpay/driverPayShared';

describe('passaNoFiltroDePagamento', () => {
  it('sem filtro, ninguém é escondido — nem quem não tem pacote', () => {
    expect(passaNoFiltroDePagamento('concluido', '')).toBe(true);
    expect(passaNoFiltroDePagamento('pendente', '')).toBe(true);
    expect(passaNoFiltroDePagamento('sem_pacote', '')).toBe(true);
    expect(passaNoFiltroDePagamento(undefined, '')).toBe(true);
  });

  it('🎯 "Já pagos" traz só quem fechou todas as plataformas', () => {
    expect(passaNoFiltroDePagamento('concluido', 'pago')).toBe(true);
    expect(passaNoFiltroDePagamento('pendente', 'pago')).toBe(false);
  });

  it('🎯 PARCIAL não é "pago" — ele ainda tem dinheiro a receber', () => {
    expect(passaNoFiltroDePagamento('parcial', 'pago')).toBe(false);
    expect(passaNoFiltroDePagamento('parcial', 'nao_pago')).toBe(true);
  });

  it('"Falta pagar" traz pendente e parcial', () => {
    expect(passaNoFiltroDePagamento('pendente', 'nao_pago')).toBe(true);
    expect(passaNoFiltroDePagamento('parcial', 'nao_pago')).toBe(true);
    expect(passaNoFiltroDePagamento('concluido', 'nao_pago')).toBe(false);
  });

  it('⚠️ quem NÃO TEM PACOTE fica fora dos dois lados', () => {
    expect(passaNoFiltroDePagamento('sem_pacote', 'pago')).toBe(false);
    expect(passaNoFiltroDePagamento('sem_pacote', 'nao_pago')).toBe(false);
  });

  it('linha sem situação calculada também fica fora (não inventa "não pago")', () => {
    expect(passaNoFiltroDePagamento(undefined, 'pago')).toBe(false);
    expect(passaNoFiltroDePagamento(undefined, 'nao_pago')).toBe(false);
  });

  it('🎯 os dois filtros juntos cobrem todo mundo que TEM o que receber', () => {
    const estados = ['concluido', 'parcial', 'pendente'] as const;
    for (const e of estados) {
      const pago = passaNoFiltroDePagamento(e, 'pago');
      const naoPago = passaNoFiltroDePagamento(e, 'nao_pago');
      expect(pago !== naoPago, `${e} tem que cair em exatamente um dos lados`).toBe(true);
    }
  });
});
