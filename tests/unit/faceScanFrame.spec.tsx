/**
 * Sub-fase 10.8 — FaceScanFrame unit spec
 *
 * Componente em `src/components/employee-clock/FaceScanFrame.tsx` é um wrapper de display puro:
 * recebe `visual: FaceScanVisual` + opcionais `countdown` e `confidence` e renderiza o overlay
 * (moldura oval, malha, contagem, barra de confiança, aviso).
 *
 * 05/10/2026 — visual "Malha neon" (escolha do Victor). Os cenários 1, 3, 4, 7 e 8 conferiam
 * detalhes do DESENHO ANTIGO (borda azul rgb(59,130,246), 4 partículas `fsf-particle`, número de
 * 80px, flash rgba(34,197,94)) — o desenho mudou de propósito, então eles passam a conferir o mesmo
 * COMPORTAMENTO pelos marcadores estáveis (data-testid/data-phase/data-color). Os demais (aviso,
 * posição do aviso, letra em rem, barra de confiança) continuam iguais, sem mudança.
 *
 * Escolha: unit test via @testing-library/react ao invés de E2E + screenshot:
 *   1. Componente é puro (sem hooks de webcam/face-api) — perfeito pra unit.
 *   2. E2E exigiria mocks pesados de FaceVerification/FaceRegistration (vide
 *      sub-fase 10.7 postponed).
 *   3. Snapshot visual via `toHaveScreenshot` exige baseline + comparação
 *      pixel-perfect — frágil em headless Chromium com animações CSS keyframes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FaceScanFrame, type FaceScanVisual } from '../../src/components/employee-clock/FaceScanFrame';
import { faseDaMoldura } from '../../src/components/employee-clock/faseDaMoldura';

const baseVisual: FaceScanVisual = {
  color: 'blue',
  label: 'Posicione o rosto',
};

describe('FaceScanFrame', () => {
  beforeEach(() => cleanup());

  it('1. Render default (color=blue) — moldura com a cor da fase + malha de pontos do rosto', () => {
    const { container } = render(<FaceScanFrame visual={baseVisual} />);
    const moldura = screen.getByTestId('face-scan-frame');
    expect(moldura.getAttribute('data-color')).toBe('blue');
    // Sem pulso/varredura/flash: moldura parada, com a malha (pontos ligados por linhas) desenhada
    expect(moldura.getAttribute('data-phase')).toBe('parado');
    expect(container.querySelectorAll('circle.fsf2-ponto').length).toBeGreaterThanOrEqual(40);
    expect(container.querySelectorAll('line.fsf2-linha').length).toBeGreaterThanOrEqual(40);
  });

  it('2. Label aparece no DOM (texto "Posicione o rosto")', () => {
    render(<FaceScanFrame visual={baseVisual} />);
    expect(screen.getByText('Posicione o rosto')).toBeInTheDocument();
  });

  it('3. countdown=0 — número NÃO renderiza', () => {
    render(<FaceScanFrame visual={baseVisual} countdown={0} />);
    expect(screen.queryByTestId('face-scan-countdown')).toBeNull();
  });

  it('4. countdown=3 — número 3 visível, com o anel da contagem', () => {
    const { container } = render(<FaceScanFrame visual={baseVisual} countdown={3} />);
    expect(screen.getByTestId('face-scan-countdown').textContent).toBe('3');
    expect(screen.getByTestId('face-scan-frame').getAttribute('data-phase')).toBe('contagem');
    expect(container.querySelector('path.fsf2-anel')).not.toBeNull();
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

  it('7. flash="success" — flash de sucesso renderiza', () => {
    const visual: FaceScanVisual = { ...baseVisual, flash: 'success' };
    render(<FaceScanFrame visual={visual} />);
    expect(screen.getByTestId('face-scan-flash').getAttribute('data-flash')).toBe('success');
  });

  it('8. flash=null — flash NÃO renderiza', () => {
    render(<FaceScanFrame visual={baseVisual} />);
    expect(screen.queryByTestId('face-scan-flash')).toBeNull();
  });

  // 30/09/2026 — na tela sem CPF o botão "Prefere digitar CPF e senha?" ficava EM CIMA do aviso.
  it('9. aviso a 28px do fundo por padrão (verificação e cadastro do rosto: como sempre)', () => {
    render(<FaceScanFrame visual={baseVisual} />);
    expect(screen.getByTestId('face-scan-label').style.bottom).toBe('28px');
  });

  it('10. labelBottom sobe o aviso (tela sem CPF, com o botão de CPF embaixo)', () => {
    render(<FaceScanFrame visual={baseVisual} labelBottom="calc(4rem + 12px)" />);
    // O navegador reescreve o calc na forma dele ("calc(12px + 4rem)"): compara com a mesma escrita.
    const referencia = document.createElement('div');
    referencia.style.bottom = 'calc(4rem + 12px)';
    expect(screen.getByTestId('face-scan-label').style.bottom).toBe(referencia.style.bottom);
  });

  it('11. letra do aviso em rem: 15px no celular (16px de base), cresce junto no tablet', () => {
    render(<FaceScanFrame visual={baseVisual} />);
    const aviso = screen.getByTestId('face-scan-label');
    expect(aviso.style.fontSize).toBe('0.9375rem');
    expect(aviso.style.padding).toBe('0.625rem 1.375rem');
  });
});

// 05/10/2026 (tarde) — foto do Victor no tablet: uma BOLINHA VERDE parada à direita do centro,
// enquanto procurava o rosto. Era a ponta redonda do ✓ "escondido" (tracejado 100/100): o Chrome
// do Android desenha a ponta de um traço de comprimento zero; o do computador não (por isso o E2E
// não viu). O ✓ só pode existir na tela na fase "confirmado".
describe('✓ de confirmado só aparece na hora certa', () => {
  beforeEach(() => cleanup());

  it('procurando / parado / contagem / falhou: o ✓ fica invisível (nada de bolinha verde)', () => {
    const casos: Array<[FaceScanVisual, number]> = [
      [{ color: 'blue', pulse: true, showScanLine: true, label: 'procurando' }, 0],
      [{ color: 'blue', label: 'parado' }, 0],
      [{ color: 'green', flash: 'success', label: 'contagem' }, 2],
      [{ color: 'red', shake: true, label: 'falhou' }, 0],
    ];
    for (const [visual, contagem] of casos) {
      const { container, unmount } = render(<FaceScanFrame visual={visual} countdown={contagem} />);
      const certo = container.querySelector('path.fsf2-certo') as SVGPathElement;
      expect(certo, visual.label).not.toBeNull();
      expect(getComputedStyle(certo).visibility, visual.label).toBe('hidden');
      unmount();
    }
  });

  it('confirmado (identidade confirmada / rosto cadastrado): o ✓ aparece', () => {
    const { container } = render(<FaceScanFrame visual={{ color: 'green', flash: 'success', label: 'ok' }} />);
    const certo = container.querySelector('path.fsf2-certo') as SVGPathElement;
    expect(getComputedStyle(certo).visibility).toBe('visible');
  });
});

// 05/10/2026 — a fase da moldura sai do mesmo `visual` + contagem que as 3 telas já mandam.
describe('faseDaMoldura (visual Malha neon)', () => {
  it('procurando rosto (varredura ligada) → procurando', () => {
    expect(faseDaMoldura({ color: 'blue', pulse: true, showScanLine: true, label: '' })).toBe('procurando');
  });
  it('identificando / analisando (pulso sem varredura) → analisando', () => {
    expect(faseDaMoldura({ color: 'blue', pulse: true, label: '' })).toBe('analisando');
    expect(faseDaMoldura({ color: 'green', pulse: true, label: '' })).toBe('analisando');
  });
  it('nome na tela com contagem (sem CPF: verde + flash + 2s; cadastro: 3-2-1) → contagem', () => {
    expect(faseDaMoldura({ color: 'green', flash: 'success', label: '' }, 2)).toBe('contagem');
    expect(faseDaMoldura({ color: 'green', pulse: true, label: '' }, 3)).toBe('contagem');
  });
  it('identidade confirmada / rosto cadastrado (flash de sucesso sem contagem) → confirmado', () => {
    expect(faseDaMoldura({ color: 'green', flash: 'success', label: '' })).toBe('confirmado');
  });
  it('não reconheci / muitas tentativas (vermelho, tremida ou flash de falha) → falhou', () => {
    expect(faseDaMoldura({ color: 'red', shake: true, label: '' })).toBe('falhou');
    expect(faseDaMoldura({ color: 'red', flash: 'fail', shake: true, label: '' })).toBe('falhou');
  });
  it('capturando / salvando / ponto completo (sem pulso nem flash) → parado', () => {
    expect(faseDaMoldura({ color: 'blue', label: '' })).toBe('parado');
    expect(faseDaMoldura({ color: 'green', label: '' })).toBe('parado');
  });
});
