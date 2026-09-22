# CHECKPOINT — Sessão 22/09/2026

> **Em uma frase:** a pendência da planilha da Shopee (53 divergências de 104) foi **encerrada
> por decisão do Victor** — o banco está certo porque foi lançado na mão, e a planilha não tem
> autoridade nenhuma sobre de quem é o pacote.

---

## 1. Retomada

Li `CLAUDE.md`, `00-INDEX.md`, `CHECKPOINT_PROXIMOS_PASSOS.md` e o checkpoint de 21/09.
Estado no começo: `main` limpo e em sincronia com o remoto (`29c16f0`), CI verde no último
push de código (`0899bdd`, run 35624889881 — 3/3 jobs, 112 passed). Só 4 PDFs soltos sem
versionar na raiz (`Tutorial-Folha-de-Pagamento.pdf`, `espelho.pdf`, `lote.pdf`, `x.pdf`) —
não mexidos.

---

## 2. ✅ DECIDIDO: a planilha da Shopee não será reimportada

**Victor:** *"já foi pago não tem como estar errado"* → *"foi feito manual está tudo certo"*.

Antes de aceitar, fui no dado (6 linhas de SELECT, nada de agente), porque **"já foi pago"
prova que o dinheiro saiu, não que saiu certo** — e nas duas pontas da divergência havia gente
que podia ter recebido **a menos**:

| Quem | No banco | Pago | O que a planilha dizia |
|---|---|---|---|
| ANGELO FABRICIO | SHOPEE 127 + 551 = **678** @2,00 · ANJUN 21 | **R$ 1.398,00** (marcado 21/09 18:30) | −677 (quase nada) |
| Rogerio de Cassio Pereira | **SHOPEE 0** · ANJUN 17 · eMile 38 | **R$ 110,00** (só ANJUN+eMile) | tinha os 678 às 09h de 21/09; zerado às 13:26 |
| Fabricio dos Santos Ferreira | SHOPEE 1.558 + ANJUN 316 + Coleta 805 + eMile 188 + LOGGI 146 | **R$ 5.623,50** (5 plataformas marcadas) | **+657** (≈ R$ 1.314,00) |

Conta conferida linha a linha: os três totais fecham no centavo com os pacotes × taxa que
estão no banco. **Ninguém pagou em dobro** — o risco era o inverso (pagar a menos).

**Ele confirmou os três como certos**, porque o lançamento foi manual. Fechado.

🔑 **E a decisão é tecnicamente a certa, não só a dele:** o arquivo cru da Shopee tem **55
colunas e nenhuma com nome de motorista** — traz o código da rota (`AT2026...`); as duas
colunas "nome motorista" são **acrescentadas por fora**, cruzando o código com uma tabela
mantida à mão. Ou seja, a planilha **não é gabarito de quem entregou**. Reimportar jogaria a
coluna de fora por cima do lançamento certo.

⚠️ **Armadilha que ficou registrada no índice:** a 2ª quinzena de agosto segue **`aberto`** —
um import daquele arquivo **passaria** (a trava é só de quinzena concluída) e desfaria os
lançamentos manuais **em silêncio**. Hoje a única proteção é lembrar.

---

## 3. Lição

**"Já foi pago" não fecha uma divergência de pacote** — fecha quando alguém que conhece a
rota confirma. O que provou não foi o pagamento; foi ele dizer que o lançamento foi manual.
(Mesma família da lição de 21/09: bater com o gabarito não é estar certo — é estar certo no
pedaço que o gabarito cobre.)

---

## 4. Pendências (nenhuma mudou de estado além da de cima)

Continuam abertas, do checkpoint de 21/09 §8.6:
1. 🔴 **Cartão de print para quem não entrega a plataforma** — causa raiz do print trocado
   (Greice → Mikael). Decisão de produto, apresentada 2×, **sem resposta**.
2. 🟡 **Juntar cadastro duplicado ao vincular no import** (`Luis101` × `Luis Fernando`) —
   decisões dele já colhidas, falta escrever; vai precisar de OK para migration (merge atômico).
3. 🟡 **4 espelhos novos** publicados no "em massa" de 21/09 (Adriano Furtunato, Higino Alves,
   Fabricio Maia, Camilli) — confirmar se todos deviam receber.
4. 🟡 2 prints em nome de quem não tem pacote da plataforma (Cloves e Camilli).
5. 🟡 A grade mostrar o `default_rate` da plataforma quando não é o que será pago.
6. 🔴 Folha: as **3 perguntas do contador** (tabelas conferem? redução da Lei 15.270 vale no
   13º/rescisão? teto 988,08 ou 988,09?) — é o que tira a tarja "VALORES EM CONFERÊNCIA".

---

## 5. Validação desta leva

Só leitura de banco (6 SELECTs) e documentação. **Nenhuma linha de código tocada**, nenhuma
migration, nada no ar. Por isso não roda tsc/build/E2E.
