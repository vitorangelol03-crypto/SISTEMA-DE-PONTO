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

### 6.23 — [Baixa-Média] `validatePixKey` em c6Export não normaliza CPF/CNPJ formatado

**Local:** `src/utils/c6Export.ts:32-48` (função interna não-exportada).

**Comportamento descoberto na sub-fase 6.3 (auditoria de testes):**
```typescript
const cleanKey = pixKey.replace(/[^\w@.-]/g, ''); // mantém . e -
return cpfRegex.test(cleanKey) || ...
// onde cpfRegex = /^\d{11}$/
```

O regex `cleanKey` remove apenas caracteres FORA de `[\w@.-]`. Pontos e hífens são MANTIDOS. CPF `'123.456.789-01'` (formato padrão de exibição) NÃO bate `/^\d{11}$/` e é marcado como `VERIFICAR` na planilha C6.

**Impacto operacional:**
- Funcionários cadastrados com PIX em formato `XXX.XXX.XXX-XX` (CPF formatado) viram VERIFICAR no relatório.
- Status incorreto pode atrasar pagamento se admin confiar cegamente na coluna Status.
- Mitigação atual: admin precisa cadastrar `pix_key` sem pontuação.

**Severidade:** Baixa-Média — não bloqueia pagamento (sheet ainda exporta), mas confunde admin. Risco maior em empresas com importação automática de PIX (não controlam formato).

**Solução estrutural sugerida:**
```typescript
// Trocar regex de limpeza pra remover TUDO que não é número (pra CPF/CNPJ/phone)
const cleanDigits = pixKey.replace(/\D/g, '');
const cleanKey = pixKey.replace(/[^\w@.-]/g, ''); // mantém pra email/UUID
return cpfRegex.test(cleanDigits) || cnpjRegex.test(cleanDigits) ||
       emailRegex.test(pixKey) || phoneRegex.test(cleanDigits) ||
       randomKeyRegex.test(cleanKey);
```

E adicionar test cases pra CPF/CNPJ com pontuação retornar OK.

**Status:** Pendente — sub-fase futura (fix trivial, mas precisa coordenação com cadastros existentes pra não invalidar PIX que hoje passa como `VERIFICAR` mas era válido apesar do formato).

---

### 6.22 — [Média] Estados UI persistem cross-empresa em múltiplas tabs (audit Wave 3)

**Origem:** auditoria executada na sub-fase 5.5 após resolver 6.15 (C6PaymentTab). Confirmou que o padrão é comum: o `useEffect([company?.id])` em cada tab recarrega listas (employees/payments/attendance) mas NÃO zera estados locais com referências a IDs da empresa anterior.

**Severidade Alta (vazamento UX concreto com IDs de funcionário):**

| Tab | Estados que persistem cross-empresa | Linha | Status |
|---|---|---|---|
| `EmployeesTab.tsx` | `selectedIds: Set<string>` (bulk), `editingEmployee: Employee`, `pinModal: { employee }`, `resetModal: { employee }`, `importValidation`, `importFile`, `importStep`, `validationContext`, `editingCell` | 79, 47, 84, 88, 91-101 | ✅ **Resolvido sub-fase 5.6** |
| `AttendanceTab.tsx` | `selectedEmployees: Set<string>`, `exitTimes: Record<empId, ...>`, `manualTimes: Record<empId, ...>`, `bonusAmounts: Record<code, ...>`, `applyingBonus: Record<code, ...>`, `employeeToReset: string`, `bonusTypeToRemove` | 51-53, 59-61, 65-69 | Pendente |
| `FinancialTab.tsx` | `selectedEmployees: Set<string>`, `editingPayment: {employeeId, date}`, `editValues`, `selectedPeriodId` | 90-92, 86 | Pendente |
| `DataManagementTab.tsx` | `selectedEmployee: string` (id), wizard state (`confirmStep`, `confirmPassword`, `selectedDataTypes`, `previewCounts`, `showPreview`, `isProcessing`) | 46-53 | Pendente |

**Severidade Média (modais com state, mas sem ID direto):**

