/**
 * Testes unit para src/utils/driverPayCalc.ts — a fórmula pura da aba
 * "Pagamentos Driver".
 *
 * Framework: vitest. Roda com: npx vitest run driverPayTotals
 *
 * A fórmula testada é o espelho fiel da VIEW `driverpay_payment_computed`
 * (migration 20260703170000_create_driverpay_module.sql L235-244) e da RPC
 * `driverpay_conclude_period` (L275-285):
 *
 *   totalPackages  = round(Σ packages * rate, 2)
 *   totalDiscounts = round(Σ descontos, 2)
 *   totalVales     = round(Σ vales, 2)
 *   totalNet       = totalPackages - totalDiscounts - totalVales   (pode ser < 0)
 *
 * Cobertura:
 *  - valor/pacote padrão 2.00 (1 rota, 1 plataforma)
 *  - valores variados (2.15 / 2.20 / 2.70) em múltiplas plataformas
 *  - multi-rota somando (caso Gessiley do mockup)
 *  - remoção de poeira de ponto flutuante no arredondamento (234*2.15=503.10)
 *  - descontos e vales MÚLTIPLOS
 *  - linha integrada (pacotes + desconto + vale) permanecendo positiva
 *  - total_net NEGATIVO por vale > pacotes
 *  - total_net NEGATIVO por desconto + vale > pacotes
 *  - arrays vazios e pacotes zero
 *  - reprodução do subtotal do grupo "Equipe Mutum" do mockup (R$ 2.982,20)
 */

import { describe, it, expect } from 'vitest';
import {
  computeDriverPayTotals,
  type DriverPayPackageInput,
} from '../../src/utils/driverPayCalc';

// Helper de fixture — cria uma linha de pacotes com menos boilerplate.
function pkg(
  platform: string,
  route: string,
  packages: number,
  rate: number,
): DriverPayPackageInput {
  return { platform, route, packages, rate };
}

