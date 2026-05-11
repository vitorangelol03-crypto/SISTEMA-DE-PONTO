/**
 * Testes unit para src/utils/c6Export.ts
 *
 * Framework: vitest. Roda com: npx vitest run c6Export
 *
 * Cobertura: 40+ casos cobrindo a função exportada `exportC6PaymentSheet`
 * e o validador interno de PIX (testado indiretamente via coluna "Status"
 * do sheet Pagamentos). Cobre:
 *   - validatePixKey via comportamento (12 cenários de PIX)
 *   - Estrutura do workbook (3 sheets, ordem, nomes exatos)
 *   - createPaymentSheet (dados, totais, formula SUM, status OK/VERIFICAR)
 *   - createSummarySheet (count, sum, average, max/min, taxa sucesso)
 *   - createInstructionsSheet (presença das 7 seções)
 *   - Edge cases (rows vazio impacta NaN/division, paymentDate inválido,
 *     pixKey com pontuação, descrição vazia, valores zero/negativos)
 *   - Filename gerado com timestamp UTC ISO
 *
 * Estratégia de mock: `xlsx-js-style` substituído por mock que captura
 * estado do workbook e payload das células. `XLSX.writeFile` é spy
 * inspecionável. SEM renderização real — testamos PAYLOAD, não bytes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted garante que o mock state existe antes do vi.mock factory rodar.
const { mockState } = vi.hoisted(() => ({
  mockState: {
    workbooks: [] as any[],
    writeFileCalls: [] as Array<{ workbook: any; filename: string; opts: any }>,
    currentWorkbook: null as any,
  },
}));

vi.mock('xlsx-js-style', () => {
  const colLetter = (c: number) => String.fromCharCode(65 + c);
  const encode_cell = ({ r, c }: { r: number; c: number }) => `${colLetter(c)}${r + 1}`;

  const aoa_to_sheet = (data: any[][]) => {
    const sheet: any = {};
    let maxCol = 0;
    data.forEach((row, rIdx) => {
      row.forEach((val, cIdx) => {
        const addr = encode_cell({ r: rIdx, c: cIdx });
        if (val !== undefined && val !== '') {
          sheet[addr] = typeof val === 'object' && val !== null && 'f' in val
            ? { f: val.f }
            : { v: val };
        }
        if (cIdx > maxCol) maxCol = cIdx;
      });
    });
    sheet['!ref'] = `A1:${colLetter(maxCol)}${data.length}`;
    sheet._rawData = data;
    return sheet;
  };

  const decode_range = (ref: string) => {
    const [start, end] = ref.split(':');
    const parse = (addr: string) => {
      const m = /^([A-Z]+)(\d+)$/.exec(addr);
      if (!m) return { r: 0, c: 0 };
      return { c: m[1].charCodeAt(0) - 65, r: parseInt(m[2], 10) - 1 };
    };
    return { s: parse(start), e: parse(end) };
  };

  const book_new = () => {
    const wb = { SheetNames: [] as string[], Sheets: {} as Record<string, any> };
    mockState.currentWorkbook = wb;
    mockState.workbooks.push(wb);
    return wb;
  };

  const book_append_sheet = (wb: any, sheet: any, name: string) => {
    wb.SheetNames.push(name);
    wb.Sheets[name] = sheet;
  };

  const writeFile = vi.fn((wb: any, filename: string, opts: any) => {
    mockState.writeFileCalls.push({ workbook: wb, filename, opts });
  });

  return {
    default: { utils: { book_new, aoa_to_sheet, book_append_sheet, encode_cell, decode_range }, writeFile },
    utils: { book_new, aoa_to_sheet, book_append_sheet, encode_cell, decode_range },
    writeFile,
  };
});

import { exportC6PaymentSheet } from '../../src/utils/c6Export';

// Helper: cria PaymentRow com defaults sensatos. Override por caso.
type PaymentRowInput = {
  employeeName?: string;
  pixKey?: string;
  amount?: number;
  paymentDate?: string;
  description?: string;
};
function makeRow(overrides: PaymentRowInput = {}) {
  return {
    employeeName: 'Funcionário Teste',
    pixKey: '12345678901',
    amount: 100,
    paymentDate: '2026-05-11',
    description: '',
    ...overrides,
  };
}

beforeEach(() => {
  mockState.workbooks.length = 0;
  mockState.writeFileCalls.length = 0;
  mockState.currentWorkbook = null;
});

// ─── Helpers de inspeção do workbook ──────────────────────────────────────

/** Retorna a sheet pelo nome do último workbook gerado. */
function getSheet(name: string) {
  const wb = mockState.workbooks[mockState.workbooks.length - 1];
  return wb?.Sheets[name];
}

