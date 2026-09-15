# CHECKPOINT — Sessão 15/09/2026

> Bug relatado pelo Victor com print: "não estou conseguindo distribuir erros em
> Ponte Nova e em Caratinga". Causa achada, consertada na raiz, provada e no ar.

---

## 0. Em 30 segundos

| | |
|---|---|
| ✅ Distribuição de triagem volta a gravar | `9c9a804` — uma linha em `distributeTriageErrors` (§2) |
| 🔴 Quebrado desde 03/09 nas DUAS empresas | última distribuição gravada: **01/09**; triagens de 01/09 a 12/09 sem distribuir (§3) |
| ✅ Teste que clica em "Confirmar" | novo em `tests/18` — vermelho com o código antigo, 9/9 verde com o conserto (§4) |
| ⏳ Com o Victor | redistribuir as semanas presas e decidir o que fazer se já foram pagas (§6) |

## 1. O que ele via

Tela Erros → Triagem → Calcular mostrava a prévia certa (Ponte Nova, 08–12/09, 78
pacotes, R$ 78,00), mas "Confirmar Distribuição" dava só **"Erro ao distribuir"**.
Esse texto é genérico: o `catch` do `TriageTab` só mostra a mensagem quando o erro é
`instanceof Error`, e o erro do Supabase é objeto comum — a causa real ficava escondida.

## 2. Causa e conserto

- Log do banco nas tentativas dele (12:28–13:21): `POST /triage_error_distributions
  ?...&select=*` → **403**, `permission denied for table triage_error_distributions`.
- A migration `20260903201630` (brecha REST, 03/09) tirou do `authenticated` a leitura
  de `value_per_error`/`total_deducted` nessa tabela. O INSERT do cabeçalho usava
  `.select()` = pede a **linha inteira** de volta → o Postgres recusa o INSERT todo.
- Conserto: `.select('id')` — o `id` é a única coisa usada depois. A trava de segurança
  **não foi mexida**.
- Provado antes de editar, simulando `authenticated` + JWT 2626 num bloco que se desfaz:
  `RETURNING *` → 42501; `RETURNING id` → grava; insert das partes por funcionário →
  grava. Conferido depois: zero sobra.
- Varredura das 14 tabelas com leitura restrita pro `authenticated` × todo
  insert/update/upsert com `.select(` no `src`: **só este lugar** tinha o problema
  (os outros pedem `id`, que é liberado).

## 3. O tamanho do estrago

Nenhuma distribuição de 02/09 em diante. Triagens registradas e não distribuídas:
- **Caratinga:** 01, 02, 03, 04, 05/09 · 07, 08, 09, 10, 11, 12/09
- **Ponte Nova:** 01, 02, 04, 05/09 · 08, 09, 10, 12/09

Ninguém teve dinheiro errado **descontado** — o que faltou foi o desconto sair.

## 4. Validação

- `tests/18-errors-complete.spec.ts`: teste novo cria 2 funcionários `PW Test` em
  15/06/2030 (conferido: zero ponto real nessa data), triagem de 6 pacotes, R$ 1,
  **clica em Confirmar** (aceita o `confirm`) e confere no banco o cabeçalho (6 / 1 / 2 /
  6) e 3 pacotes + R$ 3,00 pra cada um.
- **Vermelho com o código antigo** (`git stash` só do `database.ts`): falhou esperando a
  mensagem de sucesso, e o log do banco tem o 403 no mesmo segundo.
- **Verde com o conserto:** spec 18 inteiro **9/9**, zero retry. No log: POST do
  cabeçalho com `select=id` → **201**, POST das partes → **201**.
- `npm run typecheck` 0 · `npm run lint` 0 · `npm run build` limpo.
- Suíte unitária não rodada: nenhum unitário toca essas funções/tabela (grep). O CI roda.
- Limpeza conferida no banco: 0 funcionário de teste, 0 ponto/triagem/distribuição em
  2030, 0 parte órfã.

## 5. Deploy

Push `9302ff4..9c9a804` em `main` (14:00). O código mora no bundle principal.
**Conferido no ar às 14:02:** `sistema-ponto-zeta.vercel.app` serve
`assets/index-DTepnV3D.js` **idêntico byte a byte** ao `dist/` local (970.412 bytes,
sha `8fd6531c9e8d…`), com o `.select("id")` dentro do insert.
⚠️ O token da Vercel CLI desta máquina está **inválido** (`invalidToken`) — a API v6 não
responde; a conferência foi só por conteúdo (que é a prova mais forte mesmo).

## 6. Pendências

1. **Victor:** redistribuir as semanas de §3 pela tela (agora funciona). Se a semana de
   01–05/09 **já foi paga**, o desconto vai aparecer numa semana fechada — decisão dele.
2. Avisado, **não mexido**: a mensagem genérica ("Erro ao distribuir", "Erro ao calcular",
   "Erro ao excluir") esconde a causa real quando o erro vem do Supabase.
3. Seguem as de 14/09 (relatório com 4 PIX antes de pagar o Gessiley, E2E 02/15/47,
   decisões antigas).
