-- 30/09/2026 — SEGURANÇA: ninguém troca a senha nem o rosto de outro funcionário, e a senha da
-- aba Admin deixa de ficar legível pra qualquer um. (Victor: "pode corrigir".)
--
-- 🔴 O QUE ESTAVA ABERTO (provado antes de mexer):
--   * companies.admin_secret_password guardava EM TEXTO PURO a senha ATUAL da aba Admin
--     (conferido com verify_admin_secret → true nas 2 empresas) e a tabela companies tem SELECT
--     público (policy rls_companies_public_select + grant pro anon): quem tivesse o endereço do
--     sistema lia a senha. A conferência de verdade já usa admin_secret (bcrypt) desde 12/05 —
--     a coluna é SOBRA, nenhuma função/visão/tela usa (catálogo e código conferidos).
--   * O botão "Definir PIN" do painel usava a ação PÚBLICA set-pin da edge function, que aceita
--     trocar o PIN de QUALQUER funcionário sem login. A edge function passa a aceitar set-pin só
--     no 1º acesso (sem PIN); o painel ganha esta função, que confere a permissão de quem está
--     logado (a mesma employees.edit da tela e do gatilho de funcionários).

-- ── 1) A senha em texto puro sai ───────────────────────────────────────────────────────────────
alter table public.companies drop column if exists admin_secret_password;

-- ── 2) O painel define o PIN pelo login de quem está usando ────────────────────────────────────
create or replace function public.admin_set_employee_pin(p_employee_id uuid, p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_sub         text := coalesce((select auth.jwt() ->> 'sub'), '');
  v_company     text := coalesce((select auth.jwt() ->> 'company_id'), '');
  v_emp_company uuid;
begin
  -- Sem login não passa (user_has_module_permission libera employees.edit por padrão pra quem
  -- não tem linha de permissão — um sub vazio cairia nesse padrão).
  if v_sub = '' then
    raise exception 'Faça login para definir o PIN.' using errcode = '42501';
  end if;
  if not (v_sub = '2626' or public.user_has_module_permission(v_sub, 'employees', 'edit')) then
    raise exception 'Você não tem permissão para definir o PIN (employees.edit).' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN deve ser numérico com 4 a 6 dígitos' using errcode = '22023';
  end if;

  select e.company_id into v_emp_company from public.employees e where e.id = p_employee_id;
  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = '22023';
  end if;
  -- A mesma fronteira da RLS de employees: a empresa do login, ou mestre (9999/2626).
  if v_sub not in ('9999', '2626') and v_emp_company::text <> v_company then
    raise exception 'Funcionário de outra empresa.' using errcode = '42501';
  end if;

  -- bcrypt ($2a$, custo 10) — o mesmo formato que a edge function confere com bcryptjs.
  update public.employees
     set pin = null,
         pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         pin_configured = true
   where id = p_employee_id;
end;
$function$;

revoke all on function public.admin_set_employee_pin(uuid, text) from public, anon;
grant execute on function public.admin_set_employee_pin(uuid, text) to authenticated, service_role;
