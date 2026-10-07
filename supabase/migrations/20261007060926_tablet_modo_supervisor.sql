-- MODO SUPERVISOR DO TABLET — o estado no servidor (07/10/2026, plano do tablet sem toque, entrega D).
-- OK do Victor: "pode aplicar a migration, segue com a D".
--
-- O supervisor entra no celular (código + senha do painel), gera um QR; o tablet lê; o celular lista
-- os funcionários, cadastra gente nova ou pede pra refazer um rosto; um 2º QR leva o tablet a tirar o
-- rosto, e o supervisor confirma no celular. QR de uso único com prazo curto PRECISA de estado no
-- servidor — papel assinado (como o comprovante facial) não garante 1 uso nem deixa o celular saber
-- que o tablet leu.
--
-- 3 tabelas NOVAS e vazias, todas com RLS ligado e SEM policy, revoke all de anon/authenticated: só a
-- edge function ponto-supervisor-api (service_role) mexe — molde clock_devices (20260930034644).
-- Nada que já existe muda.

-- ── 1) Sessão do supervisor no celular (20 min) ────────────────────────────────────────────────
create table if not exists public.tablet_supervisor_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null,                                             -- sha256 do segredo (que fica só no celular)
  user_id     text not null references public.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,   -- o funcionário vinculado (histórico)
  company_id  uuid not null references public.companies(id) on delete cascade,
  device_id   uuid references public.clock_devices(id) on delete set null, -- o tablet que leu o QR de parear
  status      text not null default 'aberta',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  paired_at   timestamptz,
  ended_at    timestamptz,
  constraint tablet_supervisor_sessions_status_check check (status in ('aberta', 'pareada', 'encerrada')),
  constraint tablet_supervisor_sessions_pareada_tem_tablet check (status <> 'pareada' or device_id is not null)
);
create unique index if not exists tablet_supervisor_sessions_token_hash_key
  on public.tablet_supervisor_sessions (token_hash);
create index if not exists tablet_supervisor_sessions_user_idx on public.tablet_supervisor_sessions (user_id);
create index if not exists tablet_supervisor_sessions_device_idx on public.tablet_supervisor_sessions (device_id);

-- ── 2) Os QRs: 'parear' (o celular se apresenta ao tablet) e 'rosto' (o tablet tira o rosto) ──────
create table if not exists public.tablet_qr_tokens (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.tablet_supervisor_sessions(id) on delete cascade,
  kind                text not null,
  token_hash          text not null,                                     -- sha256 do código do QR
  status              text not null default 'pendente',
  expires_at          timestamptz not null,                              -- prazo pra o tablet LER (2 min)
  employee_id         uuid references public.employees(id) on delete cascade, -- só 'rosto'
  mode                text,                                              -- só 'rosto': 'novo' | 'refazer'
  bater_ponto         boolean not null default true,
  read_by_device      uuid references public.clock_devices(id) on delete set null,
  read_at             timestamptz,
  captured_at         timestamptz,
  captured_descriptor jsonb,  -- TEMPORÁRIO (biometria): zerado ao confirmar/recusar e pelo job abaixo
  captured_thumb      text,   -- TEMPORÁRIO (foto pequena do rosto pro supervisor conferir)
  quality             jsonb,
  attempts            int not null default 0,
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  constraint tablet_qr_tokens_kind_check check (kind in ('parear', 'rosto')),
  constraint tablet_qr_tokens_status_check
    check (status in ('pendente', 'lido', 'capturado', 'confirmado', 'recusado', 'cancelado')),
  constraint tablet_qr_tokens_mode_check check (mode is null or mode in ('novo', 'refazer')),
  constraint tablet_qr_tokens_rosto_tem_funcionario
    check (kind <> 'rosto' or (employee_id is not null and mode is not null)),
  constraint tablet_qr_tokens_thumb_len check (captured_thumb is null or char_length(captured_thumb) <= 60000),
  constraint tablet_qr_tokens_attempts_check check (attempts between 0 and 10)
);
-- 1 uso garantido na leitura: UPDATE ... WHERE token_hash = ? AND status = 'pendente' (só um ganha).
create unique index if not exists tablet_qr_tokens_pendente_key
  on public.tablet_qr_tokens (token_hash) where status = 'pendente';
create index if not exists tablet_qr_tokens_session_idx on public.tablet_qr_tokens (session_id);
create index if not exists tablet_qr_tokens_status_expires_idx on public.tablet_qr_tokens (status, expires_at);

-- ── 3) Trava de tentativas do login do supervisor (5 erros → 15 min) ───────────────────────────
create table if not exists public.tablet_supervisor_login_attempts (
  user_id         text primary key references public.users(id) on delete cascade,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.tablet_supervisor_sessions enable row level security;
alter table public.tablet_qr_tokens enable row level security;
alter table public.tablet_supervisor_login_attempts enable row level security;
revoke all on public.tablet_supervisor_sessions from anon, authenticated;
revoke all on public.tablet_qr_tokens from anon, authenticated;
revoke all on public.tablet_supervisor_login_attempts from anon, authenticated;

comment on table public.tablet_supervisor_sessions is
  'Modo supervisor do tablet (07/10/2026): sessão do celular do supervisor (20 min). Guarda só o sha256 do segredo. Sem policy: só a edge function ponto-supervisor-api (service_role).';
comment on table public.tablet_qr_tokens is
  'Modo supervisor do tablet (07/10/2026): QRs de uso único (parear / rosto). Guarda só o sha256 do código. captured_descriptor/captured_thumb são TEMPORÁRIOS (biometria): zerados ao decidir e pelo job tablet-qr-limpa-rosto.';
comment on table public.tablet_supervisor_login_attempts is
  'Modo supervisor do tablet (07/10/2026): trava de tentativas do login (5 erros → 15 min).';

-- ── 4) A biometria temporária não fica parada ──────────────────────────────────────────────────
-- O rosto que VALE continua só em employees.face_descriptor. O capturado no tablet fica aqui só
-- até o supervisor decidir; se ninguém decidir, este job apaga 10 min depois da captura (ou do
-- prazo do QR). Só SQL (sem chamada HTTP nem segredo). O pg_cron já está instalado (1.6.4, o mesmo
-- do driverpay-proof-queue): um "create extension if not exists" aqui FALHA no Supabase ("dependent
-- privileges exist" — o gatilho de evento dele refaz os grants do schema cron), então não vai.
select cron.schedule(
  'tablet-qr-limpa-rosto',
  '*/10 * * * *',
  $job$
  update public.tablet_qr_tokens
     set captured_descriptor = null,
         captured_thumb = null
   where (captured_descriptor is not null or captured_thumb is not null)
     and (status in ('confirmado', 'recusado', 'cancelado')
          or coalesce(captured_at, expires_at) < now() - interval '10 minutes');
  $job$
);
