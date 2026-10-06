/**
 * O PAPEL de verdade (PDF gerado pelo jsPDF, sem mock) — as faixas com o desconto no lugar certo.
 *
 * ACHADO REAL (06/10/2026, ANDRE — Ubaporanga, 1ª quinzena de setembro): o espelho do grupo dele
 * (só eMile, R$ 1.244,00, com R$ 225,50 de descontos da iMile) imprimiu "TOTAL A RECEBER
 * −R$ 225,50" e a faixa amarela "TOTAL EMILE R$ 1.244,00" cheia; ele emitiu a nota de R$ 1.244,00.
 *
 * O jsPDF grava o texto sem compressão, então dá pra ler cada pedaço impresso (`(texto) Tj`) direto
 * dos bytes — é o que o entregador vê no PDF, não uma reconstrução da conta.
 *
 * Roda com: npx vitest run driverMirrorPdfFaixas
 */
import { describe, it, expect } from 'vitest';
import {
  buildDriverMirrorData,
  buildGroupMirrorData,
  type DriverRowData,
  type RouteLine,
} from '../../src/components/driverpay/driverPayShared';
import { generateDriverGroupMirrorPdf, generateDriverMirrorPdf } from '../../src/utils/driverMirrorPdf';
import type { Company } from '../../src/services/database';
import type { DriverDiscount, DriverPlatform, DriverPaymentPeriod } from '../../src/services/driverPay';

const company = { id: 'c1', name: 'CD LOGISTICA', cnpj: null, city: 'Caratinga' } as unknown as Company;
const period = {
  id: 'per1', company_id: 'c1', label: '1 quinzena de setembro', start_date: '2026-09-01', end_date: '2026-09-15',
  status: 'aberto', concluded_at: null, concluded_by: null, created_by: null, created_at: '',
} as DriverPaymentPeriod;

function platform(name: string, opts: Partial<DriverPlatform> = {}): DriverPlatform {
  return {
    id: `p-${name}`, company_id: 'c1', name, default_rate: 2, sort_order: 0, active: true,
    color: null, highlight_mirror: false, mirror_notice: null, mirror_separate_value: false,
    created_by: null, created_at: '',
    ...opts,
  } as DriverPlatform;
}
const EMILE = platform('eMile', {
  highlight_mirror: true, mirror_separate_value: true,
  mirror_notice: 'A NOTA FISCAL DEVE SER GERADA NO CNPJ 53.824.315/0001-10',
});
const LOGGI = platform('LOGGI');
const SHOPEE = platform('SHOPEE');

function desconto(amount: number, code: string, status: 'PNR' | 'LOST', observation: string): DriverDiscount {
  return {
    id: `d-${code}`, company_id: 'c1', payment_id: 'pay', amount, package_code: code, observation,
    package_status: status, proof1_path: null, proof2_path: null, proof_video_path: null,
    created_by: '2626', created_at: '',
  };
}