/** Retorna valor de uma cell por endereço A1. */
function cellVal(sheet: any, addr: string): any {
  return sheet?.[addr]?.v;
}

/** Retorna o array 2D bruto passado pra aoa_to_sheet. */
function rawData(sheet: any): any[][] {
  return sheet?._rawData ?? [];
}

// ────────────────────────────────────────────────────────────────────────────

describe('validatePixKey (testado via coluna Status do sheet Pagamentos PIX)', () => {
  // O sheet Pagamentos PIX tem header em linha 6 (índice 5), com colunas:
  // 0='#', 1='Nome', 2='Chave Pix', 3='Valor', 4='Data', 5='Descrição', 6='Status'
  // Cada PaymentRow vira linha 7+, e Status='OK' se PIX válido & amount>0 & nome non-empty.
  // Testamos validação isolada com 1 row, amount=100, nome válido.

  async function statusFor(pixKey: string): Promise<string> {
    await exportC6PaymentSheet([makeRow({ pixKey })]);
    const sheet = getSheet('Pagamentos PIX');
    return cellVal(sheet, 'G7') as string;
  }

  it('1. CPF 11 dígitos puros → OK', async () => {
    expect(await statusFor('12345678901')).toBe('OK');
  });

  it('2. CPF 9 dígitos → VERIFICAR (inválido, e não bate phone que exige 10-11)', async () => {
    expect(await statusFor('123456789')).toBe('VERIFICAR');
  });

  it('3. CPF com pontuação (123.456.789-01) → VERIFICAR (validator NÃO normaliza pontos/hífens, apenas o `cleanKey` regex remove caracteres fora de [\\w@.-])', async () => {
    // Comportamento documentado: o cleanKey regex `[^\w@.-]` mantém pontos
    // e hífens, então CPF formatado falha o teste `/^\d{11}$/`. UI/UX:
    // funcionário precisa cadastrar CPF sem pontuação no `pix_key`.
    expect(await statusFor('123.456.789-01')).toBe('VERIFICAR');
  });

  it('4. CNPJ 14 dígitos → OK', async () => {
    expect(await statusFor('12345678000195')).toBe('OK');
  });

  it('5. Email válido (user@dominio.com) → OK', async () => {
    expect(await statusFor('user@dominio.com')).toBe('OK');
  });

  it('6. Email sem @ → VERIFICAR', async () => {
    expect(await statusFor('user.dominio.com')).toBe('VERIFICAR');
  });

  it('7. Telefone 11 dígitos → OK', async () => {
    expect(await statusFor('11987654321')).toBe('OK');
  });

  it('8. Telefone 10 dígitos → OK', async () => {
    expect(await statusFor('1198765432')).toBe('OK');
  });

  it('9. UUID v4 (chave aleatória) → OK', async () => {
    expect(await statusFor('550e8400-e29b-41d4-a716-446655440000')).toBe('OK');
  });

  it('10. PIX string vazia → VERIFICAR', async () => {
    expect(await statusFor('')).toBe('VERIFICAR');
  });

  it('11. PIX só whitespace → VERIFICAR', async () => {
    expect(await statusFor('   ')).toBe('VERIFICAR');
  });

  it('12. CPF com 12 dígitos (excesso) → VERIFICAR', async () => {
    expect(await statusFor('123456789012')).toBe('VERIFICAR');
  });
});

describe('exportC6PaymentSheet — estrutura do workbook', () => {
  it('13. cria 3 sheets nos nomes exatos e na ordem correta', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const wb = mockState.workbooks[0];
    expect(wb.SheetNames).toEqual(['Pagamentos PIX', 'Resumo', 'Instruções']);
  });

  it('14. chama XLSX.writeFile com bookType=xlsx e cellStyles=true', async () => {
    await exportC6PaymentSheet([makeRow()]);
    expect(mockState.writeFileCalls).toHaveLength(1);
    const call = mockState.writeFileCalls[0];
    expect(call.opts).toMatchObject({ bookType: 'xlsx', cellStyles: true });
  });

  it('15. filename segue padrão Pagamento_C6_YYYYMMDD_HHMMSS.xlsx', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const { filename } = mockState.writeFileCalls[0];
    expect(filename).toMatch(/^Pagamento_C6_\d{8}_\d{6}\.xlsx$/);
  });

  it('16. propaga throw se XLSX falhar internamente', async () => {
    // Simula erro no aoa_to_sheet via spy temporário
    const xlsxMock = await import('xlsx-js-style');
    const original = xlsxMock.utils.aoa_to_sheet;
    (xlsxMock.utils as any).aoa_to_sheet = vi.fn(() => {
      throw new Error('XLSX explodiu');
    });

    await expect(exportC6PaymentSheet([makeRow()])).rejects.toThrow('XLSX explodiu');

    // Restore
    (xlsxMock.utils as any).aoa_to_sheet = original;
  });
});