| Tab | Estados |
|---|---|
| `UsersTab.tsx` | `selectedUser`, `userPermissions`, `showPermissionsModal` (linha 23-25) |
| `ErrorsTab.tsx` | `editingError: {employeeId, date}`, `employeesWithErrors`, `statistics` |
| `FinancialTab.tsx` | `bulkDailyRate`, `errorDiscountValue`, `historyFilters`, `bonusRemovals` |
| `PaymentPeriodsTab.tsx` | `showForm`, `formData` (formulário aberto com dados da empresa anterior) |

**Severidade Baixa (filtros UX — decisão de produto se reset ou persistir):**

| Tab | Filtros |
|---|---|
| Várias | `searchTerm`, `cityFilter`, `stateFilter`, `employmentTypeFilter`, `selectedDate`, `filters.startDate/endDate` |

**Solução estrutural recomendada:**
1. Para cada tab listada em Severidade Alta: adicionar 2º useEffect com `[company?.id]` que zera explicitamente os estados ID-based (similar ao fix aplicado em C6PaymentTab — sub-fase 5.4).
2. Para Severidade Média: avaliar caso a caso (modal aberto ao trocar empresa pode ser confuso mas raro).
3. Para Severidade Baixa: decisão de UX — atualmente filtros persistem, pode ser intencional.

**Achado adicional:** auditoria também detectou 4ª ocorrência de `// eslint-disable-next-line react-hooks/exhaustive-deps` em `src/components/employees/EmployeesTab.tsx:120` — não estava listada no TECH_DEBT 6.14 original (que listava 3). Será resolvida na sub-fase 5.6 junto com cleanup de estados de EmployeesTab.

**Status:** Pendente — fixes individuais ficam pra Victor priorizar. Recomendação: atacar Severidade Alta agora (3-4 sub-fases de ~30 min cada), Severidade Média junto com refactor futuro.

---




## 🟢 Performance / qualidade

(Sem itens pendentes — 6.7 movido pra histórico em 2026-05-11, sub-fase 8.1.)

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

### 2026-05-11 — 6.6: nightCreditMinutes real (D1=C diurno primeiro) (sub-fase 8.3)

**Decisão D1 = C** confirmada pelo Victor em 2026-05-11. Algoritmo "diurno primeiro": expected é consumido pelas horas diurnas primeiro; sobra noturna vira `nightCreditMinutes`. Favorável ao funcionário, comum em folha CLT brasileira.

**Fórmula validada com dados reais** (sample Caratinga 2026-04-18: `daytime=307, night=179, expected=240, credit=246` → `daytime_extra=67, night_credit=179` ✓):
```typescript
// Por attendance:
daytime_extra  = max(0, daytime_minutes - expected_minutes)
nightCreditDay = max(0, bank_credit_minutes - daytime_extra)
// Total: sum nightCreditDay sobre todas attendances do range
// nightDebitMinutes = 0 sempre (conservador — todo débito tratado como diurno)
```

**Código alterado em `src/services/database.ts`:**

1. **Novo helper puro `_sumBankBalanceWithNight(attendances)`**: aplica fórmula D1=C por dia, retorna `{ creditMinutes, debitMinutes, nightCreditMinutes, nightDebitMinutes }`.

2. **`_previewBankHoursForEmployee`** (single, apply): SELECT inclui `daytime_minutes, nighttime_minutes, expected_minutes`; usa helper; passa `nightCreditMinutes`/`nightDebitMinutes` reais ao invés de `0` hardcoded.

3. **`previewBankHoursForPeriod`** (batch, sub-fase 8.1): SELECT batch inclui as 3 colunas extras; agrupa por employee + helper por grupo; balance Map ganha night fields.

4. **`_calcPreviewFromBatch`** (helper batch): interface `_BatchPreviewInputs` expandida com night fields; passa pra `applyBankHours`.

**Validações REAIS via MCP (padrão "validar tudo real"):**

