/**
 * VÍNCULO USUÁRIO ↔ FUNCIONÁRIO + as 2 permissões do tablet (07/10/2026, plano do tablet sem toque,
 * entrega C; decisões 9 e 10 do Victor em .claude-checkpoints/PLANO_TABLET_SEM_TOQUE_2026-10-05.md).
 *
 * Roda com: npx vitest run vinculoFuncionario
 */
import { describe, it, expect } from 'vitest';
import {
  filtrarParaVinculo, finalDoCpf, podeSerVinculado, temPermissaoDoTablet,
} from '../../src/components/permissions/vinculoFuncionario';
import {
  DEFAULT_ADMIN_PERMISSIONS, DEFAULT_READONLY_PERMISSIONS, DEFAULT_SUPERVISOR_PERMISSIONS, PERMISSION_LABELS,
} from '../../src/types/permissions';
import type { FuncionarioParaVinculo } from '../../src/services/database';

const HOJE = '2026-10-07';
const f = (id: string, name: string, extra: Partial<FuncionarioParaVinculo> = {}): FuncionarioParaVinculo => ({
  id, name, cpf: '123.456.789-01', termination_date: null, registration_status: 'approved', ...extra,
});

describe('quem pode ser ligado (a mesma régua do banco)', () => {
  it('cadastro recusado não; pendente e aprovado sim', () => {
    expect(podeSerVinculado(f('1', 'A', { registration_status: 'rejected' }), HOJE)).toBe(false);
    expect(podeSerVinculado(f('2', 'B', { registration_status: 'pending' }), HOJE)).toBe(true);
    expect(podeSerVinculado(f('3', 'C'), HOJE)).toBe(true);
  });
  it('desligado = a data de saída JÁ PASSOU (quem sai hoje ainda vale hoje; saída futura vale)', () => {
    expect(podeSerVinculado(f('1', 'A', { termination_date: '2026-10-06' }), HOJE)).toBe(false);
    expect(podeSerVinculado(f('2', 'B', { termination_date: '2026-10-07' }), HOJE)).toBe(true);
    expect(podeSerVinculado(f('3', 'C', { termination_date: '2026-11-30' }), HOJE)).toBe(true);
  });
});

describe('finalDoCpf — diferencia homônimos sem mostrar o CPF', () => {
  it('só os 4 últimos dígitos', () => {
    expect(finalDoCpf('123.456.789-01')).toBe('•••8901');
    expect(finalDoCpf('12345678901')).toBe('•••8901');
  });
  it('sem CPF (ou curto): nada', () => {
    expect(finalDoCpf(null)).toBe('');
    expect(finalDoCpf('12')).toBe('');
  });
});

describe('filtrarParaVinculo — a lista do campo', () => {
  const lista = [
    f('1', 'JOSÉ DA CONCEIÇÃO'),
    f('2', 'JOSE RECUSADO', { registration_status: 'rejected' }),
    f('3', 'JOSE DESLIGADO', { termination_date: '2026-09-30' }),
    f('4', 'MARIA'),
  ];
  it('busca sem acento e sem caixa; recusados e desligados nunca aparecem', () => {
    expect(filtrarParaVinculo(lista, 'jose', HOJE).map((x) => x.id)).toEqual(['1']);
    expect(filtrarParaVinculo(lista, 'conceicao', HOJE).map((x) => x.id)).toEqual(['1']);
  });
  it('busca vazia lista todo mundo que pode, até o limite', () => {
    expect(filtrarParaVinculo(lista, '', HOJE).map((x) => x.id)).toEqual(['1', '4']);
    expect(filtrarParaVinculo(lista, '', HOJE, 1)).toHaveLength(1);
  });
});

describe('as 2 permissões do tablet (decisão 9)', () => {
  it('existem em Funcionários, com o nome que aparece na tela de Permissões', () => {
    expect(PERMISSION_LABELS.employees.tabletCreate).toBe('Cadastrar funcionário novo pelo tablet');
    expect(PERMISSION_LABELS.employees.tabletFaceReset).toBe('Refazer o rosto pelo tablet');
  });
  it('nascem DESLIGADAS pra supervisor e só-visualização (é o padrão de quem não tem a chave salva)', () => {
    for (const modelo of [DEFAULT_SUPERVISOR_PERMISSIONS, DEFAULT_READONLY_PERMISSIONS]) {
      expect(modelo.employees.tabletCreate).toBe(false);
      expect(modelo.employees.tabletFaceReset).toBe(false);
    }
  });
  it('"Acesso Total" (o modelo que o 2626 aplica de propósito) liga as duas', () => {
    expect(DEFAULT_ADMIN_PERMISSIONS.employees.tabletCreate).toBe(true);
    expect(DEFAULT_ADMIN_PERMISSIONS.employees.tabletFaceReset).toBe(true);
  });
});

describe('temPermissaoDoTablet — o aviso "sem vínculo" da aba Usuários', () => {
  it('qualquer uma das duas ligada conta; ausente ou false não', () => {
    expect(temPermissaoDoTablet({ employees: { tabletCreate: true } })).toBe(true);
    expect(temPermissaoDoTablet({ employees: { tabletFaceReset: true } })).toBe(true);
    expect(temPermissaoDoTablet({ employees: { tabletCreate: false, tabletFaceReset: false } })).toBe(false);
    expect(temPermissaoDoTablet({ employees: {} })).toBe(false);
    expect(temPermissaoDoTablet(null)).toBe(false);
  });
});
