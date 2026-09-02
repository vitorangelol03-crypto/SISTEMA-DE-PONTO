-- Pedido do Victor (02/09/2026): "9999, 8888 e 2626 viram usuários normais do sistema,
-- com full acesso, mas os dois primeiros podem ser limitados igual qualquer outro
-- usuário". Decisões finais (confirmadas em conversa):
--   - 2626 continua o líder ÚNICO e FIXO — tudo que já é exclusivo dele hoje (editar
--     ponto, Pagamentos Driver, Aprovação de Cadastro) continua exclusivo, sem mudança
--     nenhuma nesta migration.
--   - 9999 e 8888 nascem com acesso total (menos os 3 itens exclusivos do 2626 acima,
--     que continuam travados pra eles também) mas agora são REALMENTE limitáveis via
--     tela de Permissões — antes tinham bypass incondicional.
--   - Só o 2626 pode editar a configuração de permissões do 9999 e do 8888 (nem o
--     próprio 9999 edita a si mesmo).
--   - Empresa que cada um enxerga NÃO muda nesta migration: 9999/2626 continuam vendo
--     as duas (bypass de company_id já existente nas ~60 RLS policies, INTOCADO aqui)
--     e o 8888 já está com company_id = Ponte Nova (conferido antes de escrever esta
--     migration) — nunca teve bypass de company_id, então já só vê a própria empresa.
--
-- Escopo desta migration: só os 3 triggers da Fase B (employees/users/user_permissions)
-- + os dados de permissão do 9999/8888. RLS (company_id) e o trigger de ponto
-- (enforce_ponto_master_only) ficam intocados de propósito.

-- ── 1) Seed de permissão total pro 9999 e 8888 (UPSERT — 9999 já tinha uma linha
--    antiga/incompleta, faltavam chaves criadas depois; 8888 nunca teve linha) ──────
insert into public.user_permissions (user_id, company_id, permissions, updated_by)
values
  ('9999', '6583bb2a-e334-41a7-b69c-7d98f3b46dfc', '{
    "attendance": {"view": true, "mark": true, "edit": true, "search": true, "reset": true, "viewHistory": true, "editHistory": true, "approve": true, "reject": true, "bulkApprove": true, "manualTime": true, "generateMassMirror": true},
    "employees": {"view": true, "create": true, "edit": true, "delete": true, "import": true},
    "reports": {"view": true, "generate": true, "exportExcel": true, "exportPDF": true},
    "financial": {"view": true, "viewPayments": true, "editRate": true, "editBonus": true, "delete": true, "clear": true, "applyBonus": true, "applyBonusB": true, "applyBonusC1": true, "applyBonusC2": true, "removeBonus": true, "removeBonusByType": true, "removeBonusBulk": true, "applyDiscount": true, "viewHistory": true},
    "c6payment": {"view": true, "generate": true, "export": true, "import": true, "edit": true, "bulkEdit": true, "delete": true},
    "driverpay": {"view": true, "createDriver": true, "editDriver": true, "deleteDriver": true, "configRate": true, "manageDiscount": true, "manageVale": true, "manageGroups": true, "managePlatforms": true, "generateMirror": true, "managePeriods": true, "complete": true, "viewHistory": true, "exportReport": true},
    "errors": {"view": true, "create": true, "createByValue": true, "edit": true, "delete": true, "viewStats": true, "viewTriage": true, "createTriage": true, "distributeTriage": true},
    "settings": {"view": true, "editDailyRate": true, "editOther": true},
    "users": {"view": true, "create": true, "edit": true, "delete": true, "resetPassword": true, "managePermissions": true},
    "datamanagement": {"view": true, "viewStats": true, "configRetention": true, "manualCleanup": true, "autoCleanup": true},
    "employeeapproval": {"view": true, "approve": true, "reject": true}
  }'::jsonb, '2626'),
  ('8888', '2b2abc4b-084c-4cf0-b5f1-02792513241d', '{
    "attendance": {"view": true, "mark": true, "edit": true, "search": true, "reset": true, "viewHistory": true, "editHistory": true, "approve": true, "reject": true, "bulkApprove": true, "manualTime": true, "generateMassMirror": true},
    "employees": {"view": true, "create": true, "edit": true, "delete": true, "import": true},
    "reports": {"view": true, "generate": true, "exportExcel": true, "exportPDF": true},
    "financial": {"view": true, "viewPayments": true, "editRate": true, "editBonus": true, "delete": true, "clear": true, "applyBonus": true, "applyBonusB": true, "applyBonusC1": true, "applyBonusC2": true, "removeBonus": true, "removeBonusByType": true, "removeBonusBulk": true, "applyDiscount": true, "viewHistory": true},
    "c6payment": {"view": true, "generate": true, "export": true, "import": true, "edit": true, "bulkEdit": true, "delete": true},
    "driverpay": {"view": true, "createDriver": true, "editDriver": true, "deleteDriver": true, "configRate": true, "manageDiscount": true, "manageVale": true, "manageGroups": true, "managePlatforms": true, "generateMirror": true, "managePeriods": true, "complete": true, "viewHistory": true, "exportReport": true},
    "errors": {"view": true, "create": true, "createByValue": true, "edit": true, "delete": true, "viewStats": true, "viewTriage": true, "createTriage": true, "distributeTriage": true},
    "settings": {"view": true, "editDailyRate": true, "editOther": true},
    "users": {"view": true, "create": true, "edit": true, "delete": true, "resetPassword": true, "managePermissions": true},
    "datamanagement": {"view": true, "viewStats": true, "configRetention": true, "manualCleanup": true, "autoCleanup": true},
    "employeeapproval": {"view": true, "approve": true, "reject": true}
  }'::jsonb, '2626')
