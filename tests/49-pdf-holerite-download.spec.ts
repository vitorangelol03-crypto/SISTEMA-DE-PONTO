import { test, expect } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';

/**
 * Sub-fase 17.2.2 — Spec PDF holerite download
 *
 * Cobre o fluxo end-to-end do botão "Holerite PDF" em FinancialTab:
 *  1. Login admin → tab Financeiro
 *  2. Localizar primeira row da tabela
 *  3. Clicar "Holerite PDF" → captura download via Playwright
 *  4. Validar suggestedFilename + tamanho plausível (>1KB)
 */

test.describe('PDF Holerite — sub-fase 17.2.2', () => {
  test('1. Clica "Holerite PDF" e baixa arquivo .pdf válido', async ({ page }) => {
    await loginAs(page, ADMIN);
    await goToTab(page, 'Financeiro');

    // Aguarda tabela financeira carregar (qualquer row visível ou estado vazio)
    await page.waitForLoadState('networkidle');

    // Primeiro botão "Holerite PDF" da tabela (em qualquer row)
    const holeriteBtn = page.getByRole('button', { name: /Holerite PDF/i }).first();
    await expect(holeriteBtn).toBeVisible({ timeout: 15_000 });

    // Captura download dispatched pelo doc.save(filename)
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await holeriteBtn.click();
    const dl = await downloadPromise;

    // Filename: holerite_<nome>_<start>_<end>.pdf
    const filename = dl.suggestedFilename();
    expect(filename).toMatch(/^holerite_.+\.pdf$/);
    expect(filename).toContain('holerite_');
    expect(filename.endsWith('.pdf')).toBe(true);

    // Toast confirma sucesso (handler em FinancialTab)
    await expect(page.getByText(/Holerite PDF gerado/i).first()).toBeVisible({ timeout: 5_000 });

    // Validação de tamanho: jsPDF gera ~5-50KB pra holerite single-page
    const path = await dl.path();
    if (path) {
      const fs = await import('node:fs');
      const stat = fs.statSync(path);
      expect(stat.size).toBeGreaterThan(1024); // > 1KB (header PDF mínimo)
      expect(stat.size).toBeLessThan(2_000_000); // < 2MB (single-page sanity)
    }
  });
});
