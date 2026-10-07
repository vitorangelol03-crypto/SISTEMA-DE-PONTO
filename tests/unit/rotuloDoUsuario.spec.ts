/**
 * Histórico (Auditoria) mostra QUEM fez: código + nome + funcionário vinculado (07/10/2026, plano do
 * tablet sem toque, entrega G). Roda com: npx vitest run rotuloDoUsuario
 */
import { describe, it, expect } from 'vitest';
import { rotuloDoUsuario } from '../../src/components/monitoring/rotuloDoUsuario';

const USUARIOS = [
  { id: '03', name: 'João', employee_id: 'e-1' },
  { id: '04', name: null, employee_id: 'e-2' },
  { id: '2626', name: null, employee_id: null },
  { id: '05', name: '   ', employee_id: 'e-que-nao-veio' },
];
const NOMES = { 'e-1': 'JOAO DA SILVA', 'e-2': 'MARIA SOUZA' };

describe('quem fez, no histórico', () => {
  it('código + nome + funcionário vinculado — cada parte só se existir', () => {
    expect(rotuloDoUsuario('03', USUARIOS, NOMES)).toBe('03 — João (funcionário JOAO DA SILVA)');
    expect(rotuloDoUsuario('04', USUARIOS, NOMES)).toBe('04 (funcionário MARIA SOUZA)'); // sem nome (hoje: todos)
    expect(rotuloDoUsuario('2626', USUARIOS, NOMES)).toBe('2626'); // sem nome e sem vínculo: igual a antes
    expect(rotuloDoUsuario('05', USUARIOS, NOMES)).toBe('05'); // nome em branco; funcionário que não veio
  });

  it('linha sem usuário → "Desconhecido"; usuário fora da lista → o código da própria linha', () => {
    expect(rotuloDoUsuario(null, USUARIOS, NOMES)).toBe('Desconhecido');
    expect(rotuloDoUsuario(undefined, USUARIOS, NOMES)).toBe('Desconhecido');
    expect(rotuloDoUsuario('7777', USUARIOS, NOMES)).toBe('7777');
  });
});
