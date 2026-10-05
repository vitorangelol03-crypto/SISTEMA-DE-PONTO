import React from 'react';
import { faseDaMoldura } from './faseDaMoldura';

/**
 * Moldura do rosto das 3 telas de câmera (sem CPF, verificação com CPF e cadastro do rosto).
 *
 * 05/10/2026 — visual "Malha neon", escolhido pelo Victor no teste do tablet (o anterior ele achou
 * "tosco"). Muda SÓ a aparência: as telas continuam mandando o mesmo `visual` (cor, pulso, varredura,
 * tremida, flash, aviso), a mesma contagem e a mesma confiança. Duas mudanças de forma:
 *   1. A moldura acompanha o tamanho da tela (antes era fixa em 220×290px e ficava pequena no
 *      tablet) — mesma proporção oval, entre 150 e 460px de largura.
 *   2. O que se move é transform/opacity/traço de SVG — nada de mexer em `top`/layout por quadro
 *      (a linha de varredura antiga animava `top`), porque a detecção de rosto roda junto no
 *      mesmo aparelho e o tablet é fraco.
 */

const COLORS = {
  blue:  '#A879FF',
  green: '#35F59B',
  red:   '#FF4D68',
} as const;

export type ScanColor = keyof typeof COLORS;

export interface FaceScanVisual {
  color: ScanColor;
  pulse?: boolean;
  showScanLine?: boolean;
  shake?: boolean;
  flash?: 'success' | 'fail' | null;
  label: string;
}

interface Props {
  visual: FaceScanVisual;
  countdown?: number;   // 0 → oculto
  confidence?: number;  // 0..1 — undefined → sem barra
  /**
   * Distância do aviso (o rótulo de baixo) até o fundo da tela, em CSS (30/09/2026). Padrão
   * 28px. A tela sem CPF tem o botão "Prefere digitar CPF e senha?" no mesmo lugar — e ele
   * ESCONDIA o aviso ("Aproxime o rosto", "Identificando...", "Não reconheci"); lá o aviso sobe.
   */
  labelBottom?: string;
}

// Desenho num quadro de 220×290 (a proporção oval de sempre), rosto centrado em (110, 152).
const LARGURA = 220;
const ALTURA = 290;
const CX = 110;
const CY = 152;

interface PontoDaMalha { x: number; y: number }

/**
 * Pontos de referência de um rosto (queixo, testa, olhos, sobrancelhas, nariz, boca, bochechas) e
 * as linhas que os ligam. É decoração: não vem da detecção — fica no lugar onde o rosto deve estar.
 */
