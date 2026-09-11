import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getClient } from './cleanup';

/**
 * E2E — O `create-user` NÃO ALCANÇA USUÁRIO DE OUTRA EMPRESA (11/09/2026).
 *
 * 🔴 O BURACO QUE ESTE ARQUIVO FECHA, achado por auditoria adversarial e
 * confirmado no código que estava no ar:
 *
 * Nenhuma ação do `create-user` comparava a empresa de quem chama com a do alvo.
 * Como a função escreve com `service_role` (passa por cima do RLS da tabela
 * `users`) e o porteiro liberava qualquer `role === 'admin'`, o administrador de
 * UMA unidade alcançava os usuários de TODAS: redefinia senha, renomeava,
 * excluía. E `handleResetPassword` — ao contrário de `handleDelete` — não
 * protegia os mestres: dava pra zerar a senha do 9999/2626, entrar com a senha
 * padrão e virar mestre, com acesso a todas as empresas.
 *
 * Aqui o ataque é feito DE VERDADE, com um admin de teste de uma empresa contra
 * usuário de teste da outra — e tem que tomar 403 em todas as portas. Os dois
 * últimos testes são o contrário: provam que quem TEM direito continua podendo,
 * senão a correção teria quebrado a aba de Usuários.
 *
 * IDs de teste: prefixo `979` (os arquivos 37 e 102 usam `97` e `98`).
 */

const PONTE_NOVA = '2b2abc4b-084c-4cf0-b5f1-02792513241d';
const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

const ADMIN_DA_PN = '97901';   // vira admin da Ponte Nova — o "atacante"
const ALVO_EM_CT = '97902';    // supervisor da Caratinga — o alvo
const NOVO_NA_PN = '97903';    // usado nos testes de não-regressão
const TODOS = [ADMIN_DA_PN, ALVO_EM_CT, NOVO_NA_PN];

const SENHA = 'teste12345';

function env(): { url: string; anon: string } {
  const p = path.join(process.cwd(), '.env');
  const out: Record<string, string> = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { url: out.VITE_SUPABASE_URL, anon: out.VITE_SUPABASE_ANON_KEY };
}

async function entrar(id: string, password: string): Promise<string> {
  const { url, anon } = env();
  const r = await fetch(`${url}/functions/v1/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ id, password }),
  });
  const d = (await r.json()) as { token?: string; error?: string };
  if (!d.token) throw new Error(`login de ${id} falhou: ${d.error ?? r.status}`);
  return d.token;
}

async function chamar(token: string, body: unknown): Promise<{ status: number; corpo: { error?: string; ok?: boolean } }> {
  const { url, anon } = env();
  const r = await fetch(`${url}/functions/v1/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as { error?: string } };
}

async function limpar() {
  await getClient().from('users').delete().in('id', TODOS);
}

