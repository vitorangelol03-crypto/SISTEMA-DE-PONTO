import fs from 'node:fs';
import { cleanupAllTestArtifacts, readSuiteStart, SUITE_START_FILE } from './cleanup';

/**
 * Ao final da suíte inteira, apaga TODO e qualquer dado sujo que tenha sido
 * criado pelos testes. Redundante com afterAll dos specs — é um seguro extra.
 */
export default async function globalTeardown() {
  const since = readSuiteStart();
  try {
    await cleanupAllTestArtifacts(since);
    // eslint-disable-next-line no-console
    console.log(`\n[cleanup] Artefatos de teste removidos (desde ${since})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cleanup] Falha ao limpar artefatos de teste:', err);
  } finally {
    try { fs.unlinkSync(SUITE_START_FILE); } catch { /* noop */ }
  }
}
