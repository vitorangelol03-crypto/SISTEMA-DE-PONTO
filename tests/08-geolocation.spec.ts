import { test, expect, Page } from '@playwright/test';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { criarEmpresaDeTeste, apagarEmpresaDeTeste } from './integrity-helpers';

/**
 * Geolocalização na batida de ponto (/clock) — dentro/fora do raio, GPS negado e GPS com erro.
 *
 * 🔴 30/09/2026 — REFEITO NUMA EMPRESA DE TESTE (Victor: "sim pode com cuidado").
 * Antes, este spec trocava a cerca REAL de Caratinga (`geolocation_config`, que o servidor usa
 * na batida) no beforeAll e só devolvia no afterAll: durante ~3 min, o ponto de verdade de
 * Caratinga era conferido contra a cerca do teste — e um teste morto no meio deixava a cerca
 * errada. E desde que a facial ficou obrigatória em Caratinga, ele falhava de qualquer jeito
 * (funcionário sem rosto → "Cadastre o rosto para bater ponto"), igual no código antigo e no novo.
 *
 * Agora: uma empresa nova, só deste teste, com a MESMA cerca que o teste sempre usou (centro em
 * VALID_LAT/VALID_LON, raio 200m, bloqueia fora) e sem facial obrigatória — o que se testa aqui é
 * a localização. Apagada no fim (`apagarEmpresaDeTeste` só apaga empresa com "PW Test" no nome).
 */

const TEST_CPF = '99988877766';
const TEST_PIN = '1234';
const TEST_NAME = 'PW Test Geo Employee';
const EMPRESA_NOME = `${TEST_EMPLOYEE_NAME_PREFIX}Geo ${Date.now().toString(36)}`;
const CHAVE_EMPRESA = 'sistema_ponto_company_id';

const VALID_LAT = -19.803105;
const VALID_LON = -42.136271;
const OUTSIDE_LAT = -19.900000;
const OUTSIDE_LON = -42.200000;

let empresaId = '';

async function loginEmployee(page: Page) {
  // A tela abre direto na empresa de teste (que não abre na câmera): cai no CPF.
  await page.addInitScript(({ chave, empresa }) => { localStorage.setItem(chave, empresa); }, { chave: CHAVE_EMPRESA, empresa: empresaId });
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

    empresaId = await criarEmpresaDeTeste(EMPRESA_NOME, { lat: VALID_LAT, lng: VALID_LON, raio: 200 });

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
        company_id: empresaId,
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
    if (empresaId) await apagarEmpresaDeTeste(empresaId);
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

  // 05/10/2026 (decisão do Victor): antes a tela mostrava "✅ Entrada registrada" — a pessoa nunca
  // ficava sabendo que bateu fora da área (uma bateu 12 noites seguidas assim). Agora o ponto
  // continua gravado (e a fraude anotada no servidor), mas a tela AVISA em amarelo.
  test('fora do raio: ponto registrado COM AVISO de fora da área, fraude registrada server-side', async ({ page }) => {
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

    // Sem modal vermelho; o aviso diz que foi gravada FORA da área (e não um "✅" de tudo certo).
    await expect(page.getByText(/Clayton/i)).not.toBeVisible();
    // No CELULAR (este teste não é tablet) a tela volta em 35s, como sempre — só o tablet volta mais rápido.
    await expect(page.getByText(/⚠️ Entrada registrada às \d{2}:\d{2} FORA da área permitida \(\d+ m\) — avise o supervisor · a tela volta ao início em 35s/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^✅ Entrada registrada/)).toHaveCount(0);

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
    // No CELULAR o erro continua SEM volta automática (05/10/2026: só o tablet volta sozinho no erro).
    await expect(page.getByText(/a tela volta ao início/)).toHaveCount(0);
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
