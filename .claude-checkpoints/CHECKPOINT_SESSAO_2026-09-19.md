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

---

# LEVA 2 — 13º SALÁRIO (commit `0e23499`)

## Decisões do Victor (gravadas)
1. **As duas opções de parcela**, escolhidas na hora: 1ª + 2ª, ou única.
2. **Base = salário + média do adicional noturno** do ano (o correto pela lei).
3. **Avos pela regra dos 15 dias** (art. 146).

## O que entrou
- `utils/folha/decimoTerceiro.ts` (conta pura) e `decimoDaPessoa.ts` (tira avos e média
  do noturno do PONTO do ano, reusando a `horasNoturnasDoDia` — exportada pra isso).
- O recibo aprendeu 13º: título por parcela, linhas pelo mesmo caminho da folha mensal
  (herdou de graça a separação provento/desconto da leva 0), rodapé com os **AVOS**.
- Tela "13º Salário" no Financeiro: ano, parcela, lista, quem ficou de fora **com o
  motivo**. **Baixar** não grava; **Registrar** grava — separados de propósito.
- Migration `20260919220837` (`payroll_thirteenth`), **aplicada com OK do Victor** e
  provada: catálogo (RLS, anon barrado, trigger) + 3 simulações que se desfizeram
  (04 barrado com 42501 · 2626 grava · parcela duplicada barrada · 0 linhas restantes).

## Números provados no papel
1ª = 857,72 · 2ª = 727,66 · única = 1.585,38 — e **857,72 + 727,66 = 1.585,38**.

## ⚠️ Sem gabarito
Os 12 recibos da contabilidade são de julho: **nenhum tem 13º**. É a regra da CLT como
escrita, e o papel sai com a tarja "VALORES EM CONFERÊNCIA" igual ao IRRF.

## Dois achados (expectativa minha errada, não código)
- A 2ª parcela **nunca fica negativa por salário alto** (INSS tem teto, IR para em
  27,5% → nunca passam de 50%). O caso real é o **salário CAIR** entre nov e dez.
- O **FGTS das duas parcelas perde 1 centavo** contra o da única (trunca duas vezes). O
  certo é o de duas — o depósito é por parcela. O teste exigia igualdade exata e passava
  só pela sorte dos números; agora são 12 combinações com tolerância honesta.

---

# LEVA 3 — FÉRIAS POR AVOS (commit `df8fe32`)

## Decisões do Victor (gravadas)
1. **Sem data de admissão o sistema NÃO inventa** — lista à parte pedindo a data.
2. **Os DOIS números na tela**: 30 cheios e o corte da tabela de faltas (art. 130).
3. **Painel próprio** no Financeiro (o lançamento continua na ficha).

## O que entrou
- `utils/folha/feriasPorAvos.ts`: período aquisitivo, avos contados no **relógio da
  admissão** (10/05 a 09/06) e não no calendário, tabela do art. 130, dias já tirados,
  data limite para gozar. **Nenhuma migration** — tudo já existia.
- Painel "Férias": **vencidas no topo** (a lei manda pagar em dobro), depois quem vence
  em 90 dias, depois por nome.

## 🔴 Erro de desenho pego por teste vermelho
A 1ª versão somava num "saldo" só os 30 dias do período fechado **e** o proporcional do
período em curso — a tela deixaria agendar 40 dias pra quem só pode tirar 30. O
proporcional só vira direito de gozo quando o período fecha. Separado em `diasCheios`
(pode tirar) e `proporcionalCheio` (em formação, só conta em rescisão).

## ⚠️ O DADO QUE FALTA (bloqueia o uso real)
**18 das 21 fichas de carteira assinada estão SEM data de admissão.** Sem ela não há
período aquisitivo. E o "primeiro ponto" **não serve de atalho**: 11 pessoas têm o
primeiro ponto no mesmo **06/11/2025**, que é o dia em que o sistema começou — e são
justamente as mais antigas, as que podem ter férias vencidas.
**Ação do Victor:** preencher as 18 datas (a contabilidade tem) em Funcionários → editar.