| # | Validação | Resultado |
|---|---|---|
| 1 | Pre-check Caratinga: distribuição attendance | 3130 total, 316 com nighttime>0 (~10%), 5 com credit>0, 29 com debit>0 |
| 2 | Sample real testando a fórmula via SQL `SELECT daytime, night, expected, credit, max(0,daytime-expected) AS daytime_extra, credit - max(0,daytime-expected) AS night_credit_day FROM attendance` | 5 samples conferiram cálculo |
| 3 | Suite unit completa (414 testes) | 414/414 passed (+6 testes novos cobrindo todos os 6 cenários da fórmula com night_separate=true) |
| 4 | Spec E2E 27 (bank-hours-payment): 5 testes | 5/5 passed |
| 5 | Spec E2E 29 (bank-hours-integrity): 5 testes E2E reais (apply, idempotência, override) | 5/5 passed |
| 6 | tsc --noEmit | 0 erros |

**Cenários cobertos pelos 6 testes novos:**
1. Sample REAL Caratinga (night=179, day=307, exp=240, credit=246): amountCredit=69.90 ✓
2. 100% diurno (day=600, night=0, exp=480, credit=120): toda day, amountCredit=25.00
3. 100% noturno (day=0, night=540, exp=480, credit=60): toda night, amountCredit=18.75 (com multiplier 1.5)
4. daytime < expected (day=240, night=300, exp=480, credit=60): todo night_credit, amountCredit=18.75
5. Multiplas attendances mistas (1 dia diurno + 1 dia noturno): cálculo POR DIA correto, amountCredit=43.75
6. `night_separate=false`: nightCreditMinutes calculado mas IGNORADO pelo calculator, amountCredit=12.50

**Impacto pra produção:** CD Logística (Ponte Nova) com turnos 22h-05h agora pode ATIVAR `bank_hours_night_separate=true` + `bank_hours_night_multiplier` e o banco horas noturno acumula corretamente. Pré-fix, multiplier era aplicado em base 0 (sempre zero contribuição). Risco trabalhista mitigado.

---

### 2026-05-11 — 6.7: N+1 queries em previewBankHoursForPeriod (sub-fase 8.1)

**Refator aplicado em `src/services/database.ts`** — função `previewBankHoursForPeriod` (linhas ~4815-4860 antes do refator) reescrita pra batch.

**Antes** (N+1 sequencial): loop `for (const emp of employees)` chamando `_previewBankHoursForEmployee` que dispara 5 queries por employee. Para 30 employees Caratinga: **150 queries sequenciais**.

**Depois** (batch fixo): 6 queries totais em 3 `Promise.all`:
- **Batch 1** (paralelo): `companies` (1 row) + `payment_periods` (1 row)
- **Batch 2** (paralelo): `employees` (rows do company_id) + `bank_hours_overrides` (rows IN employees)
- **Batch 3** (paralelo): `payments` (rows IN employees + range) + `attendance` (rows IN employees + range)

Após o batch, cálculo é 100% in-memory via Map<employeeId, ...> indexing. Loop pos-fetch é zero-query, chama helper puro `_calcPreviewFromBatch` (extraído).

**Função `_previewBankHoursForEmployee` (single-shot) mantida intacta** — caminho usado por `applyBankHoursToPayment` é diferente (1 employee só, faz sentido ser single).

**Validações REAIS via MCP (padrão "validar tudo real"):**

| # | Validação | Resultado |
|---|---|---|
| 1 | Pre-check volume Caratinga | 30 employees, 3130 attendances, 1722 payments, 28 payment_periods |
| 2 | EXPLAIN ANALYZE query antiga (single payment, 1 employee) | Planning 0.964ms + Execution 0.119ms = ~1.08ms por query × 30 = ~32ms (apenas SQL, sem round-trip) |
| 3 | EXPLAIN ANALYZE query nova (batch IN, 30 employees) | Planning 1.307ms + Execution 0.438ms = ~1.75ms total, retorna 191 rows |
| 4 | Estimativa de round-trips de rede | Antigo: 150 round-trips sequenciais (≈ 5-30s em rede prod). Novo: 3 round-trips paralelos (≈ 100-500ms). |
| 5 | Suite unit `applyBankHoursToPayment.spec.ts` | 38/38 passed (7 testes de previewBankHoursForPeriod reescritos pra refletir batch flow) |
| 6 | Spec E2E 27 (bank-hours-payment) | 5/5 passed sem regressão |
| 7 | `tsc --noEmit` | 0 erros |

