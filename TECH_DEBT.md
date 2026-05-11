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

**Status:** **✅ Totalmente resolvido — sub-fases 9.1 + 9.2 + 9.3 removeram os 9/9 skips condicionais.** Ver entradas individuais no Histórico.

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

**Status:** **Maioria resolvida — sub-fase 9.1 (commit pendente) substituiu 6 dos 7 testes condicionais por `data-testid` (search, histórico, bulk-approve, edit inline c6, facial toggle, facial list)**. Resta 1: `tests/16-financial-complete.spec.ts:149` (employment_type filter) → sub-fase 9.2.

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

**Status:** ✅ RESOLVIDO sub-fase 9.4. Ver entrada no Histórico.

---

### 6.19 — [Baixa] SettingsTab isolamento UI multi-empresa

**Status:** ✅ RESOLVIDO sub-fase 9.4. Ver entrada no Histórico.

---

### 6.20 — [Baixa] TriageTab isolamento UI multi-empresa

**Status:** ✅ RESOLVIDO sub-fase 9.4. Ver entrada no Histórico.

---

### 6.21 — [Baixa] AdminTab Bloqueios de Bonificação isolamento UI

**Status:** ✅ RESOLVIDO sub-fase 9.4. Ver entrada no Histórico.

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

### 2026-05-11 — Cobertura E2E nova: MirrorMassDialog (sub-fase 10.5)

**Arquivo novo:** `tests/35-mirror-mass-dialog.spec.ts` — 8 testes cobrindo `src/components/attendance/MirrorMassDialog.tsx` (307 lin), modal lazy-loaded acessível via botão "Gerar espelhos" em AttendanceTab (visível pra quem tem `attendance.generateMassMirror`).

**Testes:**

| # | Cenário | Asserção |
|---|---|---|
| 1 | Botão "Gerar espelhos" abre o dialog | heading "Gerar espelhos em massa" visível |
| 2 | Dialog mostra inputs período + busca + botões | 2 inputs date, search box, "Mês atual"/"Mês anterior" |
| 3 | "Mês anterior" muda range | start date < initial |
| 4 | "Mês atual" reseta range | start matches `^\d{4}-\d{2}-01$` |
| 5 | Busca filtra lista | "ZZZZZZZ" → "Nenhum funcionário encontrado" |
| 6 | "Selecionar visíveis" marca todos + atualiza counter | "Funcionários (N de M)" + botão muda pra "Desmarcar" |
| 7 | "Gerar PDF" disabled em 0 selected; enabled após 1 | label inclui "(1)" |
| 8 | Switch CT→PN: PN sem funcionários | "Nenhum funcionário encontrado" no dialog |

**Pattern crítico:** locators escopados ao modal (`modal(page)` helper) — sem escopo, `input[type="date"]` no dialog pega 3 inputs (2 do modal + 1 do AttendanceTab atrás).

**Decisão de escopo:** download real do PDF NÃO testado (waitForEvent('download') é caro/frágil com jsPDF rodando client-side). Cobertura via unit tests de `mirrorPdf` (414 vitest já passando) é suficiente.

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx playwright test tests/35-mirror-mass-dialog.spec.ts --workers=1`: **8 passed em ~34s**, 0 failed
- Estado prod inalterado (specs não fazem fixtures persistentes — apenas read-only UI checks + interactions ephemeral)

---

### 2026-05-11 — Cobertura E2E nova: CompanySettings (sub-fase 10.4)

**Arquivo novo:** `tests/34-company-settings.spec.ts` — 8 testes core cobrindo `src/components/admin/CompanySettings.tsx` (856 lin), renderizado dentro de AdminTab linha 1457 (visível apenas pra `isAdminMaster='9999'`).

**Escopo reduzido:** o plano sugeria 18 testes (cenários a-h cobrindo todos os toggles + simulador). Cobrimos os 8 essenciais. Os 10 restantes (simulador bank_hours, 5+ selects condicionais como `formula`, `credit_action`, `debit_action`, `period`, `display`, `after_apply`) ficam pra cobertura unitária em sub-fase futura — o componente já tem 414 unit tests em `bankHoursCalculator.spec.ts`, cobrindo a lógica de cálculo isoladamente. UI E2E core suficiente.

**Testes:**

| # | Cenário | Asserção |
|---|---|---|
| 1 | Section visível em CT | heading "Configurações da Empresa — Caratinga" (display_name, não legal_name) |
| 2 | Razão social + CNPJ read-only | inputs disabled com legal_name + CNPJ não vazio |
| 3 | Switch CT→PN | heading muda pra "— Ponte Nova" |
| 4 | Input Cidade aceita digitação | state local atualiza com "PW Test Cidade" |
| 5 | Checkbox "Banco de horas habilitado" | visível e não-disabled |
| 6 | Toggle "Banco de horas afeta pagamento?" DISABLED se enabled=false | `#bh-toggle-master` desabilitado |
| 7 | Toggle ENABLED após marcar checkbox via UI | habilita imediatamente (state local) — UPDATE direto no DB NÃO funciona (contexto React tem snapshot) |
| 8 | Salvar Cidade modificada | toast "salvas" + persistência via SELECT no DB; restaurado pelo try/finally |

