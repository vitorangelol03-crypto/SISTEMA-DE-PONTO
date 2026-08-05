/**
 * Ordem e filtro COMBINADOS (05/08/2026, pedido do Victor: "quero as duas possibilidades").
 *
 * Decisões dele:
 *  · PLATAFORMA e ROTA marcando dois = **só quem tem os dois** ("se for em grupo, o grupo some");
 *  · GRUPO é a exceção obrigatória: um entregador está em UM grupo só, então marcar dois é
 *    "qualquer um dos dois" — com "todos" a lista viria sempre vazia;
 *  · nada fica salvo: recarregou, volta ao normal (por isso não há teste de persistência).
 *
 * ⚠️ Filtro decide QUEM SOME DA TELA. Sumir alguém sem querer = pagar a menos. Daí os testes
 * de "nada marcado não esconde ninguém" e de grupo vazio.
 *
 * Roda com: npx vitest run driverPayOrdemFiltroCombinados
 */
import { describe, it, expect } from 'vitest';
import {
  toggleSortCriteria,
  compararPorCriterios,
  toggleValorDeFiltro,
  temTodasAsPlataformas,
  temTodasAsRotas,
  estaEmAlgumGrupo,
  type SortCriterion,
  type DriverRowData,
} from '../../src/components/driverpay/driverPayShared';

