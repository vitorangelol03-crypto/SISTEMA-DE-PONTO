#!/usr/bin/env node
/**
 * Seed de 30 funcionários FICTÍCIOS em Ponte Nova (Demo PN).
 *
 * Uso enquanto Victor prepara planilha real. Tudo com prefix `Demo PN`
 * pra cleanup fácil depois (vs `PW Test` que são E2E test fixtures).
 *
 * Idempotente: deleta `Demo PN%` existentes antes de re-inserir.
 *
 * Comando:
 *   node scripts/seed-pn-fake.mjs
 *
 * Após rodar:
 *   - 30 employees em Ponte Nova (company_id=2b2abc4b-...)
 *   - CPFs sintéticos válidos (algoritmo Mod11)
 *   - PINs já em bcrypt (pgcrypto crypt + gen_salt bf10) — pin_hash setado, pin NULL
 *   - Jornada padrão (seg-sex 8h + sáb 4h)
 *   - Mix de tipos: 20 CLT + 8 Diarista + 2 PJ
 *
 * Pra remover depois (quando planilha real chegar):
 *   DELETE FROM employees WHERE company_id = '2b2abc4b-...' AND name LIKE 'Demo PN%';
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

const PN_ID = '2b2abc4b-084c-4cf0-b5f1-02792513241d';

function readEnv() {
  if (!existsSync('.env')) {
    console.error('❌ .env não encontrado. Rode do diretório raiz.');
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
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('❌ Faltam VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// ───────────── Helpers ─────────────

// Gerador de CPF válido (algoritmo brasileiro Mod11)
function genCPF(seed) {
  const rand = (max) => Math.floor((Math.sin(seed++) * 10000) % 1 * max);
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 1) % 10;
  void rand;

  const calcDigit = (nums) => {
    const len = nums.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nums[i] * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };
  const d1 = calcDigit(base);
  const d2 = calcDigit([...base, d1]);
  return [...base, d1, d2].join('');
}

// Nomes brasileiros realistas
const FIRST_NAMES = [
  'Ana Carolina', 'Bruno Alves', 'Camila Souza', 'Diego Martins', 'Eduardo Lima',
  'Fernanda Costa', 'Gabriel Pereira', 'Helena Rodrigues', 'Igor Almeida', 'Júlia Oliveira',
  'Lucas Ferreira', 'Mariana Silva', 'Nathan Cardoso', 'Otávio Santos', 'Patrícia Gomes',
  'Quirino Vieira', 'Rafaela Pinto', 'Samuel Barbosa', 'Tatiana Ribeiro', 'Ulisses Castro',
  'Vinicius Moura', 'Wagner Dias', 'Xavier Mello', 'Yasmin Andrade', 'Zilda Cunha',
  'Alessandro Reis', 'Beatriz Coelho', 'Caio Macedo', 'Daniela Brito', 'Estêvão Carvalho',
];

const LAST_NAMES = [
  'da Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira',
  'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Gomes', 'Martins', 'Araújo',
  'Melo', 'Barbosa', 'Ribeiro', 'Pinto', 'Moreira',
];

const FUNCOES = [
  'Auxiliar de Logística', 'Conferente', 'Operador de Empilhadeira', 'Supervisor de Estoque',
  'Vigilante', 'Auxiliar Administrativo', 'Motorista', 'Separador',
];

function genEmployee(idx) {
  const cpf = genCPF(idx);
  const firstName = FIRST_NAMES[idx % FIRST_NAMES.length];
  const lastName = LAST_NAMES[idx % LAST_NAMES.length];
  const name = `Demo PN ${firstName} ${lastName}`;

  // Mix: 20 CLT + 8 Diarista + 2 PJ
  let employment_type, tipo_contrato;
  if (idx < 20) { employment_type = 'CLT'; tipo_contrato = 'CLT'; }
  else if (idx < 28) { employment_type = 'Diarista'; tipo_contrato = 'Diarista'; }
  else { employment_type = 'PJ'; tipo_contrato = 'PJ'; }

  // PIN: 4 dígitos derivados do índice (1234 a 3030)
  const pinPlain = String(1234 + idx * 7).padStart(4, '0').slice(0, 4);

  return {
    name,
    cpf,
    pix_key: cpf,
    pix_type: 'CPF',
    employment_type,
    function_role: FUNCOES[idx % FUNCOES.length],
    badge_number: String(1000 + idx),
    address: `Rua ${['das Flores', 'do Comércio', 'XV de Novembro', 'das Acácias', 'Principal'][idx % 5]}, ${100 + idx}`,
    neighborhood: ['Centro', 'Triângulo', 'Cidade Nova', 'Vila Rica', 'Palmeiras'][idx % 5],
    city: 'Ponte Nova',
    state: 'MG',
    zip_code: `35430${String(idx).padStart(3, '0')}`,
    company_id: PN_ID,
    created_by: '9999',
    pin_configured: true,
    contract_type: tipo_contrato,
    schedule_type: idx >= 20 && idx < 28 ? '12x36' : 'Normal',
    expected_schedule: idx >= 20 && idx < 28
      ? [0, 720, 0, 720, 0, 720, 0] // diarista 12x36
      : [0, 480, 480, 480, 480, 480, 240], // normal seg-sex 8h + sáb 4h
    marking_count: 2,
    hire_date: '2024-01-01',
    _pin_plain: pinPlain,
  };
}

// ───────────── Main ─────────────

async function main() {
  console.log('🌱 Seed PN — 30 funcionários fictícios');
  console.log('');

  // 1) Cleanup idempotente
  const { count: existingCount } = await sb
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', PN_ID)
    .like('name', 'Demo PN%');

  if (existingCount > 0) {
    console.log(`🧹 Removendo ${existingCount} Demo PN existentes...`);
    const { error: delError } = await sb
      .from('employees')
      .delete()
      .eq('company_id', PN_ID)
      .like('name', 'Demo PN%');
    if (delError) {
      console.error('❌ Falha ao limpar:', delError.message);
      process.exit(1);
    }
  }

  // 2) Gerar 30 employees
  const employees = Array.from({ length: 30 }, (_, i) => genEmployee(i));

  // 3) Insert em batch (remove _pin_plain antes de mandar pro DB)
  console.log('📝 Inserindo 30 employees...');
  const rowsToInsert = employees.map((emp) => {
    const { _pin_plain: _, ...row } = emp;
    return row;
  });
  const { data: inserted, error: insertError } = await sb
    .from('employees')
    .insert(rowsToInsert)
    .select('id, name, cpf');

  if (insertError) {
    console.error('❌ Falha ao inserir:', insertError.message);
    process.exit(1);
  }

  // 4) Hash dos PINs via pgcrypto (1 query SQL pra todos)
  // Cada emp tem _pin_plain — vamos rodar UPDATE com case-when
  console.log('🔐 Hashing 30 PINs via pgcrypto (bcrypt bf10)...');

  // Build UPDATE em batch usando ID + PIN map. Mais simples: 1 update por emp.
  // Como tem só 30, é rápido.
  for (let i = 0; i < inserted.length; i++) {
    const empId = inserted[i].id;
    const pin = employees[i]._pin_plain;
    // RPC alternativa: usar query SQL direta via rpc.
    // Como não temos RPC, faço update via SQL function se disponível, OU via supabase-js
    // não suporta crypt() — então fazemos via raw SQL request.
    // Atalho: usa Postgres function se disponível, OU faz hash no Node e insere.
    // Vou usar hash via pgcrypto através de execute (Supabase MCP — não disponível aqui).
    // Alternativa: usa node bcryptjs.
  }

  // Pra simplicidade, vou usar bcryptjs no Node (mesma compatibilidade)
  const { default: bcrypt } = await import('bcryptjs');
  for (let i = 0; i < inserted.length; i++) {
    const empId = inserted[i].id;
    const pin = employees[i]._pin_plain;
    const pin_hash = bcrypt.hashSync(pin, 10);
    const { error } = await sb
      .from('employees')
      .update({ pin_hash, pin: null })
      .eq('id', empId);
    if (error) {
      console.warn(`⚠️  Falha hash PIN ${empId}:`, error.message);
    }
  }

  // 5) Validação final
  const { count: finalCount } = await sb
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', PN_ID)
    .like('name', 'Demo PN%');

  const { count: bcryptCount } = await sb
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', PN_ID)
    .like('name', 'Demo PN%')
    .not('pin_hash', 'is', null)
    .is('pin', null);

  console.log('');
  console.log(`✅ Seed completo: ${finalCount} employees Demo PN`);
  console.log(`   PINs bcrypt: ${bcryptCount}/${finalCount}`);
  console.log('');
  console.log('📋 Sample (3 primeiros):');
  for (let i = 0; i < Math.min(3, employees.length); i++) {
    console.log(`   ${i + 1}. ${employees[i].name} — CPF ${employees[i].cpf} — PIN ${employees[i]._pin_plain} (${employees[i].employment_type})`);
  }
  console.log('');
  console.log('🧹 Pra remover depois (quando planilha real chegar):');
  console.log(`   DELETE FROM employees WHERE company_id = '${PN_ID}' AND name LIKE 'Demo PN%';`);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
