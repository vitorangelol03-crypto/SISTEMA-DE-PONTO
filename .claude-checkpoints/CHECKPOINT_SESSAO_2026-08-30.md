# CHECKPOINT_SESSAO_2026-08-30.md

> Investigação do "Vercel parou de auto-deployar" (pendência de 26/08 §7).
> Conclusão: **não estava quebrado** — foi um único push perdido.

## 1. O pedido

Victor: *"investiga por que a Vercel parou de auto-deployar"*.

## 2. O que a evidência mostrou (só leitura, nada mexido na Vercel)

- **Vínculo Git do projeto intacto** (API `v9/projects`): `link.type=github`,
  repo `vitorangelol03-crypto/SISTEMA-DE-PONTO`, credencial presente,
  `productionBranch=main`, `commandForIgnoringBuildStep=null`, projeto não
  pausado. Ou seja, nenhuma das duas hipóteses de 26/08 (integração
  desconectada / Ignored Build Step) se confirmou.
- **Só UM push deixou de disparar**: o das 10:07 de 26/08 (13:07 UTC,
  `dac3c6d`+`4add67b`). O push das 09:35 (`13f967c`) deployou via `git`
  normalmente, e o de 01:54 (`fc6f6c7`) também. 🔑 `dac3c6d` "não
  aparecer" na lista era **esperado** — a Vercel só builda o commit do
  topo de cada push; o que faltou de verdade foi só o `4add67b`.
- GitHub **recebeu** o push (`pushed_at` 13:07:02Z, CI do Actions rodou
  nele). Nenhum deployment com estado ERROR/CANCELED/QUEUED naquele
  horário na Vercel — o evento simplesmente não chegou lá.
- Status pages: Vercel teve "Elevated build initialization times" em
  25/08 (já resolvido) e "Failures logging in with Vercel CLI" 26/08
  04:28 UTC; GitHub teve "Disruption with some GitHub services" em
  26/08 mas **começou 15:09 UTC**, depois do push perdido. Nenhum
  explica com certeza — a entrega perdida GitHub App → Vercel fica como
  causa provável sem prova (só a Vercel enxerga as entregas do App dela).
- Repo tem zero webhooks — normal, a Vercel usa GitHub App.

## 3. Teste decisivo

Push dos 2 commits só-doc que estavam locais (`2ae1e45` gitignore,
`0b97684` checkpoint — código idêntico ao que já estava no ar, deploy
inofensivo) às 17:11:10Z. **Vercel disparou 3s depois** (`source=git`,
sha `0b97684`, BUILDING) e em <1 min estava `READY` + `PROMOTED` no alias
`sistema-ponto-zeta.vercel.app`. **Auto-deploy está funcionando.**

## 4. Consequências

- A regra "todo push pode precisar de `vercel --prod` manual" **cai**.
  Push volta a publicar sozinho. Se um push específico não aparecer na
  Vercel em ~1 min, aí sim rodar `npx vercel --prod` (a pasta continua
  linkada em `.vercel/`), e conferir por conteúdo, não por HTTP status.
- Memória `reference_vercel_autodeploy_gap.md` atualizada com isso.
- Correção de leitura minha no início da sessão: eu tinha dito que `main`
  = `origin/main`, mas os 2 commits de doc estavam só locais (o reflog
  mostrou o último push em `4add67b`). Resolvido pelo próprio teste.

## 5. Achados no caminho (não tocados)

- CI do GitHub Actions vermelho — **investigado no §6 abaixo**.
- `CHECKPOINT_PROXIMOS_PASSOS.md` segue parado em 19/05 — desatualizado.
- Pendências de 20/08 §5 (filtro "NF ok"/"pago", TOTAL GERAL em branco)
  continuam em aberto.

## 6. Investigação: por que o CI do GitHub está vermelho (2º pedido do dia)

Histórico (`gh run list`, 200 rodadas no `main`): última verde em
**20/07** (`218e130`); desde 21/07 são 120 falhas seguidas. NÃO é
ambiente/segredo — são **duas quebras reais e independentes**, e
`vitest (unit)` passa em todas.

### 6.1 `tsc + eslint` — vermelho desde 21/07 (tsc passa; é o ESLint)

- **21/07 → ~23/07:** `'QUICK_EXIT_CONFIRM_MINUTES' is defined but never
  used` (`no-unused-vars`) — a rodada de 21/07 mostra esse erro; sumiu
  depois (a variável foi removida/usada em algum commit seguinte).
- **23/07 → hoje:** `supabase/functions/driver-public-api/index.ts:130`
  `type Body = Record<string, any>` → `@typescript-eslint/no-explicit-any`.
  Entrou em `433932c8` (23/07) com `// deno-lint-ignore no-explicit-any`
  (só cala o Deno) — o ESLint do repo (`eslint .`, `eslint.config.js`
  ignora só dist/coverage/android/reports) **também lê `supabase/`** e
  reclama. Mais 6 warnings (não derrubam).
