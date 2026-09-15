/**
 * Quem entra na divisão do desconto da triagem (15/09/2026, pedido do Victor:
 * o administrativo de Caratinga estava sendo descontado junto com a triagem).
 *
 * A configuração guarda as funções DESMARCADAS, não as marcadas: uma função nova
 * que aparecer depois já nasce entrando no desconto (decisão dele) — do jeito
 * contrário, alguém novo da triagem ficaria sem desconto sem ninguém perceber.
 */
export interface TriageConfig {
  /** Funções (function_role, sem espaço nas pontas) que ficam FORA do desconto. */
  excludedFunctionRoles: string[];
  /** Quem não tem função cadastrada fica fora? Padrão: não — entra (decisão dele). */
  excludeNoFunction: boolean;
}

/** Empresa sem configuração salva: todo mundo entra, como sempre foi. */
export const TRIAGE_CONFIG_PADRAO: TriageConfig = {
  excludedFunctionRoles: [],
  excludeNoFunction: false,
};

export function entraNaTriagem(functionRole: string | null | undefined, config: TriageConfig): boolean {
  const funcao = functionRole?.trim() ?? '';
  if (!funcao) return !config.excludeNoFunction;
  return !config.excludedFunctionRoles.includes(funcao);
}

/** Marca ou desmarca UMA função, sem mexer nas outras. */
export function marcarFuncao(config: TriageConfig, funcao: string, entra: boolean): TriageConfig {
  const alvo = funcao.trim();
  const semEla = config.excludedFunctionRoles.filter(f => f !== alvo);
  return {
    ...config,
    excludedFunctionRoles: entra
      ? semEla
      : [...semEla, alvo].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}
