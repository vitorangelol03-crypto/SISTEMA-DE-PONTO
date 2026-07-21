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
