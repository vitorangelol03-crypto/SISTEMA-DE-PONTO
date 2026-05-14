#!/usr/bin/env node
/**
 * Warmup das edge functions Supabase.
 *
 * Mitiga TECH_DEBT 6.13: cold-start da edge fn `create-user` pode demorar
 * até 150s (download esm.sh/bcryptjs). Este script invoca cada edge fn com
 * payload mínimo pra forçar o worker a inicializar.
 *
 * Uso recomendado:
 *   - Pós-deploy frontend (Vercel hook)
 *   - Cron a cada 4min via Vercel/GitHub Actions/cron-job.org
 *     (Supabase Edge Functions têm IDLE_TIMEOUT ~5min)
 *
 * Comando manual:
 *   node scripts/warmup-edge-fns.mjs
 *   → invoca todas 4 edge fns ACTIVE
 */
import { readFileSync, existsSync } from 'node:fs';

function readEnv() {
  if (!existsSync('.env')) {
    // Em CI/Vercel, env já está em process.env
    return process.env;
  }
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { ...env, ...process.env };
}

const env = readEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const FNS = [
  {
    slug: 'auth-login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ id: '__warmup__', password: '__warmup__' }),
    // 401 esperado — credenciais inválidas. Edge fn ainda boota.
  },
  {
    slug: 'employee-public-api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ action: 'lookup-companies-by-cpf', cpf: '00000000000' }),
    // 200 com { companies: [] } esperado. Boota o worker.
  },
  {
    slug: 'clock-in-validated',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: '{}',
    // 401 esperado — sem JWT custom. Mas worker boota antes de rejeitar.
  },
  {
    slug: 'create-user',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: '{}',
    // 401 esperado — sem JWT custom admin. Boota worker (bcryptjs download).
  },
];

async function warmupOne(fn) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const resp = await fetch(`${URL}/functions/v1/${fn.slug}`, {
      method: fn.method,
      headers: fn.headers,
      body: fn.body,
      signal: ctrl.signal,
    });
    const elapsed = Date.now() - start;
    return { slug: fn.slug, status: resp.status, elapsed_ms: elapsed };
  } catch (err) {
    return { slug: fn.slug, error: String(err), elapsed_ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('🔥 Warming up edge functions...');
  console.log('');

  // Sequencial pra não saturar — cada uma pode levar 0.5-150s
  const results = [];
  for (const fn of FNS) {
    const result = await warmupOne(fn);
    const ok = result.status && result.status < 500;
    const icon = ok ? '✓' : '✗';
    const time = (result.elapsed_ms / 1000).toFixed(2);
    console.log(`  ${icon} ${fn.slug}: ${result.status ?? 'ERR'} (${time}s)`);
    results.push(result);
  }

  const totalSec = (results.reduce((s, r) => s + r.elapsed_ms, 0) / 1000).toFixed(2);
  console.log('');
  console.log(`✅ Warmup completo em ${totalSec}s`);
  console.log('   Próxima warmup recomendada em ~4min (antes do IDLE_TIMEOUT 5min)');
}

main().catch((err) => {
  console.error('❌ Warmup failed:', err);
  process.exit(1);
});
