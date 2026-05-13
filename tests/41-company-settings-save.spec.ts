import { test, expect, Page } from '@playwright/test';
import { ADMIN, loginAs, goToTab } from './helpers';
import { getClient } from './cleanup';

/**
 * Spec 41 — CompanySettings SAVE coverage (sub-fase 11.6+)
 *
 * Complementa o spec 34 (que cobre toggles/visibilidade) testando o caminho
 * de *persistência* dos campos editáveis do form em
 * `src/components/admin/CompanySettings.tsx`:
 *
 *  - Cidade (input texto, free-form)
 *  - Endereço completo (textarea, free-form)
 *  - Raio (m) — único campo de geofence editável neste form
 *    (latitude/longitude têm input `disabled` aqui — UX é "editar em outra
 *    tela"). Mesmo assim validamos que o submit NÃO destrói os valores
 *    pré-existentes de lat/lng (eles não estão no payload de `handleSubmit`).
 *  - Jornada padrão semanal (default_schedule — array de 7 minutos)
 *
 * Estratégia anti-pollution:
 *  - `test.describe.configure({ mode: 'serial' })` — testes mexem na MESMA
 *    row real (Caratinga). Paralelismo é proibido aqui.
 *  - `beforeAll` captura snapshot completo dos campos sob teste.
 *  - `afterAll` restaura o snapshot (SQL UPDATE) — garante que mesmo se um
 *    teste no meio explodir, o estado final volta pro original.
 *  - `afterEach` restaura o snapshot novamente. Isso protege específica de
 *    cada teste se o teste seguinte rodar depois de um middle-failure.
 *  - Marcadores `PW Test SaveSpec ` em strings de teste — facilita audit
 *    manual caso algo escape do cleanup.
 */

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

type SettingsSnapshot = {
  city: string | null;
  address_full: string | null;
  default_geo_lat: number;
  default_geo_lng: number;
  default_geo_radius: number;
  default_schedule: number[] | null;
};

const SNAPSHOT_COLUMNS =
  'city, address_full, default_geo_lat, default_geo_lng, default_geo_radius, default_schedule';

async function captureSnapshot(): Promise<SettingsSnapshot> {
  const s = getClient();
  const { data, error } = await s
    .from('companies')
    .select(SNAPSHOT_COLUMNS)
    .eq('id', CARATINGA_ID)
    .single();
  if (error) throw error;
  return data as unknown as SettingsSnapshot;
}

async function restoreSnapshot(snap: SettingsSnapshot): Promise<void> {
  const s = getClient();
  const { error } = await s
    .from('companies')
    .update({
      city: snap.city,
      address_full: snap.address_full,
      default_geo_lat: snap.default_geo_lat,
      default_geo_lng: snap.default_geo_lng,
      default_geo_radius: snap.default_geo_radius,
      default_schedule: snap.default_schedule,
    })
    .eq('id', CARATINGA_ID);
  if (error) throw error;
}

async function setLatLngDirect(lat: number, lng: number): Promise<void> {
  const s = getClient();
  const { error } = await s
    .from('companies')
    .update({ default_geo_lat: lat, default_geo_lng: lng })
    .eq('id', CARATINGA_ID);
  if (error) throw error;
}

async function unlockAdmin(page: Page) {
  await goToTab(page, 'Admin');
  const passwordInput = page.getByPlaceholder('Senha');
  await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  await passwordInput.fill('Clayton2024');
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await expect(page.getByTestId('facial-global-toggle')).toBeVisible({ timeout: 20_000 });
}

function locSettingsSection(page: Page) {
  // Mesmo seletor robusto do spec 34: filtra pelo heading "Configurações da
  // Empresa" e usa `div.bg-white` pra não pegar o wrapper externo da AdminTab
  // (que contém outro botão "Salvar nova senha").
  return page
    .locator('div.bg-white')
    .filter({ has: page.getByRole('heading', { name: /Configurações da Empresa/i }) })
    .first();
}

