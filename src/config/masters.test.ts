import { describe, it, expect } from 'vitest';
import {
  isMaster,
  canEditPonto,
  isPontoEditPermission,
  MASTER_IDS,
  PONTO_EDITOR_ID,
  PONTO_EDIT_PERMISSIONS,
} from './masters';

describe('masters config', () => {
  describe('isMaster', () => {
    it('reconhece 9999 e 2626 como mestres', () => {
      expect(isMaster('9999')).toBe(true);
      expect(isMaster('2626')).toBe(true);
    });

    it('não trata supervisores/admins comuns como mestre', () => {
      expect(isMaster('01')).toBe(false);
      expect(isMaster('8888')).toBe(false);
      expect(isMaster('7770')).toBe(false);
    });

    it('é seguro com null/undefined/vazio', () => {
      expect(isMaster(null)).toBe(false);
      expect(isMaster(undefined)).toBe(false);
      expect(isMaster('')).toBe(false);
    });

    it('MASTER_IDS contém exatamente 9999 e 2626', () => {
      expect([...MASTER_IDS].sort()).toEqual(['2626', '9999']);
    });
  });

  describe('canEditPonto', () => {
    it('SOMENTE o 2626 pode editar ponto', () => {
      expect(canEditPonto('2626')).toBe(true);
    });

    it('nem o 9999 (mestre) pode editar ponto', () => {
      expect(canEditPonto('9999')).toBe(false);
    });

    it('supervisores não podem editar ponto', () => {
      expect(canEditPonto('01')).toBe(false);
      expect(canEditPonto('8888')).toBe(false);
    });

    it('é seguro com null/undefined', () => {
      expect(canEditPonto(null)).toBe(false);
      expect(canEditPonto(undefined)).toBe(false);
    });

    it('PONTO_EDITOR_ID é 2626', () => {
      expect(PONTO_EDITOR_ID).toBe('2626');
    });
  });

  describe('isPontoEditPermission', () => {
    it('cobre editar saída, dias anteriores, horário manual e reset', () => {
      expect(isPontoEditPermission('attendance.edit')).toBe(true);
      expect(isPontoEditPermission('attendance.editHistory')).toBe(true);
      expect(isPontoEditPermission('attendance.manualTime')).toBe(true);
      expect(isPontoEditPermission('attendance.reset')).toBe(true);
    });

    // 2026-08-13: marcar presente/falta virou exclusivo do 2626 (incidente de 04/08 —
    // 3 presenças sem batida marcadas pelo 9999 e pagas como dia trabalhado).
    it('inclui marcar presença/falta (exclusivo do 2626 desde 13/08)', () => {
      expect(isPontoEditPermission('attendance.mark')).toBe(true);
    });

    it('NÃO inclui aprovar/ver (continuam liberados a supervisores)', () => {
      expect(isPontoEditPermission('attendance.approve')).toBe(false);
      expect(isPontoEditPermission('attendance.reject')).toBe(false);
      expect(isPontoEditPermission('attendance.bulkApprove')).toBe(false);
      expect(isPontoEditPermission('attendance.view')).toBe(false);
      expect(isPontoEditPermission('attendance.viewHistory')).toBe(false);
      expect(isPontoEditPermission('attendance.search')).toBe(false);
    });

    it('não confunde com permissões de outros módulos', () => {
      expect(isPontoEditPermission('employees.create')).toBe(false);
      expect(isPontoEditPermission('financial.editRate')).toBe(false);
    });

    it('PONTO_EDIT_PERMISSIONS tem as 5 chaves esperadas', () => {
      expect([...PONTO_EDIT_PERMISSIONS].sort()).toEqual([
        'attendance.edit',
        'attendance.editHistory',
        'attendance.manualTime',
        'attendance.mark',
        'attendance.reset',
      ]);
    });
  });
});
