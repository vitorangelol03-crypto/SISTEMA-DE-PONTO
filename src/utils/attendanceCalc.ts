/**
 * Helpers de cálculo de attendance — funções PURAS, sem efeitos.
 *
 * Convenções:
 *  - Timestamps são ISO strings (UTC). Comparação via Date.getTime() em ms.
 *  - TZ Brasil hardcoded em UTC-3 (sem DST — Brasil aboliu).
 *  - Janela diurna: 05:00–22:00 BRT. Janela noturna: 22:00–05:00 BRT.
 *  - Marcação faltante: o trecho dela é simplesmente ignorado (não retorna 0
 *    do total — apenas pula). Em 4 marcações com entry_2 ausente, o primeiro
 *    turno ainda conta.
 */

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

export interface AttendanceMarkings {
  entry_1: string | null;
  exit_1: string | null;
  entry_2: string | null;
  exit_2: string | null;
  marking_count: 2 | 4;
}

export type ExpectedSchedule = readonly [number, number, number, number, number, number, number];

export interface BankResult {
  credit: number;
  debit: number;
}

function diffMinutes(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

function getBRTHour(d: Date): number {
  const brt = new Date(d.getTime() + BRT_OFFSET_MS);
  return brt.getUTCHours();
}

function classifySegment(start: Date, end: Date): { daytime: number; nighttime: number } {
  let daytime = 0;
  let nighttime = 0;
  const cursor = new Date(start.getTime());
  const endMs = end.getTime();
  while (cursor.getTime() < endMs) {
    const hour = getBRTHour(cursor);
    if (hour >= 5 && hour < 22) daytime++;
    else nighttime++;
    cursor.setTime(cursor.getTime() + 60_000);
  }
  return { daytime, nighttime };
}

function getWorkSegments(m: AttendanceMarkings): Array<[string, string]> {
  const segs: Array<[string, string]> = [];
  if (m.marking_count === 2) {
    if (m.entry_1 && m.exit_2) segs.push([m.entry_1, m.exit_2]);
    return segs;
  }
  if (m.entry_1 && m.exit_1) segs.push([m.entry_1, m.exit_1]);
  if (m.entry_2 && m.exit_2) segs.push([m.entry_2, m.exit_2]);
  return segs;
}

export function computeWorkedMinutes(m: AttendanceMarkings): number {
  return getWorkSegments(m).reduce((acc, [s, e]) => acc + diffMinutes(s, e), 0);
}

export function computeIntervalMinutes(m: AttendanceMarkings): number {
  if (m.marking_count === 2) return 0;
  if (!m.exit_1 || !m.entry_2) return 0;
  return diffMinutes(m.exit_1, m.entry_2);
}

export function computeDaytimeMinutes(m: AttendanceMarkings): number {
  return getWorkSegments(m).reduce(
    (acc, [s, e]) => acc + classifySegment(new Date(s), new Date(e)).daytime,
    0,
  );
}

export function computeNighttimeMinutes(m: AttendanceMarkings): number {
  return getWorkSegments(m).reduce(
    (acc, [s, e]) => acc + classifySegment(new Date(s), new Date(e)).nighttime,
    0,
  );
}

export function getExpectedMinutesForDate(schedule: ExpectedSchedule | null, date: string): number {
  if (!schedule) return 0;
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n))) return 0;
  const [y, mo, d] = parts;
  // Ancorado às 12h BRT (15h UTC) — evita off-by-one em viradas
  const anchored = new Date(Date.UTC(y, mo - 1, d, 15, 0, 0));
  const dow = anchored.getUTCDay(); // 0=domingo, 6=sábado
  return schedule[dow] ?? 0;
}

export function computeBankHours(workedMin: number, expectedMin: number, isAbsent: boolean): BankResult {
  if (isAbsent) return { credit: 0, debit: 0 };
  const diff = workedMin - expectedMin;
  if (diff > 0) return { credit: diff, debit: 0 };
  if (diff < 0) return { credit: 0, debit: -diff };
  return { credit: 0, debit: 0 };
}
