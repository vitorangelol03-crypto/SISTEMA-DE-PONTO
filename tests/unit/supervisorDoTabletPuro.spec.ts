/**
 * MODO SUPERVISOR DO TABLET — as partes PURAS do servidor (07/10/2026, plano do tablet sem toque,
 * entrega D; decisões 4, 5, 6, 9 e 10 do Victor em .claude-checkpoints/PLANO_TABLET_SEM_TOQUE_2026-10-05.md).
 *
 * Roda com: npx vitest run supervisorDoTabletPuro
 */
import { describe, it, expect } from 'vitest';
import {
  cpfValido, finalDoCpf, funcaoAceita, funcoesDaEmpresa, nomeDoCadastro, soDigitos, telefoneDoCadastro,
} from '../../supabase/functions/_shared/cadastroPeloTablet';
import {
  CAPTURA_PRAZO_MS, QR_VALIDO_MS, SESSAO_MS, TAMANHO_DO_CODIGO,
  dentroDoPrazo, gerarCodigoDoQr, lerTextoDoQr, sessaoValida, textoDoQr,
} from '../../supabase/functions/_shared/tabletQr';
import {
  AVISO_PARECIDO_ATE, decidirRostoNovo, distanciaEntre, lerAmostras, maiorDistanciaEntreAmostras, mediaDasAmostras,
} from '../../supabase/functions/_shared/rostoPeloTablet';
import {
  MAX_FALHAS_DE_LOGIN, decidirLogin, depoisDeUmaFalha, ehMestre, loginTravado,
} from '../../supabase/functions/_shared/sessaoDoSupervisor';
import { LIMITE_FACIAL } from '../../supabase/functions/_shared/faceIdentify';
import { validateCPF } from '../../src/utils/validation';

const rosto = (base: number, delta = 0) => Array.from({ length: 128 }, (_, i) => base + i / 1000 + delta);
/** Um rosto a exatamente `d` de distância de `r` (soma d/√128 em cada número). */
const aDistancia = (r: number[], d: number) => r.map((x) => x + d / Math.sqrt(128));

