# CHECKPOINT — Sessão 2026-05-29

> Sessão de **backup de produção + investigação do desconto de erros**.
> Regra inegociável aplicada o tempo todo: **nunca afirmar sem verificar empiricamente**.
> Tudo aqui tem fonte (MCP Supabase, leitura de arquivo, query SQL, comando git).

---

## 1. Contexto

Retomada do projeto após a revisão de 2026-05-27. Victor respondeu a pergunta de
produto que estava pendente (achado #5 — desconto de erros tipo `value`), pediu um
**backup completo dos dados antes de qualquer mudança**, e ao final a investigação
mostrou que **não havia bug**. Documentação corrigida e enviada ao GitHub.

---

## 2. O que foi feito (com fonte)

### 2.1 Backup completo de produção ✅
- **Local:** `backups/2026-05-29/` (gitignored — contém PII: CPF, nomes, hashes bcrypt, imagens).
- **52 tabelas, 9.558 linhas, ~7.5 MB.** 1 arquivo JSON por tabela em `data/` + snapshot de estrutura em `schema/` (535 colunas, 177 constraints, 180 índices, 59 policies RLS, 7 funções, 3 triggers, 1 sequence).
- **Método:** MCP `execute_sql` (pg_dump/CLI/senha Postgres indisponíveis). Resultados grandes auto-salvos em arquivo pelo harness → extraídos por scripts python (`_extract_array.py`, `_split_object.py`). Sem trafegar dados pelo contexto.
- **Verificação:** contagem do banco (`query_to_xml`) comparada 1-a-1 com `jq 'length'` de cada arquivo → **match 100%, 0 divergência**. `checksums.sha256` gerado.
- **Restauração:** `RESTORE.md` + `_restore.mjs` (upsert idempotente por PK via REST API + service_role; multi-pass resolve ordem de FK; `node --check` passou).

### 2.2 Investigação do desconto de erros (achado #5) ✅ — REFUTADO
- **Pergunta de produto do Victor:** erro tipo `value` deve descontar do pagamento, aparecer no Financeiro e também no C6. E **todos os tipos** de erro devem funcionar assim.
- **Verdade verificada (código inteiro + dados reais):**
  - **`value`** → descontado automaticamente no líquido: Financeiro (`FinancialTab.tsx:201`, exibido 1122-1138/1450-1458) e C6 (`getEmployeeNetPayments` database.ts:2493 → `C6PaymentTab.tsx:149 amount: net.net`). `payments.total` fica no bruto **de propósito** (evita dupla contagem).
  - **`quantity`** → descontado **só** via botão manual "Descontar Erros" no Financeiro (valor por erro digitado na hora, sem padrão, não automático, não retroativo). Entra no `payments.total` e reflete no Financeiro + C6. **Confirmado pelo Victor como o comportamento desejado.**
  - **Prova real:** Leticia R$150 − R$50 = R$100; Euder/Weder R$50 − R$50 = R$0 (saem da folha C6); Ronaldo (quantity) R$50 − R$1 = R$49.
- **Conclusão: NÃO era bug.** O achado #5 de 27/05 foi leitura incompleta (só o botão `handleErrorDiscount`, que pula `value` de propósito). **Nenhuma linha de código foi alterada.**

### 2.3 Correção de documentação ✅
- `CHECKPOINT_REVISAO_2026-05-27.md`: achado #5 marcado como **refutado** (banner no topo + correção inline + pendência §6 resolvida). Histórico preservado (não apagado).
- Memória do projeto (`project_revisao_2026_05_27.md` + `MEMORY.md`) atualizada.
- **Commit `cd0572a`** (docs) → **push para GitHub via SSH** (chave `id_ed25519`, autenticada como `vitorangelol03-crypto`). Verificado no servidor: GitHub `main` == local `cd0572a`.

---

## 3. O que NÃO foi feito (intencional)

- ❌ **Nenhuma mudança de código** — a função já funcionava; mexer quebraria o que funciona (causaria dupla contagem no C6).
- ❌ Erro `quantity` **não** virou automático nem ganhou valor padrão — Victor confirmou que deve continuar manual pelo botão.
- ❌ **Sem desconto retroativo** dos erros de quantidade já lançados (ex: Sabrina 21/05) — por decisão do Victor.
- ❌ Config do `origin` **não** foi alterada (segue HTTPS pro fluxo do Windows; push feito via URL SSH pontual).
- ❌ Backup **não** foi commitado (gitignored — tem PII).

---

## 4. Decisões tomadas

| Decisão | Por quê |
|---|---|
| Backup antes de investigar/mexer | Victor ia potencialmente alterar dados financeiros de produção |
| Não alterar `payments.total` pra erro `value` | Causaria dupla contagem (Financeiro + C6 já subtraem no líquido) |
| Manter erro `quantity` manual via botão | Comportamento desejado confirmado pelo Victor |
| Push via SSH sem mudar `origin` | HTTPS no WSL não tem credencial; preservar fluxo Windows |

---

## 5. Impacto no sistema

- **Código de produção:** nenhum (zero alteração em `src/` e `supabase/`).
- **App na Vercel:** inalterado (nenhum redeploy de comportamento; só doc foi pro git).
- **Edge functions:** intocadas (CI `ci.yml` não faz `functions deploy` — risco do `/clock` não foi disparado).
- **Banco:** somente leitura (backup). Nenhuma escrita.

---

## 6. Validação / testes rodados

- ✅ Backup: 52/52 tabelas com contagem batendo banco × arquivo; JSON válido; sha256.
- ✅ `node --check _restore.mjs` (sintaxe do restaurador OK).
- ✅ Git: `git ls-remote` confirma GitHub `main` = `cd0572a`.
- ⚠️ tsc/build/playwright **não rodados** — commit foi só documentação (markdown), nenhum código tocado, então não se aplicam.

---

## 7. Lacunas / pendências abertas (do checkpoint de 27/05 — ainda válidas)

> Não bloqueiam nada; precisam só de autorização do Victor pra agir.
1. **Sincronizar `employee-public-api`** source repo (plain) com deployed (bcrypt v3) — risco se alguém redeployar a edge fn.
2. **Validar `p_supervisor_id`** em `apply_bank_hours_to_payment` (3 linhas SQL — forge de autor no audit log).
3. **Rate limit** em `auth-login` / `verify-pin` (não verificado se existe).

---

## 8. Estado do git ao fim da sessão

- Branch `main` — **em sincronia com `origin/main`** (sem ahead/behind).
- Último commit: `cd0572a docs(checkpoint): refutar achado #5 — desconto value/quantity ja correto`.
- Working tree: limpo (exceto este checkpoint novo + `backups/` gitignored).

---

## 9. Próximo passo

- Nada urgente. Sistema funcionando, dados protegidos por backup, doc correta.
- Quando quiser: decidir sobre as 3 pendências técnicas da §7 (cada uma precisa de autorização + mapa de impacto antes de agir).

---

## 10. Como retomar

```bash
cd /mnt/c/Users/VICTOR/Desktop/Projetos/SISTEMA-DE-PONTO && claude --continue
```
Primeira coisa: "Lê CHECKPOINT_SESSAO_2026-05-29.md e o CHECKPOINT_REVISAO_2026-05-27.md (banner do topo), depois me diz onde paramos."

> ⚠️ Push deste ambiente (WSL) só via SSH — HTTPS não tem credencial aqui.

---

*Sessão 2026-05-29. Backup + investigação. Mantido por Victor + Claude Opus 4.8.*
