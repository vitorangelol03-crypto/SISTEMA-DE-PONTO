# CHECKPOINT — Sessão 21/09/2026

> ⚠️ **O dia 21/09 teve DUAS frentes rodando em paralelo, em sessões separadas.** Esta
> primeira parte é a da **folha** (tabelas de imposto). A segunda, em **§8**, é a de
> **Pagamentos Driver** (espelho duplicado, print no nome errado e a cobrança que sumia).
> As duas mexeram na mesma árvore ao mesmo tempo — ver a lição em §8.


> **Em uma frase:** as tabelas de INSS e IRRF do sistema estavam **erradas**, e o jeito de
> calcular também — as duas coisas achadas em cima do "pode puxar a tabela da internet?"
> do Victor, e as duas corrigidas com a fonte oficial e o gabarito dos recibos reais.

---

## 1. O que o Victor pediu

Depois de eu dizer que a tabela de imposto era a pendência que eu não conseguia fechar
sozinho: **"vc não consegue puxar essa tabela de contador da rede?"** — e, na sequência,
**"vamos arrumar todas lacunas detectadas"** e **"pode seguir e corrigir que esse sistema
completo"**.

---

## 2. 🔴 As três coisas erradas (em ordem de descoberta)

### 2.1 A tabela do INSS: 3 faixas e o teto

|  | Estava | Oficial |
|---|---|---|
| 1ª faixa (7,5%) | 1.621,**30** | 1.621,**00** |
| 2ª faixa (9%) | 3.041,65 | **2.902,84** |
| 3ª faixa (12%) | 4.562,47 | **4.354,27** |
| Teto | 9.124,94 | **8.475,55** |

Efeito medido: salário 3.000 descontava 245,68 (devia 248,60) · 5.000 → 493,18 (501,51) ·
9.500 → 1.070,67 quando o teto é 988,08.

**Até R$ 2.902 não havia erro** — e é isso que o torna perigoso: era exatamente onde os
11 recibos do gabarito paravam (maior salário R$ 2.200).

### 2.2 O IRRF não tinha a redução da Lei 15.270/2025

Desde janeiro/2026 quem ganha até R$ 5.000 é **isento**, e de R$ 5.000 a R$ 7.350 paga com
desconto decrescente. O sistema não sabia disso e **cobrava imposto de quem a lei isenta**:
R$ 312,89 de quem ganha R$ 5.000, R$ 114,76 de quem ganha R$ 4.000.

### 2.3 🎯 O MÉTODO DE CÁLCULO (o achado que só apareceu porque o gabarito existia)

Ao trocar a tabela pela oficial, **o gabarito dos 11 recibos reais ficou vermelho em 4**.

A tabela oficial publica DOIS jeitos de calcular, e eles discordam em 1 centavo:

| método | erros nos 11 recibos |
|---|---|
| somar faixa a faixa | **4** (Camila 135,24 × papel 135,23) |
| `base × alíquota − parcela a deduzir` | **0** |

A parcela publicada é **arredondada** (a conta exata dá 24,315 e a tabela traz 24,32), e
esse meio centavo vira um centavo depois do truncamento. **A contabilidade usa a parcela
a deduzir.**

E isso explicou o `1.621,30`: não era um valor real — era o limite **entortado** pra fazer
o método errado imitar o resultado certo. Funcionava até R$ 2.902 e quebrava acima.

> 🔴 **A LIÇÃO DESTE DIA: bater com o gabarito não é estar certo — é estar certo no
> pedaço que o gabarito cobre.**

---

## 3. O que foi feito

- **`impostos.ts`**: motor novo `impostoDaTabela` (parcela a deduzir, com queda para a
  soma progressiva quando a faixa não tem `deduzir`); `ReducaoDoIrrf`; `calcularIrrf`
  devolve `valorSemReducao` e `reducao`; tabelas padrão com os valores oficiais.
- **A redução só sai se quem chama pedir** (`{ incidenciaMensal: true }`), e **o padrão é
  não reduzir**. Só a folha do mês liga. 13º e rescisão não — decisão do Victor, porque
  reduzir por engano faz a empresa recolher imposto a MENOS, que vira dívida.
