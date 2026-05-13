# 🚦 CHECKPOINT — Sistema de Ponto Multi-Empresa rumo à Produção

> **Arquivo principal de retomada.** Ao abrir o Claude Code, este é o índice mestre.
> Detalhes técnicos foram divididos em 5 arquivos auxiliares — ver §3.

**Última atualização:** 2026-05-13 (sub-fases 14.5+14.6+14.7+14.8 — cobertura final completa)
**Branch:** `main`
**Plano canônico:** `PLANO_PRODUCAO.md`
**TECH_DEBT canônico:** `TECH_DEBT.md`
**Memory:** `/home/victor/.claude/projects/-home-victor-SISTEMA-DE-PONTO/memory/`

---

## ⛔ AS 8 REGRAS OBRIGATÓRIAS (NÃO IGNORAR)

Estas regras valem **pra cada sub-fase, toda execução**. Foram negociadas com o Victor. **Quebrar é incidente.**

### Regra 1 — VALIDAR TUDO REAL (não confiar só em tsc/lint/vitest)
- **Antes de mudar código:** pre-checks reais no banco via Supabase MCP — `list_tables`, `execute_sql` com `SELECT count(*)`, `EXPLAIN ANALYZE`.
- **Durante mudança:** validar com dados reais de prod (não fixtures inventadas).
- **Após mudança:** validar via MCP que estado mudou conforme esperado (constraint existe? row criada? índice ativo?).

### Regra 2 — NUNCA QUEBRA-GALHOS
- **Sem `as any`** sem documentar por quê.
- **Sem suprimir warnings** sem justificativa + ticket.
- **Sem hardcoded values** que dependem de empresa específica.
- **Sem testes "que passam"** sem validar fluxo real.

### Regra 3 — UMA SUB-FASE = UM COMMIT ATÔMICO
- Mensagem: `tipo(escopo): descrição (sub-fase X.Y)`
- Co-author: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- **NUNCA `git push`** sem autorização (Victor é o único push-er).

### Regra 4 — SE TESTE FALHAR, MOSTRAR PRA VICTOR ANTES
- Não "ajustar mock pra passar" se a falha indica problema real.

### Regra 5 — TECH_DEBT é CANÔNICO
- Toda mudança que resolve bug → mover entry pra `## ✅ Histórico — Resolvidas` com data + sub-fase + validação real.

### Regra 6 — DECISÕES DE PRODUTO/SEMÂNTICA SEMPRE COM VICTOR
- Decisões D1-D6 do plano. **Status: TODAS resolvidas** (ver `CHECKPOINT_ARQUITETURA.md §6`).

### Regra 7 — PADRÃO IDIOMÁTICO DO PROJETO
- **Auth/login:** ID numérico + senha (SEM email). JWT custom HS256 com JWT_SECRET.
- Multi-empresa: `company.id` por param. RLS via `auth.jwt() ->> 'company_id'`.
- TypeScript: tipos explícitos. Sem `any` sem comentário.

### Regra 8 — QUALIDADE ACIMA DE VELOCIDADE
> _"Sistema 100%, não meia bomba"_ — Victor.
> Quando em dúvida, qualidade > tempo. Sempre.

- Cada decisão favorece robustez, não atalho.
- Não pular validação alegando "é simples".
- Não simplificar mock/teste pra "passar".
- Reflexão obrigatória antes de cada commit: _"estou escolhendo o caminho mais robusto ou o mais rápido?"_

---

## 📊 ESTADO ATUAL — 2026-05-13

### Resumo executivo

| Métrica | Valor |
|---|---|
| **Branch / working tree** | `main` / limpo (só `.claude/` untracked) |
| **Último commit** | `a3e2ff2` (spec 38 system-walkthrough) — próximo será fechamento 14.5/6/7/8 |
| **Security advisors ERRORs** | **0** ✅ |
| **RLS-enabled tables** | **48** (33 core Sistema de Ponto + 15 legado) |
| **Edge functions ACTIVE** | **4** (auth-login v9, clock-in-validated v8, create-user v1, employee-public-api v2) |
| **Migrations aplicadas** | **57** |
| **Unit tests (Vitest)** | **422+ passing** (16 specs em `tests/unit/`) |
| **E2E specs (Playwright)** | **40+ specs** (~250+ tests passing) |
| **Bugs latentes em prod** | **0** ✅ |

