import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MASTER_2626, loginAs, goToTab, switchCompany } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — "guarda os rejeitados também... editar os vinculados também... pra não
 * precisar ficar mexendo toda vez que for upar a planilha" (18/08/2026, pedido
 * do Victor, no meio da sessão da LOGGI).
 *
 * Prova o ciclo completo com clique real: marcar "Ignorar" numa importação faz
 * o nome ficar salvo (driverpay_driver_ignored); reimportar a MESMA planilha já
 * vem com "Ignorar" pré-selecionado (não pede a decisão de novo); desfazer na
 * tela "Vínculos de importação" faz o nome voltar a pedir decisão.
 *
 * 🔒 Segurança: driver/período com prefixo "PW Test ", nunca criados de fato
 * (o item fica sempre "ignorar" ou é limpo no finally) — nenhum pacote real é
 * lançado, nenhum driver real é tocado.
 */

const RUN = Date.now().toString(36);
const PREF = TEST_EMPLOYEE_NAME_PREFIX;
const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const NOME_IGNORAR = `${PREF}IgnorarSempre ${RUN}`;
const LABEL_PERIODO = `${PREF}ImportIgnorados ${RUN}`;

function writeImileFixture(driverName: string): string {
  const aoa = [
    ['DA', 'Waybill No.', 'Recipient City'],
    [driverName, `${RUN}-W1`, 'Caratinga'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Delivered');
  const dest = path.join(os.tmpdir(), `${RUN}-imile-ignorar.xlsx`);
  XLSX.writeFile(wb, dest);
  return dest;
}

test.describe('Importação — "ignorar" persiste entre importações', () => {
  test('ignorar salva, reimportar não pede de novo, desfazer volta a pedir', async ({ page }) => {
    test.setTimeout(180_000);
    const db = getClient();
    const criados = { periodo: '' };
    const fixturePath = writeImileFixture(NOME_IGNORAR);

    try {
      const { data: per } = await db.from('driverpay_periods').insert({
        company_id: CARATINGA, label: LABEL_PERIODO,
        start_date: '2026-07-01', end_date: '2026-07-15', status: 'aberto', created_by: '2626',
      }).select('id').single();
      criados.periodo = per!.id;

      await page.goto('/', { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
      await loginAs(page, MASTER_2626);
      const trigger = page.locator('button[aria-haspopup="listbox"]').first();
      await expect(trigger).toBeVisible({ timeout: 20_000 });
      if (!/Caratinga/i.test((await trigger.innerText()) ?? '')) await switchCompany(page, 'Caratinga');
      await goToTab(page, 'Pagamentos Driver');

      // ── 1ª importação: marca "Ignorar" e confirma ──────────────────────────
      await page.getByRole('button', { name: /^Importar planilha$/ }).click();
      let modal = page.locator('div.fixed.inset-0').last();
      await expect(modal.getByText('Importar planilha da plataforma')).toBeVisible({ timeout: 10_000 });
      await modal.locator('input[type="file"]').setInputFiles(fixturePath);
      const linha1 = modal.getByTestId('import-review-row').filter({ hasText: NOME_IGNORAR });
      await expect(linha1).toBeVisible({ timeout: 20_000 });
      await linha1.getByTestId('import-resolution-picker').click();
      await page.getByRole('button', { name: /^Ignorar$/ }).click();

      await modal.locator('select').first().selectOption(criados.periodo);
      await modal.getByRole('button', { name: /^Importar \d+ pacotes$/ }).click();
      await expect(page.getByText(/Importado:/)).toBeVisible({ timeout: 20_000 });

      // Banco: o nome ficou salvo como ignorado.
      const { data: ignoradoRow } = await db
        .from('driverpay_driver_ignored')
        .select('id, alias_raw')
        .eq('company_id', CARATINGA)
        .eq('alias_raw', NOME_IGNORAR)
        .maybeSingle();
      expect(ignoradoRow, 'o nome tem que ter sido salvo como ignorado').not.toBeNull();

      // ── 2ª importação, MESMA planilha: já vem com "Ignorar" pré-selecionado ──
      await page.getByRole('button', { name: /^Importar planilha$/ }).click();
      modal = page.locator('div.fixed.inset-0').last();
      await expect(modal.getByText('Importar planilha da plataforma')).toBeVisible({ timeout: 10_000 });
      await modal.locator('input[type="file"]').setInputFiles(fixturePath);
      let linha = modal.getByTestId('import-review-row').filter({ hasText: NOME_IGNORAR });
      await expect(linha).toBeVisible({ timeout: 20_000 });
      await expect(linha.getByText(/já ignorado antes/)).toBeVisible({ timeout: 10_000 });
      // O botão do resolver já mostra "🚫 Ignorar" sem precisar clicar em nada.
      await expect(linha.getByTestId('import-resolution-picker')).toContainText('Ignorar');
      await modal.getByRole('button', { name: /^Cancelar$/ }).click();

      // ── Desfaz o "ignorar" na tela de gerenciamento ─────────────────────────
      await page.getByRole('button', { name: /Vínculos de importação/ }).click();
      const linksModal = page.locator('div.fixed.inset-0').last();
      await expect(linksModal.getByText('Vínculos de importação')).toBeVisible({ timeout: 10_000 });
      const searchBox = linksModal.getByPlaceholder(/Buscar por nome/);
      await searchBox.fill(NOME_IGNORAR);
      const ignoredRow = linksModal.getByTestId('ignored-row').filter({ hasText: NOME_IGNORAR });
      await expect(ignoredRow).toBeVisible({ timeout: 10_000 });
      await ignoredRow.getByTestId('ignored-remover').click();
      await expect(page.getByText(/volta a aparecer como pendente/)).toBeVisible({ timeout: 10_000 });
      await expect(ignoredRow).toBeHidden({ timeout: 10_000 });
      await linksModal.getByRole('button', { name: /^Fechar$/ }).click();

      const { data: apagado } = await db
        .from('driverpay_driver_ignored')
        .select('id')
        .eq('company_id', CARATINGA)
        .eq('alias_raw', NOME_IGNORAR)
        .maybeSingle();
      expect(apagado, 'o ignorado tem que ter sido removido do banco').toBeNull();

      // ── 3ª importação: sem o "ignorado" salvo, volta a pedir decisão de verdade ──
      await page.getByRole('button', { name: /^Importar planilha$/ }).click();
      modal = page.locator('div.fixed.inset-0').last();
      await expect(modal.getByText('Importar planilha da plataforma')).toBeVisible({ timeout: 10_000 });
      await modal.locator('input[type="file"]').setInputFiles(fixturePath);
      linha = modal.getByTestId('import-review-row').filter({ hasText: NOME_IGNORAR });
      await expect(linha).toBeVisible({ timeout: 20_000 });
      await expect(linha.getByText(/já ignorado antes/)).toBeHidden();
      // Sem vínculo nem ignorado salvo, o default volta a ser "Criar como novo driver".
      await expect(linha.getByTestId('import-resolution-picker')).toContainText('Criar:');
      await modal.getByRole('button', { name: /^Cancelar$/ }).click();
    } finally {
      fs.unlink(fixturePath, () => {});
      await db.from('driverpay_driver_ignored').delete().eq('company_id', CARATINGA).eq('alias_raw', NOME_IGNORAR);
      await db.from('driverpay_driver_aliases').delete().eq('company_id', CARATINGA).eq('alias_raw', NOME_IGNORAR);
      const { data: pays } = await db.from('driverpay_payments')
        .select('id, driver_id')
        .eq('company_id', CARATINGA)
        .eq('driver_name_snapshot', NOME_IGNORAR);
      const driverIds = [...new Set((pays ?? []).map((p) => p.driver_id))];
      if (pays && pays.length > 0) {
        await db.from('driverpay_payment_packages').delete().in('payment_id', pays.map((p) => p.id));
        await db.from('driverpay_payments').delete().in('id', pays.map((p) => p.id));
      }
      if (driverIds.length > 0) await db.from('driverpay_drivers').delete().in('id', driverIds);
      if (criados.periodo) await db.from('driverpay_periods').delete().eq('id', criados.periodo);
    }
  });
});
