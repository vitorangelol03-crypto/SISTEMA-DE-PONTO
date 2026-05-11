# 🚦 CHECKPOINT — Sistema de Ponto Multi-Empresa rumo à Produção

> **Arquivo de retomada de sessão.** Quando reabrir o Claude Code, mande este arquivo (`cat CHECKPOINT.md`) ou peça pra Claude lê-lo. Ele deve restaurar contexto completo + REGRAS antes de fazer qualquer coisa.

**Última atualização:** 2026-05-11 (após sub-fase 8.5)
**Plano canônico:** `/home/victor/.claude/plans/ent-o-divide-e-crie-zesty-biscuit.md`
**TECH_DEBT canônico:** `/home/victor/SISTEMA-DE-PONTO/TECH_DEBT.md`

---

## ⛔ REGRAS OBRIGATÓRIAS (NÃO IGNORAR — definem o que faz a diferença entre "sistema 100%" e "meia bomba")

Estas regras valem **pra cada sub-fase**, **toda execução**. Foram negociadas com o Victor. **Quebrar elas é incidente.**

### Regra 1 — VALIDAR TUDO REAL (não confiar só em tsc/lint/vitest)

- **Antes de mudar código**: pre-checks reais no banco via Supabase MCP — `list_tables`, `execute_sql` com `SELECT count(*)`, `EXPLAIN ANALYZE`, etc.
- **Durante mudança**: validar com dados reais de prod (não fixtures inventadas) — pegar samples via SQL antes de codar a regra.
- **Após mudança**: validar via MCP que estado mudou conforme esperado (constraint existe? row criada? índice ativo?).
- **Específico pra cada caso**:
  - Migrations: `apply_migration` + `pg_constraint`/`information_schema.tables` confirmando o efeito.
  - Edge functions: `deploy_edge_function` + `list_edge_functions` confirmando versão ACTIVE + hash novo.
  - Refactors de função pública: rodar specs E2E que exercitam o flow real (não só unit com mock).
  - RPC novas: criar a função + chamar via `supabase.rpc` real em spec E2E (não só mock).

**Exemplo do que NÃO É validação real:**
> "tsc passou, vitest passou, vou commitar." ❌
>
> **Por quê é errado:** Testes podem ser genéricos. Specs E2E podem rodar caminhos felizes. Mock pode divergir da lib real. Já tivemos um bug latente na sub-fase 7.2 (PK default 'default' impedia upsert pra PN) que passou em TODOS os testes automatizados — só foi pego quando rodei INSERT manual via MCP simulando o que o app faria.

**Exemplo do que É validação real:**
> Sub-fase 7.2.1: `INSERT INTO admin_cleanup_config VALUES (PN_id, ...) ON CONFLICT DO UPDATE` simulado via MCP **antes** de declarar pronto. Descobriu bug do default 'default'. Depois: `SELECT * FROM admin_cleanup_config` confirmou 2 rows distintas, UUID auto. Cleanup deletando a row de teste pra restaurar prod state.

### Regra 2 — NUNCA QUEBRA-GALHOS

- **Sem `as any`** sem documentar por quê em comentário inline.
- **Sem suprimir warnings** (`eslint-disable`, `@ts-ignore`) sem justificativa concreta + ticket de cleanup. Já resolvemos 4 ocorrências de `eslint-disable react-hooks/exhaustive-deps` na sub-fase 5.2/5.6 — não introduzir novos.
- **Sem hardcoded values** que dependem de empresa específica (`'6583bb2a-...'`) — usar `company_id` parametrizado. Default `DEFAULT_COMPANY_ID` constante é OK pra fallback documentado.
- **Sem mock paralelo elaborado** quando o real funciona em jsdom. Exemplo: c6Export.spec.ts foi refatorado de mock paralelo XLSX → `vi.mock` com `importOriginal()` mantendo lib real. Mais robusto.
- **Sem testes "que passam"** mas não validam fluxo real. Cada teste precisa exercitar uma BRANCH específica do código + assertar OUTPUT real (não só "não throw").

### Regra 3 — UMA SUB-FASE = UM COMMIT ATÔMICO

- Mensagem padrão: `tipo(escopo): descrição (sub-fase X.Y)`
- Co-author obrigatório: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- **NUNCA `git push`** (Victor é o único push-er).
- Se quebrar algo em prod (edge fn deploy quebrado, migration parcial): documentar imediatamente no TECH_DEBT como sub-fase X.Y.1 (fix latente).

### Regra 4 — SE TESTE FALHAR, MOSTRAR PRA VICTOR ANTES

