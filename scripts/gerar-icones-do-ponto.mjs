#!/usr/bin/env node
/**
 * Gera os ícones do app "Ponto" a partir de public/favicon.svg — o relógio azul do sistema
 * (30/09/2026, decisão do Victor: nome "Ponto" + o relógio azul). Se o desenho mudar (ex.: o
 * logo da empresa), troque o SVG e rode de novo:
 *
 *   node scripts/gerar-icones-do-ponto.mjs
 *
 * Por que existe: os PNGs antigos (favicon-16x16, favicon-32x32 e apple-touch-icon, de
 * out/2025) eram TEXTO — base64 salvo como arquivo, e ainda cortado no meio. Nenhum aparelho
 * conseguia abrir. Aqui quem desenha é o Chromium dos testes, a partir do próprio SVG.
 *
 * O que sai (e por quê cada um é diferente):
 *   public/favicon-16x16.png, favicon-32x32.png → aba do navegador: o desenho como é (cantos
 *                                                  arredondados, fundo transparente)
 *   public/icons/ponto-192.png, ponto-512.png    → ícone do app ("any"): idem
 *   public/icons/ponto-maskable-192.png, -512    → ícone do app no Android ("maskable"): o Android
 *                                                  RECORTA o ícone (círculo, gota, quadrado), então
 *                                                  o azul vai até a borda e o relógio fica dentro
 *                                                  da zona segura (raio de 40% a partir do centro)
 *   public/apple-touch-icon.png (180)            → iPhone/iPad: igual ao maskable — o iOS pinta a
 *                                                  transparência de PRETO e arredonda sozinho
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RAIZ, 'public');
const SVG_ORIGINAL = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');

/**
 * A versão de fundo cheio (maskable / iPhone): o quadrado azul perde o canto arredondado e o
 * relógio encolhe pra 80% em volta do centro. Raio do relógio no SVG = 20 + 1,5 de traço = 21,5
 * em 64 → a 80% fica em 17,2/64 = 27% do lado, dentro da zona segura de 40%.
 */
function versaoDeFundoCheio(svg) {
  const FUNDO_ARREDONDADO = '<rect width="64" height="64" rx="12" fill="#2563eb"/>';
  if (!svg.includes(FUNDO_ARREDONDADO)) {
    // Desenho novo: este script precisa ser revisto antes de gerar um ícone torto em silêncio.
    throw new Error('public/favicon.svg mudou: não achei o fundo arredondado esperado. Revise versaoDeFundoCheio().');
  }
  const semFundo = svg.replace(FUNDO_ARREDONDADO, '');
  const abertura = semFundo.indexOf('>') + 1;
  const fechamento = semFundo.lastIndexOf('</svg>');
  return `${semFundo.slice(0, abertura)}
  <rect width="64" height="64" fill="#2563eb"/>
  <g transform="translate(32 32) scale(0.8) translate(-32 -32)">${semFundo.slice(abertura, fechamento)}</g>
</svg>
`;
}

const SVG_FUNDO_CHEIO = versaoDeFundoCheio(SVG_ORIGINAL);

const SAIDAS = [
  { arquivo: 'favicon-16x16.png', lado: 16, svg: SVG_ORIGINAL },
  { arquivo: 'favicon-32x32.png', lado: 32, svg: SVG_ORIGINAL },
  { arquivo: 'icons/ponto-192.png', lado: 192, svg: SVG_ORIGINAL },
  { arquivo: 'icons/ponto-512.png', lado: 512, svg: SVG_ORIGINAL },
  { arquivo: 'icons/ponto-maskable-192.png', lado: 192, svg: SVG_FUNDO_CHEIO },
  { arquivo: 'icons/ponto-maskable-512.png', lado: 512, svg: SVG_FUNDO_CHEIO },
  { arquivo: 'apple-touch-icon.png', lado: 180, svg: SVG_FUNDO_CHEIO },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { arquivo, lado, svg } of SAIDAS) {
    const destino = path.join(PUBLIC, arquivo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    await page.setViewportSize({ width: lado, height: lado });
    const dados = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(
      '<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block}</style></head>'
      + `<body><img id="icone" width="${lado}" height="${lado}" src="${dados}"></body></html>`,
    );
    await page.locator('#icone').evaluate((img) => img.decode());
    await page.screenshot({ path: destino, omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado } });
    console.log(`✓ public/${arquivo} (${lado}×${lado})`);
  }
} finally {
  await browser.close();
}
