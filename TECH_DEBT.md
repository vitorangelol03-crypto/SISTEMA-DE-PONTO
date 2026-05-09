# TECH_DEBT — Sistema de Ponto

> Documento auditado em **2026-05-09** (sub-fase 4.0). Cada entry
> tem evidência concreta: linha de código, query SQL, hash de
> migration ou commit. Categorias por severidade — bugs funcionais
> primeiro, resolvidas no fim.

---

## 🔴 Bugs funcionais ativos

### 6.10 — [Alta] `setPaymentPeriodAutoWeekly` corrompe config multi-empresa

**Local exato:** `src/services/database.ts:1873-1886` (setter) + `src/services/database.ts:1863-1871` (getter)

**Snippet do bug (auditoria 2026-05-09):**
```typescript
export const setPaymentPeriodAutoWeekly = async (
  enabled: boolean, updatedBy: string, companyId: string
): Promise<void> => {
  const { error } = await supabase
    .from('payment_period_config')
    .upsert([{
      id: 1,                    // ← HARDCODED
      auto_weekly: enabled,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
      company_id: companyId,    // ← passado mas não respeitado pelo onConflict
    }], {
      onConflict: 'id',          // ← deveria ser 'company_id'
    });
  if (error) throw error;
};
```

**Reprodução:**
1. Admin de Caratinga clica toggle → grava `auto_weekly: true` em row `id=1, company_id: caratinga_id`
2. Admin de Ponte Nova clica toggle → upsert sobrescreve row `id=1` com `company_id: pontenova_id`
3. Caratinga perde sua config; `getPaymentPeriodConfig(caratinga_id)` retorna agora vazio (filtra por company_id) — config aparenta sumir
4. Estado inconsistente: `auto_weekly` real está aplicado a Ponte Nova, mas Caratinga agora também não tem nenhuma row

**Severidade:** **Alta** — corrupção de dados multi-empresa. Bug ATIVO em produção; dispara assim que CD Logística começar a usar Ponte Nova com toggle Auto-Weekly.

**Solução estrutural:**
1. Migration: `ALTER TABLE payment_period_config ADD CONSTRAINT payment_period_config_company_id_key UNIQUE (company_id)` (após verificar 0 duplicatas via pre-check)
2. Refatorar `setPaymentPeriodAutoWeekly`: remover `id: 1` hardcoded, usar `onConflict: 'company_id'`
3. Adicionar teste E2E (na spec 19 ou similar) que valide isolamento real do toggle entre as duas empresas

**Status:** Pendente — **sub-fase 4.1** (próxima imediata após 4.0).

---

### 6.6 — [Média] `nightCreditMinutes` hardcoded em 0

**Local exato:** `src/services/database.ts:4712` (em `_previewBankHoursForEmployee`, helper compartilhado por preview + apply)

**Snippet do bug (auditoria 2026-05-09):**
```typescript
// L4706-4715
const result = applyBankHours({
  dailyRate: Number(paymentRow.daily_rate) || 0,
  jornadaMinutes,
  creditMinutes,
  debitMinutes,
  nightCreditMinutes: 0,    // ← HARDCODED
  nightDebitMinutes: 0,     // ← HARDCODED
  settings,
});
```

**Por que escalada:**
- `bankHoursCalculator.ts` aceita `nightCreditMinutes` parametricamente (L94, L201) — calculator puro tem suporte completo
- Schema banco tem `bank_hours_night_separate` BOOLEAN + `bank_hours_night_multiplier` NUMERIC (migration `combo_g_bank_hours_payment_settings` em 2026-05-03)
- UI exibe configurações funcionais
- Apenas o caller único (compartilhado preview+apply, comentário L4498-4510) hardcoda 0
- Multiplier aplica em base 0 → contribuição sempre 0 mesmo com toggle ativo

**Impacto:** delivery workers da CD Logística com turnos noturnos (22h-05h) estão sendo subpagos (banco horas noturno não acumula). Empresa em risco trabalhista.

**Severidade:** Média.

**Solução estrutural:**
Implementar `calcNightHours(attendances, dateRange)` que conta minutos entre `entry_time` e `exit_time` que caem na faixa 22h-05h. Lógica similar já mencionada em outros pontos do sistema. Portar pra `_previewBankHoursForEmployee` e passar valor real em vez de 0.

