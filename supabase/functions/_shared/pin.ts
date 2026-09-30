/**
 * Conferência do PIN do funcionário — UM lugar só (30/09/2026).
 *
 * A mesma conta estava copiada em verify-pin, employee-receipts e agora seria em save-face,
 * face-descriptor e clock-in-validated. Cópia de regra de senha é como nasceu o bug de 26/08
 * (verify-pin só comparava o PIN em texto e travou o login de 70 pessoas).
 *
 * pin_hash (bcrypt) manda; o `pin` em texto só vale pra quem ainda não tem hash (em 30/09 não
 * havia NENHUM PIN em texto no banco — o caminho fica só por compatibilidade).
 *
 * `compare` async é normal no Deno; o que trava é o `hash()` async (ver set-pin: hashSync).
 */
import bcryptjsSemTipos from 'https://esm.sh/bcryptjs@2.4.3?no-dts';

/**
 * A parte do bcryptjs que o sistema usa, com tipo. `?no-dts`: o esm.sh anexava os tipos do
 * @types/bcryptjs, que descrevem exportações NOMEADAS — mas o módulo só tem `default` (medido no
 * Deno em 30/09/2026: `Object.keys(ns) = ['default']`), e o `deno check` acusava TS1192 no import
 * que funciona em produção desde agosto. Mesmo código em execução; só os tipos ficam aqui.
 */
export const bcryptjs = bcryptjsSemTipos as {
  compare(texto: string, hash: string): Promise<boolean>;
  hashSync(texto: string, rodadas: number): string;
};

/** Formato de um PIN NOVO (criação). A conferência não exige isto — ver pinConfere. */
export const PIN_FORMATO = /^\d{4,6}$/;

export interface LinhaDoPin {
  pin: string | null;
  pin_hash: string | null;
}

/**
 * true só se o PIN digitado bate com o do funcionário. NÃO exige o formato de criação (um PIN
 * antigo fora do padrão não pode trancar ninguém fora do ponto) — só barra vazio e texto enorme
 * antes de ir ao bcrypt.
 */
export async function pinConfere(pinDigitado: unknown, linha: LinhaDoPin | null | undefined): Promise<boolean> {
  if (typeof pinDigitado !== 'string' || pinDigitado.length === 0 || pinDigitado.length > 12 || !linha) return false;
  if (linha.pin_hash) {
    try {
      return await bcryptjs.compare(pinDigitado, linha.pin_hash);
    } catch (err) {
      console.error('[pin] bcrypt compare falhou:', err);
      return false;
    }
  }
  return Boolean(linha.pin && linha.pin === pinDigitado);
}
