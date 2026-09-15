-- 15/09/2026 — Configuração da triagem por empresa: quais FUNÇÕES ficam fora do
-- desconto na distribuição de erros. Pedido do Victor: o administrativo de
-- Caratinga (Diendrel, Iago, Pablo) estava sendo descontado junto com a triagem.
--
-- Guarda as funções DESMARCADAS: função nova nasce entrando no desconto, e "sem
-- função" entra por padrão (decisões dele). Sem linha = todo mundo entra, que é o
-- comportamento de antes.

create table public.triage_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  excluded_function_roles text[] not null default '{}',
  exclude_no_function boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.triage_config enable row level security;

create policy rls_company_match_modify on public.triage_config
  for all
  using (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  )
  with check (
    (company_id)::text = coalesce((select auth.jwt() ->> 'company_id'), '')
    or (select auth.jwt() ->> 'sub') = any (array['9999', '2626'])
  );

-- Anônimo não tem nada a fazer aqui; logado lê e grava, não apaga.
revoke all on public.triage_config from anon, authenticated;
grant select, insert, update on public.triage_config to authenticated;

-- Mudar quem entra no desconto é de quem pode distribuir (errors.distributeTriage),
-- decisão do Victor — travado no banco, não só na tela. O chamador sai do JWT,
-- nunca de current_user (lição de 08/09: vira postgres dentro de SECURITY DEFINER).
-- Sem claims (SQL direto, migration) ou service_role: passa. 2626: passa (não tem
-- linha em user_permissions; usa tudo pelo bypass).
create or replace function public.enforce_triage_config_permission_check()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_sub text := v_claims ->> 'sub';
begin
  if v_claims is null or v_claims ->> 'role' = 'service_role' then
    return new;
  end if;
  if v_sub = '2626' then
    return new;
  end if;
  if not coalesce(public.user_has_module_permission(v_sub, 'errors', 'distributeTriage'), false) then
    raise exception 'Você não tem permissão para mudar quem entra no desconto da triagem (errors.distributeTriage)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_triage_config_permission_check() from public, anon, authenticated;

create trigger triage_config_permission_check
  before insert or update on public.triage_config
  for each row execute function public.enforce_triage_config_permission_check();

-- Decisão do Victor (15/09): Caratinga já começa com o administrativo fora.
insert into public.triage_config (company_id, excluded_function_roles, updated_by)
select c.id, array['Auxiliar Administrativo'], 'migration 15/09 (pedido do Victor)'
from public.companies c
where c.city = 'Caratinga, MG'
on conflict (company_id) do nothing;