**Limitação reconhecida:** medição de tempo end-to-end (round-trip real Caratinga via app) requer rodar UI em browser real. Não medido nesta sub-fase porque exigiria fixtures pesadas; EXPLAIN ANALYZE + redução de 150→6 queries dá confiança suficiente do ganho.

---

### 2026-05-11 — 6.12: Edge fn v6 — error handling em 4 writes silenciosos (sub-fase 8.4)

**Deploy em prod:** `clock-in-validated` v6 ACTIVE — hash `ff0b9dd72005...` (substitui v5 hash `a841de37...`).

**Localizações dos 4 writes corrigidos** (linhas referentes à versão v5):
- L227 — `INSERT geo_fraud_attempts` (caso "localização não fornecida")
- L241 — `UPSERT bonus_blocks` (idem)
- L278 — `INSERT geo_fraud_attempts` (caso "fora da área permitida")
- L292 — `UPSERT bonus_blocks` (idem)

**Solução aplicada na v6:** cada um dos 4 writes capturado via destructuring `{ error }`. Se erro, chama helper interno `logEdgeError(supabase, {...})` que persiste em `error_logs` com:
- `company_id` (FK pra companies — sub-fase 7.4)
- `user_id = employee_id`
- `error_type = 'database_error'`, `severity = 'high'`
- `component = 'edge:clock-in-validated'`, `module = 'edge-function'`
- `error_context = { db_error_message, db_error_code, edge_function_version: 6, ...contexto específico }`

Logger é **best-effort**: rodeado por try/catch silencioso, não interrompe fluxo principal (writes eram auxiliares — geo_fraud_attempts é diagnóstico, bonus_blocks é bloqueio que pode reaplicar). Mantém semântica original.

**Validações REAIS via MCP (padrão "validar tudo real"):**

| # | Validação | Resultado |
|---|---|---|
| 1 | Conteúdo remoto v5 obtido via `get_edge_function` | Hash bate com TECH_DEBT (`a841de37...`) |
| 2 | Logs últimas 24h via `get_logs(edge-function)` | Sem erros recorrentes pré-deploy |
| 3 | Deploy v6 via `deploy_edge_function` | success: true, version: 6 |
| 4 | `list_edge_functions` pós-deploy | v6 ACTIVE, hash `ff0b9dd72005...` |
| 5 | Spec 02 (employee-clock) — 9 testes | 9/9 passed |
| 6 | Spec 08 (geolocation) — 4 testes que ATIVAM os 4 writes (caminhos no_coords + outside_radius) | 4/4 passed |
| 7 | `error_logs` pós-spec | total=0, edge_v6_logs=0 (writes funcionaram, logEdgeError não disparou false-positive) |

**Limitação reconhecida:** validação de fail-path (write FALHANDO e logEdgeError EFETIVAMENTE logando) requer cenário de constraint violation ou RLS reject. Em prod atual (sem RLS, FKs validadas pré-write) não há como simular falha sem mexer em dados. Pra cobertura completa, seria preciso teste E2E com mock de supabase no Deno — fora do escopo desta sub-fase.

**Commits relacionados:**
- Migration `20260511171757_error_logs_add_company_id` (7.4) habilitou o destino do log.
- Deploy v6 + arquivo local sincronizado em `supabase/functions/clock-in-validated/index.ts` (630 linhas).

---

### 2026-05-11 — 6.24: `error_logs` sem `company_id` (sub-fase 7.4)

**Descoberta nova:** detectada na varredura de produção em 2026-05-11. Tabela `error_logs` (criada na migration `20251104193550_create_monitoring_and_audit_system`) funcionava como singleton-de-fato — sem coluna `company_id`. Em sistema multi-tenant, erros de empresas distintas se misturariam no mesmo log global, impossibilitando auditoria isolada por empresa.

**Migration aplicada em prod:** `20260511171757_error_logs_add_company_id.sql`

**SQL:**
```sql
ALTER TABLE public.error_logs
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_company_id ON public.error_logs(company_id);
```

