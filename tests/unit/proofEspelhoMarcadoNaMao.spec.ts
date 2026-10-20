/**
 * Espelho marcado NA MÃO por um humano = o app do entregador não pede o print de novo
 * (20/10/2026, decisão do Victor: "não pedir dela").
 *
 * 🔴 Caso real (fotos de 20/10): Luis Fernando com 0 pacote de Shopee e espelho conferido
 * na mão (2/2) no painel, e o app do líder ainda pedindo o print da Shopee ("Falta 1"). A
 * marcação manual tem que ser ponto final; a 'auto' NÃO, porque ali há print validado que
 * segue verde em "Já enviados".
 *
 * Roda com: npx vitest run proofEspelhoMarcadoNaMao
 */
import { describe, it, expect } from 'vitest';
import { espelhoMarcadoNaMao } from '../../supabase/functions/_shared/proofCards';

describe('espelhoMarcadoNaMao', () => {
  it('humano marcou (grava o próprio userId) → pula o cartão', () => {
    expect(espelhoMarcadoNaMao({ espelho_conferido: true, espelho_conferido_by: 'user-123' })).toBe(true);
  });

  it("marca automática ('auto') → NÃO pula (tem print validado, aparece verde)", () => {
    expect(espelhoMarcadoNaMao({ espelho_conferido: true, espelho_conferido_by: 'auto' })).toBe(false);
  });

  it('nunca foi marcado (by nulo) → NÃO pula', () => {
    expect(espelhoMarcadoNaMao({ espelho_conferido: false, espelho_conferido_by: null })).toBe(false);
  });

  it('desmarcado por humano (conferido=false, mesmo com by preenchido) → NÃO pula', () => {
    expect(espelhoMarcadoNaMao({ espelho_conferido: false, espelho_conferido_by: 'user-123' })).toBe(false);
  });

  it('conferido=true mas by nulo (estado antigo/inconsistente) → NÃO pula, por segurança', () => {
    expect(espelhoMarcadoNaMao({ espelho_conferido: true, espelho_conferido_by: null })).toBe(false);
  });
});