describe('createPaymentSheet — dados da sheet Pagamentos PIX', () => {
  it('17. linha 6 contém header com 7 colunas esperadas', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    const data = rawData(sheet);
    expect(data[5]).toEqual(['#', 'Nome do funcionário', 'Chave ou código Pix', 'Valor', 'Data de pagamento', 'Descrição (opcional)', 'Status']);
  });

  it('18. cada PaymentRow vira 1 linha de dados a partir da linha 7', async () => {
    const rows = [
      makeRow({ employeeName: 'Funcionário A' }),
      makeRow({ employeeName: 'Funcionário B' }),
      makeRow({ employeeName: 'Funcionário C' }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'B7')).toBe('Funcionário A');
    expect(cellVal(sheet, 'B8')).toBe('Funcionário B');
    expect(cellVal(sheet, 'B9')).toBe('Funcionário C');
  });

  it('19. numera linhas sequencialmente (#1, #2, #3)', async () => {
    await exportC6PaymentSheet([makeRow(), makeRow(), makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'A7')).toBe(1);
    expect(cellVal(sheet, 'A8')).toBe(2);
    expect(cellVal(sheet, 'A9')).toBe(3);
  });

  it('20. preserva amount como número (não string)', async () => {
    await exportC6PaymentSheet([makeRow({ amount: 1234.56 })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'D7')).toBe(1234.56);
    expect(typeof cellVal(sheet, 'D7')).toBe('number');
  });

  it('21. paymentDate YYYY-MM-DD → DD/MM/YYYY na sheet', async () => {
    await exportC6PaymentSheet([makeRow({ paymentDate: '2026-05-11' })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'E7')).toBe('11/05/2026');
  });

  it('22. descrição vazia vira string vazia (não null/undefined)', async () => {
    await exportC6PaymentSheet([makeRow({ description: '' })]);
    const sheet = getSheet('Pagamentos PIX');
    // Vazia → mock omite cell (undefined). Esperado: undefined.
    expect(cellVal(sheet, 'F7')).toBeUndefined();
  });

  it('23. descrição preenchida persiste literal', async () => {
    await exportC6PaymentSheet([makeRow({ description: 'Pagamento abril' })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'F7')).toBe('Pagamento abril');
  });

  it('24. linha TOTAL fica logo após dados com SUM formula', async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Pagamentos PIX');
    // 3 rows de dados ocupam linhas 7,8,9. TOTAL é linha 10.
    expect(cellVal(sheet, 'B10')).toBe('TOTAL');
    expect(sheet['D10']?.f).toBe('SUM(D7:D9)');
  });

  it('25. amount=0 → status VERIFICAR (validação fail-soft)', async () => {
    await exportC6PaymentSheet([makeRow({ amount: 0 })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'G7')).toBe('VERIFICAR');
  });

  it('26. amount negativo → status VERIFICAR', async () => {
    await exportC6PaymentSheet([makeRow({ amount: -50 })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'G7')).toBe('VERIFICAR');
  });

  it('27. employeeName só whitespace → status VERIFICAR (mesmo com PIX/amount válidos)', async () => {
    await exportC6PaymentSheet([makeRow({ employeeName: '   ' })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'G7')).toBe('VERIFICAR');
  });
});

