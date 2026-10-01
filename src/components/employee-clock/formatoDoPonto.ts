/**
 * Como o ponto aparece pro funcionário — o MESMO formato na tela de ponto (/clock) e na consulta
 * fora da empresa (/erros). Saiu de dentro do EmployeeClockIn em 30/09/2026 (roadmap item 5).
 */

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '--:--:--';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatHours(h: number | null | undefined): string {
  if (h == null) return '-';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins.toString().padStart(2, '0')}min`;
}

export function formatDateBR(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