Coluna NULLABLE (não NOT NULL): cobre erros pré-login e fluxos globais sem contexto de empresa. FK `ON DELETE SET NULL` preserva logs históricos se uma empresa for removida (auditoria sobrevive).

**Validações REAIS via MCP (padrão "validar tudo real"):**

| # | Validação | Resultado |
|---|---|---|
| 1 | Pre-check schema atual | Confirmado SEM company_id (17 colunas) |
| 2 | Pre-check rows existentes | 0 rows (tabela nunca foi escrita) — sem backfill necessário |
| 3 | Grep callers no projeto | `errorTracking.ts` (service interno, 16+ refs) + `ErrorBoundary.tsx` (1 caller) — únicos |
| 4 | Schema pós-migration | `company_id` uuid nullable=YES, FK `error_logs_company_id_fkey` (contype='f') confirmada |
| 5 | Index criado | `idx_error_logs_company_id` BTREE em prod via `pg_indexes` |
| 6 | INSERT real simulando captureError pra 3 cenários | Caratinga (company_id=Caratinga), PN (company_id=PN), pré-login (NULL) — todos OK |
| 7 | SELECT filtrado por company_id confirma isolamento | Filtro Caratinga retorna 1, filtro PN retorna 1, admin global retorna 3, NULL retorna 1 |
| 8 | Cleanup das 3 rows de teste | Estado prod restaurado: 0 rows |

**Código alterado:**
- `src/services/errorTracking.ts`:
  - `ErrorLogData` interface ganha `companyId?: string` (com JSDoc explicando NULL).
  - `captureError` INSERT e UPDATE incluem `company_id: data.companyId ?? null`.
  - 6 helpers (`captureJSError`, `captureAPIError`, `captureDatabaseError`, `captureNetworkError`, `captureAuthError`, `captureValidationError`) ganham param optional `companyId?: string` no final da assinatura (retrocompat preservada).
- `src/components/common/ErrorBoundary.tsx`:
  - Import `getCurrentCompanyId` de `CompanyContext` (helper não-hook).
  - Passa `companyId: getCurrentCompanyId()` em `captureError`. Pre-login → DEFAULT_COMPANY_ID (Caratinga) — aceitável; melhor que NULL.

**Decisão técnica:** handlers globais (`window.addEventListener('error')` em `errorTracking.ts:49,63`) NÃO recebem companyId — passam `undefined`, persistido como NULL. Isso porque esses handlers rodam em escopo global onde não há garantia de contexto de empresa.

**Validação E2E:**
- `npx tsc --noEmit`: 0 erros
- `npx vitest run` (suite full): 408 passed em 16 files
- Validação real via MCP (steps 6-8 acima)

---

### 2026-05-11 — D6: cleanup `bonus_defaults` legacy (sub-fase 7.3)

**Decisão D6 = C** (drop após validar callers — investigação prévia confirmou que `bonus_types` é fonte primária; `bonus_defaults` era fallback nunca disparado em prod).

**Migration aplicada em prod:** `20260511170054_drop_bonus_defaults_legacy.sql` — `DROP TABLE IF EXISTS public.bonus_defaults`.

**Validações reais executadas via MCP (padrão "validar tudo real"):**

| # | Validação | Resultado |
|---|---|---|
| 1 | Dump completo de bonus_defaults pré-DROP | 3 rows Caratinga (B=15, C1=20, C2=15), 0 PN — salvo em `docs/bonus_defaults_legacy_dump_2026-05-11.json` |
| 2 | bonus_types cobre AMBAS empresas com B/C1/C2 active | 6 rows totais, ambas empresas com B=15/C1=20/C2=15 — paridade com bonus_defaults confirmada |
| 3 | Grep no projeto pra encontrar TODOS os callers de `bonus_defaults` (não só os 2 documentados) | Confirmados 2 callers únicos em `database.ts` + 1 smoke test |
| 4 | Baseline pré-mudança: SELECT bonus_types pra Caratinga e PN | B=15/C1=20/C2=15 pra ambas (caminho primário do `getBonusDefaults`) |
| 5 | Estado de bonus_defaults imediatamente antes do DROP | Inalterado desde dump (3 rows) |
| 6 | Tabela realmente sumiu pós-DROP | `information_schema.tables` retornou vazio |
| 7 | Comportamento idêntico pós-DROP via mesma query SQL | B=15/C1=20/C2=15 mantido pra ambas empresas |