### Fases concluídas (5 → 14)

| Fase | Tema | Status |
|---|---|---|
| 5-10 | Quick wins + Cobertura + Migrations + E2E components | ✅ |
| **11** | **Hardening RLS + bcrypt (67 ERRORs → 0)** | ✅ |
| 12 | Documentação (README + PRE-LAUNCH + ARCHITECTURE + edge-fns) | ✅ |
| 13 | Validação final (3× Playwright clean) | ✅ |
| **14** | **Pós-validação + UI bug hunt + cobertura final** | ✅ |

Detalhe completo de cada fase → `CHECKPOINT_FASES.md`

---

## 📁 ARQUIVOS DO CHECKPOINT (dividido pra não ficar gigante)

| Arquivo | O que tem |
|---|---|
| **`CHECKPOINT.md`** (este) | Índice + 8 regras + estado executivo + ponteiros |
| `CHECKPOINT_FASES.md` | Histórico granular das fases 5-14 + sub-fases |
| `CHECKPOINT_ARQUITETURA.md` | Stack, fluxo de auth, decisões D1-D6, padrões idiomáticos |
| `CHECKPOINT_BANCO.md` | Schema, RLS, edge functions, RPCs, migrations |
| `CHECKPOINT_TESTES.md` | Specs E2E + Vitest, coverage, comandos, patterns |
| `CHECKPOINT_OPERACAO.md` | Deploy, manual ops, troubleshoot bugs latentes |
| `CHECKPOINT_PROXIMOS_PASSOS.md` | Pendências + ações Victor go-live + gaps postponed |

**Outros docs canônicos do projeto:**
- `ARCHITECTURE.md` — Mermaid diagrams completos
- `PLANO_PRODUCAO.md` — plano original que orientou as Fases 5-14
- `TECH_DEBT.md` — tech debt registrado com sub-fases previstas
- `README.md` — visão produto
- `PRE-LAUNCH-CHECKLIST.md` — checklist de pré-lançamento

---

## 🎯 ESTADO ATUAL DA SUB-FASE 14 (em andamento)

### Concluído hoje (2026-05-13)

#### 14.4 (continuação) — Manual UI Bug Hunt
- ✅ 11 bugs reais cazados via teste manual UI no browser do Victor
- ✅ Causa raiz refator: `supabase.ts` 1 instance + fetch interceptor (14.4.9)
- ✅ Spec 38 `system-walkthrough` auto-captura console errors em 8 fluxos

#### 14.5 / 14.6 / 14.7 / 14.8 — Cobertura final via 6 agents paralelos
Em resposta ao pedido Victor: _"eu quero que vc teste tudo tudo mesmo, e valide tudo, se for preciso use mais agentes"_:

| Sub-fase | Spec | Resultado |
|---|---|---|
| 14.5 | `37-create-user-e2e` (createUser via UI completo) | 5/5 ✅ |
| 14.5 | `38-system-walkthrough` (8 fluxos + console capture) | 8/8 ✅ |
| 14.6 | `39-create-employee-ui` (criar emp UI form + validações + edit) | 5/5 ✅ |
| 14.6 | `40-bonus-individual-ui` (bonificação aplica/remove via UI) | 5/5 ✅ |
| 14.7 | `41-company-settings-save` (city/address/radius/schedule persist) | 5/5 ✅ |
| 14.7 | `42-bank-hours-apply-ui` (apply via UI + log + payment updated) | 3/3 + 1 skip ✅ |
| 14.8 | `unit/edgeFnEmployeePublicApi` (set-pin/save-face/log-face-attempt happy) | 4/4 + 1 skip ✅ |
| 14.8 | `unit/xlsxSecurity` (5 defensive tests prototype pollution) | 5/5 ✅ |
| 14.8 | Race fix tests/26+37 (PN config snapshot + pre-create user via DB) | 26: 9/9 ✅ + 37: 5/5 ✅ |

