# Tech-debt conhecido

## Flakes C6 (tests/20-c6-complete.spec.ts)
Padrão: getByText(/importado/) timeout 15s
Localização: linhas 51, 68, 109, 139, 167, 183
Comportamento: oscila entre rodagens, sempre passam isolados em <30s
Causa raiz suspeita: race condition entre import e UI render
Ação futura: investigar como subfase isolada após Etapa 2 concluída

## Deploy pendente: edge function v5

Status: commit a6850fe contém v5 (540 linhas) com suporte a marking_position 1|2|3|4.
Em produção: ainda v4 (sha 7657b3b167...).

Quando deployar: na sub-fase 2.23 (push final), via Supabase MCP, ANTES do push 
para o frontend novo entrar em produção.

Validação após deploy v5:
1. Rodar suíte 02-employee-clock + 08-geolocation + 23-employee-clock-complete
2. Bater ponto manual no celular (1 funcionário, 2 marcações)
3. Se ok, então liberar push frontend

## Skip-condicional flutuante (2026-05-02)
- Suíte: 181 testes total preservado
- Variação observada: 154 passed/26 skipped/1 failed ↔ 153 passed/27 skipped/1 failed
- Hipótese: test.skip() com condição dependente de data (virada 30/04→01/05)
- Falha persistente: tests/10-errors.spec.ts:98 (Triagem flake conhecido)

## Bug de data futura: tests/10-errors.spec.ts:98 — "Triagem: sub-aba abre" (2026-05-05)

Descoberto durante validação V5 do Combo I (passo 6.5.D — Fix #5). Refina a entrada
"Skip-condicional flutuante" acima: NÃO é flake, é falha determinística por data futura.

**Causa raiz:**
Linha ~107 do teste calcula `new Date(today.getFullYear(), today.getMonth(), 28)` para
simular registro de erro de triagem. Quando hoje é antes do dia 28 do mês, a data fica
no FUTURO, e a regra de negócio "Nenhum funcionário presente nesta data — distribuição
impossível" bloqueia o submit.

**Reprodução:**
- Hoje: 2026-05-05
- Cálculo: `new Date(2026, 4, 28)` → 2026-05-28 (futuro, sem attendance)
- Toast "Erro de triagem registrado" não aparece
- expect timeout 10s falha

**Severidade:** Baixa
- Não afeta produção (regra de negócio nova é correta)
- Bug é pré-existente, não introduzido pelo Combo I/H/G
- Comprovado via stash test: rodando sem Fix #5 (3 arquivos stashed), falha igual

**Solução proposta:**
Trocar a data por uma do PASSADO ou criar attendance no setup do teste pra data
específica. Exemplo:
```ts
// ANTES (frágil - falha quando hoje < dia 28):
const d = new Date(today.getFullYear(), today.getMonth(), 28);

// DEPOIS (robusto - sempre data passada):
const d = new Date(today.getFullYear(), today.getMonth() - 1, 15);
```

**Status:** Pendente — não bloqueador pra Combo I nem push final.

## fixme em tests/25-multi-company-isolation.spec.ts (#3 e #9)

**Linhas:** 158 (#3) e 330 (#9)

**#3 — CPF idêntico em 2 empresas:**
Validar que mesmo CPF pode existir em Caratinga + Ponte Nova quando
constraint UNIQUE(cpf, company_id) estiver aplicada (atualmente é UNIQUE(cpf)
global, então o teste falha por conflito de banco).

**#9 — triage_errors isolado por empresa:**
Validar que erro de triagem em Caratinga não vaza pra Ponte Nova quando
constraint UNIQUE(date, company_id) estiver aplicada (atualmente é
UNIQUE(date) global).

**Status:** Aguarda push final (Bloco 3 do plano de push).
**Resolução:** Após migrations, reabilitar com test em vez de test.fixme.

## Saldo noturno hardcoded (nightCreditMinutes = 0)

**Local:** src/utils/bankHoursCalculator.ts (e em outros pontos)

**Contexto:**
O sistema oferece toggle bank_hours_night_separate + bank_hours_night_multiplier
nas configurações da empresa, mas o CÁLCULO de horas noturnas não está
implementado: nightCreditMinutes está hardcoded em 0. O multiplier é aplicado
no fim, mas como base = 0, a contribuição é sempre 0.

**Severidade:** Média
- Não quebra produção (toggle é silencioso)
- Mas feature anunciada não funciona

**Solução proposta:**
Calcular nightCreditMinutes a partir das attendances do período, contando
minutos entre entry_time e exit_time que caem na faixa 22h-05h. Já existe
a lógica em outros lugares do sistema (calcNightHours), só precisa portar
pro applyBankHoursToPayment.

**Status:** Pendente, sub-fase futura.

## N+1 queries no preview de banco horas

**Local:** src/services/database.ts:4936

**Contexto:**
Comentário na própria função: "// N+1 consciente (cada employee dispara 5
queries via helper); pode otimizar pra batch no futuro se a empresa tiver
muitos funcionários."

Atualmente, abrir o modal de "Aplicar banco de horas" com 30+ funcionários
da Caratinga dispara ~150 queries sequenciais (5 × 30). Tempo de carregamento
~30-60s.

**Severidade:** Baixa-Média
- Funciona, mas demora pra carregar
- Aceitável até ~50 employees, ruim a partir de 100+

**Solução proposta:**
Refatorar previewBankHoursForPeriod pra fazer 5 queries em batch (1 por tabela
relacionada) com filtro WHERE employee_id IN (...) em vez de 5 × N queries
sequenciais. Possível redução: 150 queries → 5 queries.

**Status:** Pendente, otimização futura quando empresa crescer.

## Sem rollback transacional payment update + log insert

**Local:** src/services/database.ts:4861-4903 (applyBankHoursToPayment)

**Contexto:**
Em applyBankHoursToPayment, a sequência é:
1. UPDATE no payment (commit)
2. INSERT no bank_hours_application_log (best-effort)

Se o INSERT no log falhar (linha 4900 só faz console.error), o UPDATE no
payment já foi commitado. Estado inconsistente possível: payment com
bank_hours_amount aplicado mas SEM log de auditoria.

**Severidade:** Média
- Documenta-se via teste 19 do applyBankHoursToPayment.spec.ts
- Em prod, falha de log é raríssima (tabela simples sem constraints)
- Mas em caso de incidente, dificulta auditoria

**Solução proposta:**
Envolver UPDATE + INSERT em transação Supabase (RPC ou edge function).
Se INSERT falhar, dar ROLLBACK no UPDATE.

Alternativa mais simples: tornar o INSERT a 1ª operação (se falhar, não
fazer UPDATE). Mas perde idempotência via bank_hours_applied_at.

**Status:** Pendente, decisão arquitetural pendente.
