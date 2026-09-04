import fs from 'node:fs';
import path from 'node:path';
import { SUITE_START_FILE } from './cleanup';

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
}
