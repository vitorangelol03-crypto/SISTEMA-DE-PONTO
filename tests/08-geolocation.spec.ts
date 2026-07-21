import { test, expect, Page } from '@playwright/test';
import { getClient } from './cleanup';

const TEST_CPF = '99988877766';
const TEST_PIN = '1234';
const TEST_NAME = 'PW Test Geo Employee';

const VALID_LAT = -19.803105;
const VALID_LON = -42.136271;
const OUTSIDE_LAT = -19.900000;
const OUTSIDE_LON = -42.200000;
// Config REAL de produção: mexer SÓ na linha da Caratinga (o .limit(1) antigo
// pegava uma linha arbitrária — podia escrever coords de Caratinga na config
// de Ponte Nova). Restauração fica no afterAll; se uma bateria for morta no
// meio, conferir/restaurar a config manualmente (raio real: 150m).
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

async function loginEmployee(page: Page) {
  await page.goto('/clock');
  await expect(page.getByText('Registro de Ponto')).toBeVisible();
  const input = page.locator('input[placeholder="000.000.000-00"]');
  await input.fill(TEST_CPF);
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.getByText('Digite seu PIN para continuar')).toBeVisible({ timeout: 15_000 });

  for (const digit of TEST_PIN) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: /Confirmar PIN/ }).click();
  await expect(page.getByText(/Olá,/)).toBeVisible({ timeout: 15_000 });
}

