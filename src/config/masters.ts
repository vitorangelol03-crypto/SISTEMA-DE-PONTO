// Fonte única de verdade sobre usuários "mestre".
//
// Contexto (2026-06-27): o sistema tinha o ID '9999' cravado em vários lugares como
// admin mestre (bypass de permissões no frontend + bypass de RLS no banco). Foi
// adicionado o mestre '2626' em paridade total com o 9999.
//
// 02/09/2026 (pedido do Victor): as travas EXCLUSIVAS que existiam aqui pra Ponto
// (editar/marcar/resetar), Pagamentos Driver e Aprovação de Cadastro — hardcoded pro
// 2626, ignorando `user_permissions` — foram REMOVIDAS. As 3 viraram permissões normais,
// configuráveis por usuário via PermissionsModal, do mesmo jeito que qualquer outro
// módulo. O `2626` continua sendo o líder único e fixo (bypass total, nunca configurável
// — ver `PONTO_EDITOR_ID`/`canEditPrivilegedUserPermissions` abaixo), mas isso não quer
// dizer mais "só ele acessa esses 3 módulos": agora ele só continua tendo tudo por
// padrão, igual sempre teve.
//
// Migration de segurança que acompanhou essa mudança
// (`20260902020000_remove_travas_exclusivas_ponto_driverpay_aprovacao.sql`): zerou
// `attendance.mark`/`edit`/`editHistory`/`manualTime`/`reset` pra TODOS os usuários
// não-privilegiados que tinham algum desses valores "true" adormecido no banco (irrelevante
// enquanto a trava existia, mas que virariam capacidade real de mexer em ponto assim que
// a trava caiu) — ninguém ganhou acesso de repente, o Victor concede explicitamente
// quem ele quiser depois.

/** IDs com poder de mestre (cross-empresa, bypass de permissões). Paridade com o RLS. */
export const MASTER_IDS: readonly string[] = ['9999', '2626'];

/** Único usuário com bypass total, fixo e não configurável — o líder do sistema. */
export const PONTO_EDITOR_ID = '2626';

/** True se o usuário é mestre (9999 ou 2626). */
export function isMaster(userId: string | null | undefined): boolean {
  return userId != null && MASTER_IDS.includes(userId);
}

/**
 * Usuários "chefe" configuráveis (02/09/2026, pedido do Victor): nascem com acesso
 * total mas são REALMENTE limitáveis via tela de Permissões — não têm mais bypass
 * incondicional como o 2626. O 2626 NÃO entra nesta lista: ele continua o líder único
 * e fixo (não configurável, nem por si mesmo). Espelha os triggers
 * enforce_users_permission_check / enforce_employees_permission_check /
 * enforce_user_permissions_permission_check no banco.
 */
export const CONFIGURABLE_PRIVILEGED_IDS: readonly string[] = ['9999', '8888'];

export function isConfigurablePrivileged(userId: string | null | undefined): boolean {
  return userId != null && CONFIGURABLE_PRIVILEGED_IDS.includes(userId);
}

/** Só o 2626 pode editar a configuração de permissões do 9999/8888 — nem eles mesmos. */
export function canEditPrivilegedUserPermissions(actingUserId: string | null | undefined): boolean {
  return actingUserId === PONTO_EDITOR_ID;
}