## Consertos fora do escopo, feitos com OK dele
- `holeriteLotePdf.spec.ts` piscava **1 em 400**: comparava os dois PDFs letra por letra
  incluindo "Documento gerado em <hora com segundos>". Hora fixada; provado com **3.000
  comparações, 0 diferenças**.
- `tests/117` tinha variável sem uso quebrando o lint — **escapou no commit do 13º**
  porque rodei o lint antes de escrever o spec e não de novo depois. Lição: lint DEPOIS
  do último arquivo, sempre.

## Validação das levas 2 e 3
typecheck 0 · lint 0 · build limpo · **106 arquivos / 1.707 unitários** · E2E **117 5/5**
e **118 4/4** novos · 116 e 06 sem regressão. Deploy conferido por conteúdo nas duas.

---

# LEVA 4 — RESCISÃO (commit `12bc30c`) — A ÚLTIMA DA FOLHA

## Decisões do Victor (gravadas)
1. **Os quatro motivos**: sem justa causa · pedido de demissão · justa causa · acordo 484-A.
2. **O saldo do FGTS é DIGITADO** — o sistema não tem histórico de depósitos, e estimar
   seria inventar o número mais caro do acerto. Sem ele a multa não sai, e o papel avisa.
3. **Aviso prévio: 30 dias + 3 por ano, teto de 90**, trabalhado ou indenizado.
4. **Gerar o acerto só grava a data de saída** — a pessoa continua aparecendo nas telas.
   (Esconder o desligado mexeria em todas as abas de uma vez: leva própria, com calma.)

## O que entrou
- `utils/folha/rescisao.ts`: uma **tabela de regras por motivo**, não `if` espalhado.
  Reusa `feriasPorAvos` (vencidas e proporcionais), `mesesComAvo` (13º) e as tabelas de
  imposto — nenhuma conta nova.
- O recibo virou também **TERMO DE RESCISÃO**: título próprio, linhas pelo mesmo caminho
  da folha e do 13º, rodapé com motivo, tempo de casa e dias de aviso.
- Tela "Rescisão": uma pessoa por vez, com a conta **aberta verba por verba** antes de
  deixar gerar papel. Baixar não grava; Registrar carimba a ficha.
- Migration `20260920003533` (`employees.termination_date/reason` + `payroll_termination`),
  **aplicada com OK do Victor** e provada por catálogo + **5 simulações que se desfizeram**
  (04 barrado com 42501 · 2626 grava · motivo fora dos 4 barrado · duplicada barrada ·
  saída antes da admissão barrada; 0 linhas e 0 fichas desligadas restantes).

## O que a conta acerta e costuma passar batido
- **Aviso indenizado PROJETA o contrato** (Súmula 371): saída em 20/12 com 39 dias de
  aviso conta como 28/01 — e dá um avo a mais no 13º e nas férias. Ignorar paga a menos.
- **Imposto só sobre o que é salário.** Férias, 1/3, aviso indenizado e multa do FGTS são
  indenizatórios; somar tudo numa base só descontaria imposto de dinheiro isento.
- **Justa causa NÃO tira as férias vencidas** — só as proporcionais.
- **Pedido de demissão sem cumprir aviso:** quem deve é a pessoa → desconto de 30 dias
  **secos** (os +3/ano são benefício de quem é mandado embora).

## Números provados no papel
Sem justa causa **R$ 15.791,11** · justa causa **R$ 7.586,25** (mesma pessoa, salário
1.700, 3 anos de casa, saída 15/09, FGTS 8.500).

## ⚠️ Sem gabarito
Nenhum dos 12 recibos da contabilidade é rescisão. Sai com a tarja "VALORES EM
CONFERÊNCIA".

## Achado do E2E (localizador meu frouxo, não código)
`hasText: 'Férias vencidas'` casava também com "1/3 sobre férias vencidas" — o Playwright
compara **por pedaço e sem diferenciar maiúscula**. Ancorado com `^` no começo da linha.

## Validação da leva 4
typecheck 0 · lint 0 · build limpo · **107 arquivos / 1.733 unitários** · E2E **119 5/5**
novo · 117 e 118 sem regressão (9 verdes). Deploy conferido por conteúdo (3/3).