/** Driver com rotas e pacotes: [rota, { PLATAFORMA: pacotes }]. */
function row(
  nome: string,
  rotas: Array<[string, Record<string, number>]>,
  groupName: string | null = null,
): DriverRowData {
  return {
    paymentId: `pay-${nome}`, driverId: nome, name: nome, route: null, groupName,
    routes: rotas.map(([route, packages]) => ({ route, packages, packageIds: {}, rates: {} })),
    ratesByPlatform: {}, discounts: [], vales: [], pixKey: null, recebedorNome: null,
    recebedorPix: null, cpf: null, phone: null, active: true, notaFiscal: false,
    espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}

// ── Empilhar critérios de ordem ─────────────────────────────────────────────
describe('toggleSortCriteria — 3 cliques, agora empilhando', () => {
  it('1º clique entra como maior→menor', () => {
    expect(toggleSortCriteria([], 'net')).toEqual([{ key: 'net', dir: 'desc' }]);
  });

  it('2º clique inverte', () => {
    expect(toggleSortCriteria([{ key: 'net', dir: 'desc' }], 'net')).toEqual([{ key: 'net', dir: 'asc' }]);
  });

  it('3º clique remove', () => {
    expect(toggleSortCriteria([{ key: 'net', dir: 'asc' }], 'net')).toEqual([]);
  });

  it('🎯 clicar noutro botão EMPILHA — não troca o primeiro', () => {
    const p1 = toggleSortCriteria([], 'espelhoApp');
    const p2 = toggleSortCriteria(p1, 'net');
    expect(p2).toEqual([{ key: 'espelhoApp', dir: 'desc' }, { key: 'net', dir: 'desc' }]);
  });

  it('🎯 inverter um critério do MEIO não muda a posição dele', () => {
    const pilha: SortCriterion[] = [
      { key: 'a', dir: 'desc' }, { key: 'b', dir: 'desc' }, { key: 'c', dir: 'desc' },
    ];
    expect(toggleSortCriteria(pilha, 'b').map((x) => x.key)).toEqual(['a', 'b', 'c']);
    expect(toggleSortCriteria(pilha, 'b')[1].dir).toBe('asc');
  });

  it('remover do meio mantém os outros na ordem', () => {
    const pilha: SortCriterion[] = [
      { key: 'a', dir: 'desc' }, { key: 'b', dir: 'asc' }, { key: 'c', dir: 'desc' },
    ];
    expect(toggleSortCriteria(pilha, 'b').map((x) => x.key)).toEqual(['a', 'c']);
  });

  it('não muda a pilha original (sem efeito colateral)', () => {
    const pilha: SortCriterion[] = [{ key: 'a', dir: 'desc' }];
    toggleSortCriteria(pilha, 'b');
    expect(pilha).toEqual([{ key: 'a', dir: 'desc' }]);
  });
});

// ── Ordenar em cascata ──────────────────────────────────────────────────────
describe('compararPorCriterios — o 2º só desempata o 1º', () => {
  interface G { nome: string; espelho: number; valor: number }
  const metrica = (g: G, k: string) => (k === 'espelho' ? g.espelho : g.valor);
  const ordenar = (list: G[], cs: SortCriterion[]) =>
    [...list].sort((a, b) => compararPorCriterios(a, b, cs, metrica) || a.nome.localeCompare(b.nome))
      .map((g) => g.nome);

  const dados: G[] = [
    { nome: 'A', espelho: 1, valor: 100 },
    { nome: 'B', espelho: 0, valor: 900 },
    { nome: 'C', espelho: 1, valor: 500 },
    { nome: 'D', espelho: 0, valor: 200 },
  ];

  it('🎯 caso do Victor: "Espelho no app" e depois "Total a receber"', () => {
    // primeiro quem TEM espelho (desc), e dentro disso do que paga mais pro que paga menos
    expect(ordenar(dados, [{ key: 'espelho', dir: 'desc' }, { key: 'valor', dir: 'desc' }]))
      .toEqual(['C', 'A', 'B', 'D']);
  });

  it('o 2º critério NÃO manda em quem já foi separado pelo 1º', () => {
    // B tem o maior valor (900) mas não tem espelho: fica atrás de A e C mesmo assim
    const r = ordenar(dados, [{ key: 'espelho', dir: 'desc' }, { key: 'valor', dir: 'desc' }]);
    expect(r.indexOf('B')).toBeGreaterThan(r.indexOf('A'));
  });

  it('inverter só o 2º critério muda só o desempate', () => {
    expect(ordenar(dados, [{ key: 'espelho', dir: 'desc' }, { key: 'valor', dir: 'asc' }]))
      .toEqual(['A', 'C', 'D', 'B']);
  });

  it('um critério só se comporta como antes', () => {
    expect(ordenar(dados, [{ key: 'valor', dir: 'desc' }])).toEqual(['B', 'C', 'D', 'A']);
  });

  it('pilha vazia não reordena nada (devolve 0 sempre)', () => {
    expect(compararPorCriterios(dados[0], dados[1], [], metrica)).toBe(0);
  });

  /**
   * 🔴 05/08/2026 — "está subindo pessoas sem notas primeiro que pessoal com nota validada".
   *
   * Ordenando os grupos por NOTA VALIDADA, quem não tem nota a mandar (0 pacote na quinzena)
   * valia o mesmo que "tudo validado" e subia junto com eles. Não é "pronto" nem "devendo":
   * está FORA da pergunta — e agora a métrica devolve `null` pra dizer isso.
   */
  describe('null = "não se aplica" (05/08/2026)', () => {
    interface N { nome: string; nf: number | null }
    const mNf = (g: N) => g.nf;
    const ordenarNf = (list: N[], dir: 'asc' | 'desc') =>
      [...list].sort((a, b) => compararPorCriterios(a, b, [{ key: 'nf', dir }], mNf) || a.nome.localeCompare(b.nome))
        .map((g) => g.nome);

    const grupos: N[] = [
      { nome: 'ValidouTudo', nf: 2 },
      { nome: 'SemNota', nf: null },
      { nome: 'Parcial', nf: 1 },
      { nome: 'NadaValidado', nf: 0 },
    ];

    it('🎯 "validados primeiro": quem não tem nota vai pro FIM, não pro topo', () => {
      expect(ordenarNf(grupos, 'desc')).toEqual(['ValidouTudo', 'Parcial', 'NadaValidado', 'SemNota']);
    });

    it('🔴 invertendo, ele CONTINUA no fim — não vira o topo do "quem falta"', () => {
      // Se o null obedecesse à direção, o problema só mudaria de lugar: quem não deve nada
      // encabeçaria a lista de quem está devendo.
      expect(ordenarNf(grupos, 'asc')).toEqual(['NadaValidado', 'Parcial', 'ValidouTudo', 'SemNota']);
    });

    it('dois "não se aplica" empatam e caem pro próximo critério', () => {
      const a = { nome: 'A', nf: null };
      const b = { nome: 'B', nf: null };
      expect(compararPorCriterios(a, b, [{ key: 'nf', dir: 'desc' }], mNf)).toBe(0);
    });

    it('null não atrapalha quem tem número no critério seguinte', () => {
      interface M { nome: string; nf: number | null; valor: number }
      const m = (g: M, k: string) => (k === 'nf' ? g.nf : g.valor);
      const lista: M[] = [
        { nome: 'SemNotaRico', nf: null, valor: 999 },
        { nome: 'ValidouPobre', nf: 2, valor: 1 },
      ];
      const r = [...lista]
        .sort((a, b) => compararPorCriterios(a, b, [{ key: 'nf', dir: 'desc' }, { key: 'valor', dir: 'desc' }], m))
        .map((g) => g.nome);
      expect(r).toEqual(['ValidouPobre', 'SemNotaRico']);
    });
  });

  it('empate total devolve 0 — quem chama é que desempata', () => {
    const x = { nome: 'X', espelho: 1, valor: 10 };
    const y = { nome: 'Y', espelho: 1, valor: 10 };
    expect(compararPorCriterios(x, y, [{ key: 'espelho', dir: 'desc' }, { key: 'valor', dir: 'desc' }], metrica))
      .toBe(0);
  });

  it('texto ordena por ordem alfabética do português (acento não vai pro fim)', () => {
    const nomes = [{ n: 'Zeca' }, { n: 'Ângela' }, { n: 'Bruno' }];
    const r = [...nomes]
      .sort((a, b) => compararPorCriterios(a, b, [{ key: 'n', dir: 'asc' }], (x) => x.n))
      .map((x) => x.n);
    expect(r).toEqual(['Ângela', 'Bruno', 'Zeca']);
  });
});

// ── Filtro com vários valores ───────────────────────────────────────────────
describe('toggleValorDeFiltro', () => {
  it('marca, marca outro, desmarca o primeiro', () => {
    let f = toggleValorDeFiltro([], 'SHOPEE');
    f = toggleValorDeFiltro(f, 'LOGGI');
    expect(f).toEqual(['SHOPEE', 'LOGGI']);
    expect(toggleValorDeFiltro(f, 'SHOPEE')).toEqual(['LOGGI']);
  });
});

describe('temTodasAsPlataformas — decisão "só quem tem as duas"', () => {
  const caio = row('caio', [['R1', { SHOPEE: 100, LOGGI: 50 }]]);
  const tales = row('tales', [['R1', { SHOPEE: 200 }]]);

  it('🎯 marcou SHOPEE + LOGGI: quem tem as duas fica', () => {
    expect(temTodasAsPlataformas(caio, ['SHOPEE', 'LOGGI'])).toBe(true);
  });

  it('🎯 quem tem só uma SOME', () => {
    expect(temTodasAsPlataformas(tales, ['SHOPEE', 'LOGGI'])).toBe(false);
  });

  it('⚠️ nada marcado não esconde ninguém', () => {
    expect(temTodasAsPlataformas(tales, [])).toBe(true);
  });

  it('plataforma com 0 pacote conta como NÃO tem', () => {
    const zerado = row('z', [['R1', { SHOPEE: 100, LOGGI: 0 }]]);
    expect(temTodasAsPlataformas(zerado, ['SHOPEE', 'LOGGI'])).toBe(false);
  });

  it('soma as rotas antes de decidir (a LOGGI está na 2ª rota)', () => {
    const duasRotas = row('d', [['R1', { SHOPEE: 100 }], ['R2', { LOGGI: 30 }]]);
    expect(temTodasAsPlataformas(duasRotas, ['SHOPEE', 'LOGGI'])).toBe(true);
  });

  it('🎯 GRUPO INTEIRO some quando nenhum membro passa', () => {
    const grupo = [row('a', [['R1', { SHOPEE: 1 }]], 'G1'), row('b', [['R1', { SHOPEE: 1 }]], 'G1')];
    expect(grupo.filter((r) => temTodasAsPlataformas(r, ['SHOPEE', 'LOGGI']))).toEqual([]);
  });
});

describe('temTodasAsRotas', () => {
  const r = row('caio', [['Inhapim', { SHOPEE: 1 }], ['Caratinga', { SHOPEE: 1 }]]);

  it('quem roda as duas fica', () => {
    expect(temTodasAsRotas(r, ['Inhapim', 'Caratinga'])).toBe(true);
  });

  it('quem roda só uma some', () => {
    expect(temTodasAsRotas(r, ['Inhapim', 'Ipanema'])).toBe(false);
  });

  it('nada marcado não esconde ninguém', () => {
    expect(temTodasAsRotas(r, [])).toBe(true);
  });
});

describe('estaEmAlgumGrupo — a exceção obrigatória', () => {
  const SEM = 'Sem grupo';
  const caio = row('caio', [['R1', {}]], 'G1');
  const solo = row('solo', [['R1', {}]], null);

  it('🎯 marcar DOIS grupos mostra os dois — "todos" daria lista vazia sempre', () => {
    expect(estaEmAlgumGrupo(caio, ['G1', 'G2'], SEM)).toBe(true);
  });

  it('quem não está em nenhum dos marcados some', () => {
    expect(estaEmAlgumGrupo(caio, ['G2', 'G3'], SEM)).toBe(false);
  });

  it('"Sem grupo" marcado traz quem não tem grupo', () => {
    expect(estaEmAlgumGrupo(solo, [SEM], SEM)).toBe(true);
    expect(estaEmAlgumGrupo(caio, [SEM], SEM)).toBe(false);
  });

  it('"Sem grupo" junto de um grupo real traz os dois', () => {
    expect(estaEmAlgumGrupo(solo, ['G1', SEM], SEM)).toBe(true);
    expect(estaEmAlgumGrupo(caio, ['G1', SEM], SEM)).toBe(true);
  });

  it('nada marcado não esconde ninguém', () => {
    expect(estaEmAlgumGrupo(caio, [], SEM)).toBe(true);
    expect(estaEmAlgumGrupo(solo, [], SEM)).toBe(true);
  });
});

// ── Os filtros se somam entre si (o que já valia, agora com vários valores) ──
describe('filtros combinados entre campos', () => {
  it('🎯 plataforma E grupo ao mesmo tempo: passa quem atende os dois', () => {
    const rows = [
      row('a', [['R1', { SHOPEE: 1, LOGGI: 1 }]], 'G1'), // passa
      row('b', [['R1', { SHOPEE: 1 }]], 'G1'),           // some (falta LOGGI)
      row('c', [['R1', { SHOPEE: 1, LOGGI: 1 }]], 'G9'), // some (grupo fora)
    ];
    const passou = rows.filter(
      (r) => temTodasAsPlataformas(r, ['SHOPEE', 'LOGGI']) && estaEmAlgumGrupo(r, ['G1'], 'Sem grupo'),
    );
    expect(passou.map((r) => r.name)).toEqual(['a']);
  });
});
