import { test, expect } from '@playwright/test';
import { mockCompanyFacialFlags } from './helpers';

/**
 * Ponto sem CPF (04/09/2026) — Spec smoke da tela nova (FaceIdentifyClock).
 *
 * Mesmo limite da spec 48 (FaceRegistration): sem mock pesado de face-api.js
 * e sem câmera de verdade em ambiente headless, não dá pra provar aqui que o
 * reconhecimento em si acerta o rosto certo (isso já foi validado à parte,
 * direto no servidor, contra descriptors reais do banco — ver checkpoint).
 * O que este smoke prova: a tela abre sozinha (sem pedir CPF primeiro) quando
 * `companies.face_identify_default = true`, o overlay da câmera renderiza sem
 * quebrar a página, e o botão de voltar pro CPF manual funciona.
 *
 * 🔑 NUNCA testa isso ligando a chave via UPDATE no banco de verdade — a
 * suíte já causou incidente real (validação de rosto+geo desligada em
 * produção por minutos, 2x, quando um processo de teste foi morto no meio).
 * Em vez disso, intercepta a resposta da API só para ESTE navegador
 * (mockCompanyFacialFlags) — o banco de produção nunca é tocado.
 */
const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

test.describe('Ponto sem CPF — smoke da tela de reconhecimento', () => {
  test('abre direto na câmera (não pede CPF primeiro) e o botão de CPF manual funciona', async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await mockCompanyFacialFlags(page, CARATINGA_ID, { face_identify_default: true });
    await page.goto('/clock');

    // Prova que o gate montou: título da barra superior da câmera, OU um dos
    // estados de loading/erro (sem câmera real em CI, qualquer um prova que
    // o componente rodou até aqui sem quebrar a página).
    const cameraTitle = page.getByText('Reconhecimento facial — Registro de Ponto');
    const loading = page.getByText(/Preparando reconhecimento/i);
    const cameraError = page.getByText(/Erro na câmera/i);
    await expect(cameraTitle.or(loading).or(cameraError).first()).toBeVisible({ timeout: 30_000 });

    // Não deve ter caído na tela de CPF por padrão.
    await expect(page.getByText('Digite seu CPF')).toHaveCount(0);

    // Botão de alternativa manual — presente em qualquer um dos 3 estados
    // possíveis (loading/scanning mostram sempre; erro tem o próprio botão).
    const useCpfButtons = page.getByRole('button', { name: /CPF/i });
    await expect(useCpfButtons.first()).toBeVisible({ timeout: 10_000 });
    await useCpfButtons.first().click();

    await expect(page.getByText('Digite seu CPF')).toBeVisible({ timeout: 5_000 });
  });
});

/**
 * Confirma que, com `face_identify_default` desligada, NADA muda — a tela
 * continua abrindo em CPF, exatamente como sempre foi. Mockado (não lê o
 * estado real do banco): a Caratinga já está com a chave ligada de verdade
 * em produção, então este teste prova o comportamento da flag em si, não
 * depende de qual empresa está ligada ou desligada hoje.
 */
test('sem a chave ligada, continua pedindo CPF primeiro (comportamento aditivo)', async ({ page }) => {
  await mockCompanyFacialFlags(page, CARATINGA_ID, { face_identify_default: false });
  await page.goto('/clock');
  await expect(page.getByText('Digite seu CPF')).toBeVisible({ timeout: 15_000 });
});
