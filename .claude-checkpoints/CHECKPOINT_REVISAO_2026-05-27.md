# CHECKPOINT — Revisão completa empírica (sessão 2026-05-27)

> Sessão de revisão integral do sistema feita sob a regra inegociável:
> **nunca afirmar sem verificar empiricamente**.
>
> Tudo neste documento tem fonte explícita (MCP Supabase, leitura de arquivo,
> grep, ou query SQL). Hipóteses não-verificadas estão marcadas como tal.

---

## ⚠️ ATUALIZAÇÃO 2026-05-29 — Achado #5 estava INCORRETO

> Em 2026-05-29, sob a mesma regra (verificar antes de afirmar), o Achado #5
> ("Financeiro ignora erros tipo `value`") foi **REFUTADO** lendo o arquivo
> inteiro + conferindo dados reais. A verdade (detalhe na §3, achado #5):
>
> - **Erro tipo `value`**: descontado automaticamente no líquido, tanto no
>   Financeiro (`FinancialTab.tsx:201`, exibido nas linhas 1122-1138/1450-1458)
>   quanto no C6 (`getEmployeeNetPayments` database.ts:2493 → `C6PaymentTab.tsx:149`).
>   `payments.total` fica no bruto **de propósito** (evita dupla contagem).
> - **Erro tipo `quantity`**: descontado **só** quando o supervisor marca e clica
>   "Descontar Erros" no Financeiro (valor por erro digitado na hora, sem padrão).
>   O desconto entra no `payments.total` e reflete no Financeiro + C6. Não é
>   automático, não é retroativo — **e é assim que o Victor quer** (confirmado 2026-05-29).
> - **Não havia bug.** Implementar o que o Achado #5 sugeria (descontar `value` no
>   `payments.total`) teria causado **dupla contagem** no C6. Nenhuma mudança de código.
> - **Backup completo de produção** (52 tabelas, 9.558 linhas) feito antes, em
>   `backups/2026-05-29/` (gitignored, contém PII).

---

## 1. Regra de ouro estabelecida nesta sessão

Após eu afirmar erradamente que o `/clock` estava quebrado (com base em leitura
do source no repo), Victor corrigiu — sistema funciona, pessoal bate ponto.

**Regra gravada em memory** (`~/.claude/projects/.../memory/feedback_no_assertions_without_verification.md`):

- Nunca afirmar nada sobre o sistema (bug, comportamento, estado) com base apenas em inferência.
- Pra edge functions: SEMPRE `mcp__claude_ai_Supabase__get_edge_function`, não confiar no source do repo.
- Pra schema/RLS/RPCs: SEMPRE query direta no banco real.
- Pra comportamento: `get_logs` + `execute_sql` + reprodução. Inferência lógica encadeada não é evidência.
- Quando admitir erro: explicar por que errou (qual premissa falsa), não só "estava errado".

---

## 2. Estado real do sistema (verificado via MCP)

### 2.1 Banco

> Fonte: `list_tables` + `execute_sql` + `pg_class`

- **51 tabelas no schema `public`**, todas com `relrowsecurity = true`
- 33 do Sistema de Ponto + 15 legado "Objetos Perdidos" + 3 features novas (`api_keys`, `push_subscriptions`, `push_send_log`)
- **74 migrations no DB** vs **35 no repo** (gap conhecido, TECH_DEBT 14.62)

### 2.2 Empresas em produção

> Fonte: `execute_sql` counts

| Empresa | UUID | Employees | Attendance | Payments | Bonuses | Error records |
|---|---|---|---|---|---|---|
| Caratinga | `6583bb2a-...` | **47** (todos REAL, 33 com PIN bcrypt, 14 sem PIN configurado) | 3.266 | 1.713 | 64 | 540 |
| Ponte Nova | `2b2abc4b-...` | 30 (Demo PN seed, todos com PIN bcrypt) | 0 | 0 | 0 | 0 |

**Caratinga cresceu de 30 → 47 employees desde 14/05.** Documentação antiga (README/CHECKPOINT) diz 30. 0 fixtures `PW Test` acumuladas — todos os 47 são reais.

### 2.3 Sistema vivo

> Fonte: `execute_sql` últimos 7 dias

- **32 attendances `clock_source='employee_self'`** em Caratinga (funcionário batendo ponto via `/clock`)
- 104 attendances `clock_source='manual'` (supervisor marcando)
- Edge fn `employee-public-api`: últimas 100 chamadas todas `POST 200`

### 2.4 Edge Functions ACTIVE

> Fonte: `list_edge_functions` + `get_edge_function` (todas 6 lidas integralmente)