function montarMalha(): { pontos: PontoDaMalha[]; linhas: Array<[number, number]> } {
  const rx = 66;
  const ry = 88;
  const pontos: PontoDaMalha[] = [];
  const add = (x: number, y: number) => { pontos.push({ x, y }); return pontos.length - 1; };
  const queixo: number[] = [];
  for (let j = 0; j <= 12; j++) {
    const t = ((12 + j * 13) * Math.PI) / 180;
    queixo.push(add(CX + rx * Math.cos(t), CY + ry * 0.96 * Math.sin(t)));
  }
  const testa: number[] = [];
  for (let k = 1; k <= 6; k++) {
    const u = ((180 + k * (180 / 7)) * Math.PI) / 180;
    testa.push(add(CX + rx * 0.92 * Math.cos(u), CY + ry * 0.92 * Math.sin(u)));
  }
  const olhoE = [add(CX - 39, CY - 11), add(CX - 28, CY - 18), add(CX - 17, CY - 11), add(CX - 28, CY - 6)];
  const olhoD = [add(CX + 17, CY - 11), add(CX + 28, CY - 18), add(CX + 39, CY - 11), add(CX + 28, CY - 6)];
  const sobE = [add(CX - 45, CY - 30), add(CX - 30, CY - 36), add(CX - 13, CY - 31)];
  const sobD = [add(CX + 13, CY - 31), add(CX + 30, CY - 36), add(CX + 45, CY - 30)];
  const nariz = [add(CX, CY - 24), add(CX, CY - 4), add(CX, CY + 15)];
  const narinas = [add(CX - 12, CY + 19), add(CX + 12, CY + 19)];
  const boca = [add(CX - 22, CY + 41), add(CX - 8, CY + 35), add(CX, CY + 37), add(CX + 8, CY + 35), add(CX + 22, CY + 41), add(CX, CY + 48)];
  const bochecha = [add(CX - 49, CY + 11), add(CX + 49, CY + 11)];

  const linhas: Array<[number, number]> = [];
  const corrente = (lista: number[], fecha = false) => {
    for (let q = 0; q < lista.length - 1; q++) linhas.push([lista[q], lista[q + 1]]);
    if (fecha) linhas.push([lista[lista.length - 1], lista[0]]);
  };
  corrente(queixo);
  corrente([queixo[12], ...testa, queixo[0]]);
  corrente(olhoE, true);
  corrente(olhoD, true);
  corrente(sobE);
  corrente(sobD);
  corrente(nariz);
  linhas.push([nariz[2], narinas[0]], [nariz[2], narinas[1]]);
  corrente(boca.slice(0, 5));
  linhas.push([boca[0], boca[5]], [boca[4], boca[5]]);
  linhas.push(
    [bochecha[0], olhoE[0]], [bochecha[0], narinas[0]], [bochecha[0], queixo[9]], [bochecha[0], boca[0]],
    [bochecha[1], olhoD[2]], [bochecha[1], narinas[1]], [bochecha[1], queixo[3]], [bochecha[1], boca[4]],
    [sobE[2], nariz[0]], [sobD[0], nariz[0]], [olhoE[2], nariz[1]], [olhoD[0], nariz[1]],
    [sobE[0], testa[5]], [sobD[2], testa[0]], [sobE[1], testa[4]], [sobD[1], testa[1]],
    [narinas[0], boca[1]], [narinas[1], boca[3]], [boca[5], queixo[6]],
  );
  return { pontos, linhas };
}

const MALHA = montarMalha();

const STYLE_ID = 'face-scan-frame-v2';