- **Recibo**: a linha do IRRF passa a dizer quanto a lei abateu
  (`27,50% - reducao Lei 15.270 R$ 179,75`), senão o contador vê um imposto menor que o da
  tabela sem saber de onde veio.
- **`FolhaCalculada.reducaoDoIrrf`** e o carregador do banco lendo a coluna nova.
- **Tutorial**: página do INSS com os números oficiais, o teto (988,08) e o atalho da
  parcela a deduzir. Saiu a caixa do truncamento — com a tabela nova ela **deixou de ser
  verdade** no exemplo de R$ 1.700, e tutorial com coisa errada não fica.

### Migrations aplicadas (as 3 liberadas pelo Victor)
| versão | o quê |
|---|---|
| `20260921092418` | faixas e teto oficiais do INSS |
| `20260921092748` | coluna `reducao` + a redução da Lei 15.270 |
| `20260921095508` | `deduzir` em todas as faixas (INSS e IRRF) |

`confirmado` segue **FALSO** nas duas tabelas e a tarja "VALORES EM CONFERÊNCIA" continua
no recibo — decisão do Victor: os números vêm do governo, mas a contabilidade dele não
olhou.

---

## 4. Gabaritos que agora batem

- **11 de 11 recibos reais** da contabilidade Arruda (INSS).
- **O exemplo oficial da Receita** (Lei 15.270): Rita, R$ 6.000, INSS 649,60 →
  base 5.350,40 → imposto 562,63 → redução 179,75 → **IRRF 382,88**. Bate no centavo.

---

## 5. Como foi validado

| O quê | Resultado |
|---|---|
| Suíte unitária | **118 arquivos, 1.858 testes, 0 falhas**, 14/14 rodadas código 0, 0 worker morto |
| E2E folha (`115`–`124`) | **37/37**, saída 0 (1 flaky por carga da máquina, provado rodando o `117` sozinho: 5/5 sem retry) |
| `tsc` · `lint` · `build` | limpos |
| Arquivo novo | `tests/unit/tabelasOficiais2026.spec.ts` (14 testes) |

⚠️ **A máquina estava com o robô da Shopee de pé** (23 Chrome, carga 18+): o pool `forks`
não sobe e mente com código de saída 0. Rodado com `--pool=vmThreads
--no-file-parallelism`, com os 4 arquivos que usam `vi.mock` rodando **sozinhos**.

---

## 6. Três testes que mudaram de expectativa (e por quê)

Nenhum foi "ajustado pra passar" — os três tinham valor antigo:

1. `centavoTruncado`: os exemplos deixaram de cair na borda do centavo com o método novo.
   **Refeitos** com bases que ainda exercitam o bug (1.694 e 1.695).
2. `folhaCalc` "caminho de menos imposto": comparava o imposto já reduzido contra o cheio.
   Agora os dois lados usam a mesma regra.
3. `folhaNoReciboERelatorio`: INSS de 123,58 → **123,57** pela parcela a deduzir.

---

## 7. Pendências

1. 🔴 **Levar ao contador** — três perguntas concretas agora, não uma vaga:
   - as tabelas conferem? (aí `confirmado` vira true e a tarja sai)
   - a redução da Lei 15.270 vale no **13º** e no **saldo de salário da rescisão**?
   - no teto do INSS, vale **988,08** (fórmula) ou **988,09** (o que o material publica)?
2. **6 pessoas** com `employment_type` e `contract_type` discordando.
3. **18 das 21** de carteira sem data de admissão.
4. **0 das 21** com salário preenchido — a folha segue sem uso real.

---

## 8. A outra frente do dia — Pagamentos Driver

### 8.1 "O app está duplicando, parece que mandei 2 espelhos" (commit `1fc0e46`)

Era verdade, na tela. A identidade do cartão de print era `driverId|platformName`, **sem a
quinzena**, escrita à mão em 4 lugares — e a tela junta **todas** as quinzenas com print
pedido. Duas quinzenas da mesma pessoa viravam duas linhas idênticas em "Já enviados"
(a de quem falta já dizia a quinzena; a de quem enviou, nunca).
✅ `chaveDoCartaoDePrint()` num lugar só, quinzena em cada linha, e o placar parou de dizer
"Quinzenas em aberto" para quinzena **concluída**. A/B provando o vermelho: `Expected: 2,
Received: 0` no cenário I do `tests/65`.

