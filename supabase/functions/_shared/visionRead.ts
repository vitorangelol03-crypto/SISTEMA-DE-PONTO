// Leitura do ESPELHO DO APP (print da tela da Shopee) — a "tomada" trocável.
//
// Vive em _shared/ porque as DUAS edge fns leem print: `driver-public-api`
// (driver anexa pelo portal) e `driverpay-proof-admin` (operador anexa pelo painel).
//
// ⚠️ CONTRATO COM O RESTO DO SISTEMA (pedido do Victor em 04/08: "pra longo prazo
// o sistema não travar"): esta função NUNCA lança e NUNCA trava. Quando não dá pra
// ler — sem chave, sem cota, API fora do ar, modelo aposentado, resposta torta —
// ela devolve `null`. O `runProofCheck` transforma `null` em `status: 'pendente'`,
// o print é ACEITO e guardado, e o operador confere na mão no painel com a foto ao
// lado do número esperado. Nenhum driver é recusado por problema nosso.
//
// TROCAR DE PROVEDOR/MODELO É CONFIGURAÇÃO, NÃO CÓDIGO — tudo por variável de
// ambiente (ver `visionConfigFromEnv`).
//
// ── O que foi MEDIDO em 04/08 com o print real do Victor (1808 / 01-15 jul) ──
//  · gemini-3.6-flash acertou 7 de 8 leituras; os outros modelos testados também
//    acertaram o número. A leitura em si é confiável.
//  · TESTE NEGATIVO 4/4: etiqueta de pacote, foto aleatória e foto antiga TODAS
//    voltaram `legivel:false, entregues:null`. A leitora não inventa número — que
//    era o risco mais perigoso da feature.
//  · O erro típico não é valor errado, é a string não fechar: "2026-07-012026-07-01"
//    ou a data seguida de raciocínio vazado. Quem limpa isso é `parseProofDate`
//    (proofCheck.ts), que tolera lixo grudado mas devolve null quando fica ambíguo.
//  · COTA DO PLANO GRÁTIS: `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20`
//    — 20 leituras por dia POR MODELO, POR PROJETO. Daí o rodízio abaixo: cada
//    modelo (e cada chave) tem a sua cota própria, e elas somam.

import type { ProofReadingRaw } from './proofCheck.ts';

// ─── Configuração ────────────────────────────────────────────────────────────

export type VisionProvider = 'gemini' | 'anthropic' | 'none';

export interface VisionConfig {
  provider: VisionProvider;
  /** Uma ou mais chaves. Cada chave é um projeto = uma cota diária inteira. */
  apiKeys: string[];
  /** Modelos tentados em ordem. Cada modelo tem cota própria (20/dia no grátis). */
  models: string[];
  /** Teto de tentativas por leitura, somando modelos e chaves. */
  maxAttempts: number;
}

/**
 * Ordem padrão dos modelos. Medida em 04/08 — os primeiros são os que mais
 * acertaram. Todos leram o print certo; a ordem é por estabilidade da resposta.
 * Sobrescrevível por `PROOF_VISION_MODELS` sem tocar em código (é assim que a
 * gente reage a modelo aposentado — o Gemini 2.5 saiu do ar pra contas novas
 * durante estes testes, com HTTP 404).
 */
export const DEFAULT_GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

/**
 * Modelos padrão do Claude (Anthropic) — usados quando `PROOF_VISION_PROVIDER=claude`
 * e `PROOF_VISION_MODELS` não foi definido. Decisão do Victor (19/10/2026): depois que
 * o Google bloqueou o projeto da chave Gemini (HTTP 403 "project denied access"),
 * trocamos a leitora pro Claude. Começa no Haiku (o mais barato/rápido que lê imagem);
 * se precisar de mais acerto em foto ruim, é só pôr um modelo mais forte em
 * `PROOF_VISION_MODELS` — é configuração, não código.
 */
export const DEFAULT_CLAUDE_MODELS = [
  'claude-haiku-5-5',
];

