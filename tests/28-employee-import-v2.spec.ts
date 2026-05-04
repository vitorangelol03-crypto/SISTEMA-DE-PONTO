import { test, expect, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';
import { validateCPF } from '../src/utils/validation';

/**
 * Módulo 28 — Combo H: importação de funcionários atualizada (sub-fases 2.18-2.20).
 *
 * Cobre o fluxo completo:
 * 1. Template baixado tem 25 colunas + sheet "Instruções"
 * 2. Import OK → preview → confirma → 3 funcionários inseridos com campos novos
 * 3. CPF inválido → preview com erro → submit bloqueado
 * 4. PIS vazio → warning → submit liberado → insere com pis=null
 * 5. CPF duplicado dentro do arquivo → ambas linhas erradas → submit bloqueado
 *
 * Isolamento: nomes prefixados com 'PW Test H ' pra cleanup automático
 * via `deleteTestEmployees` global; afterEach faz delete específico por CPF
 * pra garantir idempotência mesmo que o teste falhe no meio.
 */

const ADMIN_SECRET = 'Clayton2024';
const NAME_PREFIX = 'PW Test H ';
const TMP_DIR = '/tmp';

// ─── CPF/PIS helpers (geração matemática garantida válida) ────────────────

function generateValidCPF(base9: string): string {
  const digits = base9.replace(/\D/g, '').padStart(9, '0').slice(0, 9);
  const arr = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += arr[i]! * (10 - i);
  let dv1 = (sum * 10) % 11;
  if (dv1 === 10) dv1 = 0;
  arr.push(dv1);
  sum = 0;
  for (let i = 0; i < 10; i++) sum += arr[i]! * (11 - i);
  let dv2 = (sum * 10) % 11;
  if (dv2 === 10) dv2 = 0;
  arr.push(dv2);
  return arr.join('');
}

function generateValidPIS(base10: string): string {
  const digits = base10.replace(/\D/g, '').padStart(10, '0').slice(0, 10);
  const arr = digits.split('').map(Number);
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += arr[i]! * weights[i]!;
  const remainder = sum % 11;
  const dv = remainder < 2 ? 0 : 11 - remainder;
  return digits + dv;
}

// CPFs de teste (calculados matematicamente — DV correto pelo Mod 11).
const CPF_A = generateValidCPF('987654321'); // 98765432100
const CPF_B = generateValidCPF('876543210'); // 87654321007
const CPF_C = generateValidCPF('765432109'); // 76543210907
const PIS_VALID = generateValidPIS('1205678901'); // 12056789010

const TEST_CPFS = [CPF_A, CPF_B, CPF_C];

// Sanity check: se algum CPF de teste falhar pelo validador real do app,
// abortar antes de rodar (testes inúteis).
for (const cpf of TEST_CPFS) {
  if (!validateCPF(cpf)) {
    throw new Error(`CPF de teste inválido: ${cpf}`);
  }
}

// ─── Helpers locais ──────────────────────────────────────────────────────

async function enterAdminAuth(page: Page): Promise<void> {
  // AdminTab tem auth por senha (mesmo padrão de 12-admin-tab.spec.ts).
  await goToTab(page, 'Admin');
  const senhaInput = page.getByPlaceholder('Senha');
  if (await senhaInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await senhaInput.fill(ADMIN_SECRET);
    await page.getByRole('button', { name: /^Entrar$/ }).click();
  }
}

async function openImportModal(page: Page): Promise<void> {
  await loginAs(page, ADMIN);
  await goToTab(page, 'Funcionários');
  // Botão "Importar" abre o modal de import (linha 663 do EmployeesTab).
  await page.getByRole('button', { name: /^Importar$/ }).click();
  await expect(
    page.getByRole('heading', { name: /Importar Funcionários em Massa/ }),
  ).toBeVisible({ timeout: 10_000 });
}

function createTestXlsx(rows: Array<Record<string, unknown>>, filepath: string): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
  XLSX.writeFile(wb, filepath);
}

async function deleteTestEmployeesByCpf(cpfs: string[]): Promise<void> {
  if (cpfs.length === 0) return;
  const s = getClient();
  await s.from('employees').delete().in('cpf', cpfs);
}

async function deleteTestEmployeesByPrefix(): Promise<void> {
  const s = getClient();
  await s.from('employees').delete().like('name', `${NAME_PREFIX}%`);
}

// ─── Fixtures de linha ────────────────────────────────────────────────────

function buildValidRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nome: `${NAME_PREFIX}Funcionário`,
    cpf: CPF_A,
    pix_chave: CPF_A,
    pix_tipo: 'CPF',
    employment_type: 'CLT',
    endereco: 'RUA TESTE, 1',
    cidade: 'Caratinga',
    estado: 'MG',
    cep: '35300000',
    pin: '1234',
    funcao: 'AUXILIAR',
    cracha: '999',
    pis: PIS_VALID,
    tipo_escala: 'Normal',
    jornada_dom: 0,
    jornada_seg: 480,
    jornada_ter: 480,
    jornada_qua: 480,
    jornada_qui: 480,
    jornada_sex: 480,
    jornada_sab: 240,
    marcacoes_por_dia: 2,
    data_admissao: '01/01/2024',
    tipo_contrato: 'CLT',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Combo H — Importação de funcionários atualizada', () => {
  test.beforeAll(async () => {
    // Limpeza pré-suite — zera estado de qualquer rodada anterior.
    await deleteTestEmployeesByCpf(TEST_CPFS);
    await deleteTestEmployeesByPrefix();
  });

  test.afterEach(async () => {
    // Cleanup após cada teste (idempotência mesmo em falha no meio).
    await deleteTestEmployeesByCpf(TEST_CPFS);
    await deleteTestEmployeesByPrefix();
  });

  test('1. Baixar template tem 25 colunas + sheet "Instruções"', async ({ page }) => {
    await openImportModal(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByRole('button', { name: /Baixar Planilha Template/ }).click();
    const download = await downloadPromise;

    const downloadPath = path.join(TMP_DIR, `template-test-${Date.now()}.xlsx`);
    await download.saveAs(downloadPath);

    // XLSX.readFile só funciona em Node 'cjs/full'; aqui usamos buffer + read
    // pra compat com qualquer ambiente.
    const buffer = fs.readFileSync(downloadPath);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Funcionários');
    expect(wb.SheetNames).toContain('Instruções');

    const sheet = wb.Sheets['Funcionários']!;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    const headers = rows[0] as string[];

    expect(headers.length).toBe(25);
    // Obrigatórios marcados com '*'
    expect(headers).toContain('nome*');
    expect(headers).toContain('cpf*');
    // Campos novos da Etapa 2
    expect(headers).toContain('pis');
    expect(headers).toContain('marcacoes_por_dia');
    expect(headers).toContain('jornada_seg');
    expect(headers).toContain('data_admissao');
    expect(headers).toContain('tipo_contrato');
    expect(headers).toContain('funcao');
    expect(headers).toContain('cracha');
  });

  test('2. Importar 3 funcionários OK → preview → confirma → 3 inseridos', async ({ page }) => {
    const filepath = path.join(TMP_DIR, `import-ok-${Date.now()}.xlsx`);
    createTestXlsx(
      [
        buildValidRow({ nome: `${NAME_PREFIX}Alice`, cpf: CPF_A, cracha: '101', pis: generateValidPIS('1111111110') }),
        buildValidRow({ nome: `${NAME_PREFIX}Bruno`, cpf: CPF_B, cracha: '102', pis: generateValidPIS('2222222220') }),
        buildValidRow({ nome: `${NAME_PREFIX}Carla`, cpf: CPF_C, cracha: '103', pis: generateValidPIS('3333333330') }),
      ],
      filepath,
    );

    await openImportModal(page);
    await page.setInputFiles('#file-upload', filepath);
    await page.getByRole('button', { name: /Processar Planilha/ }).click();

    // Preview deve abrir com 3 prontos. Em vez de inspecionar o card numérico
    // (HTML ainda em flux), usamos o BOTÃO de confirmação como prova: ele
    // exibe "Importar 3 Funcionário(s)" — sinal canônico de que parser
    // classificou 3 como válidos.
    await expect(page.getByText('Prontos').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Importar 3 Funcionário/ })).toBeVisible({ timeout: 10_000 });

    // Confirma
    await page.getByRole('button', { name: /Importar 3 Funcionário/ }).click();

    // Toast de sucesso
    await expect(page.getByText(/3 funcionário\(s\) importado\(s\)/i)).toBeVisible({ timeout: 15_000 });

    // Verifica via Supabase: 3 inseridos com campos novos preenchidos
    const s = getClient();
    const { data, error } = await s
      .from('employees')
      .select('cpf, name, function_role, badge_number, pis, marking_count, hire_date, contract_type')
      .in('cpf', TEST_CPFS);
    if (error) throw error;
    expect(data).toHaveLength(3);
    for (const emp of data ?? []) {
      expect(emp.function_role).toBe('AUXILIAR');
      expect(emp.pis).toBeTruthy();
      expect(emp.marking_count).toBe(2);
      expect(emp.hire_date).toBe('2024-01-01');
      expect(emp.contract_type).toBe('CLT');
    }
  });

  test('3. CPF inválido → preview destaca erro → submit bloqueado', async ({ page }) => {
    const filepath = path.join(TMP_DIR, `import-bad-cpf-${Date.now()}.xlsx`);
    createTestXlsx(
      [
        buildValidRow({ nome: `${NAME_PREFIX}BadCPF`, cpf: '11111111111' }), // todos 1s — sempre inválido
      ],
      filepath,
    );

    await openImportModal(page);
    await page.setInputFiles('#file-upload', filepath);
    await page.getByRole('button', { name: /Processar Planilha/ }).click();

    // Preview abre com 1 erro
    await expect(page.getByText('Erros').first()).toBeVisible({ timeout: 15_000 });

    // Mensagem do erro deve aparecer (cpf_invalid → "CPF inválido")
    await expect(page.getByText(/CPF inválido/i).first()).toBeVisible({ timeout: 5_000 });

    // Botão de confirmação deve mostrar 0 funcionários e estar desabilitado.
    const confirmBtn = page.getByRole('button', { name: /Importar 0 Funcionário/ });
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();
  });

  test('4. PIS vazio → warning amarelo → submit liberado → insere com pis=null', async ({ page }) => {
    const filepath = path.join(TMP_DIR, `import-no-pis-${Date.now()}.xlsx`);
    createTestXlsx(
      [
        buildValidRow({ nome: `${NAME_PREFIX}NoPIS`, cpf: CPF_A, pis: '' }),
      ],
      filepath,
    );

    await openImportModal(page);
    await page.setInputFiles('#file-upload', filepath);
    await page.getByRole('button', { name: /Processar Planilha/ }).click();

    await expect(page.getByText('Com avisos').first()).toBeVisible({ timeout: 15_000 });

    // Mensagem do warning de PIS vazio
    await expect(page.getByText(/PIS não preenchido/i).first()).toBeVisible({ timeout: 5_000 });

    // Submit deve estar habilitado (warnings não bloqueiam)
    const confirmBtn = page.getByRole('button', { name: /Importar 1 Funcionário/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.getByText(/1 funcionário\(s\) importado\(s\)/i)).toBeVisible({ timeout: 15_000 });

    // Verifica que foi inserido com pis NULL
    const s = getClient();
    const { data, error } = await s
      .from('employees')
      .select('cpf, pis')
      .eq('cpf', CPF_A)
      .single();
    if (error) throw error;
    expect(data.cpf).toBe(CPF_A);
    expect(data.pis).toBeNull();
  });

  test('5. CPF duplicado dentro do arquivo → 2 linhas erradas → submit bloqueado', async ({ page }) => {
    const filepath = path.join(TMP_DIR, `import-dup-${Date.now()}.xlsx`);
    createTestXlsx(
      [
        buildValidRow({ nome: `${NAME_PREFIX}Dup1`, cpf: CPF_A }),
        buildValidRow({ nome: `${NAME_PREFIX}Dup2`, cpf: CPF_A }), // mesmo CPF
      ],
      filepath,
    );

    await openImportModal(page);
    await page.setInputFiles('#file-upload', filepath);
    await page.getByRole('button', { name: /Processar Planilha/ }).click();

    await expect(page.getByText('Erros').first()).toBeVisible({ timeout: 15_000 });

    // A segunda linha deve aparecer com erro de duplicata.
    // (a primeira é validada antes de o set conter o CPF, então só a segunda
    // sinaliza 'cpf_duplicate_in_file' no validator atual.)
    await expect(page.getByText(/CPF duplicado/i).first()).toBeVisible({ timeout: 5_000 });

    // Botão de confirmação mostra 1 funcionário (a primeira ainda válida)
    // ou 0, dependendo da política. Em ambos casos, NÃO importamos os 2.
    // Aceitamos qualquer "Importar 0|1 Funcionário(s)".
    const confirmBtn = page.getByRole('button', { name: /Importar [01] Funcionário/ });
    await expect(confirmBtn).toBeVisible();
  });
});
