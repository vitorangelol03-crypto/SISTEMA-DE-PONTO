/**
 * Testes unit para planRateReapply (src/components/driverpay/driverPayShared.ts).
 *
 * Framework: vitest. Roda com: npx vitest run driverPayRateReapply
 *
 * Regra sob teste (Fix do Bug #2 — "salvar cadastro do driver apagava a taxa por rota"):
 * ao mudar a taxa PADRAO de uma plataforma no cadastro do driver, reaplicar a nova taxa
 * SO nas rotas que ainda usavam a taxa ANTIGA (seguiam o padrao). Rotas com taxa diferente
 * sao overrides manuais por rota e devem ser PRESERVADAS. Se nenhuma taxa mudou (rateChanges
 * vazio — ex.: editou so PIX/telefone), nao reaplica nada.
 */
import { describe, it, expect } from 'vitest';
import { planRateReapply, type RouteLine } from '../../src/components/driverpay/driverPayShared';

const route = (name: string, packages: Record<string, number>, rates: Record<string, number>): RouteLine => ({
  route: name,
  packages,
  packageIds: {},
  rates,
});

describe('planRateReapply — reaplicacao seletiva de taxa (preserva override por rota)', () => {
  it('1. rateChanges vazio (editou so PIX/telefone) → nao reaplica nada', () => {
    const routes = [route('Caratinga', { eMile: 100 }, { eMile: 2.0 })];
    expect(planRateReapply(routes, { eMile: 2.0 }, [])).toEqual([]);
  });

  it('2. rota seguia o padrao (taxa == antiga) → reaplica a nova', () => {
    const routes = [route('Caratinga', { eMile: 100 }, { eMile: 2.0 })];
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([{ route: 'Caratinga', platformName: 'eMile', packages: 100, newRate: 2.2 }]);
  });

  it('3. rota com override manual (taxa != antiga) → PRESERVA (nao entra no plano)', () => {
    const routes = [route('Caratinga', { eMile: 100 }, { eMile: 2.5 })];
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([]);
  });

  it('4. multi-rota: rota no padrao atualiza, rota com override preserva', () => {
    const routes = [
      route('Entre Folhas', { eMile: 70 }, { eMile: 2.0 }), // seguia o padrao
      route('Caratinga', { eMile: 242 }, { eMile: 2.5 }), // override manual
    ];
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([{ route: 'Entre Folhas', platformName: 'eMile', packages: 70, newRate: 2.2 }]);
  });

  it('5. plataforma que NAO mudou nao e tocada', () => {
    const routes = [route('Caratinga', { eMile: 100, ANJUN: 50 }, { eMile: 2.0, ANJUN: 3.0 })];
    const plan = planRateReapply(routes, { eMile: 2.0, ANJUN: 3.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    // So eMile (que mudou); ANJUN fica de fora mesmo estando no padrao.
    expect(plan).toEqual([{ route: 'Caratinga', platformName: 'eMile', packages: 100, newRate: 2.2 }]);
  });

  it('6. rota com 0 pacotes na plataforma → ignora', () => {
    const routes = [route('Caratinga', { eMile: 0 }, { eMile: 2.0 })];
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([]);
  });

  it('7. rota sem nome ("") → ignora (nao persiste rota fantasma)', () => {
    const routes = [route('', { eMile: 100 }, { eMile: 2.0 })];
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([]);
  });

  it('8. comparacao em centavos: taxa antiga como string "2.20" casa com 2.2 (float)', () => {
    const routes = [route('Caratinga', { eMile: 100 }, { eMile: 2.2 })];
    const plan = planRateReapply(routes, { eMile: 2.2 }, [
      // oldRate vindo do banco como string numeric
      { platformName: 'eMile', oldRate: '2.20' as unknown as number, newRate: 2.3 },
    ]);
    expect(plan).toEqual([{ route: 'Caratinga', platformName: 'eMile', packages: 100, newRate: 2.3 }]);
  });

  it('9. taxa da rota diferindo por 1 centavo da antiga → preserva (é override)', () => {
    const routes = [route('Caratinga', { eMile: 100 }, { eMile: 2.01 })];
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([]);
  });

  it('10. fallback: rota sem rate proprio usa ratesByPlatform para decidir', () => {
    const routes = [route('Caratinga', { eMile: 100 }, {})]; // rl.rates vazio
    const plan = planRateReapply(routes, { eMile: 2.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
    ]);
    expect(plan).toEqual([{ route: 'Caratinga', platformName: 'eMile', packages: 100, newRate: 2.2 }]);
  });

  it('11. mesma rota, uma plataforma no padrao e outra override', () => {
    const routes = [route('Caratinga', { eMile: 100, ANJUN: 50 }, { eMile: 2.0, ANJUN: 3.5 })];
    const plan = planRateReapply(routes, { eMile: 2.0, ANJUN: 3.0 }, [
      { platformName: 'eMile', oldRate: 2.0, newRate: 2.2 },
      { platformName: 'ANJUN', oldRate: 3.0, newRate: 3.2 },
    ]);
    // eMile seguia o padrao (2.0) → atualiza; ANJUN estava em 3.5 (override) → preserva.
    expect(plan).toEqual([{ route: 'Caratinga', platformName: 'eMile', packages: 100, newRate: 2.2 }]);
  });
});
