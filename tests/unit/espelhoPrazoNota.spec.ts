/**
 * Prazo da nota fiscal no espelho — a faixa amarela que o entregador lê.
 *
 * 🔴 CASO REAL (09/09/2026, achado investigando o espelho do CLAUDIOMAR a pedido do
 * Victor): o espelho publicado no app estava SEM NENHUM prazo escrito, embora o prazo
 * (`nf_due_at` = sexta 04/09 17:00) estivesse gravado no banco e o Victor tivesse
 * preenchido data e hora na hora de publicar.
 *
 * A causa: o aviso só era montado quando os TRÊS campos estavam preenchidos, e o terceiro
 * — a data do pagamento tardio, que é só informativa e não mede nada — nascia VAZIO. Um
 * campo decorativo derrubava, em silêncio, o aviso que importa.
 *
 * Consequência medida: os 6 espelhos conferidos da 1ª quinzena de agosto saíram sem
 * faixa, e 16 notas foram marcadas como atrasadas contra um prazo que ninguém viu.
 *
 * Regra agora: DATA + HORA bastam (e são obrigatórias pra publicar). A data de pagamento
 * tardio é opcional e só acrescenta a 2ª linha.
 *
 * Roda com: npx vitest run espelhoPrazoNota
 */
import { describe, it, expect } from 'vitest';
import { montarAvisoDeCorte, prazoDeNotaIncompleto } from '../../src/utils/driverMirrorGenerator';

describe('montarAvisoDeCorte — o aviso não pode sumir por causa de campo decorativo', () => {
  it('🔴 o caso que quebrou: data e hora preenchidas, pagamento tardio VAZIO → aviso SAI', () => {
    const aviso = montarAvisoDeCorte('17:00', '04/09', '');
    expect(aviso).not.toBeNull();
    expect(aviso).toMatchObject({ time: '17:00', date: '04/09' });
    expect(aviso?.lateDate).toBeUndefined(); // só omite a 2ª linha
  });

  it('com os três preenchidos, sai completo (comportamento de sempre)', () => {
    expect(montarAvisoDeCorte('17:00', '04/09', '14/09')).toEqual({
      time: '17:00', date: '04/09', lateDate: '14/09',
    });
  });

  it('espaços em branco no pagamento tardio contam como vazio', () => {
    expect(montarAvisoDeCorte('17:00', '04/09', '   ')?.lateDate).toBeUndefined();
  });

  it('sem HORA não monta aviso nenhum', () => {
    expect(montarAvisoDeCorte('', '04/09', '14/09')).toBeNull();
  });

  it('sem DATA não monta aviso nenhum', () => {
    expect(montarAvisoDeCorte('17:00', '', '14/09')).toBeNull();
  });

  it('limpa espaços dos campos que valem', () => {
    expect(montarAvisoDeCorte(' 17:00 ', ' 04/09 ', ' 14/09 ')).toEqual({
      time: '17:00', date: '04/09', lateDate: '14/09',
    });
  });
});

describe('prazoDeNotaIncompleto — a trava de publicar', () => {
  it('data e hora preenchidas: pode publicar', () => {
    expect(prazoDeNotaIncompleto('17:00', '2026-09-04')).toBe(false);
  });

  it('sem hora: BLOQUEIA', () => {
    expect(prazoDeNotaIncompleto('', '2026-09-04')).toBe(true);
  });

  it('sem data: BLOQUEIA', () => {
    expect(prazoDeNotaIncompleto('17:00', '')).toBe(true);
  });

  it('só espaços: BLOQUEIA (não vale preencher com nada)', () => {
    expect(prazoDeNotaIncompleto('  ', '  ')).toBe(true);
  });

  it('a data do pagamento tardio NÃO entra na trava — ela é informativa', () => {
    // é justamente o campo que antes derrubava tudo; ele não pode voltar a bloquear
    expect(prazoDeNotaIncompleto('17:00', '2026-09-04')).toBe(false);
  });
});
