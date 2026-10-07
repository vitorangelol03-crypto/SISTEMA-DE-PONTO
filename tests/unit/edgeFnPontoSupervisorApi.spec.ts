import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gerarSegredoDoTablet, sha256Hex } from '../../supabase/functions/_shared/clockDevice';

/**
 * MODO SUPERVISOR DO TABLET — contra a edge function PUBLICADA `ponto-supervisor-api` (07/10/2026,
 * plano do tablet sem toque, entrega D). Nada de mock: empresa, tablets, funcionários e supervisores
 * FIXTURE ("PW Test", ids 9797x no CI e 9795x na máquina local), criados aqui e apagados no fim.
 *
 * O caminho de verdade, na ordem:
 *   1. login do supervisor (código + senha do painel): trava de 5 erros; senha provisória, sem
 *      permissão e sem vínculo não entram;
 *   2. sem parear, não lista nem cadastra; o QR de parear: tablet sem modo galpão e tablet de outra
 *      empresa não leem; o certo lê UMA vez só;
 *   3. lista (CPF só com o final, sem rosto/PIN), funções, cadastro (CPF conferido; CPF repetido
 *      devolve a ficha que já existe);
 *   4. QR do rosto: outro tablet não lê; o pareado lê; foto mexida → "fique parado"; rosto de OUTRA
 *      pessoa já cadastrada → recusa dizendo com quem; foto boa → o supervisor recusa uma vez (o
 *      tablet tira de novo) e confirma → o rosto entra na ficha e a biometria temporária some;
 *   5. permissão retirada no meio → para na hora; sair encerra a sessão.
 *
 * Roda com: npx vitest run edgeFnPontoSupervisorApi
 */

function readDotEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const ENV = { ...readDotEnv(), ...process.env };
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? '';
const ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FN_URL = ENV.SUPERVISOR_FN_URL || `${SUPABASE_URL}/functions/v1/ponto-supervisor-api`;
const HAS_SERVICE_ROLE = Boolean(SERVICE_KEY && SUPABASE_URL && ANON_KEY);

const headersService = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function rest(method: string, caminho: string, corpo?: unknown, prefer = 'return=representation'): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method, headers: { ...headersService, Prefer: prefer }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const t = await res.text();
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${caminho} ${res.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}
const inserir = async (tabela: string, linha: Record<string, unknown>) => ((await rest('POST', tabela, linha)) as Record<string, unknown>[])[0];
const buscar = async <T = Record<string, unknown>>(tabela: string, filtro: string) => (await rest('GET', `${tabela}?${filtro}`)) as T[];
const atualizar = (tabela: string, filtro: string, campos: Record<string, unknown>) => rest('PATCH', `${tabela}?${filtro}`, campos, 'return=minimal');
const apagar = (tabela: string, filtro: string) => rest('DELETE', `${tabela}?${filtro}`, undefined, 'return=minimal');