async function clickSave(page: Page) {
  const section = locSettingsSection(page);
  await section.getByRole('button', { name: /^Salvar/ }).first().click();
  // Aguarda toast de sucesso — string vinda do componente: "Configurações salvas".
  await expect(
    page.getByText(/Configura[çc]ões salvas|salvo com sucesso/i).first(),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('CompanySettings SAVE (spec 41)', () => {
  let original: SettingsSnapshot;

  test.beforeAll(async () => {
    original = await captureSnapshot();
  });

  test.afterAll(async () => {
    // Garante restore mesmo se um teste falhou no meio.
    await restoreSnapshot(original);
  });

  test.afterEach(async () => {
    // Cleanup específico após cada teste pra evitar polluir o próximo.
    await restoreSnapshot(original);
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN);
  });

  test('1. Section visível em modo edição após desbloquear AdminTab', async ({ page }) => {
    await unlockAdmin(page);
    const section = locSettingsSection(page);
    await expect(section).toBeVisible({ timeout: 15_000 });
    // Sanity: campo cidade editável (não disabled)
    const cityInput = section.locator('label:has-text("Cidade") + input').first();
    await expect(cityInput).toBeVisible();
    await expect(cityInput).toBeEnabled();
    // Sanity: botão Salvar configurações presente
    await expect(section.getByRole('button', { name: /^Salvar/ }).first()).toBeVisible();
  });

  test('2. Editar Cidade + Salvar persiste valor no DB', async ({ page }) => {
    const testCity = 'PW Test SaveSpec Cidade ' + Date.now();

    await unlockAdmin(page);
    const section = locSettingsSection(page);
    const cityInput = section.locator('label:has-text("Cidade") + input').first();
    await expect(cityInput).toBeVisible({ timeout: 15_000 });

    await cityInput.fill(testCity);
    await expect(cityInput).toHaveValue(testCity);

    await clickSave(page);

    // Validação direto no DB
    const s = getClient();
    const { data, error } = await s
      .from('companies')
      .select('city')
      .eq('id', CARATINGA_ID)
      .single();
    expect(error).toBeNull();
    expect((data as { city: string }).city).toBe(testCity);
  });

  test('3. Editar Endereço completo + Salvar persiste no DB', async ({ page }) => {
    const testAddress =
      'PW Test SaveSpec Rua, 123, Centro, Caratinga — MG ' + Date.now();

    await unlockAdmin(page);
    const section = locSettingsSection(page);
    // Endereço é um textarea (rows=2), label "Endereço completo".
    const addressInput = section
      .locator('label:has-text("Endereço completo") + textarea')
      .first();
    await expect(addressInput).toBeVisible({ timeout: 15_000 });

    await addressInput.fill(testAddress);
    await expect(addressInput).toHaveValue(testAddress);

    await clickSave(page);

    const s = getClient();
    const { data, error } = await s
      .from('companies')
      .select('address_full')
      .eq('id', CARATINGA_ID)
      .single();
    expect(error).toBeNull();
    expect((data as { address_full: string | null }).address_full).toBe(testAddress);
  });

  test('4. Editar Raio (m) pra 250 + Salvar persiste no DB', async ({ page }) => {
    const testRadius = 250;

    await unlockAdmin(page);
    const section = locSettingsSection(page);
    // Raio (m) é o único geo-input editável neste form. Latitude/longitude
    // têm `disabled` — UX é "editar em outra tela" (vide componente).
    const radiusInput = section.locator('label:has-text("Raio (m)") + input').first();
    await expect(radiusInput).toBeVisible({ timeout: 15_000 });

    // Limpa e digita o novo valor — pra `type=number`, fill aceita string.
    await radiusInput.fill(String(testRadius));
    await expect(radiusInput).toHaveValue(String(testRadius));

    await clickSave(page);

    const s = getClient();
    const { data, error } = await s
      .from('companies')
      .select('default_geo_radius')
      .eq('id', CARATINGA_ID)
      .single();
    expect(error).toBeNull();
    expect((data as { default_geo_radius: number }).default_geo_radius).toBe(testRadius);
  });

  test('5. Save NÃO destrói lat/lng (read-only) e persiste schedule editado', async ({ page }) => {
    // Setup: define lat/lng via SQL (UI não permite editar aqui).
    const testLat = -19.7901;
    const testLng = -42.1389;
    await setLatLngDirect(testLat, testLng);

    // CompanyContext só carrega no mount inicial — sem reload, a UI mostra
    // valores cacheados (anteriores ao SQL update acima). Recarrega a página
    // pra forçar re-fetch do context com o novo lat/lng.
    await page.reload();

    await unlockAdmin(page);
    const section = locSettingsSection(page);

    // Verifica que UI carregou os valores injetados (binding DB → state).
    const latInput = section.locator('label:has-text("Latitude") + input').first();
    const lngInput = section.locator('label:has-text("Longitude") + input').first();
    await expect(latInput).toBeVisible({ timeout: 15_000 });
    await expect(lngInput).toBeVisible();
    await expect(latInput).toBeDisabled();
    await expect(lngInput).toBeDisabled();
    await expect(latInput).toHaveValue(String(testLat));
    await expect(lngInput).toHaveValue(String(testLng));

    // Edita um campo editável (segunda-feira da jornada padrão) só pra disparar
    // submit com alteração. Segunda = índice 1 do array default_schedule.
    // Inputs `type=time` aceitam "HH:MM" via fill.
    const mondayInput = section.locator('input[type="time"]').nth(1);
    await expect(mondayInput).toBeVisible();
    await mondayInput.fill('07:30');
    await expect(mondayInput).toHaveValue('07:30');

    await clickSave(page);

    // Valida no DB: schedule[1] = 450 min (7h30); lat/lng intactos.
    const s = getClient();
    const { data, error } = await s
      .from('companies')
      .select('default_geo_lat, default_geo_lng, default_schedule')
      .eq('id', CARATINGA_ID)
      .single();
    expect(error).toBeNull();

    const row = data as {
      default_geo_lat: number;
      default_geo_lng: number;
      default_schedule: number[] | null;
    };
    // lat/lng não estão no payload de handleSubmit — então o UPDATE não toca
    // neles e os valores injetados via SQL permanecem.
    expect(row.default_geo_lat).toBe(testLat);
    expect(row.default_geo_lng).toBe(testLng);

    // Schedule: 7h30 = 7*60 + 30 = 450
    expect(Array.isArray(row.default_schedule)).toBe(true);
    expect((row.default_schedule ?? [])[1]).toBe(450);
  });
});
