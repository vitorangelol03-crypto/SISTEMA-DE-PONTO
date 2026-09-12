import { test, expect } from '@playwright/test';
import { getClient, TEST_EMPLOYEE_NAME_PREFIX } from './cleanup';
import { validateCPF } from '../src/utils/validation';
import { irAoCampoDeCpfDoPonto, mockFacialFlagsOff } from './helpers';

/**
 * E2E — PIN do funcionário sobrevive a uma sessão nova (26/08, fix de incidente):
 *
 * Achado: a migração de 14/05 converteu o PIN de 70 funcionários pra bcrypt
 * (pin_hash) e zerou o campo pin (texto puro) — mas a ação verify-pin da
 * employee-public-api só comparava com o pin (texto puro). Resultado: TODO
 * funcionário que já tinha PIN configurado ficava travado com "PIN incorreto",
 * mesmo digitando certo — ninguém bateu ponto no dia em que isso foi notado.
 * Nenhum E2E existente pegava isso porque os specs de PIN escrevem o PIN
 * direto no banco via SQL (bypassa a edge function) e o 78 (cadastro público)
 * para no passo "criar senha", sem nunca testar uma sessão NOVA validando o
 * mesmo PIN de novo.
 *
 * O que este teste prova, ponta a ponta, no navegador real:
 *   1) primeiro acesso cria o PIN (setup-pin) → grava pin_hash bcrypt, pin fica NULL;
 *   2) numa sessão NOVA (reload), o MESMO PIN é aceito (verify-pin via bcrypt);
 *   3) PIN errado nessa sessão nova continua sendo recusado.
 */

const RUN = Date.now().toString(36);
const NOME = `${TEST_EMPLOYEE_NAME_PREFIX}PinBcrypt ${RUN}`;
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PIN_CERTO = '4321';
const PIN_ERRADO = '9999';

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

const CPF = validCpf(Date.now() + 13);

async function digitarPin(page: import('@playwright/test').Page, pin: string) {
  for (const d of pin) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
}

test.describe('PIN do funcionário — bcrypt sobrevive a sessão nova', () => {
  test.beforeAll(() => {
    expect(validateCPF(CPF)).toBe(true);
  });

  test('cria PIN, sessão nova aceita o PIN certo e recusa o errado', async ({ page }) => {
    // set-pin/verify-pin chamam bcryptjs — cold-start da edge fn pode levar até
    // ~150s no pior caso (mesmo motivo do timeout do tests/unit/edgeFnEmployeePublicApi).
    test.setTimeout(240_000);
    const supabase = getClient();
    let employeeId: string | null = null;

    try {
      const { data: emp, error } = await supabase
        .from('employees')
        .insert([{
          name: NOME,
          cpf: CPF,
          employment_type: 'Carteira Assinada',
          created_by: '9999',
          company_id: CARATINGA_ID,
          // Caratinga tem reconhecimento facial ligado globalmente; desliga só
          // neste funcionário de teste pra não cair no gate facial (câmera
          // não existe no Chromium headless — mesma limitação do tests/48).
          face_recognition_enabled: false,
        }])
        .select('id')
        .single();
      if (error || !emp) throw new Error(`Falha ao criar funcionário de teste: ${error?.message}`);
      employeeId = (emp as { id: string }).id;

      // ── 1) Primeiro acesso: cria o PIN ──
      /* 🔴 Desliga a facial SÓ NESTE NAVEGADOR (12/09/2026).

         Este teste é sobre o PIN em bcrypt — facial não tem nada a ver com ele.
         Mas Caratinga tem reconhecimento facial ligado, e desde `cad2c39`
         (04/09) o `/clock` entra no cadastro de rosto depois do PIN. Com a
         câmera FALSA ligada (12/09) o stream existe — "stream: ativo, 640x480" —
         mas o que ela transmite é um padrão colorido, não um rosto: a tela fica
         eternamente em "🔍 Procurando rosto...".

         `mockFacialFlagsOff` intercepta a resposta da tabela `companies` só
         nesta aba (é `page.route`, não banco): a empresa de verdade não muda.
         Mesma técnica que os specs 62 e 107 já usam.
      */
      await mockFacialFlagsOff(page, [CARATINGA_ID]);
      await page.goto('/clock');
      await (await irAoCampoDeCpfDoPonto(page)).fill(CPF);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText('Criar sua senha de acesso')).toBeVisible({ timeout: 10_000 });

      await digitarPin(page, PIN_CERTO);
      await page.getByRole('button', { name: 'Próximo' }).click();
      await digitarPin(page, PIN_CERTO);
      await page.getByRole('button', { name: 'Salvar senha' }).click();

      // Setup concluído entra direto no dashboard (sem repetir o PIN).
      // Marcador ÚNICO do dashboard: "Olá, Nome" também aparece no header dos
      // passos pin/setup-pin — usar só esse texto daria falso-positivo se
      // handleSavePin falhar e a tela ficar parada no setup-pin.
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible({ timeout: 180_000 });

      const { data: afterSetup } = await supabase
        .from('employees')
        .select('pin, pin_hash, pin_configured')
        .eq('id', employeeId)
        .single();
      expect(afterSetup?.pin).toBeNull();
      expect(afterSetup?.pin_hash).toMatch(/^\$2/);
      expect(afterSetup?.pin_configured).toBe(true);

      // ── 2) Sessão NOVA (reload real) — PIN ERRADO é recusado ──
      await mockFacialFlagsOff(page, [CARATINGA_ID]);
      await page.goto('/clock');
      await (await irAoCampoDeCpfDoPonto(page)).fill(CPF);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText('Digite seu PIN para continuar')).toBeVisible({ timeout: 10_000 });
      await digitarPin(page, PIN_ERRADO);
      await page.getByRole('button', { name: 'Confirmar PIN' }).click();
      await expect(page.getByText(/PIN incorreto/i)).toBeVisible({ timeout: 180_000 });

      // ── 3) Sessão NOVA de novo — o MESMO PIN certo é aceito (prova o fix) ──
      await mockFacialFlagsOff(page, [CARATINGA_ID]);
      await page.goto('/clock');
      await (await irAoCampoDeCpfDoPonto(page)).fill(CPF);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page.getByText('Digite seu PIN para continuar')).toBeVisible({ timeout: 10_000 });
      await digitarPin(page, PIN_CERTO);
      await page.getByRole('button', { name: 'Confirmar PIN' }).click();
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible({ timeout: 180_000 });
    } finally {
      if (employeeId) {
        await supabase.from('attendance').delete().eq('employee_id', employeeId);
        await supabase.from('employees').delete().eq('id', employeeId);
      }
    }
  });
});
