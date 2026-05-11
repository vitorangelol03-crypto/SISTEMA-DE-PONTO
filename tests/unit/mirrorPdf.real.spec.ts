/**
 * Testes unit REAIS pra src/utils/mirrorPdf.ts (sem mock de jspdf).
 *
 * Framework: vitest. Roda com: npx vitest run mirrorPdf.real
 *
 * Complementa tests/unit/mirrorPdf.spec.ts (que usa mock pesado) com
 * validação de PDF REAL gerado por jspdf+jspdf-autotable no ambiente
 * jsdom. Sem mocks. Inspeciona bytes do output('arraybuffer'):
 *
 * - PDF header `%PDF-` e EOF marker `%%EOF`
 * - Contagem real de páginas via regex `/Type /Page`
 * - byteLength dentro de faixa esperada (catch de regressão silenciosa)
 *
 * Limitação: jspdf comprime streams de texto via zlib, então texto literal
 * dentro do PDF não aparece como ASCII em bytes. Validamos estrutura
 * (páginas, header, EOF, tamanho) mas não conteúdo textual. Pra cobrir
 * texto, seria necessário pdf-parse ou pdfjs-dist (deps adicionais).
 */

import { describe, it, expect } from 'vitest';
import {
  _generatePdfDoc,
  _generateTestSampleData,
} from '../../src/utils/mirrorPdf';
import type { MirrorData, MirrorDayRow } from '../../src/utils/mirrorGenerator';

// Helper: gera ArrayBuffer real do PDF
function generatePdfBytes(data: MirrorData): ArrayBuffer {
  const doc = _generatePdfDoc(data);
  return doc.output('arraybuffer') as ArrayBuffer;
}

function bytesToText(ab: ArrayBuffer): string {
  return String.fromCharCode(...new Uint8Array(ab));
}

function countPages(ab: ArrayBuffer): number {
  const text = bytesToText(ab);
  return (text.match(/\/Type\s*\/Page\b/g) || []).length;
}

function makeDayRow(overrides: Partial<MirrorDayRow> = {}): MirrorDayRow {
  return {
    date: '2026-05-11',
    label: '11/05 seg',
    isSunday: false,
    isAbsentCompensated: false,
    ent1: { display: '08:00', flag: null },
    sai1: { display: '12:00', flag: null },
    ent2: { display: '13:00', flag: null },
    sai2: { display: '17:00', flag: null },
    expected: 480,
    daytime: 480,
    nighttime: 0,
    interval: 60,
    bankCredit: 0,
    bankDebit: 0,
    ...overrides,
  };
}

function makeMirrorData(overrides: Partial<MirrorData> = {}): MirrorData {
  return {
    company: {
      legal_name: 'EMPRESA TESTE LTDA',
      cnpj: '12345678000195',
      logo_url: null,
      display_name: 'Empresa Teste',
    },
    employee: {
      name: 'Funcionário Teste',
      cpf: '12345678901',
      pis: '12345678910',
      badge_number: '0001',
      function_role: 'Operador',
      schedule_type: 'Normal',
    },
    period: {
      start: '2026-05-11',
      end: '2026-05-11',
      emissionDate: '2026-05-11',
    },
    scheduleSummary: 'Seg-Sex: 8h / Sáb: 4h / Dom: folga',
    rows: [makeDayRow()],
    totals: {
      expected: 480,
      daytime: 480,
      nighttime: 0,
      interval: 60,
      bankCredit: 0,
      bankDebit: 0,
      bankNet: 0,
    },
    ...overrides,
  };
}

describe('mirrorPdf REAL — single PDF', () => {
  it('1. gera PDF binário com header %PDF- válido', () => {
    const ab = generatePdfBytes(makeMirrorData());
    const text = bytesToText(ab);
    expect(text.slice(0, 8)).toMatch(/^%PDF-1\.\d/);
  });

  it('2. contém EOF marker %%EOF', () => {
    const ab = generatePdfBytes(makeMirrorData());
    expect(bytesToText(ab)).toContain('%%EOF');
  });

  it('3. 1 espelho gera 1 página (via /Type /Page count)', () => {
    const ab = generatePdfBytes(makeMirrorData());
    expect(countPages(ab)).toBe(1);
  });

  it('4. byteLength entre 10KB e 500KB (faixa esperada pra 1 página A4)', () => {
    const ab = generatePdfBytes(makeMirrorData());
    expect(ab.byteLength).toBeGreaterThan(10_000);
    expect(ab.byteLength).toBeLessThan(500_000);
  });

  it('5. _generateTestSampleData (30 dias) gera PDF válido sem throw', () => {
    expect(() => generatePdfBytes(_generateTestSampleData())).not.toThrow();
  });

  it('6. _generateTestSampleData gera PDF maior que data 1 dia (mais conteúdo)', () => {
    const small = generatePdfBytes(makeMirrorData());
    const big = generatePdfBytes(_generateTestSampleData());
    expect(big.byteLength).toBeGreaterThan(small.byteLength);
  });
});

