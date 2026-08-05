/**
 * Ler a NOTA FISCAL escaneada com IA (05/08/2026, pedido do Victor).
 *
 * Caso real: o LUCAS AREDES emite, imprime, escaneia e manda o scan. Medido no PDF
 * dele: **zero objetos de fonte** e **zero caracteres** extraíveis, 675 KB de
 * imagem. A conferência recusava — com razão, porque não havia valor a conferir.
 *
 * Decisão dele: a IA entra **só quando a leitura normal falha**, transcreve, e a
 * nota segue o fluxo automático de sempre.
 *
 * 🔑 A IA NÃO decide: ela transcreve. Quem confere valor/CNPJ/nome continua sendo o
 * `runNfCheck`. Estes testes fixam justamente isso — o gatilho e a recusa em não
 * inventar número.
 */
import { describe, it, expect } from 'vitest';
import {
  buildNfOcrBody,
  parseNfOcrResponse,
  nfOcrUsavel,
  NF_OCR_PROMPT,
} from '../../supabase/functions/_shared/nfVisionRead';
import { nfTextoIlegivel } from '../../supabase/functions/driver-public-api/nfCheck';

const respostaGemini = (obj: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
});

describe('nfTextoIlegivel — o gatilho da IA', () => {
  it('🎯 PDF escaneado (zero texto) dispara a IA', () => {
    expect(nfTextoIlegivel('')).toBe(true);
    expect(nfTextoIlegivel(null)).toBe(true);
    expect(nfTextoIlegivel(undefined)).toBe(true);
  });

  it('lixo curto também conta como ilegível', () => {
    expect(nfTextoIlegivel('  \n \t ')).toBe(true);
    expect(nfTextoIlegivel('NFS-e')).toBe(true);
  });

  it('🔴 PDF com texto de verdade NÃO chama a IA (não gasta cota à toa)', () => {
    const real = 'PREFEITURA MUNICIPAL DE CARATINGA NOTA FISCAL DE SERVICOS ELETRONICA VALOR TOTAL 1.234,56';
    expect(nfTextoIlegivel(real)).toBe(false);
  });

  it('o limite é o MESMO da recusa (30 caracteres normalizados)', () => {
    expect(nfTextoIlegivel('A'.repeat(29))).toBe(true);
    expect(nfTextoIlegivel('A'.repeat(30))).toBe(false);
  });
});

describe('buildNfOcrBody — o pedido ao modelo', () => {
  it('manda o arquivo com o MIME informado (PDF vai direto, sem virar imagem)', () => {
    const body = buildNfOcrBody('QUFB', 'application/pdf') as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    const parte = body.contents[0].parts[0] as { inline_data: { mime_type: string; data: string } };
    expect(parte.inline_data.mime_type).toBe('application/pdf');
    expect(parte.inline_data.data).toBe('QUFB');
  });

  it('temperatura ZERO — transcrição não pode variar entre leituras', () => {
    const body = buildNfOcrBody('x', 'application/pdf') as {
      generationConfig: { temperature: number; responseMimeType: string };
    };
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('o pedido proíbe inventar número — é a trava contra valor errado', () => {
    expect(NF_OCR_PROMPT).toMatch(/NUNCA invente/i);
    expect(NF_OCR_PROMPT).toMatch(/NAO resuma|NAO interprete/i);
  });
});

describe('parseNfOcrResponse — blindagem da resposta', () => {
  it('lê a transcrição normal', () => {
    const r = parseNfOcrResponse(respostaGemini({ legivel: true, texto: 'VALOR TOTAL 1.234,56' }));
    expect(r).toEqual({ legivel: true, texto: 'VALOR TOTAL 1.234,56' });
  });

  it('modelo dizendo que não conseguiu ler vira legivel=false', () => {
    const r = parseNfOcrResponse(respostaGemini({ legivel: false, texto: null }));
    expect(r).toEqual({ legivel: false, texto: null });
  });

  it('resposta estranha vira null em vez de explodir', () => {
    expect(parseNfOcrResponse(null)).toBeNull();
    expect(parseNfOcrResponse({})).toBeNull();
    expect(parseNfOcrResponse({ candidates: [] })).toBeNull();
    expect(parseNfOcrResponse(respostaGemini({ texto: 'sem o campo legivel' }))).toBeNull();
  });

  it('texto que não é JSON vira null', () => {
    expect(parseNfOcrResponse({ candidates: [{ content: { parts: [{ text: 'desculpe, nao consigo' }] } }] })).toBeNull();
  });
});

describe('nfOcrUsavel — quando a transcrição vale', () => {
  it('aceita transcrição legível e com corpo', () => {
    expect(nfOcrUsavel({ legivel: true, texto: 'A'.repeat(40) })).toBe(true);
  });

  it('🔴 legivel=false NUNCA passa, mesmo com texto junto', () => {
    // Se o modelo disse que não tem certeza, o texto dele não vale — é exatamente
    // o caso em que um número inventado entraria como valor de nota.
    expect(nfOcrUsavel({ legivel: false, texto: 'A'.repeat(40) })).toBe(false);
  });

  it('transcrição curta demais não passa (não conferiria de qualquer forma)', () => {
    expect(nfOcrUsavel({ legivel: true, texto: 'VALOR 10' })).toBe(false);
  });

  it('null e texto vazio não passam', () => {
    expect(nfOcrUsavel(null)).toBe(false);
    expect(nfOcrUsavel({ legivel: true, texto: null })).toBe(false);
    expect(nfOcrUsavel({ legivel: true, texto: '   ' })).toBe(false);
  });
});
