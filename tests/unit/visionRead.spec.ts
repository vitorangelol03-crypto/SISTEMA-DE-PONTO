// Leitora do espelho do app — testes das partes PURAS (sem rede).
//
// O que importa provar aqui: (1) sem chave o sistema entra em modo manual em vez
// de quebrar; (2) trocar de modelo/provedor e configuracao, nao codigo; (3) o
// rodizio de modelos e chaves existe e esta na ordem certa; (4) resposta torta da
// API vira null em vez de exceção.
//
// Roda com: npx vitest run visionRead
import { describe, expect, it } from 'vitest';
import {
  attemptOrder,
  buildGeminiBody,
  DEFAULT_GEMINI_MODELS,
  parseGeminiResponse,
  PROOF_PROMPT,
  readingIsUsable,
  visionConfigFromEnv,
} from '../../supabase/functions/_shared/visionRead';

/** Resposta de verdade do gemini-3.6-flash com o print do Victor (04/08). */
const respostaReal = (texto: string) => ({
  candidates: [{ content: { parts: [{ text: texto }] } }],
});

describe('visionConfigFromEnv — o sistema nunca depende da IA pra rodar', () => {
  it('SEM chave nenhuma: cai em modo manual, nao quebra', () => {
    const cfg = visionConfigFromEnv({});
    expect(cfg.provider).toBe('none');
    expect(cfg.apiKeys).toEqual([]);
  });

  it('chave vazia tambem cai em modo manual', () => {
    expect(visionConfigFromEnv({ GOOGLE_AI_API_KEY: '   ' }).provider).toBe('none');
  });

  it('com chave, liga o gemini sozinho', () => {
    const cfg = visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'k1' });
    expect(cfg.provider).toBe('gemini');
    expect(cfg.apiKeys).toEqual(['k1']);
    expect(cfg.models).toEqual(DEFAULT_GEMINI_MODELS);
  });

  it('da pra DESLIGAR a leitura sem tirar a chave (volta pro manual)', () => {
    const cfg = visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'k1', PROOF_VISION_PROVIDER: 'none' });
    expect(cfg.provider).toBe('none');
  });

  it('provedor desconhecido nao vira gemini por engano — vira manual', () => {
    expect(visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'k1', PROOF_VISION_PROVIDER: 'openai' }).provider).toBe('none');
  });

  it('aceita VARIAS chaves (cada projeto Google tem cota diaria propria)', () => {
    const cfg = visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'k1, k2 ,k3' });
    expect(cfg.apiKeys).toEqual(['k1', 'k2', 'k3']);
  });

  it('da pra trocar a lista de modelos sem tocar em codigo', () => {
    // Foi o que salvou quando o gemini-2.5 saiu do ar pra contas novas (HTTP 404).
    const cfg = visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'k1', PROOF_VISION_MODELS: 'modelo-novo, outro' });
    expect(cfg.models).toEqual(['modelo-novo', 'outro']);
  });
});

describe('attemptOrder — o rodizio que soma as cotas', () => {
  it('varre todos os modelos de uma chave antes de ir pra proxima', () => {
    const ordem = attemptOrder({ provider: 'gemini', apiKeys: ['A', 'B'], models: ['m1', 'm2'], maxAttempts: 9 });
    expect(ordem).toEqual([
      { apiKey: 'A', model: 'm1' },
      { apiKey: 'A', model: 'm2' },
      { apiKey: 'B', model: 'm1' },
      { apiKey: 'B', model: 'm2' },
    ]);
  });

  it('a fila padrao tem varios modelos — cota de 20/dia CADA um', () => {
    const ordem = attemptOrder(visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'k' }));
    expect(ordem.length).toBeGreaterThanOrEqual(8);
    expect(ordem[0].model).toBe('gemini-3.6-flash'); // o que mais acertou na medicao
  });

  it('sem chave, nao ha o que tentar', () => {
    expect(attemptOrder({ provider: 'none', apiKeys: [], models: ['m'], maxAttempts: 4 })).toEqual([]);
  });
});

/** Forma do corpo que o Gemini espera — só o que os testes precisam ler. */
interface GeminiBody {
  contents: Array<{ parts: Array<{ inline_data?: { mime_type: string; data: string }; text?: string }> }>;
  generationConfig: { responseMimeType: string; temperature: number };
}

describe('buildGeminiBody', () => {
  it('manda a imagem e o pedido, com formato de resposta travado', () => {
    const body = buildGeminiBody('QUJD', 'image/jpeg') as GeminiBody;
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'image/jpeg', data: 'QUJD' });
    expect(body.contents[0].parts[1].text).toBe(PROOF_PROMPT);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.temperature).toBe(0);
  });

  it('o pedido avisa da pegadinha da aba "Em Rota" ao lado de "Encerrado"', () => {
    expect(PROOF_PROMPT).toContain('Encerrado');
    expect(PROOF_PROMPT).toContain('Em Rota');
    expect(PROOF_PROMPT).toContain('NUNCA adivinhe');
  });
});

describe('parseGeminiResponse', () => {
  it('le a resposta boa que o modelo deu com o print do Victor', () => {
    const r = parseGeminiResponse(respostaReal(
      '{"legivel": true, "entregues": 1808, "periodoFim": "2026-07-15", "periodoInicio": "2026-07-01"}',
    ));
    expect(r).toEqual({ legivel: true, entregues: 1808, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' });
  });

  it('le a resposta do teste negativo (foto de etiqueta de pacote)', () => {
    const r = parseGeminiResponse(respostaReal(
      '{"legivel": false, "entregues": null, "periodoFim": null, "periodoInicio": null}',
    ));
    expect(r?.legivel).toBe(false);
    expect(r?.entregues).toBeNull();
  });

  it('resposta torta vira null em vez de explodir', () => {
    expect(parseGeminiResponse(respostaReal('isso nao e json'))).toBeNull();
    expect(parseGeminiResponse(respostaReal(''))).toBeNull();
    expect(parseGeminiResponse({ candidates: [] })).toBeNull();
    expect(parseGeminiResponse({ error: { code: 429 } })).toBeNull();
    expect(parseGeminiResponse(null)).toBeNull();
    expect(parseGeminiResponse(undefined)).toBeNull();
  });
});

describe('readingIsUsable — quando vale gastar outra cota', () => {
  it('leitura completa serve', () => {
    expect(readingIsUsable({ legivel: true, entregues: 1808, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' })).toBe(true);
  });

  it('"nao consegui ler" e resposta LEGITIMA — nao gasta outra tentativa', () => {
    // A foto e ruim mesmo (etiqueta de pacote, foto tremida). Insistir em outro
    // modelo daria o mesmo resultado e queimaria cota do dia a toa.
    expect(readingIsUsable({ legivel: false, entregues: null, periodoInicio: null, periodoFim: null })).toBe(true);
  });

  it('leitura pela metade NAO serve — tenta o proximo modelo', () => {
    expect(readingIsUsable({ legivel: true, entregues: 1808, periodoInicio: '2026-07-01' })).toBe(false);
    expect(readingIsUsable({ legivel: true, entregues: null, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' })).toBe(false);
    expect(readingIsUsable(null)).toBe(false);
  });
});
