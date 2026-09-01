import { describe, it, expect } from 'vitest';
import { resolveMarkingCount } from '../../src/components/attendance/attendanceTabHelpers';

/**
 * Roadmap item 2 (01/09/2026, preparação pra ligar 4 marcações pra todo mundo,
 * pedido do Victor: "já deixe tudo pronto... na hora que eu quiser eu ativo e
 * funciona tudo perfeitamente").
 *
 * Achado na auditoria: a aba Ponto (AttendanceTab) decidia mostrar os 4 campos
 * de hora (Ent.1/Saí.1/Ent.2/Saí.2) checando só `employee.marking_count === 4`
 * — SEM herdar o default da empresa como EmployeeClockIn.tsx e
 * recalcAttendance já faziam. Invisível com os 3 pilotos (todos com
 * marking_count FIXO em 4 no cadastro), mas quebraria pra quase todo mundo no
 * dia em que a empresa ligasse 4 marcações de verdade: a esmagadora maioria
 * herda (marking_count=null) — a tela continuaria mostrando o campo antigo de
 * Entrada/Saída, mesmo com entry_1/exit_1/entry_2/exit_2 sendo gravados
 * certinho no banco pela batida real.
 */
describe('resolveMarkingCount (AttendanceTab)', () => {
  it('funcionário com valor fixo 4 → 4, não importa o default da empresa', () => {
    expect(resolveMarkingCount(4, 2)).toBe(4);
  });

  it('funcionário com valor fixo 2 → 2, mesmo com empresa em 4', () => {
    expect(resolveMarkingCount(2, 4)).toBe(2);
  });

  it('funcionário sem valor (null) → herda o default da empresa (4)', () => {
    expect(resolveMarkingCount(null, 4)).toBe(4);
  });

  it('funcionário sem valor (undefined) → herda o default da empresa (4)', () => {
    expect(resolveMarkingCount(undefined, 4)).toBe(4);
  });

  it('funcionário sem valor + empresa em 2 → 2', () => {
    expect(resolveMarkingCount(null, 2)).toBe(2);
  });

  it('funcionário sem valor + empresa sem default carregado ainda → cai em 2 (nunca quebra)', () => {
    expect(resolveMarkingCount(null, undefined)).toBe(2);
    expect(resolveMarkingCount(undefined, undefined)).toBe(2);
  });
});