on conflict (user_id) do update set
  permissions = excluded.permissions,
  updated_by = excluded.updated_by,
  updated_at = now();

-- ── 2) Fase B: bypass incondicional deixa de valer pro 9999 — só o 2626 mantém.
--    8888 nunca esteve no bypass (segue igual). ─────────────────────────────────────
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
  if v_sub = '2626' then
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

  if not public.user_has_module_permission(v_sub, 'users', 'edit') then
    raise exception 'Você não tem permissão para editar usuários (users.edit)';
  end if;
  return new;
end;
$function$;

-- ── 3) user_permissions: bypass só pro 2626 + trava nova — mexer na permissão do
--    9999 ou do 8888 é EXCLUSIVO do 2626, mesmo pra quem tem managePermissions=true. ──
create or replace function public.enforce_user_permissions_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sub text;
  v_target text;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  if v_sub = '2626' then
    return coalesce(new, old);
  end if;

  v_target := coalesce(new.user_id, old.user_id);
  if v_target in ('9999', '8888') then
    raise exception 'Só o usuário mestre (2626) pode alterar as permissões do 9999/8888';
  end if;

  if not public.user_has_module_permission(v_sub, 'users', 'managePermissions') then
    raise exception 'Você não tem permissão para gerenciar permissões de usuários (users.managePermissions)';
  end if;
  return coalesce(new, old);
end;
$function$;

-- ── 4) employees: mesmo ajuste de bypass (só 2626 continua incondicional). ─────────
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
    if v_sub = '2626' then
      return old;
    end if;
    if not public.user_has_module_permission(v_sub, 'employees', 'delete') then
      raise exception 'Você não tem permissão para excluir funcionários (employees.delete)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_sub = '2626' then
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
    if v_sub <> '2626' then
      raise exception 'Apenas o usuário mestre (2626) pode aprovar/recusar cadastro de funcionário';
    end if;
    return new;
  end if;

  if v_sub = '2626' then
    return new;
  end if;
  if not public.user_has_module_permission(v_sub, 'employees', 'edit') then
    raise exception 'Você não tem permissão para editar funcionários (employees.edit)';
  end if;
  return new;
end;
$function$;