---

# FECHAMENTO DA SESSÃO — 19/09/2026

## Em uma frase
As quatro levas que faltavam da folha entraram: o recibo parou de jogar os descontos
fora, os relatórios ganharam a folha, e nasceram **13º salário, férias por avos e
rescisão** — tudo no ar, com 2 migrations aplicadas e provadas.

## Os commits
| Commit | O quê |
|---|---|
| `7504f43` | Leva 0+1 — recibo consertado + folha no relatório e na tela |
| `0e23499` | Leva 2 — 13º salário |
| `df8fe32` | Leva 3 — férias por avos |
| `12bc30c` | Leva 4 — rescisão |
| `718d5a2` | O ponto do milhar no dinheiro das telas |
| `9650eb7` | 2ª via do 13º e da rescisão |
| `fb28abb` | 13º e rescisão no relatório |
| `c60c0cf` | Desligado some das telas |
| `de28bbd` | Localizador do campo de busca em Funcionários |
| `9c9fcc7` · `1326acc` | checkpoints |

Migrations: `20260919220837` (13º) · `20260920003533` (rescisão).

## ⚠️ EM PRODUÇÃO NADA MUDOU DE VALOR
**0 das 105 fichas tem salário preenchido.** Sem salário, a folha devolve `undefined`
para todo mundo e o recibo de diarista sai idêntico — com testes de regressão travando
isso em cada leva.

## 🔴 O QUE BLOQUEIA O USO REAL (ação do Victor)
1. **18 das 21 fichas de carteira assinada sem data de admissão.** Sem ela não há
   período aquisitivo (férias), nem tempo de casa, nem aviso prévio (rescisão). A
   contabilidade tem essas datas. O "primeiro ponto" **não serve** — 11 pessoas têm o
   primeiro ponto no mesmo 06/11/2025, que é o dia em que o sistema começou.
2. **Nenhum salário preenchido.** O caminho seguro combinado: preencher UMA pessoa,
   conferir o recibo, e só então o resto.
3. **As tabelas de INSS/IR não estão marcadas como conferidas** — todo papel sai com a
   tarja amarela até alguém marcar em Configurações.

## ✅ O separador de milhar — CONSERTADO no fim da sessão (commit `718d5a2`)
A tela escrevia `R$ 1700,00` enquanto **todos** os PDFs escreviam `R$ 1.700,00`. Com OK
do Victor, arrumado em `src/utils/moneyMask.ts` — vale para Financeiro, C6 e Erros.

**Agrupamento MANUAL, não `Intl.NumberFormat`:** o `Intl` separa o "R$" do número com um
**espaço não-quebrável** (U+00A0), e todo lugar que compara texto (E2E, busca do
navegador, `includes`) deixaria de casar por um caractere invisível. Do jeito que ficou,
o formato é byte a byte o mesmo de antes, só com os pontos a mais. Tem teste travando
isso (`charCodeAt(2) === 32`).

A função ganhou lógica, então ganhou o teste que nunca teve: milhar, o corte exato no
4º dígito, negativo, o espaço comum, o mascaramento sem permissão, e número quebrado
virando `R$ 0,00` em vez de espalhar "NaN" pela tela.

Validado: **108 arquivos / 1.741 unitários** · E2E das três telas afetadas sem regressão
(07/14/16: 18+2 skip · 20 e 116: 11 · 10 e 18: 20). Deploy conferido por conteúdo.

---

# LEVA 5 — 2ª VIA (commit `9650eb7`), fechando uma ponta minha

## O que estava errado
As tabelas guardavam o acerto **"para reimprimir depois"** — diz assim na tela e no
commit da rescisão —, mas **não existia tela que reimprimisse**. Promessa no texto do
produto sem nada por trás.

## O problema que apareceu ao construir
O 13º até dá para reconstruir dos valores, mas a **rescisão não**: os dias e avos da
coluna de referência (`Férias vencidas (90,00)`, `13º proporcional (10,00/12)`) nunca
eram gravados. Reimprimir só dos valores daria um papel **parecido**, não o **mesmo**.
Num 13º é chato; numa rescisão é grave — é o documento que a pessoa assinou.

