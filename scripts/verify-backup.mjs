#!/usr/bin/env node
/**
 * Verifica integridade de um backup JSON comparando com estado atual do DB.
 *
 * Uso:
 *   node scripts/verify-backup.mjs backups/all-YYYY-MM-DD-HHMMSS.json
 *
 * Output:
 *   - ✅ Match: count backup == count DB (não houve mudanças)
 *   - ⚠️  Drift: count diferente (mudanças desde backup — esperado se DB ativo)
 *
 * Útil pra:
 *   1. Verificar drift desde último backup (drill mensal pré-go-live)
 *   2. Confirmar que backup tá íntegro (não corrompido)
 *
 * NÃO restaura nada — só compara.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

function readEnv() {
  const envPath = '.env';
  if (!existsSync(envPath)) {
    console.error('❌ .env not found.');
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
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function countTable(name, filter = null) {
  let query = sb.from(name).select('*', { count: 'exact', head: true });
  if (filter?.col) query = query.eq(filter.col, filter.val);
  const { count, error } = await query;
  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

async function main() {
  const backupFile = process.argv[2];
  if (!backupFile) {
    console.error('❌ Uso: node scripts/verify-backup.mjs <arquivo.json>');
    process.exit(1);
  }
  if (!existsSync(backupFile)) {
    console.error(`❌ Arquivo não encontrado: ${backupFile}`);
    process.exit(1);
  }

  console.log(`🔍 Verificando backup: ${backupFile}\n`);

  const backup = JSON.parse(readFileSync(backupFile, 'utf8'));
  console.log(`   Criado em: ${backup.metadata?.created_at}`);
  console.log(`   Total rows backup: ${backup.metadata?.total_rows}`);
  console.log(`   Empresas: ${backup.metadata?.companies?.length ?? 0}\n`);

  let matches = 0;
  let drifts = 0;
  let errors = 0;

  // Verifica tabelas globais
  if (backup.global) {
    console.log('📋 Tabelas globais:');
    for (const [table, data] of Object.entries(backup.global)) {
      const current = await countTable(table);
      if (current.error) {
        console.log(`  ❌ ${table}: ${current.error}`);
        errors++;
      } else if (current.count === data.count) {
        console.log(`  ✅ ${table}: ${data.count} == ${current.count}`);
        matches++;
      } else {
        const delta = current.count - data.count;
        const sign = delta > 0 ? '+' : '';
        console.log(`  ⚠️  ${table}: backup=${data.count} → DB=${current.count} (${sign}${delta})`);
        drifts++;
      }
    }
  }

  // Por empresa
  if (backup.companies_data) {
    for (const [companyId, cd] of Object.entries(backup.companies_data)) {
      console.log(`\n🏢 ${cd.meta?.name} (${companyId.slice(0, 8)}...):`);
      for (const [table, data] of Object.entries(cd.tables)) {
        const current = await countTable(table, { col: 'company_id', val: companyId });
        if (current.error) {
          console.log(`  ❌ ${table}: ${current.error}`);
          errors++;
        } else if (current.count === data.count) {
          console.log(`  ✅ ${table}: ${data.count}`);
          matches++;
        } else {
          const delta = current.count - data.count;
          const sign = delta > 0 ? '+' : '';
          console.log(`  ⚠️  ${table}: backup=${data.count} → DB=${current.count} (${sign}${delta})`);
          drifts++;
        }
      }
    }
  }

  console.log(`\n📊 Resumo: ${matches} matches | ${drifts} drifts | ${errors} errors`);
  if (errors > 0) process.exit(2);
  if (drifts > 0) process.exit(1);
  console.log('\n✅ Backup íntegro (zero drift).');
}

main().catch((err) => {
  console.error('❌ Verify failed:', err);
  process.exit(1);
});
