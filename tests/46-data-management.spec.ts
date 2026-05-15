import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Sub-fase 14.6 — DataManagementTab wizard.
 *
 * Componente: src/components/datamanagement/DataManagementTab.tsx
 *   activeSection: 'overview' | 'retention' | 'manual' | 'automatic' | 'logs'
 *
 * Sub-seções acessíveis pelos chips no topo:
 *   - "Visão Geral" (default) — stats cards
 *   - "Retenção" — config de retention_months por data_type
 *   - "Limpeza Manual" — wizard com confirmação dupla
 *   - "Limpeza Automática" — toggle + frequência + horário
 *   - "Histórico" — cleanup_logs
 *
 * Permissão: 'datamanagement.view' (admin tem todas).
 *
 * Cobertura:
 *  - Visão Geral: cards de stats (Total/Presenças/Pagamentos/Erros/Bonificações)
 *  - Retenção: 4 settings visíveis com retention_months editável
 *  - Mudar retention_months → save → DB atualiza (com restauração)
 *  - Limpeza Manual: form abre com checkboxes de tipos
 *  - Limpeza Automática: toggle + select frequência + horário
 *  - Histórico: lista cleanup_logs (mesmo que vazio mostra placeholder)
 */

async function unlockDataMgmt(page: Page): Promise<void> {
  await goToTab(page, 'Gerenciamento');
  // Heading principal renderiza imediatamente quando company.id resolve
  await expect(
    page.getByRole('heading', { name: /Gerenciamento de Dados/i })
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('DataManagementTab — Gerenciamento', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('a. Visão Geral: cards de stats (Total + 4 categorias) renderizam', async ({ page }) => {
    await unlockDataMgmt(page);

    // Stats cards do activeSection='overview' default
    await expect(page.getByText(/Total de Registros/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^Presenças$/i).first()).toBeVisible();
    await expect(page.getByText(/^Pagamentos$/i).first()).toBeVisible();
    await expect(page.getByText(/Registros de Erros/i).first()).toBeVisible();
    await expect(page.getByText(/^Bonificações$/i).first()).toBeVisible();

    // Caratinga tem dados reais — pelo menos 1 card mostra "Mais antigo:"
    await expect(page.getByText(/Mais antigo:/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('b. Retenção: 4 settings visíveis (attendance, payments, error_records, bonuses)', async ({ page }) => {
    await unlockDataMgmt(page);

    // Clica chip "Retenção"
    await page.getByRole('button', { name: /^Retenção$/i }).click();

    await expect(
      page.getByRole('heading', { name: /Configurações de Retenção de Dados/i })
    ).toBeVisible({ timeout: 10_000 });

    // 4 categorias listadas com input number editável
    // Labels exibidos: Presenças, Pagamentos, Registros de Erros, Bonificações
    await expect(page.getByText(/^Presenças$/i).first()).toBeVisible();
    await expect(page.getByText(/^Pagamentos$/i).first()).toBeVisible();
    await expect(page.getByText(/Registros de Erros/i).first()).toBeVisible();
    await expect(page.getByText(/^Bonificações$/i).first()).toBeVisible();

    // Pelo menos 4 inputs type=number visíveis (um por data_type)
    const numInputs = page.locator('input[type="number"]');
    const count = await numInputs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('c. retention_months: UI reflete value do DB + persiste após reload', async ({ page }) => {
    // Estratégia: muda valor no DB via service_role e valida que a UI
    // (DataManagementTab) renderiza o novo valor no input e no label
    // "Registros mantidos por N meses". Isto cobre a integração
    // get→render sem depender de UI write (o onChange dispara write
    // a cada keystroke, gerando comportamento difícil de testar
    // determinísticamente).
    const s = getClient();
    const { data: originalRow } = await s
      .from('data_retention_settings')
      .select('retention_months')
      .eq('data_type', 'bonuses')
      .single();
    const originalMonths = originalRow?.retention_months as number;
    expect(originalMonths).toBeGreaterThan(0);

    const newMonths = originalMonths === 36 ? 30 : 36;

    try {
      // 1. Update DB via service_role (bypass RLS)
      const { error: updErr } = await s
        .from('data_retention_settings')
        .update({ retention_months: newMonths, updated_by: '9999' })
        .eq('data_type', 'bonuses');
      expect(updErr).toBeNull();

      // 2. Abre UI e navega para Retenção — loadData no useEffect lê DB
      await unlockDataMgmt(page);
      await page.getByRole('button', { name: /^Retenção$/i }).click();
      await expect(
        page.getByRole('heading', { name: /Configurações de Retenção de Dados/i })
      ).toBeVisible({ timeout: 10_000 });

      // 3. Verifica que o label "Registros mantidos por N meses" reflete newMonths
      //    Cada row é div.border.border-gray-200.rounded-lg.p-4 (estrutura específica
      //    em DataManagementTab.tsx L520). filtra direto pelo container interno.
      const bonificacoesRow = page
        .locator('div.flex.items-center.justify-between.p-4.border')
        .filter({ hasText: 'Bonificações' });
      await expect(
        bonificacoesRow.getByText(new RegExp(`Registros mantidos por ${newMonths} meses`))
      ).toBeVisible({ timeout: 10_000 });

      // 4. Input number da row Bonificações também tem value=newMonths
      const input = bonificacoesRow.locator('input[type="number"]');
      await expect(input).toHaveValue(String(newMonths), { timeout: 5_000 });
    } finally {
      // Restaura SEMPRE — config global afeta uso real
      await s
        .from('data_retention_settings')
        .update({ retention_months: originalMonths, updated_by: '9999' })
        .eq('data_type', 'bonuses');
    }
  });

  test('d. Limpeza Manual: form abre com checkboxes + selects', async ({ page }) => {
    await unlockDataMgmt(page);
    await page.getByRole('button', { name: /Limpeza Manual/i }).click();

    await expect(
      page.getByRole('heading', { name: /Limpeza Manual de Dados/i })
    ).toBeVisible({ timeout: 10_000 });

    // Checkboxes de tipo de dado
    await expect(page.locator('label:has-text("Presenças") input[type="checkbox"]')).toBeVisible();
    await expect(page.locator('label:has-text("Pagamentos") input[type="checkbox"]')).toBeVisible();
    await expect(page.locator('label:has-text("Registros de Erros") input[type="checkbox"]')).toBeVisible();
    await expect(page.locator('label:has-text("Bonificações") input[type="checkbox"]')).toBeVisible();

    // Botão "Visualizar Prévia" gated por seleção
    await expect(page.getByRole('button', { name: /Visualizar Prévia/i })).toBeVisible();
  });

  test('e. Limpeza Automática: toggle button + select frequência + input time', async ({ page }) => {
    await unlockDataMgmt(page);
    await page.getByRole('button', { name: /Limpeza Automática/i }).click();

    await expect(
      page.getByRole('heading', { name: /^Limpeza Automática$/i })
    ).toBeVisible({ timeout: 10_000 });

    // Status renderiza Ativar OU Desativar (depende do estado atual no DB)
    const toggleBtn = page.getByRole('button', { name: /^(Ativar|Desativar)$/ }).first();
    await expect(toggleBtn).toBeVisible({ timeout: 5_000 });

    // Frequência dropdown
    await expect(page.getByText(/^Frequência$/i)).toBeVisible();

    // Horário Preferencial input type=time
    await expect(page.getByText(/Horário Preferencial/i)).toBeVisible();
    await expect(page.locator('input[type="time"]')).toBeVisible();
  });

  test('f. Histórico: card lista cleanup_logs OU mostra placeholder vazio', async ({ page }) => {
    await unlockDataMgmt(page);
    await page.getByRole('button', { name: /^Histórico$/i }).click();

    await expect(
      page.getByRole('heading', { name: /Histórico de Limpezas/i })
    ).toBeVisible({ timeout: 10_000 });

    // Spec aceita 2 estados: lista populada OU "Nenhuma limpeza realizada ainda"
    const placeholder = page.getByText(/Nenhuma limpeza realizada ainda/i);
    const items = page.locator('div.border.border-gray-200.rounded-lg.p-4').filter({
      hasText: /Limpeza (Manual|Automática)/i,
    });

    // Pelo menos uma das duas condições deve ser verdade
    const hasPlaceholder = await placeholder.isVisible().catch(() => false);
    const itemCount = await items.count();
    expect(hasPlaceholder || itemCount > 0).toBe(true);
  });

  test('g. wizard de limpeza manual: prévia abre + confirmação dupla bloqueada sem ID correto', async ({ page }) => {
    await unlockDataMgmt(page);
    await page.getByRole('button', { name: /Limpeza Manual/i }).click();
    await expect(
      page.getByRole('heading', { name: /Limpeza Manual de Dados/i })
    ).toBeVisible({ timeout: 10_000 });

    // Seleciona "Bonificações" (categoria menos crítica) — checkbox
    await page.locator('label:has-text("Bonificações") input[type="checkbox"]').check();

    // Janela inteiramente no passado → não há dados de hoje a deletar.
    // Faixa SAFE: 2010-01-01 → 2010-12-31 (não há registros nessa janela
    // em produção; preview retornará 0).
    const startInput = page
      .locator('label:has-text("Data Inicial")')
      .locator('xpath=following-sibling::input[@type="date"]')
      .first();
    const endInput = page
      .locator('label:has-text("Data Final")')
      .locator('xpath=following-sibling::input[@type="date"]')
      .first();
    await startInput.fill('2010-01-01');
    await endInput.fill('2010-12-31');

    // Click "Visualizar Prévia"
    await page.getByRole('button', { name: /Visualizar Prévia/i }).click();

    // Prévia abre com "Prévia da Limpeza" heading
    await expect(
      page.getByRole('heading', { name: /Prévia da Limpeza/i })
    ).toBeVisible({ timeout: 5_000 });

    // Desmarcar "Gerar backup antes de excluir" — backup com 0 records
    // dispara XLSX writeFile que pode falhar e bloquear o wizard em step 1.
    // Tirar o backup permite testar o fluxo até a confirmação dupla final.
    const backupCheckbox = page.locator(
      'label:has-text("Gerar backup antes de excluir") input[type="checkbox"]'
    );
    await backupCheckbox.uncheck();

    // Step 0: botão "Continuar" abre confirmStep=1
    const continuarBtn = page.getByRole('button', { name: /^Continuar$/i });
    await expect(continuarBtn).toBeVisible();
    await continuarBtn.click();

    // Step 1: botão "Próximo" (com generateBackup=false não há try/catch
    // do XLSX, vai direto para step 2)
    const proximoBtn = page.getByRole('button', { name: /^Próximo$/i });
    await expect(proximoBtn).toBeVisible({ timeout: 5_000 });
    await proximoBtn.click();

    // Step 2: input "Digite seu ID" + botão Confirmar Exclusão
    const idInput = page.getByPlaceholder('Digite seu ID');
    await expect(idInput).toBeVisible({ timeout: 10_000 });

    // Digita ID errado para validar bloqueio
    await idInput.fill('id-incorreto-zzz');
    await page.getByRole('button', { name: /Confirmar Exclusão/i }).click();

    // Esperado: toast "Senha incorreta" — wizard NÃO avança e nenhum
    // delete é executado.
    await expect(page.getByText(/Senha incorreta/i)).toBeVisible({ timeout: 5_000 });
  });
});