const splitList = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Monta a configuração a partir do ambiente. Sem chave nenhuma -> provider 'none'
 * -> modo manual, e o sistema roda igual.
 *
 * Variáveis (secrets do Supabase):
 *   GOOGLE_AI_API_KEY     chave(s) do Gemini — uma, ou várias separadas por vírgula
 *   ANTHROPIC_API_KEY     chave(s) do Claude — uma, ou várias separadas por vírgula
 *   PROOF_VISION_PROVIDER 'gemini' | 'claude' | 'none'
 *                         (vazio: liga sozinho pela chave que existir — Gemini na frente,
 *                          pra não mudar o comportamento antigo)
 *   PROOF_VISION_MODELS   lista separada por vírgula
 *                         (padrão: DEFAULT_GEMINI_MODELS ou DEFAULT_CLAUDE_MODELS)
 */
export function visionConfigFromEnv(env: Record<string, string | undefined>): VisionConfig {
  const pedido = (env.PROOF_VISION_PROVIDER ?? '').trim().toLowerCase();
  const geminiKeys = splitList(env.GOOGLE_AI_API_KEY);
  const claudeKeys = splitList(env.ANTHROPIC_API_KEY);

  // Qual provedor? Explícito manda; vazio escolhe pela chave (Gemini na frente, pra não
  // mudar o comportamento antigo); nome desconhecido NÃO vira nada por engano (vai pro manual).
  let provider: VisionProvider;
  if (pedido === 'none') provider = 'none';
  else if (pedido === 'claude' || pedido === 'anthropic') provider = 'anthropic';
  else if (pedido === 'gemini') provider = 'gemini';
  else if (pedido === '') provider = geminiKeys.length ? 'gemini' : claudeKeys.length ? 'anthropic' : 'none';
  else provider = 'none';

  const apiKeys = provider === 'anthropic' ? claudeKeys : provider === 'gemini' ? geminiKeys : [];
  // Provedor pedido mas sem chave -> volta pro manual (o sistema nunca quebra por falta de IA).
  const provFinal: VisionProvider = provider !== 'none' && apiKeys.length === 0 ? 'none' : provider;

  const models = splitList(env.PROOF_VISION_MODELS);
  const defaults = provFinal === 'anthropic' ? DEFAULT_CLAUDE_MODELS : DEFAULT_GEMINI_MODELS;
  return {
    provider: provFinal,
    apiKeys,
    models: models.length ? models : defaults,
    maxAttempts: Number(env.PROOF_VISION_MAX_ATTEMPTS ?? 4) || 4,
  };
}

// ─── Pedido ao modelo (partes puras, testáveis sem rede) ─────────────────────

/**
 * O texto do pedido. Escrito contra a tela real, com duas armadilhas medidas:
 *
 * 1. a aba "Em Rota (0)" fica ao lado de "Encerrado (1808)" — sem o aviso explícito o
 *    modelo pega o número errado;
 * 2. **o app tem DUAS telas que servem** (achado em 04/08, com um print da Natália que
 *    falhou 2× na leitura): a lista "Entrega" com a aba `Encerrado (N)`, e a tela de
 *    resumo "Data escolhida" com `Pedidos entregues N`. A segunda não tem a palavra
 *    "Encerrado" em lugar nenhum — com o texto antigo, o modelo devolvia "não consegui
 *    ler" num print que estava perfeito.
 */
