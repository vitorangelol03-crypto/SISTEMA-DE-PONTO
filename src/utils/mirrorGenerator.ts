/**
 * Sub-fase 2.13: gerador de dados do espelho de ponto.
 *
 * Funções puras (sem efeitos, sem DOM, sem jsPDF). Toda a lógica de formatação
 * e montagem dos dados que vão pro PDF mora aqui — fica testável isoladamente.
 *
 * Convenções:
 *  - Horários no banco são ISO UTC; o display é em BRT (UTC-3, sem DST).
 *  - marking_flag se aplica a TODAS as marcações da linha que tiverem valor
 *    (ex: dia inteiro foi "included" → todos os horários ganham "*").
 *  - Domingo: tudo vazio exceto Previstas = "00:00".
 *  - Dia sem attendance: linha com expected do schedule, restante vazio.
 */

import type { Attendance, Employee, Company } from '../services/database';
import { getExpectedMinutesForDate, type ExpectedSchedule } from './attendanceCalc';

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
const FALLBACK_SCHEDULE: ExpectedSchedule = [0, 480, 480, 480, 480, 480, 240];

export type MarkingFlag = 'normal' | 'included' | 'requested' | 'pre_assigned' | null | undefined;

export interface MirrorTimeCell {
  display: string;
  flag: MarkingFlag;
}

export interface MirrorDayRow {
  date: string;
  label: string;
  isSunday: boolean;
  isAbsentCompensated: boolean;
  ent1: MirrorTimeCell;
  sai1: MirrorTimeCell;
  ent2: MirrorTimeCell;
  sai2: MirrorTimeCell;
  expected: number;
  daytime: number;
  nighttime: number;
  interval: number;
  bankCredit: number;
  bankDebit: number;
}

export interface MirrorTotals {
  expected: number;
  daytime: number;
  nighttime: number;
  interval: number;
  bankCredit: number;
  bankDebit: number;
  bankNet: number;
}

export interface MirrorData {
  company: { legal_name: string; cnpj: string; logo_url: string | null; display_name: string };
  employee: {
    name: string;
    cpf: string;
    pis: string;
    badge_number: string;
    function_role: string;
    schedule_type: string;
  };
  period: { start: string; end: string; emissionDate: string };
  scheduleSummary: string;
  rows: MirrorDayRow[];
  totals: MirrorTotals;
}

