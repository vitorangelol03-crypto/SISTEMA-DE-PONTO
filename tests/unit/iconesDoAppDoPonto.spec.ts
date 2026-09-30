import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * O APLICATIVO "PONTO" (30/09/2026) — o arquivo do app e os ícones.
 *
 * 🔴 Por que existe: os PNGs de ícone do site (favicon-16x16, favicon-32x32 e apple-touch-icon)
 * eram TEXTO desde out/2025 — base64 salvo como se fosse imagem, e ainda cortado. Nenhum
 * aparelho abria, e ninguém viu por quase um ano. Aqui cada ícone é conferido como PNG DE
 * VERDADE (assinatura + tamanho no cabeçalho), igual o celular vai ler.
 *
 * Os ícones saem de scripts/gerar-icones-do-ponto.mjs (a partir de public/favicon.svg). O mesmo
 * arquivo lido pelo navegador de verdade: tests/128.
 */

const RAIZ = path.resolve(__dirname, '../..');
const PUBLIC = path.join(RAIZ, 'public');

interface IconeDoApp { src: string; sizes: string; type: string; purpose?: string }
interface ArquivoDoApp {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  orientation?: string;
  background_color: string;
  theme_color: string;
  icons: IconeDoApp[];
}

/** Largura e altura lidas do cabeçalho do PNG — falha se o arquivo não for PNG de verdade. */
function medirPng(caminhoPublico: string): { largura: number; altura: number; tipoDeCor: number } {
  const arquivo = path.join(PUBLIC, caminhoPublico.replace(/^\//, ''));
  expect(fs.existsSync(arquivo), `${caminhoPublico} não existe em public/`).toBe(true);
  const b = fs.readFileSync(arquivo);
  expect([...b.subarray(0, 8)], `${caminhoPublico} não é um PNG de verdade`).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(b.subarray(12, 16).toString('ascii'), `${caminhoPublico}: cabeçalho do PNG`).toBe('IHDR');
  // Byte 25 = tipo de cor: 2 = RGB (sem transparência), 6 = RGBA.
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), tipoDeCor: b[25] };
}

const app = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'ponto.webmanifest'), 'utf8')) as ArquivoDoApp;

describe('arquivo do app "Ponto" (public/ponto.webmanifest)', () => {
  it('nome "Ponto", abre no /clock, só o /clock é o app, tela cheia total (decisões do Victor)', () => {
    expect(app.name).toBe('Ponto');
    expect(app.short_name).toBe('Ponto');
    expect(app.id).toBe('/clock');
    expect(app.start_url).toBe('/clock');
    expect(app.scope).toBe('/clock');
    expect(app.display).toBe('fullscreen');
    expect(app.theme_color).toBe('#2563eb');
    expect(app.background_color).toBe('#2563eb');
  });

  it('sem "orientation": o app gira com o tablet e respeita a trava de rotação do aparelho', () => {
    // Com "any", o Chrome do Android ignora a trava de rotação — tablet preso na parede giraria.
    expect(app.orientation).toBeUndefined();
  });

  it('ícones de 192 e 512, comum e "maskable" (o Android recorta o ícone), e cada um é PNG do tamanho que diz', () => {
    expect(app.icons.map((i) => `${i.sizes}/${i.purpose ?? 'any'}`).sort()).toEqual(
      ['192x192/any', '192x192/maskable', '512x512/any', '512x512/maskable'],
    );
    for (const icone of app.icons) {
      expect(icone.type).toBe('image/png');
      const [largura, altura] = icone.sizes.split('x').map(Number);
      const png = medirPng(icone.src);
      expect({ largura: png.largura, altura: png.altura }, icone.src).toEqual({ largura, altura });
      // O "maskable" é recortado pelo Android: fundo cheio, sem transparência.
      if (icone.purpose === 'maskable') expect(png.tipoDeCor, `${icone.src} sem transparência`).toBe(2);
    }
  });
});

describe('ícones do index.html (a regressão dos PNGs que eram texto)', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const pngsDoHtml = [...html.matchAll(/<link[^>]+href="([^"]+\.png)"[^>]*>/g)].map((m) => m[1]);

  it('o index.html aponta os 3 ícones PNG', () => {
    expect(pngsDoHtml.sort()).toEqual(['/apple-touch-icon.png', '/favicon-16x16.png', '/favicon-32x32.png']);
  });

  it('cada um é PNG de verdade, do tamanho declarado', () => {
    expect(medirPng('/favicon-16x16.png')).toMatchObject({ largura: 16, altura: 16 });
    expect(medirPng('/favicon-32x32.png')).toMatchObject({ largura: 32, altura: 32 });
    expect(medirPng('/apple-touch-icon.png')).toMatchObject({ largura: 180, altura: 180 });
  });

  it('o do iPhone não tem transparência (o iOS pinta transparência de PRETO)', () => {
    expect(medirPng('/apple-touch-icon.png').tipoDeCor).toBe(2);
  });
});
