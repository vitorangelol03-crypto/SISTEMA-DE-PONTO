import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import path from 'path';
import { parseDriverSheetData, detectPlatform } from '../../src/utils/driverSheetImport';
import { matchDriver, driverTokens, normalizeDriverName } from '../../src/utils/driverNameMatch';

function readFixture(name: string): unknown[][] {
  const wb = XLSX.readFile(path.join(process.cwd(), 'tests/fixtures', name));
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

describe('driverSheetImport — deteccao de plataforma pelo cabecalho', () => {
  it('reconhece iMile, Shopee, Anjun e LOGGI; rejeita desconhecido', () => {
    expect(detectPlatform(['DA', 'Waybill No.', 'Recipient City', 'Delivered time'])).toBe('imile');
    expect(detectPlatform(['Tipo do Serviço', 'Driver Name', 'Cidade Entrega', 'Rota'])).toBe('shopee');
    expect(detectPlatform(['número do negócio', 'operador de despacho', 'Cidade destinatária'])).toBe('anjun');
    expect(detectPlatform(['Entregador', 'Entregues'])).toBe('loggi');
    expect(detectPlatform(['Nome', 'Valor', 'Cidade'])).toBeNull();
  });
});

describe('driverSheetImport — agregacao por (entregador, cidade, plataforma)', () => {
  it('iMile: conta pacotes distintos por waybill (ignora re-scan)', () => {
    const aoa = [
      ['DA', 'Waybill No.', 'Recipient City'],
      ['Romario Alves Dornelas', 'W1', 'Caratinga'],
      ['Romario Alves Dornelas', 'W2', 'Caratinga'],
      ['Romario Alves Dornelas', 'W2', 'Caratinga'], // re-scan do mesmo pacote -> nao conta 2x
      ['Jessica Correia da Silva', 'W3', 'Ipanema'],
    ];
    const r = parseDriverSheetData(aoa);
    expect(r.platform).toBe('imile');
    expect(r.totalDrivers).toBe(2);
    expect(r.totalPackages).toBe(3); // W1, W2, W3
    const romario = r.rows.find((x) => x.driverRaw.startsWith('Romario'));
    expect(romario?.packages).toBe(2);
    expect(romario?.platform).toBe('eMile');
    expect(romario?.city).toBe('Caratinga');
  });

  it('Shopee: separa ENTREGA (SHOPEE) de COLETA (Coleta Shopee)', () => {
    const aoa = [
      ['Tipo do Serviço', 'Driver Name', 'Cidade Entrega', '3PL Tracking Number / Número Etiqueta / Ordem (Shopee)'],
      ['ENTREGA', '108810-Fulano da Silva', 'Caratinga', 'T1'],
      ['ENTREGA', '108810-Fulano da Silva', 'Caratinga', 'T2'],
      ['COLETA', '108810-Fulano da Silva', 'Caratinga', 'T3'],
    ];
    const r = parseDriverSheetData(aoa);
    expect(r.platform).toBe('shopee');
    expect(r.rows.find((x) => x.platform === 'SHOPEE')?.packages).toBe(2);
    expect(r.rows.find((x) => x.platform === 'Coleta Shopee')?.packages).toBe(1);
  });

  it('Anjun: plataforma ANJUN por operador de despacho', () => {
    const aoa = [
      ['número do negócio', 'operador de despacho', 'Cidade destinatária'],
      ['AJ1', 'RomarioAlvesD101', 'Caratinga'],
      ['AJ2', 'RomarioAlvesD101', 'Caratinga'],
    ];
    const r = parseDriverSheetData(aoa);
    expect(r.platform).toBe('anjun');
    expect(r.rows[0].platform).toBe('ANJUN');
    expect(r.rows[0].packages).toBe(2);
  });

  it('lanca erro em planilha nao reconhecida', () => {
    expect(() => parseDriverSheetData([['Nome', 'Valor'], ['x', '1']])).toThrow(/reconhecida/i);
  });

  describe('LOGGI: ja vem agregada por entregador (sem codigo pra deduplicar)', () => {
    const aoa = [
      ['Entregador', 'Entregues'],
      ['(IPT INT) Fulano da Silva (CARATINGA)', 12],
      ['(CTA) Ninguem Entregou', 0], // 0 entregas -> descartado em silencio
      ['(IPT LOC) Outro Hub Qualquer', 4], // hub diferente — nao filtramos, vai pra tela normal
      ['', 5], // sem entregador -> descartado
    ];

    it('conta o total da coluna Entregues direto, sem deduplicar por codigo', () => {
      const r = parseDriverSheetData(aoa);
      expect(r.platform).toBe('loggi');
      expect(r.rows).toHaveLength(2); // as duas com entregas > 0
      expect(r.totalPackages).toBe(16); // 12 + 4
      expect(r.totalDrivers).toBe(2);
    });

    it('extrai o hub entre parenteses como "cidade" e mantem o resto do nome pro casamento', () => {
      const r = parseDriverSheetData(aoa);
      const fulano = r.rows.find((x) => x.driverRaw.includes('Fulano'));
      expect(fulano?.city).toBe('IPT INT');
      expect(fulano?.platform).toBe('LOGGI');
      expect(fulano?.packages).toBe(12);
    });

    it('0 entregas nao gera linha nem aviso (nao e "tipo nao pago", e so nao ter nada pra contar)', () => {
      const r = parseDriverSheetData(aoa);
      expect(r.rows.some((x) => x.driverRaw.includes('Ninguem'))).toBe(false);
      expect(r.ignored).toEqual([]);
    });

    it('hub diferente da empresa NAO e filtrado aqui — decisao do Victor foi deixar ir pra tela de identificacao', () => {
      const r = parseDriverSheetData(aoa);
      expect(r.rows.some((x) => x.city === 'IPT LOC')).toBe(true);
    });

    it('nome sem parenteses (edge case real) vira cidade vazia, sem quebrar', () => {
      const semHub = parseDriverSheetData([
        ['Entregador', 'Entregues'],
        ['Joao Sem Hub', 1],
      ]);
      expect(semHub.rows[0].city).toBe('');
      expect(semHub.rows[0].driverRaw).toBe('Joao Sem Hub');
    });

    it('casa com driver cadastrado ignorando hub e sufixo entre parenteses', () => {
      const drivers = [{ id: 'fulano', name: 'Fulano da Silva' }];
      const m = matchDriver('(IPT INT) Fulano da Silva (CARATINGA)', drivers);
      expect(m.status).toBe('matched');
      expect(m.driverId).toBe('fulano');
    });
  });
});

describe('driverNameMatch — normalizacao e casamento', () => {
  const drivers = [
    { id: 'romario', name: 'Romario Alves Dornelas' },
    { id: 'winglison', name: 'Winglison de Paiva da Silva' },
    { id: 'vanildo', name: 'VANILDO DA SILVA RUELA DE OLIVEIRA' },
    { id: 'luan', name: 'LUAN KALLEB DE OLIVEIRA PIRES' },
    { id: 'carlos1', name: 'Carlos Barbosa' },
    { id: 'carlos2', name: 'Carlos Barbosa' },
  ];

  it('limpa codigo/sufixo/lixo nos tokens', () => {
    expect(driverTokens('108810-WINGLISON DE PAIVA DA SILVA')).toEqual(['winglison', 'paiva', 'silva']);
    expect(driverTokens('RomarioAlvesD101')).toEqual(['romario', 'alves']);
    expect(driverTokens('87191-XPT (DUTRA) GERSON BOTELHO')).toEqual(['gerson', 'botelho']);
    expect(driverTokens(':VANILDO DA SILVA RUELA DE OLIVEIRA')).toEqual(['vanildo', 'silva', 'ruela', 'oliveira']);
  });

  it('casa iMile / Shopee / Anjun com o mesmo driver cadastrado', () => {
    expect(matchDriver('Romario Alves Dornelas', drivers).status).toBe('matched'); // iMile
    expect(matchDriver('108810-Winglison de Paiva da Silva', drivers).driverId).toBe('winglison'); // Shopee
    expect(matchDriver('RomarioAlvesD101', drivers).driverId).toBe('romario'); // Anjun login
  });

  it('homonimo -> ambiguous (dois "Carlos Barbosa")', () => {
    const m = matchDriver('Carlos Barbosa', drivers);
    expect(m.status).toBe('ambiguous');
    expect(m.candidateIds?.sort()).toEqual(['carlos1', 'carlos2']);
  });

  it('desconhecido -> new', () => {
    expect(matchDriver('Fulano Xpto Desconhecido', drivers).status).toBe('new');
  });

  it('apelido aprendido (caderneta) casa direto — ex.: LUANKALLEBD101', () => {
    const alias = { alias_norm: normalizeDriverName('LUANKALLEBD101'), driver_id: 'luan' };
    const m = matchDriver('LUANKALLEBD101', drivers, [alias]);
    expect(m.status).toBe('matched');
    expect(m.driverId).toBe('luan');
    expect(m.fromAlias).toBe(true);
  });

  describe('ignorados persistidos (18/08/2026) — "guarda os rejeitados também"', () => {
    it('🎯 nome ja ignorado antes -> status ignored, sem pedir a mesma decisao de novo', () => {
      const ignorado = { alias_norm: normalizeDriverName('(IPT LOC) Fulano de Fora') };
      const m = matchDriver('(IPT LOC) Fulano de Fora', drivers, [], [ignorado]);
      expect(m.status).toBe('ignored');
    });

    it('vinculo tem prioridade sobre ignorado (nao deveria coexistir, mas por seguranca)', () => {
      const norm = normalizeDriverName('Romario Alves Dornelas');
      const alias = { alias_norm: norm, driver_id: 'romario' };
      const ignorado = { alias_norm: norm };
      const m = matchDriver('Romario Alves Dornelas', drivers, [alias], [ignorado]);
      expect(m.status).toBe('matched');
      expect(m.driverId).toBe('romario');
    });

    it('sem alias nem ignorado -> continua "new", comportamento de sempre', () => {
      expect(matchDriver('Nome Totalmente Novo', drivers, [], []).status).toBe('new');
    });

    it('lista de ignorados vazia (default) nao muda nada — retrocompat', () => {
      expect(matchDriver('Fulano Xpto Desconhecido', drivers).status).toBe('new');
    });
  });
});

describe('driverSheetImport — fixtures .xlsx das 3 plataformas (regressao do leitor real)', () => {
  it('iMile: le o arquivo e agrega (2 entregadores, 3 pacotes)', () => {
    const r = parseDriverSheetData(readFixture('imile-teste.xlsx'));
    expect(r.platform).toBe('imile');
    expect(r.totalDrivers).toBe(2);
    expect(r.totalPackages).toBe(3);
  });

  it('Shopee: separa ENTREGA (2) de COLETA (1)', () => {
    const r = parseDriverSheetData(readFixture('shopee-teste.xlsx'));
    expect(r.platform).toBe('shopee');
    expect(r.rows.find((x) => x.platform === 'SHOPEE')?.packages).toBe(2);
    expect(r.rows.find((x) => x.platform === 'Coleta Shopee')?.packages).toBe(1);
  });

  it('Anjun: le o login do operador de despacho (2 pacotes, ANJUN)', () => {
    const r = parseDriverSheetData(readFixture('anjun-teste.xlsx'));
    expect(r.platform).toBe('anjun');
    expect(r.rows[0].platform).toBe('ANJUN');
    expect(r.rows[0].packages).toBe(2);
  });

  it('LOGGI: le "entregas-por-entregador" (2 entregadores com entrega, 1 zerado descartado)', () => {
    const r = parseDriverSheetData(readFixture('loggi-teste.xlsx'));
    expect(r.platform).toBe('loggi');
    expect(r.totalDrivers).toBe(2);
    expect(r.totalPackages).toBe(8); // 5 + 3
    expect(r.rows.every((x) => x.platform === 'LOGGI')).toBe(true);
  });
});
