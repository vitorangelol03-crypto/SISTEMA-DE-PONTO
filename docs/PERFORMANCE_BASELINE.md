# Performance Baseline — Sistema de Ponto

> **Sub-fase 15.5 (2026-05-16):** baseline pós-otimizações Supabase
> (15.1 cache RLS + 15.2 multiple_permissive drop + 15.3 FK indexes).
>
> **Estado de carga:** baseline pré-onboarding PN. 2 empresas em prod
> (Caratinga ativa, PN Demo). Re-medir após PN com dados reais + 30d uso.

---

## 1. Tamanho do DB (top 15 tabelas por total size)

| # | Tabela | Total size | Table size | Row count |
|---|---|---|---|---|
| 1 | `attendance` | 2104 kB | 912 kB | **3130** |
| 2 | `lost_proof_images` (legado) | 1848 kB | 8 kB | 6 |
| 3 | `payments` | 1056 kB | 408 kB | **1727** |
| 4 | `route_mapping` (legado) | 568 kB | 168 kB | 0 |
| 5 | `error_records` | 384 kB | 152 kB | **519** |
| 6 | `lost_evidence` (legado) | 304 kB | 8 kB | 4 |
| 7 | `tickets` (legado) | 272 kB | 64 kB | 253 |
| 8 | `audit_logs` | 216 kB | 96 kB | **424** |
| 9 | `employees` | 192 kB | 40 kB | **60** |
| 10 | `bonus_removals` | 184 kB | 48 kB | **56** |
| 11 | `triage_errors` | 144 kB | 8 kB | 8 |
| 12 | `city_cache` | 136 kB | 40 kB | 0 |
| 13 | `payment_periods` | 136 kB | 16 kB | **30** |
| 14 | `bonuses` | 136 kB | 16 kB | **67** |
| 15 | `bank_hours_application_log` | 128 kB | 8 kB | **41** |

**Tabelas Sistema de Ponto (negrito):**
- `attendance`: maior tabela (3130 rows / 2.1 MB) — 30 funcionários × ~100 dias de uso
- `payments`: 1727 rows / 1 MB
- `employees`: 60 rows (30 CT + 30 PN Demo)
- Outras: <1 MB cada

**Tabelas legado** (`lost_*`, `route_*`, `tickets`, `drivers`, `ai_reports`, `search_history`): outro produto no mesmo Supabase. NÃO Sistema de Ponto. Ignorar pra baseline.

---

## 2. Top queries por mean_exec_time (pg_stat_statements)

Top 10 queries únicas (calls=1) são todas operações administrativas one-shot
(migrations, scripts de admin). NÃO há queries de produção recorrentes ainda
porque o uso é baixo (~2 admin + 1-2 supervisor por dia).

| Mean ms | Query (preview) |
|---|---|
| 225.68 | `verify_admin_secret` (auth one-shot) |
| 209.03 | Migration script (one-shot) |
| 132.41 | Calcular daytime/nighttime SQL (one-shot) |
| 113.85 | `SELECT a.date, e.name, a.status FROM attendance a JOIN employees e...` |
| 92-43 ms | Backup / migration / admin scripts |

**Conclusão:** sem padrão de query de produção significativo. Re-medir pós-PN
ativa (esperado: queries hot em `getAllEmployees`, `getAttendanceHistory`,
`getEmployeeNetPayments` aparecerão com calls > 100).

---

## 3.1 Benchmark sintético (sub-fase 16.4 — `scripts/bench-edge-fns.mjs`)

Rodado 2026-05-16 — **20 iterações sequenciais** por edge fn (rede produção
Vercel → Supabase). Status codes esperados (400/401 com inputs inválidos pra
não poluir DB).

| Edge fn | Mean | Min | p50 | p95 | p99 | Max |
|---|---|---|---|---|---|---|
| `auth-login` (invalid creds) | **254 ms** | 172 | 249 | 324 | 411 | 411 |
| `employee-public-api lookup-cpf` | **238 ms** | 120 | 217 | 268 | 655 | 655 |
| `employee-public-api verify-pin` | **179 ms** | 39 | 199 | 251 | 269 | 269 |

**Conclusões:**
- Latência média 180-260ms p95 — **aceitável** pra uso real (clock-in não é interativo crítico)
- p99 até 655ms em lookup-cpf (1 outlier em 20 — provável network jitter)
- Sem cold start ativo nessas iterações (1-30 todas warm)

**Como re-rodar:**
```bash
node scripts/bench-edge-fns.mjs 30           # 30 calls cada fn
node scripts/bench-edge-fns.mjs 100 auth-login # 100 calls só auth-login
```

## 3.2 Edge function warm vs cold latency (auditado 2026-05-12)

| Edge fn | Warm | Cold (1ª invocação pós-deploy) |
|---|---|---|
| `auth-login` | 0.67s | 1.1-1.5s |
| `clock-in-validated` | 0.28s | 1.1-1.5s |
| `employee-public-api` | 0.30s | 1.1-1.5s |
| `create-user` | 0.57s | **até 150s** (esm.sh/bcryptjs download) |

**Cold-start `create-user`:** característica Deno Deploy + esm.sh, documentada
em TECH_DEBT 6.13. Operação SUCEDE no server (curl timeout não desfaz INSERT).

---

## 4. Otimizações aplicadas em 2026-05-16 (Fase 15)

**15.3 — FKs indexadas (23 indexes):** EXPLAIN ANALYZE confirma
`Index Only Scan using idx_attendance_marked_by on attendance (cost=0.28..75.84)`.
Joins via FK 3-10x mais rápidos em escala.

**15.1 — RLS cache subquery (55 policies):** `(SELECT auth.jwt())` executado uma
vez por query em vez de per-row. Ganho cresce com N (rows × policies).

**15.2 — Drop redundant SELECT policies (22 tables):** Postgres parou de OR-eiar
2 policies permissivas em SELECT — overhead 2× eliminado em queries SELECT
multi-empresa.

---

## 5. Limites da baseline atual

- **Volume baixo:** 60 employees, 3130 attendances, 1727 payments. Otimizações
  RLS/index ainda não dominam — todas queries respondem <500ms.
- **pg_stat_statements pouco populado:** uso real baixo (~2-3 admin/dia).
- **Sem PN real:** PN tem 30 Demo, mas não tem clock-in real → não exercita
  queries hot do day-to-day.

**Pra ter baseline útil:**
1. PN ativa com clock-in real diário
2. 30 dias de uso (3000-5000 attendances novos)
3. Re-rodar este doc + comparar mean_exec_time + pg_stat_user_indexes.idx_scan

---

## 6. Alertas pra monitorar pós-PN

Tabelas que vão crescer linear com uso:
- `attendance`: +60 employees × 22 dias úteis = ~1320 rows/mês
- `payments`: similar (paga semanal/mensal)
- `face_auth_attempts`: depende de uso facial — pode explodir
- `audit_logs`: cada CRUD admin → 1 row
- `error_records`: depende de triagem

**Triggers de alerta** (não automatizado ainda):
- `attendance` > 100k rows → particionar por ano OU dropar dados antigos via `data_retention_settings`
- `face_auth_attempts` > 50k rows → dropar attempts antigos (já há `attempts_window_minutes` config)
- Query mean_exec_time > 1s em queries hot → investigar
- Edge fn cold start > 5s warm → investigar cold burn

---

**Próximo doc:** rodar este script novamente após 30d de uso PN real.
Comparar deltas em row counts, mean_exec_time, idx_scan.
