import { describe, it, expect } from 'vitest';
import { shouldShowAllAppliedBanner } from '../../src/utils/bankHoursUiHelpers';
import type { BankHoursPreviewItem } from '../../src/services/database';

// Helper: cria item mínimo do tipo BankHoursPreviewItem com status configurável.
// Sem cast 'as' — se o tipo mudar, tsc reclama imediatamente.
function item(status: BankHoursPreviewItem['status']): BankHoursPreviewItem {
  return {
    employeeId: 'emp-' + Math.random(),
    employeeName: 'Test Employee',
    status,
    saldoMinutes: 0,
    saldoLabel: '+00:00',
    valorAplicar: 0,
    liquidoAntes: 0,
    liquidoDepois: 0,
  };
}

describe('shouldShowAllAppliedBanner - Combo I FIX #3', () => {

  describe('Casos onde DEVE retornar true', () => {
    it('1. Todos items already_applied (1 item)', () => {
      const items = [item('already_applied')];
      expect(shouldShowAllAppliedBanner(items)).toBe(true);
    });

    it('2. Todos items already_applied (5 items)', () => {
      const items = Array.from({ length: 5 }, () => item('already_applied'));
      expect(shouldShowAllAppliedBanner(items)).toBe(true);
    });

    it('3. Todos items already_applied (30 items - cenário Caratinga real)', () => {
      const items = Array.from({ length: 30 }, () => item('already_applied'));
      expect(shouldShowAllAppliedBanner(items)).toBe(true);
    });
  });

  describe('Casos onde DEVE retornar false', () => {
    it('4. Lista vazia retorna false (não mostra banner)', () => {
      expect(shouldShowAllAppliedBanner([])).toBe(false);
    });

    it('5. Mix: 1 already_applied + 1 pending → false', () => {
      const items = [item('already_applied'), item('pending')];
      expect(shouldShowAllAppliedBanner(items)).toBe(false);
    });

    it('6. Mix: 4 already_applied + 1 no_payment → false', () => {
      const items = [
        item('already_applied'),
        item('already_applied'),
        item('already_applied'),
        item('already_applied'),
        item('no_payment'),
      ];
      expect(shouldShowAllAppliedBanner(items)).toBe(false);
    });

    it('7. Todos pending → false (caso normal de aplicação)', () => {
      const items = Array.from({ length: 5 }, () => item('pending'));
      expect(shouldShowAllAppliedBanner(items)).toBe(false);
    });

    it('8. Mix de outros statuses (zero_balance + override_skip + toggle_off) → false', () => {
      const items = [
        item('zero_balance'),
        item('override_skip'),
        item('toggle_off'),
      ];
      expect(shouldShowAllAppliedBanner(items)).toBe(false);
    });

    it('9. Apenas 1 item no_payment → false (não é already_applied)', () => {
      expect(shouldShowAllAppliedBanner([item('no_payment')])).toBe(false);
    });

    it('10. Apenas 1 item already_applied entre 30 outros → false', () => {
      const items = [
        item('already_applied'),
        ...Array.from({ length: 29 }, () => item('pending')),
      ];
      expect(shouldShowAllAppliedBanner(items)).toBe(false);
    });
  });
});
