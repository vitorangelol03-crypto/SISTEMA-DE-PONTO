import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loginAs, goToTab, MASTER_2626 } from './helpers';
import { getClient } from './cleanup';

/**
 * VÍNCULO USUÁRIO ↔ FUNCIONÁRIO + as 2 permissões do tablet — com cliques de verdade e contra o
 * banco de verdade (07/10/2026, plano do tablet sem toque, entrega C; decisões 9 e 10).
 *
 * Como saber que funcionou (combinado no plano): o 2626 abre Usuários → Permissões de um usuário,
 * escolhe o funcionário vinculado e liga "Cadastrar funcionário novo pelo tablet" / "Refazer o rosto
 * pelo tablet"; a aba mostra o nome na coluna "Funcionário" e o histórico grava quem ligou. E o
 * banco recusa tudo o que não pode — testado com LOGIN DE VERDADE de usuários de teste:
 * sem "Gerenciar permissões", usuário de outra empresa, 9999, funcionário de outra empresa, recusado,
 * desligado, já ligado a outro, e UPDATE direto na tabela (só a função muda o vínculo).
 *
 * 🔑 Tudo numa empresa FIXTURE ("PW Test", apagada no fim); usuários de teste 9796x.
 */

const STAMP = Date.now();
const EMPRESA_A = `PW Test Vinculo A ${STAMP}`;
const EMPRESA_B = `PW Test Vinculo B ${STAMP}`;
const MARIA = `PW Test Vinculo Maria ${STAMP}`;
const ALVO = '97961';      // o usuário que vai ser ligado
const GERENTE = '97962';   // tem "Gerenciar permissões" (e editar usuário) na empresa A
const SEM = '97963';       // sem "Gerenciar permissões"
const DA_B = '97964';      // usuário da empresa B
const USUARIOS = [ALVO, GERENTE, SEM, DA_B];
const SENHA = 'teste12345'; // senha dos usuários DE TESTE (criados e apagados aqui)