describe('cadastro pelo tablet — CPF, nome, telefone e função', () => {
  it('CPF pelos dígitos verificadores, igual à tela (validateCPF)', () => {
    for (const cpf of ['529.982.247-25', '11144477735', '000.000.000-00', '529.982.247-24', '123', '']) {
      expect(cpfValido(cpf), cpf).toBe(validateCPF(cpf));
    }
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
  it('a lista do supervisor mostra só o final do CPF', () => {
    expect(finalDoCpf('529.982.247-25')).toBe('•••4725');
    expect(finalDoCpf(null)).toBe('');
    expect(soDigitos('(33) 9 9999-0000')).toBe('33999990000');
  });
  it('nome como o cadastro público grava (sem acento/ponto/traço); pelo menos 3 letras', () => {
    expect(nomeDoCadastro('  José  da  Conceição-Silva  ')).toBe('Jose da ConceicaoSilva');
    expect(nomeDoCadastro('Jo')).toBeNull();
    expect(nomeDoCadastro('12 3')).toBeNull();
    expect(nomeDoCadastro(42)).toBeNull();
  });
  it('telefone com DDD (10 ou 11 dígitos)', () => {
    expect(telefoneDoCadastro('(33) 99999-0000')).toBe('33999990000');
    expect(telefoneDoCadastro('(33) 3321-0000')).toBe('3333210000');
    expect(telefoneDoCadastro('99999-0000')).toBeNull();
  });
  it('função: da lista da empresa (nunca texto livre); empresa sem lista aceita qualquer uma', () => {
    const funcoes = funcoesDaEmpresa([{ function_role: ' Separador ' }, { function_role: 'Auxiliar' }, { function_role: null }, { function_role: 'Separador' }]);
    expect(funcoes).toEqual(['Auxiliar', 'Separador']);
    expect(funcaoAceita(funcoes, 'Separador')).toBe('Separador');
    expect(funcaoAceita(funcoes, 'Gerente')).toBeNull();
    expect(funcaoAceita([], 'Qualquer')).toBe('Qualquer');
    expect(funcaoAceita([], '  ')).toBeNull();
  });
});

describe('QR do supervisor', () => {
  it('código: 128 bits em base32 (26 símbolos), cada um diferente', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const c = gerarCodigoDoQr();
      expect(c).toMatch(/^[A-Z2-7]{26}$/);
      vistos.add(c);
    }
    expect(vistos.size).toBe(300);
    expect(TAMANHO_DO_CODIGO).toBe(26);
  });
  it('a conta do base32 é a do RFC (16 bytes zero = 26 "A"; 0xFF.. = "7"... com o resto zerado)', () => {
    expect(gerarCodigoDoQr(() => new Uint8Array(16))).toBe('A'.repeat(26));
    expect(gerarCodigoDoQr(() => new Uint8Array(16).fill(255))).toBe('7'.repeat(25) + '4');
  });
  it('texto do QR ida e volta; qualquer outro QR é ignorado', () => {
    const c = gerarCodigoDoQr();
    expect(lerTextoDoQr(textoDoQr('parear', c))).toEqual({ tipo: 'parear', codigo: c });
    expect(lerTextoDoQr(` ${textoDoQr('rosto', c)} `)).toEqual({ tipo: 'rosto', codigo: c });
    for (const lixo of ['https://exemplo.com', 'PT-ABCDEF', `PT1:X:${c}`, `PT1:P:${c.slice(1)}`, `pt1:p:${c.toLowerCase()}`, null, 42]) {
      expect(lerTextoDoQr(lixo)).toBeNull();
    }
  });
  it('prazos: QR 2 min pra ler, captura 60 s, sessão 20 min', () => {
    expect([QR_VALIDO_MS, CAPTURA_PRAZO_MS, SESSAO_MS]).toEqual([120_000, 60_000, 1_200_000]);
    const agora = Date.parse('2026-10-07T10:00:00Z');
    expect(dentroDoPrazo('2026-10-07T09:59:30Z', CAPTURA_PRAZO_MS, agora)).toBe(true);
    expect(dentroDoPrazo('2026-10-07T09:58:59Z', CAPTURA_PRAZO_MS, agora)).toBe(false);
    expect(dentroDoPrazo(null, CAPTURA_PRAZO_MS, agora)).toBe(false);
    expect(sessaoValida({ status: 'pareada', expires_at: '2026-10-07T10:05:00Z' }, agora)).toBe(true);
    expect(sessaoValida({ status: 'encerrada', expires_at: '2026-10-07T10:05:00Z' }, agora)).toBe(false);
    expect(sessaoValida({ status: 'aberta', expires_at: '2026-10-07T09:59:59Z' }, agora)).toBe(false);
  });
});