**Código alterado (`src/services/database.ts`):**
- `getBonusDefaults` (L1502-1525) — removido bloco fallback bonus_defaults (15 linhas). Agora SÓ lê bonus_types.
- `updateBonusDefault` (L1527-1551) — removido UPDATE legacy em bonus_defaults (12 linhas). Agora SÓ atualiza bonus_types.
- Comentários atualizados explicitando descontinuação.

**Smoke test removido:** `tests/17-bonus-complete.spec.ts:67-72` (`'valores padrão (bonus_defaults) podem ser lidos e usados'`) — substituído por comentário linkando à cobertura nova em specs 25/26 (isolamento por company_id).

**Achado adicional NÃO relacionado:** spec 26 test 6 estava DESATUALIZADO (assumia PN com 0 users; dados em prod evoluíram — PN ganhou user '8888' admin em 2026-05-11 13:13 UTC). Refatorado pra ser robusto: busca counts reais do DB e valida (a) UI bate com count exato, (b) empresas têm counts distintos (isolamento de fato), (c) trocar empresa muda visualização. Spec 26 agora 9/9 estável.

**Validação E2E final:**
- `npx playwright test tests/04-bonus.spec.ts tests/17-bonus-complete.spec.ts --workers=1`: 10 passed, 2 skipped (esperado pelo 6.3/6.9)
- `npx playwright test tests/25-multi-company-isolation.spec.ts --workers=1`: 13/13 passed
- `npx playwright test tests/26-multi-company-ui-isolation.spec.ts --workers=1`: 9/9 passed
- `npx vitest run` (suite full): 408 passed em 16 files

---

### 2026-05-11 — 6.16: `admin_cleanup_config` UNIQUE + lazy-create (sub-fase 7.2 + 7.2.1)

**Migrations aplicadas em prod:**
- `20260511142612_admin_cleanup_unique_per_company` (sub-fase 7.2)
- `20260511143010_admin_cleanup_id_default_uuid` (sub-fase 7.2.1 — fix latente)

**Bug latente descoberto durante validação E2E (7.2.1):**
A coluna `id` (PK text) tinha `DEFAULT 'default'`. Caratinga ocupa `id='default'`. O upsert pra qualquer empresa NOVA tentaria INSERT com id='default' (não passado pelo app) e violaria PK. A sub-fase 7.2 inicial commitou o feature mas com esse bug latente — `tsc` e specs E2E NÃO pegaram porque nenhum teste exercitava o lazy-create real (admin sempre operava em Caratinga, que já tinha row).

Fix (7.2.1): `ALTER TABLE admin_cleanup_config ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;`. Caratinga preserva `id='default'` legado (UPDATE não toca id). Novas empresas ganham UUID auto.

**Validação E2E real executada via MCP em 2026-05-11:**
1. `SELECT * FROM admin_cleanup_config WHERE company_id = PN_ID` → 0 rows (estado inicial)
2. Simulado upsert do app: `INSERT ... ON CONFLICT (company_id) DO UPDATE` → row criada pra PN com UUID auto
3. Re-upsert pra PN com interval diferente → UPDATE da mesma row (idempotência)
4. Final: 2 rows totais (Caratinga + PN, IDs distintos)
5. Row de teste deletada após validação — estado prod restaurado

**SQL da 7.2 (UNIQUE constraint):**
```sql
ALTER TABLE public.admin_cleanup_config
  ADD CONSTRAINT admin_cleanup_config_company_id_key UNIQUE (company_id);
```

**Pre-check via MCP (2026-05-11):** 0 duplicatas em prod. Caratinga 1 row, PN 0 rows.

**SQL:**
```sql
ALTER TABLE public.admin_cleanup_config
  ADD CONSTRAINT admin_cleanup_config_company_id_key UNIQUE (company_id);
```

**Pre-check via MCP (2026-05-11):** 0 duplicatas em prod. Caratinga 1 row, PN 0 rows.

