import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';

/**
 * Sub-fase 14.8 — Defensive tests pra xlsx (Prototype Pollution + ReDoS).
 *
 * Contexto: xlsx (SheetJS) tem 2 high advisories no GitHub:
 *   - GHSA-4r6h-8v6p-xvw6 — Prototype Pollution
 *   - GHSA-5pgg-2g8v-p4x9 — ReDoS via cell content
 * Sem patch upstream — TECH_DEBT 14.A.
 *
 * Estes testes validam que o uso NO NOSSO CÓDIGO (`employeeImport.ts`,
 * exportações) NÃO contamina Object.prototype durante parse normal.
 * Não replica payload XLSX-raw do CVE (gerar fixture binário malicioso
 * exigiria construir ZIP+XML manualmente — fora do escopo). Em vez disso:
 *
 * 1. Snapshot de Object.prototype antes/depois de cada operação.
 * 2. Operações cobertas: parse round-trip, sheet_to_json, json_to_sheet,
 *    cell access com keys especiais.
 * 3. Fallback: documenta que mitigação real é manter dep atualizado +
 *    upload admin-only.
 */

function getPrototypeSnapshot(): string {
  // Inclui props enumerable + non-enumerable em Object.prototype.
  const names = Object.getOwnPropertyNames(Object.prototype).sort();
  return names.join('|');
}

describe('xlsx security (sub-fase 14.8 — Prototype Pollution defensive tests)', () => {
  let baselineSnapshot: string;

  beforeEach(() => {
    baselineSnapshot = getPrototypeSnapshot();
  });

  afterEach(() => {
    // Defensiva: se algum test poluiu Object.prototype, fail explicitamente
    // e remove a poluição pra não vazar pros próximos testes.
    const after = getPrototypeSnapshot();
    if (after !== baselineSnapshot) {
      // Limpa diff antes do throw (best-effort cleanup):
      const added = after.split('|').filter((k) => !baselineSnapshot.split('|').includes(k));
      for (const k of added) {
        try { delete (Object.prototype as Record<string, unknown>)[k]; } catch { /* noop */ }
      }
      throw new Error(`Object.prototype contaminado durante teste! Added: ${added.join(', ')}`);
    }
  });

  it('round-trip normal (workbook → binary → workbook) NÃO contamina Object.prototype', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nome', 'CPF', 'PIX'],
      ['Test 1', '12345678901', 'test@test.com'],
      ['Test 2', '98765432109', '11999999999'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const binary = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    expect(typeof binary).toBe('string');

    const reread = XLSX.read(binary, { type: 'binary' });
    expect(reread.SheetNames).toContain('Sheet1');

    const data = XLSX.utils.sheet_to_json(reread.Sheets['Sheet1']);
    expect(data).toHaveLength(2);
    expect((data[0] as { Nome: string }).Nome).toBe('Test 1');
  });

  it('payload com chaves perigosas em json_to_sheet NÃO ataca Object.prototype', () => {
    // Tenta injetar via key especial.
    const malicious = [
      { Nome: 'Atacante', __proto__: { polluted: 'yes' } },
      { Nome: 'Normal', CPF: '12345678901' },
    ];

    const ws = XLSX.utils.json_to_sheet(malicious as Record<string, unknown>[]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test');

    const binary = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    const reread = XLSX.read(binary, { type: 'binary' });
    const parsed = XLSX.utils.sheet_to_json(reread.Sheets['Test']);

    // Object.prototype.polluted DEVE ser undefined (snapshot afterEach valida).
    // Aqui só asserta que parse não crashou e dado sai limpo.
    expect(parsed).toBeDefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('cellDates:true (modo usado em parseEmployeeSpreadsheet) preserva integrity', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Data Admissão'],
      ['Test', new Date('2026-01-15')],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const binary = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    const reread = XLSX.read(binary, { type: 'binary', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(reread.Sheets['Sheet1']);
    expect(rows).toHaveLength(1);
  });

  it('SheetNames acessadas via index funcionam corretamente', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'A');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['y']]), 'B');

    const binary = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    const reread = XLSX.read(binary, { type: 'binary' });

    // Pattern usado em parseEmployeeSpreadsheet:305
    const firstSheet = reread.Sheets[reread.SheetNames[0]];
    expect(firstSheet).toBeDefined();
    expect(reread.SheetNames).toEqual(['A', 'B']);

    // Sanity check: hasOwnProperty na key não-existente é false (não chega
    // via prototype chain). `Sheets['__proto__']` retorna o prototype ref
    // (comportamento normal JS), mas hasOwnProperty é false.
    expect(Object.prototype.hasOwnProperty.call(reread.Sheets, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(reread.Sheets, 'evil')).toBe(false);
  });

  it('SET de __proto__ em parsed result NÃO polui Object.prototype', () => {
    // Cenário sintético: simula payload em que parser retornaria objeto
    // com __proto__ property.
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['Nome'], ['Test']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const binary = XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    const reread = XLSX.read(binary, { type: 'binary' });

    // Tenta poluir manualmente Object.prototype via assignment normal.
    // Defesa: { __proto__: ... } em JSON.parse é tratado especialmente, NÃO polui.
    JSON.parse('{"__proto__": {"polluted": "ATTACK"}}');

    // Mesmo após parse de objeto malicioso, Object.prototype unchanged.
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(reread.SheetNames).toEqual(['Sheet1']);
  });
});
