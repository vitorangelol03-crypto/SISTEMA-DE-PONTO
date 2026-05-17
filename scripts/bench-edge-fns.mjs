#!/usr/bin/env node
/**
 * Benchmark de edge functions (sub-fase 16.4) — alternativa a k6 sem sudo.
 *
 * Usa Node puro + fetch nativo. Roda N requests sequenciais por edge fn,
 * coleta latências, calcula percentis (p50, p95, p99).
 *
 * Uso:
 *   node scripts/bench-edge-fns.mjs [iterations] [fn]
 *   node scripts/bench-edge-fns.mjs 50         # 50 chamadas em cada fn
 *   node scripts/bench-edge-fns.mjs 100 auth-login  # só auth-login
 *
 * Requer .env com VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 *
 * Saída: tabela com mean / p50 / p95 / p99 / min / max em ms.
 *
 * Limitações:
 * - Sequencial (não simultâneo) — não simula carga concorrente real
 * - Sem k6 (não suporta load profiles complexos)
 * - Mede latência total (rede + edge fn) — não isola server-side
 */
import { readFileSync, existsSync } from 'node:fs';

function readEnv() {
  if (!existsSync('.env')) {
    console.error('❌ .env not found');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = readEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const iterations = parseInt(process.argv[2] || '30', 10);
const onlyFn = process.argv[3];

const TEST_EMP_CPF = '12232625613';

const benchmarks = [
  {
    name: 'auth-login (invalid)',
    fn: async () => {
      const res = await fetch(`${URL}/functions/v1/auth-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ id: '_bench_invalid', password: 'wrong' }),
      });
      await res.text();
      return res.status;
    },
  },
  {
    name: 'employee-public-api lookup-cpf',
    fn: async () => {
      const res = await fetch(`${URL}/functions/v1/employee-public-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ action: 'lookup-cpf', params: { cpf: TEST_EMP_CPF } }),
      });
      await res.text();
      return res.status;
    },
  },
  {
    name: 'employee-public-api verify-pin (invalid)',
    fn: async () => {
      const res = await fetch(`${URL}/functions/v1/employee-public-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ action: 'verify-pin', params: { cpf: TEST_EMP_CPF, pin: '0000' } }),
      });
      await res.text();
      return res.status;
    },
  },
];

const filtered = onlyFn
  ? benchmarks.filter((b) => b.name.toLowerCase().includes(onlyFn.toLowerCase()))
  : benchmarks;

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runBench(bench) {
  console.log(`\n📊 ${bench.name} — ${iterations} requests sequenciais...`);
  const latencies = [];
  let errors = 0;
  let firstStatus = null;

  // Warmup (1 call)
  try { await bench.fn(); } catch { errors++; }

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    try {
      const status = await bench.fn();
      if (firstStatus === null) firstStatus = status;
      latencies.push(performance.now() - t0);
    } catch (e) {
      errors++;
    }
    process.stdout.write('.');
  }
  console.log('');

  if (latencies.length === 0) {
    console.log(`  ❌ All ${iterations} requests failed`);
    return;
  }

  const mean = latencies.reduce((s, n) => s + n, 0) / latencies.length;
  console.log(`  Status:  ${firstStatus}`);
  console.log(`  Calls:   ${latencies.length}/${iterations} (${errors} errors)`);
  console.log(`  Mean:    ${mean.toFixed(1)} ms`);
  console.log(`  Min:     ${Math.min(...latencies).toFixed(1)} ms`);
  console.log(`  p50:     ${percentile(latencies, 50).toFixed(1)} ms`);
  console.log(`  p95:     ${percentile(latencies, 95).toFixed(1)} ms`);
  console.log(`  p99:     ${percentile(latencies, 99).toFixed(1)} ms`);
  console.log(`  Max:     ${Math.max(...latencies).toFixed(1)} ms`);
}

async function main() {
  console.log(`🏁 Benchmark edge fns — ${iterations} iterations cada`);
  console.log(`   URL: ${URL}`);

  for (const bench of filtered) {
    await runBench(bench);
  }

  console.log('\n✅ Benchmark concluído.');
}

main().catch((err) => {
  console.error('❌ Bench failed:', err);
  process.exit(1);
});
