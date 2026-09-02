-- Pedido do Victor (02/09/2026, madrugada): "vamos remover todas essas regras que
-- implementamos antes de usuários e vamos usar parte de permissão agora" — confirmado
-- explicitamente que isso inclui as 3: Ponto (editar/marcar/resetar), Pagamentos Driver
-- e Aprovação de Cadastro, hoje travadas hardcoded pro 2626 independente do que estiver
-- salvo em user_permissions. As 3 viram permissão normal, configurável por usuário via
-- PermissionsModal, do mesmo jeito que Usuários/Funcionários já são desde a Fase B.
--
-- 2626 continua o líder único e fixo — bypass total dele não muda em nada aqui.
--
-- ⚠️ Achado de segurança confirmado ANTES desta migration (não hipotético): 3 supervisores
-- reais (02, 03, 04) já tinham valores "true" adormecidos em attendance.mark/edit/
-- editHistory/manualTime/reset — 100% inertes até agora (a trava exclusiva ignorava esse
-- valor sempre), mas que virariam capacidade REAL de marcar presença/editar ponto assim
-- que a trava cai. Isso reproduziria exatamente o incidente de 04/08 (9999 marcou 3
-- pessoas que não trabalharam, pagas como dia trabalhado — motivo original da trava).
-- Por isso esta migration ZERA essas 5 chaves pra todo mundo que não é 2626/9999/8888
-- ANTES de trocar os triggers — ninguém ganha acesso de repente; o Victor concede
-- explicitamente quem ele quiser depois, na tela de Permissões ("máximo controle").

-- ── 1) Reset de segurança: zera as 5 ações de ponto pra quem não é privilegiado ──────
update public.user_permissions
set permissions = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(permissions, '{attendance,mark}', 'false'::jsonb),
            '{attendance,edit}', 'false'::jsonb),
          '{attendance,editHistory}', 'false'::jsonb),
        '{attendance,manualTime}', 'false'::jsonb),
      '{attendance,reset}', 'false'::jsonb),
    updated_by = '2626',
    updated_at = now()
where user_id not in ('9999', '2626', '8888')
  and permissions ? 'attendance';

-- ── 2) enforce_ponto_master_only: hardcoded '2626' vira user_has_module_permission ──
create or replace function public.enforce_ponto_master_only()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sub text;
  v_time_changed boolean := false;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  if v_sub = '2626' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if not public.user_has_module_permission(v_sub, 'attendance', 'reset') then
      raise exception 'Você não tem permissão para excluir/resetar registros de ponto (attendance.reset)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.user_has_module_permission(v_sub, 'attendance', 'mark') then
      raise exception 'Você não tem permissão para registrar ponto (attendance.mark)';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.user_has_module_permission(v_sub, 'attendance', 'mark') then
      raise exception 'Você não tem permissão para alterar presença/falta (attendance.mark)';
    end if;
  end if;

  -- Data/horário: o trigger só vê o diff da linha, não qual botão da UI foi clicado —
  -- basta UMA das 3 permissões relacionadas (edit/editHistory/manualTime), mesma lógica
  -- "OR" já usada em enforce_employees_permission_check pra create/import.
  v_time_changed := new.entry_time     is distinct from old.entry_time
                 or new.exit_time      is distinct from old.exit_time
                 or new.exit_time_full is distinct from old.exit_time_full
                 or new.entry_1_time   is distinct from old.entry_1_time
                 or new.exit_1_time    is distinct from old.exit_1_time
                 or new.entry_2_time   is distinct from old.entry_2_time
                 or new.exit_2_time    is distinct from old.exit_2_time
                 or new.date           is distinct from old.date;

  if v_time_changed then
    if not (public.user_has_module_permission(v_sub, 'attendance', 'edit')
            or public.user_has_module_permission(v_sub, 'attendance', 'editHistory')
            or public.user_has_module_permission(v_sub, 'attendance', 'manualTime')) then
      raise exception 'Você não tem permissão para alterar data/horário de ponto (attendance.edit)';
    end if;
  end if;

  return new;
end;
$function$;

-- ── 3) Aprovação de Cadastro dentro do trigger de employees: hardcoded '2626' vira
--    user_has_module_permission(employeeapproval.approve/reject), distinguindo pelo
--    valor de destino (approved vs rejected). ─────────────────────────────────────────
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
    if v_sub = '2626' then
      return new;
    end if;
    if new.registration_status = 'approved'
       and not public.user_has_module_permission(v_sub, 'employeeapproval', 'approve') then
      raise exception 'Você não tem permissão para aprovar cadastro de funcionário (employeeapproval.approve)';
    end if;
    if new.registration_status = 'rejected'
       and not public.user_has_module_permission(v_sub, 'employeeapproval', 'reject') then
      raise exception 'Você não tem permissão para recusar cadastro de funcionário (employeeapproval.reject)';
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
