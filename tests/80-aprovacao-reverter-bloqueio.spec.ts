import { test, expect } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab } from './helpers';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';

/**
 * E2E — reverter decisão na aba Aprovação de Cadastro (31/08/2026, pedido do Victor):
 *
 *   achado no meio da sessão: Arthur Teixeira estava "aprovado" mas com a nota
 *   "não está indo trabalhar" — a MESMA frase usada pra recusar outros 27
 *   funcionários. A aba só mostrava os botões Aprovar/Recusar no filtro
 *   "Pendente" — uma vez decidido, não tinha como mudar. Vitor pediu:
 *   "não só quem tá marcado como recusado que fica bloqueado... coloca
 *   também uma forma de reverter esse bloqueio".
 *
 * Prova, no navegador real, os botões novos nos dois sentidos (aprovado →
 * recusado e recusado → aprovado, sem sair do painel) e confirma no fim que
 * o estado revertido desbloqueia de verdade no /clock.
 */

const RUN = Date.now().toString(36);
const NOME = `${TEST_EMPLOYEE_NAME_PREFIX}Reverter ${RUN}`;

/** Gera um CPF com dígitos verificadores válidos (Mod 11), único por seed. */
function validCpf(seed: number): string {
  const base = String(100000000 + (seed % 799999999)).padStart(9, '0').slice(0, 9);
  const digits = base.split('').map(Number);
  const calcDigit = (arr: number[], factorStart: number) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] * (factorStart - i);
    let d = (sum * 10) % 11;
    if (d === 10) d = 0;
    return d;
  };
  const d1 = calcDigit(digits, 10);
  const d2 = calcDigit([...digits, d1], 11);
  return base + String(d1) + String(d2);
}
const CPF = validCpf(Date.now());

test.describe('Aprovação de Cadastro — reverter decisão', () => {
  test('aprovado → recusado (bloqueia) → reverte pra aprovado (desbloqueia)', async ({ page }) => {
    test.setTimeout(90_000);
    const supabase = getClient();
    const { data: caratinga, error } = await supabase
      .from('companies')
      .select('id')
      .ilike('display_name', '%caratinga%')
      .limit(1)
      .single();
    if (error || !caratinga) throw new Error('Empresa Caratinga não encontrada para o teste');
    const companyId = (caratinga as { id: string }).id;

    const { data: created, error: insertError } = await supabase
      .from('employees')
      .insert([{
        name: NOME,
        cpf: CPF,
        employment_type: 'Diarista',
        created_by: '2626',
        company_id: companyId,
        registration_status: 'approved',
      }])
      .select('id')
      .single();
    if (insertError || !created) throw new Error(`Falha ao criar funcionário de teste: ${insertError?.message}`);
    const employeeId = (created as { id: string }).id;

    try {
      await loginAs(page, MASTER_2626);
      await goToTab(page, 'Aprovação de Cadastro');
      await expect(page.getByRole('heading', { name: 'Aprovação de Cadastro' })).toBeVisible({ timeout: 10_000 });

      // ── 1) Filtro "Aprovado": recusa (bloqueia) ──
      await page.getByRole('button', { name: /Aprovado/ }).click();
      const rowApproved = page.getByTestId('employee-approval-row').filter({ hasText: NOME });
      await expect(rowApproved).toBeVisible({ timeout: 10_000 });
      page.once('dialog', d => d.accept());
      await rowApproved.getByRole('button', { name: 'Recusar' }).click();
      await expect(rowApproved).toHaveCount(0, { timeout: 10_000 });

      const { data: afterReject } = await supabase
        .from('employees')
        .select('registration_status')
        .eq('id', employeeId)
        .single();
      expect((afterReject as { registration_status: string } | null)?.registration_status).toBe('rejected');
      // (bloqueio real no /clock pra quem é 'rejected' já é provado no tests/78;
      // aqui o foco é a reversão em si, sem sair do painel entre as duas ações)

      // ── 2) Filtro "Recusado": reverte (aprova de novo) ──
      await page.getByRole('button', { name: /Recusado/ }).click();
      const rowRejected = page.getByTestId('employee-approval-row').filter({ hasText: NOME });
      await expect(rowRejected).toBeVisible({ timeout: 10_000 });
      page.once('dialog', d => d.accept());
      await rowRejected.getByRole('button', { name: 'Reverter e aprovar' }).click();
      await expect(rowRejected).toHaveCount(0, { timeout: 10_000 });

      const { data: afterRevert } = await supabase
        .from('employees')
        .select('registration_status')
        .eq('id', employeeId)
        .single();
      expect((afterRevert as { registration_status: string } | null)?.registration_status).toBe('approved');

      // Confirma desbloqueio real no /clock (sem PIN configurado ainda → cai
      // no setup de senha, prova que passou da checagem de recusado).
      await page.goto('/clock');
      await page.locator('input[placeholder="000.000.000-00"]').fill(CPF);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText('Criar sua senha de acesso')).toBeVisible({ timeout: 10_000 });
    } finally {
      await supabase.from('attendance').delete().eq('employee_id', employeeId);
      await supabase.from('employees').delete().eq('id', employeeId);
    }
  });
});
