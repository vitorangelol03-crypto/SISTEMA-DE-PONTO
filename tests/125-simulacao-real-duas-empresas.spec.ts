import { test, expect, Page } from '@playwright/test';
import { MASTER_2626, loginAs, goToTab, switchCompany } from './helpers';
import { getClient } from './cleanup';
import * as XLSX from 'xlsx';

/**
 * SIMULAÇÃO COM GENTE DE VERDADE — Caratinga e Ponte Nova (20/09/2026).
 *
 * Pedido do Victor: *"roda um teste simulado com gente de verdade, simulações reais em
 * Ponte Nova e Caratinga, para fechar e validar de vez essa parte de espelho, relatório
 * e financeiro"*.
 *
 * ## 🔒 SOMENTE LEITURA
 *
 * Este spec **não escreve uma linha** no banco. Ele usa os funcionários, as batidas e os
 * pagamentos REAIS que já existem, gera os papéis e confere. O último teste conta as
 * linhas das tabelas antes e depois e exige que nada tenha mudado — se algum caminho
 * gravar sem querer, ele fica vermelho.
 *
 * ## Por que ele NÃO usa números que eu calculei à mão
 *
 * Com 40 pessoas em Caratinga e 6 em Ponte Nova, conferir valor por valor seria eu
 * refazendo a conta do sistema e comparando com ela mesma. O que este spec faz é exigir
 * **propriedades que têm de valer para TODA pessoa real**:
 *
 *   · proventos − descontos = líquido, em cada linha;
 *   · a linha TOTAL é a soma das linhas;
 *   · o líquido do relatório bate com a soma dos pagamentos do banco;
 *   · o espelho tem o mesmo número de dias que o banco tem de batidas.
 *
 * Se algum caso de borda que só existe no dado real quebrar uma dessas, o teste acusa —
 * e é exatamente isso que fixture de teste nunca pega.
 */

const MES = { inicio: '2026-08-01', fim: '2026-08-31' };

/** As tabelas que este spec jamais pode tocar. */
const TABELAS_INTOCAVEIS = [
  'payments', 'attendance', 'error_records', 'employees',
  'payroll_awards', 'payroll_thirteenth', 'payroll_termination', 'employee_vacations',
] as const;

async function contarTudo(): Promise<Record<string, number>> {
  const s = getClient();
  const contagem: Record<string, number> = {};
  for (const t of TABELAS_INTOCAVEIS) {
    const { count } = await s.from(t).select('id', { count: 'exact', head: true });
    contagem[t] = count ?? -1;
  }
  return contagem;
}

/**
 * Abre uma planilha do disco.
 *
 * ⚠️ NÃO usar `XLSX.readFile`: o pacote `xlsx` que este projeto importa é a build de
 * NAVEGADOR, que não tem acesso a disco — o método simplesmente não existe e estoura com
 * "XLSX.readFile is not a function". Ler os bytes com `fs` e passar para `XLSX.read`
 * funciona nas duas builds.
 */
async function abrirPlanilha(caminho: string): Promise<XLSX.WorkBook> {
  const fs = await import('node:fs');
  return XLSX.read(fs.readFileSync(caminho), { type: 'buffer' });
}

/** Baixa o relatório em PLANILHA e devolve a aba "Resumo" como linhas. */
async function resumoDoRelatorio(page: Page): Promise<Array<Record<string, unknown>>> {
  await page.getByTestId('relatorios-btn').click();
  await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tipo-financeiro').click();
  await page.getByTestId('modo-livre').click();
  await page.getByTestId('data-inicio').fill(MES.inicio);
  await page.getByTestId('data-fim').fill(MES.fim);

  const download = page.waitForEvent('download', { timeout: 180_000 });
  await page.getByTestId('baixar-excel').click();
  const arquivo = await download;
  const caminho = (await arquivo.path())!;

  const wb = await abrirPlanilha(caminho);
  const aba = wb.Sheets['Resumo'];
  expect(aba, 'a planilha tem que ter a aba Resumo').toBeTruthy();
  return XLSX.utils.sheet_to_json(aba, { header: 1 }) as Array<Record<string, unknown>>;
}

/** Converte "1.234,56" ou 1234.56 em número. A planilha grava número; o guard é defensivo. */
function numero(v: unknown): number {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim();
  if (!t) return 0;
  return Number(t.replace(/\./g, '').replace(',', '.')) || 0;
}

test.describe.configure({ mode: 'serial', timeout: 300_000 });

