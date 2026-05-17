#!/usr/bin/env node
/**
 * Backup snapshot de TODAS as empresas — exporta dados core por company_id.
 *
 * Generalização do backup-caratinga.mjs (sub-fase 16.5): em vez de hardcode
 * pra Caratinga, itera por TODAS as companies no DB e gera 1 arquivo
 * `backups/all-YYYY-MM-DD-HHMMSS.json` com snapshot completo.
 *
 * Uso:
 *   node scripts/backup-all.mjs
 *   → cria backups/all-YYYY-MM-DD-HHMMSS.json
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY em .env (bypassa RLS pra ler todas as
 * empresas independente do JWT).
 *
 * Output: ~10-30 MB JSON dependendo do volume (todas empresas).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
  'bonuses', 'bonus_blocks', 'error_records', 'payment_periods',
  'geolocation_config', 'payment_period_config', 'face_recognition_config',
  'monitoring_settings', 'users', 'user_permissions',
  'admin_cleanup_config', 'bank_hours_application_log', 'bank_hours_overrides',
  'face_auth_attempts', 'geo_fraud_attempts',
  'triage_distribution_employees', 'triage_error_distributions', 'triage_errors',
];

const TABLES_GLOBAL = ['companies', 'feature_versions'];

async function dumpTable(name, filter = null) {
  const allRows = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    let query = sb.from(name).select('*').range(offset, offset + pageSize - 1);
    if (filter?.col && filter?.val !== undefined) query = query.eq(filter.col, filter.val);
    const { data, error } = await query;
    if (error) {
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
  console.log('📦 Backup TODAS empresas starting...');

  const { data: companies, error: cErr } = await sb
    .from('companies')
    .select('id, display_name, legal_name');
  if (cErr) {
    console.error('❌ Falha ao listar companies:', cErr.message);
    process.exit(1);
  }

  const backup = {
    metadata: {
      created_at: new Date().toISOString(),
      project_id: 'flcncdidxmmornkgkfbb',
      script: 'scripts/backup-all.mjs',
      companies: companies.map((c) => ({ id: c.id, name: c.display_name || c.legal_name })),
    },
    companies_data: {},
    global: {},
  };

  // Tabelas global (companies, feature_versions)
  console.log('📋 Tabelas globais:');
  for (const table of TABLES_GLOBAL) {
    const result = await dumpTable(table);
    backup.global[table] = result;
    console.log(`  ✓ ${table}: ${result.count} rows`);
  }

  // Por empresa
  for (const company of companies) {
    const name = company.display_name || company.legal_name;
    console.log(`\n🏢 ${name} (${company.id.slice(0, 8)}...):`);
    backup.companies_data[company.id] = {
      meta: { name, legal_name: company.legal_name },
      tables: {},
    };
    for (const table of TABLES_BY_COMPANY) {
      const result = await dumpTable(table, { col: 'company_id', val: company.id });
      backup.companies_data[company.id].tables[table] = result;
      console.log(`  ✓ ${table}: ${result.count} rows`);
    }
  }

  // Totais
  let totalRows = Object.values(backup.global).reduce((s, t) => s + (t.count ?? 0), 0);
  for (const cd of Object.values(backup.companies_data)) {
    totalRows += Object.values(cd.tables).reduce((s, t) => s + (t.count ?? 0), 0);
  }
  backup.metadata.total_rows = totalRows;

  const dir = 'backups';
  if (!existsSync(dir)) mkdirSync(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const filename = join(dir, `all-${ts}.json`);

  writeFileSync(filename, JSON.stringify(backup, null, 2));
  const sizeMB = (Buffer.byteLength(JSON.stringify(backup)) / 1024 / 1024).toFixed(2);

  console.log('');
  console.log(`✅ Backup criado: ${filename}`);
  console.log(`   Empresas: ${companies.length}`);
  console.log(`   Total rows: ${totalRows}`);
  console.log(`   Tamanho: ${sizeMB} MB`);
}

main().catch((err) => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
