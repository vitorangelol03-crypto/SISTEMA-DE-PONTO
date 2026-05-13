// Sub-fase 14.4.6: stub vazio pra módulo `stream` (Node.js API) referenciado
// por xlsx-js-style. A lib importa stream.Readable mas o code path que
// realmente o usa nunca executa em browser (server-side parsing). Vite
// externalizava `stream` em dev → warning ruidoso. Stub silencia.
//
// Se algum código tentar usar Readable de verdade, vai falhar — mas isso
// nunca aconteceu em nosso uso (workbook builder + download client-side).

class StreamReadableStub {
  constructor() {
    if (typeof console !== 'undefined') {
      console.warn(
        '[stream-stub] stream.Readable foi instanciado mas é stub vazio. ' +
        'Isso não deveria acontecer no fluxo normal do xlsx-js-style em browser.',
      );
    }
  }
}

export const Readable = StreamReadableStub;
export const Writable = StreamReadableStub;
export const Transform = StreamReadableStub;
export const Duplex = StreamReadableStub;
export const PassThrough = StreamReadableStub;

export default {
  Readable,
  Writable,
  Transform,
  Duplex,
  PassThrough,
};