- 🔴 **`npm run lint` falha LOCALMENTE com o mesmo erro** (rodado hoje:
  "✖ 7 problems (1 error, 6 warnings)"). Os "eslint 0 erros" registrados
  em checkpoints de agosto não correspondem ao `npm run lint` completo —
  ou foi rodado só em `src/`, ou só nos arquivos tocados. Regra 4 do
  CLAUDE.md pede lint limpo antes de commit; a partir de agora conferir
  com `npm run lint` inteiro.

### 6.2 `playwright (e2e)` — vermelho de vez desde 07/08 (`6172f0e`)

- Falham **2 testes** (113 passam em ~12 min): `tests/38` "B. Navegar
  TODAS as tabs admin" e `tests/101` "G1. Todas as abas admin renderizam
  em PN" — os dois com `getByRole('button', {name: /^Gerenciamento$/})`
  → timeout.
- 🔑 **Causa:** o commit `c346b62` (06/08, "barra de abas que cabe")
  criou o menu **"Mais (N)"** na `TabNavigation` no desktop (≥1024px):
  as últimas abas ("Gerenciamento", "Ajuda"…) deixam de ser botões na
  barra e viram itens dentro do "Mais". O helper `goToTab` de
  `tests/helpers.ts` **já foi adaptado** (abre `getByTestId('abas-mais')`
  se a aba não está visível) — mas esses 2 testes clicam direto no botão
  sem passar pelo helper. É **teste desatualizado, não bug de produto**
  (a mudança de UI foi pedida pelo Victor em 06/08).
- **Reproduzido local** (Vite aquecido antes — frio no WSL estoura o
  `goto` em 15s, ruído): mesma falha, screenshot mostra "Mais (3)" com
  Gerenciamento dentro. Antes de 07/08 as falhas do playwright eram
  esporádicas (04–05/08, flake), não esta.

### 6.3 Conserto feito (`8672604`, pushado) — "faz os dois" do Victor

1. **Lint:** `type Body = Record<string, any>` → `Record<string, unknown>`
   em `driver-public-api/index.ts:130` (todos os 29 usos de `body.x` já
   passavam por `String()`/`Number()`/comparação). 🔑 Conferido com
   `deno check` (Deno 2.9 via `npx -y deno@2`, numa cópia no scratchpad
   com `--node-modules-dir=auto` pra não sujar o repo): **3 erros, os
   MESMOS 3 no HEAD original** (`bcryptjs` sem default export,
   `Uint8Array`→`BufferSource`, cast `SlotOut[]`) — pré-existentes, TS
   local mais novo que o runtime da Supabase onde a v34 roda. Zero erro
   novo. Só tipo/comentário, JS igual → **sem redeploy**.
2. **E2E:** specs 38 (teste B) e 101 (teste G1) trocam o clique direto por
   `goToTab(page, tab)` (helper que já abre o `abas-mais`).
3. `tests/54`: `// eslint-disable-next-line no-console` sem uso removida.
4. **Warnings deixados de propósito (5):** 4× `react-hooks/exhaustive-deps`
   (AttendanceApprovalPanel, FinancialTab, AuditLogsTab, ReportsTab) e
   1× `react-refresh/only-export-components` (CompanyContext exporta
   `useCompany`). Consertar de verdade = `useCallback` com deps certas em
   4 arquivos sem relação com o CI (errar = loop de recarga) ou mover
   `useCompany` pra arquivo próprio (mexe em imports do app todo). Não
   derrubam o CI; ficam como pendência opcional.

**Validado:** tsc 0 · `npm run lint` **0 erros** (5 warnings acima) ·
build limpo (1m03) · **specs 38 + 101 inteiros: 33/33** no Chromium,
`--workers=1` igual ao CI (Vite aquecido antes — frio no WSL estoura o
`goto` de 15s, ruído de ambiente). CI do commit `8672604`: ver §6.4.

🔑 Reparo no caminho (não mexido): `tests/101` H1 (linha 611) afirma que o
admin 8888 de PN "não vê Gerenciamento" com `toHaveCount(0)` — com o menu
"Mais" isso passa mesmo se a aba existir escondida no menu. Passa hoje;
teste ficou fraco, não errado.

### 6.4 CI da rodada `8672604` — ✅ VERDE (run 33325963821)

`tsc + eslint` = success · `vitest (unit)` = success · `playwright (e2e)`
= success. **Primeira rodada verde do `main` desde 20/07** (`218e130`).
Vercel auto-deployou o commit sozinha (código do site idêntico).