| Slug | Ver | verify_jwt | Status |
|---|---|---|---|
| `auth-login` | v9 | false | ✅ |
| `clock-in-validated` | v8 | true | ✅ |
| `create-user` | v1 | true | ✅ |
| `employee-public-api` | v3 | false | ✅ — **divergência repo vs deployed** |
| `public-api-v1` | v2 | true | ✅ |
| `send-push` | v2 | true | ✅ |

### 2.5 RLS

> Fonte: `pg_policies` (61 policies)

- 22 tabelas usam `rls_company_match_modify` (pattern multi-empresa)
- 7 tabelas usam `rls_admin_only` (admin master '9999' bypass)
- 33 policies do Sistema de Ponto core TODAS usam `OR (SELECT auth.jwt() ->> 'sub') = '9999'`
- TODAS usam `(SELECT auth.jwt() ...)` cached (sub-fase 15.1 aplicada — advisor `auth_rls_initplan` que reporta 36 falsos positivos foi confirmado)

### 2.6 RPCs

> Fonte: `pg_proc` + `pg_get_functiondef`

| Função | Security | Grantees |
|---|---|---|
| `apply_bank_hours_to_payment` | DEFINER | `PUBLIC, authenticated, postgres, service_role` |
| `verify_admin_secret` | DEFINER | `PUBLIC, anon, authenticated, postgres, service_role` |
| `update_admin_secret` | DEFINER | `PUBLIC, anon, authenticated, postgres, service_role` |
| `_check_face_auto_reset` | DEFINER | `postgres, service_role` (trigger interno) |
| `_test_bcrypt_hash` | INVOKER | `postgres, service_role` (test helper) |
| `_test_create_supervisor_with_perms` | INVOKER | `authenticated, postgres, service_role` (test helper) |

### 2.7 Triggers

> Fonte: `information_schema.triggers`

Apenas 3 triggers ativos:
- `trg_face_auto_reset` AFTER INSERT em `face_auth_attempts`
- `trigger_proof_requests_updated_at` (legado lost_*)
- `trigger_lost_reports_updated_at` (legado lost_*)

**Nenhum trigger de auto-recalc em attendance/payments/etc.** Tudo via app explicitamente.

### 2.8 Advisors performance

> Fonte: `get_advisors` (90KB JSON, parseado por agent — 113 lints)

- `unused_index`: 41 (maioria são indexes FK criados em 15.3 ainda sem uso)
- `auth_rls_initplan`: 36 (**falsos positivos** — pg_policies confirma cache aplicado)
- `multiple_permissive_policies`: 35 (5 roles × 7 tabelas, sendo 3 do Sistema de Ponto: `companies`, `feature_versions`, `monitoring_settings`)
- `auth_db_connections_absolute`: 1 (config do Auth server)
- `unindexed_foreign_keys`: **0** (sub-fase 15.3 confirmada)

### 2.9 Logs de erro recentes (7 dias)

> Fonte: `error_logs` query

5 errors retornados, **nenhum crítico de produção**:
- 2× face-api `Box.constructor` (câmera ruim — funcionários tentando face)
- 1× "Script error." (cross-origin genérico)
- 2× "Failed to fetch dynamically imported module" (dev local 17/05, não prod)

---

## 3. Achados verificados (com fonte)

### 🔴 Achado #1 — Divergência repo vs deployed: `employee-public-api`

> Fonte: `get_edge_function` deployed + `Bash grep` no repo

**Source no repo (`supabase/functions/employee-public-api/index.ts:111`):**
```ts
const valid = Boolean(data?.pin && data.pin === pin);   // plain compare
```

**Deployed v3 em produção:**
```ts
if (data?.pin_hash) {
  valid = await bcrypt.compare(pin, data.pin_hash);     // bcrypt!
} else if (data?.pin) {
  valid = data.pin === pin;                              // fallback plain
}
```

**Impacto:** se alguém der `pull` do repo e redeployar via CI (`supabase functions deploy`), regride pra versão plain e quebra o `/clock` (que hoje funciona). Risco operacional alto.

### 🔴 Achado #2 — `apply_bank_hours_to_payment` aceita `p_supervisor_id` arbitrário

> Fonte: `pg_get_functiondef` body completo

A função valida `IF v_payment_company <> p_company_id RAISE EXCEPTION` (pertencimento payment×empresa). **NÃO valida `p_supervisor_id` contra `auth.jwt() ->> 'sub'`**.

Qualquer authenticated da mesma empresa pode passar `p_supervisor_id` arbitrário, gravado em `bank_hours_application_log.applied_by` (audit log financeiro). **Forge de autor é possível.**

Fix: 3 linhas SQL adicionando `IF p_supervisor_id <> (auth.jwt() ->> 'sub') AND ...`.