test.describe('create-user não atravessa a fronteira da empresa', () => {
  // A edge fn usa bcrypt(10) e pode acordar fria — o prazo segue o do spec 37.
  test.describe.configure({ timeout: 240_000, mode: 'serial' });

  let tokenDoAtacante = '';

  test.beforeAll(async () => {
    await limpar();
    const db = getClient();
    const mestre = await entrar('9999', '684171');

    // Os dois usuários nascem pela PRÓPRIA edge fn, pra terem hash de senha de
    // verdade (é assim que o login funciona).
    const a = await chamar(mestre, {
      id: ADMIN_DA_PN, password: SENHA, role: 'supervisor', companyId: PONTE_NOVA,
    });
    expect(a.status, 'criar o admin de teste na Ponte Nova').toBe(200);
    const b = await chamar(mestre, {
      id: ALVO_EM_CT, password: SENHA, role: 'supervisor', companyId: CARATINGA,
    });
    expect(b.status, 'criar o alvo de teste na Caratinga').toBe(200);

    // Promove a admin: é esse papel que abria todas as portas.
    const { error } = await db.from('users').update({ role: 'admin' }).eq('id', ADMIN_DA_PN);
    expect(error, 'promover o atacante a admin').toBeNull();

    tokenDoAtacante = await entrar(ADMIN_DA_PN, SENHA);
  });

  test.afterAll(() => limpar());

  test('🎯 não redefine a senha de usuário de OUTRA empresa', async () => {
    const r = await chamar(tokenDoAtacante, { action: 'resetPassword', id: ALVO_EM_CT });
    expect(r.status).toBe(403);
    expect(r.corpo.error).toMatch(/outra empresa/i);

    // E a senha do alvo continua sendo a dele — não virou a padrão.
    const alvo = await entrar(ALVO_EM_CT, SENHA);
    expect(alvo, 'o alvo continua entrando com a senha dele').toBeTruthy();
  });

  test('🎯 não redefine a senha de um MESTRE (era o caminho pra virar mestre)', async () => {
    for (const mestre of ['9999', '2626']) {
      const r = await chamar(tokenDoAtacante, { action: 'resetPassword', id: mestre });
      expect(r.status, `reset do ${mestre}`).toBe(403);
      expect(r.corpo.error).toMatch(/administrador principal/i);
    }
    // O 9999 continua entrando com a senha dele.
    expect(await entrar('9999', '684171')).toBeTruthy();
  });

  test('🎯 não exclui usuário de outra empresa', async () => {
    const r = await chamar(tokenDoAtacante, { action: 'delete', id: ALVO_EM_CT });
    expect(r.status).toBe(403);

    const { data } = await getClient().from('users').select('id').eq('id', ALVO_EM_CT).maybeSingle();
    expect(data, 'o alvo continua existindo').not.toBeNull();
  });

  test('🎯 não renomeia usuário de outra empresa', async () => {
    const r = await chamar(tokenDoAtacante, { action: 'update', id: ALVO_EM_CT, name: 'INVADIDO' });
    expect(r.status).toBe(403);

    const { data } = await getClient().from('users').select('name').eq('id', ALVO_EM_CT).maybeSingle();
    expect((data as { name: string | null } | null)?.name ?? '').not.toBe('INVADIDO');
  });

  test('🎯 não cria usuário DENTRO de outra empresa', async () => {
    const r = await chamar(tokenDoAtacante, {
      id: NOVO_NA_PN, password: SENHA, role: 'supervisor', companyId: CARATINGA,
    });
    expect(r.status).toBe(403);
    expect(r.corpo.error).toMatch(/sua própria empresa/i);

    const { data } = await getClient().from('users').select('id').eq('id', NOVO_NA_PN).maybeSingle();
    expect(data, 'nada foi criado na outra empresa').toBeNull();
  });

  // ── Não-regressão: quem TEM direito continua podendo ──────────────────────

  test('o admin continua criando e gerenciando na PRÓPRIA empresa', async () => {
    const criar = await chamar(tokenDoAtacante, {
      id: NOVO_NA_PN, password: SENHA, role: 'supervisor', companyId: PONTE_NOVA,
    });
    expect(criar.status, 'criar na própria empresa').toBe(200);

    const renomear = await chamar(tokenDoAtacante, { action: 'update', id: NOVO_NA_PN, name: 'Fulano' });
    expect(renomear.status, 'renomear na própria empresa').toBe(200);

    const reset = await chamar(tokenDoAtacante, { action: 'resetPassword', id: NOVO_NA_PN });
    expect(reset.status, 'redefinir senha na própria empresa').toBe(200);

    const excluir = await chamar(tokenDoAtacante, { action: 'delete', id: NOVO_NA_PN });
    expect(excluir.status, 'excluir na própria empresa').toBe(200);
  });

  test('o MESTRE continua alcançando as duas empresas (é o desenho)', async () => {
    const mestre = await entrar('9999', '684171');
    const r = await chamar(mestre, { action: 'update', id: ADMIN_DA_PN, name: 'Visto pelo mestre' });
    expect(r.status, 'o 9999 (Caratinga) alcança usuário da Ponte Nova').toBe(200);
  });
});
