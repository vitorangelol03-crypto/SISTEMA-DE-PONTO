import React from 'react';

const COLORS = {
  blue:  '#3B82F6',
  green: '#22C55E',
  red:   '#EF4444',
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
}

const FRAME_WIDTH = 220;
const FRAME_HEIGHT = 290;
const BORDER_THICK = 3;
const STYLE_ID = 'face-scan-frame-keyframes';

// Injeta keyframes uma única vez no <head>. Evita duplicação se o componente
// montar/desmontar várias vezes durante a sessão.
const ensureKeyframes = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes fsf-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.65; }
    }
    @keyframes fsf-scanline {
      0%   { top: 6%;  opacity: 0; }
      8%   { opacity: 1; }
      50%  { top: 94%; opacity: 1; }
      58%  { opacity: 0; }
      100% { top: 6%;  opacity: 0; }
    }
    @keyframes fsf-particle {
      0%, 100% { transform: scale(1);   opacity: 1;   }
      50%      { transform: scale(1.7); opacity: 0.4; }
    }
    @keyframes fsf-flash {
      0%   { opacity: 0; }
      40%  { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes fsf-shake {
      0%, 100% { transform: translate(-50%, -50%); }
      20%      { transform: translate(calc(-50% - 10px), -50%); }
      40%      { transform: translate(calc(-50% + 10px), -50%); }
      60%      { transform: translate(calc(-50% - 8px),  -50%); }
      80%      { transform: translate(calc(-50% + 8px),  -50%); }
    }
    @keyframes fsf-countdown {
      0%   { transform: scale(0.3); opacity: 0; }
      30%  { transform: scale(1.4); opacity: 1; }
      100% { transform: scale(1);   opacity: 1; }
    }
  `;
  document.head.appendChild(style);
};

export const FaceScanFrame: React.FC<Props> = ({ visual, countdown = 0, confidence }) => {
  React.useEffect(ensureKeyframes, []);

  const color = COLORS[visual.color];
  const { pulse, showScanLine, shake, flash, label } = visual;

  const confPct = confidence != null ? Math.round(confidence * 100) : null;
  const barColor =
    confidence == null ? '#fff'
    : confidence >= 0.7 ? COLORS.green
    : confidence >= 0.4 ? '#EAB308'
    : COLORS.red;

  // 4 partículas posicionadas em 12h, 3h, 6h, 9h da elipse (topo/direita/baixo/esquerda)
  const particles = [
    { key: 'p0', top: -5,  left: FRAME_WIDTH / 2 - 5,  delay: '0s'    }, // topo
    { key: 'p1', top: FRAME_HEIGHT / 2 - 5, right: -5, delay: '0.15s' }, // direita
    { key: 'p2', bottom: -5, left: FRAME_WIDTH / 2 - 5, delay: '0.3s'  }, // baixo
    { key: 'p3', top: FRAME_HEIGHT / 2 - 5, left: -5, delay: '0.45s' }, // esquerda
  ] as const;

  return (
    <>
      {/* Flash full-screen (success/fail) */}
      {flash && (
        <div
          key={`flash-${flash}-${Date.now()}`}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: flash === 'success' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
            animation: 'fsf-flash 300ms ease-out',
            zIndex: 15,
          }}
        />
      )}

      {/* Frame oval — formato de rosto, com borda contínua e spotlight via box-shadow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          borderStyle: 'solid',
          borderWidth: BORDER_THICK,
          borderColor: color,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          pointerEvents: 'none',
          animation: shake
            ? 'fsf-shake 400ms ease-in-out'
            : pulse
            ? 'fsf-pulse 1.8s ease-in-out infinite'
            : 'none',
          transition: 'border-color 300ms',
          zIndex: 5,
        }}
      >
        {/* Linha de scan — dentro da elipse (overflow:hidden corta nas pontas) */}
        {showScanLine && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(to right, transparent, ${color}, transparent)`,
              boxShadow: `0 0 10px ${color}`,
              animation: 'fsf-scanline 2s ease-in-out infinite',
            }}
          />
        )}

        {/* Countdown 80px com pop */}
        {countdown > 0 && (
          <div
            key={countdown}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 80,
              fontWeight: 800,
              lineHeight: 1,
              textShadow: '0 4px 24px rgba(0,0,0,0.9), 0 0 40px rgba(59,130,246,0.7)',
              animation: 'fsf-countdown 900ms ease-out',
            }}
          >
            {countdown}
          </div>
        )}
      </div>

      {/* Partículas em 12h/3h/6h/9h — wrapper externo pra não serem cortadas pelo overflow:hidden */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 6,
        }}
      >
        {particles.map(({ key, delay, ...pos }) => (
          <div
            key={key}
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 12px ${color}`,
              animation: 'fsf-particle 1.4s ease-in-out infinite',
              animationDelay: delay,
              transition: 'background 300ms, box-shadow 300ms',
              ...pos,
            }}
          />
        ))}
      </div>

      {/* Barra de confiança (verificação) */}
      {confPct != null && (
        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 84,
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#fff',
              fontSize: 12,
              marginBottom: 4,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            <span style={{ opacity: 0.85 }}>Confiança</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{confPct}%</span>
          </div>
          <div
            style={{
              height: 6,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 999,
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${confPct}%`,
                background: barColor,
                boxShadow: `0 0 10px ${barColor}`,
                borderRadius: 999,
                transition: 'width 300ms ease-out, background 300ms',
              }}
            />
          </div>
        </div>
      )}

      {/* Rótulo de status (pill com blur) */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          padding: '10px 22px',
          borderRadius: 999,
          background: 'rgba(0,0,0,0.82)',
          border: `1.5px solid ${color}66`,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: 0.2,
          whiteSpace: 'nowrap',
          textAlign: 'center',
          transition: 'border-color 300ms',
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
