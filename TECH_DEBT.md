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
