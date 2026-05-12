# Security Baseline — Pós-Fase 11

> Snapshot dos advisors do Supabase APÓS hardening RLS completo.
> Capturado em 2026-05-12 via `mcp__claude_ai_Supabase__get_advisors`.
> Comparação direta com `security-baseline-pre-rls.md`.

## Resumo comparativo

| Métrica | Pré-Fase 11 | Pós-Fase 11 | Δ |
|---|---|---|---|
| **Total security lints** | 85 | 23 | **-62 (-73%)** |
| ERROR | 67 | 1 | -66 |
| WARN | 18 | 22 | +4 |

## ERRORs remanescentes (1 — todos legado)

| # | Lint | Tabela/Object | Origem |
|---|---|---|---|
| 1 | `security_definer_view` | `lost_driver_summary` (view) | Sistema "objetos perdidos" — fora do escopo Sistema de Ponto |

**Zero ERRORs do Sistema de Ponto.** ✅

## WARNs remanescentes (22)

### Legado — Sistema "objetos perdidos" (16)

Decisão Victor 2026-05-11 (Q2): não mexer nessas tabelas — pertencem a outro projeto que compartilha o mesmo Supabase.

- 1 `function_search_path_mutable`: `update_lost_reports_updated_at`
- 15 `rls_policy_always_true` (`ALL` USING/WITH CHECK = `true`):
  - `ai_reports`, `city_cache`, `dashboard_meta`, `driver_overrides`,
    `driver_route_links`, `drivers`, `lost_evidence`, `lost_proof_images`,
    `lost_proof_requests`, `lost_reports`, `route_groups`, `route_mapping`,
    `routes`, `search_history`, `tickets`

### Nossas SECURITY DEFINER functions (6 — 3 funções × 2 lints cada)

Funções legítimas que precisam bypass RLS pra executar operações específicas:

| Função | anon EXECUTE | authenticated EXECUTE | Justificativa |
|---|---|---|---|
| `apply_bank_hours_to_payment(21 args)` | **❌ revoked** (sub-fase 11.5) | ✅ ok | Altera payments — só authenticated (supervisor/admin) |
| `verify_admin_secret(text)` | ✅ ok | ✅ ok | Gate de auth — precisa ser callable pré-login pro admin tab |
| `update_admin_secret(text)` | ✅ ok | ✅ ok | Idem — fluxo de reset de senha do admin |

Os WARN `*_security_definer_function_executable` persistem como informação. São intencionais e documentados.

## Comparativo por categoria

### `rls_disabled_in_public`

| Pré | Pós | Δ |
|---|---|---|
| 64 tabelas | **0 tabelas** | -64 ✅ |

- 32 backup_* DROPADAS (sub-fase 11.0)
- 32 core ENABLED RLS (sub-fase 11.1)

### `sensitive_columns_exposed`

| Pré | Pós | Δ |
|---|---|---|
| 2 (`users`, `backup_pre_v2_users` com password plain) | **0** | -2 ✅ |

- `backup_pre_v2_users` DROPADA (sub-fase 11.0)
- `users.password` DROPADA (sub-fase 11.1) — sobrevive só `password_hash` bcrypt

## Validações pós-Fase 11

- Login admin/supervisor/employee: ✅ via auth-login + JWT custom
- RLS active em 47 tabelas (32 core + 15 legado)
- 7 bcrypt hashes em users + admin_secret
- clock-in-validated v8 com verify_jwt:true
- Specs E2E afetadas:
  - 01-auth (6/6): ✅ passing
  - 02-employee-clock + 08-geolocation (13/13): ✅ passing
  - 12-admin-tab (3/3): ✅ passing
  - 25-multi-company-isolation: PARCIALMENTE quebrado pelo RLS
  - 26-multi-company-ui-isolation test 6 (count users via getClient): quebrado

## Pendência — tests E2E e SERVICE_ROLE_KEY

Specs E2E que fazem queries direto via `getClient()` (tests/cleanup.ts usa
ANON_KEY) agora retornam vazio porque RLS exige authenticated.

**Solução:** adicionar `SUPABASE_SERVICE_ROLE_KEY=sb_secret_*` ao `.env`
(copiar de Supabase Dashboard → Settings → API → service_role key).
Atualizar `tests/cleanup.ts:getClient()` pra preferir SERVICE_ROLE_KEY quando
disponível, com fallback pra ANON.

Sub-fase 11.5 considera-se concluída — o objetivo era audit security advisors.
Pendência operacional ficou documentada pra sessão futura.
