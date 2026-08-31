/**
 * Selo "no app" (espelho publicado) da linha — ciente de grupo (31/08/2026).
 *
 * Relato do Victor: "os filtros não estão funcionando... filtro certinho no topo, mas
 * rolando pra baixo aparece gente misturada". Investigado com dados REAIS de produção
 * (Caratinga): o filtro "Espelho no app · Publicado" (`isRowPublished` em DriverPayTab)
 * já era ciente de grupo — só o líder publica e conta pro grupo inteiro — mas o SELO "no
 * app" de cada linha (`DriverList`/`DriverRow`) olhava só `publishedDriverIds.has(driverId)`,
 * sem checar o grupo. Medido ao vivo: das 113 linhas que passavam no filtro "Publicado",
 * 61 apareciam SEM o selo — todo membro que não era o líder, misturado com os poucos que
 * tinham (exatamente o "filtro certinho, mas misturado ao rolar" relatado).
 *
 * Fix: filtro e selo agora chamam a MESMA função pura (`rowPublicadoNoApp`) — não tem
 * mais como divergir.
 *
 * Roda com: npx vitest run driverPayEspelhoNoAppSelo
 */
import { describe, it, expect } from 'vitest';
import { rowPublicadoNoApp } from '../../src/components/driverpay/driverPayShared';

describe('rowPublicadoNoApp', () => {
  const publishedDriverIds = new Set(['lider-id']);
  const publishedGroups = new Set(['Raul Soares, MG']);

  it('🔴 o caso do bug real: MEMBRO de grupo publicado (não é o líder) conta como publicado', () => {
    const membro = { groupName: 'Raul Soares, MG', driverId: 'membro-id' };
    expect(rowPublicadoNoApp(membro, publishedDriverIds, publishedGroups)).toBe(true);
  });

  it('o líder (cujo driverId está em publishedDriverIds) também conta', () => {
    const lider = { groupName: 'Raul Soares, MG', driverId: 'lider-id' };
    expect(rowPublicadoNoApp(lider, publishedDriverIds, publishedGroups)).toBe(true);
  });

  it('membro de um grupo DIFERENTE (não publicado) NÃO conta', () => {
    const outroGrupo = { groupName: 'Outro Grupo', driverId: 'quem-nao-publicou' };
    expect(rowPublicadoNoApp(outroGrupo, publishedDriverIds, publishedGroups)).toBe(false);
  });

  it('driver AVULSO (sem grupo) segue pelo driverId — publicado só se ELE publicou', () => {
    const avulsoPublicou = { groupName: null, driverId: 'lider-id' };
    const avulsoNao = { groupName: null, driverId: 'ninguem' };
    expect(rowPublicadoNoApp(avulsoPublicou, publishedDriverIds, publishedGroups)).toBe(true);
    expect(rowPublicadoNoApp(avulsoNao, publishedDriverIds, publishedGroups)).toBe(false);
  });

  it('Sets vazios (nada publicado ainda) → sempre false', () => {
    const linha = { groupName: 'Qualquer Grupo', driverId: 'qualquer-id' };
    expect(rowPublicadoNoApp(linha, new Set(), new Set())).toBe(false);
  });
});
