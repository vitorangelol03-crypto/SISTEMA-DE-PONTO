/**
 * Como o histórico (Auditoria) mostra QUEM fez (07/10/2026, plano do tablet sem toque, entrega G):
 * o código do usuário, o nome dele e o funcionário vinculado — "03 — João (funcionário João da
 * Silva)". Cada parte só aparece se existir: hoje nenhum usuário do painel tem nome cadastrado, e o
 * vínculo com o funcionário é o da entrega C (tela de Permissões).
 */
export interface UsuarioDoHistorico {
  id: string;
  name: string | null;
  employee_id: string | null;
}

export function rotuloDoUsuario(
  userId: string | null | undefined,
  usuarios: UsuarioDoHistorico[],
  nomesDosFuncionarios: Record<string, string>,
): string {
  if (!userId) return 'Desconhecido';
  const usuario = usuarios.find((u) => u.id === userId);
  // Fora da lista carregada: o código que a linha do histórico tem ainda diz quem foi.
  if (!usuario) return userId;
  const nome = usuario.name?.trim();
  const funcionario = usuario.employee_id ? nomesDosFuncionarios[usuario.employee_id] : undefined;
  return `${usuario.id}${nome ? ` — ${nome}` : ''}${funcionario ? ` (funcionário ${funcionario})` : ''}`;
}
