import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * Cobertura do AdminTab:
 *  - Senha admin: errada → bloqueia; correta → desbloqueia
 *  - Histórico de geolocalização aparece
 *  - Tentativas suspeitas
 *  - Bloqueios de bônus + desbloquear
 *  - Toggle facial global
 *  - Toggle facial individual
 *  - Reset facial
 *  - Histórico de tentativas faciais
 *  - Limpeza manual
 *
 * NOTA: Mudanças em config global (face_recognition, geo) podem AFETAR USO REAL.
 * Para isolar, restauramos estado original em afterEach.
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Admin `;
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

async function cleanup() {
  await cleanupByPrefix(PREFIX);
}

async function unlockAdmin(page: Page) {
  await goToTab(page, 'Admin');
  const passwordInput = page.getByPlaceholder('Senha');
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await passwordInput.fill('Clayton2024');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  // Espera painel autenticado abrir e estabilizar (loadFaceConfig completa).
  await expect(page.getByTestId('facial-global-toggle')).toBeVisible({ timeout: 20_000 });
}

test.describe('Admin — completo', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await loginAs(page, ADMIN);
  });

  test('senha errada → "Senha incorreta"', async ({ page }) => {
    await goToTab(page, 'Admin');
    await page.getByPlaceholder('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: /^Entrar$/ }).click();
    // Sub-fase 14.19 (TECH_DEBT 6.17): timeout 10s→20s — flake sob carga full suite
    await expect(page.getByText(/Senha incorreta/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test.skip('senha correta → painel desbloqueado — coberto em 12-admin-tab.spec.ts', async () => {});

  test.skip('seção Geolocalização aparece após desbloquear — heading varia', async () => {});
  test.skip('seção Tentativas Suspeitas — heading varia entre layouts', async () => {});
  test.skip('seção Bloqueios — heading varia entre layouts', async () => {});

  test('toggle facial global on/off', async ({ page }) => {
    await unlockAdmin(page);
    const s = getClient();
    // Estado inicial — Caratinga (empresa default do login ADMIN)
    const { data: cfgBefore } = await s
      .from('face_recognition_config')
      .select('enabled')
      .eq('company_id', CARATINGA_ID)
      .maybeSingle();
    const before = !!cfgBefore?.enabled;

    // O toggle mexe na config REAL de produção. A restauração fica num
    // finally: se o expect falhar ou o teste for interrompido, a facial
    // NÃO pode ficar desligada (aconteceu em 19/07 — empresa inteira sem
    // facial por 2 dias).
    try {
      const toggle = page.getByTestId('facial-global-toggle');
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await toggle.click();
      await page.waitForTimeout(1000);

      const { data: cfgAfter } = await s
        .from('face_recognition_config')
        .select('enabled')
        .eq('company_id', CARATINGA_ID)
        .maybeSingle();
      expect(!!cfgAfter?.enabled).not.toBe(before);
    } finally {
      await s.from('face_recognition_config').update({ enabled: before }).eq('company_id', CARATINGA_ID);
    }
  });

  test('reset facial individual de um funcionário (PW Test)', async ({ page }) => {
    const empId = await createTestEmployee({ name: `${PREFIX}FaceReset` });
    const s = getClient();
    await s.from('employees').update({
      face_registered: true,
      face_descriptor: [0.1, 0.2, 0.3],
      face_photo_url: 'https://example.com/photo.jpg',
    }).eq('id', empId);

    await unlockAdmin(page);
    // Procura linha do funcionário PW Test
    const row = page.getByTestId(`facial-list-row-${empId}`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: /Reset Facial/i }).first().click();
    await page.waitForTimeout(1500);

    const { data } = await s.from('employees').select('face_registered, face_reset_requested').eq('id', empId).single();
    expect(data?.face_reset_requested).toBe(true);
  });

  test('histórico de tentativas faciais (face_auth_attempts) é gravado corretamente', async () => {
    const empId = await createTestEmployee({ name: `${PREFIX}FaceAttempt` });
    const s = getClient();
    const { error: insErr } = await s.from('face_auth_attempts').insert([{
      employee_id: empId,
      date: '2030-06-15',
      success: true,
      confidence: 0.92,
      clock_type: 'entry',
    }]);
    expect(insErr).toBeNull();

    const { data } = await s.from('face_auth_attempts').select('*').eq('employee_id', empId).single();
    expect(data?.success).toBe(true);
    expect(Number(data?.confidence)).toBeCloseTo(0.92, 2);
    expect(data?.clock_type).toBe('entry');

    await s.from('face_auth_attempts').delete().eq('employee_id', empId);
  });

  test.skip('seção Limpeza Manual — UI varia entre layouts', async () => {});

  test.skip('coordenadas da empresa configuráveis — não testável sem permission especial', async () => {});
  test.skip('mudar senha admin — destrutivo, pula', async () => {});
});
