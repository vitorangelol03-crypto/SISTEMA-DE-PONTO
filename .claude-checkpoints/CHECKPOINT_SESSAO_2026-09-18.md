# CHECKPOINT — Sessão 18/09/2026

> Bug relatado ao vivo pelo Victor com print: a planilha da Shopee não carregava
> ("Processando a planilha…" pra sempre). Causa achada, consertada na raiz,
> provada com o arquivo real dele e no ar.

---

## 0. Em 30 segundos

| | |
|---|---|
| ✅ Import da Shopee volta a funcionar | `e56c918` — a coluna do entregador mudou de nome (§2) |
| 🔴 Estava travando hoje, na 2ª quinzena de agosto | 105 entregadores / 144.724 pacotes parados (§3) |
| ✅ Provado no arquivo REAL dele | `CLAYTONBDOSSANTOS (97)…xlsx`, 33 MB, 144.725 linhas × 57 colunas |
| ✅ No ar, conferido byte a byte | worker + chunk `DriverPayTab` idênticos ao build local (§5) |
| ⏳ Com o Victor | dar F5 e importar a 2ª quinzena de agosto |

## 1. O que ele via

Escolhia o arquivo, o modal mostrava "Processando a planilha…" e ficava girando
sem fim — nem sucesso, nem erro. (Mandou antes um `.csv` de 105 MB: esse a tela
nem aceita, só `.xlsx`/`.xls`.)

## 2. Causa e conserto

**A Shopee trocou o título da coluna do entregador.**
- Até 08/2026: `Driver Name` (53 colunas).
- Agora: **não existe mais**. No `.xlsx` vêm **duas** colunas chamadas
  `nome motorista` — a 1ª com o **código** (`2769116`), a 2ª com o **nome**
  (`Fulano da Silva`). No `.csv` vêm `motorista - código` / `motorista - nome`.

`detectPlatform` exigia `driver name` exato → a planilha não era reconhecida e o
import parava antes de começar.

Conserto em `driverSheetImport.ts`:
- `SHOPEE_COLUNAS_ENTREGADOR` = os 3 títulos já vistos; a detecção aceita
  qualquer um (o antigo continua valendo — teste de regressão junto);
- `colunaDoEntregadorShopee`: com mais de uma candidata, escolhe a que tem NOME
  olhando o **conteúdo** (até 50 células; maioria com letra), nunca a do código.
  **Decisão do Victor (18/09): vale a coluna do nome** — é o que casa com o cadastro.

**Por que girava sem erro (2ª causa, real):** ler o arquivo consumia **2,4 GB** e
48s (medido aqui). Estourando a memória, o Web Worker morre **sem disparar
`onerror`** — a promessa nunca se resolvia. Tratado:
- `XLSX.read(..., { dense: true })` no worker: mesma leitura, **20s e 1,6 GB**;
- o worker avisa a etapa (`lendo` → `montando` → `somando`) e a tela mostra
  ("Abrindo o arquivo…"); **5 min sem nenhum sinal → mensagem de erro** em vez de
  girar pra sempre.

## 3. O tamanho do estrago

A 2ª quinzena de agosto inteira: **105 entregadores, 144.724 pacotes**
(142.842 SHOPEE + 1.882 Coleta Shopee), nada importado até o conserto.

## 4. Validação

- **Arquivo real**, pelo parser compilado (esbuild + node): detecta `shopee`,
  105 entregadores, 144.724 pacotes, 127 agrupamentos, **0 linhas** com
  "entregador" só numérico (ou seja, pegou a coluna do nome), 19,4s.
- Unit: `driverSheetImport` + 3 specs de import = **48/48** (5 casos novos, com o
  **cabeçalho real de 57 colunas** copiado do arquivo); vizinhos **54/54**.
- `npm run typecheck` 0 · `npm run lint` 0 · `npm run build` limpo.
- 🎯 **Prova no NAVEGADOR de verdade** (o que faltava: a planilha de 33 MB travava
  era dentro do browser). Spec temporário (apagado depois, não entrou no git) que
  loga como 2626, abre Pagamentos Driver, escolhe o arquivo real e espera a prévia:
  **45,1s** do clique até a tela, **zero erro de console**, e a prévia disse
  "Detectado: Shopee · **105 entregadores · 144.724 pacotes**", período de destino
  "2 QUINZENA DE AGOSTO", **99 reconhecidos automaticamente** e 6 a conferir.
  **Não clicou em Importar** — nada gravado.