**Mudanças em `src/services/database.ts`:**
- `getAdminCleanupConfig(companyId: string)` — agora exige companyId, filtra por `company_id = ?` em vez de `.limit(1)`.
- `updateAdminCleanupConfig(enabled, intervalMonths, companyId: string)` — agora exige companyId, faz `upsert({ ... }, { onConflict: 'company_id' })` — substituiu o branch existing/insert separado por upsert atômico (lazy-create).
- `runAutoCleanup(companyId)` — passa companyId pro getter.

**Mudanças em `src/components/admin/AdminTab.tsx`:**
- `loadCleanupConfig` agora depende de `[company?.id]` e passa company.id.
- `handleToggleAuto`, `handleSaveAutoInterval`, `handleRunAutoNow` passam company.id (com early-return se ausente).

**Decisão técnica:** opção ES (estrutural) escolhida sobre OP (operacional). Lazy-create automático funciona pra qualquer nova empresa sem precisar INSERT manual prévio. Resolve o caso da Ponte Nova sem mudança operacional.

**Validação:**
- `npx tsc --noEmit`: 0 erros.
- `npx playwright test tests/12-admin-tab.spec.ts tests/24-admin-complete.spec.ts --workers=1`: 5 passed, 9 skipped (esperado pelo 6.3/6.9).
- Constraint UNIQUE confirmada via `pg_constraint` em prod.

---

### 2026-05-11 — 6.14 (4ª ocorrência) + 6.22.A: EmployeesTab cleanup + useCallback (sub-fase 5.6)

**Locais (resolvidos):**
- `src/components/employees/EmployeesTab.tsx:120` — 4ª ocorrência de `// eslint-disable-next-line react-hooks/exhaustive-deps` descoberta na auditoria 5.5 (não estava listada no 6.14 original que mencionava 3).
- Severidade Alta da entrada 6.22 (EmployeesTab) — estados ID-based que vazavam cross-empresa.

**Fix aplicado:**
1. `loadEmployees` envolvido em `React.useCallback([company?.id])` — remove eslint-disable.
2. Adicionado 2º useEffect com `[company?.id]` que zera 15 estados ID-based: `selectedIds`, `editingEmployee`, `showForm`, `pinModal`, `pinInput`, `resetModal`, `showImportModal`, `importFile`, `importValidation`, `importStep`, `importResult`, `validationContext`, `editingCell`, `showBulkMarkingModal`, `showScheduleModal`, `tempSchedule`.

**Decisão:** filtros (`searchTerm`, `cityFilter`, `stateFilter`, `employmentTypeFilter`) NÃO foram zerados — comportamento UX de persistir filtros entre empresas é intencional (mesmo critério de busca aplicado em PN é válido). `formData` também preservado (latente quando `showForm=false`).

**Validação:**
- `npx tsc --noEmit`: 0 erros.
- `npx eslint`: 0 warnings de `react-hooks/exhaustive-deps`.
- `npx playwright test tests/05-employees.spec.ts tests/21-employees-complete.spec.ts --workers=1`: 11 passed, 1 skipped (esperado pelo 6.3/6.9).

---

### 2026-05-11 — 6.15: Estados UI persistem cross-empresa em C6PaymentTab (sub-fase 5.4)

**Local:** `src/components/c6payment/C6PaymentTab.tsx`

**Fix aplicado:**
1. `loadEmployees` envolvido em `React.useCallback([company?.id])` (resolve warning latente `react-hooks/exhaustive-deps`).
2. Adicionado 2º useEffect com `[company?.id]` que zera 6 estados ao trocar empresa: `paymentRows`, `dataImported`, `selectedRows`, `inlineEdit`, `editingRowId`, `editValues`.

**Validação:**
- `npx tsc --noEmit`: 0 erros.
- `npx eslint`: 0 warnings de react-hooks (2 erros pré-existentes não-relacionados permanecem: imports/params).
- `npx playwright test tests/20-c6-complete.spec.ts --workers=1`: 7 passed, 1 skipped (esperado pelo 6.3/6.9).

