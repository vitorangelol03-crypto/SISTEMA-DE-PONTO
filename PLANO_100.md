# PLANO_100.md — Roadmap pra Sistema 100% Produção

> **Plano mestre criado em 2026-05-16** (sub-fase 14.18) após análise completa
> de TECH_DEBT.md, CHECKPOINT_*.md e código atual.
>
> **Escopo:** lista exaustiva e ordenada de todas as sub-fases pendentes pra
> chegar a 100%, com estimativas de esforço, dependências e bloqueios.
>
> **Sistema técnico atual:** já está em **PRODUÇÃO** (https://sistema-ponto-zeta.vercel.app)
> com 0 ERRORs advisors, 431 unit tests, 49 specs E2E, CI 100% verde.
>
> **Última atualização:** 2026-05-16

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
| **14.18** | Análise + plano mestre PLANO_100.md | 30min | — | **EM EXECUÇÃO** |
| **14.19** | Quick win C — Flake `24-admin:49` timeout 10s→20s (TECH_DEBT 6.17) | 15min | Não | Pending |
| **14.20** | Quick win B — `validatePixKey` aceita CPF/CNPJ formatado (TECH_DEBT 6.23) + testes vitest | 45min | Não | Pending |
| **14.21** | Quick win D — Atualizar docs obsoletas (3.5 User.password já clean) + bump `chunkSizeWarningLimit` em vite.config | 20min | Não | Pending |
| **14.22** | Quick win A — Release v2.0.0-multi-tenant (CHANGELOG + tag local) | 30min | Não (mas push fica com Victor) | Pending |
| **14.23** | Checkpoint completo — atualizar CHECKPOINT.md/FASES/TECH_DEBT, validar baseline final | 20min | Não | Pending |

**Total bloco:** ~2h20.

---

### 🟡 BLOCO TECH DEBT MÉDIO — pode executar sem PN (sub-fases 14.24 → 14.27)

| Sub-fase | Item | Esforço | Bloqueia? | Notas |
|---|---|---|---|---|
| **14.24** | TECH_DEBT 6.22 Sev Alta — Estados UI cross-empresa `AttendanceTab` (`selectedEmployees`, `exitTimes`, `manualTimes`, `bonusAmounts`, `applyingBonus`, `employeeToReset`, `bonusTypeToRemove`) | ~45min | Não | useEffect[company?.id] limpa estados ID-based |
| **14.25** | TECH_DEBT 6.22 Sev Alta — Estados UI cross-empresa `FinancialTab` (`selectedEmployees`, `editingPayment`, `editValues`, `selectedPeriodId`) | ~45min | Não | Mesmo pattern |
| **14.26** | TECH_DEBT 6.22 Sev Alta — Estados UI cross-empresa `DataManagementTab` (wizard state) | ~30min | Não | Mesmo pattern |
| **14.27** | TECH_DEBT 6.25 — UX mobile (`aria-label="Sair"`, helpers detect viewport pra hamburger, unificar duplicação `Admin/Administrador`) | ~3-4h | Não | Habilita suite mobile completa |

**Total bloco:** ~5-6h.

---

### 🟢 BLOCO ESTABILIDADE TESTES — pode executar sem PN (sub-fases 14.28 → 14.29)

| Sub-fase | Item | Esforço | Notas |
|---|---|---|---|
| **14.28** | TECH_DEBT 6.1 — Flake helper `importC6` em `tests/20-c6-complete.spec.ts:39` (toast `/importado/` race) | ~1h | Substituir `getByText` por aguardar evento DB direto |
| **14.29** | TECH_DEBT 6.24 — `AttendanceTab.loadData` refetch live via Supabase Realtime subscription | ~1 dia | Custo maior — postponed natural |

**Total bloco:** ~1-2 dias (14.29 é o pesado).

---

### 🚀 BLOCO ONBOARDING + RELEASE PUSH — BLOQUEADO por Victor (sub-fases 14.30 → 14.32)

| Sub-fase | Item | Bloqueio | Esforço |
|---|---|---|---|
| **14.30** | Import planilha real Ponte Nova (~30 funcionários) | **Victor mandar planilha** | ~30min execução |
| **14.31** | Smoke test PN pós-import (1 funcionário marca ponto + geo bloqueio + face) | Depende 14.30 | ~15min |
| **14.32** | Push tag `v2.0.0-multi-tenant` pro remoto + GitHub Release publicada | **Victor (push manual)** | ~10min |

---

### 🟢 BLOCO PERFORMANCE — pós-onboarding PN (Fase 15)

| Sub-fase | Item | Esforço | Justificativa |
|---|---|---|---|
| **15.1** | Fix `auth_rls_initplan` (53 policies — `auth.jwt() ->> 'company_id'` → `(SELECT auth.jwt() ->> 'company_id')`) | ~2-3h | Cache JWT por query |
| **15.2** | Fix `multiple_permissive_policies` (43 — combinar 2 policies por tabela em 1) | ~1-2h | Reduz OR-eval Postgres |
| **15.3** | Indexar 23 FKs sem index | ~30min | Joins mais rápidos |
| **15.4** | Drop 28 unused indexes (após validar `idx_scan = 0` >30d em prod) | ~30min | Reduz write overhead |
| **15.5** | Performance baseline pós-otimização (queries lentas, edge fn warm vs cold) | ~1h | Métricas em `/tmp/perf-baseline.md` |

**Total Fase 15:** ~4-7h.

**Nota:** trigger pra Fase 15 é **dados reais PN + 30 dias de uso** pra `idx_scan` significativo.

---

### 🧪 BLOCO COBERTURA POSTPONED — pós-go-live (Fase 16)

| Sub-fase | Item | Esforço | Trigger |
|---|---|---|---|
| **16.1** | Spec FaceRegistration (face-api.js + getUserMedia mock pesado) | ~6-8h | Feedback usuários (falsos negativos face) |
| **16.2** | Browser compat (Firefox/Safari projects no Playwright) | ~2h | Reports de bug Firefox/Safari |
| **16.3** | Spec supervisor com `permissions.users.create` | ~1h | Cenário descoberto em fase 14 |
| **16.4** | Performance benchmarks (k6 ou Playwright) | ~1 dia | Dados reais PN |
| **16.5** | Backup/restore drill operacional (script + agenda mensal) | ~3-4h | Pós-go-live estável |

**Total Fase 16:** ~2-3 dias.

---

### 🔮 BLOCO ROADMAP FEATURES — não-bloqueante (Fase 17+)

| Sub-fase | Item | Esforço | Pré-requisitos |
|---|---|---|---|
| **17.1** | APK Android via Capacitor (sub-fase 15 do plano original) | ~4 dias | Android Studio instalado + Victor decide senha keystore |
| **17.2** | Export PDF holerite | ~1 dia | Demanda funcionário |
| **17.3** | Reset facial automático após N tentativas falhas | ~半 dia | Feedback usuários |
| **17.4** | Push notifications server→device (Firebase) | ~1-2 dias | Projeto Firebase + decisão de produto |
| **17.5** | Multi-idioma (i18n) | ~3-5 dias | Expansão geográfica |
| **17.6** | API pública pra integrações ERP | ~5-10 dias | Demanda enterprise |

**Total roadmap features:** ~3 semanas se tudo for feito.

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

### Hoje (sessão atual — sub-fases 14.18 → 14.23):
1. ✅ 14.18 — PLANO_100.md criado (este arquivo)
2. ⏳ 14.19 — Quick win C (timeout flake)
3. ⏳ 14.20 — Quick win B (validatePixKey)
4. ⏳ 14.21 — Quick win D (docs obsoletas + chunk warning)
5. ⏳ 14.22 — Quick win A (release v2.0.0)
6. ⏳ 14.23 — Checkpoint completo

**Tempo total estimado:** ~2h10.

### Próxima sessão (sub-fases 14.24 → 14.27):
- Bloco TECH DEBT MÉDIO (estados UI cross-empresa + mobile UX)
- **Tempo total:** ~5-6h, pode ser dividido em 2 sessões

### Quando Victor mandar planilha PN:
- 14.30 — Import
- 14.31 — Smoke test
- 14.32 — Push tag + GitHub Release

### Pós-go-live estabilizado (30 dias com dados reais):
- Fase 15 — Performance advisors
- Fase 16 — Cobertura postponed

### Roadmap features (sem trigger):
- Fase 17 — APK Android, export PDF, etc.

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
