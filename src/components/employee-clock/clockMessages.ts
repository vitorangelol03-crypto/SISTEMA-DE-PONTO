/** Mensagem de falha da batida de ponto.
 *
 * A edge fn clock-in-validated devolve o motivo em DOIS campos diferentes:
 * - `error`   → erros 4xx/5xx (ex.: "Nenhuma entrada registrada hoje")
 * - `message` → recusas de negócio com HTTP 200 (ex.: "Localização não
 *               fornecida", "Fora da área permitida (350m)")
 * A tela lia só `error`, então as recusas de geolocalização viravam um
 * "Erro ao registrar ponto" genérico e o funcionário não sabia a causa.
 */
export function clockFailureMessage(result: { error?: string; message?: string }): string {
  const reason = result.error ?? result.message;
  return reason ? `❌ ${reason}` : '❌ Erro ao registrar ponto. Tente novamente.';
}

/**
 * O servidor RECUSOU a batida com erro HTTP (06/10/2026, plano do tablet sem toque: "motivo real das
 * recusas"). Antes a tela jogava o motivo fora e mostrava "Erro ao registrar ponto" — inclusive pra
 * "Seu cadastro foi encerrado em DD/MM/AAAA" e "CPF não confere". `status` < 500 = o motivo é do
 * negócio e vai pra tela; 5xx = falha do servidor, continua a mensagem genérica.
 */
export class RecusaDoServidor extends Error {
  readonly status: number;

  constructor(motivo: string, status: number) {
    super(motivo);
    this.name = 'RecusaDoServidor';
    this.status = status;
  }
}

/** Mensagem da falha de uma batida que deu exceção (rede, prazo ou recusa HTTP do servidor). */
export function clockErrorMessage(err: unknown): string {
  if (err instanceof RecusaDoServidor && err.status < 500 && err.message) {
    return clockFailureMessage({ error: err.message });
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return '❌ Tempo esgotado. Verifique sua conexão e tente novamente.';
  }
  return '❌ Erro ao registrar ponto. Tente novamente.';
}