**Patterns:**
- `locSettingsSection`: `page.locator('div.bg-white').filter({ has: heading })` — sem `div.bg-white`, pegava wrapper externo da AdminTab (que contém botão "Salvar nova senha" disabled — colidia com `getByRole('button', { name: /^Salvar/ })`).
- `unlockAdmin` local (mesma pattern das specs 24/26-extras/32).
- Teste 7 lição: UPDATE direto no DB de campos consumidos pelo `CompanyContext` NÃO invalida o context — o React state continua com snapshot velho até reload/switch. Tests que dependem de state UI devem modificar via UI ou usar `switchCompany` ida-e-volta. Reagir a `company?.id` no `useEffect` resolve dentro de uma única mudança de empresa, mas não a campos arbitrários da mesma empresa.

**Validação real pós-test via MCP:**
```sql
SELECT id, display_name, city, bank_hours_enabled FROM companies WHERE id IN (CT, PN);
-- CT: city='Caratinga, MG', bank_hours_enabled=false (originais preservados)
-- PN: city='Ponte Nova, MG', bank_hours_enabled=false (inalterada)
```

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx playwright test tests/34-company-settings.spec.ts --workers=1`: **8 passed em ~37s**, 0 failed

---

### 2026-05-11 — Sub-fase 10.3 (AuditLogsTab) cancelada: componente órfão

**Descoberta durante exploração:** `src/components/monitoring/AuditLogsTab.tsx` (319 lin) existe mas **NÃO é renderizado em lugar nenhum da app**. Grep em todo `src/` confirma: nenhum import de `AuditLogsTab` exceto o próprio arquivo. Não há tab no App.tsx, não há rota, não há section em outras tabs que o use.

**Implicações:**
- Não é possível testar E2E (não há fluxo na UI que leve ao componente).
- O serviço por trás (`src/services/auditService.ts`) é usado para `logAction()` em outras partes, mas o componente UI de visualização nunca é exibido ao usuário.
- Provavelmente um componente em desenvolvimento que foi commitado mas não ligado.

**Sub-fase 10.3 cancelada.** Decisão: não criar `tests/33-audit-logs-tab.spec.ts` com testes skipados (poluição inútil). Em vez disso, documentar a descoberta aqui.

**Pendência derivada (fora do escopo da Fase 10):** se este componente deve ser exposto na UI ou removido. Recomendação: avaliar no contexto do PRE-LAUNCH-CHECKLIST (Fase 12) — manter dead code em prod aumenta superfície sem benefício.

---

### 2026-05-11 — Cobertura E2E nova: BonusTypesManager (sub-fase 10.2)

**Arquivo novo:** `tests/32-bonus-types-manager.spec.ts` — 10 testes cobrindo `src/components/admin/BonusTypesManager.tsx` (393 lin), renderizado dentro de AdminTab na section "Tipos de Bonificação — <empresa>".

**Testes:**

| # | Cenário | Asserção principal |
|---|---|---|
| 1 | Lista CT com B/C1/C2 | section visível + 3 codes na tabela |
| 2 | Switch CT → PN com fixture PWT2 em CT | PN não mostra PWT2 (isolamento UNIQUE(code, company_id)) |
| 3 | Click "Novo Tipo" abre modal | heading "Novo Tipo de Bonificação" + inputs Name e Code visíveis |
| 4 | Criar PWT3 (R$ 99.99) | toast "Tipo criado" + row aparece na tabela com code/name/value |
| 5 | Code inválido "X Y" (espaço) | toast "Código deve ter 1 a 6 caracteres" + modal permanece aberto |
| 6 | UNIQUE: criar PWT4 duplicado | toast erro (caminho UX-friendly OR fallback do `instanceof Error`) |
| 7 | Click Editar | modal "Editar Tipo" preenchido com valores atuais |
| 8 | Editar nome "Antes" → "Depois" | toast "Tipo atualizado" + row mostra "Depois", "Antes" sumiu |
| 9 | Click Desativar (confirm dialog) | toast "Tipo desativado" + row mostra status "Inativo" |
| 10 | Click Reativar (confirm dialog) | toast "Tipo reativado" + row mostra status "Ativo" |

**Patterns:**
- `unlockAdmin(page)` local — mesmo padrão das specs 24/26-extras (espera `getByTestId('facial-global-toggle')` como sinalizador de autenticado).
- `locBonusManagerSection(page)`: locator do card da section (filtra por heading "Tipos de Bonificação").
- `cleanupBonusTypes()` no `beforeAll`/`afterAll`/`beforeEach`: DELETE direto em `bonus_types` por `code LIKE 'PWT%'`. Tabela não é coberta por `cleanupByPrefix` (que opera por employee name).
- `getByPlaceholder('Ex.: B', { exact: true })` — sem `exact: true`, o substring match colide com `placeholder="Ex.: Bônus B"` do input Name.

**Bug latente potencial (não bloqueante):** o teste 6 (UNIQUE) usa regex tolerante `/já existe nesta empresa|Erro ao salvar|duplicate key/i`. Razão: `BonusTypesManager.tsx:131` checa `err instanceof Error` antes de acessar `err.message`. Supabase errors são plain objects (não Error instances), então `msg = String(err) = "[object Object]"` → regex `/duplicate|unique|23505/i` não bate → cai no fallback "Erro ao salvar: [object Object]". UX degradada mas funcional. Documentado pra inspeção futura.

**Validação real pós-test via MCP:**
```sql
SELECT count(*) FROM bonus_types WHERE code LIKE 'PWT%'; -- 0
```
Estado prod preservado (3 codes B/C1/C2 originais em CT + PN inalterados).

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx playwright test tests/32-bonus-types-manager.spec.ts --workers=1`: **10 passed em ~47s**, 0 failed

