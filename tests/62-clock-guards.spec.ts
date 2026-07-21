import { test, expect, Page } from '@playwright/test';
import { getClient } from './cleanup';
import { createTestEmployee, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * Spec 62 — Proteções da tela de ponto (decisões do Victor, 2026-07-20):
 *  1. Saída < 10 min da marcação anterior → confirmação ("Não! Foi engano").
 *  2. Após registrar ponto, a tela volta ao CPF sozinha em 35s.
 *  3. Localização BLOQUEADA no navegador → overlay de instrução, SEM chamar o
 *     servidor (não cria geo_fraud_attempts nem bonus_blocks).
 *
 * Cliques reais contra o banco único (funcionários "PW Test" — aditivo).
 * Geolocalização simulada no CD Caratinga (mesmas coords do caso real 20/07).
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Guard `;
const CD_CARATINGA = { latitude: -19.8023373, longitude: -42.1360937 };

async function cleanup() {
  await cleanupByPrefix(PREFIX);
}

async function createClockEmployee(name: string): Promise<{ empId: string; cpfMasked: string }> {
  const empId = await createTestEmployee({ name, pin: '4321' });
  const s = getClient();
  // Facial OFF só neste funcionário (antes da tela carregá-lo) — nunca na config global.
  await s.from('employees').update({ face_recognition_enabled: false }).eq('id', empId);
  const { data: emp } = await s.from('employees').select('cpf').eq('id', empId).single();
  const cpf = emp?.cpf as string;
  return { empId, cpfMasked: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` };
}

async function loginToDashboard(page: Page, cpfMasked: string) {
  await page.goto('/clock');
  await page.locator('input').first().fill(cpfMasked);
  await page.getByRole('button', { name: /Continuar/i }).click();
  await expect(page.getByRole('button', { name: '4', exact: true })).toBeVisible({ timeout: 15_000 });
  for (const d of ['4', '3', '2', '1']) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: /Confirmar PIN/i }).click();
  await expect(page.getByRole('button', { name: /REGISTRAR ENTRADA/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('Spec 62 — proteções da tela de ponto', () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test.describe('com GPS liberado (CD Caratinga)', () => {
    test.use({ geolocation: CD_CARATINGA, permissions: ['geolocation'] });

    test('saída < 10 min pede confirmação; "Foi engano" NÃO registra; confirmar registra', async ({ page }) => {
      test.setTimeout(180_000);
      const { empId, cpfMasked } = await createClockEmployee(`${PREFIX}SaidaRapida`);
      const s = getClient();
      await loginToDashboard(page, cpfMasked);

      // 1. Entrada real
      await page.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
      await expect(page.getByText(/✅ Entrada registrada/i)).toBeVisible({ timeout: 30_000 });

      // 2. Botão vira SAÍDA; clicar logo depois abre a CONFIRMAÇÃO (não registra direto).
      // O guard anti-toque-duplo (3s, já existente) engole cliques imediatos — igual
      // faria com um humano; o humano confuso real clica ~10-15s depois. Repete o
      // clique até o diálogo abrir (condição, não sleep).
      const exitBtn = page.getByRole('button', { name: /REGISTRAR SAÍDA/i });
      await expect(exitBtn).toBeVisible({ timeout: 15_000 });
      await expect(async () => {
        await exitBtn.click();
        await expect(page.getByText(/Registrar SAÍDA agora\?/i)).toBeVisible({ timeout: 1500 });
      }).toPass({ timeout: 20_000 });

      // 3. "Não! Foi engano" fecha o diálogo e NADA é gravado
      await page.getByRole('button', { name: /Não! Foi engano/i }).click();
      await expect(page.getByText(/Registrar SAÍDA agora\?/i)).not.toBeVisible();
      const { data: after1 } = await s.from('attendance').select('exit_time_full').eq('employee_id', empId).maybeSingle();
      expect(after1?.exit_time_full ?? null).toBeNull();

      // 4. Tentar de novo e CONFIRMAR registra a saída de verdade
      await exitBtn.click();
      await expect(page.getByText(/Registrar SAÍDA agora\?/i)).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /Sim, quero registrar SAÍDA mesmo/i }).click();
      await expect(page.getByText(/✅ Saída registrada/i)).toBeVisible({ timeout: 30_000 });
      const { data: after2 } = await s.from('attendance').select('exit_time_full').eq('employee_id', empId).maybeSingle();
      expect(after2?.exit_time_full).toBeTruthy();
    });

    test('após registrar, a tela volta ao CPF sozinha em ~35s', async ({ page }) => {
      test.setTimeout(180_000);
      const { cpfMasked } = await createClockEmployee(`${PREFIX}AutoVolta`);
      await loginToDashboard(page, cpfMasked);

      await page.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
      await expect(page.getByText(/✅ Entrada registrada/i)).toBeVisible({ timeout: 30_000 });
      // A mensagem avisa o funcionário do retorno automático
      await expect(page.getByText(/a tela volta ao início em 35s/i)).toBeVisible();

      // Em até ~40s a tela tem que voltar pro CPF (35s do timer + folga)
      await expect(page.getByText(/Digite seu CPF/i)).toBeVisible({ timeout: 45_000 });
    });
  });

  test.describe('com GPS bloqueado', () => {
    // O Playwright só sabe CONCEDER permissão (sem grant o estado fica 'prompt');
    // o estado 'denied' — que é o do celular do funcionário que bloqueou o GPS —
    // não é alcançável via API. Simulamos o ESTADO reportado pelo navegador;
    // o comportamento do sistema (overlay + nenhuma chamada ao servidor) é real.
    test('overlay ensina a liberar e NÃO gasta tentativa no servidor', async ({ page }) => {
      test.setTimeout(180_000);
      await page.addInitScript(() => {
        const orig = navigator.permissions.query.bind(navigator.permissions);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator.permissions as any).query = (desc: PermissionDescriptor) =>
          desc?.name === 'geolocation'
            ? Promise.resolve({ state: 'denied', onchange: null } as unknown as PermissionStatus)
            : orig(desc);
      });
      const { empId, cpfMasked } = await createClockEmployee(`${PREFIX}GpsBloq`);
      const s = getClient();
      await loginToDashboard(page, cpfMasked);

      await page.getByRole('button', { name: /REGISTRAR ENTRADA/i }).click();
      await expect(page.getByText(/Localização bloqueada/i)).toBeVisible({ timeout: 10_000 });

      // Nada chegou ao servidor: sem tentativa suspeita, sem bloqueio de bônus, sem ponto
      const { data: fraud } = await s.from('geo_fraud_attempts').select('id').eq('employee_id', empId);
      const { data: blocks } = await s.from('bonus_blocks').select('id').eq('employee_id', empId);
      const { data: att } = await s.from('attendance').select('id').eq('employee_id', empId);
      expect(fraud ?? []).toHaveLength(0);
      expect(blocks ?? []).toHaveLength(0);
      expect(att ?? []).toHaveLength(0);

      // Botão do overlay fecha a instrução
      await page.getByRole('button', { name: /Já liberei/i }).click();
      await expect(page.getByText(/Localização bloqueada/i)).not.toBeVisible();
    });
  });
});