- E2E `tests/67` (import) **verde** em chromium e mobile-pixel5 (1ª tentativa caiu
  no "Novo período" com servidor frio, passou no retry — o mesmo padrão do §10.4
  de 15/09).
- 🔴 `tests/74` **vermelho — não é desta leva**: provado com `git stash` que falha
  igual sem ela. É o "dois botões Fechar" desde `c993e8c` (09/09), o mesmo já
  consertado no `tests/57` (ainda sem commit). O `tests/74` continua com o defeito.
- ⚠️ firefox/webkit desta máquina não têm binário do Playwright instalado
  (`Executable doesn't exist`) — os "vermelhos" desses dois nem rodam teste.

## 5. Deploy

Push `cdd9e58..e56c918` em `main`. **Conferido no ar:**
`driverSheetImport.worker-C3bvUkFG.js` (sha `cc611331902c…`, 337.309 bytes) e
`DriverPayTab-Buw79Lft.js` (sha `1f5502809048…`, 414.994 bytes) **idênticos byte a
byte** ao `dist/` local; `index.html` aponta pro `index-CJ6BW9Es.js` do mesmo build.

## 6. Pendências

1. **Victor:** F5 na aba e importar a 2ª quinzena de agosto (Shopee). Na prévia ele
   vai ter que decidir **6 nomes não reconhecidos** — Carlos Eduardo Gonçalves
   Cassimiro (983 pct), Douglas Felipe da Silva (755), Rogerio de Cassio Pereira
   (678), Elias Moraes Medeiros (540), ROMULO EUGENIO DA SILVA (393) e RODRIGO
   THEODORO DE JESUS (258). A tela sugere "Criar", mas a planilha nova traz o
   **nome puro** (a antiga vinha "108810-Fulano"), então alguns podem ser driver já
   cadastrado escrito diferente: melhor **ligar ao existente** (ele aprende o
   apelido) do que criar repetido. Avisado.
2. A tela só aceita `.xlsx`/`.xls`. O `.csv` que a Shopee também manda **não** sobe —
   os títulos dele já são aceitos, o formato de arquivo não. Decidir se abre.
3. `tests/74` com o "dois Fechar" (conserto igual ao do `tests/57`).
4. ⚠️ **Outra sessão mexendo no mesmo repositório hoje** (folha CLT:
   `src/utils/folha/folhaCalc.ts`, `tests/unit/folhaCalc.spec.ts`, migration
   `20260918…_folha_clt_ficha_e_config.sql`, `EmployeesTab`, `database.ts`,
   `permissions`). Commitei **só os 4 arquivos desta leva**, nominalmente.
5. Seguem as de 15/09 (triagem de semana paga, "Descontar Erros" de 07–13/09).


---

# LEVA 2 (tarde) — FOLHA DE CARTEIRA ASSINADA NO ESPELHO

> Outra sessão, mesmo dia, mesmo repositório. Pedido do Victor: *"precisamos focar
> agora na parte do espelho sair FGTS, auxílio família e etc, salário fixo"* — é a
> **Etapa 3 do `PLANO_FINANCEIRO_2026-09.md`**. Ele aprovou o plano com
> "1 sim, 2 sim, 3 sim, 4 sim" e depois "pode aplicar a migration".
>
> ⚠️ Esta leva NÃO toca nada do import da Shopee (leva 1, acima).

### Em 30 segundos

| | |
|---|---|
| ✅ Cálculo da folha provado contra os 12 recibos reais | `src/utils/folha/folhaCalc.ts` (§2) |
| ✅ Banco: ficha + configuração por ano | migration `20260918162520`, aplicada e provada (§3) |
| ✅ Salário é permissão PRÓPRIA, desligada pra todo mundo | `employees.viewPayroll` / `editPayroll` (§4) |
| ✅ Recibo sai com salário, família e as bases do FGTS | `holeritePdf` + Financeiro (§5) |
| ⏳ Falta | relatórios com as linhas novas · INSS/IRRF (2ª leva combinada) |
| 🔴 Avisado | faltas e férias **não** descontam: recibo de quem faltou sai com o salário cheio (§7) |

### 1. As decisões dele nesta sessão (não perguntar de novo)

1. **Espelho antes do vale** — a ordem de 12/09 dizia vale primeiro; ele mandou o espelho.
2. **Adicional noturno em R$ só pra carteira assinada.** O diarista continua como está
   (a conta dele vive no `clockOut`, a partir da diária, e não foi tocada).
