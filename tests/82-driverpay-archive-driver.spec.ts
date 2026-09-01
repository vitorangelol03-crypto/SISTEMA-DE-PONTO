import { test, expect, Page, Locator } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — arquivar/reativar driver (01/09/2026, pedido do Victor: "faça uma
 * atualização rápida permitindo excluir drivers").
 *
 *   achado antes de programar: o backend já tinha TUDO pronto (`setDriverActive`,
 *   `driverpay.deleteDriver` já checado dentro dela, `driverpay_create_period`
 *   já filtra `active=true` no preload de quinzena nova) — só faltava o botão na
 *   tela. Decisão confirmada com o Victor: soft-delete (arquivar), não apaga
 *   nada — "se em alguma quinzena pra trás tem pagamento dele, fica registrado
 *   ainda" — o grid monta as linhas a partir de driverpay_payments, não da
 *   lista de drivers, então histórico nunca some.
 *
 * Prova, no navegador real: cria um driver de teste (entra sozinho na quinzena
 * aberta), arquiva pelo botão novo — confirma que o banco marca active=false E
 * que o modal mostra "Arquivado" — depois reativa e confirma active=true de
 * novo. Cleanup manual no fim (não usa quinzena descartável própria).
 */

const MODAL = 'div.fixed.inset-0';
const modal = (page: Page): Locator => page.locator(MODAL).last();

const RUN = Date.now().toString(36);
const DRIVER = `${TEST_EMPLOYEE_NAME_PREFIX}Arquivar ${RUN}`;

test.describe('Pagamentos Driver — arquivar/reativar driver', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Pagamentos Driver');
  });

  test('arquiva pelo botão novo, banco confirma active=false, e reativa de volta', async ({ page }) => {
    test.setTimeout(60_000);
    const s = getClient();

    try {
      // ── cria o driver de teste (entra sozinho na quinzena aberta) ──
      await page.getByRole('button', { name: /Novo driver/ }).click();
      await modal(page).getByPlaceholder('Nome completo do driver').fill(DRIVER);
      await modal(page).getByPlaceholder('Ex.: Caratinga').fill('PW Rota Arquivar');
      await modal(page).getByRole('button', { name: 'Cadastrar driver' }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

      const row = page.locator('tbody tr').filter({ hasText: DRIVER }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      // ── abre "Configurar valores / PIX" (editar driver) ──
      await row.getByTitle('Configurar valores / PIX').click();
      await expect(modal(page).getByText('Editar driver')).toBeVisible({ timeout: 10_000 });

      // ── arquiva ──
      await modal(page).getByRole('button', { name: /^Arquivar$/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

      const { data: driverRow1 } = await s.from('driverpay_drivers').select('id, active').eq('name', DRIVER).single();
      expect(driverRow1?.active).toBe(false);

      // ── reabre: mostra "Arquivado" e o botão vira "Reativar" (onArchived já
      // disparou o refresh sozinho — não precisa de botão "Atualizar" aqui) ──
      await row.getByTitle('Configurar valores / PIX').click();
      await expect(modal(page).getByText(/Arquivado/i)).toBeVisible({ timeout: 10_000 });
      await modal(page).getByRole('button', { name: /^Reativar$/ }).click();
      await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 10_000 });

      const { data: driverRow2 } = await s.from('driverpay_drivers').select('id, active').eq('name', DRIVER).single();
      expect(driverRow2?.active).toBe(true);
    } finally {
      const { data: drv } = await s.from('driverpay_drivers').select('id').eq('name', DRIVER).maybeSingle();
      if (drv?.id) {
        await s.from('driverpay_payments').delete().eq('driver_id', drv.id);
        await s.from('driverpay_platform_rates').delete().eq('driver_id', drv.id);
        await s.from('driverpay_drivers').delete().eq('id', drv.id);
      }
    }
  });
});
