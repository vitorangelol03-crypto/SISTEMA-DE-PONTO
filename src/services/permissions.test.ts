import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions';
import { UserPermissions, DEFAULT_ADMIN_PERMISSIONS } from '../types/permissions';

describe('permissions.ts - Sistema de Permissões', () => {
  describe('hasPermission', () => {
    it('deve retornar false quando userPermissions é null', () => {
      expect(hasPermission(null, 'attendance.view')).toBe(false);
    });

    it('deve retornar false para permissão inválida (sem ponto)', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;
      expect(hasPermission(permissions, 'invalid')).toBe(false);
    });

    it('deve retornar false para seção inexistente', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;
      expect(hasPermission(permissions, 'nonexistent.view')).toBe(false);
    });

    it('deve retornar true para permissões concedidas', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;
      expect(hasPermission(permissions, 'attendance.view')).toBe(true);
      expect(hasPermission(permissions, 'attendance.mark')).toBe(true);
      expect(hasPermission(permissions, 'employees.create')).toBe(true);
    });

    it('deve retornar false para permissões não concedidas', () => {
      const permissions: UserPermissions = {
        attendance: {
          view: true,
          mark: false,
          edit: false,
          search: false,
        },
        employees: {
          view: false,
          create: false,
          edit: false,
          delete: false,
          import: false,
        },
        financial: {
          view: false,
          viewPayments: false,
          editRate: false,
          editBonus: false,
          delete: false,
          clear: false,
          applyBonus: false,
        },
        reports: {
          view: false,
          generate: false,
          exportExcel: false,
          exportPDF: false,
        },
        errors: {
          view: false,
          create: false,
          edit: false,
          delete: false,
          viewStats: false,
        },
        c6payment: {
          view: false,
          generate: false,
          export: false,
        },
        settings: {
          view: false,
          editDailyRate: false,
          editOther: false,
        },
        users: {
          view: false,
          create: false,
          delete: false,
          managePermissions: false,
        },
        datamanagement: {
          view: false,
          viewStats: false,
          configRetention: false,
          manualCleanup: false,
          autoCleanup: false,
        },
      };

      expect(hasPermission(permissions, 'attendance.mark')).toBe(false);
      expect(hasPermission(permissions, 'employees.create')).toBe(false);
      expect(hasPermission(permissions, 'financial.viewPayments')).toBe(false);
    });

    it('deve verificar permissões específicas corretamente', () => {
      const permissions: UserPermissions = {
        ...DEFAULT_ADMIN_PERMISSIONS,
        attendance: {
          view: true,
          mark: true,
          edit: false,
          search: true,
        },
      };

      expect(hasPermission(permissions, 'attendance.view')).toBe(true);
      expect(hasPermission(permissions, 'attendance.mark')).toBe(true);
      expect(hasPermission(permissions, 'attendance.edit')).toBe(false);
      expect(hasPermission(permissions, 'attendance.search')).toBe(true);
    });

    it('deve validar todas as permissões de attendance', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;

      expect(hasPermission(permissions, 'attendance.view')).toBe(true);
      expect(hasPermission(permissions, 'attendance.mark')).toBe(true);
      expect(hasPermission(permissions, 'attendance.edit')).toBe(true);
      expect(hasPermission(permissions, 'attendance.search')).toBe(true);
    });

    it('deve validar todas as permissões de employees', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;

      expect(hasPermission(permissions, 'employees.view')).toBe(true);
      expect(hasPermission(permissions, 'employees.create')).toBe(true);
      expect(hasPermission(permissions, 'employees.edit')).toBe(true);
      expect(hasPermission(permissions, 'employees.delete')).toBe(true);
      expect(hasPermission(permissions, 'employees.import')).toBe(true);
    });

    it('deve validar todas as permissões de financial', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;

      expect(hasPermission(permissions, 'financial.view')).toBe(true);
      expect(hasPermission(permissions, 'financial.viewPayments')).toBe(true);
      expect(hasPermission(permissions, 'financial.editRate')).toBe(true);
      expect(hasPermission(permissions, 'financial.editBonus')).toBe(true);
      expect(hasPermission(permissions, 'financial.delete')).toBe(true);
      expect(hasPermission(permissions, 'financial.clear')).toBe(true);
      expect(hasPermission(permissions, 'financial.applyBonus')).toBe(true);
    });

    it('deve validar todas as permissões de users', () => {
      const permissions = DEFAULT_ADMIN_PERMISSIONS;

      expect(hasPermission(permissions, 'users.view')).toBe(true);
      expect(hasPermission(permissions, 'users.create')).toBe(true);
      expect(hasPermission(permissions, 'users.delete')).toBe(true);
      expect(hasPermission(permissions, 'users.managePermissions')).toBe(true);
    });
  });
});