3. **Salário família pela QUANTIDADE de filhos digitada**, não por data de nascimento.
   Cota e teto configuráveis por ano.
4. **Entram os 21 marcados "Carteira Assinada"** (17 Caratinga + 4 Ponte Nova), pelo campo
   operacional `employment_type`. Os 6 de Caratinga que são "Diarista" no operacional e
   "CLT" no cadastro ficam de fora até ele acertar a ficha.
5. **Quem vê salário é decidido por permissão** ("será decidido com permissões") — por isso
   virou permissão própria, e não carona no `employees.edit`.
6. **O PDF da contabilidade é só MODELO**, não a lista de gente (as 12 pessoas dele não
   existem no sistema — ver §6).

### 2. O cálculo, provado contra o papel — não deduzido

Gabarito: `569 - REC PGTO`, Julho/2026, CD LOGISTICA, contabilidade Arruda (sistema SCI),
12 recibos, lidos de DENTRO do PDF (nenhum número digitado à mão). O teste
`tests/unit/folhaCalc.spec.ts` é esse gabarito.

- **Valor do FGTS = 8% da base, TRUNCADO em centavos** — bate em **12 de 12**.
  Arredondando pro mais próximo erraria em 4 (a Camila sairia com 141,83 no lugar de 141,82).
- **Base do FGTS = salário do mês + adicional noturno.** Salário família fica **fora**
  (Camila: 1.700,00 + 72,87 = 1.772,87, sem os 67,54) e a **PLR também** (Maycon).
- **Salário do mês = salário ÷ 30 × dias, sem passar do salário cheio.** O limite importa:
  Geandra e Miriane foram admitidas em 01/07, têm 31 dias de referência e recebem 1.700,00
  — sem o teto receberiam 1.756,66.
- **Salário família é proporcional e truncado** (Vitoria, 2 cotas em 22 dias:
  135,08 ÷ 30 × 22 = 99,058… → 99,05).
- **Truncar exige limpar o ruído do ponto flutuante antes:** `1700 / 30 * 21` dá
  1189.9999999999998, e cortar direto pagaria R$ 1.189,99 no lugar dos R$ 1.190,00 do
  recibo da Silvia. Um centavo a menos numa folha de verdade.

⚠️ **Uma divergência conhecida, registrada no teste:** no mês de admissão, o papel da
Vitoria (10/07) dividiu por **31** e o do Fábio (08/07) por **30**. Os dois não cabem na
mesma regra. Ficou o ÷ 30 (o da CLT, que bate em 11 dos 12) — **a confirmar com a
contabilidade** antes de a folha virar oficial.

### 3. Banco — migration `20260918162520_folha_clt_ficha_e_config` (APLICADA)

Aditiva: nenhuma coluna existente mudou, nenhum valor gravado foi tocado.

- `employees` ganhou `monthly_salary`, `family_allowance_children`, `ctps_number`,
  `ctps_series`, `cbo`, `fgts_enabled` (+ 2 `check` de sanidade).
  Conferido antes de escrever: o GRANT de `employees` é de **tabela inteira**, então as
  colunas novas já entram sozinhas — sem isso, qualquer leitura que as pedisse levaria 403
  (foi exatamente o que quebrou a distribuição de triagem em 03/09).
- `payroll_config`: uma linha por empresa **e por ano** (o ano importa: cota e teto mudam
  por lei, e recalcular um mês antigo tem que usar o valor da época). RLS por empresa,
  `anon` sem nada, `authenticated` sem DELETE, e trigger exigindo `settings.editDailyRate`.
- Semeado: 8% · cota 67,54 · teto 1.906,04 nas duas empresas, para 2026.
- `fgts_enabled = true` nos **21** de `employment_type = 'Carteira Assinada'`. Ligar não
  muda nada sozinho: sem salário preenchido, a base é zero.

**Provado por simulação que se desfaz sozinha** (5 cenários, tudo revertido no fim):
usuário 04 sem permissão → **42501** com a mensagem certa · usuário 02 grava · 8888 (PN)
enxerga **0** linhas de Caratinga · anon **barrado** · DELETE **barrado** mesmo pra quem
grava. Conferido depois: as 2 linhas intactas, FGTS ainda 8%.

### 4. Permissão própria pra salário

`employees.viewPayroll` e `employees.editPayroll`. **Nascem desligadas pra todo mundo**:
quem já tem linha salva em `user_permissions` não recebe a chave nova, e `hasPermission`
só devolve `true` no `=== true`. Só o **2626** passa, pelo bypass de sempre.

