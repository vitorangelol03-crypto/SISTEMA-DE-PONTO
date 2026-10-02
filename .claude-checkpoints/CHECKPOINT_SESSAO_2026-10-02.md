# CHECKPOINT — Sessão 02/10/2026 (tarde) — descontos da iMile + rombo da 2ª de agosto + prints

> **Em uma frase:** TUDO FEITO E NO AR. 14 descontos da iMile + 30 pacotes da 2ª de agosto
> relançados como desconto normal na 1ª de setembro (44 descontos, R$ 2.508,79); migration
> `20261002205549` aplicada com pedido explícito do Victor (`6ec32f0`); prints 99/99; senha do
> app do Adriano resetada. ⏸️ Victor foi reiniciar o PC — retomar pelo §4.

## 0. Decisões do Victor (não re-perguntar)

1. **Planilha iMile** (MISSING, "DS CRG - FECHAMENTO 1ª QUINZENA SETEMBRO ... atualizado 110101.xlsx",
   a de 14:53 — a "01.10.xlsx" que ele colou é a das 08:41, sem a coluna Q): entra **só** quem tem
   nome de driver na coluna E **e** a coluna Q ("Verificar pra recorrer") vazia.
2. **Valor = coluna S** ("valor de liquidação" = P + multa R). A multa de R$ 100 está nos **Fake
   Delivery (= PNR)**; Goods Lost (= LOST) sem multa. Ele tinha falado o contrário e corrigiu:
   *"1 eu confundi pode fazer"*.
3. Pacote do Gustavo **3320042763577** já lançado na 2ª de julho (R$ 73,80, nunca abatido de
   verdade): *"2 pode cobrar"* — cobra o da iMile.
4. Rombo (espelho antes da planilha → pago sem desconto): aconteceu na **2ª jul, 1ª ago e 2ª ago**
   (provado: abate só `espelho`, nenhum `relatorio`, marca de pagamento com desconto ligado). Ele:
   *"3 só da anterior que está pendente"* → **só a 2ª de agosto**. Fora: **Winglison e Gessiley**
   (decisão dele) e **Fernando / Othon** (R$ 0 a receber na 1ª de set — se levar, some do controle).
5. Como cobrar: *"4 mantém normal como se não tivesse sido descontado antes e foi agora"* →
   **desconto normal** (driverpay_discounts, com o código do pacote), NÃO "saldo herdado".
6. *"pq vc tá pedindo permissão, vc tem permissão"* — não perguntar de novo o que ele já decidiu.

## 1. Feito e conferido em produção

- **14 descontos iMile** na "1 quinzena de setembro" (`573f1819`): **R$ 1.234,00** (produto 234 +
  10 multas). Observação `iMile 1ªQ set — PNR (Fake Delivery): produto R$ X + multa R$ 100,00`.
  `created_by 2626`, recalculado pela RPC do painel; conta de cada pagamento fecha (12 pagamentos).
  9 linhas de fora: Andrea e Adriano ("PNR mas está como avaria" = recorrer) + 7 sem driver.
  Fabricio Maia e João Victor Cassimiro ficaram com líquido negativo (R$ 0 a receber até a ANJUN
  entrar) — a regra "nunca abater mais do que recebe" segura.
- **Pedidos de print**: Geisilaine (844 Shopee) e Diendrel (10) entraram no grupo **hoje 15:10** e o
  pedido automático só roda logo depois de importar planilha (28/09 13:03) → criados os 2 pedidos.
  **99/99** com pedido. 16:40: 45 mandaram, 54 faltam (32 chegaram hoje 15h–16h).
- **Senha do app do Adriano Furtunato** resetada pela RPC do painel (pedido dele, urgente): estava
  travado (7 erros); volta pro **1234 com troca obrigatória**. Não loguei na conta dele.

## 2. ✅ FEITO (fim da tarde) — 2ª de agosto relançada como desconto normal

- Victor: *"pode aplicar a migration da 2ª de agosto"* → `apply_migration` passou, versão registrada
  **`20261002205549`** (arquivo renomeado pra ela). Conferido: coluna `modo` (padrão 'saldo', CHECK),
  função nova, GRANTs iguais (authenticated/postgres/service_role), anon sem EXECUTE.
- Dado (1ª tentativa caiu por erro de conexão do MCP e NÃO gravou — conferido antes de repetir):
  **30 pacotes / R$ 1.274,79 em 16 drivers**, observação `Ref. 2ª quinzena de agosto — <obs original>`,
  `created_by 2626`; 16 linhas de carryover `modo='descontos'`. Conferência real: RPC pelo destino 0
  linhas (painel não soma em dobro), origem 16 / R$ 1.274,79, 2ª ago pendente só os 4 (R$ 651,10),
  0 contas sem fechar, 0 diferença entre gravado e a view. Quinzena aberta: **44 descontos, R$ 2.508,79**.
