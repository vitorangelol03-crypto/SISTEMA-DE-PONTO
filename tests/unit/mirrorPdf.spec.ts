/**
 * Testes unit para src/utils/mirrorPdf.ts
 *
 * Framework: vitest. Roda com: npx vitest run mirrorPdf
 *
 * Cobertura: 45+ casos cobrindo a API pública (generateMirrorPdf,
 * downloadMirrorPdf, generateMirrorsBatchPdf, downloadMirrorsBatchPdf)
 * + helpers _generatePdfDoc e _generateTestSampleData.
 *
 * Estratégia mock: jsPDF substituído por classe spy que rastreia constructor
 * args + chamadas a text/rect/line/save/output/addPage/setFont/setFontSize/
 * setLineWidth/setDrawColor/getTextWidth/splitTextToSize. autoTable mockado
 * como fn que registra payload e seta lastAutoTable.finalY. SEM renderização
 * real — testamos chamadas API e payload.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { MirrorData, MirrorDayRow } from '../../src/utils/mirrorGenerator';

// vi.hoisted garante que o registry exista antes do vi.mock factory rodar.
const { jsPdfRegistry, autoTableSpy } = vi.hoisted(() => ({
  jsPdfRegistry: {
    instances: [] as any[],
    saveCalls: [] as Array<{ filename: string }>,
  },
  autoTableSpy: vi.fn(),
}));

vi.mock('jspdf', () => {
  class FakeJsPDF {
    config: any;
    calls = {
      text: [] as Array<{ text: string; x: number; y: number; opts?: any }>,
      rect: [] as Array<{ x: number; y: number; w: number; h: number }>,
      line: [] as Array<{ x1: number; y1: number; x2: number; y2: number }>,
      setFont: [] as Array<{ family: string; style?: string }>,
      setFontSize: [] as number[],
      setLineWidth: [] as number[],
      setDrawColor: [] as number[],
      addPage: [] as Array<{ format?: string; orientation?: string }>,
      output: [] as string[],
      save: [] as string[],
    };
    lastAutoTable: { finalY?: number } | undefined;

    constructor(config: any) {
      this.config = config;
      jsPdfRegistry.instances.push(this);
    }

    text(text: string, x: number, y: number, opts?: any) {
      this.calls.text.push({ text, x, y, opts });
    }
    rect(x: number, y: number, w: number, h: number) {
      this.calls.rect.push({ x, y, w, h });
    }
    line(x1: number, y1: number, x2: number, y2: number) {
      this.calls.line.push({ x1, y1, x2, y2 });
    }
    setFont(family: string, style?: string) {
      this.calls.setFont.push({ family, style });
    }
    setFontSize(size: number) {
      this.calls.setFontSize.push(size);
    }
    setLineWidth(w: number) {
      this.calls.setLineWidth.push(w);
    }
    setDrawColor(c: number) {
      this.calls.setDrawColor.push(c);
    }
    addPage(format?: string, orientation?: string) {
      this.calls.addPage.push({ format, orientation });
    }
    output(type: string) {
      this.calls.output.push(type);
      if (type === 'blob') {
        return new Blob(['fake-pdf'], { type: 'application/pdf' });
      }
      return 'fake-output';
    }
    save(filename: string) {
      this.calls.save.push(filename);
      jsPdfRegistry.saveCalls.push({ filename });
    }
    getTextWidth(text: string) {
      // Aprox: 0.5pt por char em fontSize 7-8
      return text.length * 4;
    }
    splitTextToSize(text: string, _maxW: number) {
      // Mock simplificado: quebra em 1 linha sempre
      return [text];
    }
  }

  return { jsPDF: FakeJsPDF };
});

vi.mock('jspdf-autotable', () => {
  return {
    default: (doc: any, opts: any) => {
      autoTableSpy(doc, opts);
      // Simula que a tabela vai até y=startY + 360 (aprox 28 linhas × ~13pt)
      const finalY = (opts.startY ?? 90) + 360;
      doc.lastAutoTable = { finalY };
    },
  };
});

import {
  generateMirrorPdf,
  downloadMirrorPdf,
  generateMirrorsBatchPdf,
  downloadMirrorsBatchPdf,
  _generatePdfDoc,
  _generateTestSampleData,
} from '../../src/utils/mirrorPdf';

// ─── Helpers de fixture ────────────────────────────────────────────────────

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

beforeEach(() => {
  jsPdfRegistry.instances.length = 0;
  jsPdfRegistry.saveCalls.length = 0;
  autoTableSpy.mockClear();
});

// ─── generateMirrorPdf ─────────────────────────────────────────────────────

describe('generateMirrorPdf', () => {
  it('1. retorna Blob com tipo application/pdf', async () => {
    const blob = await generateMirrorPdf(makeMirrorData());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('2. cria 1 instância de jsPDF', async () => {
    await generateMirrorPdf(makeMirrorData());
    expect(jsPdfRegistry.instances).toHaveLength(1);
  });

  it('3. configura jsPDF com landscape + A4 + unit pt', async () => {
    await generateMirrorPdf(makeMirrorData());
    const cfg = jsPdfRegistry.instances[0].config;
    expect(cfg.orientation).toBe('landscape');
    expect(cfg.format).toBe('a4');
    expect(cfg.unit).toBe('pt');
  });

  it('4. chama output("blob") exatamente 1 vez', async () => {
    await generateMirrorPdf(makeMirrorData());
    expect(jsPdfRegistry.instances[0].calls.output).toEqual(['blob']);
  });

  it('5. NÃO chama addPage (single page)', async () => {
    await generateMirrorPdf(makeMirrorData());
    expect(jsPdfRegistry.instances[0].calls.addPage).toHaveLength(0);
  });

  it('6. chama autoTable 1 vez', async () => {
    await generateMirrorPdf(makeMirrorData());
    expect(autoTableSpy).toHaveBeenCalledTimes(1);
  });

  it('7. autoTable recebe 12 colunas no head', async () => {
    await generateMirrorPdf(makeMirrorData());
    const opts = autoTableSpy.mock.calls[0]![1];
    expect(opts.head[0]).toHaveLength(12);
  });

  it('8. autoTable head contém colunas esperadas em ordem', async () => {
    await generateMirrorPdf(makeMirrorData());
    const opts = autoTableSpy.mock.calls[0]![1];
    expect(opts.head[0]).toEqual([
      'Data',
      'Ent.1', 'Saí.1', 'Ent.2', 'Saí.2',
      'Previstas',
      'Diurnas', 'Noturnas', 'Not.Red.',
      'Intervalo',
      'B.Crédito', 'B.Débito',
    ]);
  });

  it('9. autoTable body tem N linhas igual a data.rows.length', async () => {
    const data = makeMirrorData({
      rows: [makeDayRow({ date: '2026-05-11' }), makeDayRow({ date: '2026-05-12' }), makeDayRow({ date: '2026-05-13' })],
    });
    await generateMirrorPdf(data);
    const opts = autoTableSpy.mock.calls[0]![1];
    expect(opts.body).toHaveLength(3);
  });

  it('10. domingo vira linha com colunas vazias exceto Previstas="00:00"', async () => {
    const sunday = makeDayRow({
      date: '2026-05-10',
      label: '10/05 dom',
      isSunday: true,
      ent1: { display: '', flag: null },
      sai1: { display: '', flag: null },
      ent2: { display: '', flag: null },
      sai2: { display: '', flag: null },
      expected: 0,
    });
    const data = makeMirrorData({ rows: [sunday] });
    await generateMirrorPdf(data);
    const opts = autoTableSpy.mock.calls[0]![1];
    expect(opts.body[0]).toEqual(['10/05 dom', '', '', '', '', '00:00', '', '', '', '', '', '']);
  });

  it('11. theme="grid" + lineWidth=0.4 + cellPadding=1.5 nos styles', async () => {
    await generateMirrorPdf(makeMirrorData());
    const opts = autoTableSpy.mock.calls[0]![1];
    expect(opts.theme).toBe('grid');
    expect(opts.styles.lineWidth).toBe(0.4);
    expect(opts.styles.cellPadding).toBe(1.5);
  });

  it('12. tableWidth = 802.4 (CONTENT_W) e startY = 90', async () => {
    await generateMirrorPdf(makeMirrorData());
    const opts = autoTableSpy.mock.calls[0]![1];
    expect(opts.tableWidth).toBe(802.4);
    expect(opts.startY).toBe(90);
  });
});

// ─── downloadMirrorPdf ─────────────────────────────────────────────────────

describe('downloadMirrorPdf', () => {
  it('13. chama save() com o filename fornecido', async () => {
    await downloadMirrorPdf(makeMirrorData(), 'espelho.pdf');
    expect(jsPdfRegistry.saveCalls).toEqual([{ filename: 'espelho.pdf' }]);
  });

  it('14. cria 1 instância de jsPDF', async () => {
    await downloadMirrorPdf(makeMirrorData(), 'x.pdf');
    expect(jsPdfRegistry.instances).toHaveLength(1);
  });

  it('15. NÃO chama output() (download usa save direto)', async () => {
    await downloadMirrorPdf(makeMirrorData(), 'x.pdf');
    expect(jsPdfRegistry.instances[0].calls.output).toHaveLength(0);
  });

  it('16. retorna Promise<void> (resolve com undefined)', async () => {
    const result = await downloadMirrorPdf(makeMirrorData(), 'x.pdf');
    expect(result).toBeUndefined();
  });
});

// ─── generateMirrorsBatchPdf ───────────────────────────────────────────────

describe('generateMirrorsBatchPdf', () => {
  it('17. 1 espelho na lista → 1 instância, 0 addPage', async () => {
    await generateMirrorsBatchPdf([makeMirrorData()]);
    expect(jsPdfRegistry.instances).toHaveLength(1);
    expect(jsPdfRegistry.instances[0].calls.addPage).toHaveLength(0);
  });

  it('18. 3 espelhos → 1 instância, 2 addPage (entre páginas)', async () => {
    await generateMirrorsBatchPdf([makeMirrorData(), makeMirrorData(), makeMirrorData()]);
    expect(jsPdfRegistry.instances).toHaveLength(1);
    expect(jsPdfRegistry.instances[0].calls.addPage).toHaveLength(2);
  });

  it('19. addPage usa format=a4 e orientation=landscape', async () => {
    await generateMirrorsBatchPdf([makeMirrorData(), makeMirrorData()]);
    const addPageCalls = jsPdfRegistry.instances[0].calls.addPage;
    expect(addPageCalls[0]).toEqual({ format: 'a4', orientation: 'landscape' });
  });

  it('20. lista vazia → throw Error("Lista de espelhos vazia")', async () => {
    await expect(generateMirrorsBatchPdf([])).rejects.toThrow('Lista de espelhos vazia');
  });

  it('21. retorna Blob application/pdf', async () => {
    const blob = await generateMirrorsBatchPdf([makeMirrorData()]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('22. N espelhos → autoTable chamado N vezes (1 por página)', async () => {
    await generateMirrorsBatchPdf([makeMirrorData(), makeMirrorData(), makeMirrorData()]);
    expect(autoTableSpy).toHaveBeenCalledTimes(3);
  });

  it('23. cada espelho usa seus próprios dados (não vaza)', async () => {
    const data1 = makeMirrorData({
      employee: { ...makeMirrorData().employee, name: 'Funcionário A' },
    });
    const data2 = makeMirrorData({
      employee: { ...makeMirrorData().employee, name: 'Funcionário B' },
    });
    await generateMirrorsBatchPdf([data1, data2]);

    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText.some((t: string) => t === 'Funcionário A')).toBe(true);
    expect(allText.some((t: string) => t === 'Funcionário B')).toBe(true);
  });
});

// ─── downloadMirrorsBatchPdf ───────────────────────────────────────────────

describe('downloadMirrorsBatchPdf', () => {
  it('24. chama save() com filename + cria N páginas', async () => {
    await downloadMirrorsBatchPdf(
      [makeMirrorData(), makeMirrorData(), makeMirrorData()],
      'lote.pdf',
    );
    expect(jsPdfRegistry.saveCalls).toEqual([{ filename: 'lote.pdf' }]);
    expect(jsPdfRegistry.instances[0].calls.addPage).toHaveLength(2);
  });

  it('25. lista vazia → throw Error("Lista de espelhos vazia")', async () => {
    await expect(downloadMirrorsBatchPdf([], 'x.pdf')).rejects.toThrow('Lista de espelhos vazia');
  });
});

// ─── Layout: cabeçalho da empresa (drawHeaderEmpresa) ──────────────────────

describe('drawHeaderEmpresa (via generateMirrorPdf)', () => {
  it('26. desenha 1 rect externo + 3 line separadores verticais', async () => {
    await generateMirrorPdf(makeMirrorData());
    const inst = jsPdfRegistry.instances[0];
    // Header empresa: rect + 3 linhas verticais. Sub-header também tem 1 rect + 1 linha.
    // Total esperado em desenho de moldura: 2 rect + 4 linhas
    expect(inst.calls.rect.length).toBeGreaterThanOrEqual(2);
    expect(inst.calls.line.length).toBeGreaterThanOrEqual(4);
  });

  it('27. desenha "Empregador:", "CNPJ / CPF:", "Função:" como labels bold', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('Empregador:');
    expect(allText).toContain('CNPJ / CPF:');
    expect(allText).toContain('Função:');
  });

  it('28. desenha legal_name + CNPJ formatado + function_role', async () => {
    await generateMirrorPdf(makeMirrorData({
      company: {
        legal_name: 'EMPRESA TESTE LTDA',
        cnpj: '12345678000195',
        logo_url: null,
        display_name: 'Empresa Teste',
      },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('EMPRESA TESTE LTDA');
    expect(allText).toContain('12.345.678/0001-95'); // CNPJ formatado
    expect(allText).toContain('Operador');
  });

  it('29. logo: iniciais do display_name centralizadas (ET de "Empresa Teste")', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('ET');
  });

  it('30. desenha "Período:" + data formatada BR', async () => {
    await generateMirrorPdf(makeMirrorData({
      period: { start: '2026-05-01', end: '2026-05-15', emissionDate: '2026-05-16' },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('Período:');
    expect(allText).toContain('01/05/2026 a 15/05/2026');
  });

  it('31. desenha "Jornada de trabalho:" + scheduleSummary', async () => {
    await generateMirrorPdf(makeMirrorData({
      scheduleSummary: 'Seg-Sex: 8h / Sáb: 4h / Dom: folga',
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('Jornada de trabalho:');
    expect(allText).toContain('Seg-Sex: 8h / Sáb: 4h / Dom: folga');
  });
});

// ─── Layout: sub-header (drawSubHeader) ────────────────────────────────────

describe('drawSubHeader (via generateMirrorPdf)', () => {
  it('32. desenha "Colaborador:", "CPF:", "Crachá:", "PIS:", "Escala:", "Data de emissão:"', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('Colaborador:');
    expect(allText).toContain('CPF:');
    expect(allText).toContain('Crachá:');
    expect(allText).toContain('PIS:');
    expect(allText).toContain('Escala:');
    expect(allText).toContain('Data de emissão:');
  });

  it('33. desenha nome do employee', async () => {
    await generateMirrorPdf(makeMirrorData({
      employee: {
        name: 'João Müller',
        cpf: '12345678901',
        pis: '12345678910',
        badge_number: '0001',
        function_role: 'Operador',
        schedule_type: 'Normal',
      },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('João Müller');
  });

  it('34. CPF formatado XXX.XXX.XXX-XX', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('123.456.789-01');
  });

  it('35. data de emissão formatada BR', async () => {
    await generateMirrorPdf(makeMirrorData({
      period: { start: '2026-05-11', end: '2026-05-11', emissionDate: '2026-05-20' },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('20/05/2026');
  });
});

// ─── Layout: totais (drawTotals) ───────────────────────────────────────────

describe('drawTotals (via generateMirrorPdf)', () => {
  it('36. desenha labels: Previstas, Diurnas, Noturnas, Not. Red, Intervalo, B.Crédito, B.Débito, B.Total', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('Previstas:');
    expect(allText).toContain('Diurnas:');
    expect(allText).toContain('Noturnas:');
    expect(allText).toContain('Not. Red:');
    expect(allText).toContain('Intervalo:');
    expect(allText).toContain('B.Crédito:');
    expect(allText).toContain('B.Débito:');
    expect(allText).toContain('B.Total:');
  });

  it('37. totals.bankNet positivo formatado como HH:MM sem sinal', async () => {
    await generateMirrorPdf(makeMirrorData({
      totals: {
        expected: 480, daytime: 0, nighttime: 0, interval: 0,
        bankCredit: 100, bankDebit: 30, bankNet: 70,
      },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('01:10'); // 70min
  });

  it('38. totals.bankNet negativo formatado com sinal "-"', async () => {
    await generateMirrorPdf(makeMirrorData({
      totals: {
        expected: 480, daytime: 0, nighttime: 0, interval: 0,
        bankCredit: 30, bankDebit: 100, bankNet: -70,
      },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('-01:10');
  });

  it('39. totals.bankNet zero exibido como "00:00"', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText).toContain('00:00');
  });
});

// ─── Layout: legenda + footer ──────────────────────────────────────────────

describe('drawLegend e drawFooter (via generateMirrorPdf)', () => {
  it('40. desenha legenda com os 3 marcadores: *, ~, ^', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    const hasLegend = allText.some((t: string) =>
      t.includes('Marcação incluída*') && t.includes('solicitação~') && t.includes('pré-assinalada^'),
    );
    expect(hasLegend).toBe(true);
  });

  it('41. desenha linha de assinatura no footer', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText.some((t: string) => t.includes('_______'))).toBe(true);
  });

  it('42. desenha texto consensual com nome do employee na assinatura', async () => {
    await generateMirrorPdf(makeMirrorData({
      employee: {
        name: 'João Test',
        cpf: '12345678901',
        pis: '',
        badge_number: '',
        function_role: '',
        schedule_type: 'Normal',
      },
    }));
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText.some((t: string) => t.includes('Eu, João Test'))).toBe(true);
  });

  it('43. desenha nota "* Versão de visualização" no footer esquerdo', async () => {
    await generateMirrorPdf(makeMirrorData());
    const allText = jsPdfRegistry.instances[0].calls.text.map((c: any) => c.text);
    expect(allText.some((t: string) => t.includes('Versão de visualização'))).toBe(true);
  });
});

// ─── _generatePdfDoc + _generateTestSampleData (test helpers) ──────────────

describe('test helpers', () => {
  it('44. _generatePdfDoc retorna instância de jsPDF (compatível com generateMirrorPdf)', () => {
    const doc = _generatePdfDoc(makeMirrorData());
    expect(doc).toBeDefined();
    expect(jsPdfRegistry.instances).toHaveLength(1);
  });

  it('45. _generateTestSampleData retorna MirrorData válido com 30 rows (abril/2026)', () => {
    const data = _generateTestSampleData();
    expect(data.rows).toHaveLength(30);
    expect(data.company.legal_name).toBe('CD LOGISTICA LTDA');
    expect(data.employee.name).toBe('RENATA CRISTINA LOPES');
  });

  it('46. _generateTestSampleData tem domingos com isSunday=true', () => {
    const data = _generateTestSampleData();
    const sundays = data.rows.filter(r => r.isSunday);
    expect(sundays.length).toBeGreaterThan(0);
  });

  it('47. _generateTestSampleData inclui flags variadas (included/requested/pre_assigned)', () => {
    const data = _generateTestSampleData();
    const flags = data.rows.map(r => r.ent1.flag);
    expect(flags).toContain('included');
    expect(flags).toContain('requested');
    expect(flags).toContain('pre_assigned');
  });

  it('48. _generateTestSampleData passa pelo generateMirrorPdf sem erros', async () => {
    const data = _generateTestSampleData();
    const blob = await generateMirrorPdf(data);
    expect(blob).toBeInstanceOf(Blob);
  });
});
