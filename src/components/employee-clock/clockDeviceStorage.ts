/**
 * Segredo do tablet de ponto (30/09/2026, roadmap item 3).
 *
 * Fica guardado SÓ no aparelho (localStorage deste site). Se o navegador for limpo ou o tablet
 * formatado, o segredo some e o tablet precisa ser ativado de novo com um código novo do 2626
 * (decisão do Victor). O servidor guarda só o sha256.
 *
 * Armazenamento indisponível (modo anônimo, bloqueio do navegador) = "este aparelho não tem
 * segredo". Ler nunca derruba a tela; gravar falha ALTO, porque aí a ativação não serviria de
 * nada e a pessoa precisa saber.
 */
import type { ClockDevice } from '../../services/database';

const CHAVE = 'clock_device_token_v1';

export function lerSegredoDoTablet(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch (err) {
    console.warn('Tablet de ponto: armazenamento indisponível neste navegador — tratado como sem segredo.', err);
    return null;
  }
}

/** Lança se o navegador não deixar gravar — a tela de ativação mostra o motivo. */
export function guardarSegredoDoTablet(segredo: string): void {
  localStorage.setItem(CHAVE, segredo);
  if (localStorage.getItem(CHAVE) !== segredo) {
    throw new Error('Este navegador não deixou guardar a ativação (modo anônimo?). Use o navegador normal do tablet.');
  }
}

export function esquecerSegredoDoTablet(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch (err) {
    console.warn('Tablet de ponto: não foi possível apagar o segredo antigo.', err);
  }
}

/** Este tablet atende a empresa? (null = não é tablet). */
export function tabletAtendeEmpresa(tablet: ClockDevice | null, companyId: string | null | undefined): boolean {
  return !!tablet && !!companyId && tablet.companyIds.includes(companyId);
}

/**
 * A tela deve BARRAR este aparelho para esta empresa? Só quando a empresa ligou a trava e o
 * aparelho não é um tablet ativo dela. Quem decide de verdade é o servidor — isto só evita a
 * pessoa digitar CPF e senha pra descobrir no fim.
 */
export function aparelhoBarradoNaEmpresa(
  empresa: { id: string; require_clock_device?: boolean | null } | null | undefined,
  tablet: ClockDevice | null,
): boolean {
  if (!empresa || empresa.require_clock_device !== true) return false;
  return !tabletAtendeEmpresa(tablet, empresa.id);
}