export const PROOF_PROMPT = `Esta imagem e uma foto (ou captura) da tela do aplicativo de entregas da Shopee, usado por um motorista entregador.

O aplicativo tem DUAS telas diferentes que servem, e voce deve aceitar QUALQUER UMA das duas:

TELA A — lista de entregas ("Entrega"), com abas no topo:
   "Em Rota (N)" · "Ocorrencia" · "Encerrado (N)", e logo abaixo o intervalo de datas.
TELA B — resumo do periodo ("Data escolhida"), com:
   o intervalo de datas no topo e a linha "Pedidos entregues" seguida de um numero.

Extraia EXATAMENTE tres informacoes:

1. "entregues": a quantidade de entregas concluidas no periodo.
   - Na TELA A: o numero entre parenteses ao lado da aba "Encerrado".
     Exemplo: "Encerrado (1808)" -> 1808.
     ATENCAO: NAO confunda com "Em Rota (N)" nem com "Ocorrencia". Use somente "Encerrado".
   - Na TELA B: o numero ao lado de "Pedidos entregues".
     Exemplo: "Pedidos entregues   19" -> 19.
     ATENCAO: NAO confunda com "Taxa de sucesso de entrega", que e uma porcentagem (ex.: 100.00%)
     e NUNCA deve ser usada como quantidade.

2. "periodoInicio" e "periodoFim": as duas datas do intervalo selecionado.
   - Na TELA A: aparece logo abaixo das abas, ao lado do botao "Selecionar data".
   - Na TELA B: aparece no topo, ao lado do icone de relogio.
   Exemplo: "2026/07/01 - 2026/07/15" ou "01/07/2026 - 15/07/2026" -> periodoInicio = "2026-07-01"
   e periodoFim = "2026-07-15". Devolva SEMPRE no formato AAAA-MM-DD, e nada alem da data.
   ATENCAO ao formato: "01/07/2026" e dia/mes/ano (1 de julho), nao mes/dia/ano.

3. "legivel": true se voce conseguiu ler com confianca os tres valores acima; false se a imagem
   nao e nenhuma das duas telas descritas acima, ou se os valores estao mesmo impossiveis de ler.

IMPORTANTE — A IMAGEM COSTUMA SER UMA FOTO DA TELA, NAO UMA CAPTURA:
muitas vezes o entregador fotografa a tela do celular com OUTRO aparelho. E NORMAL a foto ter
sombra atravessando, reflexo/brilho, estar torta ou girada, ter a capa e a borda do celular
aparecendo, ou o fundo esbranquicado. NADA DISSO, sozinho, e motivo pra dizer que e ilegivel.
Olhe com atencao apesar desses defeitos: se der pra ler os numeros e as datas, LEIA e responda
legivel = true. So responda legivel = false quando o valor em si estiver realmente ilegivel.

Se voce nao conseguir ler algum valor com certeza, deixe o campo nulo e ponha legivel = false.
NUNCA adivinhe ou estime um numero: e melhor dizer que nao deu do que chutar.`;

/** Formato fixo da resposta — evita ter que interpretar texto solto. */
export const PROOF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    legivel: { type: 'BOOLEAN' },
    entregues: { type: 'INTEGER', nullable: true },
    periodoInicio: { type: 'STRING', nullable: true },
    periodoFim: { type: 'STRING', nullable: true },
  },
  required: ['legivel'],
} as const;

/** Corpo do POST do Gemini. Puro: dá pra testar sem rede. */
export function buildGeminiBody(imageBase64: string, mimeType: string): unknown {
  return {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: PROOF_PROMPT },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: PROOF_SCHEMA,
      temperature: 0,
    },
  };
}

/**
 * Tira a leitura de dentro da resposta do Gemini. Puro, e blindado: qualquer
 * formato inesperado vira `null` em vez de exceção.
 */
export function parseGeminiResponse(payload: unknown): ProofReadingRaw | null {
  try {
    const p = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const texto = p?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof texto !== 'string' || !texto.trim()) return null;
    const obj = JSON.parse(texto) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') return null;
    return {
      legivel: obj.legivel,
      entregues: obj.entregues,
      periodoInicio: obj.periodoInicio,
      periodoFim: obj.periodoFim,
    };
  } catch {
    return null;
  }
}

// ─── Claude / Anthropic (a mesma leitura, outra "tomada") ───────────────────

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_MAX_TOKENS = 1024;

/** Tipos de imagem que o Claude aceita. Qualquer outro cai pra JPEG (o print é foto). */
const ANTHROPIC_MIME_OK = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * A "ferramenta" que OBRIGA o Claude a devolver o JSON no formato fixo — o mesmo que o
 * `responseSchema` faz no Gemini. Sem isso o modelo responde texto solto e a leitura fica
 * frágil. Com `tool_choice` forçado, a resposta vem sempre como um bloco `tool_use`.
 */