Hoje quem edita ficha é 02, 03 (supervisores de Caratinga), 9999 e 8888 — nenhum deles vê
salário até o Victor ligar na tela de Permissões. O modelo "Admin" do botão já vem com as
duas ligadas; o de supervisor e o de somente-leitura, não.

### 5. O que aparece na tela e no papel

- **Ficha do funcionário:** bloco "Folha (carteira assinada)" com salário mensal, filhos,
  CTPS, série, CBO e a chave do FGTS. Some inteiro sem `viewPayroll`; fica só de leitura
  com `viewPayroll` e sem `editPayroll`. Sem `editPayroll`, o salvamento **nem manda** os
  campos — um salvamento comum de outra pessoa não apaga o salário que alguém preencheu.
- **Configurações da empresa:** seção "Folha (carteira assinada) — <ano>" com % do FGTS,
  cota e teto, com estado de carregando e erro de verdade.
- **Recibo:** as linhas da folha entram na "Composição do Pagamento" no lugar das diárias
  (`Salário mensalista (30,00)`, `Adicional noturno`, `Salário família (1,00)`), e o rodapé
  ganha **Salário base · Base FGTS · Valor FGTS**, como no modelo da contabilidade. O FGTS
  aparece aí e **não** entre os descontos — é custo da empresa; como desconto, o líquido
  não fecharia.
- **O recibo do diarista não mudou nem uma linha** — tem teste só pra isso.

### 6. 🔴 As 12 pessoas do modelo não estão no sistema

Ponte Nova **é** a CD LOGISTICA LTDA, CNPJ 53.824.315/0001-10 — a mesma empresa dos
recibos. Mas nenhum dos 12 nomes existe no cadastro (procurados um a um, inclusive por
pedaço do nome): a Ponte Nova aqui tem **6 pessoas no total** (4 carteira assinada + 2
diaristas) e a folha da contabilidade tem **12 de carteira assinada**.

Decisão do Victor: **o PDF é só exemplo**. A conta está provada contra ele; a população
é outra conversa (cadastro).

### 7. 🔴 O que esta leva NÃO faz (dito antes de alguém descobrir no papel)

- **Falta e férias não descontam.** Quem faltou sai com o salário cheio no recibo. No
  gabarito é o caso da Silvia: o papel dela traz 21 dias e R$ 1.190,00 porque tirou 9 dias
  de férias; aqui sairia 30 dias e R$ 1.700,00. Está escrito no teste, não escondido.
- **INSS e IRRF** ficam pra segunda leva (combinado em 12/09). O recibo mostra a base, não
  o valor.
- **Férias, 13º, PLR e rescisão** não entram.
- **A jornada mensal de 220 horas** (que vira o valor da hora do adicional noturno) é o
  padrão da CLT, **não um número conferido**: o gabarito traz o valor do adicional mas não
  as horas noturnas de onde ele saiu. A confirmar com a contabilidade.
- **Os relatórios ainda não mostram as linhas da folha** — o próximo passo. O aviso do PDF
  de relatório ("o adicional noturno não aparece em valor") segue verdadeiro lá.

### 8. Validação

