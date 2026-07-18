import { describe, it, expect } from 'vitest';
import { summarizeDriverImport, type ImportResolvedItem } from '../../src/utils/driverImportApply';

describe('summarizeDriverImport — previa do que a aplicacao vai fazer', () => {
  it('conta criar / afetados / pacotes / apelidos / ignorados', () => {
    const items: ImportResolvedItem[] = [
      // mesmo driver existente em 2 cidades (conta como 1 afetado)
      { driverRaw: 'A', aliasNorm: 'a', city: 'X', platform: 'eMile', packages: 10, resolution: { kind: 'existing', driverId: 'd1', driverName: 'A', learnAlias: false } },
      { driverRaw: 'A', aliasNorm: 'a', city: 'Y', platform: 'eMile', packages: 5, resolution: { kind: 'existing', driverId: 'd1', driverName: 'A', learnAlias: false } },
      // driver novo (cria + aprende apelido)
      { driverRaw: 'Novo1', aliasNorm: 'novo1', city: 'Z', platform: 'SHOPEE', packages: 7, resolution: { kind: 'create', name: 'Novo Um' } },
      // vinculo manual a existente com aprender apelido
      { driverRaw: 'Vinc', aliasNorm: 'vinc', city: 'W', platform: 'ANJUN', packages: 3, resolution: { kind: 'existing', driverId: 'd2', driverName: 'B', learnAlias: true } },
      // ignorado (nao conta pacotes nem afetados)
      { driverRaw: 'Ign', aliasNorm: 'ign', city: '', platform: 'eMile', packages: 99, resolution: { kind: 'ignore' } },
    ];
    const s = summarizeDriverImport(items);
    expect(s.driversToCreate).toBe(1); // Novo1
    expect(s.driversAffected).toBe(3); // d1, new:Novo1, d2
    expect(s.packages).toBe(25); // 10+5+7+3 (Ign=99 ignorado)
    expect(s.aliasesToLearn).toBe(2); // Vinc (learnAlias) + Novo1 (novo aprende o proprio)
    expect(s.ignored).toBe(1);
  });

  it('lista vazia => tudo zero', () => {
    expect(summarizeDriverImport([])).toEqual({
      driversToCreate: 0,
      driversAffected: 0,
      packages: 0,
      aliasesToLearn: 0,
      ignored: 0,
    });
  });
});
