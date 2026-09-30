-- 30/09/2026 — PONTO SÓ NO TABLET DA EMPRESA (roadmap item 3) + diagnóstico da facial sem CPF.
--
-- Decisões do Victor (30/09, "pode seguir com as recomendações"):
--   * só o 2626 cadastra tablet (e liga/desliga a trava);
--   * com a trava ligada, TODO MUNDO só bate no tablet — supervisor incluído, sem exceção;
--   * no tablet continua o "digitar CPF e senha" (e o rosto continua obrigatório);
--   * a trava NASCE DESLIGADA: ele liga empresa por empresa depois de ativar os tablets.
--
-- Como o tablet prova que é "da empresa":
--   1. o 2626 gera um CÓDIGO DE ATIVAÇÃO (8 letras/números, vale 15 min) dizendo o nome do
--      tablet e quais empresas ele atende — Caratinga e Ponte Nova batem ponto no MESMO lugar
--      (mesma cerca, batidas de PN a 3–66 m do ponto), então um tablet pode atender as duas;
--   2. no tablet, a tela de ponto troca esse código por um SEGREDO que fica guardado só nele;
--   3. toda batida (e toda identificação sem CPF) leva o segredo; com a trava ligada, o
--      servidor recusa quem não tem um segredo ATIVO que atenda a empresa do funcionário.
--   O banco guarda só o HASH (sha256) do código e do segredo — nunca o valor.
--
-- Acesso: as tabelas não têm policy pra ninguém (RLS ligado, anon/authenticated sem grant).
-- O painel usa as funções abaixo, que conferem `sub = '2626'`; a tela de ponto (pública) usa
-- a edge function employee-public-api/clock-in-validated, com service_role, pelas funções
-- clock_device_activate/clock_device_resolve (só service_role executa).

-- ── 1) A trava, por empresa — NASCE DESLIGADA ──────────────────────────────────────────────
alter table public.companies
  add column if not exists require_clock_device boolean not null default false;

comment on column public.companies.require_clock_device is
  'Ponto só no tablet da empresa (30/09/2026): quando true, clock-in-validated e identify-face recusam aparelho que não seja um tablet ATIVO cadastrado para esta empresa (clock_devices). Nasce false. Só muda por clock_device_set_lock (2626), que exige pelo menos um tablet ativo.';

-- ── 2) Os tablets ──────────────────────────────────────────────────────────────────────────
create table if not exists public.clock_devices (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  status              text not null default 'pending',
  token_hash          text,
  pairing_code_hash   text,
  pairing_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  created_by          text not null,
  activated_at        timestamptz,
  last_seen_at        timestamptz,
  revoked_at          timestamptz,
  revoked_by          text,
  constraint clock_devices_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint clock_devices_status_check check (status in ('pending', 'active', 'revoked')),
  constraint clock_devices_active_has_token check (status <> 'active' or token_hash is not null),
  constraint clock_devices_pending_has_code check (
    status <> 'pending' or (pairing_code_hash is not null and pairing_expires_at is not null)
  )
);

create unique index if not exists clock_devices_token_hash_key
  on public.clock_devices (token_hash) where token_hash is not null;
create unique index if not exists clock_devices_pending_code_key
  on public.clock_devices (pairing_code_hash) where status = 'pending';

create table if not exists public.clock_device_companies (
  device_id  uuid not null references public.clock_devices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (device_id, company_id)
);
create index if not exists clock_device_companies_company_idx
  on public.clock_device_companies (company_id);

alter table public.clock_devices enable row level security;
alter table public.clock_device_companies enable row level security;
revoke all on public.clock_devices from anon, authenticated;
revoke all on public.clock_device_companies from anon, authenticated;

comment on table public.clock_devices is
  'Tablets autorizados a registrar ponto (30/09/2026). Guarda só hashes. Sem policy de propósito: painel usa as RPCs clock_device_* (2626), a tela de ponto usa a edge function (service_role).';

-- ── 3) Painel (2626) ───────────────────────────────────────────────────────────────────────

