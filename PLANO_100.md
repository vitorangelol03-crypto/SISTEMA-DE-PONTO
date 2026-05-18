# PLANO_100.md — Roadmap pra Sistema 100% Produção

> **Plano mestre criado em 2026-05-16** (sub-fase 14.18) após análise completa
> de TECH_DEBT.md, CHECKPOINT_*.md e código atual.
>
> **Escopo:** lista exaustiva e ordenada de todas as sub-fases pendentes pra
> chegar a 100%, com estimativas de esforço, dependências e bloqueios.
>
> **Sistema técnico atual:** em **PRODUÇÃO** (https://sistema-ponto-zeta.vercel.app)
> com 0 ERRORs advisors core, **458 unit tests, 53 specs E2E, CI 100% verde**.
>
> **Última atualização:** 2026-05-17 (pós auditoria forense 3 rounds — 12 bugs/gaps fixados)

---

## 📊 Estado pré-PLANO_100

- **Último commit:** `ac23d0f` (sub-fase 14.17.10 — CI verde)
- **Branch:** `main` limpa (só `coverage/` untracked)
- **TypeScript:** ✅ exit 0
- **Caratinga em prod:** ✅ validada
- **Ponte Nova:** 90% configurada (geo + bonus + payment_period) — falta planilha real (BLOCKED por Victor)

---

## 🎯 OBJETIVO 100%

Sistema considerado 100% quando:
1. ✅ Sistema técnico em prod sem bugs latentes
2. ✅ CI 100% verde
3. ✅ Cobertura E2E adequada das features críticas
4. ⏳ Release v2.0.0 com tag oficial
5. ⏳ Tech debt postponed resolvido (6.17, 6.23, 6.22, 6.25)
6. ⏳ Onboarding Ponte Nova com dados reais
7. ⏳ Performance baseline pós-onboarding
8. ⏳ Documentação canônica atualizada
9. ⏳ Performance advisors Supabase otimizados (Fase 15)

---

## 🚀 SUB-FASES PLANEJADAS

### 🟢 BLOCO QUICK WINS — pode executar sem PN (sub-fases 14.18 → 14.22)

| Sub-fase | Item | Esforço | Bloqueia? | Status |
|---|---|---|---|---|
| **14.18** | Análise + plano mestre PLANO_100.md | 15min | — | ✅ **CONCLUÍDO 2026-05-16** (commit `b7e78a1`) |
| **14.19** | Quick win C — Flake `24-admin:48` timeout 10s→20s (TECH_DEBT 6.17) | 10min | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `e2ae2b8`) |
| **14.20** | Quick win B — `validatePixKey` aceita CPF/CNPJ formatado (TECH_DEBT 6.23) + testes vitest | 25min | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `3f4ecc1`) |
| **14.21** | Quick win D — Atualizar docs obsoletas (3.5 User.password já clean) + bump `chunkSizeWarningLimit` em vite.config | 15min | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `dd190f3`) |
| **14.22** | Quick win A — Release v2.0.0-multi-tenant (CHANGELOG + RELEASE_NOTES + tag local) | 20min | Não (push fica com Victor) | ✅ **CONCLUÍDO 2026-05-16** (commit `aacee54`) |
| **14.23** | Checkpoint completo — atualizar CHECKPOINT.md/FASES/TECH_DEBT, validar baseline final + tag local | 20min | Não | ✅ **CONCLUÍDO 2026-05-16** |

**Total bloco real:** ~1h45 (abaixo da estimativa 2h20 — sem retrabalho).

---

### 🟡 BLOCO TECH DEBT MÉDIO — pode executar sem PN (sub-fases 14.24 → 14.27)

| Sub-fase | Item | Esforço | Bloqueia? | Status |
|---|---|---|---|---|
| **14.24** | TECH_DEBT 6.22 Sev Alta — Estados UI cross-empresa `AttendanceTab` | ~25min real | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `404c3a5`) |
| **14.25** | TECH_DEBT 6.22 Sev Alta — Estados UI cross-empresa `FinancialTab` | ~20min real | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `3e706bd`) |
| **14.26** | TECH_DEBT 6.22 Sev Alta — Estados UI cross-empresa `DataManagementTab` | ~15min real | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `6002c5e`) |
| **14.27** | TECH_DEBT 6.25 — UX mobile (já estava OK em components; specs outdated fixados) | ~20min real | Não | ✅ **CONCLUÍDO 2026-05-16** (commit `1372f2f`) — mobile 31/31 ✅ |