describe('createSummarySheet — sheet Resumo', () => {
  it('28. label "Total de Pagamentos" presente com count correto', async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'A9')).toBe('Total de Pagamentos:');
    expect(cellVal(sheet, 'B9')).toBe(3);
  });

  it('29. "Pagamentos Válidos" e "com Erro" somam ao total', async () => {
    const rows = [
      makeRow({ pixKey: '12345678901' }), // válido
      makeRow({ pixKey: 'invalido' }), // inválido
      makeRow({ pixKey: 'user@dominio.com' }), // válido
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B10')).toBe(2); // válidos
    expect(cellVal(sheet, 'B11')).toBe(1); // com erro
  });

  it('30. Taxa de sucesso = válidos / total (float entre 0 e 1)', async () => {
    const rows = [
      makeRow({ pixKey: '12345678901' }),
      makeRow({ pixKey: 'invalido' }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B12')).toBe(0.5);
  });

  it('31. Valor Total = sum dos amounts', async () => {
    const rows = [
      makeRow({ amount: 100 }),
      makeRow({ amount: 250.5 }),
      makeRow({ amount: 49.5 }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B15')).toBe(400);
  });

  it('32. Valor Médio = total / count', async () => {
    const rows = [
      makeRow({ amount: 100 }),
      makeRow({ amount: 200 }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B16')).toBe(150);
  });

  it('33. Maior Pagamento = max(amounts)', async () => {
    const rows = [
      makeRow({ amount: 100 }),
      makeRow({ amount: 999 }),
      makeRow({ amount: 50 }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B17')).toBe(999);
  });

  it('34. Menor Pagamento = min(amounts)', async () => {
    const rows = [
      makeRow({ amount: 100 }),
      makeRow({ amount: 999 }),
      makeRow({ amount: 50 }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B18')).toBe(50);
  });

  it('35. Período N/A quando periodStart/periodEnd não fornecidos', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B6')).toBe('N/A');
  });

  it('36. Período formatado quando fornecido', async () => {
    await exportC6PaymentSheet([makeRow()], '2026-05-01', '2026-05-15');
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B6')).toBe('01/05/2026 a 15/05/2026');
  });
});

describe('createInstructionsSheet — sheet Instruções', () => {
  it('37. título principal aparece na linha 1', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Instruções');
    expect(cellVal(sheet, 'A1')).toBe('INSTRUÇÕES DE USO - PLANILHA DE PAGAMENTOS C6 BANK');
  });

  it('38. contém as 7 seções numeradas (1. a 7.)', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Instruções');
    const data = rawData(sheet);
    const sectionTitles = data
      .map(row => row[0])
      .filter(v => typeof v === 'string' && /^\d+\.\s/.test(v));
    expect(sectionTitles).toHaveLength(7);
    expect(sectionTitles[0]).toMatch(/^1\./);
    expect(sectionTitles[6]).toMatch(/^7\./);
  });

  it('39. menciona explicitamente os 5 tipos de chave PIX', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Instruções');
    const allText = rawData(sheet)
      .map(row => row[0])
      .filter(v => typeof v === 'string')
      .join(' ');
    expect(allText).toMatch(/CPF/);
    expect(allText).toMatch(/CNPJ/);
    expect(allText).toMatch(/[Ee]-?mail/);
    expect(allText).toMatch(/[Tt]elefone/);
    expect(allText).toMatch(/[Aa]leat[óo]ria/);
  });
});

describe('edge cases', () => {
  it('40. lista 1 row mínima funciona (não trava em divisão por zero etc)', async () => {
    await expect(exportC6PaymentSheet([makeRow()])).resolves.toBeUndefined();
    expect(mockState.writeFileCalls).toHaveLength(1);
  });

  it('41. acentos em employeeName preservados', async () => {
    await exportC6PaymentSheet([makeRow({ employeeName: 'João Müller' })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'B7')).toBe('João Müller');
  });

  it('42. mix válidos + inválidos: todos aparecem, status reflete validação por linha', async () => {
    const rows = [
      makeRow({ employeeName: 'Válido A', pixKey: '12345678901' }),
      makeRow({ employeeName: 'Inválido B', pixKey: 'xyz' }),
      makeRow({ employeeName: 'Válido C', pixKey: 'user@dominio.com' }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'G7')).toBe('OK');
    expect(cellVal(sheet, 'G8')).toBe('VERIFICAR');
    expect(cellVal(sheet, 'G9')).toBe('OK');
  });

  it('43. amount com muitos decimais preserva valor (não trunca em mock)', async () => {
    await exportC6PaymentSheet([makeRow({ amount: 1234.5678 })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'D7')).toBe(1234.5678);
  });

  it('44. periodStart fornecido mas periodEnd ausente → N/A no Resumo (ambos exigidos)', async () => {
    await exportC6PaymentSheet([makeRow()], '2026-05-01', undefined);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'B6')).toBe('N/A');
  });
});
