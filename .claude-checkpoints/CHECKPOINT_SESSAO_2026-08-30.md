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

- **CI do GitHub Actions está vermelho** em todos os commits recentes:
  `tsc + eslint` = failure e `playwright (e2e)` = failure em `bc31813`,
  `fc6f6c7`, `13f967c`, `4add67b` (`vitest (unit)` passa). Localmente
  tsc/eslint estavam 0 erros nessas sessões — provável diferença de
  ambiente/segredos no CI, **não investigado** (fora do pedido).
- `CHECKPOINT_PROXIMOS_PASSOS.md` segue parado em 19/05 — desatualizado.
- Pendências de 20/08 §5 (filtro "NF ok"/"pago", TOTAL GERAL em branco)
  continuam em aberto.
