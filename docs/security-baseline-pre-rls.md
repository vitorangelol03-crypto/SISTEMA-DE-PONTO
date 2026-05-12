# Security Baseline — Pré-Fase 11

> Snapshot dos advisors do Supabase ANTES do hardening RLS.
> Capturado em 2026-05-11 via `mcp__claude_ai_Supabase__get_advisors`.
> Project: `flcncdidxmmornkgkfbb`.

## Resumo numérico

| Tipo | ERROR | WARN | INFO | Total |
|---|---|---|---|---|
| Security | 67 | 18 | 0 | 85 |
| Performance | 0 | 20 | 87 | 107 |

## Security ERRORs críticos

### `rls_disabled_in_public` — 64 tabelas

**Core do Sistema de Ponto (32 tabelas) — alvo da Fase 11:**

| Categoria | Tabelas |
|---|---|
| Operacional | `attendance`, `employees`, `payments`, `bonuses`, `bonus_blocks`, `bonus_removals`, `error_records`, `geo_fraud_attempts`, `triage_errors`, `triage_distribution_employees`, `triage_error_distributions` |
| Config / Multi-empresa | `companies`, `bonus_types`, `payment_periods`, `payment_period_config`, `geolocation_config`, `face_recognition_config`, `admin_cleanup_config`, `data_retention_settings`, `auto_cleanup_config` |
| Auth / Admin | `users`, `admin_secret`, `user_permissions`, `permission_logs` |
| Audit / Logs | `audit_logs`, `activity_logs`, `error_logs`, `admin_cleanup_logs`, `cleanup_logs` |
| Bank hours | `bank_hours_overrides`, `bank_hours_application_log` |
| Face auth | `face_auth_attempts` |

**Backup do Sistema de Ponto (32 tabelas):**
- `backup_attendance_*` (8 datas), `backup_payments_*` (6), `backup_bonuses_*` (2)
- `backup_pre_v2_*` (8 tabelas — incluindo `backup_pre_v2_users` que **expõe `password`**)
- `backup_errors_*`, `backup_triage_errors_*`, `backup_geo_fraud_attempts_*`, `backup_companies_pre_etapa2`, `backup_employees_pre_etapa2`, `backup_error_records_*`

### `sensitive_columns_exposed` — 2 tabelas (PASSWORD EXPOSTO)

| Tabela | Tipo | Solução proposta |
|---|---|---|
| `public.users` | core ativa | sub-fase 11.3 (DROP COLUMN password após bcrypt) |
| `public.backup_pre_v2_users` | backup antigo | dropar tabela inteira em 11.0 |

### `security_definer_view` — 1

- `public.lost_driver_summary` — **view de projeto LEGADO** ("objetos perdidos" — drivers, routes, lost_*, ai_reports). Não relacionado ao Sistema de Ponto.

### Tabelas legado (não-Ponto) — 15 com `rls_policy_always_true USING(true)`

Sistema parecido com tracking de "objetos perdidos" compartilhando o mesmo Supabase:
- `ai_reports`, `city_cache`, `dashboard_meta`, `driver_overrides`, `driver_route_links`, `drivers`, `lost_evidence`, `lost_proof_images`, `lost_proof_requests`, `lost_reports`, `route_groups`, `route_mapping`, `routes`, `search_history`, `tickets`

**Decisão pendente:** ignorar (escopo só do Ponto) OU isolar via schema separado.

## Security WARNs

### `function_search_path_mutable` — 1
- `public.update_lost_reports_updated_at` (legado)

### `*_security_definer_function_executable` — 1 (count 2 lints)
- `public.apply_bank_hours_to_payment(uuid,uuid,uuid,uuid,uuid,boolean)` — SECURITY DEFINER executável por `anon` E `authenticated`. **Vulnerabilidade introduzida em sub-fase 8.5.** Mitigação atual: função valida `company_id` interno via comparação com `payments.company_id`. Mesmo assim, ideal restringir GRANTs a `service_role` ou role admin.

### `rls_policy_always_true` — 15 (todas legado)

Listadas acima.

## Performance — sem ERRORs, 20 WARNs aceitáveis

- 20 `multiple_permissive_policies` (todos em tabelas legado: ai_reports, drivers, route_groups, search_history)
- 32 `no_primary_key` (TODAS tabelas `backup_*` — esperado, sem PK em snapshots)
- 23 `unindexed_foreign_keys` (não-críticos — FKs de auditoria como `created_by_fkey`, raramente consultadas como FK)
- 31 `unused_index` (esperado pós-migração multi-empresa — índices `idx_*_company_id` aguardando uso real)
- 1 `auth_db_connections_absolute` (config Supabase Auth, não-app)

## Próximos passos (Fase 11)

1. **11.0 (em progresso):** decidir destino de backup_* (drop?) e legado (ignorar?). Documentar.
2. **11.1:** RLS enable nas 32 core (deny-all temporário).
3. **11.2:** Policies via `current_company_id()` (SECURITY DEFINER + sessão).
4. **11.3:** Hash bcrypt + DROP COLUMN password (DESTRUTIVO — backup JSON local antes).
5. **11.4:** verify_jwt em clock-in-validated v7.
6. **11.5:** Audit final — alvo 0 ERROR (de 67 atual).

## Backup strategy

- **11.1/11.2:** REVERSÍVEL (ALTER TABLE DISABLE / DROP POLICY). Sem necessidade de backup específico.
- **11.3 DROP COLUMN password:** IRREVERSÍVEL. **Backup JSON local obrigatório** antes:
  ```sql
  SELECT id, password FROM users WHERE password IS NOT NULL;
  -- → salvar em docs/backup-users-passwords-2026-05-11.json
  SELECT id, password_hash FROM admin_secret;
  -- → salvar em docs/backup-admin-secret-2026-05-11.json
  ```
- **Branch Supabase (`create_branch`):** NÃO faz backup de dados — só replica migrations. Não serve como rollback de dados.