// Injeta as regras uma única vez no <head> (mesmo jeito da versão anterior): o componente monta e
// desmonta várias vezes por sessão e o resto do app não usa nada disto.
const ensureStyles = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .fsf2-root { position: absolute; left: 50%; z-index: 5; pointer-events: none;
      --fsf2-w: clamp(150px, min(62vw, calc(50vh * ${LARGURA / ALTURA})), 460px);
      width: var(--fsf2-w); aspect-ratio: ${LARGURA} / ${ALTURA};
      top: max(calc(var(--fsf2-w) * ${ALTURA / 2} / ${LARGURA} + 8px),
               min(50%, calc(100% - var(--fsf2-reserva, 0px) - var(--fsf2-w) * ${ALTURA / 2} / ${LARGURA})));
      transform: translate(-50%, -50%); container-type: inline-size; }
    @supports (height: 1dvh) {
      .fsf2-root { --fsf2-w: clamp(150px, min(62vw, calc(50dvh * ${LARGURA / ALTURA})), 460px); }
    }
    .fsf2-root[data-color="blue"]  { --fsf2-a: #A879FF; --fsf2-b: #39E6FF; }
    .fsf2-root[data-color="green"] { --fsf2-a: #35F59B; --fsf2-b: #35F59B; }
    .fsf2-root[data-color="red"]   { --fsf2-a: #FF4D68; --fsf2-b: #FF4D68; }
    .fsf2-spot { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 9999px rgba(3, 4, 12, 0.58); }
    .fsf2-mexe { position: absolute; inset: 0; }
    .fsf2-root[data-phase="falhou"] .fsf2-mexe { animation: fsf2-treme 450ms cubic-bezier(.36,.07,.19,.97) both; }
    .fsf2-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .fsf2-svg * { transform-box: view-box; transform-origin: ${CX}px 145px; }
    .fsf2-brilho { fill: none; stroke: var(--fsf2-a); stroke-width: 9; opacity: .13; transition: stroke 300ms; }
    .fsf2-borda { fill: none; stroke: var(--fsf2-a); stroke-width: 2; opacity: .9; transition: stroke 300ms; }
    .fsf2-root[data-phase="procurando"] .fsf2-borda { stroke-dasharray: 3 7; animation: fsf2-respira 2.2s ease-in-out infinite; }
    .fsf2-varre { display: none; }
    .fsf2-root[data-phase="procurando"] .fsf2-varre { display: block; animation: fsf2-varre 2.2s ease-in-out infinite alternate; }
    .fsf2-malha { opacity: 0; transition: opacity 300ms; }
    .fsf2-root:not([data-phase="procurando"]) .fsf2-malha { opacity: 1; }
    .fsf2-root[data-phase="analisando"] .fsf2-pulso { animation: fsf2-pulsa 1.4s ease-in-out 900ms infinite; }
    .fsf2-root[data-phase="parado"] .fsf2-pulso { animation: fsf2-pulsa 1.8s ease-in-out infinite; }
    .fsf2-ponto { fill: var(--fsf2-a); transform-box: fill-box; transform-origin: center;
      transition: transform 500ms cubic-bezier(.6,0,.4,1), opacity 450ms; }
    .fsf2-root[data-phase="analisando"] .fsf2-ponto { animation: fsf2-surge 300ms ease-out both; }
    .fsf2-linha { stroke: var(--fsf2-b); stroke-width: .9; opacity: .7; transition: opacity 300ms; }
    .fsf2-root[data-phase="procurando"] .fsf2-ponto, .fsf2-root[data-phase="procurando"] .fsf2-linha { transition: none; }
    .fsf2-root[data-phase="confirmado"] .fsf2-ponto, .fsf2-root[data-phase="falhou"] .fsf2-ponto,
    .fsf2-root[data-phase="confirmado"] .fsf2-linha, .fsf2-root[data-phase="falhou"] .fsf2-linha { opacity: 0; }
    .fsf2-certo { fill: none; stroke: #35F59B; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: 100; stroke-dashoffset: 100; }
    .fsf2-root[data-phase="confirmado"] .fsf2-certo { animation: fsf2-desenha 450ms 250ms ease-out forwards; }
    .fsf2-anel { fill: none; stroke: var(--fsf2-b); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 100;
      stroke-dashoffset: 100; animation: fsf2-desenha 1s linear forwards; }
    .fsf2-numero { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: var(--fsf2-a); font-weight: 800; font-size: clamp(56px, 14vw, 120px); line-height: 1;
      text-shadow: 0 4px 24px rgba(0, 0, 0, 0.9); animation: fsf2-numero 900ms ease-out; }
    @supports (font-size: 1cqw) { .fsf2-numero { font-size: 36cqw; } }
    .fsf2-grade-caixa { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 4; }
    .fsf2-grade { position: absolute; inset: -24px; opacity: 0; transition: opacity 400ms;
      background-image: radial-gradient(rgba(168, 121, 255, 0.55) 1px, transparent 1.6px); background-size: 24px 24px; }
    .fsf2-grade-caixa[data-on="true"] .fsf2-grade { opacity: .45; }
    .fsf2-flash { position: absolute; inset: 0; pointer-events: none; z-index: 15; animation: fsf2-flash 450ms ease-out forwards; }
    .fsf2-flash[data-flash="success"] { background: radial-gradient(circle at 50% 50%, rgba(53,245,155,.42), rgba(53,245,155,.08) 60%, transparent 78%); }
    .fsf2-flash[data-flash="fail"]    { background: radial-gradient(circle at 50% 50%, rgba(255,77,104,.42), rgba(255,77,104,.08) 60%, transparent 78%); }
    @keyframes fsf2-respira { 0%, 100% { transform: scale(1.03); opacity: .55; } 50% { transform: scale(.99); opacity: 1; } }
    @keyframes fsf2-varre { from { transform: translateY(18px); } to { transform: translateY(262px); } }
    @keyframes fsf2-pulsa { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
    @keyframes fsf2-surge { 0% { opacity: 0; transform: scale(0); } 70% { opacity: 1; transform: scale(1.6); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes fsf2-desenha { to { stroke-dashoffset: 0; } }
    @keyframes fsf2-numero { 0% { transform: scale(.3); opacity: 0; } 30% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes fsf2-treme { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); }
      30%, 50%, 70% { transform: translateX(-8px); } 40%, 60% { transform: translateX(8px); } }
    @keyframes fsf2-flash { 0% { opacity: 0; } 35% { opacity: 1; } 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .fsf2-root *, .fsf2-grade, .fsf2-flash { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
    }
  `;
  document.head.appendChild(style);
};

const AVISO = {
  blue:  { borda: 'rgba(168, 121, 255, 0.7)', brilho: 'rgba(168, 121, 255, 0.25)' },
  green: { borda: 'rgba(53, 245, 155, 0.7)',  brilho: 'rgba(53, 245, 155, 0.22)' },
  red:   { borda: 'rgba(255, 77, 104, 0.75)', brilho: 'rgba(255, 77, 104, 0.25)' },
} as const;

export const FaceScanFrame: React.FC<Props> = ({ visual, countdown = 0, confidence, labelBottom = '28px' }) => {
  // Antes da pintura (React 18): sem isso a 1ª montagem pintaria um quadro sem o CSS.
  React.useInsertionEffect(ensureStyles, []);
  // Ids do SVG próprios desta moldura (o `useId` do React traz ":", que atrapalha no url(#...)).
  const idBase = React.useId().replace(/:/g, '');
  const idRecorte = `fsf2-recorte-${idBase}`;
  const idVarredura = `fsf2-varredura-${idBase}`;

  const fase = faseDaMoldura(visual, countdown);
  const { flash, label } = visual;
  const aviso = AVISO[visual.color];

  /**
   * Espaço que a moldura deixa livre embaixo (05/10/2026): no celular deitado e no tablet 7"
   * deitado ela ficava por baixo do aviso (e da barra de confiança). Ela só sobe quando encostaria
   * — no tablet em pé e no celular em pé fica no meio, como sempre. Aviso = letra 0,9375rem × 1,5
   * + 0,625rem×2 de espaço + 3px de borda; barra de confiança = topo a 5,25rem + ~1,125rem + 12px.
   */
  const reserva = confidence != null
    ? 'calc(6.375rem + 24px)'
    : `calc(${labelBottom} + 2.65625rem + 15px)`;

  // A malha (≈100 elementos) só muda quando muda a fase — sem isto ela re-renderizava a cada
  // atualização das telas (a verificação e o cadastro atualizam a cada 500ms).
  const malha = React.useMemo(() => (
    <g className="fsf2-malha">
      <g className="fsf2-pulso">
        {MALHA.linhas.map(([a, b], i) => (
          <line
            key={`l${i}`}
            className="fsf2-linha"
            x1={MALHA.pontos[a].x} y1={MALHA.pontos[a].y}
            x2={MALHA.pontos[b].x} y2={MALHA.pontos[b].y}
          />
        ))}
        {MALHA.pontos.map((p, i) => {
          const dx = CX - p.x;
          const dy = CY - p.y;
          // Confirmado: os pontos se juntam no centro (lugar do ✓). Falhou: espalham pra fora.
          const transform = fase === 'confirmado' ? `translate(${dx}px, ${dy}px) scale(0.2)`
            : fase === 'falhou' ? `translate(${-dx * 0.7}px, ${-dy * 0.7}px)`
            : undefined;
          return (
            <circle
              key={`p${i}`}
              className="fsf2-ponto"
              cx={p.x} cy={p.y} r={2.1}
              style={{ animationDelay: `${i * 18}ms`, transform }}
            />
          );
        })}
      </g>
    </g>
  ), [fase]);

  const confPct = confidence != null ? Math.round(confidence * 100) : null;
  const barColor =
    confidence == null ? '#fff'
    : confidence >= 0.7 ? COLORS.green
    : confidence >= 0.4 ? '#FFC85A'
    : COLORS.red;

  return (
    <>
      {/* Flash (sucesso/falha) — toca uma vez quando a fase começa */}
      {flash && <div key={`flash-${flash}`} className="fsf2-flash" data-flash={flash} data-testid="face-scan-flash" />}

      {/* Grade de pontos ao fundo, só enquanto procura o rosto */}
      <div className="fsf2-grade-caixa" data-on={fase === 'procurando' ? 'true' : 'false'}>
        <div className="fsf2-grade" />
      </div>

      <div
        className="fsf2-root"
        data-testid="face-scan-frame"
        data-phase={fase}
        data-color={visual.color}
        style={{ ['--fsf2-reserva']: reserva } as React.CSSProperties}
      >
        <div className="fsf2-spot" />
        <div className="fsf2-mexe">
          <svg className="fsf2-svg" viewBox={`0 0 ${LARGURA} ${ALTURA}`} aria-hidden="true">
            <defs>
              <clipPath id={idRecorte}><ellipse cx={CX} cy={145} rx={104} ry={139} /></clipPath>
              <linearGradient id={idVarredura} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#39E6FF" stopOpacity="0" />
                <stop offset="0.5" stopColor="#39E6FF" stopOpacity="0.5" />
                <stop offset="1" stopColor="#39E6FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            <ellipse className="fsf2-brilho" cx={CX} cy={145} rx={106} ry={141} />
            <ellipse className="fsf2-borda" cx={CX} cy={145} rx={106} ry={141} />
            <g clipPath={`url(#${idRecorte})`}>
              <g className="fsf2-varre"><rect x={0} y={-8} width={LARGURA} height={16} fill={`url(#${idVarredura})`} /></g>
            </g>
            {malha}
            {fase === 'contagem' && (
              // Anel que dá a volta na moldura a cada segundo da contagem (começa em cima).
              <path key={`anel-${countdown}`} className="fsf2-anel" pathLength={100}
                d={`M ${CX} -4 A 114 149 0 1 1 ${CX - 0.01} -4`} />
            )}
            <path className="fsf2-certo" pathLength={100} d="M76 150 L100 174 L146 122" />
          </svg>

          {countdown > 0 && (
            <div key={countdown} className="fsf2-numero" data-testid="face-scan-countdown">{countdown}</div>
          )}
        </div>
      </div>

      {/* Barra de confiança (verificação). Posição e letra em rem (30/09/2026), como o aviso de
          baixo: no celular os mesmos 24/84/12px de antes; no tablet o aviso cresce e a barra sobe
          junto — em px ela ficava encostada nele. */}
      {confPct != null && (
        <div
          style={{
            position: 'absolute',
            left: '1.5rem',
            right: '1.5rem',
            bottom: '5.25rem',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#F4EEFF',
              fontSize: '0.75rem',
              marginBottom: 4,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            <span style={{ opacity: 0.85, letterSpacing: 0.4 }}>Confiança</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{confPct}%</span>
          </div>
          <div
            style={{
              height: 6,
              background: 'rgba(168,121,255,0.16)',
              border: '1px solid rgba(168,121,255,0.35)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${confPct}%`,
                background: `linear-gradient(90deg, #A879FF, ${barColor})`,
                boxShadow: `0 0 10px ${barColor}`,
                borderRadius: 999,
                transition: 'width 300ms ease-out, background 300ms',
              }}
            />
          </div>
        </div>
      )}

      {/* Aviso de status. Letra e espaço em rem (30/09/2026): no celular dá os mesmos 15px e
          10×22px de antes; no tablet cresce junto com o resto da tela de ponto. */}
      <div
        data-testid="face-scan-label"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: labelBottom,
          transform: 'translateX(-50%)',
          padding: '0.625rem 1.375rem',
          borderRadius: 14,
          background: 'rgba(10,8,22,0.86)',
          border: `1.5px solid ${aviso.borda}`,
          boxShadow: `0 0 18px ${aviso.brilho}`,
          color: '#F4EEFF',
          fontSize: '0.9375rem',
          fontWeight: 600,
          letterSpacing: 0.2,
          whiteSpace: 'nowrap',
          textAlign: 'center',
          transition: 'border-color 300ms, box-shadow 300ms',
          maxWidth: '92vw',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          zIndex: 20,
        }}
      >
        {label}
      </div>
    </>
  );
};