---

### 2026-05-11 — Cobertura E2E nova: EmployeeErrorsView (sub-fase 10.1)

**Arquivo novo:** `tests/31-employee-errors-view.spec.ts` — 6 testes cobrindo o componente `src/components/employee-clock/EmployeeErrorsView.tsx` (renderizado em `/erros` via `EmployeeErrorsPage`, state machine `cpf → company-select → pin → dashboard`).

**Testes:**

| # | Cenário | Asserção |
|---|---|---|
| 1 | CPF inexistente | step `error` com "Funcionário não encontrado" + botão "Tentar novamente" |
| 2 | PIN errado | toast "PIN incorreto" + permanece em step `pin` |
| 3 | Funcionário sem erros | "Nenhum erro registrado" + "Continue assim!" |
| 4 | 1 erro individual `quantity` (count=3) no period 2026-04-16/22 | card com label do period + badge "Pago" + "Erros Individuais: 3 erros" + observation visível + "Total:" |
| 5 | 1 erro triage (errors_share=1) no mesmo period | subseção "Triagem" + "Lote de triagem" + "1 pacote atribuído" |
| 6 | Plural vs singular | "Erros Individuais: 1 erro" (singular) — regex com âncoras `^...$` garante NÃO casar "1 erros" (plural) |

**Patterns:**
- `gotoErrosAndFillCpf(page, cpf)`: helper que navega `/erros`, fill CPF, click "Continuar".
- `loginEmployee(page, cpf, pin)`: completa o fluxo até dashboard (CPF → PIN → header "Meus Erros" visível). Funcionários criados via `createTestEmployee` ficam apenas em CT (default `employees.company_id`) → pulam `company-select`.
- Period base reutilizado: `2026-04-22` (último dia de period existente em CT com `status='paid'`). Não cria period novo — evita complexidade de cleanup.
- Teste 5 (triage) usa INSERT direto em `triage_error_distributions` + `triage_distribution_employees`. Cleanup explícito da distribution em try/finally (cleanupByPrefix cobre apenas a row em distribution_employees via empIds; distribution órfã ficaria sem o finally).

