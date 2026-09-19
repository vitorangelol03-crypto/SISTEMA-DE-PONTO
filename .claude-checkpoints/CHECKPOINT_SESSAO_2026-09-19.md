# CHECKPOINT — Sessão 19/09/2026

> **Em uma frase:** o recibo de carteira assinada estava jogando os descontos da folha
> fora; consertado, e a folha passou a aparecer também no relatório e na tela do
> Financeiro. Commit `7504f43`.

---

## 1. O que o Victor pediu

Retomar o projeto e **"terminar o que ficou de fora da folha"** (escolha dele entre 4
caminhos). A ordem combinada, que vale para as próximas levas:

| | Leva | Estado |
|---|---|---|
| 0 | Consertar o recibo (descontos + líquido) | ✅ desta sessão |
| 1 | Relatórios com as linhas da folha | ✅ desta sessão |
| 2 | 13º salário | ⏳ próxima |
| 3 | Férias por avos (direito adquirido) | ⏳ |
| 4 | Rescisão (depende das duas de cima) | ⏳ |

---

## 2. 🔴 O achado: o recibo jogava os descontos fora

Antes de programar qualquer coisa, li o `holeritePdf` e vi que `linhasDoRecibo`
empurrava **todas** as linhas da folha para `proventos`. **Provado gerando o PDF de
verdade e lendo o texto de dentro dele** (não por leitura de código):

```
Salário mensalista (30,00)   +   R$ 1.700,00
Faltas (1,00)                +   R$     0,00   ← era desconto de R$ 56,67
INSS (9,00%)                 +   R$     0,00   ← era desconto de R$ 123,58
TOTAL DE DESCONTOS              -R$     0,00
VALOR LÍQUIDO A RECEBER          R$ 3.442,00   ← a conta da folha dava outra coisa
```

**Por que passou:** os 9 testes de `holeriteLinhasFolha` só usavam folha **sem falta e
sem imposto** — casos em que só existe provento. Os 114 da folha provavam o **cálculo**,
que estava certo. **Ninguém testava o TOTAL do papel.** Por isso `totaisDoRecibo` saiu de
dentro do desenho nesta leva, pelo mesmo motivo que `linhasDoRecibo` já tinha saído.

**Tamanho real:** das 21 pessoas de carteira assinada, **18 são pagas por diária hoje**
(356 lançamentos em agosto). Era exatamente o caminho que o Victor ia percorrer
("preencher o salário de UMA pessoa e conferir o recibo") — ele bateria nisso de cara.

---

## 3. As 4 decisões do Victor (gravadas, não perguntar de novo)

1. **Quem tem salário E diária no mesmo mês:** o papel mostra **os dois** e o líquido
   soma. Nada some sem ele mandar.
2. **Período menor que o mês:** a folha **não aparece**, e o papel/tela **avisa** onde o
   salário está. Vale para o recibo *e* para o relatório. (O motivo técnico: INSS e IRRF
   são progressivos sobre o mês — a fatia da semana daria imposto menor, e somar as 4
   semanas não fecharia com o recibo do mês.)
3. **A tela do Financeiro mostra o salário** de quem tem ("mostra se tiver") — ele
   decidiu contra a minha recomendação de deixar só no papel. Feito, com o cuidado de
   não mexer na conta do pagamento (ver §4).
4. **Ordem das levas:** a padrão (tabela do §1).

---

## 4. O que entrou

- **`src/utils/folha/folhaDaPessoa.ts` (novo).** A decisão de *quem tem folha e quando*
  saiu de dentro do `FinancialTab` e virou módulo. Recibo, relatório e tela usam a
  **mesma conta** — copiar a função seria o começo de duas contas que um dia divergiriam.
- **`folhaCalc.ehMesInteiro`** — a regra do mês fechado, com o porquê escrito.
- **`holeritePdf`** — cada linha vai pro lado certo; `totaisDoRecibo` extraído e
  testável; líquido = pagamento por diária **+** líquido da folha; aviso do "fora do mês".
- **Relatórios (PDF e planilha)** — salário, noturno, salário família, férias, faltas,
  INSS e IRRF entram como mais `LinhaDeValor`, e o **FGTS como `custo-empresa`** — o
  lugar que o `relatorioDados` já previa pra ele desde 12/09. Coluna de FGTS no
  fechamento **só quando existe FGTS**, pra não apertar o papel do diarista com zeros.
  O aviso "o adicional noturno não aparece em valor" sai da folha de quem é mensalista,
  porque nela ele aparece.