const WEEKDAY_PT_3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const WEEKDAY_PT_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export function minutesToHHMM(min: number): string {
  if (!Number.isFinite(min) || min === 0) return '';
  const sign = min < 0 ? '-' : '';
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function minutesToHHMMAlways(min: number): string {
  if (!Number.isFinite(min)) return '00:00';
  const sign = min < 0 ? '-' : '';
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return '';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return '';
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatDateBR(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-');
  if (!y || !m || !d) return yyyyMmDd;
  return `${d}/${m}/${y}`;
}

export function formatDateBRShort(yyyyMmDd: string): string {
  const [, m, d] = yyyyMmDd.split('-');
  if (!m || !d) return yyyyMmDd;
  return `${d}/${m}`;
}

function dayOfWeekFromDate(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return 0;
  // Ancorado 12h BRT (15h UTC) — evita off-by-one em viradas de DST/timezone.
  const anchored = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return anchored.getUTCDay();
}

export function weekdayPt3(yyyyMmDd: string): string {
  return WEEKDAY_PT_3[dayOfWeekFromDate(yyyyMmDd)];
}

export function formatTimeBRT(iso: string | null | undefined): string {
  if (!iso) return '';
  const utc = new Date(iso);
  if (Number.isNaN(utc.getTime())) return '';
  const brt = new Date(utc.getTime() + BRT_OFFSET_MS);
  const hh = brt.getUTCHours().toString().padStart(2, '0');
  const mm = brt.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Lista todas as datas entre start e end (inclusive), no formato YYYY-MM-DD. */
export function listDatesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  if (!ys || !ms || !ds || !ye || !me || !de) return out;
  // Trabalha em UTC anchorado 12h pra evitar drift.
  const cursor = new Date(Date.UTC(ys, ms - 1, ds, 12, 0, 0));
  const last = new Date(Date.UTC(ye, me - 1, de, 12, 0, 0));
  while (cursor.getTime() <= last.getTime()) {
    const y = cursor.getUTCFullYear();
    const m = (cursor.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = cursor.getUTCDate().toString().padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Gera resumo técnico do schedule (números em minutos por dia da semana).
 * Agrupa dias consecutivos com mesma quantidade. Inclui dias com 0min como "folga".
 * Ex: [0, 480, 480, 480, 480, 480, 240] → "Seg-Sex: 8h diárias / Sáb: 4h / Dom: folga"
 *
 * Quando os horários de início/fim das janelas de trabalho forem adicionados ao
 * schema (ex: 03:30-05:00, 06:00-11:50), substituir por algo como
 * "Seg-Sex: 03:30-05:00, 06:00-11:50".
 */
export function buildScheduleSummary(schedule: ExpectedSchedule | null | undefined): string {
  if (!schedule || schedule.length !== 7) return '';
  type Group = { fromIdx: number; toIdx: number; mins: number };
  // Iter Seg→Sáb→Dom (calendar-adjacent), agrupa dias consecutivos com mesmo mins.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const idx of order) {
    const mins = schedule[idx] ?? 0;
    if (current && current.mins === mins && isAdjacent(current.toIdx, idx)) {
      current.toIdx = idx;
    } else {
      if (current) groups.push(current);
      current = { fromIdx: idx, toIdx: idx, mins };
    }
  }
  if (current) groups.push(current);

  return groups
    .map((g) => {
      const range =
        g.fromIdx === g.toIdx
          ? WEEKDAY_PT_SHORT[g.fromIdx]
          : `${WEEKDAY_PT_SHORT[g.fromIdx]}-${WEEKDAY_PT_SHORT[g.toIdx]}`;
      if (g.mins === 0) return `${range}: folga`;
      const h = Math.floor(g.mins / 60);
      const m = g.mins % 60;
      const dur = m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
      // String curta sem sufixo "diárias" — evita quebrar palavra na col estreita do PDF.
      return `${range}: ${dur}`;
    })
    .join(' / ');
}

function isAdjacent(a: number, b: number): boolean {
  // Considera segunda(1)→sexta(5) consecutivos. Sábado(6) e domingo(0) também.
  if (a === 6 && b === 0) return true;
  return b === a + 1;
}

function normalizeSchedule(raw: number[] | null | undefined): ExpectedSchedule {
  if (
    Array.isArray(raw) &&
    raw.length === 7 &&
    raw.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return raw as unknown as ExpectedSchedule;
  }
  return FALLBACK_SCHEDULE;
}

/** Resolve o flag (mostra apenas se !== 'normal' e !== null/undefined). */
function effectiveFlag(flag: MarkingFlag): MarkingFlag {
  if (flag == null) return null;
  if (flag === 'normal') return null;
  return flag;
}

function mkEmptyCell(): MirrorTimeCell {
  return { display: '', flag: null };
}

function mkAusCompCell(flag: MarkingFlag): MirrorTimeCell {
  return { display: 'Aus. Comp.', flag: effectiveFlag(flag) };
}

function mkTimeCell(iso: string | null | undefined, flag: MarkingFlag): MirrorTimeCell {
  const t = formatTimeBRT(iso);
  return { display: t, flag: t ? effectiveFlag(flag) : null };
}

interface BuildMirrorDataInput {
  employee: Employee;
  company: Company;
  period: { start: string; end: string };
  attendances: Attendance[];
  emissionDate?: string;
}

export function buildMirrorData(input: BuildMirrorDataInput): MirrorData {
  const { employee, company, period, attendances } = input;

  const schedule = normalizeSchedule(employee.expected_schedule ?? company.default_schedule);

  // Index de attendance por data, pra lookup rápido.
  const attByDate = new Map<string, Attendance>();
  for (const a of attendances) {
    if (a.date) attByDate.set(a.date, a);
  }

  const dates = listDatesInRange(period.start, period.end);
  const rows: MirrorDayRow[] = dates.map((date) => {
    const dow = dayOfWeekFromDate(date);
    const isSunday = dow === 0;
    const att = attByDate.get(date);
    const expectedFromSchedule = getExpectedMinutesForDate(schedule, date);
    const label = `${formatDateBRShort(date)} ${weekdayPt3(date)}`;

    if (!att) {
      return {
        date,
        label,
        isSunday,
        isAbsentCompensated: false,
        ent1: mkEmptyCell(),
        sai1: mkEmptyCell(),
        ent2: mkEmptyCell(),
        sai2: mkEmptyCell(),
        expected: expectedFromSchedule,
        daytime: 0,
        nighttime: 0,
        interval: 0,
        bankCredit: 0,
        bankDebit: 0,
      };
    }

    const flag: MarkingFlag = att.marking_flag ?? null;
    const isAusComp = !!att.is_absent_compensated;

    // Aus. Comp. → 4 colunas mostram "Aus. Comp." (q3 confirmada por Victor).
    const ent1 = isAusComp ? mkAusCompCell(flag) : mkTimeCell(att.entry_1_time ?? att.entry_time, flag);
    const sai1 = isAusComp ? mkAusCompCell(flag) : mkTimeCell(att.exit_1_time, flag);
    const ent2 = isAusComp ? mkAusCompCell(flag) : mkTimeCell(att.entry_2_time, flag);
    const sai2 = isAusComp ? mkAusCompCell(flag) : mkTimeCell(att.exit_2_time ?? att.exit_time_full, flag);

    return {
      date,
      label,
      isSunday,
      isAbsentCompensated: isAusComp,
      ent1,
      sai1,
      ent2,
      sai2,
      expected: att.expected_minutes ?? expectedFromSchedule,
      daytime: att.daytime_minutes ?? 0,
      nighttime: att.nighttime_minutes ?? 0,
      interval: att.interval_minutes ?? 0,
      bankCredit: att.bank_credit_minutes ?? 0,
      bankDebit: att.bank_debit_minutes ?? 0,
    };
  });

  // Totais — soma simples, exceto para domingo onde Previstas é 0 (já está).
  const totals: MirrorTotals = rows.reduce(
    (acc, r) => ({
      expected: acc.expected + r.expected,
      daytime: acc.daytime + r.daytime,
      nighttime: acc.nighttime + r.nighttime,
      interval: acc.interval + r.interval,
      bankCredit: acc.bankCredit + r.bankCredit,
      bankDebit: acc.bankDebit + r.bankDebit,
      bankNet: 0,
    }),
    { expected: 0, daytime: 0, nighttime: 0, interval: 0, bankCredit: 0, bankDebit: 0, bankNet: 0 },
  );
  totals.bankNet = totals.bankCredit - totals.bankDebit;

  const today = input.emissionDate ?? todayBR();

  return {
    company: {
      legal_name: company.legal_name,
      cnpj: company.cnpj,
      logo_url: company.logo_url ?? null,
      display_name: company.display_name,
    },
    employee: {
      name: employee.name,
      cpf: employee.cpf ?? '',
      pis: employee.pis ?? '',
      badge_number: employee.badge_number ?? '',
      function_role: employee.function_role ?? company.default_function_role ?? '',
      schedule_type: employee.schedule_type ?? 'Normal',
    },
    period: { start: period.start, end: period.end, emissionDate: today },
    scheduleSummary: buildScheduleSummary(schedule),
    rows,
    totals,
  };
}

function todayBR(): string {
  const now = new Date();
  const brt = new Date(now.getTime() + BRT_OFFSET_MS);
  const y = brt.getUTCFullYear();
  const m = (brt.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = brt.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}