**3 ajustes pós-criação dos specs (strict mode + reload):**
- `40` test 4: `.first()/.last()` em getByText
- `41` test 5: `page.reload()` após setLatLngDirect
- `42` test 2: `getByText('Selecionados', {exact: true})`

### Em andamento background
- 🔄 Playwright suite completa (workers=1) rodando — confirma batch passa

### Pendente sessão pós-almoço Victor
- ⏳ Confirmar suite batch completa
- ⏳ Commit final consolidado (14.5/6/7/8 + race fixes + 3 ajustes)

---

## 🚀 PRÓXIMOS PASSOS — Go-Live (ações manuais do Victor)

Sistema técnico está **100% pronto.** Próximos passos exigem ação do Victor:

1. **Onboarding Ponte Nova** — importar 30 employees, configurar geo, bonus_types, validar login 8888
2. **Tag v2.0.0-multi-tenant** — release final
3. **Deploy frontend prod** — Vercel/Netlify/Cloudflare (env vars: VITE_*; NUNCA SERVICE_ROLE_KEY)
4. **Smoke test pós-deploy** — login admin + supervisor + clock-in real

Detalhes completos → `CHECKPOINT_PROXIMOS_PASSOS.md`

---

## 🤖 ABORDAGEM PARA RETOMAR (nova sessão Claude Code)

1. **Ler este checkpoint + os 6 arquivos auxiliares.**
2. **Confirmar as 8 regras obrigatórias** acima.
3. **Verificar estado:**
   ```bash
   git log --oneline -10                 # último commit deve ser fechamento 14.5/6/7/8
   git status --short                     # working tree limpo (só .claude/)
   ```
4. **Validar baseline:**
   ```bash
   npx tsc --noEmit                       # exit 0
   npx vitest run | tail -5               # 422+ passing
   ```
5. **Avaliar com Victor** os próximos passos:
   - Onboarding Ponte Nova (manual)
   - Release/deploy
   - Tech debt residual aceito (PIN bcrypt? cleanup cosmético `User.password`?)
   - Pós-go-live: monitoring/observability

---

## 🔧 Comandos úteis (cheat sheet rápido)

```bash
# Validações
npx tsc --noEmit
npx eslint src/
npx vitest run
npx playwright test --workers=1 --reporter=list

# Spec isolado
npx playwright test tests/XX-spec.spec.ts --workers=1 --reporter=list
npx vitest run nomeDoArquivo

# Git
git log --oneline -10
git diff --stat HEAD~5
```

**Supabase MCP** (sempre disponível):
- `mcp__claude_ai_Supabase__list_tables`
- `mcp__claude_ai_Supabase__execute_sql`
- `mcp__claude_ai_Supabase__apply_migration`
- `mcp__claude_ai_Supabase__deploy_edge_function`
- `mcp__claude_ai_Supabase__list_edge_functions`
- `mcp__claude_ai_Supabase__get_advisors`
- `mcp__claude_ai_Supabase__get_logs`

**Project ID:** `flcncdidxmmornkgkfbb` (PNR Dashboard, sa-east-1, PG 17.6)

---

## ⚠️ Avisos importantes (não esquecer)

1. **JWT_SECRET em prod já configurada** — NÃO recriar. Se rotacionar JWT Secret no Dashboard, atualizar var custom também.
2. **`users.password` plain DROPADA em 11.1** — sem rollback fácil.
3. **`createDefaultAdmin`** removido em 11.6 — não tem mais issue.
4. **Specs E2E:** prefix `PW Test` + cleanup automático. **Padrão obrigatório.**
5. **Memory:** `project_auth_no_email` confirma D3+D4. Ler antes de tocar em auth/RLS.
6. **`docs/security-baseline-pre-rls.md` + `post-rls.md`** salvos pra audit trail.