**Status:** Pendente — sub-fase futura.

---

### 6.8 — [Média] `applyBankHoursToPayment` sem rollback transacional (3 operações)

**Local exato:** `src/services/database.ts:4783-4839`

**Sequência atual (auditoria 2026-05-09):**
1. **L4785-4794** — UPDATE payment (`bank_hours_amount`, `bank_hours_minutes`, `bank_hours_applied_at`, `total`) — `throw` em error
2. **L4799-4827** — INSERT `bank_hours_application_log` (14 campos de auditoria) — `console.error` em logErr (best-effort)
3. **L4829-4839** — UPDATE attendance `zero_balance` (`bank_credit_minutes=0, bank_debit_minutes=0` no range) — `console.error` em zeroErr (best-effort)

**Comentário inline L4797:** `// Log de auditoria — falha aqui não rollbacka (best-effort).`

**Δ vs versão anterior do TECH_DEBT:** versão anterior listava 2 operações best-effort. Real são **3** — UPDATE attendance zero_balance também é silenciosamente ignorado em falha.

**Estado inconsistente possível:**
- payment com `bank_hours_applied_at` setado + log faltando + attendance ainda com saldo (se zero_balance falhou, payment pode ser "duplo-aplicável" se supervisor reabrir)

**Severidade:** Média — em prod, falhas são raras (constraints simples), mas em incidente dificulta auditoria E pode quebrar idempotência.

**Solução estrutural:**
Envolver as 3 operações em RPC transacional Supabase. Idempotência via `bank_hours_applied_at` ainda funciona como guarda na 2ª tentativa.

**Status:** Pendente — sub-fase futura.

---

## 🟡 Inconsistências arquiteturais

### 6.11 — [Baixa] `geolocation_config` sem `UNIQUE(company_id)`

**Local:** tabela `public.geolocation_config`

**Validação Supabase MCP (2026-05-09):**
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.geolocation_config'::regclass
  AND contype = 'u';
-- → 0 rows (nenhum UNIQUE constraint)
```

Estado atual: Caratinga 1 row, Ponte Nova 0 rows.

**Risco:** edge fn `clock-in-validated` v5 usa `.maybeSingle()` assumindo no máximo 1 row por company_id. Se alguém INSERIR 2ª row pra mesma empresa, comportamento indefinido (pega linha aleatória).

**Severidade:** Baixa (latente, não ativo).

**Solução estrutural:**
```sql
-- Pre-check obrigatório:
SELECT company_id, count(*) FROM geolocation_config
GROUP BY company_id HAVING count(*) > 1;
-- Se 0 conflitos:
ALTER TABLE public.geolocation_config
  ADD CONSTRAINT geolocation_config_company_id_key UNIQUE (company_id);