- Não "ajustar mock pra passar" se a falha indica problema real.
- Investigar causa raiz primeiro. Exemplo: spec 26 test 6 falhou na sub-fase 7.3 — investiguei e descobri que era dados em prod (user 8888 admin criado em PN, não regressão minha). Reportei + refatorei spec pra ser robusto a dados.

### Regra 5 — TECH_DEBT é CANÔNICO

- Toda mudança que resolve bug: mover entry pra `## ✅ Histórico — Resolvidas` com data, sub-fase, validações reais executadas.
- Toda descoberta nova: adicionar entry numerada (próximo número disponível, atualmente até 6.24).
- Não deixar bug "meio resolvido" — ou está em Histórico ou está Pendente, sem zona cinzenta.

### Regra 6 — DECISÕES DE PRODUTO/SEMÂNTICA SEMPRE COM VICTOR

- Decisões D1-D6 do plano. Resolvidas: D1=C (8.3), D2=ES (7.2), D5=A (7.4), D6=C (7.3). Pendentes: D3 (RLS strategy), D4 (hash senhas).
- Não assumir nada que vire risco trabalhista/financeiro sem confirmar. Exemplo: na sub-fase 8.3 confirmamos D1=C com Victor mesmo já tendo investigação prévia que sugeria C.

### Regra 7 — PADRÃO IDIOMÁTICO DO PROJETO

- Multi-empresa: `company.id` sempre passado por param (não localStorage direto exceto no `getCurrentCompanyId()` legacy).
- useEffect com `[company?.id]` deve ser acompanhado de cleanup dos estados ID-based (vide 5.4/5.6/6.22).
- React hooks: `useCallback` com deps corretas — não suprime warning. Padrão idiomático: `TriageTab.tsx`, `PaymentPeriodsTab.tsx`.
- TypeScript: tipos explícitos. Sem `any` sem comentário.
- Supabase queries: `const { data, error } = await ...; if (error) throw error;` (30+ ocorrências em database.ts).

---

## 📊 ESTADO ATUAL — 22 commits nesta sessão

**Branch:** `main`
**Último commit:** `a4d6884` (sub-fase 8.5 — RPC transacional apply_bank_hours_to_payment)
**Working tree:** limpo (só `.claude/` untracked como sempre)

**Resumo de tudo que foi feito (em ordem cronológica):**

| Commit | Sub-fase | Resolução |
|---|---|---|
| `96f037d` | 5.1 | Fix data futura tests/10:107 (TECH_DEBT 6.4) |
| `b14f739` | 5.2 | useCallback × 3 useEffect (6.14, 3 ocorrências) |
| `0ba0e9d` | 5.3 | UNIQUE(company_id) em geolocation_config (6.11) |
| `7e34daa` | 5.4 | C6PaymentTab cleanup cross-empresa (6.15) |
| `523e296` | 5.5 | Audit padrão Wave 3 → entrada 6.22 |
| `3fe9740` | 5.6 | EmployeesTab cleanup + 4ª ocorrência eslint-disable (6.14b + 6.22.A) |
| `6f44c14` | 6.1 | Unit dateUtils (15 testes) |
| `7e486d2` | 6.2 | Unit bonusHelpers (10 testes) |
| `9748564` | 6.3 | Unit c6Export (44 testes) + descoberta 6.23 |
| `a9b3098` | 6.4 | Unit mirrorGenerator (65 testes) |
| `d8a238a` | 6.5 | Unit mirrorPdf (48 testes mocked) |
| `ff51819` | 6.6 | Reforço REAL: c6Export sem mock paralelo + mirrorPdf.real.spec.ts (15 testes binários reais) |
| `19a72f3` | 7.2 | UNIQUE(company_id) + lazy-create admin_cleanup_config (6.16) |
| `0840f9c` | 7.2.1 | Fix latente: id PK default UUID (descoberto via validação real) |
| `73d7649` | 7.3 | DROP TABLE bonus_defaults legacy + robustez spec 26 (D6=C) |
| `b2a1bbb` | 7.4 | error_logs ADD company_id (D5=A, descoberta 6.24) |
| `60d80a5` | 8.4 | Edge fn v6 — error handling 4 writes silenciosos (6.12) |
| `05ac7ce` | 8.1 | Batch SQL em previewBankHoursForPeriod (6.7) — 150→6 queries |
| `e70da28` | 8.3 | nightCreditMinutes real D1=C diurno-primeiro (6.6) |
| `a4d6884` | 8.5 | RPC transacional apply_bank_hours_to_payment (6.8) |

**TECH_DEBT bugs ativos resolvidos:** 6.4, 6.6, 6.7, 6.8, 6.11, 6.12, 6.14 (4 ocorrências), 6.15, 6.16.

