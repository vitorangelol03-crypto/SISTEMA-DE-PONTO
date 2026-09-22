/**
 * O QUE FALTA NA FICHA PRA FOLHA SAIR (22/09/2026).
 *
 * O motor da folha está pronto, mas ele é honesto: sem salário na ficha, `folhaDaPessoa`
 * devolve `SEM_FOLHA` e a pessoa simplesmente **não tem linha de folha** — em silêncio.
 * Sem data de admissão, `feriasPorAvos` devolve `semAdmissao` e o direito não é calculado.
 * Quem olha a tela vê "não tem nada", não "falta preencher".
 *
 * Hoje (22/09/2026) isso é o estado real da operação: em Caratinga, **14 de 14** fichas de
 * carteira assinada estão sem salário e **12** sem data de admissão. Ou seja, o sistema
 * está pronto e o que falta é anexar o dado — e é exatamente isso que esta conta mostra,
 * com nome e sobrenome, em vez de deixar a pessoa descobrir pela ausência.
 *
 * ⚠️ Isto NÃO inventa dado e não muda conta nenhuma: é leitura da ficha, agrupada.
 */

/** O mínimo que a conta precisa saber de uma ficha. */
export interface FichaParaPendencia {
  id: string;
  name: string;
  employment_type?: string | null;
  contract_type?: string | null;
  monthly_salary?: number | null;
  hire_date?: string | null;
  fgts_enabled?: boolean | null;
  registration_status?: string | null;
  termination_date?: string | null;
}

/**
 * Os dois campos de vínculo falam idiomas diferentes: o operacional diz
 * "Carteira Assinada", o de cadastro diz "CLT" — e é a MESMA coisa (21 fichas hoje).
 * Comparar as duas strings cruas acusaria 21 divergências falsas e esconderia as 6 de
 * verdade (`Diarista` × `CLT`), que são as que precisam de decisão humana.
 */
function vinculoCanonico(valor?: string | null): string | null {
  const v = (valor ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'clt' || v === 'carteira assinada') return 'clt';
  if (v === 'diarista') return 'diarista';
  return v;
}

export type TipoDePendencia =
  /** Carteira assinada sem salário: a folha do mês NÃO sai pra ela. */
  | 'sem-salario'
  /** Sem data de admissão: férias, 13º e rescisão não têm como contar os avos. */
  | 'sem-admissao'
  /** Carteira assinada com o FGTS desligado na ficha — some do recibo e do custo. */
  | 'fgts-desligado'
  /** Os dois campos de vínculo discordam DE VERDADE (ex.: Diarista × CLT). */
  | 'vinculo-divergente'
  /** Carteira assinada que ainda não foi aprovada no cadastro — não entra em folha nenhuma. */
  | 'cadastro-pendente';

export interface Pendencia {
  tipo: TipoDePendencia;
  /** Uma frase que explica o efeito, não o campo — é o que o leigo precisa ler. */
  efeito: string;
  pessoas: { id: string; name: string; detalhe?: string }[];
}

/** Só quem está de fato na casa: aprovado e sem data de saída. */
function estaNaCasa(f: FichaParaPendencia): boolean {
  if (f.termination_date) return false;
  const status = (f.registration_status ?? 'approved').toLowerCase();
  return status === 'approved';
}

/** Cadastro ainda esperando o "aprovar" — pode estar batendo ponto todo dia mesmo assim. */
function esperandoAprovacao(f: FichaParaPendencia): boolean {
  if (f.termination_date) return false;
  return (f.registration_status ?? '').toLowerCase() === 'pending';
}

const ehCarteira = (f: FichaParaPendencia): boolean => vinculoCanonico(f.employment_type) === 'clt';

/**
 * As pendências de cadastro que impedem a folha de sair certa, agrupadas por tipo.
 *
 * Devolve só os tipos que têm gente — lista vazia significa, de verdade, que não falta
 * nada. A ordem é a do impacto: sem salário não sai folha nenhuma; vínculo divergente é
 * aviso.
 */
export function pendenciasDeCadastro(fichas: readonly FichaParaPendencia[]): Pendencia[] {
  const naCasa = fichas.filter(estaNaCasa);
  const carteira = naCasa.filter(ehCarteira);

  const semSalario = carteira.filter((f) => !(Number(f.monthly_salary ?? 0) > 0));
  const semAdmissao = carteira.filter((f) => !(f.hire_date ?? '').trim());
  const semFgts = carteira.filter((f) => f.fgts_enabled !== true);
  const vinculoDivergente = naCasa.filter((f) => {
    const operacional = vinculoCanonico(f.employment_type);
    const cadastro = vinculoCanonico(f.contract_type);
    return operacional !== null && cadastro !== null && operacional !== cadastro;
  });
  const cadastroPendente = fichas.filter((f) => esperandoAprovacao(f) && ehCarteira(f));

  const pendencias: Pendencia[] = [
    {
      tipo: 'sem-salario',
      efeito: 'A folha do mês NÃO sai para estas pessoas — sem salário na ficha não há o que calcular.',
      pessoas: semSalario.map((f) => ({ id: f.id, name: f.name })),
    },
    {
      tipo: 'sem-admissao',
      efeito: 'Férias, 13º e rescisão ficam sem contar os avos: o sistema não chuta a data de admissão.',
      pessoas: semAdmissao.map((f) => ({ id: f.id, name: f.name })),
    },
    {
      tipo: 'fgts-desligado',
      efeito: 'Carteira assinada com o FGTS desligado na ficha: o recibo sai sem a base e sem o valor.',
      pessoas: semFgts.map((f) => ({ id: f.id, name: f.name })),
    },
    {
      tipo: 'cadastro-pendente',
      efeito: 'Carteira assinada com o cadastro ainda NÃO aprovado: não entra em folha, 13º, férias nem relatório de folha — mesmo batendo ponto todo dia.',
      pessoas: cadastroPendente.map((f) => ({ id: f.id, name: f.name })),
    },
    {
      tipo: 'vinculo-divergente',
      efeito: 'Os dois campos de vínculo discordam. Quem manda na folha é o "Tipo de vínculo" (employment_type).',
      pessoas: vinculoDivergente.map((f) => ({
        id: f.id,
        name: f.name,
        detalhe: `${f.employment_type} × ${f.contract_type}`,
      })),
    },
  ];

  return pendencias.filter((p) => p.pessoas.length > 0);
}

/** Quantas pessoas, no total, têm ao menos uma pendência (a mesma pessoa não conta duas vezes). */
export function quantasPessoasComPendencia(pendencias: readonly Pendencia[]): number {
  const ids = new Set<string>();
  for (const p of pendencias) for (const pessoa of p.pessoas) ids.add(pessoa.id);
  return ids.size;
}