```

**Status:** Pendente — sub-fase futura.

---

### 6.12 — [Baixa] Edge fn writes sem error handling

**Local:** `supabase/functions/clock-in-validated/index.ts` (versão 5 ACTIVE em prod, hash `a841de37...`)

**Localizações exatas (auditoria 2026-05-09):**
- L227 — `INSERT geo_fraud_attempts` (caso "localização não fornecida")
- L241 — `UPSERT bonus_blocks` (caso "localização não fornecida")
- L278 — `INSERT geo_fraud_attempts` (caso "fora da área permitida")
- L292 — `UPSERT bonus_blocks` (caso "fora da área permitida")

**Padrão problemático nas 4 ocorrências:**
```typescript
await supabase.from("geo_fraud_attempts").insert([{...}]);
// ↑ sem destructuring { error }, sem try/catch, sem log
```

**Risco:** se RLS rejeitar, constraint falhar ou conexão cair → fluxo continua como se tivesse gravado. Fraude pode ficar sem registro.

**Severidade:** Baixa.

**Solução estrutural:**
Capturar `{ error }` em cada chamada e logar em `error_logs`. Atomicidade desejável só se geo_fraud + bonus_block precisarem ser consistentes — caso contrário, log independente é suficiente.

**Status:** Pendente — sub-fase futura.

---

### 6.14 — [Baixa] `eslint-disable` em `useEffect` (3 ocorrências)

**Locais exatos (auditoria 2026-05-09):**
- `src/components/datamanagement/DataManagementTab.tsx:66`
- `src/components/admin/AdminTab.tsx:241`
- `src/components/admin/AdminTab.tsx:247`

**Δ vs versão anterior:** anteriormente listada como 2 ocorrências em 2 arquivos. Real são **3** ocorrências (AdminTab tem 2, não 1).

**Snippet representativo (`DataManagementTab.tsx:64-67`):**
```typescript
useEffect(() => {
  loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [company?.id]);
```

**Severidade:** Baixa — funciona corretamente, mas eslint-disable suprime warnings reais.

**Solução estrutural:**
Envolver `loadData`/`loadFaceConfig`/`loadFaceAttempts`/`loadCleanupConfig` em `useCallback([company?.id])` e adicionar no deps array. Padrão idiomático já usado em `TriageTab.tsx`, `PaymentPeriodsTab.tsx`.

**Status:** Pendente — sub-fase futura.

---

### 6.15 — [Baixa] Estados UI persistem cross-empresa (C6PaymentTab)

**Local:** `src/components/c6payment/C6PaymentTab.tsx:57-59`

**Estado atual (auditoria 2026-05-09):**
```typescript
useEffect(() => {
  loadEmployees();
}, [company?.id]);
```

`loadEmployees` (L61-70) só atualiza `employees`. **Não toca em** `paymentRows`, `dataImported`, `selectedRows`, `inlineEdit`, `editingRowId`, `editValues`.

`setPaymentRows([])` aparece apenas em `handleClearData` (L324-330) — cleanup MANUAL via botão "Limpar Dados".

**Impacto:** ao trocar de empresa via header, paymentRows da empresa anterior continuam visíveis até admin clicar "Limpar". UX confusa, sem vazamento de dados (IDs únicos garantem lookup falha silenciosamente).

**Severidade:** Baixa.

**Solução estrutural:**
Adicionar segundo useEffect com `[company?.id]` que limpa os 6 estados acima. Auditar Wave 3 inteira por padrão similar (outros componentes podem ter mesma issue).

**Status:** Pendente — sub-fase futura.

---

### 6.16 — [Baixa] `admin_cleanup_config` funciona como singleton de fato

**Local:** tabela `public.admin_cleanup_config`

**Δ vs versão anterior:** anteriormente listada como "tabela GLOBAL". Real (validado via Supabase MCP 2026-05-09): tabela TEM `company_id` (FK pra companies + coluna nullable=NO), mas sem UNIQUE constraint nessa coluna; PK em `id` (string).

**Estado atual (1 row):**
```json
{
  "id": "default",
  "enabled": true,
  "interval_months": 3,
  "company_id": "6583bb2a-...",  // Caratinga
  "next_cleanup_at": "2026-07-17 19:46:36",
  "updated_at": "2026-04-17 19:46:36"
}
```

Funciona como singleton de fato. Ponte Nova ainda não tem config própria.

**Severidade:** Baixa — cenário não bloqueia uso enquanto Ponte Nova não tiver auto-cleanup configurado.

**Solução (escolher uma):**
1. **Operacional:** cadastrar manualmente row de admin_cleanup_config pra Ponte Nova (`INSERT ... company_id=pontenova_id`).
2. **Estrutural:** alterar `runAutoCleanup` (`database.ts:4096-4117`) pra criar row lazy quando não existe. Migration adicional: `UNIQUE(company_id)` na tabela.

**Status:** Pendente — escolher abordagem em sub-fase futura.

---

## 🟢 Performance / qualidade

### 6.7 — [Baixa-Média] N+1 queries em `previewBankHoursForPeriod`

**Local:** `src/services/database.ts:4860-4887`

**Comentário inline em L4861:** `// N+1 consciente (cada employee dispara 5 queries via helper); pode otimizar pra batch no futuro se a empresa tiver muitos funcionários.`

**Snippet (auditoria 2026-05-09):**
```typescript
for (const emp of (employees ?? [])) {
  const preview = await _previewBankHoursForEmployee({...});
  items.push(...);
}
```

Loop sequencial puro — sem `Promise.all`, sem batch SQL.

**Impacto:** modal "Aplicar banco de horas" com 30+ funcionários da Caratinga dispara ~150 queries sequenciais (5 × 30). Tempo de carregamento ~30-60s.

**Severidade:** Baixa-Média — funciona, mas demora. Aceitável até ~50 employees, ruim a partir de 100+.

**Solução estrutural:**
Refatorar pra batch SQL com `WHERE employee_id IN (...)`. Possível redução: 150 → 5 queries.

**Status:** Pendente — otimização futura.

---

## 🟢 Testes — fragilidade conhecida

### 6.1 — [Baixa] Flake C6 — helper `importC6`

**Local atual:** `tests/20-c6-complete.spec.ts:39` (helper `importC6`)

**Δ vs versão anterior:** versão anterior listava 6 ocorrências espalhadas (linhas 51, 68, 109, 139, 167, 183). Refactor centralizou tudo no helper L39 — 1 ocorrência única.

**Pattern:** `getByText(/importado/)` timeout 15s

**Causa raiz:** race condition entre import e UI render do toast (toast desaparece em 4-5s, depende de quando importação termina).

**Severidade:** Baixa.

**Status:** Pendente — investigar como sub-fase isolada.

---

### 6.3 — [Baixa] Skip-condicional UI-dependente (causa refinada)

**Δ vs versão anterior:** versão anterior hipotetizou "test.skip() data-dependente (virada 30/04→01/05)". Auditoria 2026-05-09 confirmou: causa real é **skip CONDICIONAL UI-dependente**, não data-dependente.

**Padrão problemático:**
```typescript
const elem = page.getByPlaceholder(/Buscar/i).first();
if (!(await elem.isVisible().catch(() => false))) {
  test.skip(true, '<motivo>');
}
```

**9 testes com esse padrão:**
- `tests/15-attendance-complete.spec.ts:184` (bulk-approve)
- `tests/16-financial-complete.spec.ts:133` (busca por nome)
- `tests/16-financial-complete.spec.ts:149` (filtro employment_type)
- `tests/16-financial-complete.spec.ts:197` (aba Histórico)
- `tests/19-payment-periods-complete.spec.ts:103` (toggle auto-weekly)
- `tests/07-financial.spec.ts:43` (sem pagamentos no período)
- `tests/20-c6-complete.spec.ts:151` (edição inline)
- `tests/24-admin-complete.spec.ts:72` (toggle facial global)
- `tests/24-admin-complete.spec.ts:102` (listagem facial individual)

**Variação observada anteriormente:** 154 passed/26 skipped/1 failed ↔ 153 passed/27 skipped/1 failed. Skip oscila com timing/ordem dos testes.

**Severidade:** Baixa — cobertura E2E reduzida quando skip dispara.

**Status:** Pendente — entry 6.9 detalha subset desses 9.

---

### 6.4 — [Baixa] Bug data futura `tests/10-errors.spec.ts:107`

**Local exato:** `tests/10-errors.spec.ts:107` (no teste "Triagem: sub-aba abre e permite registrar erro do dia", L98)

**Snippet do bug (auditoria 2026-05-09):**
```typescript
const today = new Date();
// Garante data no mês atual mas futura, pra não colidir
const d = new Date(today.getFullYear(), today.getMonth(), 28);
```

**Causa raiz:** quando hoje < dia 28, a data fica no FUTURO, e a regra de negócio "Nenhum funcionário presente nesta data — distribuição impossível" bloqueia o submit.

**Reprodução:** hoje 2026-05-09 → cálculo `new Date(2026, 4, 28)` → 2026-05-28 (futuro) → toast não aparece → expect timeout 10s falha.

**Severidade:** Baixa — bug é de teste, não de produção. Regra de negócio é correta.

**Solução proposta:**
```typescript
// Trocar pra data passada:
const d = new Date(today.getFullYear(), today.getMonth() - 1, 15);
```

**Status:** Pendente — fix trivial, sub-fase de cleanup de testes.

---

### 6.9 — [Baixa] 7 testes reescritos com skip condicional UI

**Δ vs versão anterior:** versão anterior listava 7 testes "permanentemente skipped por seletor desatualizado". Auditoria 2026-05-09 confirmou: **todos foram reescritos com skip CONDICIONAL UI-dependente** (subset dos 9 listados em 6.3).

| Localização original | Localização atual | Tipo |
|---|---|---|
| 16-financial:126 | `tests/16-financial-complete.spec.ts:133` | condicional |
| 16-financial:142 | `tests/16-financial-complete.spec.ts:149` | condicional |
| 16-financial:177 | `tests/16-financial-complete.spec.ts:197` | condicional |
| 15-attendance:166 | `tests/15-attendance-complete.spec.ts:184` | condicional |
| 20-c6:139 | `tests/20-c6-complete.spec.ts:151` | condicional |
| 24-admin:62 | `tests/24-admin-complete.spec.ts:72` | condicional (com fallback de label L75) |
| 24-admin:89 | `tests/24-admin-complete.spec.ts:102` | condicional |

**Implicação:** cobertura real é incerta. Skip pode disparar em runs onde UI estado ≠ esperado, mascarando fragilidade. Em runs felizes, testes passam silenciosamente.

**Severidade:** Baixa — funcionalidade existe e funciona em produção (validação manual), vitest cobre lógica subjacente em vários casos.

**Solução estrutural:**
1. Rodar full suite isolada N vezes (ex: 5x consecutivos)
2. Identificar quais SEMPRE pulam (= seletor genuinamente quebrado, precisa reescrita)
3. Identificar quais às vezes passam (= flake intermitente, investigar timing)
4. Tratar cada caso individualmente (~2-3h trabalho total)

**Status:** Pendente — sub-fase futura "Audit dos 7 testes condicionais".

---

### 6.17 — [Baixa] Flake `tests/24-admin-complete.spec.ts:49` sob carga

**Local exato:** `tests/24-admin-complete.spec.ts:49` (teste "senha errada → 'Senha incorreta'")

**Pattern (auditoria 2026-05-09):**
```typescript
await expect(
  page.getByText(/Senha incorreta/i).first()
).toBeVisible({ timeout: 10_000 });
```

**Sintoma:** passa em isolamento (6.2s), falha sob carga de full suite Playwright (timeout 10s). Reproduzido na validação 3.5 prep da Etapa 3.

**Severidade:** Baixa.

**Solução proposta:**
- Aumentar timeout pra 15-20s; OU
- Substituir por `data-testid` mais específico; OU
- Isolar em retry block

**Status:** Pendente — não bloqueante.

---

## 🟢 Testes E2E não escritos (sub-fase 3.4)

### 6.18 — [Baixa] C6PaymentTab isolamento UI multi-empresa

**Status:** NÃO ESCRITO.

**Contexto:** C6PaymentTab tem fluxo ativo (clicar "Importar" + esperar toast/tabela) que torna teste E2E susceptível a flake (toast desaparece em 4-5s, timing dependente de quando a importação termina).

**Cobertura preservada:**
- Spec 25 valida isolamento banco
- Backend refactor (3.1a/3.1b) garante company.id obrigatório
- Componente refatorado em commit `b077a0d` (Wave 3)

**Solução proposta:**
- Mock de `getEmployeeNetPayments` retornando lista vazia
- Verificar UI sem timing de toast
- OU teste manual de release + checkpoint visual

**Status:** Pendente — sub-fase futura.

---

### 6.19 — [Baixa] SettingsTab isolamento UI multi-empresa

**Status:** NÃO ESCRITO.

**Contexto:** SettingsTab não tem padrão "estado vazio" — sempre mostra inputs com valores (defaults sistema OU valores específicos da empresa). Pra testar isolamento, precisaria valores DIFERENTES em Caratinga e Ponte Nova pré-condicionados (não temos em Ponte Nova hoje).

**Cobertura preservada:**
- Spec 25 valida isolamento banco (`bonus_defaults`)
- Backend refactor garante company.id obrigatório
- Componente refatorado em commit `8a3282f` (Wave 2)

**Solução proposta:**
- Fixture criando `bonus_defaults` distintos em ambas empresas
- Teste valida que ao trocar empresa, valores dos inputs mudam

**Status:** Pendente — sub-fase futura.

---

### 6.20 — [Baixa] TriageTab isolamento UI multi-empresa

**Status:** NÃO ESCRITO.

**Contexto:** `TriageTab.tsx:51-68` carrega registros via `getTriageErrors(first, last, company.id)` onde `first/last` são derivados internamente de `getBrazilDate()`, formando range do primeiro ao último dia do mês corrente. **Não há controle de UI** pra alterar o range temporal (sem inputs, sem dropdown, sem botão "mês anterior").

No estado atual do banco (validado 2026-05-09): todos os 8 triage_errors de Caratinga estão em abril/2026, ZERO em maio/2026. Em maio, tanto Caratinga quanto Ponte Nova mostram "Nenhum registro neste mês" — não distingue isolamento via UI.

**Cobertura preservada:**
- Spec 25 (RLS/banco) valida isolamento de `getTriageErrors` por company_id
- Refactor 3.1a/3.1b garante company.id obrigatório no service layer
- Componente refatorado em commit `e165fd3` (Wave 3)

**Solução proposta:**
- Fixture de `triage_error` em mês corrente pra Caratinga com cleanup automático; OU
- Controle de UI pra navegar entre meses (mudança de produto, fora do escopo da sub-fase 3.4)

**Status:** Pendente — sub-fase futura.

---

### 6.21 — [Baixa] AdminTab Bloqueios de Bonificação isolamento UI

**Status:** NÃO ESCRITO.

**Contexto:** A section "Bloqueios de Bonificação" (`AdminTab.tsx:1137-1240`) usa filtro client-side `blockActiveOnly` default true (L105 do componente), que oculta blocks com `week_end < hoje`.

O único `bonus_block` de Caratinga (id `a2c1424f`) tem `week_end=2026-04-26` (expirado em 2026-05-09), então é filtrado pelo blockActiveOnly e não aparece na UI. Tanto Caratinga quanto Ponte Nova mostram "Nenhum bloqueio encontrado" — não distingue isolamento via UI no estado atual do banco.

**Nota:** as outras 3 sections testáveis do AdminTab (Geo, Histórico Facial, Suspeitas) ESTÃO cobertas no Teste 9 da spec 26.

**Cobertura preservada:**
- Spec 25 (RLS/banco) valida isolamento de `getBonusBlocks` por company_id
- Refactor 3.1a/3.1b + commit `f506f3c` garantiram isolamento correto

**Solução proposta:**
- Fixture de `bonus_block` ATIVO em Caratinga com cleanup automático; OU
- Toggle UI pra `blockActiveOnly` false e clicar antes do assert (mais teste, mais frágil)

**Status:** Pendente — sub-fase futura.

---

## 🔘 Aceitos (não-bug, característica conhecida)

### 6.13 — Cold start latency edge fn ~1.1s

**Local:** Edge function `clock-in-validated` (Deno runtime).

**Comportamento:** primeira invocação pós-deploy leva ~1.1-1.2s (JIT + bundle compile). Warm latency volta a ~0.2-0.3s rapidamente. **Característica padrão do Deno Deploy / Supabase Edge Runtime** — não é bug.

**Impacto operacional:** funcionários sentem isso só após deploys (raros). 1.1s é aceitável pro caso de uso (clock-in não é tempo-crítico).

**Mitigação possível (não prioritária):** warming via cron pós-deploy ou primeira requisição mock.

**Status:** ACEITO como overhead conhecido.

---

## ✅ Histórico — Resolvidas

### 2026-05-05 — 6.5: Migrations multi-empresa em produção

**Migrations aplicadas em prod:**
- `20260505203905_unique_cpf_per_company` → `employees.UNIQUE(cpf, company_id)`
- `20260505203944_unique_triage_date_per_company` → `triage_errors.UNIQUE(date, company_id)`

**Validação:** Supabase MCP em 2026-05-09 confirmou ambas as constraints ATIVAS em prod via `supabase_migrations.schema_migrations`.

**Consequência:** os 2 `test.fixme` da spec 25 (#3 CPF idêntico em 2 empresas L158, #9 triage_errors isolado por empresa L330) foram destravados em commit `0db258b` (anterior à esta auditoria). Hoje rodam como `test()` ativos.

---

### 2026-05-04 — 6.2: Edge fn `clock-in-validated` v5 deployed

**Versão atual em prod:** 5 (status: ACTIVE)

**Hash:** `a841de3711f1974912459ce438a17c7c54a5e89be87372fada6c23bd73342a56`

**Validação:** Supabase MCP em 2026-05-09 confirmou v5 ATIVE via `list_edge_functions`. `updated_at` timestamp: `1778063825490` ms (≈ 2026-05-04 14:37 UTC).

**Conteúdo da v5:** suporte a `marking_position 1|2|3|4` para 4 marcações por dia (entry_1, exit_1, entry_2, exit_2).