async function api(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = t ? (JSON.parse(t) as Record<string, unknown>) : {}; } catch { parsed = { _raw: t }; }
  return { status: res.status, body: parsed };
}

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** CPF válido (dígitos verificadores certos) a partir de 9 dígitos aleatórios. */
function cpfValidoAleatorio(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 1) % 10;
  const dv = (nums: number[]) => {
    const soma = nums.reduce((acc, d, i) => acc + d * (nums.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

// Rostos determinísticos (o servidor só faz contas de distância).
const rosto = (semente: number) => Array.from({ length: 128 }, (_, i) => Math.sin(semente * 13 + i) * 0.3);
const aDistancia = (r: number[], d: number) => r.map((x) => x + d / Math.sqrt(128));
const FOTO = `data:image/jpeg;base64,${'A'.repeat(400)}`;

describe.skipIf(!HAS_SERVICE_ROLE)('modo supervisor do tablet — edge function publicada', { timeout: 120_000 }, () => {
  const stamp = Date.now();
  const SENHA = 'teste12345'; // senha dos supervisores DE TESTE (criados e apagados aqui)
  // Códigos FIXOS (a criação de teste apaga e recria o código — sobra de rodada que caiu se limpa
  // sozinha), mas SEPARADOS entre o CI e a máquina local: em 07/10/2026 as duas rodaram este teste no
  // mesmo minuto, no mesmo banco, com os mesmos códigos — uma apagava os usuários da outra e o
  // preparo estourou o prazo no CI. 9797x = CI; 9795x = local (9796x é do E2E 135).
  const BASE = process.env.CI ? '9797' : '9795';
  const SUP = { ok: `${BASE}1`, semVinculo: `${BASE}2`, semPerm: `${BASE}3`, provisoria: `${BASE}4`, trava: `${BASE}5` };
  const USUARIOS = Object.values(SUP);
  let empresaA = '';
  let empresaB = '';
  const deviceIds: string[] = [];
  const employeeIds: string[] = [];
  let funcSupervisor = ''; // o funcionário ligado ao supervisor
  let funcJoao = '';       // já tem rosto (o "parecido")
  const rostoDoJoao = rosto(7);
  const segredo = { galpao: gerarSegredoDoTablet(), galpao2: gerarSegredoDoTablet(), semGalpao: gerarSegredoDoTablet(), outraEmpresa: gerarSegredoDoTablet() };
  let sessao = '';

  async function criarTablet(nome: string, empresa: string, segredoDoTablet: string, galpao: boolean): Promise<string> {
    const d = await inserir('clock_devices', {
      name: nome, created_by: 'teste', status: 'active', token_hash: await sha256Hex(segredoDoTablet),
      activated_at: new Date().toISOString(), modo_galpao: galpao,
    });
    const id = String(d.id);
    deviceIds.push(id);
    await inserir('clock_device_companies', { device_id: id, company_id: empresa });
    return id;
  }

  async function criarFuncionario(nome: string, extra: Record<string, unknown> = {}): Promise<string> {
    const e = await inserir('employees', {
      name: nome, cpf: cpfValidoAleatorio(), company_id: empresaA, employment_type: 'Diarista', created_by: '9999',
      function_role: 'Separador', ...extra,
    });
    employeeIds.push(String(e.id));
    return String(e.id);
  }

  async function criarSupervisor(id: string, permissoes: Record<string, unknown>) {
    await rest('POST', 'rpc/_test_create_supervisor_with_perms', {
      sup_id: id, plain_pass: SENHA, perms_json: permissoes, company_uuid: empresaA, created_by_id: '2626',
    });
  }

  /**
   * Ordem importa (FKs sem "on delete"): o histórico aponta pro usuário e o funcionário cadastrado
   * pelo supervisor aponta pra ele (created_by) — os dois saem ANTES dos usuários. Sessões, QRs e
   * tentativas caem junto com o usuário (on delete cascade).
   */
  async function limpar() {
    const lista = USUARIOS.map((u) => `"${u}"`).join(',');
    await apagar('audit_logs', `user_id=in.(${lista})`);
    if (empresaA) {
      const daEmpresa = await buscar<{ id: string }>('employees', `company_id=eq.${empresaA}&select=id`);
      const todos = [...new Set([...employeeIds, ...daEmpresa.map((c) => c.id)])];
      if (todos.length) await apagar('employees', `id=in.(${todos.join(',')})`);
    }
    await apagar('user_permissions', `user_id=in.(${lista})`);
    await apagar('users', `id=in.(${lista})`);
    if (deviceIds.length) await apagar('clock_devices', `id=in.(${deviceIds.join(',')})`);
    for (const c of [empresaA, empresaB].filter(Boolean)) {
      await apagar('payment_periods', `company_id=eq.${c}`);
      await apagar('companies', `id=eq.${c}`);
    }
  }

  beforeAll(async () => {
    for (const letra of ['A', 'B']) {
      const c = await inserir('companies', {
        legal_name: `PW Test Supervisor ${letra} ${stamp} LTDA`, cnpj: randomDigits(12),
        display_name: `PW Test Supervisor ${letra} ${stamp}`, city: 'Teste, MG',
        default_geo_lat: -19.5, default_geo_lng: -42.6, default_geo_radius: 150, default_marking_count: 2,
      });
      if (letra === 'A') empresaA = String(c.id); else empresaB = String(c.id);
    }
    await criarTablet('PW Tablet Galpao', empresaA, segredo.galpao, true);
    await criarTablet('PW Tablet Galpao 2', empresaA, segredo.galpao2, true);
    await criarTablet('PW Tablet Sem Galpao', empresaA, segredo.semGalpao, false);
    await criarTablet('PW Tablet Outra Empresa', empresaB, segredo.outraEmpresa, true);
    funcSupervisor = await criarFuncionario(`PW Test Supervisor Joana ${stamp}`, { face_descriptor: rosto(1), face_registered: true });
    funcJoao = await criarFuncionario(`PW Test Joao ${stamp}`, { face_descriptor: rostoDoJoao, face_registered: true });

    const permTablet = { employees: { view: true, tabletCreate: true, tabletFaceReset: true } };
    await criarSupervisor(SUP.ok, permTablet);
    await criarSupervisor(SUP.semVinculo, permTablet);
    await criarSupervisor(SUP.semPerm, { employees: { view: true } });
    await criarSupervisor(SUP.provisoria, permTablet);
    await criarSupervisor(SUP.trava, permTablet);
    // O vínculo e a senha provisória entram pelo banco (service_role passa pela guarda do vínculo).
    await atualizar('users', `id=eq.${SUP.ok}`, { employee_id: funcSupervisor });
    await atualizar('users', `id=eq.${SUP.semPerm}`, { employee_id: funcJoao });
    await atualizar('users', `id=eq.${SUP.provisoria}`, { must_change_password: true });
    // ~20 idas ao banco de produção em fila: do servidor do CI isso beira os 10 s do padrão (o mesmo
    // prazo do outro teste ao vivo, edgeFnPontoSoNoTablet).
  }, 60_000);

  afterAll(async () => { await limpar(); }, 60_000);

  it('login: 5 senhas erradas travam; senha provisória, sem permissão e sem vínculo não entram', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await api({ action: 'supervisor-login', userId: SUP.trava, password: 'errada' });
      expect(r.status, `tentativa ${i}`).toBe(i < 5 ? 401 : 423);
    }
    const travado = await api({ action: 'supervisor-login', userId: SUP.trava, password: SENHA });
    expect(travado.status).toBe(423); // nem a senha certa entra enquanto trava

    const prov = await api({ action: 'supervisor-login', userId: SUP.provisoria, password: SENHA });
    expect([prov.status, prov.body.motivo]).toEqual([403, 'senha_provisoria']);
    const semPerm = await api({ action: 'supervisor-login', userId: SUP.semPerm, password: SENHA });
    expect([semPerm.status, semPerm.body.motivo]).toEqual([403, 'sem_permissao']);
    const semVinculo = await api({ action: 'supervisor-login', userId: SUP.semVinculo, password: SENHA });
    expect([semVinculo.status, semVinculo.body.motivo]).toEqual([403, 'sem_vinculo']);
    const naoExiste = await api({ action: 'supervisor-login', userId: '97979', password: SENHA });
    expect(naoExiste.status).toBe(401);
  });

  it('login certo abre a sessão; sem parear não lista nem cadastra', async () => {
    const r = await api({ action: 'supervisor-login', userId: SUP.ok, password: SENHA });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    sessao = String(r.body.sessionToken);
    expect(sessao).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.body.pode).toEqual({ cadastrar: true, refazerRosto: true });
    expect((r.body.funcionario as { id: string }).id).toBe(funcSupervisor);
    // O banco guardou só o hash do segredo.
    const [linha] = await buscar<{ token_hash: string; status: string }>('tablet_supervisor_sessions', `user_id=eq.${SUP.ok}&select=token_hash,status`);
    expect(linha.token_hash).toBe(await sha256Hex(sessao));
    expect(linha.status).toBe('aberta');

    const lista = await api({ action: 'list-employees', session: sessao });
    expect([lista.status, lista.body.motivo]).toEqual([409, 'nao_pareada']);
    const lixo = await api({ action: 'list-employees', session: gerarSegredoDoTablet() });
    expect(lixo.status).toBe(401);
  });

  it('QR de parear: tablet sem modo galpão e de outra empresa não leem; o certo lê UMA vez', async () => {
    const qr = await api({ action: 'create-pair-qr', session: sessao });
    expect(qr.status).toBe(200);
    expect(String(qr.body.qrText)).toMatch(/^PT1:P:[A-Z2-7]{26}$/);
    const qrText = String(qr.body.qrText);

    expect((await api({ action: 'tablet-read-qr', deviceToken: segredo.semGalpao, qrText })).status).toBe(403);
    expect((await api({ action: 'tablet-read-qr', deviceToken: segredo.outraEmpresa, qrText })).status).toBe(404);
    const leu = await api({ action: 'tablet-read-qr', deviceToken: segredo.galpao, qrText });
    expect(leu.status, JSON.stringify(leu.body)).toBe(200);
    expect(leu.body.tipo).toBe('parear');
    expect(leu.body.funcionarioDoSupervisorId).toBe(funcSupervisor);
    expect((await api({ action: 'tablet-read-qr', deviceToken: segredo.galpao, qrText })).status).toBe(404); // 1 uso

    const st = await api({ action: 'qr-status', session: sessao, qrId: qr.body.qrId });
    expect([st.body.status, st.body.tablet]).toEqual(['lido', 'PW Tablet Galpao']);
  });

  let funcNovo = '';
  let cpfNovo = '';

  it('lista sem CPF inteiro nem rosto; funções da empresa; cadastro confere o CPF e não duplica a ficha', async () => {
    const lista = await api({ action: 'list-employees', session: sessao });
    expect(lista.status).toBe(200);
    const funcionarios = lista.body.funcionarios as Array<Record<string, unknown>>;
    const joao = funcionarios.find((f) => f.id === funcJoao)!;
    expect(joao.temRosto).toBe(true);
    expect(String(joao.cpfFinal)).toMatch(/^•••\d{4}$/);
    expect(Object.keys(joao).sort()).toEqual(['cpfFinal', 'desligado', 'funcao', 'id', 'nome', 'pediuNovoRosto', 'status', 'temRosto']);

    const funcoes = await api({ action: 'list-function-roles', session: sessao });
    expect(funcoes.body.funcoes).toEqual(['Separador']);

    const cpfRuim = await api({ action: 'create-employee', session: sessao, name: 'Maria Teste', cpf: '111.111.111-11', phone: '33999990000', functionRole: 'Separador' });
    expect(cpfRuim.status).toBe(400);
    const funcaoRuim = await api({ action: 'create-employee', session: sessao, name: 'Maria Teste', cpf: cpfValidoAleatorio(), phone: '33999990000', functionRole: 'Gerente' });
    expect(funcaoRuim.status).toBe(400);

    cpfNovo = cpfValidoAleatorio();
    const novo = await api({ action: 'create-employee', session: sessao, name: `PW Test Nova Maria ${stamp}`, cpf: cpfNovo, phone: '(33) 99999-0000', functionRole: 'Separador' });
    expect(novo.status, JSON.stringify(novo.body)).toBe(200);
    funcNovo = String(novo.body.employeeId);
    const [ficha] = await buscar<Record<string, unknown>>('employees', `id=eq.${funcNovo}&select=company_id,employment_type,contract_type,registration_status,created_by,pix_key,face_registered`);
    expect(ficha).toEqual({
      company_id: empresaA, employment_type: 'Diarista', contract_type: 'Diarista', registration_status: 'pending',
      created_by: SUP.ok, pix_key: null, face_registered: false,
    });
    const repetido = await api({ action: 'create-employee', session: sessao, name: 'Outro Nome', cpf: cpfNovo, phone: '33999990000', functionRole: 'Separador' });
    expect([repetido.status, repetido.body.jaExiste, repetido.body.employeeId]).toEqual([200, true, funcNovo]);
  });

  it('QR do rosto: outro tablet não lê; foto mexida e rosto de OUTRA pessoa são recusados; o supervisor confirma', async () => {
    const qr1 = await api({ action: 'create-face-qr', session: sessao, employeeId: funcNovo, mode: 'novo' });
    expect(qr1.status, JSON.stringify(qr1.body)).toBe(200);
    const qrText = String(qr1.body.qrText);
    expect(qrText).toMatch(/^PT1:R:/);
    expect((await api({ action: 'tablet-read-qr', deviceToken: segredo.galpao2, qrText })).status).toBe(404); // não é o pareado
    const leu = await api({ action: 'tablet-read-qr', deviceToken: segredo.galpao, qrText });
    expect(leu.status, JSON.stringify(leu.body)).toBe(200);
    expect([leu.body.tipo, leu.body.employeeId, leu.body.modo]).toEqual(['rosto', funcNovo, 'novo']);
    const qrId = String(leu.body.qrId);

    // Mexeu entre as fotos: nada é guardado.
    const mexeu = await api({ action: 'tablet-submit-face', deviceToken: segredo.galpao, qrId, amostras: [rosto(3), rosto(3), aDistancia(rosto(3), 0.6)], foto: FOTO });
    expect([mexeu.status, mexeu.body.motivo]).toEqual([422, 'mexeu']);

    // A cara do João (já cadastrado): recusa, e o supervisor vê com quem.
    const igual = await api({ action: 'tablet-submit-face', deviceToken: segredo.galpao, qrId, amostras: [aDistancia(rostoDoJoao, 0.1), aDistancia(rostoDoJoao, 0.12), aDistancia(rostoDoJoao, 0.11)], foto: FOTO });
    expect([igual.status, igual.body.motivo]).toEqual([409, 'parecido']);
    const visto = await api({ action: 'qr-status', session: sessao, qrId });
    expect(visto.body.status).toBe('recusado');
    expect((visto.body.qualidade as { parecidoCom: { nome: string } }).parecidoCom.nome).toBe(`PW Test Joao ${stamp}`);

    // Novo QR, rosto bom (longe de todo mundo).
    const qr2 = await api({ action: 'create-face-qr', session: sessao, employeeId: funcNovo, mode: 'novo' });
    const leu2 = await api({ action: 'tablet-read-qr', deviceToken: segredo.galpao, qrText: qr2.body.qrText });
    const qrId2 = String(leu2.body.qrId);
    const rostoDaMaria = rosto(42);
    const enviar = () => api({ action: 'tablet-submit-face', deviceToken: segredo.galpao, qrId: qrId2, amostras: [rostoDaMaria, aDistancia(rostoDaMaria, 0.05), aDistancia(rostoDaMaria, 0.08)], foto: FOTO });
    const ok = await enviar();
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const capt = await api({ action: 'qr-status', session: sessao, qrId: qrId2 });
    expect([capt.body.status, capt.body.foto]).toEqual(['capturado', FOTO]);

    // O supervisor recusa a foto uma vez: o tablet tira de novo.
    const recusa = await api({ action: 'confirm-face', session: sessao, qrId: qrId2, aceitar: false });
    expect(recusa.body).toEqual({ status: 'lido', tentativas: 1 });
    expect((await enviar()).status).toBe(200);
    const confirma = await api({ action: 'confirm-face', session: sessao, qrId: qrId2, aceitar: true });
    expect(confirma.body).toEqual({ status: 'confirmado' });
    expect((await api({ action: 'confirm-face', session: sessao, qrId: qrId2, aceitar: true })).status).toBe(409); // uma vez só

    const [ficha] = await buscar<{ face_registered: boolean; face_descriptor: number[] }>('employees', `id=eq.${funcNovo}&select=face_registered,face_descriptor`);
    expect(ficha.face_registered).toBe(true);
    expect(ficha.face_descriptor).toHaveLength(128);
    const [qrNoBanco] = await buscar<{ captured_descriptor: unknown; captured_thumb: unknown; status: string }>('tablet_qr_tokens', `id=eq.${qrId2}&select=captured_descriptor,captured_thumb,status`);
    expect(qrNoBanco).toEqual({ captured_descriptor: null, captured_thumb: null, status: 'confirmado' }); // biometria temporária some
    const historico = await buscar<{ action_type: string; module: string; entity_type: string }>('audit_logs', `user_id=eq.${SUP.ok}&select=action_type,module,entity_type`);
    const tipos = historico.map((h) => `${h.action_type}:${h.module}:${h.entity_type}`).sort();
    expect(tipos).toEqual(['create:employees:funcionario', 'login:tablet:sessao_supervisor', 'update:employees:rosto']);
  });

  it('permissão retirada no meio → para na hora; sair encerra a sessão', async () => {
    // "Refazer" de quem já existia continua valendo com a permissão...
    const refazer = await api({ action: 'create-face-qr', session: sessao, employeeId: funcJoao, mode: 'refazer' });
    expect(refazer.status).toBe(200);
    // ... "novo" pra quem NÃO foi cadastrado nesta sessão, não.
    expect((await api({ action: 'create-face-qr', session: sessao, employeeId: funcJoao, mode: 'novo' })).status).toBe(403);

    await atualizar('user_permissions', `user_id=eq.${SUP.ok}`, { permissions: { employees: { view: true } } });
    const semPerm = await api({ action: 'list-employees', session: sessao });
    expect(semPerm.status).toBe(403);
    await atualizar('user_permissions', `user_id=eq.${SUP.ok}`, { permissions: { employees: { view: true, tabletCreate: true, tabletFaceReset: true } } });

    const sair = await api({ action: 'supervisor-logout', session: sessao });
    expect(sair.body).toEqual({ ok: true });
    expect((await api({ action: 'list-employees', session: sessao })).status).toBe(401);
    const [linha] = await buscar<{ status: string }>('tablet_supervisor_sessions', `user_id=eq.${SUP.ok}&select=status`);
    expect(linha.status).toBe('encerrada');
  });
});