**Validação real pós-test via MCP:**
```sql
SELECT
  (SELECT count(*) FROM employees WHERE name LIKE 'PW Test EmpErrV%') AS emp_residue,
  (SELECT count(*) FROM error_records WHERE observations='PW Test integrity' AND date='2026-04-22') AS err_residue,
  (SELECT count(*) FROM triage_error_distributions WHERE observations='PW Test triage spec31') AS triage_dist_residue;
-- Resultado: 0, 0, 0 (estado prod preservado)
```

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx vitest run`: 414/414 passed em 16 files
- `npx playwright test tests/31-employee-errors-view.spec.ts --workers=1`: **6 passed em ~42s**, 0 failed

---

### 2026-05-11 — 6.18/6.19/6.20/6.21: 4 specs E2E novas — isolamento UI multi-empresa (sub-fase 9.4)

**Arquivo novo:** `tests/26-multi-company-ui-isolation-extras.spec.ts` — 4 testes adicionais à spec 26 base (que já cobria 9 tabs sem fixture). Esses 4 exigiam fixture pré-condicionada em Caratinga porque o estado de prod não distingue isolamento via UI sozinho.

**Testes:**

| # | TECH_DEBT | Fixture (CT) | Asserção CT | Asserção PN |
|---|---|---|---|---|
| 10 | 6.18 | `createTestEmployee` + `insertPaymentRow(SAFE_DATE, daily_rate=100, bonus_b=5)` | `goToTab('Pagamento C6')` → set range SAFE_DATE → click "Importar Dados" → h3 "Revisar e Editar Pagamentos" visível + row com `PW Test 26Extra C6` visível | mesmo flow → toast "Nenhum pagamento encontrado no período" |
| 11 | 6.19 | `UPDATE bonus_types SET default_value=77 WHERE company_id=PN AND code='B'` (CT permanece 15.00) | `goToTab('Configurações')` → `getByLabel('Tipo B')` `toHaveValue('15.00')` | mesmo flow → `toHaveValue('77.00')`. **try/finally** restaura PN ao valor original |
| 12 | 6.20 | `INSERT triage_errors (date=hoje, observations='PW Test 26Extra TriageRow', company_id=CT)` | `goToTab('Erros')` → clicar "Triagem" → tbody tr com observação visível | mesmo flow → "Nenhum registro neste mês" |
| 13 | 6.21 | `createTestEmployee` + `INSERT bonus_blocks (week_end=hoje+7, reason='PW Test 26Extra BlockReason', company_id=CT)` | `unlockAdmin(page)` → section "Bloqueios de Bonificação" mostra o reason | mesmo flow → "Nenhum bloqueio encontrado" |

**Patterns reutilizados da spec 26 base:**
- `switchCompany(page, 'Ponte Nova')` (helpers.ts:47) dispara reload → activeTab reseta → `goToTab` re-navega após.
- `unlockAdmin` re-autentica após switchCompany porque `authenticated` é useState local sem persistência.

**Mudança cirúrgica em componente:** `SettingsTab.tsx:159, 165` ganhou `htmlFor`/`id` na label/input do "Tipo B/C1/C2". Permite `page.getByLabel('Tipo B')` (a11y semântica). Antes não havia link label-input — ruim pra a11y e pra Playwright getByLabel.

**Bug latente descoberto durante validação:** botão "Importar Dados" do C6PaymentTab fica `disabled` enquanto `isEditingDate.startDate=true` (foco no input de data). Quando o teste chamava `fill(startDate)` + `fill(endDate)` sem blur explícito, o botão permanecia disabled → click timeout. Fix: helper `setDateRange` adiciona `await page.locator('body').click({ position: { x: 5, y: 5 } })` pós-fills para forçar blur. Pattern já usado em `tests/16-financial-complete.spec.ts:205` (sub-fase pré).

**Restauração de prod (cleanup obrigatório):**
- `beforeEach` + `afterAll` + `beforeAll`: `cleanupByPrefix("PW Test 26Extra ")` deleta employees + payments + bonus_blocks + triage_distribution_employees relacionados.
- Test 11 (bonus_types): try/finally restaura PN B ao valor original (capturado pré-fixture).
- Test 12 (triage_errors): try/finally faz DELETE explícito por observations + company_id.

**Validação real via MCP pós-test:**

```sql
SELECT
  (SELECT count(*) FROM employees WHERE name LIKE 'PW Test 26Extra%') AS emp_residue,
  (SELECT count(*) FROM triage_errors WHERE observations LIKE 'PW Test 26Extra%') AS triage_residue,
  (SELECT count(*) FROM bonus_blocks WHERE reason LIKE 'PW Test 26Extra%') AS block_residue,
  (SELECT count(*) FROM payments p JOIN employees e ON p.employee_id=e.id WHERE e.name LIKE 'PW Test 26Extra%') AS pay_residue;