test.describe('Geolocalização (/clock)', () => {
  const supabase = getClient();
  let employeeId: string;
  let originalConfig: Record<string, unknown> | null = null;

  test.beforeAll(async () => {
    // Remove leftover from crashed previous run
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('cpf', TEST_CPF)
      .maybeSingle();

    if (existing) {
      await supabase.from('attendance').delete().eq('employee_id', existing.id);
      await supabase.from('geo_fraud_attempts').delete().eq('employee_id', existing.id);
      await supabase.from('bonus_blocks').delete().eq('employee_id', existing.id);
      await supabase.from('payments').delete().eq('employee_id', existing.id);
      await supabase.from('employees').delete().eq('id', existing.id);
    }

    // Save original config and set test config — SEMPRE a linha da Caratinga
    const { data: geoConfig } = await supabase
      .from('geolocation_config')
      .select('*')
      .eq('company_id', CARATINGA_ID)
      .maybeSingle();

    originalConfig = geoConfig;

    await supabase.from('geolocation_config').upsert([{
      id: geoConfig?.id ?? 'default',
      company_id: CARATINGA_ID,
      latitude: VALID_LAT,
      longitude: VALID_LON,
      allowed_radius_meters: 200,
      block_outside: true,
    }]);

    // Create test employee
    // face_recognition_enabled=false: estes testes focam em geolocalização,
    // não queremos o gate facial interceptando o clique de ponto.
    const { data, error } = await supabase
      .from('employees')
      .insert([{
        name: TEST_NAME,
        cpf: TEST_CPF,
        pin: TEST_PIN,
        pin_configured: true,
        face_recognition_enabled: false,
        created_by: '9999',
      }])
      .select('id')
      .single();
    if (error) throw error;
    employeeId = data.id;
  });

  test.afterAll(async () => {
    if (employeeId) {
      await supabase.from('attendance').delete().eq('employee_id', employeeId);
      await supabase.from('geo_fraud_attempts').delete().eq('employee_id', employeeId);
      await supabase.from('bonus_blocks').delete().eq('employee_id', employeeId);
      await supabase.from('payments').delete().eq('employee_id', employeeId);
      await supabase.from('employees').delete().eq('id', employeeId);
    }
    if (originalConfig) {
      await supabase.from('geolocation_config').upsert([originalConfig]);
    }
  });

  test.beforeEach(async () => {
    if (employeeId) {
      await supabase.from('attendance').delete().eq('employee_id', employeeId);
      await supabase.from('geo_fraud_attempts').delete().eq('employee_id', employeeId);
      await supabase.from('bonus_blocks').delete().eq('employee_id', employeeId);
    }
  });

  test('dentro do raio: ponto registrado com geo_valid=true', async ({ page }) => {
    await page.addInitScript(({ lat, lon }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock de navigator.geolocation requer cast (typing readonly)
      (navigator as any).geolocation.getCurrentPosition = (success: PositionCallback) => {
        success({
          coords: {
            latitude: lat, longitude: lon, accuracy: 10,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      };
    }, { lat: VALID_LAT, lon: VALID_LON });

    await loginEmployee(page);
    await expect(page.getByRole('button', { name: /REGISTRAR ENTRADA/ })).toBeVisible();
    await page.getByRole('button', { name: /REGISTRAR ENTRADA/ }).click();

    await expect(page.getByText(/Entrada registrada/)).toBeVisible({ timeout: 15_000 });

    // Verify DB
    await expect.poll(async () => {
      const { data } = await supabase
        .from('attendance')
        .select('geo_valid, geo_distance_meters')
        .eq('employee_id', employeeId)
        .maybeSingle();
      return data?.geo_valid;
    }, { timeout: 10_000 }).toBe(true);
  });

  test('fora do raio: ponto registrado silenciosamente, fraude registrada server-side', async ({ page }) => {
    await page.addInitScript(({ lat, lon }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock de navigator.geolocation requer cast (typing readonly)
      (navigator as any).geolocation.getCurrentPosition = (success: PositionCallback) => {
        success({
          coords: {
            latitude: lat, longitude: lon, accuracy: 10,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      };
    }, { lat: OUTSIDE_LAT, lon: OUTSIDE_LON });

    await loginEmployee(page);
    await page.getByRole('button', { name: /REGISTRAR ENTRADA/ }).click();

    // No red modal — only generic message (success or error)
    await expect(page.getByText(/Clayton/i)).not.toBeVisible();
    await expect(page.getByText(/Entrada registrada|Erro ao registrar/)).toBeVisible({ timeout: 15_000 });

    // Fraud attempt still logged server-side
    await expect.poll(async () => {
      const { data } = await supabase
        .from('geo_fraud_attempts')
        .select('*')
        .eq('employee_id', employeeId);
      return (data ?? []).length;
    }, { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('permissão negada: coleta silenciosa, sem modal vermelho', async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock de navigator.geolocation requer cast (typing readonly)
      (navigator as any).geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        error({
          code: 1,
          message: 'User denied Geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      };
    });

    await loginEmployee(page);
    await page.getByRole('button', { name: /REGISTRAR ENTRADA/ }).click();

    // Sem modal vermelho/Clayton; desde o fix de 20/07 a tela mostra o MOTIVO
    // real da recusa (antes era "Erro ao registrar" genérico)
    await expect(page.getByText(/Clayton/i)).not.toBeVisible();
    await expect(page.getByText(/Localização não fornecida/)).toBeVisible({ timeout: 15_000 });
  });

  test('erro técnico GPS: envia ao servidor com coords null, sem modal', async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock de navigator.geolocation requer cast (typing readonly)
      (navigator as any).geolocation.getCurrentPosition = (
        _success: PositionCallback,
        error: PositionErrorCallback,
      ) => {
        error({
          code: 3,
          message: 'Timeout',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      };
    });

    await loginEmployee(page);
    await page.getByRole('button', { name: /REGISTRAR ENTRADA/ }).click();

    // Sem modal de geo; desde o fix de 20/07 a tela mostra o MOTIVO real
    await expect(page.getByText(/Localização indisponível/i)).not.toBeVisible();
    await expect(page.getByText(/Clayton/i)).not.toBeVisible();
    await expect(page.getByText(/Localização não fornecida/)).toBeVisible({ timeout: 15_000 });
  });
});
