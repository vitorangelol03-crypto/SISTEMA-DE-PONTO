/**
 * Cálculo PURO dos totais de um pagamento da aba "Pagamentos Driver" (iMile CTGA).
 *
 * ── Fonte de verdade em produção ─────────────────────────────────────────────
 * Em produção a fórmula NÃO vive aqui: ela vive no banco, na VIEW
 * `driverpay_payment_computed` (migration 20260703170000_create_driverpay_module.sql
 * L235-244) e é congelada, com a MESMA expressão, pela RPC
 * `driverpay_conclude_period` (L275-285). Em SQL, para cada pagamento:
 *
 *   calc_packages  = round(SUM(packages * rate_snapshot), 2)   -- por (plataforma, rota)
 *   calc_discounts = round(SUM(amount), 2)                     -- driverpay_discounts
 *   calc_vales     = round(SUM(amount), 2)                     -- driverpay_vales
 *   calc_net       = calc_packages - calc_discounts - calc_vales
 *
 * `recomputePaymentTotals` (src/services/driverPay.ts L611) lê essa view e grava
 * os totais na `driverpay_payments`. Este util espelha EXATAMENTE essa regra em
 * TypeScript para que ela possa ser testada por unidade, sem bater no banco.
 *
 * ── Regras da fórmula ────────────────────────────────────────────────────────
 * • Multi-rota / multi-plataforma: cada linha (plataforma, rota) entra como um
 *   item de `packages`; todas somam no `totalPackages`.
 * • `totalNet` PODE ser negativo (vale e/ou desconto maiores que os pacotes) —
 *   a coluna `total_net` é numeric(12,2) SEM CHECK de não-negatividade
 *   (migration L93). Já `total_packages_amount`, `total_discounts` e
 *   `total_vales` têm CHECK >= 0 no banco (L90-92), refletido aqui somando
 *   apenas parcelas não-negativas.
 * • Arredondamento: round-half-away-from-zero, idêntico ao `round()` de numeric
 *   do Postgres, aplicado sobre a SOMA (não por linha) — igual ao SQL. Como
 *   `packages` é inteiro e as taxas/valores são numeric(_,2), cada produto e
 *   cada parcela já é exato em 2 casas; o arredondamento só remove poeira de
 *   ponto flutuante do JavaScript (ex.: 234 * 2.15 = 503.0999999… → 503.10).
 */

/** Uma linha de pacotes: pacotes de UMA (plataforma, rota) a um valor/pacote congelado. */
export interface DriverPayPackageInput {
  /** Nome da plataforma (eMile, ANJUN, Shopee…). Informativo — não altera o cálculo. */
  platform: string;
  /** Rota/cidade. Multi-rota: cada rota é uma linha própria que soma no total. */
  route: string;
  /** Quantidade de pacotes entregues nessa (plataforma, rota). Inteiro >= 0. */
  packages: number;
  /** Valor por pacote congelado (rate_snapshot). >= 0. */
  rate: number;
}

/** Totais de um pagamento, na mesma forma que a view `driverpay_payment_computed`. */
export interface DriverPayTotals {
  /** round(Σ packages * rate, 2). Sempre >= 0. */
  totalPackages: number;
  /** round(Σ descontos, 2). Sempre >= 0. */
  totalDiscounts: number;
  /** round(Σ vales, 2). Sempre >= 0. */
  totalVales: number;
  /** totalPackages - totalDiscounts - totalVales. PODE ser negativo. */
  totalNet: number;
}

/**
 * round(n, 2) com desempate "meio para longe do zero" (round half away from
 * zero), igual ao `round(numeric, int)` do Postgres. `Math.round` do JS
 * arredonda meio para +∞ (difere no negativo), por isso o tratamento de sinal.
 */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/** Soma segura de uma lista de números (não-números viram 0). */
function sumNumbers(values: readonly number[]): number {
  return values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

/**
 * Calcula os totais de um pagamento driver a partir de suas partes.
 * Pura, sem efeitos colaterais — espelho fiel da view SQL.
 */
export function computeDriverPayTotals(
  packages: readonly DriverPayPackageInput[],
  discounts: readonly number[],
  vales: readonly number[],
): DriverPayTotals {
  const packagesRaw = packages.reduce<number>(
    (acc, p) => acc + (Number(p.packages) || 0) * (Number(p.rate) || 0),
    0,
  );

  const totalPackages = round2(packagesRaw);
  const totalDiscounts = round2(sumNumbers(discounts));
  const totalVales = round2(sumNumbers(vales));
  // Diferença de três valores já arredondados a 2 casas; round2 remove apenas
  // poeira de ponto flutuante (ex.: -50.00000000001 → -50).
  const totalNet = round2(totalPackages - totalDiscounts - totalVales);

  return { totalPackages, totalDiscounts, totalVales, totalNet };
}
