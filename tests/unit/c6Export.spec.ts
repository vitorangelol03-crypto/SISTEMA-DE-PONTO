/**
 * Testes unit para src/utils/c6Export.ts
 *
 * Framework: vitest. Roda com: npx vitest run c6Export
 *
 * Cobertura: 44+ casos. Estratégia REAL (não mock pesado):
 * - xlsx-js-style é usado REAL — book_new, aoa_to_sheet, book_append_sheet,
 *   encode_cell, decode_range, etc. produzem workbook genuíno.
 * - APENAS `writeFile` é mockado (não pode escrever em disco em jsdom).
 * - Workbook real é inspecionado: SheetNames, células reais (.v), tipos (.t),
 *   ranges (!ref), formulas (.f), styles (.s).
 *
 * Isso PEGA bugs de payload que mock paralelo poderia mascarar (ex: se
 * lib XLSX transformar valor antes de gravar).
 *
 * Risco residual: bytes do XLSX em disco não são validados (lib pode
 * serializar incorretamente). Pra cobrir isso seria preciso parsear XLSX
 * de volta com `XLSX.read(buffer)` — viável mas mais lento e fora do
 * escopo desta sub-fase.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock SELETIVO de xlsx-js-style: usa real exceto writeFile.
// Como c6Export faz `import * as XLSX from 'xlsx-js-style'`, precisamos
// preservar TODAS as exports nomeadas (utils, etc.) e SÓ substituir writeFile.
const { writeFileCalls, writeFileSpy } = vi.hoisted(() => {
  const calls: Array<{ workbook: any; filename: string; opts: any }> = [];
  return {
    writeFileCalls: calls,
    writeFileSpy: (wb: any, filename: string, opts: any) => {
      calls.push({ workbook: wb, filename, opts });
    },
  };
});

vi.mock('xlsx-js-style', async (importOriginal) => {
  // `importOriginal()` retorna { default: <objeto CommonJS inteiro> }.
  // Achata o default no top-level pra `import * as XLSX` pegar utils, encode_cell, etc.
  const raw = await importOriginal<{ default: typeof import('xlsx-js-style') }>();
  const real = raw.default;
  return {
    ...real,
    writeFile: writeFileSpy,
    default: {
      ...real,
      writeFile: writeFileSpy,
    },
  };
});

import { exportC6PaymentSheet } from '../../src/utils/c6Export';

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
  writeFileCalls.length = 0;
});

// Helpers
function lastWorkbook() {
  return writeFileCalls[writeFileCalls.length - 1]?.workbook;
}
function getSheet(name: string) {
  return lastWorkbook()?.Sheets[name];
}
function cellVal(sheet: any, addr: string): any {
  return sheet?.[addr]?.v;
}

describe('validatePixKey (testado via coluna Status do sheet Pagamentos PIX)', () => {
  // Sheet Pagamentos PIX layout:
  //   linha 1: título mesclado
  //   linha 2: gerado em + total
  //   linha 4: aviso
  //   linha 6: header (#, Nome, Chave, Valor, Data, Descrição, Status)
  //   linha 7+: dados
  // Status='OK' se PIX válido & amount>0 & nome non-empty.

  async function statusFor(pixKey: string): Promise<string> {
    await exportC6PaymentSheet([makeRow({ pixKey })]);
    const sheet = getSheet('Pagamentos PIX');
    return cellVal(sheet, 'G7') as string;
  }

  it('1. CPF 11 dígitos puros → OK', async () => {
    expect(await statusFor('12345678901')).toBe('OK');
  });

  it('2. CPF 9 dígitos → VERIFICAR (não bate CPF nem phone)', async () => {
    expect(await statusFor('123456789')).toBe('VERIFICAR');
  });

  it('3. CPF com pontuação (123.456.789-01) → VERIFICAR (não normaliza, TECH_DEBT 6.23)', async () => {
    expect(await statusFor('123.456.789-01')).toBe('VERIFICAR');
  });

  it('4. CNPJ 14 dígitos → OK', async () => {
    expect(await statusFor('12345678000195')).toBe('OK');
  });

  it('5. Email válido → OK', async () => {
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

  it('9. UUID v4 → OK', async () => {
    expect(await statusFor('550e8400-e29b-41d4-a716-446655440000')).toBe('OK');
  });

  it('10. PIX vazia → VERIFICAR', async () => {
    expect(await statusFor('')).toBe('VERIFICAR');
  });

  it('11. PIX só whitespace → VERIFICAR', async () => {
    expect(await statusFor('   ')).toBe('VERIFICAR');
  });

  it('12. CPF com 12 dígitos → VERIFICAR', async () => {
    expect(await statusFor('123456789012')).toBe('VERIFICAR');
  });
});

describe('exportC6PaymentSheet — estrutura do workbook REAL', () => {
  it('13. cria 3 sheets nos nomes exatos e na ordem correta', async () => {
    await exportC6PaymentSheet([makeRow()]);
    expect(lastWorkbook().SheetNames).toEqual(['Pagamentos PIX', 'Resumo', 'Instruções']);
  });

  it('14. chama XLSX.writeFile com bookType=xlsx + cellStyles=true', async () => {
    await exportC6PaymentSheet([makeRow()]);
    expect(writeFileCalls).toHaveLength(1);
    expect(writeFileCalls[0].opts).toMatchObject({ bookType: 'xlsx', cellStyles: true });
  });

  it('15. filename segue padrão Pagamento_C6_YYYYMMDD_HHMMSS.xlsx', async () => {
    await exportC6PaymentSheet([makeRow()]);
    expect(writeFileCalls[0].filename).toMatch(/^Pagamento_C6_\d{8}_\d{6}\.xlsx$/);
  });

  it('16. todas as 3 sheets têm !ref válido (workbook bem-formado)', async () => {
    await exportC6PaymentSheet([makeRow(), makeRow()]);
    expect(getSheet('Pagamentos PIX')['!ref']).toMatch(/^A1:G\d+$/);
    expect(getSheet('Resumo')['!ref']).toMatch(/^A1:B\d+$/);
    expect(getSheet('Instruções')['!ref']).toMatch(/^A1:A\d+$/);
  });
});

describe('createPaymentSheet — dados reais', () => {
  it('17. linha 6 contém header com 7 colunas', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'A6')).toBe('#');
    expect(cellVal(sheet, 'B6')).toBe('Nome do funcionário');
    expect(cellVal(sheet, 'C6')).toBe('Chave ou código Pix');
    expect(cellVal(sheet, 'D6')).toBe('Valor');
    expect(cellVal(sheet, 'E6')).toBe('Data de pagamento');
    expect(cellVal(sheet, 'F6')).toBe('Descrição (opcional)');
    expect(cellVal(sheet, 'G6')).toBe('Status');
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

  it('19. coluna # tem números sequenciais (cell type "n")', async () => {
    await exportC6PaymentSheet([makeRow(), makeRow(), makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(sheet['A7'].v).toBe(1);
    expect(sheet['A7'].t).toBe('n');
    expect(sheet['A8'].v).toBe(2);
    expect(sheet['A9'].v).toBe(3);
  });

  it('20. amount preservado como número (cell type "n")', async () => {
    await exportC6PaymentSheet([makeRow({ amount: 1234.56 })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(sheet['D7'].v).toBe(1234.56);
    expect(sheet['D7'].t).toBe('n');
  });

  it('21. paymentDate YYYY-MM-DD → DD/MM/YYYY (string formatada)', async () => {
    await exportC6PaymentSheet([makeRow({ paymentDate: '2026-05-11' })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'E7')).toBe('11/05/2026');
  });

  it('22. descrição vazia: cell omitida ou v="" (graceful)', async () => {
    await exportC6PaymentSheet([makeRow({ description: '' })]);
    const sheet = getSheet('Pagamentos PIX');
    // XLSX real omite cells vazias do mapeamento ou armazena com v=''
    const f7 = sheet['F7'];
    expect(f7 === undefined || f7.v === '' || f7.v === undefined).toBe(true);
  });

  it('23. descrição preenchida persiste literal', async () => {
    await exportC6PaymentSheet([makeRow({ description: 'Pagamento abril' })]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'F7')).toBe('Pagamento abril');
  });

  it('24. linha TOTAL com SUM formula real (não string)', async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Pagamentos PIX');
    // 3 rows ocupam linhas 7,8,9. TOTAL é linha 10.
    expect(cellVal(sheet, 'B10')).toBe('TOTAL');
    expect(sheet['D10'].f).toBe('SUM(D7:D9)');
  });

  it('25. amount=0 → VERIFICAR', async () => {
    await exportC6PaymentSheet([makeRow({ amount: 0 })]);
    expect(cellVal(getSheet('Pagamentos PIX'), 'G7')).toBe('VERIFICAR');
  });

  it('26. amount negativo → VERIFICAR', async () => {
    await exportC6PaymentSheet([makeRow({ amount: -50 })]);
    expect(cellVal(getSheet('Pagamentos PIX'), 'G7')).toBe('VERIFICAR');
  });

  it('27. nome só whitespace → VERIFICAR', async () => {
    await exportC6PaymentSheet([makeRow({ employeeName: '   ' })]);
    expect(cellVal(getSheet('Pagamentos PIX'), 'G7')).toBe('VERIFICAR');
  });

  it('28. range expand pra incluir linha TOTAL (validação de bytes implícita)', async () => {
    await exportC6PaymentSheet([makeRow(), makeRow(), makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    // 3 rows + header (6) + 1 TOTAL = linha 10. Range A1:G10
    expect(sheet['!ref']).toBe('A1:G10');
  });

  it('29. status OK vs VERIFICAR é STRING (não bool, garantia de não-truncate)', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(typeof sheet['G7'].v).toBe('string');
    expect(sheet['G7'].t).toBe('s');
  });
});

describe('createSummarySheet — dados reais', () => {
  it('30. Total de Pagamentos com count correto e cell type number', async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(cellVal(sheet, 'A9')).toBe('Total de Pagamentos:');
    expect(sheet['B9'].v).toBe(3);
    expect(sheet['B9'].t).toBe('n');
  });

  it('31. Válidos + com Erro = Total', async () => {
    const rows = [
      makeRow({ pixKey: '12345678901' }),
      makeRow({ pixKey: 'invalido' }),
      makeRow({ pixKey: 'user@dominio.com' }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(sheet['B10'].v).toBe(2);
    expect(sheet['B11'].v).toBe(1);
    expect(sheet['B10'].v + sheet['B11'].v).toBe(rows.length);
  });

  it('32. Taxa = válidos / total como número (não percentual string)', async () => {
    const rows = [
      makeRow({ pixKey: '12345678901' }),
      makeRow({ pixKey: 'invalido' }),
    ];
    await exportC6PaymentSheet(rows);
    const sheet = getSheet('Resumo');
    expect(sheet['B12'].v).toBe(0.5);
  });

  it('33. Valor Total = sum exato (sem perda de precisão)', async () => {
    const rows = [
      makeRow({ amount: 100 }),
      makeRow({ amount: 250.5 }),
      makeRow({ amount: 49.5 }),
    ];
    await exportC6PaymentSheet(rows);
    expect(getSheet('Resumo')['B15'].v).toBe(400);
  });

  it('34. Valor Médio = Total/Count', async () => {
    await exportC6PaymentSheet([
      makeRow({ amount: 100 }),
      makeRow({ amount: 200 }),
    ]);
    expect(getSheet('Resumo')['B16'].v).toBe(150);
  });

  it('35. Maior/Menor pagamentos', async () => {
    await exportC6PaymentSheet([
      makeRow({ amount: 100 }),
      makeRow({ amount: 999 }),
      makeRow({ amount: 50 }),
    ]);
    const sheet = getSheet('Resumo');
    expect(sheet['B17'].v).toBe(999);
    expect(sheet['B18'].v).toBe(50);
  });

  it('36. Período N/A quando ausente', async () => {
    await exportC6PaymentSheet([makeRow()]);
    expect(cellVal(getSheet('Resumo'), 'B6')).toBe('N/A');
  });

  it('37. Período formatado quando fornecido', async () => {
    await exportC6PaymentSheet([makeRow()], '2026-05-01', '2026-05-15');
    expect(cellVal(getSheet('Resumo'), 'B6')).toBe('01/05/2026 a 15/05/2026');
  });
});

describe('createInstructionsSheet', () => {
  it('38. título principal na linha 1', async () => {
    await exportC6PaymentSheet([makeRow()]);
    expect(cellVal(getSheet('Instruções'), 'A1')).toBe('INSTRUÇÕES DE USO - PLANILHA DE PAGAMENTOS C6 BANK');
  });

  it('39. menciona 5 tipos de chave PIX (CPF/CNPJ/email/phone/UUID)', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Instruções');
    // Concat textos de coluna A de todas as linhas
    const ref = sheet['!ref'] as string;
    const [, endRow] = ref.split(':')[1].match(/[A-Z]+(\d+)/) ?? ['', '0'];
    const maxRow = parseInt(endRow, 10);
    let allText = '';
    for (let r = 1; r <= maxRow; r++) {
      const v = sheet[`A${r}`]?.v;
      if (typeof v === 'string') allText += v + '\n';
    }
    expect(allText).toMatch(/CPF/);
    expect(allText).toMatch(/CNPJ/);
    expect(allText).toMatch(/[Ee]-?mail/);
    expect(allText).toMatch(/[Tt]elefone/);
    expect(allText).toMatch(/[Aa]leat[óo]ria/);
  });
});

describe('edge cases — workbook real', () => {
  it('40. 1 row mínima: workbook válido + writeFile chamado', async () => {
    await expect(exportC6PaymentSheet([makeRow()])).resolves.toBeUndefined();
    expect(writeFileCalls).toHaveLength(1);
    expect(lastWorkbook().SheetNames).toHaveLength(3);
  });

  it('41. acentos preservados (encoding correto)', async () => {
    await exportC6PaymentSheet([makeRow({ employeeName: 'João Müller' })]);
    expect(cellVal(getSheet('Pagamentos PIX'), 'B7')).toBe('João Müller');
  });

  it('42. mix válidos+inválidos: status por linha correto', async () => {
    await exportC6PaymentSheet([
      makeRow({ pixKey: '12345678901' }),
      makeRow({ pixKey: 'xyz' }),
      makeRow({ pixKey: 'user@dominio.com' }),
    ]);
    const sheet = getSheet('Pagamentos PIX');
    expect(cellVal(sheet, 'G7')).toBe('OK');
    expect(cellVal(sheet, 'G8')).toBe('VERIFICAR');
    expect(cellVal(sheet, 'G9')).toBe('OK');
  });

  it('43. decimais preservados (sem floor)', async () => {
    await exportC6PaymentSheet([makeRow({ amount: 1234.5678 })]);
    expect(getSheet('Pagamentos PIX')['D7'].v).toBe(1234.5678);
  });

  it('44. periodStart sem periodEnd → N/A', async () => {
    await exportC6PaymentSheet([makeRow()], '2026-05-01', undefined);
    expect(cellVal(getSheet('Resumo'), 'B6')).toBe('N/A');
  });

  it('45. merged cells presentes em Pagamentos PIX (título + cabeçalho)', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(sheet['!merges']).toBeDefined();
    expect(sheet['!merges'].length).toBeGreaterThanOrEqual(4); // título + datas + aviso
  });

  it('46. autofilter aplicado no range correto', async () => {
    await exportC6PaymentSheet([makeRow(), makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(sheet['!autofilter']).toBeDefined();
    expect(sheet['!autofilter'].ref).toMatch(/^A6:G\d+$/);
  });

  it('47. freeze pane em y=6 (header congelado)', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(sheet['!freeze']).toEqual({ xSplit: 0, ySplit: 6 });
  });

  it('48. cell styles aplicados (header A1 tem .s)', async () => {
    await exportC6PaymentSheet([makeRow()]);
    const sheet = getSheet('Pagamentos PIX');
    expect(sheet['A1'].s).toBeDefined();
    expect(sheet['A1'].s.font).toBeDefined();
  });
});