- Código: comentário em `listCarryoverTo` (`6ec32f0`). typecheck 0 · eslint 0 · build · unit
  `driverPayCarryover` 7/7. CI do `6ec32f0`: conferir na volta.

## 2a. (histórico) como estava antes do OK

- **16 drivers, 30 pacotes, R$ 1.274,79** (nenhum com foto/vídeo de prova).
- Sem marca na ORIGEM, a tela "Saldo de quinzenas fechadas" seguiria mostrando os 16 como
  pendentes → "levar pra quinzena" cobraria em dobro. Marca escolhida: `driverpay_deduction_carryover`
  ganha `modo` ('saldo' | 'descontos'); a RPC `get_driverpay_deduction_carryover_masked` pelo
  DESTINO devolve só 'saldo' (servidor → aba velha também não soma em dobro, sem deploy).
- **Ensaio em transação desfeita: OK** — 30 itens/R$ 1.274,79; RPC destino 0 linhas; origem 16/R$
  1.274,79; 2ª ago pendente só W 199,69 · G 88,68 · Fernando 350,73 · Othon 12,00; 0 contas sem
  fechar; Gustavo fica com R$ 399,20 (275,41 de agosto + 123,79 iMile). Conferido depois: nada ficou.
- Arquivo **`supabase/migrations/20261002190000_driverpay_carryover_modo_descontos.sql` (NÃO
  aplicado, NÃO commitado)**. `apply_migration` barrado pelo classificador ("Protected-Scope IaC
  Apply") — mesma coisa de 11/09; precisa do Victor pedir explicitamente.
- **Ao liberar:** aplicar pelo MCP → rodar o script do ensaio SEM o `RAISE` final (travas: 16 /
  1.274,79 / sem abate parcial / sem código repetido na aberta) → conferir → renomear o arquivo pra
  versão registrada → comentário em `listCarryoverTo` → typecheck/lint/build → commit + push.

## 3. Achados (não consertados — avisar, não mexer sem pedido)

- 🔴 **Espelho PDF não mostra "saldo herdado"**: com carryover, imprime Pacotes − Descontos − Vales e
  um TOTAL menor sem explicar (o `toReceive` desconta, as linhas não). Nunca usado em produção (0
  carryovers) e sem teste. Irrelevante enquanto ninguém usar o "levar pra quinzena".
- 🟡 `listClosedPeriodsDebt` não conta o carryover que CHEGOU numa quinzena → numa cadeia, o resto
  não abatido some do controle.
- 🟡 Pedido automático de print só depois de importar planilha → quem entra num grupo (ou ganha pacote
  na mão) depois fica sem pedido (caso Geisilaine/Diendrel).
- Ficam pendentes no "Saldo de quinzenas fechadas" por decisão (não cobrar agora): 1ª ago 22 pessoas
  R$ 2.080,88 · 2ª jul 14 R$ 983,81 · 2ª jun Cicero R$ 7,79 · 2ª ago os 4 acima.

## 4. ⏸️ RETOMAR DAQUI (Victor reiniciou o PC no fim da tarde de 02/10)

1. Conferir o **CI do `6ec32f0`** (3 jobs).
2. **Prints da Shopee** da 1ª de setembro: às ~16:40 eram 45 mandados / 54 faltando (vem chegando
   pelo app). Casos que ele perguntou: **Claudio Carlos de Paula** (Caratinga) — o líder Fabrício
   mandou às 15:53 o print da quinzena ERRADA (16/08–31/08), recusado na hora, precisa reenviar
   com 01/09–15/09; **Claudiomar** (Pingo d'Água) — nada mandado (ele + Adão, Cleber, Diego
   Domingos, Elenicia). Mensagens de WhatsApp prontas foram entregues ao Victor.
3. **Quando a ANJUN da 1ª de setembro for importada:** reconferir quem estava com R$ 0 a receber
   (Fabricio Maia, João Victor Cassimiro com desconto iMile; Fernando e Othon ficaram com a dívida
   de agosto guardada na origem).
4. **Antes de publicar os espelhos da 1ª de setembro:** está tudo lançado — pode publicar.
5. Pendências antigas seguem no §18 de `CHECKPOINT_SESSAO_2026-09-30.md` (TESTE TABLET, Salvar das
   Configurações + tests/34, banco de horas de Caratinga, passo 2 da prova).
