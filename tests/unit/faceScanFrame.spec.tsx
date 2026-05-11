/**
 * Sub-fase 10.8 — FaceScanFrame unit spec
 *
 * Componente em `src/components/employee-clock/FaceScanFrame.tsx` (294 lin) é
 * um wrapper de display puro: recebe `visual: FaceScanVisual` + opcionais
 * `countdown` e `confidence` e renderiza overlay (4 corners em L, partículas,
 * scan line, countdown, barra de confiança, pill com label).
 *
 * Escolha: unit test via @testing-library/react ao invés de E2E + screenshot:
 *   1. Componente é puro (sem hooks de webcam/face-api) — perfeito pra unit.
 *   2. E2E exigiria mocks pesados de FaceVerification/FaceRegistration (vide
 *      sub-fase 10.7 postponed).
 *   3. Snapshot visual via `toHaveScreenshot` exige baseline + comparação
 *      pixel-perfect — frágil em headless Chromium com animações CSS keyframes.
 *
 * Cenários:
 *   1. Render default (color=blue) — 4 cantos com borderColor azul
 *   2. Label aparece no DOM
 *   3. countdown=0 — número NÃO renderiza
 *   4. countdown=3 — número 3 visível
 *   5. confidence=0.85 — barra com "85%" visível
 *   6. confidence=undefined — barra NÃO renderiza
 *   7. flash='success' — overlay full-screen verde renderiza
 *   8. flash=null — overlay NÃO renderiza
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FaceScanFrame, type FaceScanVisual } from '../../src/components/employee-clock/FaceScanFrame';

const baseVisual: FaceScanVisual = {
  color: 'blue',
  label: 'Posicione o rosto',
};

describe('FaceScanFrame', () => {
  beforeEach(() => cleanup());

  it('1. Render default (color=blue) — 4 cantos com borderColor azul (#3B82F6)', () => {
    const { container } = render(<FaceScanFrame visual={baseVisual} />);
    // Os 4 corners são <div>s com borderStyle: solid, borderColor: '#3B82F6'.
    // Filtramos por inline style (a única forma de distinguir).
    const allDivs = Array.from(container.querySelectorAll('div'));
    const corners = allDivs.filter(d => {
      const s = d.getAttribute('style') || '';
      return s.includes('border-color: rgb(59, 130, 246)') && s.includes('border-style: solid');
    });
    expect(corners.length).toBe(4);
  });

  it('2. Label aparece no DOM (texto "Posicione o rosto")', () => {
    render(<FaceScanFrame visual={baseVisual} />);
    expect(screen.getByText('Posicione o rosto')).toBeInTheDocument();
  });

  it('3. countdown=0 — número NÃO renderiza', () => {
    const { container } = render(<FaceScanFrame visual={baseVisual} countdown={0} />);
    // Não esperamos um "0" como counter (countdown > 0 condicional)
    expect(container.querySelector('[style*="font-size: 80px"]')).toBeNull();
  });

  it('4. countdown=3 — número 3 visível com font-size 80px', () => {
    const { container } = render(<FaceScanFrame visual={baseVisual} countdown={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    // Confirma que é o countdown (style font-size: 80px)
    const cd = container.querySelector('[style*="font-size: 80px"]');
    expect(cd).not.toBeNull();
    expect(cd?.textContent).toBe('3');
  });

  it('5. confidence=0.85 — barra com "85%" visível', () => {
    render(<FaceScanFrame visual={baseVisual} confidence={0.85} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Confiança')).toBeInTheDocument();
  });

  it('6. confidence=undefined — barra "Confiança" NÃO renderiza', () => {
    render(<FaceScanFrame visual={baseVisual} />);
    expect(screen.queryByText('Confiança')).toBeNull();
  });

  it('7. flash="success" — overlay full-screen verde renderiza', () => {
    const visual: FaceScanVisual = { ...baseVisual, flash: 'success' };
    const { container } = render(<FaceScanFrame visual={visual} />);
    // Flash é div com inset:0 + background rgba(34,197,94, ...)
    const flashes = Array.from(container.querySelectorAll('div'))
      .filter(d => (d.getAttribute('style') || '').includes('rgba(34, 197, 94'));
    expect(flashes.length).toBeGreaterThanOrEqual(1);
  });

  it('8. flash=null — overlay NÃO renderiza', () => {
    const { container } = render(<FaceScanFrame visual={baseVisual} />);
    const flashes = Array.from(container.querySelectorAll('div'))
      .filter(d => (d.getAttribute('style') || '').includes('rgba(34, 197, 94'));
    expect(flashes.length).toBe(0);
  });
});