-- Lista os tablets. Status 'expired' = código de ativação vencido sem uso.
create or replace function public.clock_device_list()
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
  company_names text[]
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
    select d.id,
           d.name,
           case when d.status = 'pending' and d.pairing_expires_at <= now() then 'expired' else d.status end,
           d.pairing_expires_at,
           d.created_at,
           d.created_by,
           d.activated_at,
           d.last_seen_at,
           d.revoked_at,
           d.revoked_by,
           array_agg(c.id order by c.display_name),
           array_agg(c.display_name order by c.display_name)
    from public.clock_devices d
    join public.clock_device_companies dc on dc.device_id = d.id
    join public.companies c on c.id = dc.company_id
    group by d.id
    order by (d.status = 'revoked'), d.created_at desc;
end;
$function$;

-- Gera o código de ativação de um tablet novo. Devolve o código UMA vez (o banco guarda o hash).
-- Alfabeto de 32 símbolos sem os que se confundem (I/1, O/0): byte % 32 é uniforme.
create or replace function public.clock_device_create_pairing(p_name text, p_company_ids uuid[])
returns table (device_id uuid, pairing_code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_sub      text := coalesce((select auth.jwt() ->> 'sub'), '');
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    bytea;
  v_code     text := '';
  v_id       uuid;
  v_expires  timestamptz := now() + interval '15 minutes';
  i          int;
begin
  if v_sub <> '2626' then
    raise exception 'Só o 2626 cadastra tablet de ponto.' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'Dê um nome ao tablet (até 60 letras).' using errcode = '22023';
  end if;
  if p_company_ids is null or cardinality(p_company_ids) = 0 then
    raise exception 'Escolha pelo menos uma empresa para o tablet.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_company_ids) as x(company_id)
    where not exists (select 1 from public.companies c where c.id = x.company_id)
  ) then
    raise exception 'Empresa não encontrada.' using errcode = '22023';
  end if;

  v_bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.clock_devices (name, status, pairing_code_hash, pairing_expires_at, created_by)
  values (btrim(p_name), 'pending', encode(extensions.digest(v_code, 'sha256'), 'hex'), v_expires, v_sub)
  returning clock_devices.id into v_id;

  insert into public.clock_device_companies (device_id, company_id)
  select v_id, s.company_id from (select distinct unnest(p_company_ids) as company_id) s;

  return query select v_id, substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), v_expires;
end;
$function$;

-- Remove (revoga) um tablet. Recusa tirar o ÚLTIMO tablet ativo de uma empresa que está com a
-- trava ligada — senão ninguém daquela empresa conseguiria bater ponto.
create or replace function public.clock_device_revoke(p_device_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_sub     text := coalesce((select auth.jwt() ->> 'sub'), '');
  v_blocked text;
begin
  if v_sub <> '2626' then
    raise exception 'Só o 2626 remove tablet de ponto.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clock_devices d where d.id = p_device_id and d.status <> 'revoked') then
    raise exception 'Tablet não encontrado (ou já removido).' using errcode = '22023';
  end if;

  select string_agg(c.display_name, ', ' order by c.display_name) into v_blocked
  from public.clock_device_companies dc
  join public.companies c on c.id = dc.company_id
  where dc.device_id = p_device_id
    and c.require_clock_device
    and not exists (
      select 1 from public.clock_device_companies dc2
      join public.clock_devices d2 on d2.id = dc2.device_id
      where dc2.company_id = dc.company_id
        and d2.status = 'active'
        and d2.id <> p_device_id
    );
  if v_blocked is not null then
    raise exception 'Este é o último tablet ativo de % e a trava está ligada. Desligue a trava ou ative outro tablet antes de remover este.', v_blocked
      using errcode = '22023';
  end if;

  update public.clock_devices
     set status = 'revoked', revoked_at = now(), revoked_by = v_sub
   where id = p_device_id;
end;
$function$;

-- Liga/desliga a trava de uma empresa. Ligar exige pelo menos um tablet ATIVO dela.
create or replace function public.clock_device_set_lock(p_company_id uuid, p_enabled boolean)
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

  perform set_config('app.clock_device_lock_via_rpc', 'on', true);
  update public.companies set require_clock_device = p_enabled, updated_at = now() where id = p_company_id;
  return p_enabled;
end;
$function$;

-- A trava só muda pela função acima (ou por service_role/postgres). Um UPDATE direto em
-- companies — que 9999/2626 podem fazer pela API — é RECUSADO com mensagem, não ignorado.
create or replace function public.guard_companies_require_clock_device()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.require_clock_device is distinct from old.require_clock_device
     and current_user not in ('service_role', 'postgres', 'supabase_admin')
     and coalesce(current_setting('app.clock_device_lock_via_rpc', true), '') <> 'on' then
    raise exception 'A trava "ponto só no tablet" só muda pelo cartão Tablets de ponto (Configurações), pelo 2626.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_companies_require_clock_device on public.companies;
create trigger guard_companies_require_clock_device
  before update of require_clock_device on public.companies
  for each row execute function public.guard_companies_require_clock_device();

-- ── 4) Tela de ponto (edge function, service_role) ─────────────────────────────────────────

