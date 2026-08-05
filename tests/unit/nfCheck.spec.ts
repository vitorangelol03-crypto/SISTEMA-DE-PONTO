// Conferência automática de NF — testes do módulo puro compartilhado com a
// edge fn driver-public-api (v8). O texto de exemplo segue o layout real do
// DANFSe nacional (Caratinga) visto nas 18 notas do diagnóstico de 26/07.
import { describe, expect, it } from 'vitest';
import {
  findCnpjs,
  findMoneyValues,
  formatCnpj,
  mirrorExpectedValue,
  nameMatches,
  normText,
  runNfCheck,
  ehNossoEspelho,
} from '../../supabase/functions/driver-public-api/nfCheck';

const CNPJ_CD = '11802464000138';

function danfse(opts: { valor: string; emitente: string; tomadorCnpj?: string }): string {
  return `DANFSe v1.0
Documento Auxiliar da NFS-e
Municipio de Caratinga
EMITENTE DA NFS-e
Prestador do Serviço
CNPJ / CPF / NIF
61.875.012/0001-54
Nome / Nome Empresarial
61.875.012 ${opts.emitente}
TOMADOR DO SERVIÇO
Nome / Nome Empresarial
CLAYTON B DOS SANTOS
CNPJ / CPF / NIF
${opts.tomadorCnpj ?? '11.802.464/0001-38'}
SERVIÇO PRESTADO
Código de Tributação Nacional
16.02.01 - Outros serviços de transporte de natureza municipal.
VALOR TOTAL DA NFS-E
Valor do Serviço
R$ ${opts.valor}
Valor Líquido da NFS-e
R$ ${opts.valor}`;
}

describe('normText', () => {
  it('remove acentos, colapsa espaços e sobe caixa', () => {
    expect(normText('  João   Pédro\nda Silvéira ')).toBe('JOAO PEDRO DA SILVEIRA');
  });
});

describe('formatCnpj', () => {
  it('formata 14 dígitos', () => {
    expect(formatCnpj('11802464000138')).toBe('11.802.464/0001-38');
  });
});

describe('findCnpjs', () => {
  it('acha CNPJ formatado e sem formato, sem duplicar', () => {
    const cnpjs = findCnpjs('tomador 11.802.464/0001-38 e de novo 11802464000138 e MEI 61.875.012/0001-54');
    expect(cnpjs).toContain('11802464000138');
    expect(cnpjs).toContain('61875012000154');
    expect(cnpjs.filter((c) => c === CNPJ_CD)).toHaveLength(1);
  });
});

describe('findMoneyValues', () => {
  it('lê 1.234,56 · 1234,56 · 42.50', () => {
    const vals = findMoneyValues('R$ 4.112,50 e 1234,56 e 42.50');
    expect(vals).toContain(4112.5);
    expect(vals).toContain(1234.56);
    expect(vals).toContain(42.5);
  });
});

describe('nameMatches', () => {
  const ntext = normText('Nome / Nome Empresarial 61.875.012 RODRIGO SANTOS TATIBANA endereco tal');
  it('nome completo presente', () => {
    expect(nameMatches('Rodrigo Santos Tatibana', ntext)).toBe(true);
  });
  it('primeiro + segundo nome bastam (nota abrevia o resto)', () => {
    expect(nameMatches('Rodrigo Santos de Oliveira Junior', ntext)).toBe(true);
  });
  it('nome ausente → false; sem nome → null', () => {
    expect(nameMatches('Maria Aparecida', ntext)).toBe(false);
    expect(nameMatches(null, ntext)).toBeNull();
    expect(nameMatches('  ', ntext)).toBeNull();
  });
});

