import { describe, it, expect, vi } from 'vitest';
import {
  ALFABETO_DO_CODIGO,
  decidirAparelho,
  gerarSegredoDoTablet,
  normalizarCodigoDeAtivacao,
  resolverTablet,
  segredoTemFormatoValido,
  sha256Hex,
  tabletDaLinha,
  type ClienteComRpc,
  type TabletAtivo,
} from '../../supabase/functions/_shared/clockDevice';

/**
 * Ponto só no tablet da empresa (30/09/2026, roadmap item 3) — a parte pura que as duas edge
 * functions usam. O que PRECISA ser verdade:
 *  - o código de ativação digitado no tablet vira o MESMO hash que o banco guardou
 *    (senão nenhum tablet ativa nunca);
 *  - com a trava ligada, só passa tablet ATIVO que atenda a empresa DO FUNCIONÁRIO;
 *  - com a trava desligada, NADA muda (comportamento de antes);
 *  - erro de banco na resolução não vira "liberado" (falha fechada).
 */

const CARATINGA = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';
const PONTE_NOVA = '2b2abc4b-084c-4cf0-b5f1-02792513241d';

const tabletCaratinga: TabletAtivo = {
  id: 'dev-1', name: 'Tablet portaria', companyIds: [CARATINGA], companyNames: ['Caratinga'],
};
const tabletDasDuas: TabletAtivo = {
  id: 'dev-2', name: 'Tablet galpão', companyIds: [CARATINGA, PONTE_NOVA], companyNames: ['Caratinga', 'Ponte Nova'],
};

describe('código de ativação', () => {
  it('aceita minúscula, hífen e espaço — o que a pessoa digita de verdade', () => {
    expect(normalizarCodigoDeAtivacao('k7p2-9xqm')).toBe('K7P29XQM');
    expect(normalizarCodigoDeAtivacao(' K7P2 9XQM ')).toBe('K7P29XQM');
  });

  it('recusa tamanho errado, símbolo fora do alfabeto (I, O, 0, 1) e o que não é texto', () => {
    expect(normalizarCodigoDeAtivacao('K7P2-9XQ')).toBeNull();
    expect(normalizarCodigoDeAtivacao('K7P2-9XQMM')).toBeNull();
    expect(normalizarCodigoDeAtivacao('K7P2-9XQO')).toBeNull();
    expect(normalizarCodigoDeAtivacao('K7P2-9XQ0')).toBeNull();
    expect(normalizarCodigoDeAtivacao('K7P2-9XQ1')).toBeNull();
    expect(normalizarCodigoDeAtivacao('K7P2-9XQI')).toBeNull();
    expect(normalizarCodigoDeAtivacao(12345678)).toBeNull();
    expect(normalizarCodigoDeAtivacao(null)).toBeNull();
  });

  it('o alfabeto tem 32 símbolos sem repetição — a função do banco usa byte % 32', () => {
    expect(ALFABETO_DO_CODIGO).toHaveLength(32);
    expect(new Set(ALFABETO_DO_CODIGO).size).toBe(32);
    expect(ALFABETO_DO_CODIGO).not.toMatch(/[IO01]/);
  });
});

describe('sha256 — o mesmo número do banco', () => {
  // Valores calculados NO BANCO de produção em 30/09/2026:
  //   select encode(extensions.digest('K7P29XQM', 'sha256'), 'hex');
  //   select encode(extensions.digest('Ação-tablet_ç', 'sha256'), 'hex');
  // Se a conta daqui divergir da do banco, o código digitado nunca bate com o guardado.
  it('bate com o digest do Postgres (texto simples e com acento)', async () => {
    expect(await sha256Hex('K7P29XQM')).toBe('c85f59139d13490930e6381a92e5c44e5e96533e848c7dc27955e4300fc27d2e');
    expect(await sha256Hex('Ação-tablet_ç')).toBe('8f62d2d3221ddd19a5e6f48fab1b69489ec2628c2db355dbef0b754b4ff77fb2');
  });
});

