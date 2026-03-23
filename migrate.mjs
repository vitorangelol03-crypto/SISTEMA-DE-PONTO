const OLD_URL = 'https://ezfpijdjvarbrwhiutek.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6ZnBpamRqdmFyYnJ3aGl1dGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MDc3NzAsImV4cCI6MjA3NDM4Mzc3MH0.r4Gz3yvPWxlH1Q0QWvtvmYKCxuxYML1kMMDg5S_h5uE';

const NEW_URL = 'https://flcncdidxmmornkgkfbb.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsY25jZGlkeG1tb3Jua2drZmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjc5MzMsImV4cCI6MjA4NDc0MzkzM30.mBbCzkZA6w5Hp5j8W0BBHrdtvZlR4VHTVU5rwJVeVSo';

const TABLES = ['attendance', 'payments', 'bonus_removals', 'error_records'];
const BATCH = 50;

async function fetchAll(table) {
  let all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${OLD_URL}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`,
      { headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}`, Range: `${offset}-${offset + 999}` } }
    );
    if (!res.ok) throw new Error(`Fetch ${table} offset=${offset}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) break;
    all = all.concat(rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function insertBatch(table, rows) {
  const res = await fetch(`${NEW_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: NEW_KEY,
      Authorization: `Bearer ${NEW_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Insert ${table}: ${res.status} ${err}`);
  }
}

// Colunas que existem no banco novo para cada tabela (remove extras do banco antigo)
const COLUMN_MAP = {
  error_records: (row) => ({
    id: row.id,
    employee_id: row.employee_id,
    date: row.date,
    error_count: row.error_count,
    observations: row.observations,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }),
};

async function migrateTable(table) {
  process.stdout.write(`\n[${table}] Buscando registros do banco antigo...`);
  let rows = await fetchAll(table);
  console.log(` ${rows.length} encontrados.`);

  if (rows.length === 0) {
    console.log(`[${table}] Nada a inserir.`);
    return 0;
  }

  // Aplica mapeamento de colunas se necessário
  if (COLUMN_MAP[table]) rows = rows.map(COLUMN_MAP[table]);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await insertBatch(table, batch);
    inserted += batch.length;
    process.stdout.write(`\r[${table}] Inserindo... ${inserted}/${rows.length}`);
  }
  console.log(`\r[${table}] ✅ ${inserted}/${rows.length} registros inseridos.`);
  return inserted;
}

(async () => {
  console.log('=== MIGRAÇÃO DE DADOS ===');
  const summary = {};
  for (const table of TABLES) {
    try {
      summary[table] = await migrateTable(table);
    } catch (e) {
      console.error(`\n[${table}] ❌ ERRO: ${e.message}`);
      summary[table] = 'ERRO';
    }
  }
  console.log('\n=== RESUMO FINAL ===');
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  ${table}: ${count}`);
  }
})();
