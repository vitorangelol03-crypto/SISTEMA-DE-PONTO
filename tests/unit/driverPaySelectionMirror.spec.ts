/**
 * Testes unit de buildSelectionMirrorData — a lógica pura dos "Espelhos da
 * seleção" (2026-07-18): grupos marcados viram espelho de GRUPO; drivers
 * marcados avulsos viram espelho INDIVIDUAL; driver cujo grupo está marcado
 * NÃO entra duplicado como avulso.
 *
 * Roda com: npx vitest run driverPaySelectionMirror
 */

import { describe, it, expect } from 'vitest';
import { buildSelectionMirrorData, NO_GROUP_LABEL, type DriverRowData } from '../../src/components/driverpay/driverPayShared';
import type { Company } from '../../src/services/database';
import type { DriverPlatform, DriverPaymentPeriod } from '../../src/services/driverPay';

const company = { id: 'c1', cnpj: null, city: 'Caratinga' } as unknown as Company;
const period = {
  id: 'per1',
  company_id: 'c1',
  label: 'Quinzena Teste',
  start_date: null,
  end_date: null,
  status: 'aberto',
  concluded_at: null,
  concluded_by: null,
  created_by: null,
  created_at: '',
} as DriverPaymentPeriod;
const platforms = [
  { id: 'p1', company_id: 'c1', name: 'eMile', default_rate: 2, sort_order: 0, active: true, color: null, created_by: null, created_at: '' },
] as DriverPlatform[];

/** Linha mínima de driver: 1 rota com N pacotes na eMile @ 2,00. */
function row(paymentId: string, name: string, groupName: string | null, pkgs: number): DriverRowData {
  return {
    paymentId,
    driverId: `d-${paymentId}`,
    name,
    route: 'Caratinga',
    groupName,
    routes: [{ route: 'Caratinga', packages: { eMile: pkgs }, rates: {}, packageIds: [] }],
    ratesByPlatform: { eMile: 2 },
    discounts: [],
    vales: [],
    pixKey: null,
    cpf: null,
    phone: null,
    active: true,
    notaFiscal: false,
    espelhoConferido: false,
    zapex: [],
    zapexRate: 0,
  } as unknown as DriverRowData;
}

const ROWS = [
  row('pay1', 'Ana', 'Grupo A', 10),
  row('pay2', 'Beto', 'Grupo A', 20),
  row('pay3', 'Caio', 'Grupo B', 30),
  row('pay4', 'Duda', null, 40), // sem grupo
];

describe('buildSelectionMirrorData', () => {
  it('grupo marcado vira espelho de grupo com TODOS os drivers dele', () => {
    const { groups, singles } = buildSelectionMirrorData(ROWS, new Set(['Grupo A']), new Set(), platforms, company, period);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupName).toBe('Grupo A');
    expect(groups[0].drivers.map((d) => d.driver.name)).toEqual(['Ana', 'Beto']);
    expect(groups[0].groupTotals.toReceive).toBe(10 * 2 + 20 * 2);
    expect(singles).toHaveLength(0);
  });

  it('driver avulso marcado vira espelho individual', () => {
    const { groups, singles } = buildSelectionMirrorData(ROWS, new Set(), new Set(['pay3']), platforms, company, period);
    expect(groups).toHaveLength(0);
    expect(singles.map((d) => d.driver.name)).toEqual(['Caio']);
    expect(singles[0].totals.toReceive).toBe(60);
  });

  it('mistura: grupo + avulso de outro grupo, sem duplicar', () => {
    const { groups, singles } = buildSelectionMirrorData(
      ROWS,
      new Set(['Grupo A']),
      new Set(['pay3']),
      platforms,
      company,
      period,
    );
    expect(groups.map((g) => g.groupName)).toEqual(['Grupo A']);
    expect(singles.map((d) => d.driver.name)).toEqual(['Caio']);
  });

  it('driver marcado cujo GRUPO também está marcado NÃO duplica como avulso', () => {
    const { groups, singles } = buildSelectionMirrorData(
      ROWS,
      new Set(['Grupo A']),
      new Set(['pay1']), // Ana já está no Grupo A selecionado
      platforms,
      company,
      period,
    );
    expect(groups[0].drivers.map((d) => d.driver.name)).toEqual(['Ana', 'Beto']);
    expect(singles).toHaveLength(0);
  });

  it('balde "Sem grupo" funciona como grupo selecionável', () => {
    const { groups, singles } = buildSelectionMirrorData(
      ROWS,
      new Set([NO_GROUP_LABEL]),
      new Set(['pay4']), // Duda é do "Sem grupo" marcado — não duplica
      platforms,
      company,
      period,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].groupName).toBe(NO_GROUP_LABEL);
    expect(groups[0].drivers.map((d) => d.driver.name)).toEqual(['Duda']);
    expect(singles).toHaveLength(0);
  });

  it('grupo marcado que não existe nas linhas visíveis é ignorado (sem página vazia)', () => {
    const { groups, singles } = buildSelectionMirrorData(
      ROWS,
      new Set(['Grupo Fantasma']),
      new Set(),
      platforms,
      company,
      period,
    );
    expect(groups).toHaveLength(0);
    expect(singles).toHaveLength(0);
  });

  it('vários grupos saem em ordem alfabética pt-BR', () => {
    const { groups } = buildSelectionMirrorData(ROWS, new Set(['Grupo B', 'Grupo A']), new Set(), platforms, company, period);
    expect(groups.map((g) => g.groupName)).toEqual(['Grupo A', 'Grupo B']);
  });

  it('seleção vazia devolve tudo vazio (o botão fica desabilitado na UI)', () => {
    const { groups, singles } = buildSelectionMirrorData(ROWS, new Set(), new Set(), platforms, company, period);
    expect(groups).toHaveLength(0);
    expect(singles).toHaveLength(0);
  });
});
