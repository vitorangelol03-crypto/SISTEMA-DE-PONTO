-- Fase B do rework de Usuários/Permissões (01/09/2026, pedido do Victor: "realmente
-- bloqueia quando tira a visão" / "controle real"). Prova de conceito por só 2 módulos
-- (Usuários + Funcionários) antes de expandir pros outros 9 — decisão dele.
--
-- Causa raiz que esta migration fecha: TODAS as RLS policies (`rls_company_match_modify`)
-- só checam `company_id`/bypass de mestre — nunca `user_permissions`. Qualquer usuário
-- autenticado da MESMA empresa pode, via chamada direta (bypassando a UI/edge fn),
-- criar/editar/excluir funcionário ou usuário mesmo sem a permissão granular
-- correspondente. `validatePermission` no frontend é só aviso de UX, não barreira real.
--
-- Padrão: mesmo template já provado em produção pelo trigger `enforce_ponto_master_only`
-- (bypass de service_role/postgres/supabase_admin pros edge fns, leitura do JWT real via
-- request.jwt.claims, RAISE EXCEPTION quando falta permissão). Escopo desta migration:
-- só MUTAÇÃO (INSERT/UPDATE/DELETE) — leitura (SELECT) continua exatamente como está,
-- decisão separada e mais arriscada (afeta relatórios/joins que hoje dependem de leitura
-- ampla), fica pra depois de decidir com o Victor.
--
-- Tabelas cobertas: users, user_permissions (módulo Usuários) e employees (módulo
-- Funcionários). Mapeamento ação→permissão verificado contra os call sites reais em
-- src/services/database.ts (createEmployee/updateEmployee/deleteEmployee/
-- bulkCreateEmployees/updateEmployeeRegistrationStatus/resetEmployeePin/
-- setFaceRecognitionForEmployee/resetFaceForEmployee) pra não quebrar nenhum fluxo hoje
-- funcionando — ver checkpoint da sessão pros detalhes de cada decisão.

-- ── Helper reutilizável (Fase B vai crescer pros outros 9 módulos depois) ────────────
create or replace function public.user_has_module_permission(p_user_id text, p_module text, p_action text)
returns boolean
language sql
stable
set search_path to ''
as $$
  select coalesce(
    (select (permissions -> p_module ->> p_action)::boolean
     from public.user_permissions
     where user_id = p_user_id),
    false
  );
$$;

comment on function public.user_has_module_permission(text, text, text) is
  'Lê user_permissions.permissions->module->action pro usuário dado. false se não achar linha ou a chave não existir (default-deny). Usado pelos triggers de enforcement da Fase B.';

-- ── users: create/update/delete real no servidor ─────────────────────────────────────
-- Todo mutation legítimo de `users` hoje já passa pela edge fn create-user (service_role
-- via callerHasUsersPermission) — o INSERT/UPDATE/DELETE direto do client não existe mais
-- desde a Fase A (deleteUser também passou a chamar a edge fn). Este trigger é a segunda
-- camada: fecha a brecha de alguém pular a edge fn e mexer direto via REST com o próprio
-- JWT (hoje só RLS de company_id barraria, o que deixaria passar qualquer supervisor da
-- mesma empresa).
create or replace function public.enforce_users_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sub text;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  if v_sub = any (array['9999', '2626']) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if not public.user_has_module_permission(v_sub, 'users', 'delete') then
      raise exception 'Você não tem permissão para excluir usuários (users.delete)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.user_has_module_permission(v_sub, 'users', 'create') then
      raise exception 'Você não tem permissão para criar usuários (users.create)';
    end if;
    return new;
  end if;

  -- UPDATE: cobre nome/telefone (users.edit) e redefinição de senha própria/de
  -- outros (ambas já passam por service_role via edge fn — aqui é só o fallback
  -- de segurança caso alguém tente pular a edge fn).
  if not public.user_has_module_permission(v_sub, 'users', 'edit') then
    raise exception 'Você não tem permissão para editar usuários (users.edit)';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_users_permission_check on public.users;
create trigger trg_enforce_users_permission_check
  before insert or update or delete on public.users
  for each row execute function public.enforce_users_permission_check();

-- ── user_permissions: só quem tem users.managePermissions mexe nisso ─────────────────
-- Achado real (01/09/2026): saveUserPermissions em src/services/permissions.ts faz
-- UPDATE/INSERT DIRETO na tabela, sem NENHUM check de permissão no código (nem o aviso
-- de UX que as outras funções têm) — só a UI escondia o botão. Qualquer usuário
-- autenticado da mesma empresa podia, via REST direto, dar managePermissions=true (ou
-- qualquer outra permissão) pra si mesmo. Esse é o buraco mais sério que a Fase B fecha.
create or replace function public.enforce_user_permissions_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sub text;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  if v_sub = any (array['9999', '2626']) then
    return coalesce(new, old);
  end if;

  if not public.user_has_module_permission(v_sub, 'users', 'managePermissions') then
    raise exception 'Você não tem permissão para gerenciar permissões de usuários (users.managePermissions)';
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_enforce_user_permissions_permission_check on public.user_permissions;
create trigger trg_enforce_user_permissions_permission_check
  before insert or update or delete on public.user_permissions
  for each row execute function public.enforce_user_permissions_permission_check();

-- ── employees: create/edit/delete real no servidor ───────────────────────────────────
-- Cadastro público (/cadastro, employee-public-api) e todos os set/reset de PIN e face
-- que já passam por edge fn (service_role) continuam liberados — bypass na regra 1.
-- Mapeamento verificado contra database.ts:
--   INSERT          -> employees.create OU employees.import (createEmployee/bulkCreateEmployees)
--   DELETE          -> employees.delete
--   UPDATE (campos de registration_status/notes/reviewed_*) -> EXCLUSIVO do 2626, mesmo
--     critério de canAccessEmployeeApproval em masters.ts (aprovação de cadastro não usa
--     user_permissions — é regra fixa, nem o 9999 entra)
--   UPDATE (qualquer outro campo)                            -> employees.edit
--     Cobre updateEmployee (nome/CPF/PIX/endereço) E também resetEmployeePin/
--     setFaceRecognitionForEmployee/resetFaceForEmployee — as 3 não tinham NENHUM check
--     de permissão até agora (só RLS de company_id). employees.edit já vem true por
--     padrão pra supervisor (DEFAULT_SUPERVISOR_PERMISSIONS), risco baixo de quebrar
--     alguém que hoje usa essas telas.
create or replace function public.enforce_employees_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sub text;
  v_registration_changed boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';

  if tg_op = 'DELETE' then
    if v_sub = any (array['9999', '2626']) then
      return old;
    end if;
    if not public.user_has_module_permission(v_sub, 'employees', 'delete') then
      raise exception 'Você não tem permissão para excluir funcionários (employees.delete)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_sub = any (array['9999', '2626']) then
      return new;
    end if;
    if not (public.user_has_module_permission(v_sub, 'employees', 'create')
            or public.user_has_module_permission(v_sub, 'employees', 'import')) then
      raise exception 'Você não tem permissão para cadastrar funcionários (employees.create)';
    end if;
    return new;
  end if;

  -- UPDATE
  v_registration_changed := new.registration_status is distinct from old.registration_status
                          or new.registration_notes is distinct from old.registration_notes
                          or new.registration_reviewed_by is distinct from old.registration_reviewed_by
                          or new.registration_reviewed_at is distinct from old.registration_reviewed_at;

  if v_registration_changed then
    -- Aprovação de cadastro: EXCLUSIVO do 2626 (nem o 9999) — mesmo critério de
    -- canAccessEmployeeApproval em masters.ts, não passa por user_permissions.
    if v_sub <> '2626' then
      raise exception 'Apenas o usuário mestre (2626) pode aprovar/recusar cadastro de funcionário';
    end if;
    return new;
  end if;

  if v_sub = any (array['9999', '2626']) then
    return new;
  end if;
  if not public.user_has_module_permission(v_sub, 'employees', 'edit') then
    raise exception 'Você não tem permissão para editar funcionários (employees.edit)';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_employees_permission_check on public.employees;
create trigger trg_enforce_employees_permission_check
  before insert or update or delete on public.employees
  for each row execute function public.enforce_employees_permission_check();