function env(): { url: string; anon: string } {
  const out: Record<string, string> = {};
  for (const l of fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { url: out.VITE_SUPABASE_URL, anon: out.VITE_SUPABASE_ANON_KEY };
}

async function entrar(id: string): Promise<string> {
  const { url, anon } = env();
  const r = await fetch(`${url}/functions/v1/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ id, password: SENHA }),
  });
  const d = (await r.json()) as { token?: string; error?: string };
  if (!d.token) throw new Error(`login de ${id} falhou: ${d.error ?? r.status}`);
  return d.token;
}

/** Chama a função do vínculo pela API, como a tela chama (token do usuário; sem token = anônimo). */
async function ligar(token: string | null, userId: string, employeeId: string | null): Promise<{ status: number; msg: string }> {
  const { url, anon } = env();
  const r = await fetch(`${url}/rest/v1/rpc/admin_link_user_employee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token ?? anon}` },
    body: JSON.stringify({ p_user_id: userId, p_employee_id: employeeId }),
  });
  const corpo = (await r.json().catch(() => ({}))) as { message?: string };
  return { status: r.status, msg: corpo.message ?? JSON.stringify(corpo) };
}

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

const modalDePermissoes = (page: Page) =>
  page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Gerenciar Permissões' }) });

test.describe.serial('vínculo usuário ↔ funcionário — cliques reais e banco de verdade', () => {
  test.setTimeout(180_000);

  let empresaA = '';
  let empresaB = '';
  const func: Record<'maria' | 'recusado' | 'desligado' | 'outra', string> = { maria: '', recusado: '', desligado: '', outra: '' };

  /**
   * Apaga os usuários de teste — e ANTES o que aponta pra eles sem "on delete": o histórico de
   * permissões (o 2626 salva as permissões do ALVO pela tela) e o histórico geral. Sem isso o
   * DELETE dos usuários falha inteiro e a sobra trava até a limpeza de outros testes (o 37 apaga
   * "97%" num comando só — achado em 07/10/2026). Cada passo confere o erro.
   */
  async function limparUsuarios() {
    const s = getClient();
    const passos: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
      ['permission_logs (usuário)', s.from('permission_logs').delete().in('user_id', USUARIOS)],
      ['permission_logs (quem mudou)', s.from('permission_logs').delete().in('changed_by', USUARIOS)],
      ['audit_logs', s.from('audit_logs').delete().in('user_id', USUARIOS)],
      ['user_permissions', s.from('user_permissions').delete().in('user_id', USUARIOS)],
    ];
    for (const [nome, passo] of passos) {
      const { error } = await passo;
      if (error) throw new Error(`limpar ${nome}: ${error.message}`);
    }
    const { error } = await s.from('users').delete().in('id', USUARIOS);
    if (error) throw new Error(`limpar users: ${error.message}`);
  }

  test.beforeAll(async () => {
    const s = getClient();
    await limparUsuarios();
    const criarEmpresa = async (nome: string) => {
      const { data, error } = await s.from('companies').insert([{
        legal_name: `${nome} LTDA`, cnpj: randomDigits(12), display_name: nome, city: 'Teste, MG',
        default_geo_lat: -19.5, default_geo_lng: -42.6, default_geo_radius: 150, default_marking_count: 2,
        require_facial_clock: false, face_identify_default: false,
      }]).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    };
    empresaA = await criarEmpresa(EMPRESA_A);
    empresaB = await criarEmpresa(EMPRESA_B);

    const criarFuncionario = async (nome: string, companyId: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await s.from('employees').insert([{
        name: nome, cpf: randomDigits(11), company_id: companyId, employment_type: 'Diarista', created_by: '9999', ...extra,
      }]).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    };
    const tresDiasAtras = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    func.maria = await criarFuncionario(MARIA, empresaA);
    func.recusado = await criarFuncionario(`PW Test Vinculo Recusado ${STAMP}`, empresaA, { registration_status: 'rejected' });
    func.desligado = await criarFuncionario(`PW Test Vinculo Desligado ${STAMP}`, empresaA, { termination_date: tresDiasAtras });
    func.outra = await criarFuncionario(`PW Test Vinculo Outra Empresa ${STAMP}`, empresaB);

    const criarUsuario = async (id: string, companyId: string, permissoes: Record<string, unknown>) => {
      const { error } = await s.rpc('_test_create_supervisor_with_perms', {
        sup_id: id, plain_pass: SENHA, perms_json: permissoes, company_uuid: companyId, created_by_id: '2626',
      });
      if (error) throw new Error(`criar ${id}: ${error.message}`);
    };
    await criarUsuario(ALVO, empresaA, {});
    await criarUsuario(GERENTE, empresaA, { users: { view: true, edit: true, managePermissions: true } });
    await criarUsuario(SEM, empresaA, { users: { view: true } });
    await criarUsuario(DA_B, empresaB, {});
  });

  test.afterAll(async () => {
    const s = getClient();
    const ids = Object.values(func).filter(Boolean);
    if (ids.length) {
      const { error } = await s.from('audit_logs').delete().eq('entity_type', 'vinculo').in('entity_id', ids);
      if (error) throw new Error(`limpar audit_logs do vínculo: ${error.message}`);
    }
    await limparUsuarios();
    if (ids.length) {
      const { error } = await s.from('employees').delete().in('id', ids);
      if (error) throw new Error(`limpar employees: ${error.message}`);
    }
    for (const id of [empresaA, empresaB].filter(Boolean)) {
      // O painel cria o período de pagamento sozinho quando o 2626 abre a empresa (como no tests/132).
      const { error: ePeriodos } = await s.from('payment_periods').delete().eq('company_id', id);
      if (ePeriodos) throw new Error(`limpar payment_periods: ${ePeriodos.message}`);
      const { error } = await s.from('companies').delete().eq('id', id);
      if (error) throw new Error(`limpar companies: ${error.message}`);
    }
  });

  test('o 2626 liga o usuário à Maria e liga as 2 permissões do tablet — a aba mostra e o histórico grava', async ({ page }) => {
    const s = getClient();
    await loginAs(page, MASTER_2626, { empresa: EMPRESA_A });
    await goToTab(page, 'Usuários');
    const linha = page.locator('tr[data-testid="user-row"]').filter({ hasText: ALVO });
    await expect(linha.getByTestId('user-funcionario')).toHaveText('sem vínculo', { timeout: 20_000 });

    await linha.getByTitle('Gerenciar Permissões').click();
    const modal = modalDePermissoes(page);
    const vinculo = modal.getByTestId('vinculo-funcionario');
    await expect(vinculo.getByTestId('vinculo-atual')).toHaveText('Sem vínculo.', { timeout: 15_000 });
    await vinculo.getByLabel('Buscar funcionário pelo nome').fill('PW Test Vinculo');
    const opcoes = vinculo.getByTestId('vinculo-opcoes');
    await expect(opcoes).toContainText(MARIA);
    await expect(opcoes).not.toContainText('Recusado');
    await expect(opcoes).not.toContainText('Desligado');
    await expect(opcoes).not.toContainText('Outra Empresa'); // a lista é da empresa DO USUÁRIO
    await opcoes.getByRole('listitem').filter({ hasText: MARIA }).getByRole('button', { name: 'Ligar' }).click();
    await expect(vinculo.getByTestId('vinculo-atual')).toContainText(MARIA, { timeout: 15_000 });
    await expect(modal.getByTestId('permissoes-cabecalho')).toContainText(MARIA);
    await expect.poll(async () => {
      const { data } = await s.from('users').select('employee_id').eq('id', ALVO).single();
      return (data as { employee_id: string | null } | null)?.employee_id;
    }, { timeout: 15_000 }).toBe(func.maria);

    // As 2 permissões novas aparecem sozinhas em "Funcionários" — desligadas — e o 2626 liga.
    await modal.getByRole('button', { name: /^Funcionários/ }).click();
    const criar = modal.getByLabel('Cadastrar funcionário novo pelo tablet');
    const rosto = modal.getByLabel('Refazer o rosto pelo tablet');
    await expect(criar).not.toBeChecked();
    await expect(rosto).not.toBeChecked();
    await criar.check();
    await rosto.check();
    await modal.getByRole('button', { name: 'Salvar Permissões' }).click();
    await expect(modal).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => {
      const { data } = await s.from('user_permissions').select('permissions').eq('user_id', ALVO).single();
      const emp = (data as { permissions: { employees?: Record<string, boolean> } } | null)?.permissions.employees;
      return `${emp?.tabletCreate}/${emp?.tabletFaceReset}`;
    }, { timeout: 15_000 }).toBe('true/true');

    await expect(linha.getByTestId('user-funcionario')).toHaveText(MARIA, { timeout: 15_000 });
    const { data: hist } = await s.from('audit_logs')
      .select('user_id, action_type, module, entity_id, new_data').eq('entity_type', 'vinculo').eq('entity_id', func.maria);
    expect(hist ?? []).toHaveLength(1);
    const h = (hist ?? [])[0] as { user_id: string; action_type: string; module: string; new_data: { user_id: string } };
    expect([h.user_id, h.action_type, h.module, h.new_data.user_id]).toEqual(['2626', 'update', 'users', ALVO]);
  });

  test('"Remover vínculo" desfaz — e a aba avisa: tem permissão do tablet e está sem vínculo', async ({ page }) => {
    const s = getClient();
    await loginAs(page, MASTER_2626, { empresa: EMPRESA_A });
    await goToTab(page, 'Usuários');
    const linha = page.locator('tr[data-testid="user-row"]').filter({ hasText: ALVO });
    await expect(linha.getByTestId('user-funcionario')).toHaveText(MARIA, { timeout: 20_000 });
    await linha.getByTitle('Gerenciar Permissões').click();
    const vinculo = modalDePermissoes(page).getByTestId('vinculo-funcionario');
    await expect(vinculo.getByTestId('vinculo-atual')).toContainText(MARIA, { timeout: 15_000 });
    await vinculo.getByRole('button', { name: /Remover vínculo/ }).click();
    await expect(vinculo.getByTestId('vinculo-atual')).toHaveText('Sem vínculo.', { timeout: 15_000 });
    await expect.poll(async () => {
      const { data } = await s.from('users').select('employee_id').eq('id', ALVO).single();
      return (data as { employee_id: string | null } | null)?.employee_id ?? null;
    }, { timeout: 15_000 }).toBeNull();
    await modalDePermissoes(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(linha.getByTestId('user-funcionario')).toHaveText('⚠️ sem vínculo');
    const { data: hist } = await s.from('audit_logs').select('id').eq('entity_type', 'vinculo').eq('entity_id', func.maria);
    expect(hist ?? []).toHaveLength(2); // ligou + desfez
  });

  test('o banco recusa o que não pode — com login de verdade de usuários de teste', async () => {
    const s = getClient();
    const gerente = await entrar(GERENTE);
    const sem = await entrar(SEM);

    const semPermissao = await ligar(sem, ALVO, func.maria);
    expect(semPermissao.status, semPermissao.msg).toBe(403);
    expect(semPermissao.msg).toMatch(/Gerenciar permissões/);

    const outraEmpresa = await ligar(gerente, DA_B, null);
    expect(outraEmpresa.status, outraEmpresa.msg).toBe(403);
    expect(outraEmpresa.msg).toMatch(/outra empresa/);

    const mestre = await ligar(gerente, '9999', null);
    expect(mestre.status, mestre.msg).toBe(403);
    expect(mestre.msg).toMatch(/Só o usuário mestre \(2626\)/);

    for (const [caso, empId, motivo] of [
      ['funcionário de outra empresa', func.outra, /mesma empresa/],
      ['cadastro recusado', func.recusado, /recusado/],
      ['desligado', func.desligado, /desligado/],
    ] as const) {
      const r = await ligar(gerente, ALVO, empId);
      expect(r.status, `${caso}: ${r.msg}`).toBe(400);
      expect(r.msg, caso).toMatch(motivo);
    }

    // Quem tem a permissão liga na própria empresa...
    const certo = await ligar(gerente, ALVO, func.maria);
    expect(certo.status, certo.msg).toBe(200);
    // ...e a mesma Maria não vai pra outro usuário (1 funcionário ↔ 1 usuário).
    const repetido = await ligar(gerente, SEM, func.maria);
    expect(repetido.status, repetido.msg).toBe(409);
    expect(repetido.msg).toMatch(new RegExp(`já está ligado ao usuário ${ALVO}`));

    // UPDATE direto na tabela (o gerente pode editar usuário): o vínculo NÃO muda por fora da função.
    const { url, anon } = env();
    const direto = await fetch(`${url}/rest/v1/users?id=eq.${ALVO}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${gerente}`, Prefer: 'return=minimal' },
      body: JSON.stringify({ employee_id: null }),
    });
    expect(direto.status).toBe(403);
    const { data: aindaLigado } = await s.from('users').select('employee_id').eq('id', ALVO).single();
    expect((aindaLigado as { employee_id: string | null }).employee_id).toBe(func.maria);

    // Sem login nenhum, a função nem abre.
    const anonimo = await ligar(null, ALVO, null);
    expect([401, 403]).toContain(anonimo.status);

    // Excluir o funcionário ligado desfaz o vínculo sozinho (sem esbarrar na guarda).
    const { error: apagou } = await s.from('employees').delete().eq('id', func.maria);
    expect(apagou).toBeNull();
    const { data: depois } = await s.from('users').select('employee_id').eq('id', ALVO).single();
    expect((depois as { employee_id: string | null }).employee_id).toBeNull();
  });
});