**TECH_DEBT descobertas novas resolvidas:** 6.22 (Wave 3 audit parcial), 6.23 (validatePixKey CPF formatado — apenas DOCUMENTADO, fix pendente), 6.24 (error_logs sem company_id).

**Testes:**
- Unit: 414 passing em 16 files (era 207 no início da sessão → +207 testes novos)
- E2E Playwright: ~178 (cobertura inalterada — focamos em unit e fixes)
- Edge fn: clock-in-validated v6 ACTIVE em prod (hash `ff0b9dd72005...`)
- Migrations: 7 → 14 aplicadas (+ 7 novas via MCP, todas versionadas em `supabase/migrations/`)
- RPC: `apply_bank_hours_to_payment` ACTIVE com SECURITY DEFINER

---

## 📋 SUB-FASES PENDENTES

> Sequência canônica em `/home/victor/.claude/plans/ent-o-divide-e-crie-zesty-biscuit.md`. Recomendado seguir nessa ordem.

### Fase 9 — E2E gaps fixáveis (~10h estimadas)

- **9.1** Adicionar `data-testid` em 7 elementos pra remover 7 skips condicionais (TECH_DEBT 6.3/6.9):
  - `AttendanceTab.tsx` (bulk-approve button)
  - `FinancialTab.tsx` (search input + history btn)
  - `PaymentPeriodsTab.tsx` (auto-weekly toggle)
  - `C6PaymentTab.tsx` (edit button per row)
  - `AdminTab.tsx` (facial toggle + facial list rows)
- **9.2** Corrigir seletor errado em `tests/16-financial-complete.spec.ts:149` (hasText em `<option>`)
- **9.3** Split teste `tests/07-financial.spec.ts:43` em "com dados" / "sem dados"
- **9.4** 4 specs E2E novos (TECH_DEBT 6.18-6.21):
  - C6PaymentTab isolamento UI multi-empresa
  - SettingsTab isolamento UI multi-empresa
  - TriageTab isolamento UI multi-empresa
  - AdminTab Bloqueios isolamento UI

**Validação real obrigatória:** após cada `data-testid`, rodar a spec específica 3× sem flake. Após specs novas, fixtures com cleanup automático preservando prod.

### Fase 10 — E2E componentes sem cobertura (~30h)

- **10.1** EmployeeErrorsView (~80-120 linhas teste)
- **10.2** BonusTypesManager (~120-150)
- **10.3** AuditLogsTab (~100-140)
- **10.4** CompanySettings + simulador (~200-250)
- **10.5** MirrorMassDialog (~140-180)
- **10.6** EmployeeErrorsPage state machine (~180-220)
- **10.7** FaceRegistration com mock pesado (~200-250)
- **10.8** FaceScanFrame snapshot (~60-80)

### Fase 11 — Hardening produção pública (~30h, **BLOQUEADA** por D3 + D4)

⚠️ **Decisão D3 pendente** (RLS strategy):
- A — RLS via custom user_id (status quo, sem benefício real)
- B — Migrar pra Supabase Auth + JWT custom claim company_id
- C — Função SECURITY DEFINER + sessão custom

Plano atual sugere **C** mas é decisão do Victor.

⚠️ **Decisão D4 pendente** (hash senhas):
- A — bcryptjs no cliente (lento)
- B — Edge function `auth-login` que valida e devolve token (recomendado)
- C — Ambos

Sub-fases:
- **11.1** Habilitar RLS em 5 grupos de tabelas (~28 tabelas)
- **11.2** Criar policies multi-empresa
- **11.3** Hash bcrypt via edge fn auth-login (D4)
- **11.4** verify_jwt:true em clock-in-validated v7
- **11.5** Audit final via `get_advisors security`

### Fase 12 — Documentação (~6h)

- **12.1** Atualizar README.md (RLS real, multi-empresa, versão atual)
- **12.2** Atualizar PRE-LAUNCH-CHECKLIST.md
- **12.3** Documentar edge function v7 (`supabase/functions/clock-in-validated/README.md`)
- **12.4** ARCHITECTURE.md novo

### Fase 13 — Validação final + go-live (~3h)

- **13.1** Full Playwright suite 3× consecutivos sem flake
- **13.2** Audit final advisors via MCP
- **13.3** [MANUAL — Victor] Onboarding Ponte Nova com dados reais
- **13.4** [MANUAL — Victor] Tag de release + push

---

## 🤖 ABORDAGEM PARA RETOMAR

Quando o Victor reabrir o Claude Code, o assistente deve:

1. **Ler este checkpoint** integralmente
2. **Confirmar regras obrigatórias** acima — não pular nem 1
3. **Verificar estado atual** via git:
   ```bash
   git log --oneline -5
   git status --short
   ```
