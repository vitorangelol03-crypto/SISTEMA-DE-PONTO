/**
 * O texto de um erro pra mostrar na tela, sem esconder a causa.
 *
 * O Supabase devolve o `error` de `{ data, error }` como OBJETO COMUM — não é
 * `instanceof Error` — então a tela que só olhava `instanceof Error` caía sempre
 * no texto genérico. Em 15/09/2026 isso deixou a distribuição de triagem 12 dias
 * dizendo só "Erro ao distribuir", quando o banco dizia exatamente o que era
 * ("permission denied for table triage_error_distributions").
 *
 * - Erro conhecido do banco (sessão expirada, nome repetido): a frase em português
 *   que o Pagamentos Driver já usava desde 18/07 — agora vale pra todas as telas.
 * - Erro nosso (`new Error('...')`, já escrito em português): a mensagem, como sempre foi.
 * - Qualquer outro (objeto do Supabase, TypeError de rede, PostgrestError…):
 *   "<contexto>: <mensagem> (código X)" — ou "<contexto> Motivo: …" quando o
 *   contexto já termina em ponto ("Não consegui gerar. Tente de novo.").
 * - Nada aproveitável: só o contexto.
 */

/**
 * Erros do banco que têm uma frase certa pra quem usa. Veio de `throwDbError`
 * (Pagamentos Driver, bug de 18/07: sessão vencida aparecia como "Erro ao renomear
 * grupo"). Devolve null quando não é um desses.
 */
export function traduzirErroDoBanco(error: { message?: string; code?: string }): string | null {
  const msg = error.message ?? '';
  if (error.code === 'PGRST301' || (/jwt/i.test(msg) && /expired|invalid/i.test(msg))) {
    return 'Sessão expirada — saia e faça login novamente para continuar.';
  }
  if (error.code === '23505' || /duplicate key/i.test(msg)) {
    return 'Já existe um registro com esse nome.';
  }
  return null;
}

function juntar(contexto: string, causa: string): string {
  const base = contexto.trim();
  return /[.!?]$/.test(base) ? `${base} Motivo: ${causa}` : `${base}: ${causa}`;
}

export function mensagemDeErro(err: unknown, contexto: string): string {
  if (typeof err === 'string') {
    return err.trim() ? juntar(contexto, err.trim()) : contexto;
  }
  if (typeof err !== 'object' || err === null || !('message' in err)
    || typeof err.message !== 'string' || !err.message.trim()) {
    return contexto;
  }
  const mensagem = err.message.trim();
  const codigo = 'code' in err && typeof err.code === 'string' && err.code.trim()
    ? err.code.trim()
    : undefined;

  const traduzida = traduzirErroDoBanco({ message: mensagem, code: codigo });
  if (traduzida) return traduzida;

  // Erro nosso: `new Error('...')`, escrito pra quem usa — sai como está.
  if (err instanceof Error && err.name === 'Error') return err.message;

  return `${juntar(contexto, mensagem)}${codigo ? ` (código ${codigo})` : ''}`;
}