export const PROOF_TOOL = {
  name: 'registrar_leitura',
  description: 'Registra exatamente o que foi lido no print da tela do app de entregas.',
  input_schema: {
    type: 'object',
    properties: {
      legivel: { type: 'boolean' },
      entregues: { type: ['integer', 'null'] },
      periodoInicio: { type: ['string', 'null'] },
      periodoFim: { type: ['string', 'null'] },
    },
    required: ['legivel'],
  },
} as const;

/** Corpo do POST do Claude (Messages API). Puro: dá pra testar sem rede. */
export function buildAnthropicBody(model: string, imageBase64: string, mimeType: string): unknown {
  const media = ANTHROPIC_MIME_OK.has(mimeType) ? mimeType : 'image/jpeg';
  return {
    // Sem `temperature`: a família Claude 5 (Haiku 5.5) a RECUSA com HTTP 400
    // ("temperature is deprecated for this model"). O determinismo vem do tool_choice
    // forçado + do schema fixo, não do temperature.
    model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    tools: [PROOF_TOOL],
    tool_choice: { type: 'tool', name: PROOF_TOOL.name },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media, data: imageBase64 } },
        { type: 'text', text: PROOF_PROMPT },
      ],
    }],
  };
}

/**
 * Tira a leitura de dentro da resposta do Claude. Puro e blindado: qualquer formato
 * inesperado vira `null` em vez de exceção (igual ao `parseGeminiResponse`).
 */
export function parseAnthropicResponse(payload: unknown): ProofReadingRaw | null {
  try {
    const p = payload as { content?: Array<{ type?: string; input?: Record<string, unknown> }> };
    const bloco = p?.content?.find((c) => c?.type === 'tool_use' && c.input && typeof c.input === 'object');
    const obj = bloco?.input;
    if (!obj || typeof obj !== 'object') return null;
    return {
      legivel: obj.legivel,
      entregues: obj.entregues,
      periodoInicio: obj.periodoInicio,
      periodoFim: obj.periodoFim,
    };
  } catch {
    return null;
  }
}

/** A leitura veio COMPLETA (número + as duas datas)? É o que encerra o rodízio. */
export function readingIsComplete(r: ProofReadingRaw | null): boolean {
  if (r === null) return false;
  if (r.legivel === false) return false;
  return r.entregues !== null && r.entregues !== undefined
    && r.periodoInicio !== null && r.periodoInicio !== undefined
    && r.periodoFim !== null && r.periodoFim !== undefined;
}

/**
 * Quantas RECUSAS ("legivel: false") aceitar antes de desistir de vez.
 *
 * 🔑 ERA 1 — a primeira recusa encerrava o assunto (18/08/2026). O comentário
 * antigo dizia que insistir "daria o mesmo resultado", mas isso nunca foi medido,
 * e um caso real provou o contrário: o print do Gustavo (foto da tela de outro
 * celular, com sombra atravessando, torta, com reflexo) tem o número perfeitamente
 * legível — 1199, batendo exato com a planilha — e mesmo assim voltou "ilegível"
 * na primeira tentativa. Modelo conservador ≠ foto ruim.
 *
 * Decisão do Victor (18/08): tentar mais 2 modelos antes de aceitar a recusa.
 * Só print DIFÍCIL gasta isso; o normal continua custando 1 leitura.
 */
export const RECUSAS_ATE_DESISTIR = 3;

/**
 * A leitura é aproveitável? Mantido pelo nome antigo pra não quebrar chamador
 * externo — hoje é só `readingIsComplete`.
 */
export function readingIsUsable(r: ProofReadingRaw | null): boolean {
  return readingIsComplete(r);
}

// ─── A chamada de verdade (com rodízio) ──────────────────────────────────────