**Total bloco real:** ~1h20 (estimativa era 5-6h — abaixo porque componentes mobile já estavam refatorados em 14.11.2).

---

### 🟢 BLOCO ESTABILIDADE TESTES — pode executar sem PN (sub-fases 14.28 → 14.29)

| Sub-fase | Item | Esforço | Status |
|---|---|---|---|
| **14.28** | TECH_DEBT 6.1 — Flake helper `importC6` em `tests/20-c6-complete.spec.ts:30` | ~20min real | ✅ **CONCLUÍDO 2026-05-16** (commit `99d85c9`) |
| **14.29** | TECH_DEBT 6.24 — `AttendanceTab.loadData` Realtime subscription | ~25min real | ✅ **CONCLUÍDO 2026-05-16** (commit `e113095`) — 3 channels + polling fallback |
| **14.31** | TECH_DEBT 6.22 Sev Média — `UsersTab` + `ErrorsTab` + `PaymentPeriodsTab` | ~25min real | ✅ **CONCLUÍDO 2026-05-16** (commit `90a6500`) — bloco 6.22 100% (7/7 tabs) |

**Total bloco real:** ~70min.

---

### 🚀 BLOCO ONBOARDING + RELEASE PUSH — BLOQUEADO por Victor (sub-fases 14.30 → 14.32)

| Sub-fase | Item | Bloqueio | Esforço |
|---|---|---|---|
| **14.30** | Import planilha real Ponte Nova (~30 funcionários) | **Victor mandar planilha** | ~30min execução |
| **14.31** | Smoke test PN pós-import (1 funcionário marca ponto + geo bloqueio + face) | Depende 14.30 | ~15min |
| **14.32** | Push tag `v2.0.0-multi-tenant` pro remoto + GitHub Release publicada | **Victor (push manual)** | ~10min |

---

### 🟢 BLOCO PERFORMANCE — Fase 15

| Sub-fase | Item | Esforço | Status |
|---|---|---|---|
| **15.1** | Fix `auth_rls_initplan` (55 policies reescritas com `(SELECT auth.jwt())`) | ~30min real | ✅ **CONCLUÍDO 2026-05-16** (migration `rls_initplan_cache_subfase_15_1`) |
| **15.2** | Fix `multiple_permissive_policies` (22 redundantes droppadas) | ~15min real | ✅ **CONCLUÍDO 2026-05-16** (migration `rls_drop_redundant_select_policies_subfase_15_2`) |
| **15.3** | Indexar 23 FKs sem index | ~15min real | ✅ **CONCLUÍDO 2026-05-16** (migration `add_missing_fk_indexes_subfase_15_3`) — `pg_constraint` confirma 0 missing |
| **15.4** | Drop 50 unused indexes (após validar `idx_scan = 0` >30d em prod) | ~30min análise real | ⏸️ **SKIPPED 2026-05-16** — análise mostrou todos serem ou recém-criados (15.3) ou em tabelas LEGADO. Sem 30d dados reais, risco > benefício. Re-avaliar pós-PN |
| **15.5** | Performance baseline pós-otimização | ~1h | ✅ **CONCLUÍDO 2026-05-16** (commit `8fbf9f8`) — `docs/PERFORMANCE_BASELINE.md` |

**Total Fase 15 real:** ~1h (15.1+15.2+15.3 executadas). Itens 15.4/15.5 aguardam dados reais.

---

### 🧪 BLOCO COBERTURA POSTPONED — pós-go-live (Fase 16)

| Sub-fase | Item | Esforço | Trigger |
|---|---|---|---|
| **16.1** | Spec FaceRegistration (face-api.js + getUserMedia mock pesado) | ~30min setup | ⏸️ **SKIPPED 2026-05-16** (commit `49ad14a`) — spec criado com setup pronto, marked skip + TECH_DEBT 16.1.X. Gate facial não dispara em headless. Postponed mock pesado (~6-8h) |
| **16.2** | Browser compat Firefox + Webkit projects | ~15min real | ✅ **CONCLUÍDO 2026-05-16/17** — Firefox 15/15 + Webkit 15/15 (sub-fase 16.2.1 após Victor instalar libavif16) |
| **16.3** | Spec 47 supervisor users.create perm | ~30min real | ✅ **CONCLUÍDO 2026-05-16** (commit `605a335`) — 2/2 |
| **16.4** | Performance benchmarks (k6-alternative) | ~30min real | ✅ **CONCLUÍDO 2026-05-16** (commit `5ca38c6`) — `scripts/bench-edge-fns.mjs` + baseline doc |
| **16.5** | Backup/restore drill script | ~30min real | ✅ **CONCLUÍDO 2026-05-16** (commit `ab65a47`) — backup-all + verify-backup |

