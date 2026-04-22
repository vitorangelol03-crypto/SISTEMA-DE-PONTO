import fs from 'node:fs';
import { cleanupAllTestArtifacts, readSuiteStart, SUITE_START_FILE } from './cleanup';

/**
 * Ao final da suíte inteira, apaga TODO e qualquer dado sujo que tenha sido
 * criado pelos testes. Redundante com afterAll dos specs — é um seguro extra.
 *
 * ⚠️ PROTEÇÃO: os registros cuja coluna `date` seja o dia atual em BRT são
 * sempre preservados. A limpeza de dados do dia atual pertencentes a
 * funcionários de teste é feita via deleteTestEmployees() (escopada por
 * prefixo PW Test).
 */
export default async function globalTeardown() {
  const since = readSuiteStart();
  const today = new Date().toLocaleDateString('pt-BR');
  try {
    await cleanupAllTestArtifacts(since);
    // eslint-disable-next-line no-console
    console.log(`\n[cleanup] Artefatos de teste removidos (desde ${since})`);
    // eslint-disable-next-line no-console
    console.log(`[cleanup] Cleanup executado. Dados de ${today} foram PRESERVADOS.`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cleanup] Falha ao limpar artefatos de teste:', err);
  } finally {
    try { fs.unlinkSync(SUITE_START_FILE); } catch { /* noop */ }
  }
}