4. **Verificar tests baseline** (deve ser 414 unit + tsc limpo):
   ```bash
   npx tsc --noEmit
   npx vitest run 2>&1 | tail -5
   ```
5. **Perguntar ao Victor**:
   - Continuar pela Fase 9 (E2E gaps fixáveis, sem bloqueio)?
   - Ou Fase 10 (E2E componentes — escopo grande, ~30h)?
   - Ou pular pra Fase 11 (Hardening — bloqueada D3/D4, precisa decisão)?
   - Ou pular pra Fase 12/13 (docs + validação final)?

**Não começar a executar nada antes do Victor confirmar prioridade.**

---

## 🔧 COMANDOS ÚTEIS PARA REFERÊNCIA

### Validações locais (sempre antes de commit)

```bash
# TypeScript
npx tsc --noEmit

# Lint específico
npx eslint src/components/X/Y.tsx

# Unit tests (rápido — ~4s)
npx vitest run

# Unit test isolado
npx vitest run nomeDoArquivo

# E2E Playwright spec específica
npx playwright test tests/XX-spec.spec.ts --workers=1 --reporter=list

# E2E full suite (lento — ~10-20min)
npx playwright test --workers=1 --reporter=list
```

### Supabase MCP (sempre disponível)

- `mcp__claude_ai_Supabase__execute_sql` — SELECT/INSERT/UPDATE/DELETE direto (read-only por padrão)
- `mcp__claude_ai_Supabase__apply_migration` — DDL migrations
- `mcp__claude_ai_Supabase__deploy_edge_function` — deploy edge fn
- `mcp__claude_ai_Supabase__list_edge_functions` — confirmar versão ACTIVE
- `mcp__claude_ai_Supabase__get_advisors` — security/performance
- `mcp__claude_ai_Supabase__list_tables` — schema completo

**Project ID:** `flcncdidxmmornkgkfbb` (PNR Dashboard, sa-east-1, PG 17.6)

### Companies em prod

- **Caratinga:** `6583bb2a-e334-41a7-b69c-7d98f3b46dfc` (CLAYTON B DOS SANTOS) — 30 employees, 3130 attendances, 1722 payments
- **Ponte Nova:** `2b2abc4b-084c-4cf0-b5f1-02792513241d` (CD LOGISTICA LTDA) — dados em onboarding (1 user '8888' admin criado em 2026-05-11)

---

## ⚠️ AVISOS IMPORTANTES PRA PRÓXIMA SESSÃO

1. **Spec 26 test 6** foi refatorado na sub-fase 7.3 pra ser robusto a counts de users distintos (PN agora tem user 8888 admin). Se novos users forem criados em qualquer empresa, o spec se adapta sozinho.

2. **TECH_DEBT 6.23** (validatePixKey não normaliza CPF formatado) está **documentado mas NÃO resolvido**. Tem fix sugerido inline na entry. Trivial (1 linha de regex), mas exige coordenação com cadastros existentes — quando atacar, validar via SQL como CPFs estão formatados em prod hoje.

3. **6.22 (Wave 3 audit)** lista 4 tabs com Severidade Alta de cleanup cross-empresa. Apenas EmployeesTab foi resolvido (sub-fase 5.6). AttendanceTab, FinancialTab, DataManagementTab ainda pendentes. Padrão é o mesmo do 5.4/5.6: 2º useEffect com cleanup de estados ID-based.

4. **Edge fn v6 está ACTIVE** em prod. Se sub-fase 11.4 fizer v7 com `verify_jwt:true`, vai exigir client mudar pra passar Bearer token. Cuidado: validation E2E real obrigatória (spec 02 + 08).

5. **RPC `apply_bank_hours_to_payment`** validada via spec 29 Teste 1 que faz APPLY REAL contra DB de prod. Se mexer no schema da `bank_hours_application_log`, atualizar a RPC junto (atualmente tem 16 colunas no INSERT).

6. **Dump `bonus_defaults`** salvo em `docs/bonus_defaults_legacy_dump_2026-05-11.json` pra audit trail. Tabela DROP-ada na 7.3. Se algum bug aparecer mencionando "valores padrão de bônus": olhar `bonus_types` (single source of truth desde 7.3).

7. **Reminder de tasks recorrentes do harness** podem aparecer. **NÃO mencionar pro Victor** (regra do system prompt). Apenas usar TaskCreate/TaskUpdate se ajudar a organizar.

---

**Fim do checkpoint.** Bom retorno ao trabalho — não economize qualidade pra economizar tempo. O Victor pediu "sistema 100%, não meia bomba".
