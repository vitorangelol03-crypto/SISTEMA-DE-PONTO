-- VÍNCULO USUÁRIO ↔ FUNCIONÁRIO (07/10/2026, plano do tablet sem toque, entrega C).
-- OK do Victor: "pode seguir com a entrega C, pode aplicar a migration".
--
-- Decisão 10 (05/10, PLANO_TABLET_SEM_TOQUE_2026-10-05.md §2): quem usa o modo supervisor do
-- tablet precisa estar LIGADO a um funcionário — o histórico vai mostrar quem fez (usuário +
-- funcionário + tablet). Pros outros é opcional. Ligam: o 2626 e quem tem "Gerenciar permissões"
-- (users.managePermissions), só usuário da própria empresa (9999/2626 cruzam); o 9999, o 8888 e o
-- 2626 só o 2626 liga (mesma regra das permissões deles). 1 funcionário ↔ 1 usuário.
--
-- Coluna em users (8 linhas, quase não muda) e não employees.user_id (100+ linhas, escrita pelo
-- cadastro público e por dezenas de telas). ADITIVO: a coluna nasce VAZIA (ninguém ligado) e quem
-- lê users hoje só ganha um campo a mais.

-- ── 1) A coluna e a regra 1 funcionário ↔ 1 usuário ────────────────────────────────────────────
alter table public.users
  add column if not exists employee_id uuid null references public.employees(id) on delete set null;

create unique index if not exists users_employee_id_key
  on public.users (employee_id) where employee_id is not null;

comment on column public.users.employee_id is
  'Funcionário ligado a este usuário (07/10/2026, modo supervisor do tablet). Só muda por public.admin_link_user_employee (Permissões, no painel). Excluir o funcionário desfaz o vínculo (on delete set null).';

-- ── 2) Só a função muda o vínculo ──────────────────────────────────────────────────────────────
-- A tabela users aceita UPDATE pela API pra quem tem users.edit (gatilho enforce_users_permission_
-- check) — sem esta guarda, quem edita nome/telefone ligaria qualquer pessoa sem passar pelas
-- regras da função nem deixar histórico. A função é SECURITY DEFINER (dona: postgres) e a ação
-- "on delete set null" roda como dona da tabela: as duas passam; quem chega pela API, não.
-- Sem "licença" por set_config (vale até o fim da TRANSAÇÃO — 20260930035209).
create or replace function public.guard_users_employee_id()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.employee_id is not null then
      raise exception 'O funcionário vinculado só se escolhe na tela de Permissões, depois de criar o usuário.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.employee_id is distinct from old.employee_id then
    raise exception 'O funcionário vinculado só muda pela tela de Permissões (Gerenciar permissões).'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_users_employee_id on public.users;
create trigger trg_guard_users_employee_id
  before insert or update of employee_id on public.users
  for each row execute function public.guard_users_employee_id();