## O que entrou
- **Migration `20260920023702`** (aplicada com OK): coluna `papel` (jsonb) nas duas
  tabelas, guardando o cálculo **inteiro como ele saiu**. Guardar o objeto é de
  propósito: o dia em que o desenho do papel mudar, a 2ª via de um acerto velho continua
  saindo como saiu, porque é **relida**, não recalculada.
- 2ª via do 13º (botão na linha de quem já está registrado) e da rescisão (lista das já
  emitidas). O papel sai marcado **"— 2ª VIA"** no título.

## A prova que dá nome à leva
O E2E **registra** a rescisão com salário 1.700, **muda** o salário para 2.600 na ficha,
e **reimprime**: o PDF sai com o líquido original, lido de dentro do arquivo. Se a tela
estivesse recalculando, o número seria outro.

## Validação
typecheck 0 · lint 0 · build limpo · **109 arquivos / 1.744 unitários** · E2E **120 2/2**
novo · 117 e 119 sem regressão (10 verdes). Deploy conferido por conteúdo (3/3).

---

---

# LEVA 6 — 13º E RESCISÃO NO RELATÓRIO (commit `fb28abb`)

## Decisões do Victor
1. **Entram em qualquer período que contenha a data do pagamento** — diferente do
   salário, que só sai em mês fechado. O motivo: eles são pagamentos que aconteceram
   num DIA; o salário é uma competência mensal que não dá para fatiar.
2. **Cada verba numa linha**, como o relatório já faz com o resto.

## O que entrou
- `getDecimoTerceiroPorPagamento` e `getRescisoesNoPeriodo` buscam por **data**, não pelo
  ano do 13º: a 1ª parcela pode ter saído em novembro e a 2ª em dezembro.
- **`utils/folha/papelGravado.ts`** — lê o papel guardado, **nunca recalcula** (mesma
  regra da 2ª via). Sem o `papel`, monta um bloco mínimo dos valores: o detalhe se perde,
  **o dinheiro não**. Sumir com a verba faria o total não fechar sem explicação.
- Quem só recebeu 13º ou rescisão no período passa a aparecer no relatório.

## 🔴 Achado gerando o relatório de verdade
Em dezembro a pessoa pode receber o 13º do ano **e** ser desligada no mesmo mês — e saía
**"INSS sobre 13º" duas vezes**, com valores diferentes, que lido de fora parece erro de
duplicação. O da rescisão virou **"INSS sobre 13º proporcional"**.

## ⚠️ Erro MEU na validação, corrigido aqui
Meu laço de lotes ia só até o 9º, mas o `split` criava **10**. O commit da leva 5 disse
"109 arquivos" tendo rodado **108**. O que faltou (`xlsxSecurity.spec.ts`) foi rodado e
está verde — nenhuma regressão ficou escondida, mas a contagem estava errada.
**Lição, junto com a do `split -d`: conferir `ls lote_* | wc -l` contra o laço.**

## Validação
typecheck 0 · lint 0 · build limpo · **110 arquivos / 1.762 unitários** (os 10 lotes) ·
E2E **121 1/1** novo · 116, 06 e 119 sem regressão (14 verdes). Relatório gerado e lido
de dentro do PDF: **16.990,54 − 203,05 = 16.787,49** com 13º e rescisão juntos.

---

---

# LEVA 7 — DESLIGADO SOME DAS TELAS (commit `c60c0cf`)

## A regra, nas palavras do Victor
*"Se o funcionário trabalhou até o mês 8, ele recebeu no mês 8, no mês 9 ele foi
desligado, no mês 8 nos registros financeiros vai estar ele lá, mas no mês 9 ele já está
como desligado"* — e *"não fica ocupando espaço com registro à toa"*.

`utils/desligados.ts`: aparece se **não tem data de saída**, OU se **saiu durante/depois
daquele período**, OU se **tem algum dado nele**. Não é conta nova — é o mesmo `teveAlgo`
que o relatório já usava desde 12/09, tirado de dentro de uma tela para valer em todas.