function row(name: string, packages: Record<string, number>, rates: Record<string, number>, discounts: DriverDiscount[]): DriverRowData {
  const rota: RouteLine = { route: 'Ubaporanga', packages, rates, packageIds: {} } as RouteLine;
  return {
    paymentId: `pay-${name}`, driverId: `drv-${name}`, name, route: null, groupName: name,
    routes: [rota], ratesByPlatform: {}, discounts, vales: [], pixKey: null, cpf: null, phone: null,
    active: true, notaFiscal: false, espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

const DESCONTOS_ANDRE = [
  desconto(113.9, '3320009829591', 'LOST', 'iMile 1ªQ set — LOST (Goods Lost): produto R$ 13,90'),
  desconto(111.6, '3320094790122', 'PNR', 'iMile 1ªQ set — PNR (Fake Delivery): produto R$ 11,60 + multa R$ 100,00'),
];

/** Os pedaços de texto que o PDF imprime, na ordem (cada `(...) Tj` do jsPDF). */
async function textosDoPdf(blob: Blob): Promise<string[]> {
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
  const bruto = new TextDecoder('windows-1252').decode(buf);
  // O Intl põe espaço que não quebra (U+00A0) depois do "R$" — vira espaço comum pra comparar.
  return (bruto.match(/\((?:[^()\\]|\\.)*\)\s*Tj/g) ?? []).map((t) =>
    t.replace(/\)\s*Tj$/, '').slice(1).replace(/\\([()\\])/g, '$1').replace(/\u00a0/g, ' '),
  );
}

/** O texto logo depois de um rótulo (o valor que o PDF imprime ao lado dele). */
function depoisDe(textos: string[], rotulo: string): string | undefined {
  const i = textos.indexOf(rotulo);
  return i >= 0 ? textos[i + 1] : undefined;
}

describe('PDF do espelho — o desconto no lugar certo (caso ANDRE, 06/10/2026)', () => {
  it('ANDRE só eMile (grupo): TOTAL A RECEBER R$ 1.018,50, sem "pago separado" e com os descontos listados', async () => {
    const andre = row('Andre Luis - UBAPORANGA', { eMile: 622 }, { eMile: 2 }, DESCONTOS_ANDRE);
    const data = buildGroupMirrorData('Andre Luis - UBAPORANGA', [andre], [EMILE], company, period);
    const t = await textosDoPdf(await generateDriverGroupMirrorPdf(data));

    expect(depoisDe(t, 'TOTAL A RECEBER — ANDRE LUIS - UBAPORANGA')).toBe('R$ 1.018,50');
    // A página individual dele (recibo) também.
    expect(depoisDe(t, 'TOTAL A RECEBER')).toBe('R$ 1.018,50');
    // O que saiu errado em 03/10 não pode mais aparecer.
    expect(t.some((x) => x.includes('225,50') && x.includes('-R$'))).toBe(false);
    expect(t.some((x) => /PAGO SEPARADO/.test(x))).toBe(false);
    // O desconto continua APARECENDO (pedido do Victor): cada pacote, com o valor.
    expect(t.filter((x) => x === '- R$ 113,90').length).toBeGreaterThan(0);
    expect(t.filter((x) => x === '- R$ 111,60').length).toBeGreaterThan(0);
    expect(t).toContain('3320009829591');
    // O aviso do CNPJ da eMile segue no papel.
    expect(t).toContain('A NOTA FISCAL DEVE SER GERADA NO CNPJ 53.824.315/0001-10');
  });

  it('ANDRE com os 77 da LOGGI: verde R$ 154,00, amarela R$ 1.018,50 com a conta (nunca −R$ 71,50)', async () => {
    const andre = row('Andre Luis - UBAPORANGA', { eMile: 622, LOGGI: 77 }, { eMile: 2, LOGGI: 2 }, DESCONTOS_ANDRE);
    const data = buildGroupMirrorData('Andre Luis - UBAPORANGA', [andre], [EMILE, LOGGI], company, period);
    const t = await textosDoPdf(await generateDriverGroupMirrorPdf(data));

    expect(depoisDe(t, 'TOTAL A RECEBER — ANDRE LUIS - UBAPORANGA')).toBe('R$ 154,00');
    expect(depoisDe(t, 'TOTAL EMILE DO GRUPO (622 pacotes)')).toBe('R$ 1.018,50');
    expect(t).toContain('R$ 1.244,00 em pacotes - R$ 225,50 de descontos e vales (listados acima)');
    expect(t.some((x) => x.includes('71,50'))).toBe(false);
    // Recibo individual: resumo dizendo de onde saiu o desconto, e as duas faixas.
    expect(depoisDe(t, 'Total de pacotes (sem EMILE)')).toBe('+ R$ 154,00');
    expect(depoisDe(t, 'Abatido do total EMILE (faixa amarela abaixo)')).toBe('R$ 225,50');
    expect(depoisDe(t, 'TOTAL A RECEBER')).toBe('R$ 154,00');
    expect(depoisDe(t, 'TOTAL EMILE (622 pacotes)')).toBe('R$ 1.018,50');
  });

  it('quem já estava certo (Shopee maior): o papel continua igual — amarela no bruto, sem linha nova', async () => {
    const r = row('ROGERIO', { eMile: 408, SHOPEE: 3245 }, { eMile: 2.2, SHOPEE: 2.2 }, [
      desconto(205.9, 'X1', 'PNR', 'iMile 1ªQ set — PNR'),
    ]);
    const data = buildDriverMirrorData(r, [EMILE, SHOPEE], company, period);
    const t = await textosDoPdf(await generateDriverMirrorPdf(data));

    expect(depoisDe(t, 'TOTAL A RECEBER')).toBe('R$ 6.933,10'); // 8.036,60 − 205,90 − 897,60
    expect(depoisDe(t, 'TOTAL EMILE (408 pacotes)')).toBe('R$ 897,60');
    expect(t.some((x) => x.includes('em pacotes -'))).toBe(false);
    expect(depoisDe(t, 'Descontos')).toBe('- R$ 205,90'); // resumo de sempre
  });
});
