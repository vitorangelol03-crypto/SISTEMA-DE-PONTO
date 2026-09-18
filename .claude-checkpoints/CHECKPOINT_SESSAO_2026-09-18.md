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

1. **Victor:** F5 na aba e importar a 2ª quinzena de agosto (Shopee).
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
