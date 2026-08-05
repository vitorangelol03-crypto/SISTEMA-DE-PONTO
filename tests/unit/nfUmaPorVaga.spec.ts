/**
 * UMA NOTA POR VAGA (05/08/2026, decisão do Victor).
 *
 * *"vamos permitir apenas um envio por nota pedida, está ficando com muitas notas no
 * sistema"* · *"eles só vão poder anexar outra quando a atual for excluída"*.
 *
 * Medido em produção antes da trava: 23 notas recusadas empilhadas, o GESSILEY sozinho
 * com 7 numa quinzena (4 num CNPJ, 3 no outro).
 *
 * ⚠️ Esta trava é DIFERENTE da do print: lá, recusado libera a vaga. Aqui, recusada
 * segura o lugar até a CD excluir — foi o pedido, com todas as letras.
 */
import { describe, it, expect } from 'vitest';
import { notasQueOcupamVaga } from '../../supabase/functions/driver-public-api/nfCheck';

const nota = (mirror_platform_key: string | null, status = 'recebida') => ({ mirror_platform_key, status });

describe('notasQueOcupamVaga', () => {
  it('🎯 vaga vazia deixa enviar', () => {
    expect(notasQueOcupamVaga([], '')).toEqual([]);
  });

  it('🎯 mesma vaga (mesmo espelho) trava o segundo envio', () => {
    expect(notasQueOcupamVaga([nota('')], '')).toHaveLength(1);
    expect(notasQueOcupamVaga([nota('LOGGI')], 'LOGGI')).toHaveLength(1);
  });

  it('🔴 nota RECUSADA também segura o lugar (o pedido do Victor)', () => {
    expect(notasQueOcupamVaga([nota('', 'rejeitada')], '')).toHaveLength(1);
  });

  it('🔴 espelho DIFERENTE no mesmo CNPJ é outra vaga — não pode travar', () => {
    // Pagamento por plataforma: LOGGI hoje, SHOPEE depois, mesmo CNPJ, duas notas.
    // Travar aqui deixaria o driver sem como mandar a segunda.
    expect(notasQueOcupamVaga([nota('LOGGI')], 'SHOPEE')).toEqual([]);
    expect(notasQueOcupamVaga([nota('')], 'LOGGI')).toEqual([]);
  });

  it('🔴 nota LEGADA (chave nula) ocupa a vaga de qualquer espelho — igual ao nfSlots', () => {
    // Quem mandou antes de existir nota por espelho aparece como "enviada" na tela;
    // se aqui não contasse, a tela diria enviada e o envio deixaria mandar de novo.
    expect(notasQueOcupamVaga([nota(null)], '')).toHaveLength(1);
    expect(notasQueOcupamVaga([nota(null)], 'LOGGI')).toHaveLength(1);
  });

  it('envio legado (chave nula) só bate com nota legada', () => {
    expect(notasQueOcupamVaga([nota(null)], null)).toHaveLength(1);
    expect(notasQueOcupamVaga([nota('LOGGI')], null)).toEqual([]);
    expect(notasQueOcupamVaga([nota('')], null)).toEqual([]);
  });

  it('devolve TODAS as que ocupam (a mensagem muda se todas forem recusadas)', () => {
    const achadas = notasQueOcupamVaga([nota('', 'rejeitada'), nota(null, 'validada'), nota('LOGGI')], '');
    expect(achadas).toHaveLength(2);
    expect(achadas.every((f) => f.status === 'rejeitada')).toBe(false);
  });

  it('caso real GESSILEY: 4 notas no mesmo CNPJ/espelho — a 5a não entra', () => {
    const dele = [nota('', 'rejeitada'), nota('', 'rejeitada'), nota('', 'rejeitada'), nota('', 'rejeitada')];
    expect(notasQueOcupamVaga(dele, '')).toHaveLength(4);
  });
});
