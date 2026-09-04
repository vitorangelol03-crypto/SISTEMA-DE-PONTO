import fs from 'node:fs';
import path from 'node:path';
import { SUITE_START_FILE, getClient, FACIAL_FLAGS_COMPANIES, FACIAL_FLAGS_FILE } from './cleanup';

/**
 * Registra o timestamp de início da suíte — usado por globalTeardown e pelos
 * afterAll dos specs para identificar "dados criados durante a suíte".
 *
 * Usa uma pequena folga de 1s para trás para evitar race conditions.
 */
export default async function globalSetup() {
  const start = new Date(Date.now() - 1000).toISOString();
  fs.mkdirSync(path.dirname(SUITE_START_FILE), { recursive: true });
  fs.writeFileSync(SUITE_START_FILE, start, 'utf8');
  process.env.PW_SUITE_START = start;

  // 04/09/2026: `require_facial_clock` e `face_identify_default` são reais em
  // produção (Caratinga/Ponte Nova) — a suíte inteira foi escrita ANTES delas
  // existirem e não tem câmera de verdade em CI. Guarda o valor real de cada
  // empresa e desliga os dois durante TODA a suíte; global-teardown.ts
  // restaura. Specs que precisam testar o modo LIGADO (48, 107) ligam de novo
  // sozinhas ao redor de si mesmas — o valor restaurado aqui vira o "original"
  // que elas próprias devolvem depois.
  const s = getClient();
  const { data } = await s.from('companies')
    .select('id, require_facial_clock, face_identify_default')
    .in('id', FACIAL_FLAGS_COMPANIES);
  fs.writeFileSync(FACIAL_FLAGS_FILE, JSON.stringify(data ?? []), 'utf8');
  await s.from('companies')
    .update({ require_facial_clock: false, face_identify_default: false })
    .in('id', FACIAL_FLAGS_COMPANIES);
}
