import { test, expect } from '@playwright/test';
import fs from 'fs';
import { MASTER_2626, loginAs, goToTab } from './helpers';

/**
 * Valida (com clique real) o fix do espelho PDF: as linhas Descontos/Vales — que
 * saíam corrompidas por causa do caractere − (U+2212) — agora saem legíveis.
 * Gera o espelho de um driver pela tela, intercepta o PDF baixado e confirma que
 * NÃO há bytes nulos (assinatura do UTF-16 corrompido) e que os valores em R$
 * aparecem legíveis.
 */

/** Extrai os textos dos operadores Tj/TJ de um PDF do jsPDF (não comprimido). */
function pdfTexts(buf: Buffer): string[] {
  const s = buf.toString('latin1');
  const out: string[] = [];
  const re = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const raw = m[1] != null ? m[1] : m[2];
    const pieces = (raw.match(/\(((?:[^()\\]|\\.)*)\)/g) || [raw]).map((p) => p.replace(/^\(|\)$/g, ''));
    out.push(pieces.join(''));
  }
  return out;
}

/** true se a string contém um byte nulo (0x00) — assinatura do UTF-16 corrompido. */
function hasNullByte(t: string): boolean {
  for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 0) return true;
  return false;
}

test.describe('Pagamentos Driver — espelho PDF sem lixo (fix U+2212)', () => {
  test.use({ navigationTimeout: 120_000, actionTimeout: 30_000 });
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MASTER_2626);
  });

  test('espelho individual: Descontos/Vales saem legíveis, sem bytes corrompidos', async ({ page }) => {
    await goToTab(page, 'Pagamentos Driver');
    await expect(page.getByText(/TOTAL GERAL/i).first()).toBeVisible({ timeout: 25_000 });

    // ícone de espelho da 1ª linha (title "Ver / gerar espelho")
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.getByRole('button', { name: /gerar espelho/i }).click();

    // dialog abre → "Gerar PDF" dispara o download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: /Gerar PDF/i }).click(),
    ]);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const buf = fs.readFileSync(filePath!);
    const texts = pdfTexts(buf);
    const joined = texts.join('\n');

    // 1) há valores em R$ legíveis (ASCII contíguo)
    expect(joined).toMatch(/R\$/);
    // 2) há uma quantia "0,00" legível (as linhas Desconto/Vale deste driver são 0)
    expect(joined).toMatch(/0,00/);
    // 3) NENHUM texto com byte nulo — assinatura do UTF-16 corrompido do bug antigo
    const corrupted = texts.filter(hasNullByte);
    expect(corrupted, `textos corrompidos: ${corrupted.length}`).toHaveLength(0);

    // eslint-disable-next-line no-console
    console.log(`ESPELHO OK — ${texts.length} blocos de texto, 0 corrompidos; contém "R$" e "0,00".`);
  });
});