-- Resultado: 0, 0, 0, 0 (estado prod preservado)

SELECT company_id, code, default_value FROM bonus_types WHERE code='B';
-- Resultado: ambas empresas com 15.00 (restore PN funcionou)
```

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx vitest run`: 414/414 passed em 16 files
- `npx playwright test tests/26-multi-company-ui-isolation-extras.spec.ts --workers=1`: **4 passed em ~32s**, sem flake (2 runs consecutivos idênticos)
- `npx playwright test tests/26-multi-company-ui-isolation.spec.ts tests/26-multi-company-ui-isolation-extras.spec.ts --workers=1`: **13 passed** — extras não interferem na spec base

---

### 2026-05-11 — 6.3 (final): split `tests/07-financial.spec.ts:43` em "com" / "sem" pagamento (sub-fase 9.3)

**Bug original:** teste único `Ver Detalhes` dependia de dados pré-existentes na empresa. Se range não tinha pagamentos, `verDetalhes.count() === 0` → `test.skip(true, 'Sem pagamentos no período')`. Cobertura incerta — em runs felizes passava silenciosamente; em runs sem dados pulava.

**Fix:** teste único substituído por 2 testes determinísticos com fixtures:

| Teste | Fixture | Asserção |
|---|---|---|
| `Ver Detalhes — com pagamento expande card com Bônus B, C1, C2` | `createTestEmployee` + `insertPaymentRow(SAFE_DATE, daily_rate=100, bonus_b=5, bonus_c1=10, bonus_c2=15)` | `tr#payments-${empId}` contém `Bônus B:.*5\.00.*C1:.*10\.00.*C2:.*15\.00` |
| `Ver Detalhes — sem pagamento mostra "Nenhum pagamento registrado"` | `createTestEmployee` (sem payment) | `tr#payments-${empId}` contém `Nenhum pagamento registrado` |

**Mudança operacional na spec:** `goToTab(page, 'Financeiro')` foi movido do `beforeEach` pra dentro de cada teste. Razão: o `FinancialTab` carrega `employees` no mount; criar fixtures via SQL DEPOIS do mount não refresca a lista. Pré-fix essa ordem fazia o teste ver "PW Test ComPag" como ausente. Pós-fix: cria fixture → depois `goToTab` (mount disparado AGORA) → componente vê o emp no `loadEmployees`.