describe('computeDriverPayTotals', () => {
  it('1. valor/pacote padrão 2.00, 1 rota, sem desconto/vale', () => {
    // Caso "Caio" do mockup antes do desconto: 187 pacotes eMile @ 2.00.
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Santa Rita de Minas', 187, 2.0)],
      [],
      [],
    );
    expect(totals.totalPackages).toBe(374);
    expect(totals.totalDiscounts).toBe(0);
    expect(totals.totalVales).toBe(0);
    expect(totals.totalNet).toBe(374);
  });

  it('2. padrão 2.00 com 1 desconto (Caio: 187*2 - 50 = 324)', () => {
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Santa Rita de Minas', 187, 2.0)],
      [50],
      [],
    );
    expect(totals.totalPackages).toBe(374);
    expect(totals.totalDiscounts).toBe(50);
    expect(totals.totalVales).toBe(0);
    expect(totals.totalNet).toBe(324);
  });

  it('3. valores variados (2.15 / 2.20 / 2.70) em 3 plataformas somam', () => {
    // 100*2.15 + 50*2.20 + 10*2.70 = 215 + 110 + 27 = 352
    const totals = computeDriverPayTotals(
      [
        pkg('eMile', 'Caratinga', 100, 2.15),
        pkg('ANJUN', 'Caratinga', 50, 2.2),
        pkg('Shopee', 'Mutum', 10, 2.7),
      ],
      [],
      [],
    );
    expect(totals.totalPackages).toBe(352);
    expect(totals.totalNet).toBe(352);
  });

  it('4. multi-rota somando (Gessiley: 3 rotas eMile @ 2.20)', () => {
    // (35 + 282 + 250) * 2.20 = 567 * 2.20 = 1247.40
    const totals = computeDriverPayTotals(
      [
        pkg('eMile', 'Caratinga', 35, 2.2),
        pkg('eMile', 'Entre Folhas', 282, 2.2),
        pkg('eMile', 'Vargem Alegre', 250, 2.2),
      ],
      [],
      [],
    );
    expect(totals.totalPackages).toBe(1247.4);
    expect(totals.totalNet).toBe(1247.4);
  });

  it('5. arredondamento remove poeira de float: 234 * 2.15 = 503.10', () => {
    // 2.15 em IEEE-754 é 2.14999999…; sem round o produto vazaria .0999999.
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Mutum', 234, 2.15)],
      [],
      [],
    );
    expect(totals.totalPackages).toBe(503.1);
    expect(totals.totalNet).toBe(503.1);
  });

  it('6. taxa 2.70 arredonda certo: 356 * 2.70 = 961.20', () => {
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Mutum', 356, 2.7)],
      [],
      [],
    );
    expect(totals.totalPackages).toBe(961.2);
    expect(totals.totalNet).toBe(961.2);
  });

  it('7. descontos e vales MÚLTIPLOS somam antes de subtrair', () => {
    // pacotes 200*2.00 = 400; descontos 30 + 20.50 = 50.50; vales 10 + 5 = 15
    // net = 400 - 50.50 - 15 = 334.50
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Caratinga', 200, 2.0)],
      [30, 20.5],
      [10, 5],
    );
    expect(totals.totalPackages).toBe(400);
    expect(totals.totalDiscounts).toBe(50.5);
    expect(totals.totalVales).toBe(15);
    expect(totals.totalNet).toBe(334.5);
  });

  it('8. linha integrada (2 plataformas + desconto + vale) positiva', () => {
    // 150*2.15 + 40*2.00 = 322.50 + 80 = 402.50; desc 12.50; vale 50 → 340.00
    const totals = computeDriverPayTotals(
      [
        pkg('eMile', 'Caratinga', 150, 2.15),
        pkg('ANJUN', 'Caratinga', 40, 2.0),
      ],
      [12.5],
      [50],
    );
    expect(totals.totalPackages).toBe(402.5);
    expect(totals.totalDiscounts).toBe(12.5);
    expect(totals.totalVales).toBe(50);
    expect(totals.totalNet).toBe(340);
  });

  it('9. total_net NEGATIVO: vale > pacotes (200 - 250 = -50)', () => {
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Caratinga', 100, 2.0)],
      [],
      [250],
    );
    expect(totals.totalPackages).toBe(200);
    expect(totals.totalVales).toBe(250);
    expect(totals.totalNet).toBe(-50);
    expect(totals.totalNet).toBeLessThan(0);
  });

  it('10. total_net NEGATIVO: desconto + vale > pacotes (100 - 80 - 40 = -20)', () => {
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Caratinga', 50, 2.0)],
      [80],
      [40],
    );
    expect(totals.totalPackages).toBe(100);
    expect(totals.totalDiscounts).toBe(80);
    expect(totals.totalVales).toBe(40);
    expect(totals.totalNet).toBe(-20);
    expect(totals.totalNet).toBeLessThan(0);
  });

  it('11. arrays vazios → tudo zero', () => {
    const totals = computeDriverPayTotals([], [], []);
    expect(totals).toEqual({
      totalPackages: 0,
      totalDiscounts: 0,
      totalVales: 0,
      totalNet: 0,
    });
  });

  it('12. pacotes zero → total zero (linha existe mas sem entregas)', () => {
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Caratinga', 0, 2.0)],
      [],
      [],
    );
    expect(totals.totalPackages).toBe(0);
    expect(totals.totalNet).toBe(0);
  });

  it('13. desconto negativa o líquido mesmo sem vale (300 - 500 = -200)', () => {
    const totals = computeDriverPayTotals(
      [pkg('eMile', 'Caratinga', 150, 2.0)],
      [500],
      [],
    );
    expect(totals.totalPackages).toBe(300);
    expect(totals.totalDiscounts).toBe(500);
    expect(totals.totalNet).toBe(-200);
  });

  it('14. reproduz o subtotal do grupo "Equipe Mutum" do mockup (R$ 2.982,20)', () => {
    // Cada driver é 1 pagamento; o subtotal do grupo é a soma dos totalNet.
    const mutum: Array<{ packages: number; rate: number }> = [
      { packages: 234, rate: 2.15 }, // Vanildo    → 503.10
      { packages: 356, rate: 2.7 },  // Bruno      → 961.20
      { packages: 146, rate: 2.15 }, // Augusto    → 313.90
      { packages: 236, rate: 2.15 }, // João Victor→ 507.40
      { packages: 142, rate: 2.15 }, // Robson     → 305.30
      { packages: 182, rate: 2.15 }, // Vitor      → 391.30
    ];
    const nets = mutum.map(
      (d) => computeDriverPayTotals([pkg('eMile', 'Mutum', d.packages, d.rate)], [], []).totalNet,
    );
    expect(nets).toEqual([503.1, 961.2, 313.9, 507.4, 305.3, 391.3]);
    const subtotal = nets.reduce((a, b) => a + b, 0);
    // Arredonda a soma para 2 casas para comparar com o valor exibido no espelho.
    expect(Math.round(subtotal * 100) / 100).toBe(2982.2);
  });
});