- **Tela do Financeiro** — componente `ValorRecebido` (mesa e celular), e o `total_net`
  **gravado no banco** ao publicar o recibo passou a ser o mesmo número do papel. Sem
  isso o funcionário veria no app dele um valor menor que o do próprio recibo anexado.

### ⚠️ O que NÃO foi tocado de propósito
`d.totalEarned` continua sendo só o pagamento por diária. A soma com a folha é feita
**por fora** (`liquidoComFolha`), porque `totalEarned` alimenta a conta do pagamento
inteiro — mexer nele era risco sem necessidade.

---

## 5. Validação

| | |
|---|---|
| typecheck · lint · build | 0 · 0 · limpo |
| Unitários | **104 arquivos / 1.649 testes** verdes, em 9 lotes |
| E2E `tests/116` (novo) | **3/3** — tela no mês, aviso na semana, PDF do relatório |
| E2E sem regressão | `06` 6/6 · `115` 3/3 · `16` 8 verdes + 2 skip |
| Conteúdo do papel | recibo e relatório conferidos **lendo o texto de dentro do PDF** |

**A conta fecha no papel:** recibo 5.150,00 − 188,25 = 4.961,75 · relatório
1.782,99 − 181,64 = 1.601,35.

**Em produção nada muda de valor: 0 das 105 fichas tem salário preenchido.** Sem salário,
`folhaDaPessoa` devolve `undefined` e o recibo de diarista sai idêntico — com teste de
regressão travando isso.

---

## 6. Armadilhas desta máquina (para a próxima sessão)

- 🔴 **O pool padrão do vitest não sobe com o robô da Shopee de pé** (16 Chrome):
  "Failed to start worker" → **"no tests" com código de saída 0**. A saída que funcionou
  foi **`--pool=vmThreads --no-file-parallelism`**.
- ⚠️ **Mas esse pool compartilha o contexto entre arquivos**, então `vi.mock('jspdf')` de
  `mirrorPdf.spec.ts` **vaza** para `mirrorPdf.real.spec.ts` e vice-versa. Os dois passam
  sozinhos (48/48 e 15/15) e falham juntos. **Não é regressão** — rodar esses dois
  separados dos outros.
- ⚠️ `split -d` gera `lote_00`, não `lote_0`. Errei isso e o vitest rodou a suíte
  **inteira** sem argumento — que é justamente o que estoura a memória aqui.

---

## 7. Vizinhança: coisa que eu vi e NÃO consertei (regra do projeto)

🟡 **`moneyBRL` não tem separador de milhar.** A tela escreve `R$ 1700,00` em vez de
`R$ 1.700,00`. **Não é desta leva** — o `moneyBRL` é de 03/09/2026 e já imprime assim em
**toda** a aba Financeiro, no Pagamento C6 e nos Erros. O PDF do relatório e o do recibo
usam outro formatador e saem certos (`R$ 1.700,00`), então os dois discordam na mesma
empresa. Conserto é de 1 linha em `src/utils/moneyMask.ts`, mas muda três telas —
**esperando o Victor decidir.** O `tests/116` já aceita os dois formatos.

---

## 8. Pendências que continuam abertas (de sessões anteriores)

- 🔴 **Excluir quinzena do Pagamentos Driver quebrado desde 08/09** — espera decisão.
- 🔴 **Triagem de Caratinga 07–12/09 (183 pacotes) não distribuída**, semana já paga.
- ⏳ **Importar a planilha nova da Shopee** — 6 nomes a decidir na prévia.
- 📋 **5 pontos pro contador** — até serem marcados conferidos, todo recibo sai com a
  tarja "VALORES EM CONFERÊNCIA".
- Gessiley: conferir o relatório com as 4 linhas de PIX antes de pagar.

## 9. Área de trabalho ao encerrar (NÃO é desta sessão)

`tests/57-driverpay-edits-roundtrip.spec.ts` e `CHECKPOINT_SESSAO_2026-09-15.md` seguem
modificados e sem commit desde 15/09; os 3 PDFs soltos na raiz (`espelho.pdf`,
`lote.pdf`, `x.pdf`) continuam lá. Deixados como estavam, de propósito.
