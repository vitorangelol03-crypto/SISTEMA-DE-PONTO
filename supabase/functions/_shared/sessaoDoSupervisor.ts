/**
 * Quem pode entrar no MODO SUPERVISOR do tablet (07/10/2026, plano do tablet sem toque, entrega D;
 * decisões 4, 9 e 10 do Victor) — a parte PURA, testada no vitest.
 *
 *  - entra com o código + a senha do PAINEL (não CPF + PIN: PIN de 4 dígitos se descobre tentando);
 *  - 5 senhas erradas travam por 15 minutos;
 *  - senha provisória (a padrão de quem teve a senha redefinida) não entra: troca no painel antes;
 *  - precisa de pelo menos uma das 2 permissões do tablet (o 2626 sempre pode);
 *  - precisa estar LIGADO a um funcionário (o histórico diz quem fez) — o 2626 não precisa.
 */

export const MAX_FALHAS_DE_LOGIN = 5;
export const TRAVA_DO_LOGIN_MS = 15 * 60_000;

/** A conta está travada agora? */
export function loginTravado(lockedUntil: string | null | undefined, agora: number): boolean {
  if (!lockedUntil) return false;
  const ate = new Date(lockedUntil).getTime();
  return Number.isFinite(ate) && ate > agora;
}

/** Mais uma senha errada: soma e, na 5ª, trava por TRAVA_DO_LOGIN_MS. */
export function depoisDeUmaFalha(falhasAntes: number, agora: number): { failed_attempts: number; locked_until: string | null } {
  const falhas = Math.max(0, falhasAntes) + 1;
  return {
    failed_attempts: falhas,
    locked_until: falhas >= MAX_FALHAS_DE_LOGIN ? new Date(agora + TRAVA_DO_LOGIN_MS).toISOString() : null,
  };
}

export interface OQueOSupervisorPode {
  cadastrar: boolean;
  refazerRosto: boolean;
}

export type MotivoDeRecusa = 'senha_provisoria' | 'sem_permissao' | 'sem_vinculo';

export type DecisaoDoLogin =
  | { ok: true; pode: OQueOSupervisorPode }
  | { ok: false; motivo: MotivoDeRecusa };

export const MENSAGEM_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  senha_provisoria: 'Sua senha é provisória. Troque a senha no painel antes de usar o modo supervisor.',
  sem_permissao: 'Você não tem permissão de cadastrar funcionário nem de refazer rosto pelo tablet.',
  sem_vinculo: 'Seu usuário não está ligado a um funcionário. Peça ao responsável pra ligar em Usuários → Permissões.',
};

/** A senha já conferiu: decide se entra e o que pode fazer. */
export function decidirLogin(p: {
  userId: string;
  senhaProvisoria: boolean;
  podeCadastrar: boolean;
  podeRefazerRosto: boolean;
  employeeId: string | null;
}): DecisaoDoLogin {
  if (p.senhaProvisoria) return { ok: false, motivo: 'senha_provisoria' };
  if (p.userId === '2626') return { ok: true, pode: { cadastrar: true, refazerRosto: true } };
  if (!p.podeCadastrar && !p.podeRefazerRosto) return { ok: false, motivo: 'sem_permissao' };
  if (!p.employeeId) return { ok: false, motivo: 'sem_vinculo' };
  return { ok: true, pode: { cadastrar: p.podeCadastrar, refazerRosto: p.podeRefazerRosto } };
}

/** Mestres escolhem a empresa da sessão (cruzam empresas, como no resto do sistema). */
export function ehMestre(userId: string): boolean {
  return userId === '9999' || userId === '2626';
}