**Cleanup:** `beforeAll` + `afterAll` + `beforeEach` chamam `cleanupByPrefix("PW Test 07Fin ")` — prefix isolado pra evitar interferência com outras specs.

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx playwright test tests/07-financial.spec.ts --workers=1`: **5 passed, 0 skipped, 0 failed** (era 3 passed + 1 skip condicional + 1 conditional flow)

---

### 2026-05-11 — 6.3 (parcial): filtro employment_type — seletor `hasText` em `<option>` (sub-fase 9.2)

**Bug:** `tests/16-financial-complete.spec.ts:147` usava `page.locator('select').filter({ hasText: /Diarista|Carteira/i }).first()` — `hasText` filtra elementos cujo texto direto bate o regex, mas `<select>` não tem texto direto (texto fica em `<option>`-s aninhados, fora do contexto do filtro). Locator sempre falhava → `test.skip(true, 'Filtro employment_type não disponível')` disparava.

**Fix:**
- `src/components/common/EmploymentTypeFilter.tsx:30` ganhou `data-testid="employment-type-filter"` no `<select>`.
- Spec: locator trocado por `page.getByTestId('employment-type-filter')` + `await expect(select).toBeVisible({ timeout: 10_000 })` substituindo o skip condicional.

**Componente é compartilhado** (AttendanceTab, ErrorsTab, FinancialTab), mas em runtime só 1 tab é renderizada por vez → `getByTestId` retorna 1 elemento, sem ambiguidade.

**Validações:**
- `npx tsc --noEmit`: 0 erros
- `npx playwright test tests/16-financial-complete.spec.ts --workers=1`: **8 passed, 2 skipped (Excel/PDF permanentes), 0 failed** (incluindo o teste alterado em 4.2s)

---

### 2026-05-11 — 6.3/6.9 (parcial): 7 skips condicionais UI removidos via `data-testid` (sub-fase 9.1)

**Locais resolvidos** (7 dos 9 listados em 6.3; 6 dos 7 de 6.9):

| Spec | Linha antiga | Elemento | `data-testid` introduzido | Componente |
|---|---|---|---|---|
| `tests/15-attendance-complete.spec.ts` | 184 | botão bulk-approve | `bulk-approve-button` | `AttendanceApprovalPanel.tsx:194` |
| `tests/16-financial-complete.spec.ts` | 133 | search input | `financial-search-input` | `FinancialTab.tsx:728` |
| `tests/16-financial-complete.spec.ts` | 197 | botão Histórico | `financial-history-btn` | `FinancialTab.tsx:635` |
| `tests/19-payment-periods-complete.spec.ts` | 107 | toggle auto-weekly | `auto-weekly-toggle` | `PaymentPeriodsTab.tsx:171` |
| `tests/20-c6-complete.spec.ts` | 151 | edit button + tr da row | `c6-edit-row-${id}` + `c6-row-${id}` | `C6PaymentTab.tsx:616, 723` |
| `tests/24-admin-complete.spec.ts` | 72 | toggle facial global | `facial-global-toggle` | `AdminTab.tsx:678` |
| `tests/24-admin-complete.spec.ts` | 102 | linha da listagem facial | `facial-list-row-${id}` | `AdminTab.tsx:733, 794` (desktop + mobile) |

**Patterns aplicados:**
- Substituído `getByRole('button', { name: /regex/ })` e `locator('button[role=switch]').filter(...)` por `getByTestId(...)` — robusto, idempotente.
- Substituído `if (!await elem.isVisible(...)) test.skip(...)` por `await expect(elem).toBeVisible({ timeout: 10_000 })` — falha real se o elemento sumir, sem mascarar regressão.
- Spec 20-c6: ao clicar Edit, célula vira input (texto some). Capturei `row.id` via `data-testid` do botão **antes** do click e re-localizei a `<tr>` via novo `data-testid={\`c6-row-${row.id}\`}` para acessar os inputs.
- Spec 24-admin toggle: filtro `face_recognition_config` por `company_id` (multi-empresa pós-sub-fase 5.3) — adicionado `CARATINGA_ID` constante na spec; queries usam `.eq('company_id', CARATINGA_ID).maybeSingle()` em vez de `.single()` ambíguo.
- **Bug latente descoberto e corrigido** em `unlockAdmin` helper: `passwordInput.isVisible({ timeout: 3_000 })` retornava `false` imediatamente (a option `timeout` não funciona como `waitFor` em `isVisible`). Substituído por `await expect(passwordInput).toBeVisible({ timeout: 10_000 })`. Pré-fix, isso fazia o helper pular silenciosamente o fill+click quando o input ainda não tinha sido renderizado — daí 2 testes do AdminTab falhavam com "toggle não visível" mesmo após removed-skip.

**Validações executadas:**

| # | Validação | Resultado |
|---|---|---|
| 1 | `npx tsc --noEmit` | 0 erros |
| 2 | `npx vitest run` (414 unit tests) | 16 files passed |
| 3 | `npx playwright test tests/15 tests/16 tests/19 tests/20 tests/24 --workers=1` (5 specs alteradas) | **33 passed, 13 skipped (justificados), 0 failed** |
| 4 | Confirmação real de cada `data-testid` no DOM via debug spec ad-hoc (visualizando snapshot + count) | Toggles e rows aparecem `count=1` consistentemente |

**Pendências relacionadas:**
- 1 skip condicional ainda em `tests/16-financial-complete.spec.ts:149` (filtro employment_type — bug do `hasText` em `<option>`) → resolverá na sub-fase 9.2.
- 1 skip condicional ainda em `tests/07-financial.spec.ts:43` ("Ver Detalhes" depende de pagamento existir) → sub-fase 9.3 (split em "com dados" / "sem dados").

---

### 2026-05-11 — 6.8: RPC transacional apply_bank_hours_to_payment (sub-fase 8.5)

**Migration aplicada em prod:** `20260511182328_rpc_apply_bank_hours_to_payment.sql`

**Função criada:** `public.apply_bank_hours_to_payment(...)` — PL/pgSQL, `SECURITY DEFINER`, `search_path = public, pg_temp`. Encapsula as 3 ops anteriores em transação atômica:
1. `UPDATE payments` (bank_hours_amount, bank_hours_minutes, bank_hours_applied_at, total)
2. `INSERT bank_hours_application_log` (14 campos de auditoria)
3. `UPDATE attendance` (zero_balance opcional via flag `p_zero_balance`)

Falha em qualquer step → `ROLLBACK` automático no Postgres → nada persistido. Pre-fix, 2ª/3ª op `console.error` silencioso deixava payment "aplicado" sem log → estado inconsistente.

**Validação de pertencimento** dentro da RPC: `SELECT company_id FROM payments WHERE id = p_payment_id` é comparado com `p_company_id` recebido. Se diferente, `RAISE EXCEPTION` — previne elevation of privilege se caller passar company_id falso.

**Grants:** `EXECUTE TO anon, authenticated, service_role` — todos podem chamar; segurança via parâmetros validados.

**Código TS alterado (`src/services/database.ts`):**
- `applyBankHoursToPayment` substitui linhas 4780-4839 (~60 linhas de 3 ops + error handling best-effort) por uma única chamada `supabase.rpc('apply_bank_hours_to_payment', {...})` (~25 linhas).
- Try/catch externo capturando errors do Supabase (plain objects com `.message`, não instanceof Error) — refinado pra extrair message corretamente em errorMessage.

**Testes (`tests/unit/applyBankHoursToPayment.spec.ts`):**
- Helper `setupSupabaseQueue` ganha mock de `rpc` (vi.hoisted no mockSupabase). Queue especial `__rpc__` pra override de resposta da RPC.
- Teste #6 atualizado: valida `logId` vem da RPC + `mockSupabase.rpc` chamado 1× com nome correto.
- Teste #12 atualizado: valida `p_zero_balance: true` passado à RPC (não mais 2 calls separadas a attendance).
- Teste #19 **invertido**: pre-fix esperava `success=true` com `logId=undefined` quando log falhava (best-effort). Pos-fix espera `success=false` + `applied=false` + `errorMessage` da RPC (atomic rollback).
- Edge case #8 atualizado: valida via `p_zero_balance` na RPC.

**Validações REAIS via MCP (padrão "validar tudo real"):**

| # | Validação | Resultado |
|---|---|---|
| 1 | Pre-check schema bank_hours_application_log | 16 cols, applied_at default now(), 4 NOT NULL críticos |
| 2 | Migration aplicada via `apply_migration` MCP | success: true |
| 3 | `pg_proc` confirma RPC criada | security_definer=true, ACL inclui anon/authenticated/service_role com EXECUTE |
| 4 | TS compila | 0 erros |
| 5 | Suite unit applyBankHours (44 testes, +6 D1=C, +1 ajustado #19) | 44/44 passed |
| 6 | Suite unit completa | 414/414 passed em 16 files |
| 7 | Spec E2E 27 (bank-hours-payment) | 5/5 passed |
| 8 | **Spec E2E 29 (bank-hours-integrity)** — apply REAL no DB de prod via RPC | **5/5 passed** (Teste 1: "Apply E2E real: payment.bank_hours_amount + log + attendance zerado" foi efetivamente exercitado contra prod via RPC) |

**Impacto pra produção:** atomicidade garantida pelo Postgres. Falhas raras agora preservam estado consistente — sem "payment aplicado mas log faltando" ou "payment aplicado mas attendance não zerada". Auditoria robusta + idempotência via `bank_hours_applied_at` ainda funciona.

---

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