-- ── 3) Liga / desfaz o vínculo (null = desfaz) ─────────────────────────────────────────────────
-- Molde: admin_set_employee_pin (20260930132704). Não vai pela edge function create-user: a ação
-- 'update' de lá confere a chave inexistente users.update (aviso separado, não consertado aqui).
create or replace function public.admin_link_user_employee(p_user_id text, p_employee_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_sub          text := coalesce((select auth.jwt() ->> 'sub'), '');
  v_company      text := coalesce((select auth.jwt() ->> 'company_id'), '');
  v_hoje         date := (now() at time zone 'America/Sao_Paulo')::date;
  v_user_company uuid;
  v_antes        uuid;
  v_emp_name     text;
  v_emp_company  uuid;
  v_emp_status   text;
  v_emp_saida    date;
  v_outro        text;
begin
  -- Sem login não passa (sub vazio cairia no padrão de quem não tem linha de permissão).
  if v_sub = '' then
    raise exception 'Faça login para ligar usuário e funcionário.' using errcode = '42501';
  end if;
  if not (v_sub = '2626' or public.user_has_module_permission(v_sub, 'users', 'managePermissions')) then
    raise exception 'Você não tem permissão para ligar usuário e funcionário (Gerenciar permissões).'
      using errcode = '42501';
  end if;

  select u.company_id, u.employee_id into v_user_company, v_antes
    from public.users u where u.id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = '22023';
  end if;
  -- 9999/8888 (configuráveis) e o próprio 2626: só o 2626 mexe — igual às permissões deles.
  if p_user_id in ('9999', '8888', '2626') and v_sub <> '2626' then
    raise exception 'Só o usuário mestre (2626) liga o % a um funcionário.', p_user_id using errcode = '42501';
  end if;
  -- A mesma fronteira das policies de users: a empresa do login, ou mestre (9999/2626).
  if v_sub not in ('9999', '2626') and v_user_company::text <> v_company then
    raise exception 'Usuário de outra empresa.' using errcode = '42501';
  end if;

  -- ── Desfazer ──
  if p_employee_id is null then
    if v_antes is null then
      return null; -- já estava sem vínculo: nada muda, nada vai pro histórico
    end if;
    update public.users set employee_id = null where id = p_user_id;
    insert into public.audit_logs (user_id, action_type, module, entity_type, entity_id, old_data, new_data, description)
    values (v_sub, 'update', 'users', 'vinculo', v_antes,
            jsonb_build_object('user_id', p_user_id, 'employee_id', v_antes),
            jsonb_build_object('user_id', p_user_id, 'employee_id', null),
            format('Vínculo desfeito: usuário %s não está mais ligado a funcionário', p_user_id));
    return null;
  end if;

  -- ── Ligar ──
  select e.name, e.company_id, e.registration_status, e.termination_date
    into v_emp_name, v_emp_company, v_emp_status, v_emp_saida
    from public.employees e where e.id = p_employee_id;
  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = '22023';
  end if;
  if v_emp_company <> v_user_company then
    raise exception 'O funcionário tem que ser da mesma empresa do usuário.' using errcode = '22023';
  end if;
  if v_emp_status = 'rejected' then
    raise exception 'Funcionário com cadastro recusado não pode ser vinculado.' using errcode = '22023';
  end if;
  -- Desligado = a data de saída já passou (a mesma regra da batida no clock-in-validated).
  if v_emp_saida is not null and v_emp_saida < v_hoje then
    raise exception 'Funcionário desligado não pode ser vinculado.' using errcode = '22023';
  end if;
  select u.id into v_outro from public.users u where u.employee_id = p_employee_id and u.id <> p_user_id;
  if found then
    raise exception 'Esse funcionário já está ligado ao usuário %.', v_outro using errcode = '23505';
  end if;
  if v_antes is not distinct from p_employee_id then
    return p_employee_id; -- já era ele: nada muda, nada vai pro histórico
  end if;

  begin
    update public.users set employee_id = p_employee_id where id = p_user_id;
  exception when unique_violation then
    -- Duas pessoas ligando o mesmo funcionário no mesmo instante: o índice único segura.
    raise exception 'Esse funcionário acabou de ser ligado a outro usuário.' using errcode = '23505';
  end;
  insert into public.audit_logs (user_id, action_type, module, entity_type, entity_id, old_data, new_data, description)
  values (v_sub, 'update', 'users', 'vinculo', p_employee_id,
          jsonb_build_object('user_id', p_user_id, 'employee_id', v_antes),
          jsonb_build_object('user_id', p_user_id, 'employee_id', p_employee_id, 'employee_name', v_emp_name),
          format('Usuário %s ligado ao funcionário %s', p_user_id, v_emp_name));
  return p_employee_id;
end;
$function$;

revoke all on function public.admin_link_user_employee(text, uuid) from public, anon;
grant execute on function public.admin_link_user_employee(text, uuid) to authenticated, service_role;
revoke all on function public.guard_users_employee_id() from public, anon, authenticated;
