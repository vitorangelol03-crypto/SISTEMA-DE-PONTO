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
  buildAnthropicBody,
  buildGeminiBody,
  DEFAULT_CLAUDE_MODELS,
  DEFAULT_GEMINI_MODELS,
  parseAnthropicResponse,
  parseGeminiResponse,
  PROOF_PROMPT,
  PROOF_TOOL,
  readingIsComplete,
  readingIsUsable,
  RECUSAS_ATE_DESISTIR,
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

  // ── Claude/Anthropic (19/10/2026): depois que o Google bloqueou o projeto Gemini. ──
  it('PROOF_VISION_PROVIDER=claude liga o Claude com a chave da Anthropic', () => {
    const cfg = visionConfigFromEnv({ ANTHROPIC_API_KEY: 'ak1', PROOF_VISION_PROVIDER: 'claude' });
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.apiKeys).toEqual(['ak1']);
    expect(cfg.models).toEqual(DEFAULT_CLAUDE_MODELS);
    expect(cfg.models).toEqual(['claude-haiku-5-5']);
  });

  it('"anthropic" tambem vale como nome do provedor', () => {
    expect(visionConfigFromEnv({ ANTHROPIC_API_KEY: 'ak', PROOF_VISION_PROVIDER: 'anthropic' }).provider).toBe('anthropic');
  });

  it('pediu Claude mas sem chave -> volta pro manual (nao quebra)', () => {
    expect(visionConfigFromEnv({ PROOF_VISION_PROVIDER: 'claude' }).provider).toBe('none');
  });

  it('pediu Claude ignora a chave do Gemini (usa so a da Anthropic)', () => {
    const cfg = visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'g1', ANTHROPIC_API_KEY: 'a1', PROOF_VISION_PROVIDER: 'claude' });
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.apiKeys).toEqual(['a1']);
  });

  it('sem provedor explicito, so a chave da Anthropic liga o Claude sozinho', () => {
    const cfg = visionConfigFromEnv({ ANTHROPIC_API_KEY: 'a1, a2' });
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.apiKeys).toEqual(['a1', 'a2']);
  });

  it('com as DUAS chaves e sem provedor, o Gemini continua na frente (comportamento antigo)', () => {
    const cfg = visionConfigFromEnv({ GOOGLE_AI_API_KEY: 'g1', ANTHROPIC_API_KEY: 'a1' });
    expect(cfg.provider).toBe('gemini');
    expect(cfg.apiKeys).toEqual(['g1']);
  });

  it('da pra trocar o modelo do Claude sem tocar em codigo', () => {
    const cfg = visionConfigFromEnv({
      ANTHROPIC_API_KEY: 'a1', PROOF_VISION_PROVIDER: 'claude', PROOF_VISION_MODELS: 'claude-sonnet-5-5',
    });
    expect(cfg.models).toEqual(['claude-sonnet-5-5']);
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

  /**
   * 18/08/2026 — o print do Gustavo (foto da tela de OUTRO celular, com sombra
   * atravessando) voltou "ilegivel" com o numero perfeitamente visivel. O pedido
   * antigo mandava recusar imagem "escura demais", e ele estava obedecendo.
   */
  it('🎯 o pedido diz que sombra/reflexo/torta em FOTO DA TELA nao e motivo pra recusar', () => {
    expect(PROOF_PROMPT).toContain('FOTO DA TELA');
    expect(PROOF_PROMPT.toLowerCase()).toContain('sombra');
    expect(PROOF_PROMPT.toLowerCase()).toContain('reflexo');
    expect(PROOF_PROMPT).toContain('NADA DISSO, sozinho, e motivo pra dizer que e ilegivel');
  });

  it('mesmo mais permissivo, a trava contra chutar numero CONTINUA', () => {
    expect(PROOF_PROMPT).toContain('NUNCA adivinhe ou estime um numero');
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

/** Forma do corpo que o Claude (Messages API) espera — só o que os testes leem. */
interface AnthropicBody {
  model: string;
  max_tokens: number;
  temperature?: number;
  tool_choice: { type: string; name: string };
  messages: Array<{
    role: string;
    content: Array<{
      type: string;
      source?: { type: string; media_type: string; data: string };
      text?: string;
    }>;
  }>;
}

describe('buildAnthropicBody', () => {
  it('manda a imagem (base64), o pedido, e FORCA o formato de resposta via tool', () => {
    const body = buildAnthropicBody('claude-haiku-5-5', 'QUJD', 'image/png') as AnthropicBody;
    expect(body.model).toBe('claude-haiku-5-5');
    // NAO manda `temperature`: a familia Claude 5 recusa esse parametro (HTTP 400).
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeGreaterThan(0);
    const partes = body.messages[0].content;
    expect(partes[0].source).toEqual({ type: 'base64', media_type: 'image/png', data: 'QUJD' });
    expect(partes[1].text).toBe(PROOF_PROMPT);
    // tool_choice forcado = a resposta vem sempre como tool_use, com o JSON travado.
    expect(body.tool_choice).toEqual({ type: 'tool', name: PROOF_TOOL.name });
  });

  it('tipo de imagem estranho cai pra JPEG (o print e foto do celular)', () => {
    const body = buildAnthropicBody('claude-haiku-5-5', 'QUJD', 'application/octet-stream') as AnthropicBody;
    expect(body.messages[0].content[0].source?.media_type).toBe('image/jpeg');
  });

  it('o schema da ferramenta exige "legivel" e aceita numero/datas nulos', () => {
    expect(PROOF_TOOL.input_schema.required).toContain('legivel');
    expect(Object.keys(PROOF_TOOL.input_schema.properties)).toEqual(
      ['legivel', 'entregues', 'periodoInicio', 'periodoFim'],
    );
  });
});

describe('parseAnthropicResponse', () => {
  const respostaTool = (input: unknown) => ({
    content: [{ type: 'tool_use', name: 'registrar_leitura', input }],
  });

  it('le a leitura boa de dentro do bloco tool_use', () => {
    const r = parseAnthropicResponse(respostaTool(
      { legivel: true, entregues: 1808, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' },
    ));
    expect(r).toEqual({ legivel: true, entregues: 1808, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' });
  });

  it('le o teste negativo (nao deu pra ler)', () => {
    const r = parseAnthropicResponse(respostaTool(
      { legivel: false, entregues: null, periodoInicio: null, periodoFim: null },
    ));
    expect(r?.legivel).toBe(false);
    expect(r?.entregues).toBeNull();
  });

  it('resposta torta vira null em vez de explodir', () => {
    expect(parseAnthropicResponse({ content: [{ type: 'text', text: 'oi' }] })).toBeNull();
    expect(parseAnthropicResponse({ content: [] })).toBeNull();
    expect(parseAnthropicResponse({ error: { type: 'authentication_error' } })).toBeNull();
    expect(parseAnthropicResponse(null)).toBeNull();
    expect(parseAnthropicResponse(undefined)).toBeNull();
    expect(parseAnthropicResponse('nao e objeto')).toBeNull();
  });
});

describe('readingIsComplete — o que ENCERRA o rodizio', () => {
  it('leitura completa (numero + as duas datas) encerra', () => {
    expect(readingIsComplete({ legivel: true, entregues: 1808, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' })).toBe(true);
  });

  /**
   * 🔑 MUDOU EM 18/08/2026 — antes isto era `true` ("a foto e ruim mesmo, insistir
   * daria o mesmo resultado e queimaria cota"). Essa frase era SUPOSICAO, nunca foi
   * medida, e um caso real provou o contrario: o print do Gustavo Henrique (foto da
   * tela de outro celular, sombra atravessando, torta, com reflexo) tem o numero
   * perfeitamente legivel — 1199, batendo EXATO com a planilha — e mesmo assim
   * voltou "ilegivel" na primeira tentativa.
   *
   * Modelo conservador nao e o mesmo que foto ruim. Agora recusa NAO encerra: o
   * rodizio tenta outros modelos (ver RECUSAS_ATE_DESISTIR).
   */
  it('🎯 "nao consegui ler" NAO encerra mais — outro modelo pode conseguir', () => {
    expect(readingIsComplete({ legivel: false, entregues: null, periodoInicio: null, periodoFim: null })).toBe(false);
  });

  it('leitura pela metade NAO encerra — tenta o proximo modelo', () => {
    expect(readingIsComplete({ legivel: true, entregues: 1808, periodoInicio: '2026-07-01' })).toBe(false);
    expect(readingIsComplete({ legivel: true, entregues: null, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' })).toBe(false);
    expect(readingIsComplete(null)).toBe(false);
  });

  it('readingIsUsable (nome antigo) segue existindo e responde igual', () => {
    expect(readingIsUsable({ legivel: true, entregues: 9, periodoInicio: '2026-07-01', periodoFim: '2026-07-15' })).toBe(true);
    expect(readingIsUsable({ legivel: false, entregues: null, periodoInicio: null, periodoFim: null })).toBe(false);
  });

  it('a politica e desistir na 3a recusa (decisao do Victor: "mais 2 modelos")', () => {
    expect(RECUSAS_ATE_DESISTIR).toBe(3);
  });
});
