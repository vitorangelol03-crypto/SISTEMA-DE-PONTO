# Checkpoint — Sessão 2026-10-22

## Caso Fafá: pagou 9.380, nota 9.478 — CAUSA REAL: filtro de plataforma derruba o Zapex

Victor mandou áudio + foto do operador: o Fafá (Fabrício dos Santos Ferreira, líder de
grupo em Caratinga) recebeu R$ 9.380 mas a nota dele é R$ 9.478 (−R$ 98). Victor
perguntou se foi desconto. **Não foi desconto** (grupo com desconto 0, vale 0,
livro-caixa vazio, espelho com `deducted_amount = 0`).

### Causa raiz (provada nos ARQUIVOS reais + código) — 2ª set `9b8fd48b`, Caratinga

As planilhas de pagamento foram geradas **20/10 17:24–17:25** (Downloads):
`Relatorio_Simples_..._LOGGI_SHOPEE_ANJUN_Coleta_Shopee.xlsx` (a principal, **com
filtro de plataforma, sem eMile** — o jeito padrão de pagar) e
`Relatorio_Simples_..._eMile.xlsx` (eMile à parte). As marcas "pago" têm os mesmos
horários (17:24:48 as 4 plataformas / 17:24:58 eMile).

**Bug: relatório com QUALQUER filtro de plataforma exclui o Zapex, em silêncio.**
`computeRowTotals` (`driverPayShared.ts:1345`) só conta Zapex se 'Zapex' estiver no
filtro (`isAllowed('Zapex')`), e 'Zapex' **não existe como opção** nos chips do
`ReportOptionsModal` (`platformOptions` vem só de `driverpay_platforms`). Como o fluxo
padrão é SEMPRE filtrado (tudo-menos-eMile + só-eMile), **o Zapex nunca sai em planilha
nenhuma**. Nunca doeu antes porque a tabela Zapex estava vazia até 19/10 (1º uso).
Espelho publicado POR PLATAFORMA tem a mesma regra (D3) — espelho "de todas" não
(sem filtro, Zapex entra; foi por isso que o espelho do grupo saiu certo, 10.488).

Conferido linha a linha nos 2 arquivos contra o banco: Fabrício 9.380 (= tudo menos
eMile menos Zapex) + 1.010 no eMile; Rogério 7.339,20 **inclui** a LOGGI 149,60
lançada 09:39; Romário 4.350 **inclui** a ANJUN do Thales 110 lançada 10:04; eMile
todo certo. ⚠️ **A 1ª análise desta sessão (commit `f91b270`) concluiu errado**
"planilha gerada na noite de 19/10, falta R$ 525,60" — os números do banco batiam com
duas hipóteses e eu afirmei uma sem discriminador; o Victor corrigiu ("tirei a
planilha às 17h") e os arquivos provaram. Lição regravada: duas hipóteses explicando
os mesmos números = achar o dado que separa (aqui, o próprio .xlsx) ANTES de afirmar.

### O que falta pagar (só o Zapex): **R$ 266,00**
Fafá 98,00 · Lucas Aredes ("Luila") 74,00 · Romário 52,00 · João Pedro Gomes 36,00 ·
Higino 4,00 · Gerson 2,00. (49+37+26+18+2+1 = 133 entregas × R$ 2,00.)
As notas do Fafá estão validadas (9.478 CD + 1.010 iMile = espelho 10.488).

### ✅ Conserto (Victor: "pode conserta para não acontecer mais") — commit `25bf948`
Quando o escopo do relatório tem Zapex (R$ > 0), a janela de opções ganha o chip
**"Zapex"**, marcado por padrão — o fluxo padrão (tudo-menos-eMile) passa a pagar o
Zapex na planilha principal. A janela também avisa quando o Zapex fica **de fora** do
arquivo (âmbar, com o valor) e lembra de **não deixá-lo marcado em dois relatórios**
(sairia em dobro). O texto da marca de "pago" lista só plataformas reais — Zapex não
tem marca (`marcasDoRelatorio` já ignorava; **nada muda no banco**). Sem Zapex no
escopo, a janela fica exatamente como era — por isso o E2E 63 (quinzena de teste sem
Zapex) segue intacto.

- Arquivos: `ReportOptionsModal.tsx` (chip + avisos + texto da marca),
  `DriverPayTab.tsx` (calcula `zapexTotal` do escopo e passa pra janela),
  `tests/unit/reportOptionsModalZapex.spec.tsx` (NOVO, 4 casos — inclui o caso Fafá:
  desmarcar só o eMile mantém o Zapex), `tests/unit/driverPayReportOptions.spec.ts`
  (+4 casos nas funções puras, incl. "quem só tem Zapex não some do filtrado").
- A conta por baixo já estava pronta: `computeRowTotals` aceita 'Zapex' no filtro,
  `hasPackagesInScope` conta Zapex, `brutoPorTomadorDaUnidade` joga Zapex no CNPJ de
  maior valor (regra de 10/09), `pessoasDoDesconto` soma `t.zapex` no bruto. Só
  faltava o chip existir.
- Validação: `npm run typecheck` 0 erros · vitest **38/38** (3 arquivos, na cópia
  Linux — o `.deno/` da sessão 20/10 tinha quebrado o node_modules de lá; `npm ci`
  resolveu) · `npm run build` limpo. Push `25bf948` → main → Vercel.

### ✅ Acerto dos R$ 266 — planilha entregue (22/10, pedido do Victor)
`Diferenca_Zapex_2_Quinzena_Setembro.xlsx` (enviada no chat + cópia no Downloads):
6 linhas — nome do recebedor IGUAL ao pagamento de 20/10, CNPJ, chave PIX (que aqui é
o próprio CNPJ), entregas e valor; total R$ 266,00/133 entregas. **Chaves conferidas
1 a 1 contra o arquivo pago de 20/10** (mesmo nome, mesma chave; Higino recebe como
"Valdeci Alves de moura", recebedor configurado dele — igual no pagamento original).
**Falta só o Clayton executar o pagamento.** Fonte: driverpay_zapex/payments/groups +
recebedor do cadastro; cada um dos 6 é líder da própria unidade (sem sobreposição).

### ⏳ Aberto (opcional, não pedido)
Espelho publicado POR PLATAFORMA continua com a regra D3 (Zapex fora) — o fluxo real
publica "de todas", que sai certo. Só mexo se o Victor pedir.

Fora o conserto acima, nada alterado no banco — investigação só-leitura + .xlsx.
