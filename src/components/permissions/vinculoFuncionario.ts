/**
 * Regras PURAS do campo "Funcionário vinculado" (07/10/2026, plano do tablet sem toque, entrega C).
 *
 * Quem decide de verdade é o banco (`admin_link_user_employee`) — aqui é só o que a tela mostra:
 * a lista pra escolher já vem sem quem o banco recusaria (cadastro recusado, desligado), pra pessoa
 * não escolher um nome e tomar "não pode" depois.
 */
import { contemSemAcento } from '../../utils/buscaTexto';
import type { FuncionarioParaVinculo } from '../../services/database';

/**
 * Pode ser ligado a um usuário? Não, se o cadastro foi RECUSADO ou se a data de saída JÁ PASSOU
 * (`hoje` = dia do Brasil, 'AAAA-MM-DD' — a mesma regra da batida no servidor: quem sai dia 15
 * ainda vale no dia 15).
 */
export function podeSerVinculado(f: Pick<FuncionarioParaVinculo, 'registration_status' | 'termination_date'>, hoje: string): boolean {
  if (f.registration_status === 'rejected') return false;
  const saida = (f.termination_date ?? '').trim();
  return !saida || saida >= hoje;
}

/** "•••1234" — só os 4 últimos dígitos do CPF, pra diferenciar homônimos sem expor o número. */
export function finalDoCpf(cpf: string | null | undefined): string {
  const digitos = (cpf ?? '').replace(/\D/g, '');
  return digitos.length >= 4 ? `•••${digitos.slice(-4)}` : '';
}

/** A lista do campo: só quem pode ser ligado, filtrada pela busca (sem acento), no máximo `limite`. */
export function filtrarParaVinculo(
  lista: readonly FuncionarioParaVinculo[],
  busca: string,
  hoje: string,
  limite = 8,
): FuncionarioParaVinculo[] {
  return lista.filter((f) => podeSerVinculado(f, hoje) && contemSemAcento(f.name, busca)).slice(0, limite);
}

/**
 * O usuário tem alguma das permissões do tablet ligada? (aba Usuários: com ela e sem vínculo, a
 * linha avisa — decisão 10: o vínculo é obrigatório pra quem usa o modo supervisor do tablet.)
 */
export function temPermissaoDoTablet(
  permissoes: { employees?: { tabletCreate?: boolean; tabletFaceReset?: boolean } } | null | undefined,
): boolean {
  return permissoes?.employees?.tabletCreate === true || permissoes?.employees?.tabletFaceReset === true;
}