describe('o rosto tirado pelo tablet', () => {
  it('3 a 5 amostras de 128 números; o resto é recusado', () => {
    expect(lerAmostras([rosto(0.1), rosto(0.1), rosto(0.1)])).toHaveLength(3);
    expect(lerAmostras([rosto(0.1), rosto(0.1)])).toBeNull();
    expect(lerAmostras(Array.from({ length: 6 }, () => rosto(0.1)))).toBeNull();
    expect(lerAmostras([rosto(0.1), rosto(0.1), [1, 2, 3]])).toBeNull();
    expect(lerAmostras([rosto(0.1), rosto(0.1), rosto(Number.NaN)])).toBeNull();
  });
  it('média e maior distância entre amostras', () => {
    const a = rosto(0.1);
    const b = aDistancia(a, 0.2);
    expect(maiorDistanciaEntreAmostras([a, b, a])).toBeCloseTo(0.2, 6);
    const m = mediaDasAmostras([a, b]);
    expect(distanciaEntre(m, a)).toBeCloseTo(0.1, 6);
  });
  it('rosto de OUTRA pessoa já cadastrada (abaixo do limite) → recusa, dizendo com quem', () => {
    const novo = rosto(0.1);
    const d = decidirRostoNovo(novo, [{ id: 'x', nome: 'JOAO', cpf: '111', descriptor: aDistancia(novo, LIMITE_FACIAL - 0.05) }], { id: 'eu', cpf: '222' });
    expect(d.resultado).toBe('recusa');
    expect(d.maisParecido?.nome).toBe('JOAO');
  });
  it('parecido mas acima do limite → passa com AVISO; longe → ok', () => {
    const novo = rosto(0.1);
    const aviso = decidirRostoNovo(novo, [{ id: 'x', nome: 'JOAO', cpf: null, descriptor: aDistancia(novo, (LIMITE_FACIAL + AVISO_PARECIDO_ATE) / 2) }], { id: 'eu', cpf: null });
    expect(aviso.resultado).toBe('aviso');
    const ok = decidirRostoNovo(novo, [{ id: 'x', nome: 'JOAO', cpf: null, descriptor: aDistancia(novo, 0.9) }], { id: 'eu', cpf: null });
    expect(ok.resultado).toBe('ok');
  });
  it('a própria ficha e a ficha do MESMO CPF (outra empresa) não contam como "outra pessoa"', () => {
    const novo = rosto(0.1);
    const d = decidirRostoNovo(novo, [
      { id: 'eu', nome: 'EU', cpf: '52998224725', descriptor: novo },
      { id: 'eu-na-pn', nome: 'EU', cpf: '529.982.247-25', descriptor: aDistancia(novo, 0.1) },
    ], { id: 'eu', cpf: '52998224725' });
    expect(d.resultado).toBe('ok');
    expect(d.maisParecido).toBeNull();
  });
});

describe('login do supervisor (decisões 4, 9 e 10)', () => {
  it('5 senhas erradas travam por 15 min', () => {
    const agora = Date.parse('2026-10-07T10:00:00Z');
    let falhas = 0;
    let trava: string | null = null;
    for (let i = 0; i < MAX_FALHAS_DE_LOGIN; i++) {
      const r = depoisDeUmaFalha(falhas, agora);
      falhas = r.failed_attempts;
      trava = r.locked_until;
      if (i < MAX_FALHAS_DE_LOGIN - 1) expect(trava).toBeNull();
    }
    expect(trava).toBe('2026-10-07T10:15:00.000Z');
    expect(loginTravado(trava, agora)).toBe(true);
    expect(loginTravado(trava, Date.parse('2026-10-07T10:15:01Z'))).toBe(false);
    expect(loginTravado(null, agora)).toBe(false);
  });
  it('senha provisória não entra; sem permissão não entra; sem vínculo não entra', () => {
    const base = { userId: '03', senhaProvisoria: false, podeCadastrar: true, podeRefazerRosto: false, employeeId: 'e1' };
    expect(decidirLogin(base)).toEqual({ ok: true, pode: { cadastrar: true, refazerRosto: false } });
    expect(decidirLogin({ ...base, senhaProvisoria: true })).toEqual({ ok: false, motivo: 'senha_provisoria' });
    expect(decidirLogin({ ...base, podeCadastrar: false })).toEqual({ ok: false, motivo: 'sem_permissao' });
    expect(decidirLogin({ ...base, employeeId: null })).toEqual({ ok: false, motivo: 'sem_vinculo' });
  });
  it('o 2626 sempre pode (sem permissão salva e sem vínculo) — mas senha provisória vale pra ele também', () => {
    const d2626 = { userId: '2626', senhaProvisoria: false, podeCadastrar: false, podeRefazerRosto: false, employeeId: null };
    expect(decidirLogin(d2626)).toEqual({ ok: true, pode: { cadastrar: true, refazerRosto: true } });
    expect(decidirLogin({ ...d2626, senhaProvisoria: true }).ok).toBe(false);
    expect(ehMestre('2626')).toBe(true);
    expect(ehMestre('9999')).toBe(true);
    expect(ehMestre('8888')).toBe(false);
  });
});
