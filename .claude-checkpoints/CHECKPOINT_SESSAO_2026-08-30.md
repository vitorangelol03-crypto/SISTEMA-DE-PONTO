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

### 6.3 O que consertar (NÃO feito — aguardando OK do Victor)

1. Lint: trocar `Record<string, any>` por `Record<string, unknown>` (ou
   `// eslint-disable-next-line @typescript-eslint/no-explicit-any` com
   justificativa) em `driver-public-api/index.ts:130` — checar se o
   `unknown` compila na fn (usos de `body.x` já passam por `String()`).
   Edge fn precisaria redeploy só se o código mudar de verdade; troca de
   tipo não muda comportamento. Opcional: limpar os 6 warnings.
2. E2E: nos specs 38 e 101, trocar o clique direto por `goToTab(page,
   tab)` (helper já existente). Sem mudar produto.
3. Depois: rodar `npm run lint` + specs 38/101 local + ver CI verde.