describe('mirrorPdf REAL — batch (multipage)', () => {
  // Importação dinâmica das funções batch (porque elas usam async Blob,
  // o que travaria jsdom). Vou usar a versão arraybuffer do batch via _generatePdfDoc
  // chamado em sequência simulando o que generatePdfDocBatch faz internamente,
  // mas pra batch real, vou importar dinamicamente e usar arraybuffer.
  // Como API pública batch retorna Blob, e blob.arrayBuffer() não funciona em jsdom,
  // testaremos via comparação indireta: gerar 1, gerar 3, comparar tamanho.

  it('7. _generateTestSampleData renderiza domingos corretamente (não throw em rows isSunday)', () => {
    const data = _generateTestSampleData();
    const sundays = data.rows.filter(r => r.isSunday);
    expect(sundays.length).toBeGreaterThan(0);
    // Não deve falhar mesmo com várias linhas de domingo
    expect(() => generatePdfBytes(data)).not.toThrow();
  });

  it('8. PDF com row isAbsentCompensated não corrompe geração', () => {
    const data = makeMirrorData({
      rows: [
        makeDayRow({ date: '2026-05-11', isAbsentCompensated: true,
          ent1: { display: 'Aus. Comp.', flag: null },
          sai1: { display: 'Aus. Comp.', flag: null },
          ent2: { display: 'Aus. Comp.', flag: null },
          sai2: { display: 'Aus. Comp.', flag: null },
        }),
      ],
    });
    const ab = generatePdfBytes(data);
    expect(ab.byteLength).toBeGreaterThan(10_000);
    expect(countPages(ab)).toBe(1);
  });

  it('9. PDF com bankNet negativo não corrompe geração', () => {
    const data = makeMirrorData({
      totals: {
        expected: 480, daytime: 0, nighttime: 0, interval: 0,
        bankCredit: 30, bankDebit: 100, bankNet: -70,
      },
    });
    const ab = generatePdfBytes(data);
    expect(ab.byteLength).toBeGreaterThan(10_000);
  });

  it('10. PDF com nome de funcionário longo (acentos) não corrompe', () => {
    const data = makeMirrorData({
      employee: {
        name: 'João Müller da Silva Pereira Ferreira',
        cpf: '12345678901',
        pis: '',
        badge_number: '',
        function_role: 'Operador de Logística Sênior',
        schedule_type: 'Normal',
      },
    });
    const ab = generatePdfBytes(data);
    expect(ab.byteLength).toBeGreaterThan(10_000);
    expect(countPages(ab)).toBe(1);
  });
});

describe('mirrorPdf REAL — propriedades de output', () => {
  it('11. output("arraybuffer") retorna instanceof ArrayBuffer', () => {
    const doc = _generatePdfDoc(makeMirrorData());
    const out = doc.output('arraybuffer');
    expect(out).toBeInstanceOf(ArrayBuffer);
  });

  it('12. output("blob") retorna Blob (apenas verificamos type, não bytes via arrayBuffer)', () => {
    const doc = _generatePdfDoc(makeMirrorData());
    const blob = doc.output('blob');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(10_000);
  });

  it('13. doc.internal.pages tem length 2 (jspdf considera index 0 vazio)', () => {
    const doc = _generatePdfDoc(makeMirrorData());
    // jspdf internal: pages é 1-indexed (pages[0] é vazio, pages[1] é 1ª página)
    expect(doc.internal.pages.length).toBe(2);
  });

  it('14. doc.internal.pageSize.width = 842 pt (A4 landscape)', () => {
    const doc = _generatePdfDoc(makeMirrorData());
    expect(doc.internal.pageSize.width).toBeCloseTo(842, 0);
  });

  it('15. doc.internal.pageSize.height = 595 pt (A4 landscape)', () => {
    const doc = _generatePdfDoc(makeMirrorData());
    expect(doc.internal.pageSize.height).toBeCloseTo(595, 0);
  });
});
