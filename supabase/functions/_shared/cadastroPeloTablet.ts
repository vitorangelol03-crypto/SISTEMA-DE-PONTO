/**
 * Cadastro de funcionário novo PELO TABLET (07/10/2026, plano do tablet sem toque, entrega D) — a
 * parte PURA das validações, testada no vitest. Quem chama é a edge function ponto-supervisor-api
 * (o supervisor digita no celular dele).
 *
 * Mesmas regras do cadastro público (link sem login — employee-public-api register-employee e
 * src/utils/validation.ts), com UMA diferença de propósito: aqui o CPF é conferido pelos dígitos
 * verificadores NO SERVIDOR (hoje nenhuma edge function confere; o link público só olha 11 dígitos).
 */

/** Só os dígitos. */
export function soDigitos(valor: unknown): string {
  return typeof valor === 'string' ? valor.replace(/\D/g, '') : '';
}

/** CPF com os 2 dígitos verificadores certos (o mesmo cálculo de validateCPF, src/utils/validation.ts). */
export function cpfValido(valor: unknown): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/** "•••1234" — os 4 últimos dígitos do CPF (a lista do supervisor nunca mostra o CPF inteiro). */
export function finalDoCpf(cpf: unknown): string {
  const d = soDigitos(cpf);
  return d.length >= 4 ? `•••${d.slice(-4)}` : '';
}

/**
 * O nome como o cadastro público grava: sem acento, sem ponto e sem traço, espaços juntados
 * (sanitizePublicRegistrationName). null se não sobrarem pelo menos 3 letras ou passar de 120.
 */
export function nomeDoCadastro(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const nome = bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const letras = (nome.match(/[A-Za-z]/g) ?? []).length;
  if (letras < 3 || nome.length > 120) return null;
  return nome;
}

/** Telefone com DDD: 10 ou 11 dígitos (null se não). */
export function telefoneDoCadastro(bruto: unknown): string | null {
  const d = soDigitos(bruto);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** As funções (cargo/setor) já usadas na empresa, sem repetir, em ordem — o que o celular oferece. */
export function funcoesDaEmpresa(linhas: ReadonlyArray<{ function_role: string | null }>): string[] {
  const unicas = new Set<string>();
  for (const l of linhas) {
    const v = l.function_role?.trim();
    if (v) unicas.add(v);
  }
  return Array.from(unicas).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * A função escolhida vale? Tem que estar na lista da empresa (nunca texto livre — o desconto da
 * triagem é por função). Empresa ainda sem nenhuma função: aceita qualquer texto não vazio (senão
 * ninguém consegue ser cadastrado até alguém configurar uma) — a mesma regra do link público.
 */
export function funcaoAceita(funcoes: readonly string[], escolhida: unknown): string | null {
  const f = typeof escolhida === 'string' ? escolhida.trim() : '';
  if (!f) return null;
  if (funcoes.length > 0 && !funcoes.includes(f)) return null;
  return f;
}
