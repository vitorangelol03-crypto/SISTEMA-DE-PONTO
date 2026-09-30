-- 30/09/2026 — correção da migration anterior (ponto_so_no_tablet), achada pelo teste.
--
-- 🔴 O QUE O TESTE MOSTROU: `clock_device_set_lock` ligava uma "licença" com
-- set_config('app.clock_device_lock_via_rpc', 'on', true) pra passar pelo gatilho. O `true`
-- (is_local) vale até o FIM DA TRANSAÇÃO — não até o fim da função. Numa transação que chamasse
-- a função e depois fizesse um UPDATE direto em companies, o UPDATE direto passava pelo
-- gatilho. Provado: dentro da mesma transação, um UPDATE como `authenticated` (sub 9999)
-- desligou a trava depois de o 2626 ligar pela função.
--
-- Na operação real cada chamada do PostgREST é uma transação sozinha, então não vazava — mas
-- desenho errado é desenho errado. A licença sai: a função é SECURITY DEFINER (dona: postgres),
-- então o UPDATE dela já roda como `postgres`, e o gatilho só precisa olhar `current_user`.
-- Quem chega pela API (anon/authenticated) é recusado sempre.

create or replace function public.clock_device_set_lock(p_company_id uuid, p_enabled boolean)
returns boolean
language plpgsql volatile security definer set search_path to ''
as $function$
declare
  v_sub text := coalesce((select auth.jwt() ->> 'sub'), '');
begin
  if v_sub <> '2626' then
    raise exception 'Só o 2626 liga ou desliga a trava do tablet.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Diga se a trava fica ligada ou desligada.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Empresa não encontrada.' using errcode = '22023';
  end if;
  if p_enabled and not exists (
    select 1 from public.clock_device_companies dc
    join public.clock_devices d on d.id = dc.device_id
    where dc.company_id = p_company_id and d.status = 'active'
  ) then
    raise exception 'Ative pelo menos um tablet desta empresa antes de ligar a trava — senão ninguém consegue bater ponto.'
      using errcode = '22023';
  end if;

  update public.companies set require_clock_device = p_enabled, updated_at = now() where id = p_company_id;
  return p_enabled;
end;
$function$;

create or replace function public.guard_companies_require_clock_device()
returns trigger
language plpgsql set search_path to ''
as $function$
begin
  if new.require_clock_device is distinct from old.require_clock_device
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'A trava "ponto só no tablet" só muda pelo cartão Tablets de ponto (Configurações), pelo 2626.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.clock_device_set_lock(uuid, boolean) from public, anon;
grant execute on function public.clock_device_set_lock(uuid, boolean) to authenticated, service_role;
revoke all on function public.guard_companies_require_clock_device() from public, anon, authenticated;