## Decisões do Victor
1. **Bater ponto:** só até a data de saída — quem sai dia 15 bate até o dia 15, mesmo com
   a rescisão registrada antes.
2. **Cadastro:** escondido, com botão "Mostrar desligados (N)".
3. **Telas em massa:** escondem com a mesma regra (pelo período da operação).

## Onde valeu
Funcionários · Financeiro · Ponto · Erros (os seletores; a lista já filtrava) · Espelho
em massa · Gestão de Dados (sem período marcado mostra todos — é a tela de mexer em dado
antigo) · Admin (facial esconde; o seletor de **consulta de log** não, senão some o
histórico de quem saiu). **C6 e Relatórios já estavam certos.**

## ✅ A trava de bater ponto — PUBLICADA (20/09, com OK do Victor)
Edge function `clock-in-validated`, **v15 → v16**, hash novo.

**Antes de publicar**, conferi que o repo NÃO estava atrasado em relação ao deployado
(a armadilha que a memória do projeto avisa): 12 marcas distintivas do código no ar,
inclusive as dos commits de 01/09, 03/09 e 12/09, todas presentes no arquivo do repo.
Sem essa conferência, publicar teria apagado o que só existisse em produção.

**Provado por SONDA na rota**, não por versão:
| Sonda | Resultado |
|---|---|
| Desligado em 15/09 batendo em 20/09 | **HTTP 403** — "Seu cadastro foi encerrado em 15/09/2026…" |
| Saída marcada para HOJE, batendo hoje | **passou** pela trava e chegou na facial |

A segunda sonda é a que prova a decisão do Victor: registrar a rescisão antes não tira da
pessoa os dias que ela ainda vai trabalhar. Fixture da sonda apagada; banco conferido
depois (0 sondas, 0 fichas desligadas, 105 fichas).

## 🔴 O E2E me pegou em dois erros meus
1. Localizador de "a lista carregou" pegou o `<span>Funcionários</span>` do menu, escondido.
2. **O bom:** eu preenchia a data com `fill()` e ia direto conferir a tela — mas o
   Financeiro só busca o período novo quando o campo **perde o foco** (`isEditingDate`,
   para não consultar a cada tecla). A lista continuava a anterior e o teste afirmava
   coisas sobre a tela errada.
   **O que tornou isso visível:** pôr o teste para conferir o PRÓPRIO dado no banco antes
   de olhar a tela. Sem isso, "a tela escondeu" e "os dados nem foram buscados" davam
   exatamente o mesmo vermelho — e a investigação começou pelo lado errado.

## ✅ Os 3 vermelhos de `tests/05-employees.spec.ts` — ARRUMADOS (`de28bbd`, com OK)
Eram do **localizador**, não da tela: `input[type="text"]` com `.first()` pegava o campo
**somente-leitura do link público de cadastro**, que vem antes no HTML, e o `fill()`
estourava com "element is not editable". Trocado pelo placeholder exato. Provado por
`git stash` que já falhavam antes desta leva.
⚠️ Sobrou **1 flaky** ("lista mostra funcionários", passa no retry) — outro teste, que
não usa a busca e não foi tocado.
🔑 **Lição:** `.first()` sobre um seletor amplo é armadilha — o primeiro input da página
raramente é o que o teste quer.

## Validação
typecheck 0 · lint 0 · build limpo · **111 arquivos / 1.776 unitários** (10 lotes,
contados um a um) · E2E **122 4/4** novo · 03-attendance e 21-employees sem regressão.
Nasce inerte: **0 das 105 fichas tem data de saída**.

---

## O que a folha ainda NÃO faz (atualizado)
- ~~Não há tela para reimprimir~~ — **fechado na leva 5.**
- ~~Os relatórios não mostram 13º nem rescisão~~ — **fechado na leva 6.**
- ~~Desligado continua aparecendo em todas as telas~~ — **fechado na leva 7**, com a
  trava de bater ponto **publicada e provada por sonda** (v16).