### 8.2 🔴 O print da líder estava no nome de quem não entrega Shopee

O print de **1.132 pacotes** (exatamente os SHOPEE da **Greice**) estava gravado no
**Mikael**, que tem **0** — e o pagamento **dele** ficou com "espelho conferido ✓", o dela
sem. **Causa provada por hora:** pedido 17/09 11:10 → envio 17/09 20:35 → planilha da
Shopee só em **19/09 10:09**; enquanto ela não chega, a regra "pedir antes da planilha"
mostra cartão para **todo o grupo** — **31 pessoas sem um pacote de Shopee** viraram cartão
na tela do líder. ✅ Print movido com OK dele (backup e SQL de desfazer em
`backups/2026-09-21/`); conferido depois: 1132=1132, `check_qtd` true, marca trocada de
lado, Mikael com 0 prints.

### 8.3 🔴 Pedir o print de UM cancelava a cobrança de TODOS (commit `e6de04f`)

Hoje às **07:03**: com o pedido GERAL no ar, um pedido individual (Carlos Eduardo) apagou o
geral junto — o modal grava a **diferença** entre banco e tela. **8 entregadores** que ainda
não tinham mandado o print sumiram da fila, calados. Só apareceu porque o Victor foi cobrar
o **Adriano da Ilha** na mão.
✅ `quemParaDeSerCobrado()` + aviso vermelho ANTES de salvar (quantos perdem, quem ainda não
mandou) + confirmação. ✅ Pedidos recriados um a um para os 5 que faltavam (Adriano, Jonas,
Rogério, Romulo, Fabricio Maia) — os outros 4 já estavam com espelho conferido.
🔴 **Achado no meio:** `platformNames` era montado inline no painel (array novo a cada
render) e estava nas dependências do efeito de carga do modal; como o painel se
re-renderiza sozinho a cada ~1,5s com print na fila, **a tela desfazia o que o operador
marcava**. Corrigido nos dois lados (`useMemo` + ref).

### 8.4 A planilha da Shopee: quem decide de quem é o pacote não é a Shopee

Investigando o "Ângelo com 678 igual ao Rogério": o arquivo cru da Shopee tem **55 colunas e
nenhuma com nome de motorista** — traz o **código da rota** (`AT2026...`). As duas colunas
"nome motorista" são **acrescentadas por fora**, cruzando o código AT com a tabela de
códigos. Comparando a planilha atualizada com o banco: **53 dos 104 divergem** (42 por ≤5
pacotes), e dois são graves — **ANGELO +677** e **FABRICIO DOS SANTOS FERREIRA −657**, os
dois de Caratinga. Os 551 do Ângelo foram **digitados na mão** hoje 05:58 (ele confirmou).
⏳ **Decisão pendente:** reimportar a planilha atualizada (conserta os 53) ou corrigir só os
dois. Scripts da conferência em `scratchpad` (descartáveis).

### 8.5 Lições

