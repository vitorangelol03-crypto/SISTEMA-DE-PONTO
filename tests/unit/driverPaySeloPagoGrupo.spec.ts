/**
 * Selo de pagamento do cabeçalho do GRUPO (visão "Grupos") — 31/08/2026.
 *
 * Relato do Victor (20/08): filtro de "quem já está pago" mostrando gente que não devia.
 * Causa achada: o cabeçalho do grupo contava só as linhas que SOBRARAM do filtro. Com
 * "Já pagos" ligado, só os pagos sobram — então um grupo com 1 pago e 5 não pagos
 * (R$ 20 mil a receber) aparecia como "✓ pago · Todos os membros deste grupo já foram
 * pagos". O selo agora é calculado sobre TODOS os membros (`situacaoPagamentoDoGrupo`
 * recebe a lista completa, que a DriverList monta a partir de `allRows`).
 *
 * Roda com: npx vitest run driverPaySeloPagoGrupo
 */
import { describe, it, expect } from 'vitest';
import {
  situacaoPagamentoDoGrupo,
  plataformasPagasDoGrupo,
  type PagamentoDoDriver,
} from '../../src/components/driverpay/driverPayShared';

const sit = (p: Partial<PagamentoDoDriver>): PagamentoDoDriver => ({
  estado: 'concluido', pagas: [], faltando: [], ultimoPagamento: null, descontoPendente: false, ...p,
} as PagamentoDoDriver);

const mapa = (entries: Record<string, PagamentoDoDriver>) =>
  new Map<string, PagamentoDoDriver>(Object.entries(entries));

// Grupo "Raul Soares": líder pago, 5 membros ainda não.
const RAUL = mapa({
  lider: sit({ estado: 'concluido', pagas: ['SHOPEE', 'eMile'] }),
  m1: sit({ estado: 'pendente', faltando: ['SHOPEE'] }),
  m2: sit({ estado: 'pendente', faltando: ['SHOPEE'] }),
  m3: sit({ estado: 'pendente', faltando: ['SHOPEE', 'eMile'] }),
  m4: sit({ estado: 'pendente', faltando: ['SHOPEE'] }),
  m5: sit({ estado: 'pendente', faltando: ['eMile'] }),
});
const membro = (paymentId: string) => ({ paymentId });
const TODOS_RAUL = ['lider', 'm1', 'm2', 'm3', 'm4', 'm5'].map(membro);

describe('situacaoPagamentoDoGrupo', () => {
  it('🔴 com TODOS os membros, 1 pago de 6 NÃO é "todos pagos"', () => {
    const s = situacaoPagamentoDoGrupo(TODOS_RAUL, RAUL);
    expect(s).not.toBeNull();
    expect(s!.pagos).toBe(1);
    expect(s!.total).toBe(6);
    expect(s!.todos).toBe(false);
  });

  it('🔴 o bug antigo: passando só quem sobrou do filtro "Já pagos", virava "todos pagos"', () => {
    // É exatamente por isso que a DriverList agora passa os membros completos (allRows),
    // e não `groupRows` filtradas. Este caso documenta o que NÃO pode voltar a acontecer.
    const soPagos = situacaoPagamentoDoGrupo([membro('lider')], RAUL);
    expect(soPagos!.todos).toBe(true); // matematicamente certo pra 1 de 1 — errado como "grupo"
    const grupoInteiro = situacaoPagamentoDoGrupo(TODOS_RAUL, RAUL);
    expect(grupoInteiro!.todos).toBe(false);
  });

  it('🎯 todos pagos → todos=true e as plataformas podem ser nomeadas', () => {
    const m = mapa({
      a: sit({ pagas: ['SHOPEE'] }),
      b: sit({ pagas: ['SHOPEE'] }),
    });
    const s = situacaoPagamentoDoGrupo([membro('a'), membro('b')], m);
    expect(s!.todos).toBe(true);
    expect(s!.pagos).toBe(2);
    expect(plataformasPagasDoGrupo(s!.situacoes)).toEqual({ iguais: true, plataformas: ['SHOPEE'] });
  });

  it('quem não tem pacote fica fora da conta (não é "não pago")', () => {
    const m = mapa({
      a: sit({ pagas: ['SHOPEE'] }),
      z: sit({ estado: 'sem_pacote' }),
    });
    const s = situacaoPagamentoDoGrupo([membro('a'), membro('z')], m);
    expect(s!.total).toBe(1);
    expect(s!.todos).toBe(true);
  });

  it('parcial conta como NÃO pago (mesma regra do filtro)', () => {
    const m = mapa({
      a: sit({ pagas: ['SHOPEE'] }),
      b: sit({ estado: 'parcial', pagas: ['SHOPEE'], faltando: ['eMile'] }),
    });
    const s = situacaoPagamentoDoGrupo([membro('a'), membro('b')], m);
    expect(s!.pagos).toBe(1);
    expect(s!.total).toBe(2);
    expect(s!.todos).toBe(false);
  });

  it('ninguém pago ainda → sem selo (null)', () => {
    const m = mapa({ a: sit({ estado: 'pendente' }), b: sit({ estado: 'pendente' }) });
    expect(situacaoPagamentoDoGrupo([membro('a'), membro('b')], m)).toBeNull();
  });

  it('grupo sem ninguém com pacote, ou membro sem situação no mapa → null', () => {
    expect(situacaoPagamentoDoGrupo([membro('z')], mapa({ z: sit({ estado: 'sem_pacote' }) }))).toBeNull();
    expect(situacaoPagamentoDoGrupo([membro('naoExiste')], mapa({}))).toBeNull();
    expect(situacaoPagamentoDoGrupo([], RAUL)).toBeNull();
  });
});