| | |
|---|---|
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm run build` | limpo |
| Unitários da leva | **64/64** em 3 arquivos (`folhaCalc` 45 · `holeriteLinhasFolha` 9 · `permissions` 10) |
| Migration | aplicada e provada por simulação (§3) |
| E2E `tests/115` | ver §8.1 |

#### 8.1 E2E — `tests/115-folha-clt-ficha-e-config.spec.ts` (novo): **3/3, sem retry**

1. O 2626 preenche salário, filhos, CTPS, série, CBO e FGTS, salva, e o teste confere no
   BANCO (não na tela) que os 6 campos ficaram gravados; depois **recarrega a página** e
   confere que voltam preenchidos — é o caminho de leitura que já quebrou em 03/09 com 403
   silencioso por coluna sem SELECT.
2. O **9999** abre a mesma ficha e o bloco da folha **não existe** pra ele — a permissão
   nova provada na tela, não só no tipo.
3. A seção "Folha (carteira assinada) — 2026" nas Configurações traz 8 · 67,54 · 1906,04,
   lidos do banco.

**Quatro tentativas até fechar, e os quatro problemas eram do TESTE, não do código:**
- `getByPlaceholder('Número')` casava com 4 campos da ficha, e `getByPlaceholder('0')`
  casa por PEDAÇO (pegava "Ex.: 1700,00" e "4141-40") → bloco ancorado em
  `data-testid="bloco-folha"` e `{ exact: true }`.
- **O `createTestEmployee` grava um CPF só ÚNICO, não válido** (`9` + timestamp), e o
  formulário valida o dígito: o "Atualizar" morria em "CPF inválido" e nada era salvo.
  O spec agora gera um CPF válido, como o `tests/39` já fazia.
- **A aba Admin tem senha própria** (`verifyAdminSecret`, "Clayton2024" nos testes): sem
  destravar, nenhuma seção dela existe no DOM.
- A aba é `lazy`: o `isVisible()` respondia "não" antes de ela montar e o teste seguia com
  a tela de senha na frente. Agora espera por condição.

Uma melhoria saiu daí: o salário voltava como `1700` na ficha e agora volta `1700,00`.

#### 8.2 Armadilhas que apareceram de novo

- **Vitest sai com código 0 sem rodar nada** quando a máquina está ocupada (o E2E rodando
  junto): "Test Files no tests / Errors 1 error" e exit 0. Conferir SEMPRE a contagem de
  arquivos, nunca só o código de saída.
- **O E2E roda em 4 navegadores** — uma rodada do spec inteiro levou **22 minutos**. Pra
  iterar, `--project=chromium`.
- Dois seletores meus nasceram frágeis: `getByPlaceholder('Número')` casa com 4 campos da
  ficha (agora o bloco tem `data-testid="bloco-folha"`), e `scrollIntoViewIfNeeded` antes
  do `expect` estoura em 10s se a tela ainda não montou.
- **O servidor de dev caiu sozinho no meio de uma rodada** (`ERR_CONNECTION_REFUSED`), a
  mesma armadilha de 09/09. Subir `npm run dev` à parte antes do E2E resolveu — e derrubar
  depois **pelo PID da porta** (`ss -ltnp`), porque o `npm run dev` deixa um filho `node`
  segurando a 5173 depois de morto o pai.
- 🔴 **Sobrescrevi o `CHECKPOINT_SESSAO_2026-09-18.md` da outra sessão** (a do import da
  Shopee) ao criar o meu com `Write`. Recuperado do commit `b6b0601` e a minha parte virou
  esta "LEVA 2" no mesmo arquivo. **Lição: dois trabalhos no mesmo dia dividem o arquivo do
  dia — ler antes de escrever, sempre.**

---

# LEVA 3 — FALTAS E FÉRIAS NA FOLHA

> Pedido do Victor logo depois da leva 2: *"adiciona ... função de férias e falta também"*.
> Decisões dele: **"quero ter as duas opções"** (falta) · **"sim"** (1/3 de férias) ·
> **"descarta isso, falei errado"** (Logística/Mecânica — não foi feito).

## 1. O que entrou

- **Dois tipos de falta.** `attendance.absence_justified` (nova coluna, padrão `false`).
  Na tela do Ponto o selo da falta vira "Falta com atestado" e tem o botão
  "Marcar com atestado" / "Tirar o atestado". A justificada **não desconta nada**.
- **DSR como chave configurável**, por empresa e por ano, **nascendo desligada**: ligada,
  a falta sem atestado derruba também o descanso da semana. Duas faltas na MESMA semana
  derrubam **um** descanso só — a conta agrupa por semana de verdade (`semanaDaData`),
  não multiplica por falta.
- **Férias** (`employee_vacations`, tabela nova): lançadas na ficha, com histórico e
  remoção. Os dias saem do salário e viram **"Férias"** e **"1/3 de férias"** no recibo.
  Férias que atravessam o mês contam só os dias do período — ninguém perde salário duas
  vezes (`diasDeFeriasNoPeriodo`, com teste).

## 2. 🔴 O erro de desenho que eu peguei antes de implementar

Do jeito que eu tinha escrito o teste, **a falta descontaria DUAS vezes**: o salário vinha
reduzido pelos dias faltados *e* ainda saía uma linha de desconto. Refeito:

- **Férias REDUZEM a linha do salário** (têm que reduzir: senão a pessoa receberia duas
  vezes pelos mesmos dias, já que férias é provento à parte).
- **Falta NÃO reduz a linha do salário** — sai como **desconto**, com os dias à vista.
  É a lição de 04/08/2026 (o desconto de erro que ninguém via): descontar escondido,
  reduzindo a referência, deixa o funcionário sem saber para onde foi o dinheiro.
- O desconto da falta nunca passa do salário do mês, então o líquido não fica negativo.

Tem teste travando isso: *"a falta NÃO desconta duas vezes: o líquido bate com os dias
pagos"* e *"faltar o mês inteiro zera o líquido, nunca fica negativo"*.

## 3. Banco — migration `20260918175402` (APLICADA)

`attendance.absence_justified` + `absence_note` · tabela `employee_vacations` (RLS por
empresa, trigger exigindo `employees.editPayroll`) · `payroll_config.dsr_on_unjustified_absence`.

**Provado por simulação que se desfaz:** usuário 02 (sem `editPayroll`) barrado com 42501 ·
2626 lança · 8888 (PN) enxerga **0** férias de Caratinga · anon barrado · período com fim
antes do começo recusado pela regra de data (23514, conferido à parte, porque na primeira
simulação ele bateu na trava de permissão antes e eu quase dei por provado o que não foi).

## 4. Validação

| | |
|---|---|
| Unitários | **88 verdes** (`folhaCalc` 69 — 24 novos de falta/DSR/férias — · `holeriteLinhasFolha` 9 · `permissions` 10) |
| typecheck · lint · build | 0 · 0 · limpo |
| E2E `tests/115` | **3/3** depois da mudança (a ficha ganhou o bloco de férias e não quebrou) |
| Banco | sem sobra de teste |

## 5. O que ainda NÃO faz

- **INSS e IRRF** seguem para a segunda leva (combinado em 12/09).
- **13º, rescisão e o cálculo de férias por avos** (aquisitivo) não entram: aqui as férias
  são o período que alguém lança, não o direito calculado.
- Os **relatórios** ainda não mostram as linhas da folha — segue pendente da leva 2.
- A **jornada de 220h** do adicional noturno continua sendo o padrão da CLT, não um número
  conferido contra o papel.

---

# LEVA 4 — INSS E IMPOSTO DE RENDA

> *"agora faz o INSS e IR"* · *"quero fechar tudo relacionado a isso hoje"*.
> Decisões dele: **(1)** a tela nasce pronta e semeada, ele corrige com o contador ·
> **(2)** no IR vale o caminho que der MENOS imposto · **(3)** enquanto a tabela do ano
> não for conferida, o recibo sai com aviso de "valores em conferência".

## 1. 🟢 O INSS foi DERIVADO do papel — e bate em 11 de 11

Não veio de tabela decorada: saiu dos próprios recibos, resolvendo a conta ao contrário.

- **Progressivo: 7,5% até ~R$ 1.621 e 9% sobre o que passar.** Truncado, como o FGTS.
- A alíquota que o papel imprime ("9,00%") é a **faixa alcançada**, não o que a pessoa
  paga no total: a Camila tem base 1.772,87 e paga 135,23 — **7,6% efetivos**.
- 9 dos 10 recibos de 9% convergem no mesmo limite de faixa (1.621,2 a 1.621,9 — o papel
  não permite cravar o centavo). A Silvia fica fora: o INSS dela incidiu sobre férias
  pagas em recibo à parte.
- Testado contra os 11: **11/11**, com a faixa impressa batendo também.

## 2. 🔴 O que NÃO é provado por nada

- **As faixas de 12% e 14% do INSS e o teto.** O maior salário do gabarito é R$ 2.200 —
  ninguém chega lá.
- **A tabela inteira do IRRF.** **Nenhum dos 12 pagou imposto de renda** (todos abaixo da
  isenção); o papel só mostra a "Base IRRF". Tentei derivar a regra da base e ela não
  fecha — o abatimento varia de R$ 423 a R$ 514 entre as pessoas, sem padrão que o papel
  explique.

Por isso as tabelas nascem **`confirmado = false`** e o recibo sai com uma tarja amarela
de **"VALORES EM CONFERÊNCIA"** enquanto ninguém marcar que bateu com a contabilidade.

## 3. O que entrou

- `src/utils/folha/impostos.ts`: `calcularInss` (progressivo, truncado, com teto),
  `calcularIrrf` (**calcula pelos dois caminhos — simplificado e deduções — e usa o que
  der menos imposto**) e `faixaAplicada` (a porcentagem que o papel imprime).
- Migration `20260918...` — `payroll_tax_tables` (ano + tipo, faixas em jsonb, marca de
  conferida, quem confirmou e quando). **Federal: sem `company_id`**, vale pras duas
  empresas. Leitura liberada pra quem está logado; escrita exige `settings.editDailyRate`,
  travado no banco.
- A folha ganhou `baseInss`, `inss`, `baseIrrf`, `irrf` e o caminho escolhido do IR. A
  base é a **remuneração tributável** (salário + noturno + férias + 1/3 − faltas), a
  mesma que o papel imprime como "Base INSS" e "Base FGTS" — com o salário família fora.
- O recibo passou a ter as **5 caixas do modelo** (Salário base · Base INSS · Base FGTS ·
  Valor FGTS · Base IRRF) e a tarja de conferência.
- Configurações: tela pra editar as faixas dos dois impostos, o teto, o abate por
  dependente e o desconto simplificado, com a marca "Conferida com a contabilidade".

## 4. ⚠️ Coisas a confirmar com o contador (registradas, não escondidas)

1. As faixas de **12% e 14%** do INSS e o **teto**.
2. **A tabela inteira do IR** e o desconto simplificado.
3. **Os dependentes do IR usam o mesmo campo do salário família.** Na lei não é a mesma
   coisa (o do salário família tem limite de idade e renda), mas a ficha só tem um campo.
4. As de antes: jornada de 220h do adicional noturno e o divisor do mês de admissão.

## 4.1 Validação

| | |
|---|---|
| Unitários | **114 verdes** — `folhaCalc` 82 · `impostosFolha` 23 · `holeriteLinhasFolha` 9 |
| INSS contra o papel | **11/11** recibos reais, com a faixa impressa batendo também |
| typecheck · lint · build | 0 · 0 · limpo |
| E2E `tests/115` | **3/3**, sem flaky |
| Migration `20260918182605` | aplicada; travas provadas por simulação (04 barrado, 8888 lê as 2 tabelas por serem federais, anon barrado) |

⚠️ **Os três arquivos de teste nunca rodaram na MESMA rodada** (o robô da Shopee derruba o
worker do vitest). Cada um foi provado numa rodada própria, conferida pela contagem
"Test Files 1 passed (1)" — que é o que dá pra afirmar com honestidade.

🔴 **Um vermelho real apareceu e era expectativa MINHA errada**, não o código: eu tinha
escrito que o caminho simplificado do IR sempre ganharia. Não ganha — com salário de
6.000 o INSS (R$ 633,18) já é maior que o desconto simplificado (R$ 607,20), então as
deduções pagam menos. O sistema escolhia certo; o teste é que estava errado. Trocado por
dois testes melhores, incluindo uma varredura de 2.500 a 9.000 exigindo que o escolhido
seja sempre o de menor imposto.

⚠️ O caso das Configurações ficou **flaky** na primeira rodada (passou só no retry): era
um `scrollIntoViewIfNeeded` meu, inútil ali, estourando com o orçamento do teste no fim.
Removido + `setTimeout(150s)` no caso, porque a aba Admin ficou mais pesada. Rodada
seguinte: 3/3 limpo.

## 5. Armadilha da máquina (de novo, pior)

O **robô da Shopee** (projeto CRIADOR DE AT, 11 Chrome) estava rodando, e o vitest passou
a falhar com *"Failed to start worker"* — saindo com **código 0 e "no tests"**. Conferido
no código do vitest: `START_TIMEOUT = 6e4` / `9e4`, **fixo, sem flag nem config**. Com o
robô de pé, `--pool=threads` chegou a funcionar uma vez e depois também falhou; a saída é
**repetir até a rodada valer** e conferir SEMPRE a contagem de arquivos, nunca o código de
saída. CPU estava 93% ociosa — é o `/mnt/c` do WSL, não falta de processador.

## 6. Deploy — e a armadilha do falso 200, de novo

Push `09c94e6..581a115`. **Conferido byte a byte: 6 de 6 pedaços** idênticos ao `dist/`
local (`index` · `holeritePdf` com a tarja · `AdminTab` com a tela das tabelas ·
`FinancialTab` · `EmployeesTab` · `AttendanceTab`), com "VALORES EM CONFERÊNCIA" e
"Conferida com a contabilidade" conferidos DENTRO dos arquivos servidos.

🔴 **Caí na armadilha que a própria memória do projeto avisa** (`reference_vercel_autodeploy_gap`):
vigiei o deploy perguntando "esse arquivo responde 200?". O rewrite de SPA devolve **200
com o index.html** pra qualquer caminho inexistente, então os 4 pedaços "chegaram" sem ter
chegado — a página ainda servia o bundle da leva anterior. O jeito confiável é ler **qual
bundle o `index.html` referencia** e depois comparar o conteúdo.

⚠️ Segunda pegadinha na mesma conferência: usei nomes de chunk do build ANTERIOR pro
`EmployeesTab` e o `AttendanceTab`. Como o `folhaCalc` mudou, os dois foram renomeados —
tirar o nome do `grep` no bundle atual, nunca de uma lista de antes.

---

# FECHAMENTO DA SESSÃO — 18/09/2026

## Em uma frase

A **folha de carteira assinada inteira** entrou: salário fixo, salário família, FGTS,
falta com atestado, DSR configurável, férias com 1/3, INSS e IR. Tudo no ar, conferido
byte a byte, com 3 migrations aplicadas e provadas por simulação.

## ⚠️ Em produção NADA mudou de valor ainda

**0 das 98 fichas têm salário preenchido.** Enquanto ninguém digitar um salário, todo
recibo sai exatamente como saía — inclusive o de diarista, que tem teste só pra garantir
que não mudou nem uma linha. O primeiro recibo diferente é uma escolha do Victor, não um
efeito colateral.

**Caminho seguro combinado com ele:** preencher o salário de UMA pessoa de carteira
assinada, lançar uma falta e umas férias, gerar o recibo dela no Financeiro e conferir.
Se não bater, é uma pessoa e dá pra desfazer.

## Os commits desta sessão (levas 2 a 4)

| Commit | O quê |
|---|---|
| `e30c287` | Salário fixo, salário família e FGTS no espelho |
| `6ed75d2` | Falta com atestado, DSR configurável e férias com 1/3 |
| `d8506d2` | INSS derivado do recibo real, e IR com aviso de conferência |
| `fe6fc4a` · `09c94e6` · `581a115` · `6f8a95b` | checkpoints |

Migrations: `20260918162520` (ficha + config) · `20260918175402` (faltas + férias) ·
`20260918182605` (tabelas de INSS/IRRF).

## 📋 A lista do contador (o que o sistema NÃO conseguiu provar)

1. Faixas de **12% e 14% do INSS** e o **teto** — ninguém do gabarito chega lá.
2. **A tabela inteira do IR** — nenhum dos 12 recibos pagou imposto de renda.
3. **Dependentes do IR usam hoje o MESMO campo dos filhos do salário família.** Na lei
   não é a mesma coisa; se for diferente, vira dois campos.
4. **Jornada de 220h**, que define o valor da hora do adicional noturno.
5. **Divisor do mês de admissão**: o recibo da Vitoria dividiu por 31 e o do Fábio por
   30 — não cabem na mesma regra. Ficou o ÷30 (CLT), que bate em 11 dos 12.

Enquanto as tabelas não forem marcadas como conferidas na tela de Configurações, **todo
recibo sai com a tarja amarela "VALORES EM CONFERÊNCIA"**.

## ⏳ O que ficou de fora da folha

- **Os relatórios ainda não mostram as linhas novas** (salário, férias, INSS, IR) — ficou
  da leva 2 e é o próximo candidato natural.
- **Férias por avos** (o direito adquirido), **13º** e **rescisão**.
- O aviso do PDF de relatório ("o adicional noturno não aparece em valor") **segue
  verdadeiro lá**, porque o relatório não usa a folha ainda.

## Área de trabalho ao encerrar (NÃO é desta sessão)

`tests/57-driverpay-edits-roundtrip.spec.ts` e `CHECKPOINT_SESSAO_2026-09-15.md` seguem
modificados e sem commit desde 15/09, e há 3 PDFs soltos na raiz (`espelho.pdf`,
`lote.pdf`, `x.pdf`). Deixados como estavam, de propósito.

## Pendências antigas que continuam abertas

- 🔴 **Excluir quinzena do Pagamentos Driver quebrado desde 08/09** (achado em 15/09):
  a trava de quinzena concluída barra o apagamento dos pagamentos e a tela só oferece
  Excluir em quinzena concluída — ninguém exclui, nem o 2626. **Espera decisão do Victor.**
- 🔴 **Triagem de Caratinga 07–12/09 (183 pacotes) não distribuída** e a semana já paga.
- Gessiley: conferir o relatório com as 4 linhas de PIX antes de pagar.
- E2E 02, 15 e 47 nunca rodaram.