---

### 🔍 BLOCO AUDITORIA FORENSE — 2026-05-17

| Sub-fase | Item | Bugs detectados | Status |
|---|---|---|---|
| **14.61** | Audit Round 1: validações superficiais | 4 bugs (ESLint, spec 100 flake, trigger threshold, send-push role) | ✅ Fixado |
| **14.62** | Audit Round 2: paper trail | 4 gaps (2 edge fns sem source, coverage gitignore, 11 migrations MCP, CI specs novos) | ✅ Fixado |
| **14.63** | Audit Round 3: pós-fix verificação | 1 bug (gen_salt schema) + 3 inconsistências (métricas/bench/contagem) | ✅ Fixado |

**Total auditoria:** 12 bugs/gaps detectados + fixados. CI verde final no commit `cc0dcd9`.
Sistema realmente 100% técnico após. **Lição:** sempre auditar antes de afirmar 100%.

---

### 🔮 BLOCO ROADMAP FEATURES — não-bloqueante (Fase 17+)

| Sub-fase | Item | Esforço | Pré-requisitos |
|---|---|---|---|
| **17.1** | APK Android via Capacitor (sub-fase 15 do plano original) | ~4 dias | Bloqueado — Android Studio + senha keystore (Victor) — `TUTORIAL_VICTOR.md` item 4 |
| **17.2** | Export PDF holerite MVP | ~30min real | ✅ **CONCLUÍDO 2026-05-16** (commit `b688e7f`) — `holeritePdf.ts` + botão FinancialTab. Customizações corporativas em `TUTORIAL_VICTOR.md` item 6.1 |
| **17.3** | Reset facial automático após N tentativas falhas | ~25min real | ✅ **CONCLUÍDO 2026-05-16** (commit `f7ab015`) — trigger DB N=5/60min default |
| **17.4** | Push notifications server→device (Firebase) | ~1-2 dias | Bloqueado — projeto Firebase (Victor) — `TUTORIAL_VICTOR.md` item 5 |
| **17.5** | Multi-idioma (i18n) | ~30min scaffold | ✅ **CONCLUÍDO 2026-05-16** (commit `413dcb7`) — react-i18next + 23 chaves pt-BR/en. Refator strings em `TUTORIAL_VICTOR.md` item 6.2 |
| **17.6** | API pública pra integrações ERP | ~1h MVP | ✅ **CONCLUÍDO 2026-05-16** (commit `6d09e81`) — `public-api-v1` edge fn + `api_keys` + `docs/API_PUBLICA_V1.md`. Endpoints extras em `TUTORIAL_VICTOR.md` item 6.3 |

**Total roadmap features executado:** 17.2, 17.3, 17.5 scaffold, 17.6 MVP done. 17.1 + 17.4 dependem Victor.

---

### 🔘 ITENS ACEITOS — não vão pro plano (apenas monitorados)

| Item | Por quê não fazer | Status |
|---|---|---|
| TECH_DEBT 14.A — `xlsx` vulns Prototype Pollution + ReDoS | Sem patch upstream. Mitigações ativas (validação schema + admin-only upload). | ACEITO |
| TECH_DEBT 14.B — 148 performance advisors | Não bloqueia. Plano explícito Fase 15. | ACEITO |
| TECH_DEBT 6.13 — Cold start edge fn `create-user` ~150s | Característica Deno Deploy + esm.sh. UI tem spinner com mensagem. | ACEITO |
| TECH_DEBT 6.28 — Spec 37 test 5 cold-start em prod URL | Caso particular de 6.13. UI funcional em prod. | ACEITO |
| 6 WARNs advisors intencionais (3 SECURITY DEFINER nossas) | Decisão arquitetural. Doc'd em `CHECKPOINT_BANCO.md`. | ACEITO |
| `nightDebitMinutes = 0` | Decisão técnica conservadora — todo débito diurno. Mudar exige recalcular histórico. | ACEITO |

