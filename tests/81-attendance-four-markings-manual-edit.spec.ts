import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { createTestEmployee, insertAttendance, cleanupByPrefix, TEST_EMPLOYEE_NAME_PREFIX } from './integrity-helpers';

/**
 * E2E — correção manual de ponto pra quem tem 4 marcações (01/09/2026, achado
 * durante a auditoria do roadmap item 2 e pedido do Victor: "pode analisar e
 * fazer").
 *
 *   achado: a aba Ponto mostrava as 4 marcações (Ent.1/Saí.1/Ent.2/Saí.2) só
 *   em modo leitura pra funcionários com marking_count=4 — não existia
 *   NENHUMA forma de um supervisor corrigir um erro (esqueceu de bater,
 *   engano de horário etc.), diferente de quem tem 2 marcações (que já tem
 *   os campinhos de hora + salvar). Reusar o `setManualTime` existente não
 *   resolve: ele grava só entry_time/exit_time_full (campos legados), e
 *   `recalcAttendance` ignora esses campos quando o funcionário é de 4
 *   marcações — vira um no-op silencioso.
 *
 * Prova, no navegador real: preenche as 4 marcações de um dia com almoço de
 * verdade (08:00 → 12:00 → 13:00 → 18:00 = 9h trabalhadas, 1h de almoço
 * descontada) pelos campos novos, salva, e confere no banco que TODAS as 4
 * marcações foram gravadas E que `hours_worked` saiu com o almoço descontado
 * (9h, não as 10h que um cálculo ingênuo de entrada→saída daria).
 */

const PREFIX = `${TEST_EMPLOYEE_NAME_PREFIX}Att4Manual `;

function todayBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

test.describe('AttendanceTab — correção manual de 4 marcações', () => {
  test.afterAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  test('preenche as 4 marcações pela tela → grava certo e desconta o almoço no cálculo', async ({ page }) => {
    test.setTimeout(60_000);
    const nome = `${PREFIX}${Date.now()}`;
    const empId = await createTestEmployee({ name: nome, pin: '1234' });
    const s = getClient();
    await s.from('employees').update({ marking_count: 4 }).eq('id', empId);
    const today = todayBR();
    await insertAttendance(empId, today, { status: 'present' });

    await loginAs(page, MASTER_2626);
    await goToTab(page, 'Ponto');
    await page.getByRole('button', { name: /^Atualizar$/ }).click();
    await page.waitForTimeout(800);

    const row = page.getByTestId('attendance-row').filter({ hasText: nome });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const inputs = row.locator('input[type="time"]');
    await expect(inputs).toHaveCount(4);
    await inputs.nth(0).fill('08:00:00'); // Ent.1
    await inputs.nth(1).fill('12:00:00'); // Saí.1 (almoço)
    await inputs.nth(2).fill('13:00:00'); // Ent.2 (volta)
    await inputs.nth(3).fill('18:00:00'); // Saí.2 (final)

    await row.getByRole('button', { name: /Salvar/i }).click();
    await expect(page.getByText('Horário salvo')).toBeVisible({ timeout: 10_000 });

    const { data: att } = await s
      .from('attendance')
      .select('entry_1_time, exit_1_time, entry_2_time, exit_2_time, entry_time, exit_time_full, hours_worked')
      .eq('employee_id', empId)
      .eq('date', today)
      .single();

    expect(att?.entry_1_time).not.toBeNull();
    expect(att?.exit_1_time).not.toBeNull();
    expect(att?.entry_2_time).not.toBeNull();
    expect(att?.exit_2_time).not.toBeNull();
    // Campos legados espelhados (posição 1 e 4) — é o que Aprovação/Financeiro/Relatórios leem.
    expect(att?.entry_time).not.toBeNull();
    expect(att?.exit_time_full).not.toBeNull();
    // 4h manhã + 5h tarde = 9h — NÃO as 10h que entrada→saída direto daria sem descontar o almoço.
    expect(Number(att?.hours_worked)).toBe(9);
  });
});
