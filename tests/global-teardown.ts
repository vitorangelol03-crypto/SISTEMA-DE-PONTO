import fs from 'node:fs';
import { cleanupAllTestArtifacts, readSuiteStart, SUITE_START_FILE, getClient, FACIAL_FLAGS_FILE } from './cleanup';

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
    // Restaura require_facial_clock/face_identify_default pro valor REAL de
    // produção (ver global-setup.ts) — SEMPRE, mesmo se a limpeza abaixo falhar.
    try {
      if (fs.existsSync(FACIAL_FLAGS_FILE)) {
        const original = JSON.parse(fs.readFileSync(FACIAL_FLAGS_FILE, 'utf8')) as Array<{
          id: string; require_facial_clock: boolean | null; face_identify_default: boolean | null;
        }>;
        const s = getClient();
        for (const row of original) {
          await s.from('companies').update({
            require_facial_clock: row.require_facial_clock ?? false,
            face_identify_default: row.face_identify_default ?? false,
          }).eq('id', row.id);
        }
        fs.unlinkSync(FACIAL_FLAGS_FILE);
      }
    } catch (err) {

      console.error('[cleanup] Falha ao restaurar require_facial_clock/face_identify_default:', err);
    }

    await cleanupAllTestArtifacts(since);
     
    console.log(`\n[cleanup] Artefatos de teste removidos (desde ${since})`);
     
    console.log(`[cleanup] Cleanup executado. Dados de ${today} foram PRESERVADOS.`);
  } catch (err) {
     
    console.error('[cleanup] Falha ao limpar artefatos de teste:', err);
  } finally {
    try { fs.unlinkSync(SUITE_START_FILE); } catch { /* noop */ }
  }
}