-- Troca o código de ativação pelo segredo do tablet. Atômico: só um aparelho ganha o código.
create or replace function public.clock_device_activate(p_code_hash text, p_token_hash text)
returns table (id uuid, name text, company_ids uuid[], company_names text[])
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  update public.clock_devices d
     set status = 'active',
         token_hash = p_token_hash,
         activated_at = now(),
         last_seen_at = now(),
         pairing_code_hash = null,
         pairing_expires_at = null
   where d.pairing_code_hash = p_code_hash
     and d.status = 'pending'
     and d.pairing_expires_at > now()
  returning d.id into v_id;

  if v_id is null then
    return;
  end if;

  return query
    select d.id, d.name,
           array_agg(c.id order by c.display_name),
           array_agg(c.display_name order by c.display_name)
    from public.clock_devices d
    join public.clock_device_companies dc on dc.device_id = d.id
    join public.companies c on c.id = dc.company_id
    where d.id = v_id
    group by d.id;
end;
$function$;

-- Resolve o segredo de um aparelho: devolve o tablet ATIVO e as empresas que ele atende
-- (nada = aparelho não autorizado). Marca o "último uso" no máximo uma vez por minuto.
create or replace function public.clock_device_resolve(p_token_hash text)
returns table (id uuid, name text, company_ids uuid[], company_names text[])
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
           array_agg(c.display_name order by c.display_name)
    from public.clock_devices d
    join public.clock_device_companies dc on dc.device_id = d.id
    join public.companies c on c.id = dc.company_id
    where d.token_hash = p_token_hash
      and d.status = 'active'
    group by d.id;
end;
$function$;

revoke all on function public.clock_device_list() from public, anon;
revoke all on function public.clock_device_create_pairing(text, uuid[]) from public, anon;
revoke all on function public.clock_device_revoke(uuid) from public, anon;
revoke all on function public.clock_device_set_lock(uuid, boolean) from public, anon;
revoke all on function public.clock_device_activate(text, text) from public, anon, authenticated;
revoke all on function public.clock_device_resolve(text) from public, anon, authenticated;
revoke all on function public.guard_companies_require_clock_device() from public, anon, authenticated;

grant execute on function public.clock_device_list() to authenticated, service_role;
grant execute on function public.clock_device_create_pairing(text, uuid[]) to authenticated, service_role;
grant execute on function public.clock_device_revoke(uuid) to authenticated, service_role;
grant execute on function public.clock_device_set_lock(uuid, boolean) to authenticated, service_role;
grant execute on function public.clock_device_activate(text, text) to service_role;
grant execute on function public.clock_device_resolve(text) to service_role;

-- ── 5) Diagnóstico da facial sem CPF ───────────────────────────────────────────────────────
-- Até aqui a tentativa 1:N gravava só a "confiança" do melhor candidato. Não dava pra saber se
-- a recusa foi "ninguém parecido" ou "dois parecidos demais" (ambíguo) — e sem isso não se
-- calibra nada com dado real. Colunas novas, todas opcionais (tentativas antigas ficam nulas).
alter table public.face_auth_attempts
  add column if not exists outcome text,
  add column if not exists best_distance numeric,
  add column if not exists second_distance numeric;

alter table public.face_auth_attempts drop constraint if exists face_auth_attempts_outcome_check;
alter table public.face_auth_attempts
  add constraint face_auth_attempts_outcome_check
  check (outcome is null or outcome in ('matched', 'no_match', 'ambiguous', 'no_candidates'));

comment on column public.face_auth_attempts.outcome is
  'Só na identificação sem CPF (1:N, clock_type nulo): matched | no_match (ninguém perto o bastante) | ambiguous (dois perto demais entre si) | no_candidates. 30/09/2026.';