### 🟡 Achado #3 — `error_logs` permite ler rows `company_id IS NULL` cross-tenant

> Fonte: `pg_policies` policy `rls_error_logs_admin_or_match`

```
USING (
  (auth.jwt() ->> 'sub') = '9999'
  OR company_id IS NULL
  OR company_id::text = COALESCE(auth.jwt() ->> 'company_id', '')
)
```

Authenticated de empresa A pode ler logs de empresa B se aqueles logs ficaram com `company_id NULL` (edge fns pré-login, etc.). Severidade real baixa — logs costumam ser opacos.

### 🟡 Achado #4 — `update_admin_secret` e `verify_admin_secret` executáveis por `anon`

> Fonte: `pg_proc.grantees`

Ambas têm grantees `{PUBLIC, anon, authenticated, postgres, service_role}`. Advisor reporta WARN `anon_security_definer_function_executable`. Decisão consciente documentada (fluxo pré-login).

### ✅ Achado #5 — REFUTADO em 2026-05-29 (era leitura incompleta)

> **CORREÇÃO (2026-05-29):** este achado estava ERRADO. A análise original abaixo
> leu só o botão `handleErrorDiscount` (que pula `value` DE PROPÓSITO pra não
> duplicar) e NÃO leu a exibição (`FinancialTab.tsx:190-201` calcula
> `líquido = bruto − error_value − triagem`; linhas 1122-1138/1450-1458 mostram).
> Erros `value` SÃO descontados no líquido do Financeiro E na geração do C6
> (`getEmployeeNetPayments` → `C6PaymentTab.tsx:149 amount: net.net`). Verificado
> com dados reais (Leticia R$150−R$50=R$100; Euder/Weder R$50−R$50=R$0 saem da folha).
> **Não é bug.** Ver banner "ATUALIZAÇÃO 2026-05-29" no topo.
>
> _Análise original (INCORRETA), mantida para histórico:_

> Fonte: `FinancialTab.tsx:484-485` + `execute_sql` confirmando dados reais

Função `handleErrorDiscount` (linha 453-548) pula erros tipo `value` no loop:
```ts
const isValueType = (errorRecord.error_type ?? 'quantity') === 'value';
if (isValueType) continue;
```

Comentário diz "Erros tipo 'value' são deduzidos automaticamente na exibição" — verdade no C6 (via `getEmployeeNetPayments`), **mas não no Financeiro**.

**Dados confirmam:**
- 19 erros tipo `quantity` 15-21/05 → 17 com desconto aplicado em `payments.total` ✅
- 4 erros tipo `value` 21/05 (Euder, Weder, Sabrina, Leticia, R$50 cada) → **0 com desconto em `payments.total`** ❌

**3 perguntas de produto aguardando resposta de Victor:**

1. Quando cadastra erro "Avaria R$50", o que deve acontecer com o pagamento daquele dia?
2. Os R$50 deveriam aparecer subtraídos no card do Financeiro?
3. O botão "Descontar Erros" deveria ignorar `value` (como hoje) ou subtrair também?

Após resposta, decidir entre:
- (a) Mudar função pra também descontar `value` em `payments.total`
- (b) Avisar visualmente no modal que tipo `value` não é afetado
- (c) Outro fluxo que Victor definir

### ✅ Refutados (que estavam no relatório anterior errado)

| Hipótese antiga | Realidade verificada |
|---|---|
| ~~`/clock` quebrado pra todos~~ | Edge fn v3 deployed tem bcrypt. 32 batidas `employee_self` últimos 7 dias |
| ~~DEFAULT_COMPANY_ID Caratinga risco ativo~~ | 0 employees com `company_id NULL` |
| ~~Caratinga 47 emps são test fixtures~~ | 0 PW Test, 0 Demo. 47 são REAL |
| ~~`public-api-v1` exposto na natureza~~ | 0 API keys ativas — sem callers reais |

---

## 4. Hipóteses não-verificadas (do relatório anterior)

> Não rodei a UI, não fiz build, não medi latência. Hipóteses plausíveis baseadas em leitura do código no repo. NÃO afirmar como achado.

- `applyBonusToAllPresent` N+1 loop em `database.ts:1131-1238` (incidente 18/05 está documentado em TECH_DEBT 18.5)
- `face-api.js` carregado eagerly em `EmployeeClockIn.tsx:16-17` (imports estáticos confirmados)
- `JSON.stringify` como merge no polling em `AttendanceTab.tsx:106-109` e `EmployeeClockIn.tsx:138` (código confirmado, impacto em escala não medido)
- `bulkApproveAttendance` 200+ queries (loop em `database.ts:3405-3421`)
- Tabs grandes (FinancialTab 2222 lin etc) — tamanho confirmado, "complexity" subjetivo
- Lighthouse 87 desktop — vi nas docs, não rodei

