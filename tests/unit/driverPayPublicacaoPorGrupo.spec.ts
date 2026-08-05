/**
 * "O espelho nunca vai ser lançado por driver, sempre por grupo e sempre para líder do
 * grupo" — decisão do Victor, 04/08/2026.
 *
 * O BUG QUE ISTO IMPEDE DE VOLTAR: ele marcou os grupos, a tela mostrou o espelho do grupo
 * (com os agregados), ele apertou "Publicar no app" — e cada membro recebeu um PDF só com
 * os próprios números, inclusive o líder. A prévia e a publicação eram códigos diferentes.
 * Agora as duas chamam `planejarPublicacao`, e este arquivo é quem prova que ela agrupa.
 *
 * ⚠️ Isto decide QUEM VÊ O DINHEIRO DE QUEM. Um erro aqui manda o espelho do grupo pra
 * pessoa errada — por isso os testes de destinatário são explícitos.
 *
 * Roda com: npx vitest run driverPayPublicacaoPorGrupo
 */
import { describe, it, expect } from 'vitest';
import { planejarPublicacao, type DriverRowData } from '../../src/components/driverpay/driverPayShared';

function row(driverId: string, groupName: string | null): DriverRowData {
  return {
    paymentId: `pay-${driverId}`, driverId, name: driverId.toUpperCase(), route: null, groupName,
    routes: [{ route: 'R1', packages: { SHOPEE: 100 }, packageIds: {}, rates: { SHOPEE: 2 } }],
    ratesByPlatform: { SHOPEE: 2 }, discounts: [], vales: [], pixKey: null, recebedorNome: null,
    recebedorPix: null, cpf: null, phone: null, active: true, notaFiscal: false,
    espelhoConferido: false, zapex: [], zapexRate: 0,
  } as unknown as DriverRowData;
}
const grupo = (id: string, name: string, leader: string | null) =>
  ({ id, name, leader_driver_id: leader });

describe('planejarPublicacao', () => {
  it('🎯 grupo vira UM espelho só, endereçado ao LÍDER', () => {
    const rows = [row('lider', 'G1'), row('ana', 'G1'), row('bia', 'G1')];
    const p = planejarPublicacao(rows, [grupo('g1', 'G1', 'lider')]);

    expect(p.grupos).toHaveLength(1);
    expect(p.grupos[0].leaderId).toBe('lider');
    expect(p.grupos[0].membros.map((m) => m.driverId)).toEqual(['lider', 'ana', 'bia']);
    // o ponto do bug: NINGUÉM do grupo recebe espelho individual
    expect(p.avulsos).toEqual([]);
  });

  it('🎯 membro de grupo NUNCA recebe espelho próprio — nem o líder', () => {
    const rows = [row('lider', 'G1'), row('ana', 'G1')];
    const p = planejarPublicacao(rows, [grupo('g1', 'G1', 'lider')]);
    const quemRecebeIndividual = p.avulsos.map((r) => r.driverId);
    expect(quemRecebeIndividual).not.toContain('ana');
    expect(quemRecebeIndividual).not.toContain('lider');
  });

  it('quem NÃO está em grupo recebe o seu — não há líder pra quem mandar', () => {
    const p = planejarPublicacao([row('solo', null)], []);
    expect(p.grupos).toEqual([]);
    expect(p.avulsos.map((r) => r.driverId)).toEqual(['solo']);
  });

  it('grupos e avulsos no mesmo relatório: 1 PDF por grupo + 1 por avulso', () => {
    const rows = [
      row('l1', 'G1'), row('a', 'G1'),
      row('l2', 'G2'), row('b', 'G2'), row('c', 'G2'),
      row('solo1', null), row('solo2', null),
    ];
    const p = planejarPublicacao(rows, [grupo('g1', 'G1', 'l1'), grupo('g2', 'G2', 'l2')]);
    expect(p.grupos).toHaveLength(2);
    expect(p.avulsos).toHaveLength(2);
    // 7 pessoas → 4 PDFs, não 7
    expect(p.grupos.length + p.avulsos.length).toBe(4);
  });

  it('🎯 grupo SEM LÍDER não é publicado — vira aviso, não vira espelho errado', () => {
    const rows = [row('x', 'G_SEM_LIDER'), row('y', 'G_SEM_LIDER')];
    const p = planejarPublicacao(rows, [grupo('g9', 'G_SEM_LIDER', null)]);
    expect(p.grupos).toEqual([]);
    expect(p.semLider).toEqual(['G_SEM_LIDER']);
    // e ninguém do grupo cai no individual como "consolo"
    expect(p.avulsos).toEqual([]);
  });

  it('grupo que nem existe no cadastro também vira aviso, não espelho', () => {
    const p = planejarPublicacao([row('x', 'FANTASMA')], []);
    expect(p.semLider).toEqual(['FANTASMA']);
    expect(p.grupos).toEqual([]);
  });

  it('🎯 LÍDER FORA da seleção continua sendo o destinatário', () => {
    // o líder não entregou nada nesta quinzena, então não está nas linhas do relatório —
    // mas o espelho do grupo é dele mesmo assim.
    const rows = [row('ana', 'G1'), row('bia', 'G1')];
    const p = planejarPublicacao(rows, [grupo('g1', 'G1', 'lider-ausente')]);
    expect(p.grupos[0].leaderId).toBe('lider-ausente');
    expect(p.grupos[0].membros.map((m) => m.driverId)).toEqual(['ana', 'bia']);
  });

  it('o groupId do cadastro vai junto (a publicação grava scope=group + groupId)', () => {
    const p = planejarPublicacao([row('a', 'G1')], [grupo('uuid-g1', 'G1', 'a')]);
    expect(p.grupos[0].groupId).toBe('uuid-g1');
  });

  it('um grupo só, um membro só: ainda é espelho de GRUPO', () => {
    const p = planejarPublicacao([row('unico', 'G1')], [grupo('g1', 'G1', 'unico')]);
    expect(p.grupos).toHaveLength(1);
    expect(p.avulsos).toEqual([]);
  });

  it('lista vazia não inventa nada', () => {
    const p = planejarPublicacao([], [grupo('g1', 'G1', 'l1')]);
    expect(p).toEqual({ grupos: [], avulsos: [], semLider: [] });
  });

  it('ordem estável: grupos e avisos em ordem alfabética', () => {
    const rows = [row('z', 'Zulu'), row('a', 'Alfa'), row('m', 'Mike')];
    const p = planejarPublicacao(rows, [
      grupo('g1', 'Zulu', 'z'), grupo('g2', 'Alfa', 'a'), grupo('g3', 'Mike', null),
    ]);
    expect(p.grupos.map((g) => g.groupName)).toEqual(['Alfa', 'Zulu']);
    expect(p.semLider).toEqual(['Mike']);
  });

  it('⚠️ ninguém é publicado DUAS vezes: cada driver aparece em um destino só', () => {
    const rows = [row('l1', 'G1'), row('a', 'G1'), row('solo', null)];
    const p = planejarPublicacao(rows, [grupo('g1', 'G1', 'l1')]);
    const todos = [...p.grupos.flatMap((g) => g.membros.map((m) => m.driverId)),
                   ...p.avulsos.map((r) => r.driverId)];
    expect(todos).toHaveLength(new Set(todos).size);
    expect(todos.sort()).toEqual(['a', 'l1', 'solo']);
  });
});