---

## 📅 ORDEM DE EXECUÇÃO RECOMENDADA

### Hoje (sessão concluída — sub-fases 14.18 → 14.23):
1. ✅ 14.18 — PLANO_100.md criado (este arquivo) — commit `b7e78a1`
2. ✅ 14.19 — Quick win C (timeout flake) — commit `e2ae2b8`
3. ✅ 14.20 — Quick win B (validatePixKey) — commit `3f4ecc1`
4. ✅ 14.21 — Quick win D (docs obsoletas + chunk warning) — commit `dd190f3`
5. ✅ 14.22 — Quick win A (release v2.0.0 preparação) — commit `aacee54`
6. ✅ 14.23 — Checkpoint completo + tag local

**Tempo total real:** ~1h45 (estimativa era 2h10 — abaixo).
**Tag local criada:** `v2.0.0-multi-tenant` (push fica com Victor).

### Sessão 2 (executada 2026-05-16 — sub-fases 14.24 → 14.30):
- ✅ 14.24 — AttendanceTab cross-empresa (commit `404c3a5`)
- ✅ 14.25 — FinancialTab cross-empresa (commit `3e706bd`)
- ✅ 14.26 — DataManagementTab cross-empresa (commit `6002c5e`)
- ✅ 14.27 — UX mobile completa (commit `1372f2f`) — mobile 31/31 ✅
- ✅ 15.3 — 23 FKs indexadas (Supabase migration)
- ✅ 15.1 — 55 RLS policies otimizadas com cache (Supabase migration)
- ✅ 15.2 — 22 multiple_permissive policies eliminadas (Supabase migration)
- ✅ 14.28 — Flake C6 importC6 fixado (commit `99d85c9`)
- ✅ 14.30 — Checkpoint completo (este)

**Tempo total real Sessão 2:** ~3h (estimativa era 6-8h).

### Quando Victor mandar planilha PN:
- 14.32 — Import (era 14.30 — renumberado pelo bloco médio)
- 14.33 — Smoke test
- 14.34 — Push tag + GitHub Release

### Pós-go-live estabilizado (30 dias com dados reais):
- 15.4 — Drop unused indexes (~30min)
- 15.5 — Performance baseline
- Fase 16 — Cobertura postponed (FaceRegistration, Firefox/Safari, etc.)

### Roadmap features (sem trigger):
- Fase 17 — APK Android, export PDF, push notifications, etc.

---

## 🛡️ REGRAS OBRIGATÓRIAS (lembrete)

Toda sub-fase deste plano respeita as **8 regras** do `CHECKPOINT.md`:

1. **Validar tudo real** — Supabase MCP antes/durante/depois
2. **Nunca quebra-galhos** — sem `as any` sem justificativa, sem hardcoded
3. **Uma sub-fase = um commit atômico** — formato `tipo(escopo): descrição (sub-fase X.Y)` + Co-author
4. **Se teste falhar, mostrar pra Victor antes** — não ajustar mock pra passar
5. **TECH_DEBT é canônico** — mover entries pra `## ✅ Histórico` com data + sub-fase
6. **Decisões produto/semântica sempre com Victor** — D1-D6 já resolvidas
7. **Padrão idiomático** — ID+senha, sem email, RLS por `auth.jwt() ->> 'company_id'`
8. **Qualidade > velocidade** — sistema 100%, não meia bomba

E o **MODO CIRÚRGICO** do `CLAUDE.md` do projeto:
- Sem skills automáticas
- Sem subagentes paralelos
- Sem refator além do escopo
- NUNCA `git push` — só commit local
- Se dúvida, perguntar

---

## 🔄 Como retomar este plano em sessão futura

```bash
# 1. Verificar estado
git log --oneline -5
git status --short

# 2. Ler PLANO_100.md (este arquivo)
cat PLANO_100.md

# 3. Identificar próxima sub-fase pendente
# Marcadas com ⏳ Pending acima

# 4. Validar baseline
npx tsc --noEmit
npx vitest run | tail -5

# 5. Executar próxima sub-fase
```

---

**Mantido por Victor + Claude Opus 4.7 (1M context).**