describe('runNfCheck', () => {
  const baseInput = {
    expectedCnpj: CNPJ_CD,
    expectedCnpjLabel: 'Shopee/Anjun/Loggi',
    driverName: 'RODRIGO SANTOS TATIBANA',
    recebedorNome: null as string | null,
    valueCandidates: { espelho_selection_LOGGI: 42.5 },
  };

  it('nota certa → ok com os 3 checks positivos', () => {
    const r = runNfCheck({ ...baseInput, text: danfse({ valor: '42,50', emitente: 'RODRIGO SANTOS TATIBANA' }) });
    expect(r.status).toBe('ok');
    expect(r.cnpjOk).toBe(true);
    expect(r.valorOk).toBe(true);
    expect(r.nomeOk).toBe(true);
    expect(r.matchedCandidates).toContain('espelho_selection_LOGGI');
    expect(r.reasons).toHaveLength(0);
  });

  it('valor errado → divergente, motivo cita nota e esperado', () => {
    const r = runNfCheck({ ...baseInput, text: danfse({ valor: '249,00', emitente: 'RODRIGO SANTOS TATIBANA' }) });
    expect(r.status).toBe('divergente');
    expect(r.valorOk).toBe(false);
    expect(r.reasons.join(' ')).toContain('R$ 249,00');
    expect(r.reasons.join(' ')).toContain('R$ 42,50');
  });

  it('tolerância de arredondamento: ±R$ 0,02 passa, R$ 0,05 não', () => {
    const ok = runNfCheck({ ...baseInput, text: danfse({ valor: '42,52', emitente: 'RODRIGO SANTOS TATIBANA' }) });
    expect(ok.valorOk).toBe(true);
    const fail = runNfCheck({ ...baseInput, text: danfse({ valor: '42,55', emitente: 'RODRIGO SANTOS TATIBANA' }) });
    expect(fail.valorOk).toBe(false);
  });

  it('CNPJ do tomador errado → divergente com motivo do CNPJ', () => {
    const r = runNfCheck({
      ...baseInput,
      text: danfse({ valor: '42,50', emitente: 'RODRIGO SANTOS TATIBANA', tomadorCnpj: '99.999.999/0001-99' }),
    });
    expect(r.status).toBe('divergente');
    expect(r.cnpjOk).toBe(false);
    expect(r.reasons.join(' ')).toContain('11.802.464/0001-38');
  });

  it('nome de outra pessoa sem recebedor cadastrado → divergente', () => {
    const r = runNfCheck({ ...baseInput, text: danfse({ valor: '42,50', emitente: 'KARINNE ROBERTA DA SILVA' }) });
    expect(r.status).toBe('divergente');
    expect(r.nomeOk).toBe(false);
    expect(r.reasons.join(' ')).toContain('RODRIGO SANTOS TATIBANA');
  });

  it('nome do RECEBEDOR cadastrado conta como certo', () => {
    const r = runNfCheck({
      ...baseInput,
      recebedorNome: 'KARINNE ROBERTA DA SILVA PEREIRA',
      text: danfse({ valor: '42,50', emitente: 'KARINNE ROBERTA DA SILVA PEREIRA' }),
    });
    expect(r.status).toBe('ok');
    expect(r.nomeOk).toBe(true);
  });

  it('sem candidatos de valor → valorOk null e NÃO recusa por valor', () => {
    const r = runNfCheck({
      ...baseInput,
      valueCandidates: {},
      text: danfse({ valor: '42,50', emitente: 'RODRIGO SANTOS TATIBANA' }),
    });
    expect(r.valorOk).toBeNull();
    expect(r.status).toBe('ok');
  });

  it('PDF sem texto (escaneado) → ilegivel com orientação', () => {
    const r = runNfCheck({ ...baseInput, text: '' });
    expect(r.status).toBe('ilegivel');
    expect(r.reasons.join(' ')).toContain('PDF original');
  });

  it('vários problemas → todos os motivos listados', () => {
    const r = runNfCheck({
      ...baseInput,
      text: danfse({ valor: '99,99', emitente: 'FULANO DE TAL', tomadorCnpj: '99.999.999/0001-99' }),
    });
    expect(r.status).toBe('divergente');
    expect(r.cnpjOk).toBe(false);
    expect(r.valorOk).toBe(false);
    expect(r.nomeOk).toBe(false);
    expect(r.reasons).toHaveLength(3);
  });
});

/**
 * Valor esperado do espelho publicado (2026-07-27). A nota segue SEMPRE o "TOTAL A
 * RECEBER" impresso no espelho — inclusive no pagamento PARCIAL por plataforma, em que
 * os vales/perdas saem listados mas não são abatidos.
 *
 * Cenário base: driver com ANJUN 100×2 (200) + LOGGI 50×2 (100) = bruto 300,
 * vales+perdas 80 → total_net 220.
 */