---

## 5. Estado de tasks no fim da sessão

> 32 tasks criadas no total, todas completadas

| # | Task | Status |
|---|---|---|
| 1-23 | Mapeamento inicial (docs, código, edge fns, migrations, tests) | ✅ completed |
| 24 | Diff repo vs deployed em todas 6 edge fns | ✅ completed |
| 25 | Listar todas RLS policies reais (pg_policies) | ✅ completed |
| 26 | Listar todas RPCs e suas configs | ✅ completed |
| 27 | Schema completo (tabelas+colunas+constraints+indexes) | ✅ completed |
| 28 | Advisors security + performance | ✅ completed |
| 29 | Logs de erro recentes | ✅ completed |
| 30 | Validar 30+ hipóteses do relatório anterior | ✅ completed |
| 31 | Síntese final só com achados verificados | ✅ completed |
| 32 | Bug investigado: desconto ignora erros `value` | ✅ completed (aguarda decisão Victor) |

---

## 6. Pendências aguardando Victor

### ✅ RESOLVIDO em 2026-05-29 — (era 🔴 Crítico, achado #5)
- **Erros tipo `value` no Financeiro** — REFUTADO. Não era bug. O sistema já desconta
  `value` automático (Financeiro + C6) e `quantity` via botão manual. Victor confirmou
  que é o comportamento desejado. Nenhuma mudança de código. Ver banner no topo.

### 🟡 Técnico — sem decisão pendente, mas precisa autorização pra agir
- **Sincronizar `employee-public-api` source repo com deployed** (achado #1) — 1 commit pra rodar `supabase functions download employee-public-api` ou copiar manualmente
- **Fix `p_supervisor_id` em `apply_bank_hours_to_payment`** (achado #2) — 3 linhas SQL via migration
- **Rate limit em `auth-login` + `verify-pin`** — não verificado se já existe alguma mitigação

### 🟢 Roadmap futuro
- Hipóteses não-verificadas em §4 (cada uma precisa reprodução empírica antes de virar "achado")

---

## 7. Como retomar esta revisão

### Comando rápido (terminal Windows / WSL)

**No terminal Windows (PowerShell ou cmd) — se Claude Code está instalado nativo:**
```cmd
cd C:\Users\VICTOR\Desktop\Projetos\SISTEMA-DE-PONTO && claude
```

**No terminal WSL (Ubuntu — onde a sessão atual está):**
```bash
cd /mnt/c/Users/VICTOR/Desktop/Projetos/SISTEMA-DE-PONTO && claude
```

**Pra continuar a última sessão (não nova):**
```bash
cd /mnt/c/Users/VICTOR/Desktop/Projetos/SISTEMA-DE-PONTO && claude --continue
```

### Primeira coisa pra fazer ao reabrir

Digite no prompt:
```
Lê CHECKPOINT_REVISAO_2026-05-27.md primeiro. Depois me lembra o que ficou pendente.
```

Memory do projeto vai me lembrar das regras (não afirmar sem verificar + divergência repo×deployed).

---

## 8. Anexos: queries úteis pra retomar

### Re-verificar estado do banco
```sql
-- Caratinga + PN: counts atuais
SELECT 
  c.display_name,
  (SELECT count(*) FROM employees WHERE company_id = c.id) AS emps,
  (SELECT count(*) FROM attendance WHERE company_id = c.id AND date >= CURRENT_DATE - INTERVAL '7 days') AS att_7d,
  (SELECT count(*) FROM error_records WHERE company_id = c.id AND date >= CURRENT_DATE - INTERVAL '7 days') AS err_7d
FROM companies c ORDER BY c.display_name;
```

### Re-verificar bug do desconto
```sql
SELECT e.name, er.date, er.error_type, er.error_count, er.error_value,
  p.daily_rate, p.total,
  (p.daily_rate + COALESCE(p.bonus_b,0) + COALESCE(p.bonus_c1,0) + COALESCE(p.bonus_c2,0)) - p.total AS desconto_em_total
FROM error_records er
JOIN employees e ON e.id = er.employee_id
JOIN payments p ON p.employee_id = er.employee_id AND p.date = er.date
WHERE er.company_id = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc'
  AND er.date >= CURRENT_DATE - INTERVAL '14 days'
ORDER BY er.date DESC LIMIT 30;
```

### Re-confirmar divergência edge fn
```ts
// Comparar com source no repo
mcp__claude_ai_Supabase__get_edge_function({
  project_id: 'flcncdidxmmornkgkfbb',
  function_slug: 'employee-public-api'
})
```

---

*Mantido por Victor + Claude Opus 4.7. Última sessão: 2026-05-27.*