- 🔴 **Gastei um workflow de 7 agentes à toa** e o Victor cortou no meio ("cuidado com agente
  rodando à toa e gastando muito token"). A causa saiu de 6 SELECTs e 2 leituras de código.
  Bug com caso concreto em produção se ataca pelo **dado**.
- 🔴 **Duas sessões na mesma árvore ao mesmo tempo.** O `git status` do início estava limpo e
  o trabalho da folha foi aparecendo enquanto eu trabalhava. `git diff --stat` antes de cada
  commit evitou commitar por cima; o A/B do E2E foi feito com cópia + `git checkout --`
  **só nos meus 2 arquivos** (nunca `git stash`, que levaria o trabalho da outra sessão
  junto), conferindo a volta com `md5sum -c`. **Este checkpoint foi sobrescrito uma vez** —
  daí a nota do topo.
- O `tests/64` tem um flaky **pré-existente** no setup (clicar em "Novo driver", linha 117,
  timeout de 10s por carga do WSL): reproduziu igual nas duas rodadas, antes e depois da
  mudança.

### 8.7 Ainda no mesmo dia: o PDF publicado, e dois testes que mentiam

**O botao "Ver o PDF que esta no app"** (`601ab82`) — pedido dele ("confundiu minha
cabeca"). A previa do dialogo de espelho e sempre uma geracao NOVA e pode sair diferente
do papel que o driver tem: republicar um espelho que ja abateu mostra *"os vales e perdas
NAO foram descontados"*, porque o livro-caixa ja registrou o abate e o modo padrao calcula
zero. Agora da pra abrir o ARQUIVO publicado (link assinado), reusando o `mirrorPdfUrl` de
05/08.

**A regra do desconto ao republicar, conferida no dado** (ele perguntou se o desconto
"some"): despublicar **estorna** o abate (`clearMirrorDeductions`) e o painel rele o livro
junto (`reloadPublished`), entao despublicar → publicar de novo **aplica o desconto outra
vez e nao cobra em dobro**. Republicar POR CIMA, sem despublicar, e o caso que engana: o
papel sai com o valor cheio. Varri os 17 espelhos com desconto da quinzena: **todos batem
no centavo** (papel = livro = divida); os 2 "devendo sem abate" (Fernando 350,73 e Othon
12,00) tem **total a receber R$ 0,00** — a regra e nunca abater mais do que a pessoa
recebe, e a divida fica pra proxima.

🔴 **Dois testes estavam mentindo, e nenhum era regressao minha:**
1. **`tests/101` D1 (/clock PN)** derruba o CI desde **ontem** (run de 20/09 22:45, mesma
   linha, "110 passed, 1 failed"). O teste espera "Digite seu PIN" ou a escolha de empresa
   depois do CPF — e a **facial obrigatoria** (ligada nas duas empresas em 31/08) mudou
   esse caminho. Mesma familia dos specs 08/23/62 ja registrados. **Nao consertado** —
   avisado, aguardando o Victor.
2. **`tests/72`** nao passava mais do SETUP (`Novo driver`, `actionTimeout` de 10s): a aba
   hoje carrega **138 drivers** com espelhos, notas e prints e leva mais que isso pra
   assentar. **Provado por A/B** (falha igual com o painel na versao anterior) e com a
   maquina ociosa (load 0,39). Corrigido com espera por condicao (`cf057cb`) → **1 passed,
   saida 0**, e so ai o cenario do PDF publicado rodou de verdade.

⚠️ **O CI nao cobre o driverpay:** a lista de specs essenciais e 01/02/25/38/47/49/50/51/
100/101. Os specs de Pagamentos Driver (57, 60, 64, 65, 72, 76, 77...) **so rodam local** —
foi por isso que o `tests/72` ficou quebrado sem ninguem ver.

### 8.8 CI verde de novo, e a taxa que a tela mostrava errada

**O CI voltou ao verde** (`0899bdd`, run 35624889881: 3/3 jobs, 112 passed, 1 flaky no
spec 38). Duas coisas:

1. 🔴 **`tests/101` D1 nao era a facial.** Passa AQUI em 11s e so falhava no CI — o teste
   tinha `waitForTimeout(2000)` + `isVisible()`, e nenhum dos dois espera de verdade
   (`isVisible()` responde na hora; 2s fixos nao cobrem o CI, que tem ~4x a latencia
   local). Trocado por espera por CONDICAO com `.or()` das duas telas. ⚠️ Sobram **7
   `waitForTimeout` e 4 `isVisible()`** no mesmo arquivo — nao mexidos, so o D1 falhava.
2. ✅ **`tests/72` entrou nos specs essenciais do CI.** Ate hoje o CI **nao rodava spec
   nenhum de driverpay** — foi por isso que o 72 ficou quebrado por semanas sem ninguem
   ver. Custo: ~50s por run. No primeiro run ja passou.

**A taxa "alterada sozinha para 2,20"** (pergunta dele): ninguem alterou. O
`driverpay_platforms.default_rate` da **SHOPEE e 2,20** (as outras 2,00, Coleta 1,00), e a
grade mostra esse padrao quando o driver **nao tem taxa propria** — mas o pagamento usa o
`rate_snapshot` gravado no import. No ANGELO isso divergia: tela **2,20**, pagamento
**2,00** (R$ 1.398,00 fecha com 2,00; com 2,20 daria 1.533,60). Diferenca de **R$ 135,60**
nos 678 pacotes.
✅ **Victor decidiu: "e 2 o do angelo mesmo"** — entao o pagamento ja estava certo e nada
de dinheiro mudou. Cadastrei a **taxa propria dele = 2,00** (`driverpay_platform_rates`),
que e o que protege a PROXIMA importacao: sem taxa propria, o import pegaria o padrao de
2,20. Varredura: dos 104 com Shopee na quinzena, **10 sem taxa propria e so 1 pago a 2,00**
— o caso era isolado. Desfazer: `delete from driverpay_platform_rates where driver_id=(
select id from driverpay_drivers where name='ANGELO FABRICIO AVELINO ESTEVES') and
platform_id=(select id from driverpay_platforms where name='SHOPEE')`.
⚠️ **Fica em aberto:** a grade mostrar o padrao da plataforma quando ele nao e o que sera
pago. E o **Rogerio perdeu os 678 da Shopee** entre 09h e 13h (total de R$ 1.601,60 para
R$ 110,00) — avisado, sem resposta ainda.

### 8.9 O prazo da nota: de 14h para 15h, no banco E no papel

Pedido dele no fim do dia, com hora marcada ("antes das 3"): os 53 espelhos publicados hoje
traziam **14:00H** e ele queria **15:00**, "sem avisar o pessoal" e mantendo tudo validado.

**São duas coisas diferentes, e isso era o ponto:**
1. `nf_due_at` no banco — é o que decide quem mandou a nota atrasada. Alterado em 53 linhas
   (`+ interval '1 hour'`), conferido, notas intactas. Rápido e reversível.
2. O **PDF** — arquivo pronto no bucket. Mexer no banco NÃO reescreve o papel que o driver
   já tem. Para mudar, só regerando.

Ele pediu o papel também. Feito **pelo próprio sistema**, via Playwright, o mesmo caminho da
equipe: "Despublicar todos" → "Espelhos (em massa)" com o corte 15:00 → publicar.
✅ **Prova lida de DENTRO dos PDFs publicados** (pypdf): Claudiomar, Gustavo e Winglison com
`"15:00 do dia 21/09"` e **sem nenhum "14:00"**.
✅ **57 espelhos**, todos com 15:00 · **0 sumiram** · descontos no papel **R$ 1.678,95 = o
livro-caixa** (soma conferida item a item) · **64 notas, todas validadas**.
✅ O **Winglison voltou com os R$ 199,69** — despublicar antes de republicar é justamente o
caminho que preserva o desconto (§8.x).
⚠️ Ficaram **4 espelhos NOVOS** (o "em massa" alcança todo mundo com pagamento): Adriano
Furtunato (3.309,20), Higino Alves (6.182,00), Fabricio Maia (138,01) e Camilli (0,00).
Avisado; se algum não devia receber, é tirar.

🔴 **O susto, registrado porque não pode se repetir:** a 1ª tentativa **despublicou os 53 e
parou antes de publicar** — minha verificação esperava na tela um texto que o modal em massa
não mostra (`/15:00H do dia 21\/09/`). Os entregadores ficaram alguns minutos sem espelho, no
dia do prazo. Republicado em seguida.
**Por que deu para dormir tranquilo:** ANTES de despublicar eu baixei **os 53 PDFs e as linhas
de publicação** (`scratchpad/pdfs-backup`), porque `unpublishDriverMirror` **apaga os arquivos
do bucket** junto com as linhas — sem isso, uma falha na republicação seria irreversível.
**Lição:** em operação de massa pela UI, conferir o ESTADO (valor dos campos), nunca um texto
de tela; e a asserção de conferência nunca deve ficar ENTRE o passo destrutivo e o que repõe.

### 8.6 Pendências desta frente

1. 🔴 **Cartão de print para quem não entrega a plataforma** — a causa raiz do print
   trocado. Decisão de produto, apresentada e **não respondida**. Recomendação: enquanto a
   planilha não chega, mostrar só quem já entregou aquela plataforma antes.
2. 🔴 **A planilha da Shopee (§8.4)** — reimportar tudo ou corrigir os dois? Sem resposta.
3. 🟡 **Juntar cadastro duplicado ao vincular no import** — decisões do Victor já colhidas
   (desativa e esconde · só quinzenas abertas · PIX do principal · o nome vira vínculo de
   importação). Mapeado o que precisa ser movido e as travas do banco; **falta escrever**, e
   vai precisar de OK para uma migration (o merge tem que ser atômico).
4. 🟡 2 prints ainda em nome de quem não tem pacote da plataforma (Cloves e Camilli).
5. 🔴 **`tests/101` D1 derruba o CI desde ontem** (facial obrigatória mudou o /clock).
   Conserto é só de teste; esperando o OK dele.
6. 🟡 **Avisar ao republicar espelho que já abateu**: hoje o papel sai com valor cheio e só
   quem sabe da regra entende por quê. Proposto, não feito.
7. ✅ **O CI já roda o `tests/72`** (entrou em `0899bdd`) — o driverpay deixou de ser um ponto
   cego a cada push.
8. 🟡 **4 espelhos novos** publicados no "em massa" (Adriano, Higino, Fabricio Maia, Camilli)
   — confirmar com ele se todos deviam receber.
9. 🟡 O prazo do corte para as PRÓXIMAS publicações continua vindo do padrão salvo; se a
   intenção é 15h daqui pra frente, vale conferir o valor guardado.

---

## 9. 🔴 FECHO DA SESSÃO — e um erro de processo que passou três vezes

### 9.1 O `[skip ci]` do checkpoint pulava o CI do commit de código junto

Ao fechar a sessão, fui conferir se os commits da folha tinham passado no CI. **Não
tinham: zero runs.** Nem `437eae1` (tabelas oficiais), nem `3f50e74` (o centavo), nem
`02386bf` (excluir quinzena) — os três commits de correção desta leva e da anterior.

Não é filtro de caminho: o `ci.yml` dispara em **qualquer** push para `main`.

**A causa é o jeito como eu empurrei.** A regra do projeto manda agrupar os commits num
push só (porque o CI cancela o run anterior do mesmo branch). Eu agrupava assim:

```
git commit  fix(...)                    <- o código
git commit  docs(checkpoint): ... [skip ci]
git push                                <- os dois juntos
```

O GitHub decide pular olhando o **commit HEAD do push** — e o HEAD era o checkpoint com
`[skip ci]`. Resultado: **pulou o push inteiro, correção junto**, em silêncio.

✅ **O jeito certo, e que outra sessão de hoje usou sem saber** (`0899bdd` tem run verde,
o checkpoint `0493501` veio depois): **empurrar o commit de código primeiro**, deixar o CI
pegar, e só então commitar+empurrar o checkpoint com `[skip ci]`.

⚠️ O código não foi para produção sem validação — rodei tudo localmente (118 arquivos /
1.858 unitários, E2E da folha 37/37, tsc, lint, build) e conferi o deploy por conteúdo.
Mas o CI, que é a rede de segurança compartilhada, **nunca viu esse código**. Disparado à
mão no fecho (`workflow_dispatch`) para cobrir o buraco.

### 9.2 Estado no fecho

- **No ar e conferido por conteúdo**: o site serve o pacote compilado aqui
  (`index-CaHeI6xx.js`), deploy `qnlsfoeha` Ready.
- **Tutorial** regerado com as tabelas oficiais (10 páginas, 252 KB) e entregue ao Victor.
  Não entra no repo: tem nomes reais.
- **Tabelas seguem `confirmado: false`** e a tarja "VALORES EM CONFERÊNCIA" continua no
  recibo, como ele decidiu.

### 9.3 Por onde recomeçar

1. 🔴 **As três perguntas do §7 para o contador** — é o que destrava a folha virar oficial.
2. 🔴 As pendências de produto do driverpay no §8.6 (as duas sem resposta).
3. 🟡 Cadastro: 6 vínculos contraditórios, 18 sem data de admissão, 0 com salário.

### 9.4 A frase que resume o dia

Os dois erros graves da folha — a tabela errada e o imposto cobrado de quem é isento —
**não foram achados pelos 1.858 testes**, que passavam felizes com a tabela errada. Foram
achados por ir conferir na fonte. Teste prova que o sistema concorda com ele mesmo; só a
fonte externa prova que ele está certo.
