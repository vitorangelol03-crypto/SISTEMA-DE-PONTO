/**
 * O texto de um erro pra mostrar na tela, sem esconder a causa.
 *
 * O Supabase devolve o `error` de `{ data, error }` como OBJETO COMUM — não é
 * `instanceof Error` — então a tela que só olhava `instanceof Error` caía sempre
 * no texto genérico. Em 15/09/2026 isso deixou a distribuição de triagem 12 dias
 * dizendo só "Erro ao distribuir", quando o banco dizia exatamente o que era
 * ("permission denied for table triage_error_distributions").
 *
 * - Erro nosso (`Error`, já escrito em português): a mensagem, como sempre foi.
 * - Erro do Supabase: "<contexto>: <mensagem do banco> (código X)".
 * - Nada aproveitável: só o contexto.
 */
export function mensagemDeErro(err: unknown, contexto: string): string {
  if (err instanceof Error) {
    return err.message.trim() ? err.message : contexto;
  }
  if (typeof err === 'string') {
    return err.trim() ? `${contexto}: ${err.trim()}` : contexto;
  }
  if (typeof err === 'object' && err !== null && 'message' in err
    && typeof err.message === 'string' && err.message.trim()) {
    const codigo = 'code' in err && typeof err.code === 'string' && err.code.trim()
      ? ` (código ${err.code.trim()})`
      : '';
    return `${contexto}: ${err.message.trim()}${codigo}`;
  }
  return contexto;
}
