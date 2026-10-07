-- MODO GALPÃO — o tablet SEM TOQUE (06/10/2026, plano do tablet sem toque, entrega A).
--
-- Decisões do Victor (05/10, PLANO_TABLET_SEM_TOQUE_2026-10-05.md §2): interruptor POR TABLET,
-- nasce DESLIGADO, só o 2626 liga no cartão "Tablets de ponto". Com ele ligado, a tela do tablet
-- não pede toque nenhum (modo econômico no lugar do "Toque", aviso de batida recente sem botão,
-- sempre abre na câmera, recuperação sozinha...). Desligado = exatamente como hoje.
--
-- ADITIVO:
--   1. coluna nova com default false (nenhum tablet muda de comportamento ao aplicar);
--   2. clock_device_list e clock_device_resolve passam a devolver o modo — quem lê hoje (o painel
--      no ar e a employee-public-api v20) ignora a coluna a mais. Mudar o RETORNO de uma função
--      exige DROP + CREATE: feito na MESMA transação desta migration, com os MESMOS grants;
--   3. função nova clock_device_set_modo_galpao (só o 2626).
-- As funções recriadas são as definições VIVAS lidas do banco em 06/10 (iguais à migration
-- 20260930034644), só com o campo novo.

alter table public.clock_devices
  add column if not exists modo_galpao boolean not null default false;

comment on column public.clock_devices.modo_galpao is
  'Modo galpão (tablet sem toque, 06/10/2026): true = a tela do tablet não pede toque nenhum (modo econômico, aviso de batida recente sem botão, sempre abre na câmera). Nasce false. Só muda por clock_device_set_modo_galpao (2626).';

-- ── Painel (2626): a lista dos tablets passa a dizer se o modo galpão está ligado ─────────────
drop function if exists public.clock_device_list();
create function public.clock_device_list()
returns table (
  id uuid,
  name text,
  status text,
  pairing_expires_at timestamptz,
  created_at timestamptz,
  created_by text,
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  company_ids uuid[],
  company_names text[],
  modo_galpao boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if coalesce((select auth.jwt() ->> 'sub'), '') <> '2626' then
    raise exception 'Só o 2626 gerencia os tablets de ponto.' using errcode = '42501';
  end if;
  return query
    select d.id, d.name,
           case when d.status = 'pending' and d.pairing_expires_at <= now() then 'expired' else d.status end,
           d.pairing_expires_at, d.created_at, d.created_by, d.activated_at, d.last_seen_at,
           d.revoked_at, d.revoked_by,
           array_agg(c.id order by c.display_name),
           array_agg(c.display_name order by c.display_name),
           d.modo_galpao
    from public.clock_devices d
    join public.clock_device_companies dc on dc.device_id = d.id
    join public.companies c on c.id = dc.company_id
    group by d.id
    order by (d.status = 'revoked'), d.created_at desc;
end;
$function$;

-- ── Tela de ponto (via edge function, service_role): o tablet descobre o próprio modo ────────
drop function if exists public.clock_device_resolve(text);
create function public.clock_device_resolve(p_token_hash text)
returns table (id uuid, name text, company_ids uuid[], company_names text[], modo_galpao boolean)
language plpgsql
volatile
security definer
set search_path to ''
as $function$
begin
  update public.clock_devices d
     set last_seen_at = now()
   where d.token_hash = p_token_hash
     and d.status = 'active'
     and (d.last_seen_at is null or d.last_seen_at < now() - interval '1 minute');

  return query
    select d.id, d.name,
           array_agg(c.id order by c.display_name),
           array_agg(c.display_name order by c.display_name),
           d.modo_galpao
    from public.clock_devices d
    join public.clock_device_companies dc on dc.device_id = d.id
    join public.companies c on c.id = dc.company_id
    where d.token_hash = p_token_hash
      and d.status = 'active'
    group by d.id;
end;
$function$;

-- ── Liga/desliga o modo galpão de UM tablet (só o 2626) ─────────────────────────────────────
create or replace function public.clock_device_set_modo_galpao(p_device_id uuid, p_enabled boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_sub text := coalesce((select auth.jwt() ->> 'sub'), '');
begin
  if v_sub <> '2626' then
    raise exception 'Só o 2626 liga ou desliga o modo galpão do tablet.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Diga se o modo galpão fica ligado ou desligado.' using errcode = '22023';
  end if;
  update public.clock_devices
     set modo_galpao = p_enabled
   where id = p_device_id
     and status <> 'revoked';
  if not found then
    raise exception 'Tablet não encontrado (ou já removido).' using errcode = '22023';
  end if;
  return p_enabled;
end;
$function$;

revoke all on function public.clock_device_list() from public, anon;
revoke all on function public.clock_device_resolve(text) from public, anon, authenticated;
revoke all on function public.clock_device_set_modo_galpao(uuid, boolean) from public, anon;

grant execute on function public.clock_device_list() to authenticated, service_role;
grant execute on function public.clock_device_resolve(text) to service_role;
grant execute on function public.clock_device_set_modo_galpao(uuid, boolean) to authenticated, service_role;
