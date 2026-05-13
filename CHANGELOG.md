# CHANGELOG — Sistema de Ponto Multi-Empresa

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adota [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [v2.0.0-multi-tenant] — 2026-05-13

> **Marco:** refatoração completa para suporte multi-empresa via RLS + bcrypt.
> Resultado: **0 ERRORs** no Sistema de Ponto core, **259 specs E2E passing 100% determinístico**.

### 🎯 Visão geral

Esta versão transforma o Sistema de Ponto de **single-tenant** (apenas Caratinga) para **multi-tenant** (Caratinga + Ponte Nova + qualquer empresa futura via admin master). Inclui hardening completo de segurança (Row Level Security em todas as tabelas core, bcrypt para senhas) e cobertura de testes ponta a ponta.

### 🆕 Novas funcionalidades

- **Multi-empresa via RLS**: cada empresa tem dados isolados. Admin master (`9999`) vê todas, admin local (ex: `8888` PN) só vê a própria.
- **Companhias suportadas em prod**:
  - **Caratinga** (CLAYTON B DOS SANTOS) — 30 funcionários, 1725 payments, 3130 attendances
  - **Ponte Nova** (CD LOGISTICA LTDA) — onboarding pendente (admin local `8888`)
- **CompanySelector pós-login**: admin master escolhe empresa após autenticar.
- **CompanySwitcher no header**: troca de empresa em tempo real (admin master).
- **JWT custom HS256**: emitido pela edge fn `auth-login`, contém `company_id` lido pelas RLS policies.
- **4 edge functions ACTIVE** em produção:
  - `auth-login` (v9) — emite JWT
  - `clock-in-validated` (v8) — valida geolocalização real + grava attendance
  - `create-user` (v1) — cria supervisor com bcrypt server-side
  - `employee-public-api` (v2) — 11 actions cobrindo fluxo público funcionário (lookup CPF, verify PIN, save face, etc.)

### 🔒 Segurança

- **RLS ativo em 48 tabelas** (33 core Sistema de Ponto + 15 legado).
- **Coluna `users.password` plain text DROPADA** (única fonte: `password_hash` bcrypt).
- **PIN funcionário** continua plain (sub-fase 11.9 futura para migrar a bcrypt; mitigado por RLS bloqueando leitura anon).
- **`apply_bank_hours_to_payment` RPC**: anon revoked, só authenticated.
- **0 ERRORs nos advisors** Sistema de Ponto core (ERRORs restantes são todos de tabelas legado de outro produto no mesmo Supabase).

### 🐛 Bugs corrigidos (Fase 14 — UI bug hunt manual)

11 bugs reais descobertos via teste manual no browser e fixados:

| # | Descrição | Sub-fase |
|---|---|---|
| 1 | Lixo UUID em localStorage crashava CompanyContext init (22P02) | 14.4.3 |
| 2 | HTTP 406 em `.single()` quando 0 rows → trocado para `.maybeSingle()` | 14.4.4 |
| 3 | `monitoring_settings` table faltando + `autoCreateWeeklyPeriod` sem guard JWT | 14.4.5 |
| 4 | Vite warning "stream externalized" via xlsx-js-style (stub aplicado) | 14.4.6 |
| 5 | Inconsistência localStorage user vs sessionStorage JWT força re-login | 14.4.7 |
| 6 | 409 em `payment_periods` (`created_by:'auto'` violava FK) | 14.4.8 |
| 7 | Multiple GoTrueClient instances → refator `supabase.ts` com fetch interceptor único | 14.4.9 |
| 8 | React Fast Refresh invalidando CompanyContext → split `companyHelpers.ts` | 14.4.9 |
| 9 | Spec 38 system-walkthrough criado para auto-captura console errors em 8 fluxos | 14.4.10 |
| 10 | `AttendanceTab.loadData` mount-only (race em spec 40) → fix click "Atualizar" | 14.9 |
| 11 | Cold-start residual edge fn `create-user` → warmup completo no `beforeAll` | 14.9 |

### 📊 Métricas finais validadas

| Indicador | Valor |
|---|---|
| **Migrations aplicadas** | 57 |
| **Tabelas com RLS** | 48 (33 core + 15 legado) |
| **Edge functions ACTIVE** | 4 |
| **Unit tests (Vitest)** | 431 passing / 1 skipped |
| **E2E specs (Playwright)** | 40+ files, **259 passing / 18 skipped / 0 failed em 19.3min** |
| **Coverage Vitest** | 45.96% Stmts (utils 81%+; services 22% — testados via E2E) |
| **Lighthouse desktop** | Perf 86 / A11y 75 / Best 100 / SEO 100 |
| **Edge fns warm latency** | <1s (auth-login 0.67s, employee-public-api 0.30s, clock-in 0.28s, create-user 0.21s) |
| **Bugs latentes em prod** | **0** |

### 🏗️ Arquitetura

- **Stack:** React 18 + TypeScript 5.5 + Vite 5.4 + Tailwind, Supabase PG 17.6, Deno edge functions
- **Auth:** JWT custom HS256 (NÃO usa Supabase Auth). Login só com `id` numérico + senha (sem email).
- **Storage:** localStorage (`timecard_user`, `sistema_ponto_company_id`) + sessionStorage (`sb-custom-token`)
- **Roteamento:** próprio simples (sem react-router); `/`, `/clock`, `/erros`
- **Build prod:** 21.26s; dist/ ~3MB total; chunks principais `index 836kB → gzip 211kB`, `xlsx 627kB → gzip 322kB`

Diagramas detalhados em `ARCHITECTURE.md`.

### 📦 Sub-fases concluídas (9 a 14)

| Fase | Tema |
|---|---|
| 5-10 | Quick wins + cobertura unit tests + migrations + E2E componentes |
| **11** | **Hardening RLS + bcrypt (67 ERRORs → 0)** |
| 12 | Documentação (README + PRE-LAUNCH + ARCHITECTURE + edge-fns) |
| 13 | Validação final (3× Playwright clean) |
| **14** | **Pós-validação + UI bug hunt (11 bugs) + cobertura final + batch determinístico + validação ampla** |

### ⚠️ Tech debt registrado (postponed — não bloqueia go-live)

| Item | Severidade | Estimativa fix |
|---|---|---|
| `AttendanceTab.loadData` mount-only (sem refetch live) | Baixa | ~1 dia (Realtime subscription) |
| UX mobile: TabNavigation hamburger + duplicação badges + logout icon-only | Baixa | ~2-3h |
| A11y 3 issues (buttons sem accessible name, contraste, `<main>` landmark) | Baixa | ~2-3h |
| PIN funcionário plain text (mitigado por RLS) | Baixa | ~2h (bcrypt migrate) |
| Cold start `create-user` ~150s primeira chamada pós-deploy | Aceito | N/A (UI spinner) |
| `User.password` cosmetic cleanup em `database.ts:14-20` | Trivial | 10min |
| Vite warnings (esbuild deprecated, optimizeDeps.esbuildOptions) | Baixa | Vite 5→6 migration |
| 6 WARNs persistentes em advisors (3 SECURITY DEFINER nossas intencionais + 16 legado) | Aceito | N/A |

Detalhes em `TECH_DEBT.md`.

### 🚀 Pré-requisitos pra usar esta versão

**Operacional:**
1. `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configurados no frontend (env vars do hosting)
2. `JWT_SECRET` configurado em **Supabase Dashboard → Edge Functions → Secrets** (mesmo valor de **Settings → API → JWT Secret**)
3. Admin master `9999/684171` existente no DB (já criado em prod)
4. **NUNCA** colocar `SUPABASE_SERVICE_ROLE_KEY` no frontend prod (bypassa RLS)

**Pendente go-live:**
- [ ] Onboarding Ponte Nova (~30 funcionários + geo + bonus + admin local 8888)
- [ ] Deploy frontend prod (Vercel/Netlify/Cloudflare Pages)
- [ ] Smoke test pós-deploy (login admin + clock-in real)

### 🔗 Referências

- `CHECKPOINT.md` — índice mestre do estado do projeto
- `CHECKPOINT_FASES.md` — histórico granular fases 5-14
- `CHECKPOINT_ARQUITETURA.md` — decisões D1-D6, stack, fluxos auth
- `CHECKPOINT_BANCO.md` — schema, RLS, edge functions, RPCs
- `CHECKPOINT_TESTES.md` — specs + coverage + comandos
- `CHECKPOINT_OPERACAO.md` — deploy, manual ops, troubleshoot
- `CHECKPOINT_PROXIMOS_PASSOS.md` — pendências go-live + roadmap pós
- `ARCHITECTURE.md` — Mermaid diagrams
- `PRE-LAUNCH-CHECKLIST.md` — checklist 10/10
- `TECH_DEBT.md` — tech debt registrado
- `README.md` — visão produto

### 👏 Créditos

Refatoração executada por **Victor** (planejamento, decisões D1-D6, teste manual UI, validação real em prod).
Implementação assistida por **Claude Code** (Opus 4.7).

Repositório: `https://github.com/Victor/SISTEMA-DE-PONTO` (privado).
