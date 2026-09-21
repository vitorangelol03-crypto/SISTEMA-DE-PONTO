// A identidade do cartão de print na tela do entregador.
//
// 🔴 CASO REAL (21/09/2026): a líder GREICE abriu a tela "Espelho do app SHOPEE" e viu o
// PRÓPRIO NOME duas vezes em "Já enviados", sem nada diferenciando as duas linhas —
// entendeu que o sistema tinha duplicado o envio dela. Não eram dois envios: era o print
// de uma quinzena e o de outra, porque a tela junta TODAS as quinzenas em que a CD pediu
// print (`proof-slots` sem periodId varre todas) e o cartão de "já enviado" nunca dizia
// de qual quinzena era.
//
// A raiz estava na identidade do cartão, escrita à mão em 4 lugares como
// `driverId|platformName` — SEM a quinzena. Duas quinzenas da mesma pessoa colidiam:
// chave repetida no React, "Enviando..." acendendo nos dois cartões e o
// `acompanharConferencia` olhando o slot errado.
//
// Roda com: npx vitest run driverAppCartaoPrint
import { describe, expect, it } from 'vitest';
import { chaveDoCartaoDePrint } from '../../src/services/driverApp';

/** O grupo "Cordeiro de Minas - GREICE": a líder e um membro, como em produção. */
const GREICE = '070ec8e1-c265-4af8-9366-1b73a6297870';
const MIKAEL = '3f92aa20-f580-4527-94be-1c14db5a6cc0';
const PRIMEIRA_DE_AGOSTO = 'aa7c6c86-b16b-44c9-90bd-0439f80e0768';
const SEGUNDA_DE_AGOSTO = 'dbe70741-fba6-4578-acac-93a46bf076c3';

const slot = (periodId: string, driverId: string, platformName = 'SHOPEE') => ({
  periodId,
  driverId,
  platformName,
});

describe('chave do cartão de print', () => {
  it('a mesma pessoa em duas quinzenas são dois cartões diferentes', () => {
    const a = chaveDoCartaoDePrint(slot(PRIMEIRA_DE_AGOSTO, GREICE));
    const b = chaveDoCartaoDePrint(slot(SEGUNDA_DE_AGOSTO, GREICE));

    expect(a).not.toBe(b);
  });

  it('a tela da Greice: 3 cartões, 3 chaves — nenhuma colisão', () => {
    const naTela = [
      slot(PRIMEIRA_DE_AGOSTO, GREICE), // enviado em 03/09
      slot(SEGUNDA_DE_AGOSTO, GREICE), // o que ela precisa mandar
      slot(SEGUNDA_DE_AGOSTO, MIKAEL), // o cartão do membro
    ];

    const chaves = naTela.map(chaveDoCartaoDePrint);

    expect(new Set(chaves).size).toBe(naTela.length);
  });

  it('a regra ANTIGA colidia — é isto que o teste protege', () => {
    // Exatamente o que estava escrito à mão nos 4 lugares antes de 21/09/2026.
    const chaveAntiga = (s: { driverId: string; platformName: string }) =>
      `${s.driverId}|${s.platformName}`;

    const doisCartoesDaGreice = [
      slot(PRIMEIRA_DE_AGOSTO, GREICE),
      slot(SEGUNDA_DE_AGOSTO, GREICE),
    ];

    // Duas linhas na tela, uma única chave: o React não conseguia separá-las.
    expect(new Set(doisCartoesDaGreice.map(chaveAntiga)).size).toBe(1);
    // E com a quinzena na identidade, viram duas de verdade.
    expect(new Set(doisCartoesDaGreice.map(chaveDoCartaoDePrint)).size).toBe(2);
  });

  it('pessoas diferentes na mesma quinzena continuam separadas', () => {
    expect(chaveDoCartaoDePrint(slot(SEGUNDA_DE_AGOSTO, GREICE)))
      .not.toBe(chaveDoCartaoDePrint(slot(SEGUNDA_DE_AGOSTO, MIKAEL)));
  });

  it('plataformas diferentes na mesma quinzena continuam separadas', () => {
    expect(chaveDoCartaoDePrint(slot(SEGUNDA_DE_AGOSTO, GREICE, 'SHOPEE')))
      .not.toBe(chaveDoCartaoDePrint(slot(SEGUNDA_DE_AGOSTO, GREICE, 'LOGGI')));
  });

  it('o mesmo cartão gera sempre a mesma chave (o envio depende disso)', () => {
    const s = slot(SEGUNDA_DE_AGOSTO, MIKAEL);

    expect(chaveDoCartaoDePrint(s)).toBe(chaveDoCartaoDePrint({ ...s }));
  });
});