## 7. 3º pedido: "limpa os 5 warnings também" (`1e5656a`, pushado, NO AR)

Modo cirúrgico: cada função lida antes de mexer (dep errada em hook =
loop de recarga). Zero mudança de comportamento pretendida.

- **4× `exhaustive-deps`** → `useCallback` com as deps reais e o efeito
  dependendo da função: `load` (AttendanceApprovalPanel,
  `[dateFilter, company?.id]` — iguais às antigas do efeito),
  `loadUsers`/`loadData` (AuditLogsTab, `[]`/`[filters]`),
  `getBonusForAttendance` (ReportsTab, `[paymentIndex, bonusTypes]` ⊆
  deps do memo — o memo trocou `paymentIndex` pela função, que já o
  carrega), `loadBonusRemovalHistory` (FinancialTab,
  `[hasPermission, company?.id, historyFilters]`). 🔑 `hasPermission` é
  `useCallback([permissions, userId])` no `usePermissions` — estável,
  muda 1× quando as permissões carregam. Delta de comportamento
  (proposital, pequeno): o histórico do Financeiro refaz a busca quando
  as permissões terminam de carregar ou a empresa troca — antes ficava
  stale/negado pra sempre.
- **`react-refresh/only-export-components`** → `useCompany` +
  `CompanyContext` + interface movidos pra `src/contexts/useCompany.ts`
  novo; `CompanyContext.tsx` exporta SÓ `CompanyProvider`. Mesma família
  do split de 14.4.9 (`companyHelpers`) e mesmo motivo real: export
  não-componente invalida Fast Refresh → full reload → duplicação de
  módulo. **26 consumidores** atualizados no mesmo passo (regra das 5
  abas); nada mais referencia o arquivo antigo além do `main.tsx`
  (CompanyProvider).

**Validado:** eslint **0 erros e 0 warnings** · tsc 0 · **1322 unit** ·
build limpo · **E2E specs 15+38+46+51: 26 passed / 3 skipped** (15 cobre
o painel de aprovação; 38 todas as abas + troca de empresa =
`useCompany` novo em tudo; 46 Gerenciamento/logs; 51 Financeiro).

🔑 **Falso alarme no caminho, documentado com prova:** rodando o spec 15
isolado, "aprovação em lote" falhou 2× ("toast aprovad não visível") — o
screenshot do retry mostra o toast VISÍVEL e o contador 466→464, ou
seja, a aprovação funcionou e só passou dos 10s do assert
(`bulkApproveAttendance` faz `validatePermission` + UPDATE +
`recalcAttendance` por id contra o Supabase REAL; o painel tem ~466
pendências reais de produção). Re-rodado isolado: **2/2 verde (~44s
cada)**. Diff não toca `services/` nem `hooks/` — flake de latência
pré-existente, mesma família dos flakes WSL documentados em 20 e 26/08.
Obs.: o teste "reset de ponto via UI ... — flaky" do spec 15 é um
`test.skip` VAZIO permanente — o "flaky" é parte do NOME; não confundir
com flake real (me confundiu hoje).

**Vercel:** auto-deploy disparou sozinho e produção está
`READY PROMOTED` no sha `1e5656a` (conferido pela API). **CI:** rodada
em andamento no push; resultado registrado abaixo quando terminar.

### 7.1 CI pós-`1e5656a` — 🔴 pegou REGRESSÃO minha; consertada (`7.2`)

O run do `1e5656a` foi cancelado pelo push do checkpoint seguinte
(`cancel-in-progress` por branch — lição: **agrupar commits num push só**).
O run do `a5d1053` (mesma árvore) falhou: spec 100 **J1/J3**,
`facial-global-toggle` invisível no AdminTab. Reproduzido local.

### 7.2 Causa raiz e fix (commit `fix(audit-logs)`)

🔴 **Minha afirmação "zero mudança de comportamento" no `1e5656a` estava
errada.** No `AuditLogsTab`, o `useEffect` ficava ANTES das declarações e
o array de deps novo `[loadUsers, loadData]` é avaliado na renderização →
`const` ainda em TDZ → `ReferenceError` ao montar → o componente quebra e
derruba o **AdminTab inteiro** (que renderiza `<AuditLogsTab />` na linha
1546) — por isso o toggle sumiu. Meus 4 specs locais (15/38/46/51) não
cobrem o AdminTab (fica atrás da senha Clayton2024) — só o spec 100 J
entra lá; o CI pegou. **Fix de raiz:** efeito movido pra DEPOIS das
declarações, com comentário explicando o porquê.

**Validado:** eslint 0+0 · tsc 0 · **spec 100 seção J 3/3** · spec 46
7/7 · build limpo. CI do push final: registrado abaixo.

### 7.3 CI final

(preenchido quando terminar)