describe('segredo do tablet', () => {
  it('sai em base64url com 43 caracteres, passa na validação e nunca repete', () => {
    const a = gerarSegredoDoTablet();
    const b = gerarSegredoDoTablet();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(segredoTemFormatoValido(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('formato inválido não vira consulta ao banco', () => {
    expect(segredoTemFormatoValido('')).toBe(false);
    expect(segredoTemFormatoValido('curto')).toBe(false);
    expect(segredoTemFormatoValido('com espaço e acentuação ção ção ção ção ção')).toBe(false);
    expect(segredoTemFormatoValido(undefined)).toBe(false);
  });
});

describe('decidirAparelho — a regra', () => {
  it('trava DESLIGADA: libera sempre, com ou sem tablet (nada muda pra quem bate hoje)', () => {
    expect(decidirAparelho({ travaLigada: false, tablet: null, companyId: CARATINGA })).toEqual({ liberado: true });
    expect(decidirAparelho({ travaLigada: false, tablet: tabletCaratinga, companyId: PONTE_NOVA })).toEqual({ liberado: true });
  });

  it('trava LIGADA sem tablet (celular pessoal, supervisor): recusa', () => {
    expect(decidirAparelho({ travaLigada: true, tablet: null, companyId: CARATINGA }))
      .toEqual({ liberado: false, motivo: 'sem_tablet' });
  });

  it('trava LIGADA com tablet de OUTRA empresa: recusa', () => {
    expect(decidirAparelho({ travaLigada: true, tablet: tabletCaratinga, companyId: PONTE_NOVA }))
      .toEqual({ liberado: false, motivo: 'tablet_de_outra_empresa' });
  });

  it('trava LIGADA com o tablet da empresa: libera — inclusive o tablet que atende as duas', () => {
    expect(decidirAparelho({ travaLigada: true, tablet: tabletCaratinga, companyId: CARATINGA })).toEqual({ liberado: true });
    expect(decidirAparelho({ travaLigada: true, tablet: tabletDasDuas, companyId: CARATINGA })).toEqual({ liberado: true });
    expect(decidirAparelho({ travaLigada: true, tablet: tabletDasDuas, companyId: PONTE_NOVA })).toEqual({ liberado: true });
  });
});

describe('tabletDaLinha', () => {
  it('converte a linha da função do banco', () => {
    expect(tabletDaLinha({ id: 'd', name: 'T', company_ids: [CARATINGA], company_names: ['Caratinga'] }))
      .toEqual({ id: 'd', name: 'T', companyIds: [CARATINGA], companyNames: ['Caratinga'] });
  });

  it('linha vazia, sem empresa ou lixo = não é tablet', () => {
    expect(tabletDaLinha(undefined)).toBeNull();
    expect(tabletDaLinha({ id: 'd', name: 'T', company_ids: [], company_names: [] })).toBeNull();
    expect(tabletDaLinha({ id: 1, name: 'T', company_ids: [CARATINGA] })).toBeNull();
  });
});

describe('resolverTablet', () => {
  function clienteFalso(resposta: { data: unknown; error: { message: string } | null }) {
    const rpc = vi.fn(async () => resposta);
    return { cliente: { rpc } as ClienteComRpc, rpc };
  }

  it('segredo com formato inválido nem chega ao banco', async () => {
    const { cliente, rpc } = clienteFalso({ data: [], error: null });
    expect(await resolverTablet(cliente, 'x')).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('manda ao banco o sha256 do segredo — nunca o segredo', async () => {
    const segredo = gerarSegredoDoTablet();
    const { cliente, rpc } = clienteFalso({
      data: [{ id: 'd', name: 'T', company_ids: [CARATINGA], company_names: ['Caratinga'] }],
      error: null,
    });
    const tablet = await resolverTablet(cliente, segredo);
    expect(tablet?.companyIds).toEqual([CARATINGA]);
    expect(rpc).toHaveBeenCalledWith('clock_device_resolve', { p_token_hash: await sha256Hex(segredo) });
  });

  it('nenhuma linha = não é tablet ativo', async () => {
    const { cliente } = clienteFalso({ data: [], error: null });
    expect(await resolverTablet(cliente, gerarSegredoDoTablet())).toBeNull();
  });

  it('erro de banco LANÇA (a trava ligada nunca libera no escuro)', async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: 'timeout' } });
    await expect(resolverTablet(cliente, gerarSegredoDoTablet())).rejects.toThrow('clock_device_resolve: timeout');
  });
});
