-- Hotfix da Fase B (02/09/2026, achado na verificação pós-deploy, corrigido com OK
-- do Victor na hora). `user_has_module_permission` tratava "usuário sem linha em
-- user_permissions" como "sem NENHUMA permissão" — mas o frontend (mergePermissionsWithDefaults
-- em src/services/permissions.ts) SEMPRE tratou "sem linha" como
-- DEFAULT_SUPERVISOR_PERMISSIONS (que já vem com employees.create/edit/import=true).
--
-- Impacto real confirmado: os usuários '01' (supervisor real, sem linha própria desde
-- sempre) e '8888' (admin real, não-mestre, sem linha própria) ficaram bloqueados de
-- criar/editar/importar funcionário a partir do deploy da Fase B — algo que funcionava
-- antes. Corrige a raiz: replica o mesmo fallback do frontend, só pros módulos que os
-- triggers da Fase B checam hoje (employees, users). Se a Fase B crescer pros outros 9
-- módulos, esse fallback precisa crescer junto.
create or replace function public.user_has_module_permission(p_user_id text, p_module text, p_action text)
returns boolean
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_value boolean;
begin
  select (permissions -> p_module ->> p_action)::boolean
    into v_value
    from public.user_permissions
    where user_id = p_user_id;

  if not found then
    -- Sem linha: mesmo default que o frontend usa (DEFAULT_SUPERVISOR_PERMISSIONS
    -- em src/types/permissions.ts) — employees: view/create/edit/import=true,
    -- delete=false; users: tudo false.
    if p_module = 'employees' then
      return p_action in ('view', 'create', 'edit', 'import');
    end if;
    return false;
  end if;

  return coalesce(v_value, false);
end;
$function$;