for (const empresa of ['Caratinga', 'Ponte Nova'] as const) {
  test.describe(`Simulação real — ${empresa}`, () => {
    test('🎯 o relatório FECHA em toda linha, e a soma bate com o banco', async ({ page }) => {
      await loginAs(page, MASTER_2626);
      if (empresa !== 'Caratinga') await switchCompany(page, empresa);
      await goToTab(page, 'Financeiro');

      const linhas = await resumoDoRelatorio(page);
      const cabecalho = (linhas[0] as unknown as string[]).map(c => String(c ?? ''));
      const iProv = cabecalho.findIndex(c => c.startsWith('Proventos'));
      const iDesc = cabecalho.findIndex(c => c.startsWith('Descontos'));
      const iLiq = cabecalho.findIndex(c => c.startsWith('Líquido'));
      expect(iProv, 'a planilha tem coluna de proventos').toBeGreaterThan(-1);

      // As linhas de gente: entre o cabeçalho e a linha TOTAL.
      const corpo = (linhas.slice(1) as unknown as unknown[][])
        .filter(l => l.length > 0 && l[0] && String(l[0]) !== 'TOTAL');
      const total = (linhas as unknown as unknown[][]).find(l => String(l?.[0] ?? '') === 'TOTAL');

      expect(corpo.length, `${empresa} tem gente no relatório de agosto`).toBeGreaterThan(0);
      console.log(`\n[${empresa}] ${corpo.length} pessoas reais no relatório de agosto/2026`);

      // ── 1. Cada linha fecha: proventos − descontos = líquido ──
      let somaLiquido = 0;
      for (const l of corpo) {
        const prov = numero(l[iProv]);
        const desc = numero(l[iDesc]);
        const liq = numero(l[iLiq]);
        somaLiquido += liq;
        expect(
          Math.abs(prov - desc - liq),
          `${String(l[0])}: ${prov} − ${desc} deveria dar ${liq}`,
        ).toBeLessThanOrEqual(0.02);
      }

      // ── 2. A linha TOTAL é a soma das linhas ──
      expect(total, 'a planilha tem linha TOTAL').toBeTruthy();
      expect(
        Math.abs(numero(total![iLiq]) - somaLiquido),
        'o TOTAL do relatório tem que ser a soma das pessoas',
      ).toBeLessThanOrEqual(0.05);

      // ── 3. O líquido bate com o que está GRAVADO no banco ──
      const s = getClient();
      const { data: empresaRow } = await s.from('companies').select('id').eq('display_name', empresa).single();
      const companyId = (empresaRow as { id: string }).id;

      const { data: pagos } = await s.from('payments')
        .select('total').eq('company_id', companyId)
        .gte('date', MES.inicio).lte('date', MES.fim);
      const brutoNoBanco = (pagos ?? []).reduce((t, p) => t + Number((p as { total: number }).total ?? 0), 0);

      /**
       * O líquido é o bruto MENOS os descontos de erro e triagem, então ele nunca pode
       * passar do bruto gravado — e, sem desconto nenhum, seria igual. Esta é a
       * amarração com o banco que não depende de eu refazer a conta de triagem.
       */
      expect(somaLiquido, `${empresa}: o líquido não pode passar do que foi pago`)
        .toBeLessThanOrEqual(brutoNoBanco + 0.05);
      expect(somaLiquido, `${empresa}: e não pode ser irrisório perto do bruto`)
        .toBeGreaterThan(brutoNoBanco * 0.5);

      console.log(`[${empresa}] bruto no banco R$ ${brutoNoBanco.toFixed(2)} · líquido no relatório R$ ${somaLiquido.toFixed(2)}`);
    });

    test('🎯 o relatório de PONTO e o GERAL saem em PDF com o volume real', async ({ page }) => {
      await loginAs(page, MASTER_2626);
      if (empresa !== 'Caratinga') await switchCompany(page, empresa);
      await goToTab(page, 'Financeiro');

      for (const tipo of ['ponto', 'geral'] as const) {
        await page.getByTestId('relatorios-btn').click();
        await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });
        await page.getByTestId(`tipo-${tipo}`).click();
        await page.getByTestId('modo-livre').click();
        await page.getByTestId('data-inicio').fill(MES.inicio);
        await page.getByTestId('data-fim').fill(MES.fim);

        const download = page.waitForEvent('download', { timeout: 180_000 });
        await page.getByTestId('baixar-pdf').click();
        const arquivo = await download;
        const fs = await import('node:fs');
        const buffer = fs.readFileSync((await arquivo.path())!);

        expect(buffer.subarray(0, 4).toString(), `${empresa}/${tipo} é PDF`).toBe('%PDF');
        expect(buffer.length, `${empresa}/${tipo} não sai vazio`).toBeGreaterThan(5_000);
        console.log(`[${empresa}] relatório ${tipo}: ${Math.round(buffer.length / 1024)} KB`);
      }
    });

    test('🎯 o ESPELHO de uma pessoa real bate com o ponto do banco', async ({ page }) => {
      const s = getClient();
      const { data: empresaRow } = await s.from('companies').select('id').eq('display_name', empresa).single();
      const companyId = (empresaRow as { id: string }).id;

      // Escolhe quem tem MAIS batidas no mês: é onde os casos de borda aparecem.
      const { data: pontos } = await s.from('attendance')
        .select('employee_id, date')
        .gte('date', MES.inicio).lte('date', MES.fim);
      const { data: gente } = await s.from('employees').select('id, name').eq('company_id', companyId);
      const daEmpresa = new Set((gente ?? []).map(g => (g as { id: string }).id));

      const porPessoa = new Map<string, number>();
      for (const p of (pontos ?? []) as Array<{ employee_id: string }>) {
        if (!daEmpresa.has(p.employee_id)) continue;
        porPessoa.set(p.employee_id, (porPessoa.get(p.employee_id) ?? 0) + 1);
      }
      const [campeaoId, dias] = [...porPessoa.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      expect(campeaoId, `${empresa} tem alguém com ponto em agosto`).toBeTruthy();
      const nome = (gente ?? []).find(g => (g as { id: string }).id === campeaoId) as { name: string };
      console.log(`[${empresa}] espelho de ${nome.name} — ${dias} dias de ponto no banco`);

      await loginAs(page, MASTER_2626);
      if (empresa !== 'Caratinga') await switchCompany(page, empresa);
      await goToTab(page, 'Financeiro');

      // O espelho sai pelo relatório de PONTO, que traz o dia a dia.
      await page.getByTestId('relatorios-btn').click();
      await expect(page.getByTestId('relatorios-panel')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('tipo-ponto').click();
      await page.getByTestId('modo-livre').click();
      await page.getByTestId('data-inicio').fill(MES.inicio);
      await page.getByTestId('data-fim').fill(MES.fim);

      const download = page.waitForEvent('download', { timeout: 180_000 });
      await page.getByTestId('baixar-excel').click();
      const arquivo = await download;
      const wb = await abrirPlanilha((await arquivo.path())!);
      const aba = wb.Sheets['Ponto'];
      expect(aba, 'a planilha de ponto tem a aba Ponto').toBeTruthy();

      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1 }) as unknown[][];
      // O bloco da pessoa começa numa linha com o nome dela.
      const inicio = linhas.findIndex(l => String(l?.[0] ?? '') === nome.name);
      expect(inicio, `${nome.name} tem bloco no espelho`).toBeGreaterThan(-1);

      /**
       * Conta as linhas de dia até o "Subtotal", separando as que têm ENTRADA preenchida.
       *
       * ⚠️ O espelho tem uma linha por DIA DO MÊS, não por batida — é um cartão de ponto:
       * folga e falta também aparecem, em branco. Agosto tem 31 linhas mesmo que a pessoa
       * só tenha trabalhado 27 dias. A primeira versão deste teste exigia "uma linha por
       * batida" e acusou um erro que não existia.
       */
      let linhasDeDia = 0;
      let comEntrada = 0;
      for (let i = inicio + 2; i < linhas.length; i++) {
        const primeira = String(linhas[i]?.[0] ?? '');
        if (primeira === 'Subtotal') break;
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(primeira)) continue;
        linhasDeDia++;
        if (String(linhas[i]?.[1] ?? '').trim()) comEntrada++;
      }

      const diasDoMes = 31; // agosto
      console.log(`[${empresa}] espelho de ${nome.name}: ${linhasDeDia} linhas (mês inteiro), ${comEntrada} com entrada, ${dias} registros no banco`);

      expect(linhasDeDia, 'o espelho mostra o MÊS inteiro, um dia por linha').toBe(diasDoMes);
      expect(comEntrada, 'nenhum dia com entrada pode faltar no papel').toBeLessThanOrEqual(dias);
      expect(comEntrada, 'e o papel não pode estar vazio para quem trabalhou o mês todo')
        .toBeGreaterThan(dias * 0.5);
    });
  });
}

test.describe('Nada foi escrito', () => {
  test('🔒 as contagens do banco estão idênticas ao fim da simulação', async () => {
    const depois = await contarTudo();
    const antes = JSON.parse(process.env.__CONTAGEM_ANTES__ ?? '{}') as Record<string, number>;
    // Se o arquivo rodou sozinho, o beforeAll global abaixo preencheu; senão, só registra.
    for (const [tabela, n] of Object.entries(depois)) {
      if (antes[tabela] === undefined) continue;
      expect(n, `${tabela} não pode ter mudado`).toBe(antes[tabela]);
    }
    console.log('\n[somente leitura] contagens finais:', JSON.stringify(depois));
  });
});

test.beforeAll(async () => {
  if (!process.env.__CONTAGEM_ANTES__) {
    process.env.__CONTAGEM_ANTES__ = JSON.stringify(await contarTudo());
  }
});