**Pendente derivado:** sub-fase 5.5 auditará padrão similar em demais tabs Wave 3 (TECH_DEBT 6.22, criado na auditoria).

---

### 2026-05-11 — 6.11: `geolocation_config` UNIQUE(company_id) (sub-fase 5.3)

**Migration aplicada em prod:** `20260511140957_unique_geolocation_per_company`

**SQL:**
```sql
ALTER TABLE public.geolocation_config
  ADD CONSTRAINT geolocation_config_company_id_key UNIQUE (company_id);
```

**Pre-check via MCP (2026-05-11):** `SELECT company_id, count(*) FROM geolocation_config GROUP BY company_id HAVING count(*) > 1;` → 0 rows. Sem duplicatas a tratar.

**Validação pós-deploy via MCP:** `pg_constraint` confirma `geolocation_config_company_id_key` (contype='u') ativa em prod.

**Consequência:** elimina risco latente de comportamento indefinido em `.maybeSingle()` da edge fn `clock-in-validated` v5 caso alguém insira 2ª row pra mesma empresa.

---

### 2026-05-11 — 6.14: `eslint-disable react-hooks/exhaustive-deps` em 3 useEffect (sub-fase 5.2)

**Locais (resolvidos):**
- `src/components/datamanagement/DataManagementTab.tsx:66` → removido
- `src/components/admin/AdminTab.tsx:241` → removido
- `src/components/admin/AdminTab.tsx:247` → removido

**Fix aplicado:** 5 funções envolvidas em `React.useCallback` com deps corretas, padrão idiomático de `PaymentPeriodsTab.tsx:35-50`:
- `DataManagementTab.loadData` — `useCallback([company?.id])`
- `AdminTab.loadData` — `useCallback([company?.id])`
- `AdminTab.loadCleanupConfig` — `useCallback([])` (não usa company)
- `AdminTab.loadFaceConfig` — `useCallback([company?.id])`
- `AdminTab.loadFaceAttempts` — `useCallback([company?.id, faceDateStart, faceDateEnd, faceEmployeeFilter, faceResultFilter])`

**Decisão técnica:** No `AdminTab`, o useEffect 1 antigo chamava `loadFaceAttempts()` junto das cargas iniciais. Se simplesmente colocássemos `loadFaceAttempts` no array de deps, ele re-executaria todas as 4 cargas + `runAutoCleanup` ao mudar filtros faciais. Separamos: useEffect 1 carrega `loadData/loadCleanupConfig/loadFaceConfig/runAutoCleanup` (deps: `authenticated, company?.id, ...callbacks`), useEffect 2 carrega `loadFaceAttempts` (deps: `authenticated, loadFaceAttempts`). Comportamento end-to-end idêntico ao original.

**Validação:** `npx tsc --noEmit` (0 erros), eslint sem `react-hooks/exhaustive-deps` nos 2 arquivos (7 erros pré-existentes não relacionados permanecem), `npx playwright test tests/12-admin-tab.spec.ts tests/24-admin-complete.spec.ts --workers=1` — spec 12: 3 passed; spec 24: 2 passed, 9 skipped (esperado).

---

### 2026-05-11 — 6.4: Bug data futura em `tests/10-errors.spec.ts:107` (sub-fase 5.1)

**Local:** `tests/10-errors.spec.ts:105-110` (teste "Triagem: sub-aba abre e permite registrar erro do dia")

**Fix aplicado:** substituído `new Date(today.getFullYear(), today.getMonth(), 28)` (que virava data futura quando hoje < dia 28) por `new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - 1))` (dia anterior ao corrente, mesmo mês).

**Decisão técnica:** o agente Plan sugeriu mês anterior, mas auditoria do `TriageTab.tsx:55-59` mostrou que a tabela filtra por primeiro/último dia do mês corrente via `getBrazilDate()` — data em mês anterior NÃO apareceria no assert visual da linha 116. Solução final mantém mês corrente com dia ≤ hoje.

**Validação:** spec 10 rodada 3x consecutivamente (`npx playwright test tests/10-errors.spec.ts --workers=1`) — 5 passed em todas as runs (22.8s, 21.7s, 22.1s).

---

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