/** Pares (chave, modelo) na ordem de tentativa: varre modelos, depois chaves. */
export function attemptOrder(cfg: VisionConfig): Array<{ apiKey: string; model: string }> {
  const out: Array<{ apiKey: string; model: string }> = [];
  for (const apiKey of cfg.apiKeys) {
    for (const model of cfg.models) out.push({ apiKey, model });
  }
  return out;
}

export const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

/**
 * Lê o print. **Nunca lança.** Devolve `null` quando não deu — o chamador
 * transforma isso em "conferir na mão", jamais em recusa.
 *
 * O rodízio existe porque no plano grátis a cota é de 20 leituras por DIA por
 * MODELO por PROJETO. Cada modelo tentado é uma cota nova; cada chave também.
 * Além da cota (429), o rodízio cobre modelo aposentado (404) e pico de demanda
 * (503) — os três aconteceram durante a medição de 04/08.
 */
export async function readProofImage(
  imageBase64: string,
  mimeType: string,
  cfg: VisionConfig,
  log: (msg: string) => void = () => {},
): Promise<ProofReadingRaw | null> {
  if (cfg.provider === 'none' || cfg.apiKeys.length === 0) {
    log('[vision] sem provedor configurado — print vai pra conferência manual');
    return null;
  }

  const tentativas = attemptOrder(cfg).slice(0, Math.max(1, cfg.maxAttempts));

  /** Última recusa vista. Se ninguém ler, é ela que volta (e não `null`). */
  let recusa: ProofReadingRaw | null = null;
  let recusas = 0;

  for (const { apiKey, model } of tentativas) {
    try {
      // A "tomada" trocável: Gemini e Claude têm URL/headers/corpo diferentes, mas o
      // rodízio, as recusas e o veredito abaixo são os MESMOS pros dois provedores.
      const anthropic = cfg.provider === 'anthropic';
      const url = anthropic ? ANTHROPIC_URL : GEMINI_URL(model);
      const headers = anthropic
        ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
        : { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
      const body = JSON.stringify(
        anthropic ? buildAnthropicBody(model, imageBase64, mimeType) : buildGeminiBody(imageBase64, mimeType),
      );
      const resp = await fetch(url, { method: 'POST', headers, body });

      if (!resp.ok) {
        // 429 cota · 503 pico · 404 modelo aposentado · 403 projeto bloqueado -> próximo.
        log(`[vision] ${model}: HTTP ${resp.status}, tentando o próximo`);
        continue;
      }

      const leitura = anthropic
        ? parseAnthropicResponse(await resp.json())
        : parseGeminiResponse(await resp.json());
      if (readingIsComplete(leitura)) {
        log(`[vision] ${model}: leitura ok${recusas > 0 ? ` (na ${recusas + 1}ª tentativa — ${recusas} recusa(s) antes)` : ''}`);
        return leitura;
      }

      // 🔑 RECUSA NÃO ENCERRA MAIS O ASSUNTO (18/08/2026). Ver `RECUSAS_ATE_DESISTIR`.
      if (leitura?.legivel === false) {
        recusa = leitura;
        recusas += 1;
        if (recusas >= RECUSAS_ATE_DESISTIR) {
          log(`[vision] ${model}: ${recusas} modelos seguidos disseram ilegível — aceito, vai pra conferência manual`);
          return recusa;
        }
        log(`[vision] ${model}: disse ilegível (${recusas}/${RECUSAS_ATE_DESISTIR}), tentando outro modelo`);
        continue;
      }

      log(`[vision] ${model}: resposta incompleta, tentando o próximo`);
    } catch (err) {
      log(`[vision] ${model}: falhou (${String(err)}), tentando o próximo`);
    }
  }

  // Acabaram as tentativas. Se alguém chegou a dizer "ilegível", essa é a resposta
  // mais informativa que temos — melhor que `null` (que significa "nem consegui perguntar").
  if (recusa) {
    log('[vision] acabaram as tentativas; a última resposta foi "ilegível"');
    return recusa;
  }
  log('[vision] nenhuma tentativa deu certo — print vai pra conferência manual');
  return null;
}
