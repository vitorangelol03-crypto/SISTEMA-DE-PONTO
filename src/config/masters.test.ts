import { describe, it, expect } from 'vitest';
import {
  isMaster,
  MASTER_IDS,
  PONTO_EDITOR_ID,
  CONFIGURABLE_PRIVILEGED_IDS,
  isConfigurablePrivileged,
  canEditPrivilegedUserPermissions,
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

  describe('PONTO_EDITOR_ID', () => {
    it('é 2626 — o único bypass incondicional e fixo', () => {
      expect(PONTO_EDITOR_ID).toBe('2626');
    });
  });

  // 02/09/2026 — Ponto, Pagamentos Driver e Aprovação de Cadastro deixaram de ser
  // exclusivos hardcoded (canEditPonto/isPontoEditPermission/isDriverpayPermission/
  // canAccessDriverpay/isEmployeeApprovalPermission/canAccessEmployeeApproval foram
  // removidos) — viraram permissão normal, checada via user_has_module_permission no
  // banco e checkPermission no frontend, como qualquer outro módulo.

  describe('CONFIGURABLE_PRIVILEGED_IDS / isConfigurablePrivileged', () => {
    it('contém exatamente 9999 e 8888 — 2626 NÃO entra (líder fixo, não configurável)', () => {
      expect([...CONFIGURABLE_PRIVILEGED_IDS].sort()).toEqual(['8888', '9999']);
    });

    it('reconhece 9999 e 8888 como configuráveis', () => {
      expect(isConfigurablePrivileged('9999')).toBe(true);
      expect(isConfigurablePrivileged('8888')).toBe(true);
    });

    it('2626 e supervisores comuns não são "configurável privilegiado"', () => {
      expect(isConfigurablePrivileged('2626')).toBe(false);
      expect(isConfigurablePrivileged('01')).toBe(false);
    });

    it('é seguro com null/undefined', () => {
      expect(isConfigurablePrivileged(null)).toBe(false);
      expect(isConfigurablePrivileged(undefined)).toBe(false);
    });
  });

  describe('canEditPrivilegedUserPermissions', () => {
    it('SOMENTE o 2626 pode editar a permissão do 9999/8888', () => {
      expect(canEditPrivilegedUserPermissions('2626')).toBe(true);
    });

    it('nem o 9999/8888 (mesmo sendo "chefe") editam a permissão um do outro', () => {
      expect(canEditPrivilegedUserPermissions('9999')).toBe(false);
      expect(canEditPrivilegedUserPermissions('8888')).toBe(false);
    });

    it('supervisores comuns não editam', () => {
      expect(canEditPrivilegedUserPermissions('01')).toBe(false);
    });

    it('é seguro com null/undefined', () => {
      expect(canEditPrivilegedUserPermissions(null)).toBe(false);
      expect(canEditPrivilegedUserPermissions(undefined)).toBe(false);
    });
  });
});
