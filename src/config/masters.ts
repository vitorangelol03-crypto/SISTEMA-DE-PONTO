// Fonte única de verdade sobre usuários "mestre" e quem pode editar ponto.
//
// Contexto (2026-06-27): o sistema tinha o ID '9999' cravado em vários lugares como
// admin mestre (bypass de permissões no frontend + bypass de RLS no banco). Foi
// adicionado o mestre '2626' em paridade total com o 9999. Além disso, a edição de
// ponto (data/horário) e o reset/exclusão de registros de ponto passaram a ser
// EXCLUSIVOS do '2626' — nem o 9999 nem supervisores podem mais.
//
// O reforço de verdade é server-side (RLS aceita 9999/2626; trigger em `attendance`
// só deixa 2626/backend mexer em horário/excluir). Estes helpers mantêm a UI
// coerente com o servidor (esconde botões que o backend recusaria).

/** IDs com poder de mestre (cross-empresa, bypass de permissões). Paridade com o RLS. */
export const MASTER_IDS: readonly string[] = ['9999', '2626'];

/** Único usuário autorizado a alterar data/horário de ponto e resetar registros. */
export const PONTO_EDITOR_ID = '2626';

/**
 * Permissões cuja concessão é EXCLUSIVA do PONTO_EDITOR_ID, independentemente de
 * role/bypass. Espelha o trigger `enforce_ponto_master_only` no banco.
 */
export const PONTO_EDIT_PERMISSIONS: readonly string[] = [
  'attendance.edit',        // editar horário de saída (inline)
  'attendance.editHistory', // editar registros de dias anteriores
  'attendance.manualTime',  // inserir horário manual (entrada/saída)
  'attendance.reset',       // resetar/excluir registros de ponto
];

/** True se o usuário é mestre (9999 ou 2626). */
export function isMaster(userId: string | null | undefined): boolean {
  return userId != null && MASTER_IDS.includes(userId);
}

/** True se o usuário pode editar/alterar ponto (somente 2626). */
export function canEditPonto(userId: string | null | undefined): boolean {
  return userId === PONTO_EDITOR_ID;
}

/** True se a permissão pertence ao conjunto exclusivo de edição de ponto. */
export function isPontoEditPermission(permission: string): boolean {
  return PONTO_EDIT_PERMISSIONS.includes(permission);
}