describe('mirrorExpectedValue — valor que a nota tem que ter', () => {
  it('espelho cheio COM abate: o líquido persistido (comportamento antigo)', () => {
    expect(
      mirrorExpectedValue({
        grossInScope: 300, deductions: 80, netFull: 220, hasPlatformFilter: false, includeDeductions: true,
      }),
    ).toBe(220);
  });

  it('espelho filtrado COM abate: bruto do filtro MENOS vales/perdas', () => {
    // Era o furo antigo: a fn esperava 200 (bruto) enquanto o PDF mostrava 120.
    expect(
      mirrorExpectedValue({
        grossInScope: 200, deductions: 80, netFull: 220, hasPlatformFilter: true, includeDeductions: true,
      }),
    ).toBe(120);
  });

  it('espelho filtrado SEM abate (pagamento parcial): bruto puro do filtro', () => {
    expect(
      mirrorExpectedValue({
        grossInScope: 200, deductions: 80, netFull: 220, hasPlatformFilter: true, includeDeductions: false,
      }),
    ).toBe(200);
  });

  it('espelho cheio SEM abate: bruto de todas as plataformas', () => {
    expect(
      mirrorExpectedValue({
        grossInScope: 300, deductions: 80, netFull: 220, hasPlatformFilter: false, includeDeductions: false,
      }),
    ).toBe(300);
  });

  it('sem vale/perda nenhum (o caso de hoje em produção): filtrado dá o bruto, igual antes', () => {
    expect(
      mirrorExpectedValue({
        grossInScope: 42.5, deductions: 0, netFull: 42.5, hasPlatformFilter: true, includeDeductions: true,
      }),
    ).toBe(42.5);
  });

  it('arredonda em 2 casas (centavo exato)', () => {
    expect(
      mirrorExpectedValue({
        grossInScope: 238.005, deductions: 0.001, netFull: 0, hasPlatformFilter: true, includeDeductions: true,
      }),
    ).toBe(238);
  });
});

// ── O ESPELHO enviado no lugar da nota (05/08/2026) ─────────────────────────
// 🔴 ACHADO EM PRODUÇÃO: 4 arquivos de 2 entregadores (Romario e Thiago) eram o PDF do
// ESPELHO reenviado como se fosse a nota — e a conferência VALIDOU OS QUATRO sozinha.
// Faz sentido: ela procura nome, CNPJ e valor no PDF, e o espelho tem os três (é o nosso
// documento, com o nome dele e o nosso CNPJ). Tanto que bateu com TODOS os candidatos de
// uma vez; nota de verdade bate com um só.
//
// ⚠️ Isto é dinheiro: nota "validada" que não existe = pagamento liberado sem nota.
describe('ehNossoEspelho — recusar o próprio espelho como nota', () => {
  // `baseInput` do outro bloco não alcança aqui — este é o mesmo cenário, local.
  const entrada = {
    expectedCnpj: CNPJ_CD,
    expectedCnpjLabel: 'Shopee/Anjun/Loggi',
    driverName: 'Romario Alves Dornelas',
    recebedorNome: null as string | null,
    valueCandidates: { espelho_selection_LOGGI: 42.5 },
  };
  const espelhoDeGrupo =
    'CD LOGISTICA Caratinga, MG · CNPJ 11.802.464/0001-38 ESPELHO DE GRUPO ' +
    'CARATINGA - Romario Alves Dornelas 1 quinzena de julho AVISO EMILE: A NOTA FISCAL DEVE SER GERADA';

  it('🎯 o texto real do espelho de grupo é reconhecido', () => {
    expect(ehNossoEspelho(espelhoDeGrupo)).toBe(true);
  });

  it('espelho individual também', () => {
    expect(ehNossoEspelho('espelho de pagamento — 1 quinzena de julho')).toBe(true);
  });

  it('⚠️ nota fiscal de verdade NÃO é confundida', () => {
    expect(ehNossoEspelho('PREFEITURA MUNICIPAL NOTA FISCAL DE SERVICOS ELETRONICA NFS-e ' +
      'PRESTADOR TOMADOR VALOR TOTAL DA NOTA R$ 4.850,00')).toBe(false);
  });

  it('quebra de linha entre as palavras não engana', () => {
    expect(ehNossoEspelho('ESPELHO\n  DE\nGRUPO')).toBe(true);
  });

  it('texto vazio/nulo não é espelho', () => {
    expect(ehNossoEspelho('')).toBe(false);
    expect(ehNossoEspelho(null)).toBe(false);
    expect(ehNossoEspelho(undefined)).toBe(false);
  });

  it('🎯 runNfCheck RECUSA antes de qualquer conferência — e explica o que fazer', () => {
    const r = runNfCheck({ ...entrada, text: espelhoDeGrupo });
    expect(r.status).toBe('divergente');
    expect(r.reasons.join(' ')).toMatch(/ESPELHO que a gente te mandou/i);
    expect(r.reasons.join(' ')).toMatch(/emita a NOTA/i);
    // não pode "validar por engano" nenhum dos campos
    expect(r.matchedCandidates).toEqual([]);
    expect(r.cnpjOk).toBeNull();
    expect(r.nomeOk).toBeNull();
  });

  it('⚠️ nem mesmo com o valor certo dentro dele o espelho passa', () => {
    const comValor = espelhoDeGrupo + ' TOTAL A RECEBER R$ 42,50';
    const r = runNfCheck({ ...entrada, text: comValor });
    expect(r.status).toBe('divergente');
    expect(r.matchedCandidates).toEqual([]);
  });
});
