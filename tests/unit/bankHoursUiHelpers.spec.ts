import { describe, it, expect } from 'vitest';
import {
  shouldShowAllAppliedBanner,
  selectAllPendingState,
  toggleAllPending,
} from '../../src/utils/bankHoursUiHelpers';
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

describe('selectAllPendingState - Combo I FIX #2', () => {
  it('1. Lista vazia: hasPending=false, checked=false, indeterminate=false', () => {
    const result = selectAllPendingState([], {});
    expect(result).toEqual({ checked: false, indeterminate: false, hasPending: false });
  });

  it('2. Sem nenhum pending (todos already_applied): hasPending=false', () => {
    const items = Array.from({ length: 5 }, () => item('already_applied'));
    const result = selectAllPendingState(items, {});
    expect(result.hasPending).toBe(false);
  });

  it('3. 3 pending NENHUM marcado: checked=false, indeterminate=false', () => {
    const items = [item('pending'), item('pending'), item('pending')];
    const result = selectAllPendingState(items, {});
    expect(result).toEqual({ checked: false, indeterminate: false, hasPending: true });
  });

  it('4. 3 pending TODOS marcados: checked=true, indeterminate=false', () => {
    const i1 = item('pending'), i2 = item('pending'), i3 = item('pending');
    const flags = {
      [i1.employeeId]: true,
      [i2.employeeId]: true,
      [i3.employeeId]: true,
    };
    const result = selectAllPendingState([i1, i2, i3], flags);
    expect(result).toEqual({ checked: true, indeterminate: false, hasPending: true });
  });

  it('5. 3 pending PARCIAL (1 marcado): checked=false, indeterminate=true', () => {
    const i1 = item('pending'), i2 = item('pending'), i3 = item('pending');
    const flags = { [i1.employeeId]: true };
    const result = selectAllPendingState([i1, i2, i3], flags);
    expect(result).toEqual({ checked: false, indeterminate: true, hasPending: true });
  });

  it('6. Mix de pending + already_applied (only pending counts)', () => {
    const i1 = item('pending'), i2 = item('pending');
    const i3 = item('already_applied');
    const flags = {
      [i1.employeeId]: true,
      [i2.employeeId]: true,
      [i3.employeeId]: true,
    };
    const result = selectAllPendingState([i1, i2, i3], flags);
    expect(result.checked).toBe(true);
    expect(result.indeterminate).toBe(false);
    expect(result.hasPending).toBe(true);
  });
});

describe('toggleAllPending - Combo I FIX #2', () => {
  it('7. checked=true marca TODOS os pending', () => {
    const i1 = item('pending'), i2 = item('pending'), i3 = item('already_applied');
    const result = toggleAllPending([i1, i2, i3], {}, true);
    expect(result[i1.employeeId]).toBe(true);
    expect(result[i2.employeeId]).toBe(true);
    expect(result[i3.employeeId]).toBeUndefined();
  });

  it('8. checked=false desmarca TODOS os pending', () => {
    const i1 = item('pending'), i2 = item('pending');
    const flags = { [i1.employeeId]: true, [i2.employeeId]: true };
    const result = toggleAllPending([i1, i2], flags, false);
    expect(result[i1.employeeId]).toBe(false);
    expect(result[i2.employeeId]).toBe(false);
  });

  it('9. Não toca em items não-pending (already_applied, no_payment, etc)', () => {
    const i1 = item('pending'), i2 = item('already_applied'), i3 = item('no_payment');
    const flags = { [i2.employeeId]: false, [i3.employeeId]: false };
    const result = toggleAllPending([i1, i2, i3], flags, true);
    expect(result[i1.employeeId]).toBe(true);
    expect(result[i2.employeeId]).toBe(false);
    expect(result[i3.employeeId]).toBe(false);
  });

  it('10. Lista vazia retorna flags vazios sem erro', () => {
    const result = toggleAllPending([], {}, true);
    expect(result).toEqual({});
  });
});
