/**
 * Conta da facial — a parte PURA, usada pelas edge functions e testada no vitest.
 *
 * O descriptor do face-api são 128 números; "mesmo rosto" = distância euclidiana abaixo do
 * limite. A conta 1:1 (com CPF: o rosto do momento × o cadastrado DAQUELA pessoa) roda no
 * navegador (FaceVerification) e é reconferida no servidor (clock-in-validated). A 1:N (sem
 * CPF: o rosto do momento × TODOS os cadastrados da empresa) roda só no servidor
 * (employee-public-api, identify-face).
 *
 * 🔴 30/09/2026 — POR QUE O LIMITE DO 1:N SUBIU DE 0,42 PARA 0,50.
 * O 1:N nasceu (04/09) com 0,42, "mais rígido que o 1:1", pra não confundir uma pessoa com
 * outra. No dado real isso recusava GENTE CERTA: das 597 batidas com facial 1:1 aceitas em
 * 14 dias, 250 (42%) tinham distância entre 0,42 e 0,50 — a pessoa era ela mesma, confirmada
 * por CPF + senha + rosto, e mesmo assim a tela sem CPF diria "Não reconheci". Era a queixa
 * do tablet. Decisão do Victor (30/09): o 1:N passa a exigir o MESMO nível do 1:1.
 *
 * O que continua segurando a confusão entre pessoas, além do limite:
 *   1. MARGEM contra o 2º colocado — se dois cadastrados ficam parecidos demais com o rosto do
 *      momento, recusa como "ambíguo" em vez de escolher;
 *   2. a tela mostra o NOME e espera 3s, com "Não sou eu";
 *   3. o clock-in-validated reconfere o mesmo rosto 1:1 contra a pessoa escolhida.
 * No cadastro real de Caratinga (1.176 pares), os dois rostos de pessoas DIFERENTES mais
 * parecidos entre si ficam a 0,463 — e num espaço de 128 dimensões o rosto do momento de A
 * fica, tipicamente, bem mais longe de B do que de A.
 */

/** Distância máxima (exclusiva) para "é a mesma pessoa" — 1:1 E 1:N (30/09/2026). */
export const LIMITE_FACIAL = 0.5;

/** Diferença mínima entre o 1º e o 2º colocado para o 1:N escolher alguém. */
export const MARGEM_MINIMA_1N = 0.08;

export interface CandidatoFacial {
  id: string;
  name: string;
  cpf: string;
  distance: number;
}

export type DesfechoDaIdentificacao = 'matched' | 'no_match' | 'ambiguous' | 'no_candidates';

export interface ResultadoDaIdentificacao<T extends CandidatoFacial = CandidatoFacial> {
  outcome: DesfechoDaIdentificacao;
  /** O mais parecido (null só quando não há ninguém cadastrado). */
  best: T | null;
  /** O 2º mais parecido (null quando há um só cadastrado). */
  second: T | null;
}

/** Decide QUEM é o rosto do momento, entre os candidatos já medidos (qualquer ordem).
 *  Genérico (06/10/2026): devolve o candidato do MESMO tipo que entrou (ex.: com a empresa). */
export function decidirIdentificacao<T extends CandidatoFacial>(candidatos: readonly T[]): ResultadoDaIdentificacao<T> {
  const ordenados = [...candidatos]
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance);
  const best = ordenados[0] ?? null;
  const second = ordenados[1] ?? null;

  if (!best) return { outcome: 'no_candidates', best: null, second: null };
  if (!(best.distance < LIMITE_FACIAL)) return { outcome: 'no_match', best, second };
  if (second && second.distance - best.distance < MARGEM_MINIMA_1N) {
    return { outcome: 'ambiguous', best, second };
  }
  return { outcome: 'matched', best, second };
}

// ─── MODO GALPÃO — o rosto procurado em TODAS as empresas do tablet (06/10/2026) ──────────────
// Decisão 7 do plano do tablet sem toque (.claude-checkpoints/PLANO_TABLET_SEM_TOQUE_2026-10-05.md):
// Caratinga e Ponte Nova no MESMO galpão, um tablet só; reconhecer as duas pelo rosto.

/** Um candidato com a empresa da ficha (cada ficha é de uma empresa só). */
export interface CandidatoFacialComEmpresa extends CandidatoFacial {
  companyId: string;
}

/**
 * A mesma pessoa pode ter ficha nas DUAS empresas do tablet (mesmo CPF, um rosto cadastrado em
 * cada). Sem juntar, as duas fichas seriam 1º e 2º colocados quase empatados e o 1:N recusaria
 * como "ambíguo" TODA vez. Junta por CPF (só os dígitos) e fica, por pessoa, com a ficha MAIS
 * PARECIDA — a decisão de QUAL ficha bate o ponto vem depois (escolherFichaDaPessoa). Ficha sem
 * CPF fica como está (sem como saber se é a mesma pessoa).
 */
export function juntarCandidatosPorCpf<T extends CandidatoFacial>(candidatos: readonly T[]): T[] {
  const melhorPorCpf = new Map<string, T>();
  const semCpf: T[] = [];
  for (const c of candidatos) {
    const chave = String(c.cpf ?? '').replace(/\D/g, '');
    if (!chave) {
      semCpf.push(c);
      continue;
    }
    const atual = melhorPorCpf.get(chave);
    if (!atual || c.distance < atual.distance) melhorPorCpf.set(chave, c);
  }
  return [...melhorPorCpf.values(), ...semCpf];
}

/** As fichas da mesma pessoa (mesmo CPF) que TAMBÉM batem com o rosto — só elas podem bater o
 *  ponto: o 1:1 do clock-in-validated confere o rosto contra a ficha escolhida. */
export function fichasDaPessoa<T extends CandidatoFacial>(candidatos: readonly T[], escolhido: T): T[] {
  const cpf = String(escolhido.cpf ?? '').replace(/\D/g, '');
  if (!cpf) return [escolhido];
  return candidatos.filter((c) => String(c.cpf ?? '').replace(/\D/g, '') === cpf && c.distance < LIMITE_FACIAL);
}

/** O dia tem ponto ABERTO? (entrou e ainda não deu a saída final — 2 ou 4 marcações). */
export function pontoAbertoNoDia(att: {
  entry_time?: string | null;
  entry_1_time?: string | null;
  exit_time_full?: string | null;
  exit_2_time?: string | null;
} | null | undefined): boolean {
  if (!att) return false;
  const entrou = !!(att.entry_1_time ?? att.entry_time);
  const saiu = !!(att.exit_2_time ?? att.exit_time_full);
  return entrou && !saiu;
}

/**
 * Decisão 7: quem tem ficha nas duas empresas bate onde JÁ TEM PONTO ABERTO no dia; sem ponto
 * aberto, na empresa "de casa" do tablet (a da tela); sem ficha na de casa, na mais parecida.
 */
export function escolherFichaDaPessoa<T extends CandidatoFacialComEmpresa>(
  fichas: readonly T[],
  empresaDeCasa: string,
  comPontoAberto: ReadonlySet<string>,
): T | null {
  if (fichas.length === 0) return null;
  const aberta = fichas.find((f) => comPontoAberto.has(f.id));
  if (aberta) return aberta;
  const deCasa = fichas.find((f) => f.companyId === empresaDeCasa);
  if (deCasa) return deCasa;
  return [...fichas].sort((a, b) => a.distance - b.distance)[0];
}
