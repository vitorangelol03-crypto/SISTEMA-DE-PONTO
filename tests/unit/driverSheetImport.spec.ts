import { describe, it, expect } from 'vitest';
import { parseDriverSheetData, detectPlatform } from '../../src/utils/driverSheetImport';
import { matchDriver, driverTokens, normalizeDriverName } from '../../src/utils/driverNameMatch';

describe('driverSheetImport — deteccao de plataforma pelo cabecalho', () => {
  it('reconhece iMile, Shopee e Anjun; rejeita desconhecido', () => {
    expect(detectPlatform(['DA', 'Waybill No.', 'Recipient City', 'Delivered time'])).toBe('imile');
    expect(detectPlatform(['Tipo do Serviço', 'Driver Name', 'Cidade Entrega', 'Rota'])).toBe('shopee');
    expect(detectPlatform(['número do negócio', 'operador de despacho', 'Cidade destinatária'])).toBe('anjun');
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
});
