#!/usr/bin/env node
/**
 * Backup snapshot Caratinga — exporta dados core pra arquivo JSON.
 *
 * Uso:
 *   node scripts/backup-caratinga.mjs
 *   → cria backups/caratinga-YYYY-MM-DD-HHMMSS.json
 *
 * Tabelas exportadas (todas filtradas por company_id = Caratinga):
 *   employees, attendance, payments, bonus_types, bonus_removals,
 *   error_records, payment_periods, geolocation_config, users (CT scope),
 *   payment_period_config, face_recognition_config, monitoring_settings
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY em .env (bypassa RLS).
 *
 * Output: ~5-10 MB JSON dependendo do volume.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CARATINGA_ID = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

function readEnv() {
  const envPath = '.env';
  if (!existsSync(envPath)) {
    console.error('❌ .env not found. Run from project root.');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = readEnv();
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const TABLES_BY_COMPANY = [
  'employees', 'attendance', 'payments', 'bonus_types', 'bonus_removals',
  'error_records', 'payment_periods', 'geolocation_config',
  'payment_period_config', 'face_recognition_config', 'monitoring_settings',
];

const TABLES_GLOBAL_FILTERED = {
  users: { col: 'company_id', val: CARATINGA_ID },
};

async function dumpTable(name, filter) {
  // PostgREST default limit é 1000 — pagina pra pegar tudo
  const allRows = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const query = sb.from(name).select('*').range(offset, offset + pageSize - 1);
    if (filter?.col && filter?.val) query.eq(filter.col, filter.val);
    const { data, error } = await query;
    if (error) {
      console.warn(`⚠️  ${name}: ${error.message}`);
      return { error: error.message, count: allRows.length, rows: allRows };
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return { count: allRows.length, rows: allRows };
}

async function main() {
  console.log('📦 Backup Caratinga starting...');

  const backup = {
    metadata: {
      created_at: new Date().toISOString(),
      company_id: CARATINGA_ID,
      company_name: 'Caratinga (CLAYTON B DOS SANTOS)',
      project_id: 'flcncdidxmmornkgkfbb',
      script: 'scripts/backup-caratinga.mjs',
    },
    tables: {},
  };

  // Tabelas com filtro company_id direto
  for (const table of TABLES_BY_COMPANY) {
    const result = await dumpTable(table, { col: 'company_id', val: CARATINGA_ID });
    backup.tables[table] = result;
    console.log(`  ✓ ${table}: ${result.count} rows`);
  }

  // Tabelas com filtro alternativo
  for (const [table, filter] of Object.entries(TABLES_GLOBAL_FILTERED)) {
    const result = await dumpTable(table, filter);
    backup.tables[table] = result;
    console.log(`  ✓ ${table} (${filter.col}=${filter.val.slice(0, 8)}...): ${result.count} rows`);
  }

  // Total rows
  const total = Object.values(backup.tables).reduce((s, t) => s + (t.count ?? 0), 0);
  backup.metadata.total_rows = total;

  // Filename: backups/caratinga-2026-05-14-153000.json
  const dir = 'backups';
  if (!existsSync(dir)) mkdirSync(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const filename = join(dir, `caratinga-${ts}.json`);

  writeFileSync(filename, JSON.stringify(backup, null, 2));
  const sizeMB = (Buffer.byteLength(JSON.stringify(backup)) / 1024 / 1024).toFixed(2);

  console.log('');
  console.log(`✅ Backup criado: ${filename}`);
  console.log(`   Tabelas: ${Object.keys(backup.tables).length}`);
  console.log(`   Rows: ${total}`);
  console.log(`   Tamanho: ${sizeMB} MB`);
}

main().catch((err) => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
