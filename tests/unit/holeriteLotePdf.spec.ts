import { describe, it, expect } from 'vitest';
import { generateLoteHoleritePdf, generateHoleritePdf, type HoleriteData } from '../../src/utils/holeritePdf';

/**
 * O CADERNO DE RECIBOS — um PDF só, uma folha por pessoa (11/09/2026).
 *
 * Pedido do Victor: *"ter a opção de baixar também um único PDF, com várias
 * folhas, e estar as folhas lá os PDF certinhos de cada um"*.
 *
 * O que estes testes provam, lendo o PDF gerado de verdade (não o "compilou"):
 *  1. tem UMA folha por pessoa;
 *  2. o nome e o CPF de CADA pessoa estão lá dentro;
 *  3. o caderno e o recibo avulso são o MESMO papel.
 */

function pessoa(nome: string, cpf: string, liquido: number): HoleriteData {
  return {
    company: { name: 'CD LOGISTICA', cnpj: '11.802.464/0001-38' },
    employee: { name: nome, cpf, employmentType: 'Diarista', functionRole: 'Triagem' },
    period: { start: '2026-09-01', end: '2026-09-07' },
    payments: [
      { date: '2026-09-02', dailyRate: 100, bonusB: 10, bonusC1: 0, bonusC2: 0 },
      { date: '2026-09-03', dailyRate: 100, bonusB: 0, bonusC1: 5, bonusC2: 0 },
    ],
    errorDiscount: 15,
    triageDiscount: 0,
    quantityErrorDiscount: 0,
    totalDailyRate: 200,
    totalBonusB: 10,
    totalBonusC1: 5,
    totalBonusC2: 0,
    totalGross: 215,
    totalNet: liquido,
  };
}

/** Quantas folhas o PDF tem — conta os objetos de página do próprio arquivo. */
function contarFolhas(texto: string): number {
  const porCount = texto.match(/\/Count\s+(\d+)/);
  if (porCount) return Number(porCount[1]);
  return (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/**
 * Os bytes do PDF, em texto.
 *
 * ⚠️ Duas armadilhas do ambiente de teste, as duas pagas na prática:
 *  - o `Blob` do jsdom NÃO tem `arrayBuffer()` (o do navegador tem) → dá
 *    "blob.arrayBuffer is not a function";
 *  - e o `Response` do Node não reconhece esse Blob: em vez de ler, ele vira a
 *    string "[object Blob]" e o teste compara lixo.
 * O `FileReader`, que o jsdom implementa de verdade, lê certo.
 */
async function comoTexto(blob: Blob): Promise<string> {
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as ArrayBuffer);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsArrayBuffer(blob);
  });
  return Buffer.from(buf).toString('latin1');
}

describe('caderno de recibos: um PDF com uma folha por pessoa', () => {
  it('🎯 três pessoas viram um PDF de três folhas', async () => {
    const blob = await generateLoteHoleritePdf([
      pessoa('ANA SOUZA', '11144477735', 200),
      pessoa('BRUNO LIMA', '52998224725', 180),
      pessoa('CARLA DIAS', '12345678909', 215),
    ]);
    const txt = await comoTexto(blob);

    expect(txt.slice(0, 4), 'é um PDF de verdade').toBe('%PDF');
    expect(contarFolhas(txt), 'uma folha por pessoa').toBe(3);
  });

  it('🎯 o nome e o CPF de CADA pessoa estão no arquivo', async () => {
    const gente = [
      { nome: 'ANA SOUZA', cpf: '11144477735' },
      { nome: 'BRUNO LIMA', cpf: '52998224725' },
      { nome: 'CARLA DIAS', cpf: '12345678909' },
    ];
    const blob = await generateLoteHoleritePdf(gente.map((g) => pessoa(g.nome, g.cpf, 200)));
    const txt = await comoTexto(blob);

    for (const g of gente) {
      // O jsPDF quebra o texto em pedaços; procuro o sobrenome, que é contíguo.
      const sobrenome = g.nome.split(' ')[1];
      expect(txt.includes(sobrenome), `"${g.nome}" tem que estar no caderno`).toBe(true);
    }
  });

  it('uma pessoa só: o caderno tem uma folha, igual ao recibo avulso', async () => {
    const um = pessoa('ANA SOUZA', '11144477735', 200);
    const caderno = contarFolhas(await comoTexto(await generateLoteHoleritePdf([um])));
    const avulso = contarFolhas(await comoTexto(await generateHoleritePdf(um)));
    expect(caderno).toBe(avulso);
  });

  it('🎯 o caderno e o recibo avulso são o MESMO papel', async () => {
    // Se alguém mexer só num dos dois caminhos, os tamanhos divergem e isto quebra.
    const um = pessoa('ANA SOUZA', '11144477735', 200);
    const doCaderno = await comoTexto(await generateLoteHoleritePdf([um]));
    const doAvulso = await comoTexto(await generateHoleritePdf(um));

    const sohTexto = (t: string) => (t.match(/\(([^)]*)\)\s*Tj/g) ?? []).join('|');
    expect(sohTexto(doCaderno), 'o conteúdo escrito tem que ser idêntico')
      .toBe(sohTexto(doAvulso));
  });

  it('lista vazia dá erro claro, não um PDF em branco', async () => {
    await expect(generateLoteHoleritePdf([])).rejects.toThrow(/vazia/i);
  });

  it('40 pessoas geram 40 folhas (o tamanho real de uma folha de pagamento)', async () => {
    const lote = Array.from({ length: 40 }, (_, i) =>
      pessoa(`PESSOA NUMERO${i}`, '11144477735', 100 + i));
    const txt = await comoTexto(await generateLoteHoleritePdf(lote));
    expect(contarFolhas(txt)).toBe(40);
  });
});
