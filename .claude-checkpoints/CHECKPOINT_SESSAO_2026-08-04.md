# CHECKPOINT SESSÃO — 2026-08-04 (espelho do app da Shopee conferido sozinho)

> Pedido do Victor: automatizar o botão **"Espelho conferido"** da aba Pagamentos Driver.
> A planilha da Shopee pode vir com a quantidade de pacotes errada por driver; hoje a equipe
> cobra de cada um uma foto da tela do app, recebe por WhatsApp e compara na mão.

## 1. O que foi decidido (não re-perguntar)

| Assunto | Decisão do Victor |
|---|---|
| Como ler a foto | Começou com Anthropic; **mudou pra API grátis** no meio da construção → **Gemini** (chave dele, `aistudio.google.com`) |
| Qual soma comparar | **Só a plataforma SHOPEE** ("Coleta Shopee" fica fora) |
| Tolerância na quantidade | **Exata** — 1 pacote de diferença já aparece pro painel |
| Anexar pelo painel | **Sim**, as duas portas (app do driver + painel, pra quem manda por WhatsApp) |
| Se a API cair | **Fila**: o print espera a API voltar, ou validação manual. Nunca vira trabalho manual só por cota |
| Chave do Gemini | Colada no chat; Victor decidiu **seguir com ela por enquanto** (trocar depois) |

**A regra mais importante:** o driver **só anexa a foto** — nunca vê quantidade esperada, nem que
houve divergência. Só é avisado de data errada / print ilegível, que ele mesmo resolve reenviando.

## 2. O que ficou pronto (commit `cb460b8`, só local)

- **`_shared/proofCheck.ts`** — a conferência, pura e testável (48 unit). Inclui a **fila**
  (espera crescente que atravessa a virada do dia, quando a cota reseta).
- **`_shared/visionRead.ts`** — a leitura da imagem com **provedor trocável por variável de
  ambiente** (18 unit). Sem chave = modo manual, e o sistema roda igual.
- **migration `20260804120000`** — `driverpay_proof_requests` + `driverpay_delivery_proofs` +
  bucket privado + `proof_auto_confirm`/`proof_tolerance_packages`. **ESCRITA, NÃO APLICADA.**
- **`driver-public-api`** — rotas `proof-slots` / `proof-upload` / `proof-list`. **NÃO deployada**
  (o que está no ar segue sendo a v12, conferida idêntica ao repo antes de eu editar).

## 3. Medições reais (chave do Victor + foto real dele)

O print: tela "Entrega", aba **"Encerrado (1808)"**, período **2026/07/01 - 2026/07/15**.

- **Leitura correta**: 1808 · 01/07 a 15/07. Todos os modelos testados acertaram o número.
- **Teste negativo 4/4** 🔑: etiqueta de pacote, foto aleatória e foto antiga **todas** voltaram
  `legivel:false, entregues:null`. **A leitora não inventa número** — era o risco mais perigoso.
- **O erro típico não é valor errado, é a string não fechar**: `"2026-07-012026-07-01"` ou a data
  seguida de raciocínio vazado. `parseProofDate` tolera lixo grudado mas devolve nulo quando fica
  ambíguo (duas datas diferentes no mesmo campo).
- **Estabilidade**: `gemini-3.6-flash` 7 de 8; `gemini-3.5-flash` 3 de 8. O 3.6 lidera o rodízio.
- 🔑 **COTA DO PLANO GRÁTIS = 20 leituras/dia POR MODELO** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`).
  Daí o rodízio de 9 modelos ≈ **180/dia**. O volume real é **89 drivers com Shopee** na última
  quinzena fechada — cabe com 2× de folga. Mais folga = 2ª chave (outro projeto Google).
- Modelos somem: `gemini-2.5-*` deu **404** ("no longer available to new users") durante os testes.
  Por isso a lista de modelos é variável de ambiente, não código.

**Teste ponta-a-ponta da lógica (sem deploy), 4/4 cenários corretos:**

| cenário | resultado |
|---|---|
| print certo | `ok` → aceita **e marca "espelho conferido" sozinho** |
| planilha errada (1750 × print 1808) | `divergente` → aceita calado; driver vê **nada**; painel vê "58 a mais" |
| quinzena errada | `periodo_errado` → **recusa 422** com as duas datas na tela do driver |
| sem cota / API fora | `pendente` → aceita, entra na fila, ninguém é recusado |

## 4. 🔧 Dado de produção corrigido (autorizado pelo Victor)

As datas das quinzenas estavam com o **mês do fim +1** — erro de digitação na criação:

| quinzena | era | virou |
|---|---|---|
| 1 quinzena de julho | 01/07 → **15/08** (45 dias) | 01/07 → 15/07 (14 dias) |
| 2 Quinzena Junho *(concluída)* | 16/06 → **30/07** (44 dias) | 16/06 → 30/06 (14 dias) |
| 2 quinzena de junho | 16/06 → 30/06 | *(já estava certa, não tocada)* |

Não atrapalhava nada até hoje (essas datas não eram usadas em lugar nenhum — conferido por grep),
mas a conferência do print compara com elas: do jeito que estava, o print **certo** seria recusado.
Backup em `backups/2026-08-04/pre-fix-datas-quinzenas.json` com o rollback pronto. UPDATE com guarda
(só alterava se o valor fosse exatamente o errado) e conferência depois: banco intacto
(294 pagamentos · 542 pacotes · 99 drivers · 4.818 pontos · R$ 336.157,66 somados).

## 5. Validação

tsc **0** · eslint **0** · **759 unit** (66 novos) · build ok (1m04) ·
**`deno check` sem erro novo** — os 2 que sobram são pré-existentes (bcryptjs e
`crypto.subtle.verify` do login), provados rodando o check contra o `git show HEAD` do arquivo.

⚠️ **`tests/unit/edgeFnEmployeePublicApi.spec.ts` (set-pin) falhou na bateria por timeout e passou
sozinho 4/4** — cold start da edge fn, flaky conhecido desde maio. Não tem relação com esta feature.

## 6.8 🔴 BUG DE PRODUTO que só o E2E do portal pegou (e o release do dia)

**No ar agora:** edge fn `driver-public-api` deployada (o `_shared/` foi empacotado junto —
o risco marcado no plano está resolvido), segredo `PROOF_QUEUE_SECRET` conferido em produção
(a rota da fila respondeu `{"ok":true}`), e o **cron ativo de 15 em 15 minutos**.

**O bug:** o botão de enviar o print vivia DENTRO do card de um espelho de pagamento já
publicado. Mas a ordem real é `importar planilha → PEDIR O PRINT → driver manda → conferir →
só então publicar o espelho`. Ou seja: **na hora em que o driver precisa mandar, ele ainda não
tem espelho publicado** — o botão não existiria pra ele e a feature não funcionaria em produção.
Nenhum teste anterior pegaria: todos partiam do slot já existente.

**Correção:** `proof-slots`/`proof-list` aceitam `periodId` opcional (sem ele, devolvem o que o
driver deve em TODAS as quinzenas com pedido); cada slot carrega `periodId`/`periodLabel`; e o
portal ganhou uma **faixa no topo** ("A CD está esperando N espelhos do app"), independente de
espelho publicado.

**`tests/65` — primeiro spec E2E do portal do entregador do projeto. 6/6 em 4,2 min**, com cliques
reais e as fotos reais: sem pedido · print certo (marca sozinho) · **quantidade diferente com a
tela IDÊNTICA à do print certo** (a prova visual da privacidade) · quinzena errada · foto de
etiqueta (não inventa número) · reenvio · grupo com um cartão por membro. Prints das telas em
`prints-espelho-app/` (gitignored).

⚠️ **Duas armadilhas de teste**, documentadas no spec: **"Meus Pagamentos" é o título da tela de
LOGIN também** — usá-lo como prova de "entrou" dá falso positivo (um cenário chegou a passar por
motivo errado); o marcador certo é o botão **"Sair"**. E **`isVisible()` não aceita timeout**
(retorna na hora) — esperar exige `expect`/`waitFor`.

## 6.6 🔴 ACHADO QUE VALE PRA TODAS AS SESSÕES: `npx tsc --noEmit` não checava NADA

O `tsconfig.json` da raiz usa **project references** com `"files": []`. Rodar `npx tsc --noEmit`
ali **não tem arquivo pra checar** — ele sai vazio, e essa saída vazia vinha sendo lida (por mim,
a sessão inteira, e provavelmente em sessões anteriores) como **"tsc 0 erros"**.

**Como apareceu:** o E2E com cliques reais quebrou porque `reloadPeriods` **não existia**. Um nome
inexistente, que o TypeScript pegaria em um segundo — e o "tsc 0" tinha dito que estava tudo bem.

**Corrigido:** `npm run typecheck` → `tsc -p tsconfig.app.json --noEmit`. Roda de verdade:
**65 erros**, todos do baseline antigo (App.tsx, AttendanceTab, LoginForm, DataManagementTab…),
**zero** nos arquivos desta feature. Isso também explica o "63 erros de baseline" que o índice
registra desde julho: alguém já tinha rodado o comando certo alguma vez.

⚠️ **`npm run build` não substitui**: o Vite transpila sem checar tipo.

## 6.7 O E2E com cliques reais (tests/64) — e os 2 bugs que ele pegou

Roda com a **foto real do Victor** (`tests/fixtures/espelho-shopee-real.jpg`), sobe ela no bucket
de verdade e confere que a imagem **carregou no navegador** (`naturalWidth > 0`), não só o `src`.
Prova: as datas obrigatórias + aviso de quinzena estranha → coluna "Print" 0/1 → print divergente
(1808 × 1750) mostrando a foto e "58 a mais" → botão âmbar com (1) → validar na mão deixa 1/1.
**1 passed em 1,2 min.**

Bugs que só apareceram clicando:
1. **`reloadPeriods` inexistente** — o pedido era gravado certo e a tela quebrava logo depois,
   deixando o modal aberto com cara de erro. Além do fix, o modal passou a fechar mesmo se a
   recarga falhar: a gravação já aconteceu, não pode parecer que não.
2. O `tsc` cego acima.

Duas armadilhas de ambiente registradas no próprio spec: **`__dirname` não existe em ESM**, e o
**Vite no WSL** precisa de um `goto` com timeout folgado antes do login — sem isso a primeira
tentativa sempre morre e o teste vive marcado como *flaky*.

## 6. Aprendizados desta sessão

- **Deno agora dá pra checar localmente**: instalei em
  `<scratchpad>/deno/bin/deno` e rodo com um `deno.json` que tem `"nodeModulesDir":"auto"`
  (sem isso, o `edge-runtime.d.ts` do Supabase quebra por causa de um `npm:openai` nos tipos).
  Comparar contra o `git show HEAD` do arquivo separa erro novo de ruído pré-existente.
- **`crypto.subtle` no Deno**: passar `Uint8Array` direto acusa TS2345. `bytes.slice()` resolve sem
  forçar tipo (devolve buffer próprio, que é o que o WebCrypto exige).
- **Nunca chutar número lido**: a primeira versão do `parseProofCount` aceitava espaço como
  separador de milhar e lia `"0 1808"` (a tela tem "Em Rota (0)" ao lado) como **1808**. O teste
  pegou. Ambíguo tem que virar nulo — número errado em silêncio é pior que número nenhum.

## 6.5 Segunda leva do dia — telas + banco aplicado

**Aplicado em produção (autorizado):** migration `20260804120000` (2 tabelas, bucket privado,
2 colunas em `driverpay_settings`) e `20260804140000` (pg_cron + pg_net + segredo no vault + job).
Conferido antes/depois: pagamentos 294 · pacotes 542 · drivers 99 · ponto 4.818 · funcionários 94 ·
R$ 336.157,66 · os 2 espelhos já conferidos na mão — **todos idênticos**.

**Aprendido aplicando o cron** (o arquivo da migration foi corrigido pra refletir):
- a função é **`net.http_post`**, não `extensions.http_post` — conferido no catálogo ANTES de
  agendar; chutar faria o job falhar em silêncio a cada 15 min;
- o role `postgres` do Supabase **não enxerga `cron.job` sem GRANT** explícito, e mesmo com ele
  só **lê**, não altera. Então "pausar" por SQL é reagendar com data que não chega;
- o job nasceu **DORMINDO** (`0 5 29 2 *` = 29/02, próximo em 2028) porque a fn no ar ainda é a
  v12. **Reagendar com `*/15 * * * *` no deploy.**

**Telas prontas** (commit `dae8766`): botão "Solicitar espelho" (exige as datas e mostra prévia de
quem será cobrado), modal "Espelhos recebidos" (a foto ao lado do que a planilha diz, filtro "só o
que precisa de atenção" ligado, aviso de planilha mudada e de print repetido), coluna "Print" na
grade + rodapé + card do celular, e a tela nova no portal do entregador (um cartão por driver, com
**zero número na tela**).

⚠️ **`DriverRow.tsx` tem `totalCols` contado na mão** — foi incrementado junto com a coluna nova.

## 7. PENDENTE

**RELEASE — feito, menos o push:**
1. ✅ migrations aplicadas · ✅ edge fn deployada e testada em produção · ✅ segredo conferido ·
   ✅ cron ativo (`*/15 * * * *`) · ✅ ciclo completo provado com a foto real.
2. ✅ **PUSH FEITO** (`88cfa7c..9dceb8e`). ⚠️ **Quem executou fui eu, com permissão explícita do
   Victor** — ele estava longe do PC e o comando com `!` não estava executando no ambiente dele
   (o mesmo aconteceu com o deploy da edge fn). A regra do projeto segue valendo: push é dele;
   esta foi uma exceção autorizada na hora, não um precedente.
   ⏳ Falta confirmar o **deploy da Vercel** servindo o bundle novo (conferir baixando o arquivo do
   site e procurando "Solicitar espelho" dentro — não basta o build dizer que passou).
3. Depois do push: testar numa quinzena de verdade com UM driver antes de liberar pros 89.

**Depois do release:**
- Edge fn `driverpay-proof-admin` (anexar/reconferir **pelo painel**) — **NÃO foi feita**. Hoje só
  o portal do entregador anexa; quem manda por WhatsApp ainda depende de você por fora.
- E2E 64 (painel) e 65 (**primeiro spec do portal do driver** — hoje não existe nenhum).
- Estender `tests/cleanup.ts` pra tabela e bucket novos.

**Herdadas:** revogar o PAT do Supabase (desde 28/07) · trocar a chave do Gemini quando der ·
Marize (R$ 249×238) e Lucas (escaneada) · PIX do Pablo Raspante · 6 CPFs faltantes · painel responsivo.

---

## 8. Tela do líder revista — grupo grande (commit `4abdad7`)

O Victor pediu pra ver a tela do portal como ela aparece pro **líder de um grupo com vários
membros**, "de uma forma que ele consegue entender como ele vai anexar separado individual".
Montei um grupo de 10 (líder + 9, com nomes de gente de verdade e situações misturadas: 4 faltando,
1 recusado, 5 já enviados) em tela de iPhone 13. **O que apareceu não estava bom**: 10 cartões azuis
idênticos, sem saber quantos faltam, qual é o dele, nem o que já resolveu. Ele aprovou os 5 ajustes:

1. **Placar no topo** — "Faltam 5 de 10" em âmbar, ou "Tudo enviado!" em verde. Antes só contando
   cartão por cartão.
2. **Rótulo "Seu espelho"** no cartão dele, que antes ficava solto no topo e parecia mais um da lista.
3. **Ordem por urgência** — quem falta primeiro (o **recusado na frente**, é quem já tomou "não"),
   quem já enviou desce pro fim como linha discreta em "Já enviados (N)" com um "trocar" pequeno no
   lugar do botão azul grande.
4. **Nome da quinzena sobe pro topo** — repetido em cada cartão virava ruído e quebrava linha; só
   volta pro cartão se houver **mais de uma quinzena aberta** (`umaQuinzenaSo`).
5. **Lista "ENVIADOS" duplicada removida** do rodapé — o que também eliminou o estado `proofFiles` e
   uma requisição `driverProofList` a menos no celular.

Resultado: a tela encolheu quase pela metade e a primeira dobra já responde "quanto falta / qual é o
meu / o que é mais urgente".

### ⚠️ Armadilha que quase virou print errado pro Victor
O **Vite no WSL não pega a mudança sem reiniciar** (já registrado em 19/07). Rodei o script de print
com o servidor antigo no ar e a tela veio **idêntica à de antes** — eu ia mandar isso como "melhoria
pronta". Conferi o PNG antes de enviar, vi que era a tela velha, reiniciei o dev server e refiz.
**Sempre reiniciar o `npm run dev` antes de fotografar tela.**

### Teste que quebrou (era regressão de verdade)
Spec 65 cenário B falhou em `getByText(/enviado\(s\)/i)`: o selo **"1 enviado(s)"** no cartão saiu de
propósito no ajuste 3. Não afrouxei o teste — troquei por um sinal **mais forte**: placar verde
"Tudo enviado!", seção "Já enviados (1)", e **zero** botão "Enviar print do app" sobrando.

### Validação
- `npm run typecheck`: 14 erros, **todos pré-existentes** em arquivos intocados (`permissions.ts`,
  `database.ts`, `pushNotifications.ts`, `employeeImport.ts`) — como só o `DriverApp.tsx` diferia do
  HEAD, isso é prova, não suposição. Zero no que mudou.
- eslint limpo · `npm run build` ok.
- vitest: **776 passam**. `faceAutoResetTrigger` falha só na suíte cheia e passa **4/4 sozinho** —
  flake de teste que toca o banco em paralelo, mesma classe do `edgeFnEmployeePublicApi`. Um
  componente React do portal não tem como afetar trigger de reconhecimento facial.
- **spec 65: 6/6 no chromium e 6/6 no mobile-pixel5**, com leitura real do Gemini (confere no banco
  `read_packages`, `check_status` e `espelho_conferido`). **spec 64: 1/1.**
- 🔎 **firefox e webkit não estão instalados nesta máquina** (`webkit-2311/pw_run.sh` não existe).
  As falhas deles na rodada de 4 navegadores eram **binário faltando, não bug no Safari** — mas o
  portal do driver **nunca foi rodado em WebKit**, e driver de iPhone usa Safari. Fica anotado.
- **Banco conferido antes e depois: 99 drivers · 49 grupos · 3 períodos · 0 prints · 0 pedidos —
  idêntico.** Era a exigência explícita do Victor ("muito cuidado pra não perder nenhum dado").

### Push + deploy confirmados (04/08, fim da sessão)

**Push:** `9dceb8e..1a980c2` (4 commits) — o Victor pediu na hora ("faz o push de tudo que estiver
pendente"). Antes de mandar, varri o diff atrás da chave do Gemini, do segredo da fila, de PAT e de
JWT: **nada**. Só sobem 5 arquivos (`DriverApp.tsx`, specs 65 e `cleanup.ts`, checkpoints).
⚠️ A regra do projeto **segue valendo**: push é dele. Foi pedido explícito, não virou padrão.

**Deploy da Vercel — confirmado do jeito certo, não pelo "build passou":**
o site troca `index-BwyhYIDk.js` por `index-DNQid7r5.js`, e o pedaço da tela do entregador
(`/assets/DriverApp-B-6G8K-d.js`, que é chunk separado — procurar o texto no `index` dá falso
negativo) baixado do ar tem **sha256 idêntico ao build local**: `d3721ba4c42b9941…`. Dentro dele
estão "Faltam", "Seu espelho", "Tudo enviado" e "Já enviados". **A tela nova está servindo.**

**Ainda em aberto:** fn `driverpay-proof-admin` (anexar/reconferir pelo painel — quem manda por
WhatsApp ainda depende de alguém por fora) · rodar o portal em **WebKit/Safari** (binário não
instalado nesta máquina) · testar numa quinzena real com **um** driver antes de soltar pros 89.

---

## 9. Relatórios: filtrar por conferido · pedido de espelho com alcance (`21c4c2c`, `218da5b`, `d740c7b`)

### 9.1 Filtro "pagar só quem está conferido" nos dois relatórios (`21c4c2c`)
Nos relatórios **geral** e **simples**, duas chavinhas: *só quem está com o espelho conferido* e
*só quem está com a nota validada*. **Desmarcadas por padrão** — sem mexer, o arquivo sai idêntico.

**Decisões do Victor:**
- **"PAGA O RESTO"** — o filtro é driver a driver. Grupo de 10 com 1 pendente **continua saindo na
  linha do líder com os 9**; o grupo só some quando ninguém dele passa. Segurar 9 por causa de 1
  foi recusado explicitamente.
- **"espelho validado" = o botão "Espelho conferido"** (o que o print marca sozinho), NÃO o espelho
  publicado — que no painel se chama "Espelho no app". Perguntei porque são coisas diferentes.

"Nota validada" reusa a **mesma** regra do filtro "NF ok (validada)" da lista (`nfProgressByPayment`,
ciente de grupo): se divergissem, o mesmo driver apareceria diferente em telas vizinhas.

A janela mostra **antes de baixar** quem sai e por quê, e avisa em âmbar quando um recebedor some
por completo. O cabeçalho do Excel leva `SOMENTE espelho conferido + nota validada (N de fora)` —
arquivo que esconde gente em silêncio paga errado depois.

### 9.2 Cancelar a solicitação, com botão próprio (`218da5b`)
Cancelar existia mas **escondido**: só desmarcando todas as plataformas e clicando em "Solicitar
espelho". O botão "Cancelar" ao lado só fechava a janela. Agora tem **"Cancelar solicitação"** em
vermelho (só aparece com pedido aberto), com confirmação avisando que **os prints já recebidos
ficam**. O outro virou "Fechar".

### 9.3 Pedir espelho de UM entregador ou de UM grupo (`d740c7b`) — migration + deploy
**Migration `20260804160000` APLICADA em prod** (com OK do Victor): coluna `driver_id` em
`driverpay_proof_requests` — **vazia = todos** (comportamento de sempre), **preenchida = só aquele**.
Grupo = uma linha por membro; nenhum conceito novo no banco.

⚠️ **A UNIQUE antiga virou dois ÍNDICES PARCIAIS** (um "pra todos" `WHERE driver_id IS NULL`, outro
por entregador). UNIQUE comum não serviria: no Postgres **NULLs são distintos entre si**, então
caberiam várias linhas "pra todos" duplicadas.

**Edge fn `driver-public-api` deployada** e conferida por sha256 (`05e84fb362cb2358`): `proof-slots`
cobra quando há pedido geral **OU** individual daquele driver.

**Painel:** bloco "De quem pedir o print" (Todos / Só um grupo / Só um entregador, com busca). A
prévia usa a **mesma função** da coluna "Print" da grade. Ao salvar faz o **diff** do que já existe —
trocar de "todos" pra um grupo **apaga o pedido geral**, senão o portal continuaria cobrando todo
mundo. Estado `'manter'`: quando o pedido gravado atinge vários entregadores que não formam grupo
nem um só, a tela **não cai em "todos"** — um clique ampliaria o pedido sem querer.

### 🔴 Bug pego pelo E2E 64 (e a armadilha do Vite, de novo)
`requestProof` usava `upsert` apontando pra UNIQUE que a migration derrubou → **`42P10`** e o modal
ficava aberto com cara de erro. **Reproduzi antes de consertar** (rodei o upsert isolado e li o
código do erro). Virou `insert` tolerando `23505` — que É o resultado desejado, com o porquê no
código: o `onConflict` do PostgREST **não sabe informar o WHERE de índice parcial**.

⚠️ Depois do fix o teste **continuou falhando** — era o **Vite servindo bundle velho** outra vez.
Matei o processo e o Playwright subiu um novo: passou. **Segunda vez no mesmo dia.**

### Validação
- typecheck sem erro novo · eslint · build · **134 unit** (4 novos do alcance)
- `deno check` com os **mesmos 2 erros pré-existentes** do HEAD (comparado em ambiente isolado)
- **13/13 contra a EDGE FN NO AR**: individual, grupo, todos (regressão), sem pedido, e os dois
  duplicados barrados pelo banco
- **E2E 64: 1/1 · E2E 65: 6/6**
- **Banco antes e depois: 294 pagamentos · 99 drivers · 49 grupos · 3 períodos · 4.822 pontos ·
  94 funcionários — idêntico.**

**Falta:** push destes 4 commits · fn `driverpay-proof-admin` (anexar pelo painel) · WebKit/Safari.

### 9.4 Regra de logística: "Todos" só cobra quem está em grupo (`e674924`)
Pedido do Victor como **trava** contra cobrar a empresa inteira sem querer. Quando marcar
**"Todos"**, o print só é pedido de quem está **em grupo** — quem anexa é o líder, que vê um cartão
por membro. **Quem não está em grupo nenhum não recebe pedido.** Pedido **individual** continua
valendo mesmo sem grupo: ali o operador escolheu a pessoa de propósito.

**A regra mora na edge function, não gravada no pedido** — se puserem o entregador num grupo depois,
ele passa a ser cobrado **sem refazer o pedido**. Provado no caso [3c] do teste contra a fn no ar.

**Dado que embasou a decisão** (última quinzena real com Shopee): **44 líderes + 45 membros e ZERO
avulsos**. A regra não muda a quinzena atual — é trava pro futuro.

**Quem fica de fora** (decisão dele: *"marca separado, fora da conta"*, a opção B que eu recomendei):
selo cinza **"sem grupo"** na coluna Print com o motivo no `title`, **fora do contador** (contador que
nunca fecha vira ruído), e aviso âmbar com os nomes na janela de solicitar.

⚠️ **Testes atualizados, não afrouxados:** os specs 64 e 65 criavam entregador **sem grupo** com
pedido geral — cenário que a regra agora barra de propósito. Passaram a nascer em grupo, como na
operação real. No 65, o cenário **G reusa o grupo do E**: dois grupos com o **mesmo líder** quebram a
edge fn, que resolve o grupo do líder com `maybeSingle()`.

**Validação:** typecheck · eslint · build · **140 unit** (6 novos) · **17/17 contra a edge fn NO AR**
(avulso barrado no geral, cobrado no individual, e passando a ser cobrado ao entrar num grupo) ·
**E2E 64 1/1 e 65 6/6** · banco idêntico antes/depois.

---

## 10. Prazo da nota por espelho — base pronta, tela PARADA num ponto de decisão (`70f1cda`)

**Pedido:** cada espelho publicado carrega o seu prazo ("manda a nota até dia 3 às 15h"); nota que
chega depois fica **atrasada**; dá pra filtrar por isso nas notas e nos dois relatórios.

**Decisões do Victor (04/08):** prazo **obrigatório** · **com padrão** preenchido (2 dias depois,
18:00) · **por espelho**, não por quinzena.

**Feito (aditivo, não muda nenhuma tela):**
- `nfPrazoStatus` / `nfAtrasoLabel` — comparam a hora do **envio** (não a da validação: o driver não
  controla quando conferem). Calculado **na hora de mostrar, não gravado** — se o prazo for
  corrigido depois, a tela se ajusta em vez de guardar um "atrasada" que virou mentira.
- `prazoNfPadrao` — 2 dias depois, 18:00.
- Migration `20260804180000` **ESCRITA E NÃO APLICADA**: `nf_due_at` na publicação do espelho.
  ⚠️ **Nullable de propósito, mesmo o prazo sendo obrigatório na tela**: as publicações antigas não
  têm prazo e inventar um seria cobrar por horário que ninguém combinou. `NOT NULL` quebraria as
  linhas existentes; `DEFAULT` inventaria dado.
- `publishDriverMirror` aceita `nfDueAt`; `listMirrorPublications` devolve. **14 testes unitários.**

### 🛑 Onde parei e por quê
O espelho **já tem** a faixa *"As notas deverão ser enviadas até as 15H do dia 03"* — é exatamente o
campo que o Victor descreveu. Mas **hora e data são TEXTO LIVRE** (`"14:00"`, `"20/07"`, sem ano),
guardados **por empresa** em `driverpay_mirror_notice`, não por espelho. Não dá pra conferir
automático a partir disso.

Cheguei a construir um segundo campo de prazo e **desfiz**: duas datas parecidas na mesma tela é
defeito de produto. O caminho certo é **converter os campos de corte em data/hora de verdade** — a
faixa continua imprimindo a mesma frase, agora derivada — mas isso mexe numa tela usada toda
quinzena, então **parei e perguntei** em vez de decidir sozinho.

**Pendente:** OK pra aplicar a migration · OK pra converter os campos de corte · depois: selo
"atrasada" na nota, filtro em "Notas recebidas" e nos dois relatórios.

### 10.1 Pedir o espelho ANTES da planilha (`2970b1e`) — no ar
Decisão do Victor sobre quem recebe: **"somente entregadores que estiverem em grupos"** — a mesma
regra de logística de 9.4. Enquanto **ninguém** da quinzena tem pacote naquela plataforma, o pedido
vale pra todo mundo em grupo; assim que a planilha entra, volta a regra normal (só quem tem pacote).
⚠️ **É por PLATAFORMA**: importar a eMile não pode fazer o sistema achar que a da Shopee chegou.

`proof-slots` passou a percorrer **pagamento × plataforma pedida** em vez da lista de pacotes — sem
planilha não existe pacote, e varrer pacotes deixava a tela do entregador vazia.

Sem planilha: **data conferida na hora** (quinzena errada recusada na hora), **quantidade esperando**,
e o espelho **NÃO** é marcado conferido — `proofIsFullyConfirmed` exige `qtdOk`, o que já estava certo.

`statusPorQuantidade`: quando a planilha chega, o veredito sai do número que a IA **já leu** e está
guardado. Conta pura, **zero download e zero chamada de IA**. Um teste roda essa conta **lado a lado
com o `runProofCheck`** da edge fn pra as duas nunca divergirem em silêncio.

**Validado:** 173 unit (19 novos) · **21/21 contra a edge fn NO AR** · build · banco idêntico.

---

## 11. Caminho do envio do print: rápido, à prova de queda, galeria e iPhone (`addd28a`)

Veio de uma pergunta dele: *"o sistema aguenta 30 drivers enviando no mesmo minuto?"* Fui ler o
código e achei uma falha real.

### 🔴 O print era LIDO antes de ser SALVO
A IA leva ~40s. Se o 4G do entregador caísse nesse meio-tempo, ou ele fechasse a tela, ou a função
estourasse o tempo, **não ficava nada**: nem arquivo nem registro, e ele mandava tudo de novo. Com
30 no mesmo minuto (IA mais lenta, cota estourando) a chance disso era alta.
**Agora arquivo e registro entram primeiro, já dentro da fila.** O pior caso virou "demora alguns
minutos pra ser conferido".

### ⏱️ O entregador não espera mais a IA
Como o print já está salvo, a função responde na hora e confere por trás (`EdgeRuntime.waitUntil`;
sem `waitUntil` no runtime, espera como antes — melhor lento do que sem conferir).
**MEDIDO no E2E: era ~45s, passou a 0,8s–4,2s.** A recusa por data errada continua chegando: o
portal se atualiza sozinho por ~1 min e mostra o motivo no cartão.

### Galeria (bug que o Victor achou usando)
O input tinha `capture="environment"`, que **abre a câmera direto** e impede escolher o print da
galeria — e print de tela **nasce** na galeria. Atributo removido.

### iPhone
O iOS salva foto em **HEIC** e a edge fn só aceita JPEG/PNG/WEBP (confere a assinatura real). O
reencode pra JPEG já existia, mas **se falhasse o código mandava o arquivo original** — HEIC
recusado com erro sem sentido. Agora tenta `createImageBitmap` (decodifica HEIC no iOS melhor que
`<img>`), cai pro `<img>`, e se nada funcionar explica em português o que fazer.
⚠️ **Não testado em Safari de verdade:** o WebKit pede ~30 bibliotecas de sistema via `sudo` nesta
máquina — não instalei sem OK.

### Testes ajustados ao comportamento novo, sem afrouxar
- as asserções de banco passaram a **esperar a conferência que roda por trás** (`esperarConferencia`);
- o E2E agora **mede e imprime** quanto o entregador esperou;
- ⚠️ o cenário C tinha um driver chamado **"Divergente"** — a asserção de privacidade procura
  "divergen" na tela e casava com o **nome dele**, dando falso vazamento. Conferi no print que a
  tela não mostra número nenhum; troquei o nome e a asserção continua intacta.

**Validado:** typecheck · eslint · build · `deno check` com os mesmos 2 erros pré-existentes ·
**E2E 64 1/1 e 65 6/6**.

---

## 12. Migration do prazo APLICADA + os 65 erros de tipo investigados

### 12.1 `nf_due_at` aplicada em produção (com OK do Victor)
`driverpay_mirror_publications.nf_due_at`. Banco conferido antes/depois: **30 publicações · 30 notas ·
294 pagamentos · 99 drivers · 49 grupos · 3 períodos · 4.826 pontos — idênticos**.

⚠️ **Susto que valeu a checagem:** funcionários apareceu **109 antes e 94 depois**. Não foi perda: os
109 eram um retrato tirado **no meio da bateria de testes** (15 funcionários temporários), e a
limpeza dos próprios testes os removeu. Conferido: **94 reais, 0 de teste**, datas contínuas de
29/09/2025 a 03/08/2026. **Snapshot durante execução de teste não serve de linha de base.**

### 12.2 Os 65 erros de tipo — todos PRÉ-EXISTENTES, nenhum meu
⚠️ **Correção do que eu disse antes:** falei "14 erros"; eram **65**. Eu estava lendo a saída cortada.

Ninguém tinha visto porque, até hoje de manhã, `npx tsc --noEmit` na raiz **não conferia nada**
(project references com `"files": []`) — eles foram se acumulando invisíveis.

- **46 = barulho.** 34 numa tela só (`DataManagementTab`, lê planilha importada sem tipo declarado) +
  12 de código morto.
- **2 = tipo mentindo, mas funciona.** `EmployeeClockIn` lê `employee.company_id`; a coluna **existe**
  no banco (uuid NOT NULL) e a consulta usa `select('*')`, então chega em tempo de execução — só
  falta declarar na interface `Employee`.
- 🔴 **4 = BUG DE VERDADE, no holerite.** `FinancialTab` monta `EmployeeFinancialData` **sem**
  `totalDailyRate`, `totalBonusB`, `totalBonusC1`, `totalBonusC2` (linhas 202-216), mas o holerite lê
  `data.totalDailyRate || 0` → **sempre 0**. No PDF que vai pro funcionário:
  - `"Diárias (N dias) + R$ 0,00"`;
  - as linhas de Bonificação B/C1/C2 **nem aparecem** (o gerador só imprime `if (total > 0)`);
  - mas **total bruto e líquido estão certos** (vêm de campos reais).

  Resultado: **holerite se contradizendo** — composição zerada, total correto.
  **NÃO consertei**: é a aba de Financeiro, mexe com dinheiro, e está fora do que foi pedido.
  O conserto é somar dos pagamentos (`p.daily_rate`, `p.bonus_b`, `p.bonus_c1`, `p.bonus_c2` — que
  já estão certos no detalhe por pagamento) e declarar os 4 campos na interface.

### 12.3 Holerite consertado (`9cea0f4`) — o achado do 12.2
`somarTotaisDoHolerite` num módulo próprio (testável sem React, mesmo padrão do
`driverPayShared`), somando da **mesma lista de pagamentos** que vai pro PDF — o gerador conta os
dias e as ocorrências de bônus a partir dela, então somar de outra origem faria contagem e valor não
baterem no mesmo papel. Os 4 campos viraram **obrigatórios na interface**, então o compilador impede
que voltem a faltar.

**Prova com produção** (quinzena de julho): Leticia, 27 dias — o holerite mostrava
`Diárias R$ 0,00` e passa a mostrar **R$ 4.050,00**.

⚠️ **PONTO ABERTO PRA O VICTOR** (não inventei nada): em **19 dos 46** funcionários a soma dos
componentes é **maior** que o `total` gravado (R$ 1 a R$ 50; nos outros 27 bate exato, e em **nenhum**
é menor). É o **desconto de erros de quantidade** que já foi aplicado no `payments.total` e **não vira
linha no PDF** — então pra esses 19 o papel mostra proventos que não fecham com o bruto. Antes isso
ficava escondido atrás do zero. Decidir: criar a linha do desconto (e como chamá-la) ou deixar assim.

**Validado:** typecheck **65 → 61** erros (os 4 eram exatamente estes) · eslint · build ·
**834 unit, 52 arquivos, zero falhas** (6 novos).

### 12.4 "0 entregador(es)" no aviso + `[object Object]` no rodapé (`32dd8fa`)
O Victor viu *"Espelho solicitado. **0** entregador(es)"* na quinzena de julho (sem planilha).

**Diagnóstico, não chute:** o pedido **foi gravado certo** (linha do CAIO no banco). Abri a janela na
tela real e medi a prévia nos três alcances com aquela quinzena (96 dos 98 em grupo, 0 pacotes):
**TODOS 96 · UM GRUPO 1 · UM ENTREGADOR 1**. Ou seja, a contagem do código atual está certa — o "0"
veio de **aba aberta com o bundle antigo**, de antes do deploy (naquele código, sem planilha, a
prévia era 0 mesmo). Conferi que o chunk do painel no ar **é** o novo (`DriverPayTab-YS-UOAwM.js`,
com o seletor "De quem pedir o print" dentro).

**Bug real achado no caminho e corrigido:** o rodapé imprimia **`[object Object]`** — `jaSolicitadas`
virou `ProofRequest[]` quando entrou o pedido por entregador/grupo, mas o texto ainda fazia
`.join(', ')` na lista. Agora mostra `SHOPEE (1 entregador(es))`.

### 12.5 iPhone/Safari abrindo direto na câmera
O `capture="environment"` **já foi removido e conferi que não está no arquivo que o site entrega**.
O service worker do projeto **não guarda arquivos** (só notificação), então não é ele — mas o Safari
no iPhone mantém a aba viva por dias com o JS antigo.
**Como saber a versão no celular:** a tela nova do print tem um painel no topo com **"Faltam N de M"**
(âmbar) ou **"Tudo enviado!"** (verde). Se não aparecer, é versão antiga — fechar a aba e reabrir.
⚠️ Se aparecer o painel novo e mesmo assim abrir só a câmera, aí é navegador embutido (link aberto
dentro do WhatsApp, por exemplo) — nesse caso nenhum atributo força a galeria, e o caminho seria dar
dois botões separados. **Ainda não testado em Safari de verdade** (WebKit pede ~30 libs via sudo).

---

## 13. Descontos PNR lançados da planilha + provas ao editar (`57fd352`)

> ⚠️ Esta leva rodou **em paralelo com outra sessão** do Victor (a do holerite/prazo da nota).
> Ver §13.3 — houve mistura de commit.

### 13.1 Lançamento dos descontos PNR (dado de produção)
Planilha `Descontos_PNR_Fechamento.xlsx` (grupo WhatsApp "PNR - PARA FATURAMENTO - CARATINGA",
mensagens de 02/07 a 03/08/2026). Conferida antes de lançar: resumo × detalhado bate entregador a
entregador, TOTAL GERAL R$ 1.126,65 confere, 52 rastreios sem repetição.

**Decisões do Victor:** valor **R$ 10,00** para os pacotes que vieram com o valor **tampado (`****`)**
no grupo · tudo na **1 quinzena de julho** · **um código de rastreio por desconto** · os dois
entregadores fora do cadastro **ficam de fora** (ele pediu os códigos deles no chat).

**Lançado: 47 descontos, R$ 1.212,05, em 24 entregadores** — 29 com valor real (R$ 1.032,05) e 18
com o padrão (R$ 180,00), todos `package_status='PNR'`, `created_by='2626'`.

- **Ficaram de fora:** `Josiane Batista Barbosa` (4 pacotes) e `JUSSIMAR DA SILVA MARTINS` (1) — não
  existem em `driverpay_drivers` nem nos apelidos. R$ 94,60 do que dá pra ver.
- 🔑 **`XPT (DUTRA) GERSON BOTELHO DE SOUSA` = `GERSON BOTELHO DE SOUSA`** — não foi chute: o alias
  `87191-XPT (DUTRA) GERSON BOTELHO DE SOUSA` já estava gravado em `driverpay_driver_aliases`.
- ⚠️ **Os totais do pagamento NÃO são atualizados por trigger.** O app chama
  `recomputePaymentTotals`, que lê a view `driverpay_payment_computed`. Lançando por SQL é
  obrigatório rodar o mesmo UPDATE, senão `total_discounts` fica 0 e a grade mente.
- ⚠️ **`total_net` está negativo** nesses 24 — esperado: a planilha de julho ainda não foi importada,
  então não há pacote pra abater. Some quando a planilha entrar.
- ⚠️ Os 18 provisórios levam **"valor a confirmar"** na observação, e **a observação aparece no
  espelho que o entregador recebe** (`driverMirrorPdf`, coluna "Descrição"). Decisão consciente;
  trocar é um UPDATE.
- Backup + rollback + a planilha: `backups/2026-08-04-descontos-pnr/`.
- Banco conferido antes/depois: 99 drivers · 294 pagamentos · 542 linhas de pacote · 3 períodos ·
  30 espelhos · junho concluída intacta em R$ 336.157,66.

### 🔴 Pegadinha do Postgres que travou o INSERT na primeira tentativa
A trava anti-erro era `CASE WHEN (SELECT count(*) FROM alvo) <> 47 THEN (SELECT 1/0) ELSE 0 END`.
Deu **division by zero mesmo com a condição falsa**: subquery dentro de `CASE` vira **InitPlan** e é
avaliada antes do `CASE` escolher o ramo. Isolado, `CASE WHEN 1=2 THEN (SELECT 1/0) ELSE 0 END`
funciona (constant folding), o que confunde o diagnóstico. **Trava que presta é `WHERE`:**
`FROM alvo a, guarda g WHERE g.n_casadas = 47` — não bate, insere zero linha, sem erro.

### 13.2 🔴 Editar desconto não salvava foto nem vídeo (bug do Victor, corrigido)
`updateDiscount` só gravava valor/código/observação/marca; a tela coletava a prova e **jogava fora**.
O aviso azul *"as fotos/vídeo não mudam aqui"* descrevia a limitação em vez de corrigi-la.

- Agora a edição **mostra as provas já salvas** — dá pra ver, remover, trocar e somar mais uma; o que
  fica na tela é o que é gravado.
- 🔑 **O bucket `driverpay-discount-proofs` tem policy de INSERT/SELECT/DELETE e NÃO de UPDATE**
  (migration `20260704120000`). Reenviar por cima do mesmo caminho seria **barrado pela RLS**. Por
  isso toda prova nova nasce com **nome único** (`proofFileName`) e a antiga é apagada depois —
  nunca `upsert`.
- Prova que sai é removida do Storage **só depois** do banco confirmar o caminho novo; upload que
  falha **desfaz tudo e não altera nada** (perder prova antiga por foto que não subiu é pior).
- `orphanProofPaths` é pura e compara **por conteúdo, não por posição**: a foto que só muda de lugar
  (slot 2 → 1) quando a outra é removida **não pode** ser apagada.

**Validação:** 14 unit novos · **853 unit** no total · typecheck sem erro novo (zero nos arquivos
tocados) · eslint · build · **E2E 66 novo, com cliques reais e arquivos subindo pro bucket**.
🔑 **O E2E foi provado ao contrário:** reintroduzi o bug e ele falhou em *"2ª foto anexada na EDIÇÃO
— Received: null"*, o sintoma exato relatado; com o fix, passa. ⚠️ Para essa prova valer foi preciso
**reiniciar o Vite** — na primeira tentativa ele serviu o bundle antigo e o teste passou com o bug
reintroduzido, dando falso verde. **Terceira vez no mesmo dia.**

### 13.3 ⚠️ Mistura de commit entre sessões paralelas
A outra sessão commitou enquanto eu editava e **arrastou meu `src/services/driverPay.ts` para o
commit `fbe5d3f`** ("prazo da nota"). O código está correto e presente, mas naquele commit ele
**importa `src/utils/discountProofs.ts`, que só entrou em `57fd352`** — ou seja, `fbe5d3f` sozinho
não compila. Não reescrevi história (é trabalho de outra sessão). **Lição: com duas sessões abertas
no mesmo repo, `git add <arquivos>` explícito — nunca `git add -A`.**

---

## 13. Fechamento da leva: prazo da nota, holerite, Safari e dispensa do print

### 13.1 Prazo da nota POR ESPELHO, medindo de verdade (`fbe5d3f`)
Os campos de corte viraram **data/hora de verdade** (eram texto livre `"14:00"`/`"20/07"`, sem ano,
guardados **por empresa** — impossível conferir). A faixa impressa no espelho **continua igual** (o
`03/08` é derivado), mas agora o valor é comparável. Valor no formato antigo é descartado na carga e
o padrão (2 dias, 18:00) entra no lugar.

O prazo vai gravado em **`nf_due_at` na publicação** — mudar o padrão depois **não** mexe nos
espelhos já publicados, que era a exigência do "prazo por espelho".

- **Notas recebidas:** selo `⏰ atrasada — 2 h e 15 min depois` + filtro Todas / Só no prazo / Só
  atrasadas / Sem prazo.
- **Relatórios:** terceira chavinha "Só quem mandou a nota dentro do prazo", mesma regra "paga o
  resto", e o rótulo entra no cabeçalho do Excel. ⚠️ **Quem não tem prazo definido não é cortado.**

### 13.2 Holerite fecha (`fbe5d3f`)
Linha **"Desconto por erros de quantidade"** (nome escolhido pelo Victor). O resumo passou a somar
dos **proventos listados** em vez do `totalGross`, então agora **proventos − descontos = líquido**
(conferido no caso real: 4.050 − 8 − 188,49 = 3.853,51).

### 13.3 ✅ Safari — RESOLVIDO, e o portal funciona
Um subagente descobriu que dá pra rodar o WebKit **sem sudo**: baixar os `.deb` com `apt-get
download` (não precisa root), extrair com `dpkg -x` em `/tmp` e apontar `LD_LIBRARY_PATH`, com
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` e um wrapper próprio (o `MiniBrowser` sobrescreve o
`LD_LIBRARY_PATH`).
**Rodei o spec 65 inteiro no WebKit em tela de iPhone: 5 passaram direto + 1 no retry = 6/6**,
incluindo anexar a foto. ⚠️ A gambiarra fica **fora do repositório** (config em `/tmp`) — não entra
no `playwright.config.ts`. Pra deixar nativo, o Victor roda:
`sudo npx playwright install-deps webkit`

### 13.4 Quem não entrega na plataforma sai da cobrança (`0dc9822`)
Pedido dele: pedimos o espelho pro grupo todo antes da planilha, mas tem driver que não roda Shopee.
Quando a planilha entra, **a pendência dele some sozinha**. Metade já funcionava; faltava a **marca**
— antes virava um traço mudo. Agora a coluna Print mostra **"não entrega"** (cinza) com o motivo.
⚠️ **Resolve só o print**; o "Espelho conferido" do pagamento não é tocado.

**Estados da coluna Print, completos:** verde (bate) · âmbar (não bate/recusado) · cinza (pedido, não
mandou) · **"não entrega"** (planilha chegou, sem pacote) · **"sem grupo"** (fora do pedido geral) ·
traço (não foi pedido).

### 13.5 ⚠️ Victor trabalhando em paralelo no mesmo repositório
Apareceram no meio da sessão `DiscountModal.tsx` alterado + `utils/discountProofs.ts`,
`tests/unit/discountProofs.spec.ts` e `tests/66-...spec.ts` — **não eram meus**. Ele confirmou que
estava em outro terminal. **Passei a commitar arquivo por arquivo, nominalmente, nunca `git add -A`.**
Os 4 erros de tipo do `DiscountModal` são do trabalho dele em andamento, não meus.

### 13.6 🔴 O buraco que o Victor apontou — print antes da planilha (`e24fde7`)
Da pra pedir o print **antes** de importar a planilha. Nesse momento não há quantidade pra comparar,
então o print entra lido mas **sem veredito** e o espelho **não** é marcado — isso está certo. **O que
faltava: quando a planilha chegava, NADA fechava essa conta.** O print ficava `recebido` pra sempre.

⚠️ **E a janela de solicitar JÁ PROMETIA isso** ("a conferência da quantidade acontece sozinha quando
você importar a planilha"). O sistema prometia algo que não fazia.

**Como eu deixei passar:** construí e testei `statusPorQuantidade` (5 testes comparando com o
`runProofCheck` da edge fn) mas **nunca liguei na importação** — ficou só nos testes. Achei ao olhar
o print do **CAIO em produção**: lido 1808, período ok, esperado vazio, fora da fila.

**`reconferirPrintsComPlanilha`** agora roda logo depois da importação:
- usa o número que a IA **já leu** — não baixa foto, não chama IA, não entra na fila (pode rodar em
  89 prints sem gastar cota);
- só mexe em print já lido, com **período aprovado** e **sem decisão humana**;
- marca o espelho com a **mesma regra da edge fn** (respeita o liga/desliga, não passa por cima de
  humano);
- avisa o placar no fim; falha ali **não** estraga a importação, que já terminou.

**Provado contra o banco real, 3 casos:** bate → validado + espelho marcado · não bate → divergente,
espelho não marcado · sem pacote → intocado. **Banco idêntico antes/depois.**

**LIÇÃO:** função pura testada ≠ feature entregue. Faltou o fio entre a conta e o gatilho, e os
testes unitários não pegam isso — só olhar o dado em produção pegou.

### 13.4 "Total a receber" verde mesmo negativo (`710d965`)
Achado pelo Victor olhando a tela: com a quinzena só tendo desconto lançado, o KPI do topo mostrava
**-R$ 1.212,05 em VERDE, com ícone de tique**. A linha do driver, o subtotal do grupo e o card de
grupo já pintavam de vermelho no negativo (`net < 0`) — **só o KPI tinha `color="green"` fixo**.
Telas vizinhas discordando do MESMO número é o tipo de coisa que faz pagar errado.

Corrigido com a mesma regra dos outros três (+ ícone de alerta no lugar do tique). Validado em
**navegador real**: `bg-red-50 border-red-100` e valor `text-red-600`. Nenhum teste afirmava a cor
(o `bg-green-700` do spec 63 é a faixa da prévia do espelho, outro componente).

⚠️ **A MESMA classe de erro continua na faixa "TOTAL A RECEBER" do espelho**
(`DriverMirrorPreviewDialog.tsx:344` e o PDF em `driverMirrorPdf.ts`): verde fixo. Como os 24
entregadores com PNR estão negativos até a planilha de julho entrar, um espelho publicado agora
sairia com faixa verde num valor negativo. **NÃO corrigido — avisado, fora do que foi pedido.**

### 13.5 ✅ A correção das provas foi confirmada EM PRODUÇÃO pelo uso real
Depois do deploy, o Victor editou PNRs e anexou foto. No banco: **2 descontos da Regiane com
`proof1_path` preenchido** — provas salvas de verdade, pelo painel, sem teste nenhum envolvido.
Ele também corrigiu valor (`BR264287491019R` R$ 41,90 → R$ 39,90) e pôs os números de ticket na
observação, então a soma da quinzena passou de R$ 1.212,05 para **R$ 1.210,05** (47 descontos).

Deploy conferido do jeito certo (baixando o arquivo do site, não pelo "build passou"): o chunk
`DriverPayTab-qCeJOE1g.js` traz o aviso novo, **não** traz o antigo, e tem as três marcas do código
da correção (`Nao foi possivel enviar a prova`, `Nao foi possivel remover provas antigas`,
`Upload da prova de desconto`). ⚠️ `DiscountModal` mora nesse chunk — procurar no `index-*.js` dá
falso negativo.

### 13.7 Corrigir a contagem direto em "Espelhos recebidos" (`cf3353b`)
Pedido dele: pro driver que **não bateu**, um botãozinho ali mesmo pra escolher qual número fica —
sem fechar a janela e editar na mão. Caso real: **CAIO, print 1808 × planilha 1811**.

Na linha do print divergente: `[Usar 1808 (do print)] · [outro número] [Aplicar]`. Ao aplicar, grava
os pacotes e chama a **mesma reconferência** que roda depois da importação — a regra de marcar o
espelho é **uma só**, não duas parecidas.

⚠️ **Automático só quando a contagem BATE** (regra dele, reafirmada hoje). Divergiu, nada roda
sozinho — o botão facilita o clique, não substitui.

**A pedra que a investigação achou antes de eu desenhar:** das **238** combinações driver+plataforma
em produção, **95 têm várias rotas** (até 7) — não existe "um lugar" pra gravar 1808. E em **8** delas
as rotas têm **preço diferente**, então onde a diferença cai **muda o valor a receber**.

**Decisão dele:** a diferença vai pra **MAIOR rota**. Se não couber nela, **escorre pra próxima** —
nenhuma rota fica negativa. Com preços diferentes, a tela mostra **quanto o total muda** antes de
aplicar.

**11 testes** em `planejarCorrecaoDePacotes`: maior rota não ser a primeira, diferença que não cabe e
escorre, preços diferentes (tirar 10 da rota de R$ 3 custa R$ 30, não R$ 20) e a invariante de que o
total final é **sempre exatamente o pedido**.

### 13.8 ✅ Validação em produção — a reconferência funcionou no teste do Victor
Ele importou a planilha da Shopee de verdade. **Os 5 prints foram lidos e comparados sozinhos:**

| entregador | print | planilha | resultado |
|---|---|---|---|
| CAIO | 1808 | 1808 | ✅ conferido |
| LUCAS AREDES | 1478 | 1477 | ⚠️ 1 a mais |
| Luis Fernando | 2299 | 2288 | ⚠️ **11 a mais** |
| LUAN FIALHO | 2000 | 1996 | ⚠️ 4 a mais |
| TALES | 2067 | 2069 | ⚠️ 2 a menos |

⚠️ **O CAIO ficou validado mas o "Espelho conferido" NÃO foi marcado sozinho** — e está certo: o
campo tem `espelho_conferido_by = '2626'`, ou seja **um humano tocou** (marcou/desmarcou). A trava
"não passa por cima de humano" funcionou. Pra o automático voltar a valer naquele pagamento, é
preciso limpar esse marcador.

**Menu de correção conferido no ar** (`DriverPayTab-BAA6Xe8f.js` contém "Corrigir a contagem deste
entregador") e validado contra o banco real **só com entregadores descartáveis**:
- uma rota: 1811 → 1808 exato;
- 🎯 **três rotas com preços diferentes**: a diferença saiu da maior (R$ 3,00), então o valor caiu
  **R$ 9,00** e não R$ 6,00 — o risco que eu tinha levantado, funcionando certo;
- caso extremo (não cabe na maior): escorre e **nenhuma rota fica negativa**.

**Banco idêntico antes/depois:** 314 pagamentos · 720 linhas · 310.134 pacotes · R$ 657.051,55 ·
5 prints · 109 drivers.

---

## 14. 🔴 Coleta da Shopee entrava invisível e valendo ZERO (achado + corrigido nos dados)

**Sintoma do Victor:** importou a planilha da Shopee (`CLAYTONBDOSSANTOS (01 07 2026  88).xlsx`,
31 MB) e "o Lucas Aredes não identificou as coletas" — depois: *"me parece que ninguém saiu a coleta
filtrada"*.

**O leitor estava CERTO.** `extractShopee` separa pelo `Tipo do Serviço`
(`COLETA` → `Coleta Shopee`, resto → `SHOPEE`). Conferido no arquivo: **136.787 ENTREGA · 1.600
COLETA · 1 DEVOLUÇÃO**, e no banco entraram **exatamente 1.600** coletas — as **634 do Lucas** batem
número por número.

### 🔑 A causa: plataforma não cadastrada entra CALADA, com taxa 0 e sem coluna
A Caratinga tinha 4 plataformas (ANJUN, eMile, LOGGI, SHOPEE) — **`Coleta Shopee` não existia**. Daí:

- `applyDriverImport` faz `rate = rates[plat] ?? default ?? 0` → gravou **taxa 0,00**;
- a grade desenha coluna com `platforms.map(...)` (só as **cadastradas**) → **os 1.600 pacotes eram
  invisíveis na tela**, apesar de estarem no banco.

Os dois efeitos juntos = "o sistema não identificou a coleta". Ele identificou; ninguém via, e não
valia nada.

### Corrigido nos dados (decisão do Victor: **coleta = R$ 1,00**)
Plataforma `Coleta Shopee` criada (`default_rate` 1.00, `sort_order` 2) + `rate_snapshot` dos 4
pacotes 0,00 → 1,00 + totais recomputados pela view. **+R$ 1.600,00** no total:

| entregador | coletas | antes | depois |
|---|---|---|---|
| LUCAS AREDES MARTINS VIEIRA | 634 | R$ 3.440,80 | **R$ 4.074,80** |
| FILIPE AUGUSTO PENA DA SILVEIRA | 509 | R$ 7.307,15 | **R$ 7.816,15** |
| BRUNO FERRARI GUEDES | 238 | R$ 13.386,60 | **R$ 13.624,60** |
| ROSANA RODRIGUES SOARES | 219 | R$ 1.371,50 | **R$ 1.590,50** |

Backup + rollback: `backups/2026-08-04-coleta-shopee/ROLLBACK.md`. Banco conferido: 5 plataformas,
1.600 coletas, **0 ainda zeradas**, junho concluída intacta (R$ 336.157,66).
**Conferido em PRODUÇÃO com print**: a coluna "Coleta Shopee" aparece na grade e a linha do Lucas
mostra `634 · R$ 1,00 · total R$ 4.074,80`.

### ⚠️ A falha de produto NÃO foi corrigida (fora do pedido)
O import **aceita plataforma desconhecida sem avisar**. Devia parar e dizer "a plataforma X não está
cadastrada — os N pacotes vão entrar valendo zero". Enquanto não for corrigido, **toda plataforma
nova numa planilha repete isso em silêncio** — e só se descobre olhando o banco.

### Efeitos colaterais do import que valem registro
- O import criou **10 entregadores novos** (todos gente real, 21:11 Shopee / 21:39 eMile; nenhum
  resto de teste). Entre eles **`JUSSIMAR DA SILVA MARTINS`**, que era um dos 2 sem cadastro na §13.1
  — agora ele **existe e tem pagamento na 1ª quinzena de julho**, então o PNR dele (R$ 57,90,
  `BR2669439989682`) já pode ser lançado. **A Josiane continua sem cadastro.**
- SHOPEE ficou com **136.785** pacotes contra 136.788 esperados do arquivo (ENTREGA + DEVOLUÇÃO).
  **Faltam 3** — não é falha de leitura (conferido: **zero** linhas do arquivo sem "Driver Name");
  provavelmente entregador marcado como "ignorar" na tela do import. Não investigado a fundo.

## 14.1 A trava do import (`5ce4f34`) — para não acontecer de novo

Pedido do Victor depois do caso das coletas: *"da próxima vez que eu upar planilha o sistema já deve
detectar de forma automática"*. Decisões dele: **travar** (não só avisar) · **Coleta Shopee com R$
1,00** já cadastrada · **só se paga ENTREGA e COLETA, o resto não**.

**1) Trava.** `missingImportPlatforms` (pura) compara o que veio na planilha com o cadastro. A tela do
import passa a carregar as plataformas, mostra faixa vermelha com **nome + contagem de pacotes** e
**desabilita** o botão. O `applyDriverImport` também **recusa** — a regra vale mesmo fora da tela.
Linha marcada "ignorar" não trava (não seria gravada); plataforma **arquivada** não trava (existe, a
taxa resolve normal).

**2) 🔴 Segundo bug, que só apareceu por causa da regra 3:** era
`tipo === 'coleta' ? Coleta : SHOPEE` — **qualquer** outro tipo caía no `else` e era **pago como
entrega**. A planilha real tinha 1 `DEVOLUÇÃO` nessa situação. Agora só ENTREGA e COLETA entram, e o
que sai aparece contado por tipo na tela.

**Validado:** 11 unit novos + os 15 antigos do import · **894 unit** no total · typecheck 61
(baseline, zero nos arquivos tocados) · eslint · build · **E2E 67 novo com cliques reais**, subindo
`.xlsx` de verdade gerado no próprio teste.

⚠️ **O E2E roda em PONTE NOVA** (zero plataformas cadastradas): o cenário acontece naturalmente. A
**primeira versão apagava "Coleta Shopee" da Caratinga** por alguns segundos para forçar a trava — se
o processo morresse no meio, produção ficava sem ela. Refeito. Conferido depois: PN zerada, Caratinga
intacta.

### ⚠️ Eu repeti o erro que tinha documentado na §13.3
Commitei `src/services/driverPay.ts` por nome explícito — mas **o mesmo arquivo tinha edição das duas
sessões**, e levei junto o `listPaymentMarks`/`PaymentMark` da outra (que depende de uma migration e
de um tipo ainda não commitados: o commit **não compilaria sozinho**).

**Corrigido:** reconstruí o arquivo a partir de `git show <commit>^:` aplicando **só as minhas duas
mudanças**, `commit --amend`, e **devolvi ao disco** a versão com o trabalho das duas sessões (o dela
estava salvo antes de qualquer coisa). Provado numa **worktree isolada no commit**: `tsc` dá os
mesmos **61** do baseline — ou seja, agora compila sozinho de verdade.

🔑 **Lição corrigida (a da §13.3 estava incompleta):** `git add <arquivo>` explícito **não basta**
quando duas sessões editam o MESMO arquivo. Antes de commitar, conferir o diff do arquivo
(`git diff <arquivo>`) e verificar se tudo ali é seu.

---

## 14. Tag "pagamento concluído" (`4effa53`) + bug da caixa do grupo (`0a00783`)

### 14.1 🐛 Caixa de seleção do grupo ficava um passo atrás
Bug que o Victor achou usando. **Reproduzido com cliques reais:** clico na 1ª → contador vai pra (1)
mas **nenhuma** caixa marcada; clico na 2ª → contador (2) e **aí a 1ª** aparece marcada.

**Causa raiz:** a caixa vivia **dentro do `<summary>`** do `<details>`. Pra o clique nela não abrir a
gaveta, o código chamava `preventDefault()` — só que isso cancela **também o próprio marcar**. Com
`checked` controlado + `readOnly`, o React perde a sincronia com o DOM e só se acerta no render
seguinte.

**Conserto de raiz** (não mascarei com `key`/force-update): o `<details>/<summary>` saiu. O cabeçalho
virou uma linha com a caixa **fora** do gatilho e um `<button aria-expanded>` do lado. **Marcar é
marcar, abrir é abrir** — sem `preventDefault` nenhum. Provado com cliques: marca na hora, desmarca
na hora, e abrir a gaveta (0 → 1 tabela) **não mexe na caixa**.

### 14.2 Tag "pagamento concluído"
O sistema não sabia quem já tinha recebido. Agora, na janela do relatório: **"Esta planilha é o
pagamento de verdade"** (desmarcado por padrão). Ao gerar, quem saiu ganha a tag **PAGO** nas
plataformas daquele relatório.

**Decisões dele:**
- marca por **(entregador, PLATAFORMA)** — pagar só a SHOPEE marca só a SHOPEE; "concluído" só
  quando **todas** as que ele tem foram cobertas, senão o painel diria "pago" pra quem ainda tem a
  receber;
- num **grupo marca os N membros**, não só o líder — o dinheiro da linha do líder cobre todos.

**Aviso antes de baixar:** quem já foi pago naquelas plataformas aparece **com a data** e com botão
**"tirar do relatório"** (por pessoa ou todos), **sem sair da tela de gerar** — ele pediu isso
explicitamente. **Avisa, não bloqueia.**

**Na tela:** tag roxa na linha (`✓ pago 04/08` ou `pago SHOPEE` quando parcial) e no cabeçalho do
grupo (`pago 8/10` / `pagamento concluído`).

**Banco:** migration `20260804200000` (`driverpay_payment_marks`) **aplicada**, RLS no padrão.
⚠️ **É o registro de quem já recebeu:** guarda quem marcou e quando, e a remarcação é **idempotente**
(`ignoreDuplicates`) pra a data do **primeiro** pagamento não ser sobrescrita — é ela que o aviso
mostra. A marcação só roda **depois** de o arquivo ter sido gerado; se ela falhar, o aviso diz a
verdade em vez de fingir que deu certo.

**Validado:** typecheck sem erro novo · eslint 0 · build · **203 unit** (14 novos).

### ⚠️ Armadilha que me pegou 3× hoje (fica registrada)
Script Python com vários `assert ... in s` **antes** de gravar o arquivo: quando um `assert` falha no
meio, **nada é salvo** — nem as edições que já tinham passado. Perdi trabalho e só percebi porque o
`grep` seguinte não achou o que eu tinha acabado de "editar". **Gravar depois de cada edição, ou
conferir com grep antes de seguir.**

## 15. Correção com 2+ rotas + ordenar grupos por espelho (`3c2bf49`)

**(a) Correção da contagem com mais de uma rota.** Antes só aparecia a rota que muda
(*"Caratinga: 2009 → 2124"*) — a outra rota **não existia na tela**. Ficava sem resposta a pergunta
que decide o valor: *"em qual rota entrou, e a outra ficou como?"*. Como os preços por rota são
**diferentes**, é ONDE a diferença cai que define quanto o entregador recebe.

Agora, com 2+ rotas, cada rota sai com o **seu preço por pacote**, a que recebeu a diferença fica
marcada com ➜ e as demais dizem "não muda". Rota única segue com a frase curta. O plano puro passa a
devolver `linhas` (TODAS as rotas, com `mudou`); `ajustes` — o que grava no banco — **não mudou**.

**(b) Ordenar grupos por "Espelho conferido"**, igual já existia no individual. Mesma escala do
"NF validada" (2 = todos, 1 = parte, 0 = nenhum). ⚠️ **Diferente do NF**, o espelho conferido é
**por membro** (cada print marca o pagamento daquele driver), então conta um a um em vez de olhar só
o líder.

**Validado:** 8 unit novos + os 11 antigos · **902 unit** · typecheck 61 (baseline) · eslint · build ·
**tela FOTOGRAFADA** com o caso real do Fabricio (Caratinga R$ 2,00 × Inhapim R$ 1,50):
`➜ Caratinga · R$ 2,00/pct 1307 → 1422 (+115)` / `Inhapim · R$ 1,50/pct 702 (não muda)`.
O cenário da foto foi montado em **Ponte Nova** (empresa vazia) e apagado — PN zerada, Caratinga intacta.

⚠️ **Segunda vez que precisei separar commit misturado** (`driverPayShared.ts` tinha minha mudança e a
feature "desconto pendente" da outra sessão). Mesmo procedimento da §14.1: reconstruir do `git show
HEAD:`, commitar, devolver o arquivo completo ao disco. Provado em worktree isolada: **61 erros**, o
baseline — compila sozinho.

## 16. ⏳ ABERTO — decisão do Victor sobre recusa de print (§ pedido dele, não implementado)

Ele pediu: **print com data errada → recusa e exclui automaticamente** · **1 print por entregador**
(outro só depois de excluir o primeiro). **Investiguei e NÃO implementei**, porque achei um risco que
muda o desenho:

**🔴 A reconferência NUNCA recusa.** Conferido na função **no ar**:
`status: confirmado ? 'validado' : 'recebido'` — hardcoded, e não toca em `reject_reason`. Então um
print recusado no envio é **destravado sozinho** pela fila, ficando "recebido" com a mensagem
vermelha antiga na tela. **É a causa do caso do GESSILEY** que ele fotografou.

**🔴 A IA leu a MESMA foto duas vezes com respostas diferentes:** 1ª leitura 4049 pacotes / período
16-31/07 (recusou); 2ª leitura 3733 / 01-15/07 (período certo). A planilha esperava **3734** — ou
seja, a 2ª leitura é a certa e a **1ª foi alucinação**. Se "excluir automático" estivesse ligado, o
print BOM do Gessiley teria sido **apagado**.

**Perguntei e aguardo:** (A) recusa+apaga na hora, como pedido; ou (B) recusa na hora mas só apaga
depois de uma **segunda leitura confirmar** a data errada. Recomendei B. Também perguntei se print
recusado libera a vaga do "1 por entregador" (recomendei que sim).

---

## 15. Planilha da LOGGI lançada à mão (01–15/jul) — DADO DE PRODUÇÃO

O Victor mandou a planilha `entregas-por-entregador (01 jul - 15 jul)` da LOGGI e pediu pra comparar
os nomes e **lançar só nos entregadores que já existem** no sistema.

**O problema do nome:** a planilha usa nome CURTO com prefixo de base (`(IPT INT) LUCAS AREDES
(CARATINGA)`) e o sistema tem o nome COMPLETO (`LUCAS AREDES MARTINS VIEIRA`). Comparação exata
casou **3 de 48**. Refiz com casamento por palavras (todas as palavras da planilha presentes no nome
do sistema) + normalização de acento/parênteses: **28 casaram sozinhos**.

**Antes de gravar, três checagens:**
1. LOGGI na quinzena estava **zerada** (0 pacotes) → gravar era só somar, sem sobrescrever nada;
2. os não-achados **não existem em nenhuma empresa** do sistema (só há uma empresa, 109 drivers);
3. rodei em **modo simulação** primeiro, conferindo driver por driver.

**Gravados: 28 entregadores · 2.828 pacotes · R$ 5.656** (taxa R$ 2,00). Cada um na **rota que já
usava** na quinzena, pra não criar linha duplicada na grade. Total do pagamento recalculado pela
**mesma view** que o painel usa (`driverpay_payment_computed`).
**SHOPEE conferida antes/depois: 270.158 → 270.158, intacta.**

**NÃO lançados — 20 nomes, 4.913 pacotes (63% do volume):**
- **19 não existem no sistema**, quase todos de outra base (Ipatinga, Cel. Fabriciano, Timóteo, Belo
  Oriente, Naque, Iapu, Marliéria). Maiores: EDVALDO SIMEAO 534 · KELCIO ANTONIO 450 · GABRIEL LUCAS
  415 · DANILO RODRIGUES 401 · RENATO DA COSTA 385.
- **1 ambíguo:** `FABRÍCIO DOS SANTOS` (131) casava com `FABRICIO DOS SANTOS FERREIRA` **e**
  `Fabricio dos Santos Maia Soares` — perguntei e ele respondeu **"nenhum dos dois"**, então é uma
  terceira pessoa, fora do sistema. Não lançado.

⚠️ **Quase-colisão pra ficar de olho:** existem `FILIPE AUGUSTO PENA DA SILVEIRA` e `Fillipe Augusto
Dos Santos Emidio` (um "L" de diferença). Casaram certo — 354 e 69 — mas é o tipo de par que uma
mudança na normalização quebraria.

## 17. Recusa de print: a causa do caso GESSILEY, corrigida (`26bfc7b`) — FALTA DEPLOY

Fecha a decisão que estava aberta na §16. Decisões do Victor: **(B)** recusa na hora, apaga só com
confirmação · **1 print por entregador** · **recusado libera a vaga**.

### 🔴 A causa
`reconferirPrint` tinha `status: confirmado ? 'validado' : 'recebido'` **fixo**, com o comentário
*"reconferência nunca vira 'rejeitado'"*, e **não tocava em `reject_reason`**. Um print recusado no
envio era **destravado sozinho** pela fila minutos depois: virava "recebido" e ainda mostrava a
mensagem vermelha da recusa antiga. É o cartão que ele fotografou. **Conferido na função NO AR**
(via `get_edge_function`), não só no repositório.

### 🔑 Por que não apaga na primeira leitura
A IA leu a **mesma foto** do Gessiley duas vezes com respostas **diferentes**: 1ª → 4049 pacotes,
período 16-31/07 (data errada); 2ª → 3733, período 01-15/07 (data certa). A planilha esperava
**3734**, então a 2ª é a correta e **a 1ª foi invenção**. Apagar na 1ª teria destruído um print bom.
A contagem vive em `check_details.dataErradaSeguidas`; **qualquer** outro veredito zera — inclusive
`pendente`, porque falha nossa não é prova sobre a foto. **Ilegível recusa e NÃO apaga.**

### 📌 Um print por entregador
Trava no `proof-upload`, **antes** do upload (não deixa imagem órfã no bucket): existindo print com
status ≠ `rejeitado` naquele (quinzena, entregador, plataforma), responde **409**. O **"trocar"** do
portal **saiu** — com a regra nova ele só daria erro.

### ⚠️ Teste antigo ATUALIZADO, não afrouxado
`proofCheck.spec` afirmava *"problema da FOTO não volta pra fila"*. Isso valia quando nada era
apagado; agora data errada precisa da 2ª leitura. Dividido em dois: ilegível segue sem voltar, e data
errada ganhou asserção própria dos dois estados (volta com 1 confirmação, sai com 2).

**Validado:** 16 unit novos · **924 unit** · typecheck 61 (baseline) · eslint · build · `deno check`
com os **mesmos 2 erros pré-existentes**, nenhum novo.

### ⏭️ PENDENTE: DEPLOY
**Nada disso está no ar.** A edge function `driver-public-api` precisa ser deployada pelo CLI (o MCP
é bloqueado pelo classificador). Enquanto não for, o comportamento em produção segue o antigo:
reconferência destrava print recusado e não há limite de 1 por entregador.

---

## 16. Abas nos espelhos, trava do print repetido, lentidão e busca de grupo

### 16.1 Abas em "Espelhos recebidos" (`638d416`)
Com 79 prints, a chavinha "só o que precisa de atenção" não deixava ver **só os conferidos**. Virou
aba com contador: **Precisam de você (15) · Conferidos · Na fila (3) · Todos (79)**.

### 16.2 🔴 Trava do print repetido — risco de pagar a pessoa errada
A tela dele mostrava: *"Ray Augusto — planilha 484 · print 2907 · este print é IDÊNTICO ao de
MAURICIO DE SOUZA COELHO"*, e logo abaixo o botão **"Usar 2907 (do print)"** que eu tinha feito —
gravaria **+R$ 4.846** pro Ray com base na foto de outra pessoa. **O botão não sabia do duplicado.**

Agora, quando o print é idêntico ao de outro: aviso âmbar dentro do bloco, botão laranja com ⚠, e o
clique pede **confirmação dizendo de quem é a foto repetida**. Continua possível — a decisão é dele —
mas não mais às cegas.

### 16.3 🔴 Lentidão ("está demorando demais") — causa minha, medida
Cada correção de contagem chamava a reconferência da **quinzena inteira**.
**Medido em produção: 76 prints × 3 idas ao banco = ~228 consultas sequenciais por clique.**
Corrigir um driver não muda a contagem de ninguém mais, então a reconferência passou a aceitar um
`driverId`. **Medido depois: 3 consultas, 49ms.** A varredura completa continua valendo pra depois
da importação da planilha, que é quando faz sentido.

### 16.4 Busca de grupo (`ffcf5a3`)
Com ~50 grupos, achar um rolando era trabalho. Campo fixo no topo, filtra conforme digita, contador
"19 de 50", limpar e mensagem própria. **Ignora acento reusando o `normalizeSearch` que já existia**
no arquivo (busca de driver) em vez de criar um segundo que poderia divergir.
Provado com cliques: `caratinga` → 19 de 50 · `agua` → acha "Pingo-D'Água" · inexistente → mensagem ·
limpar → volta aos 50.

### 16.5 Release
Push dos 3 commits (2 dele + 1 meu) e **deploy da edge function**, conferido por sha256:
`2c20d6659b299294` no ar = no repositório. Antes de deployar, rodei `deno check` (mesmos 2 erros
pré-existentes) e os **65 testes** de `proofCheck`/`proofRecusa` do trabalho dele.

## 18. Deploy da recusa NO AR + busca sem acento (`342ed2c`)

### 18.1 Edge function deployada — a correção da §17 está valendo
`driver-public-api` **v23 ACTIVE**. Conferido pelo caminho certo (`get_edge_function` + sha256 dos
4 arquivos): **idênticos ao local**, e os marcadores das regras novas estão lá
(`UM PRINT POR ENTREGADOR`, `alreadySent`, `proofDeveApagar`, `dataErradaSeguidas`).

⚠️ **Antes de deployar eu comparei o AR com o repo** (extraindo os 4 arquivos do
`get_edge_function`): estavam **idênticos**, então o deploy só acrescentou o que eu fiz — não
reverteu nada. Essa checagem é obrigatória aqui, porque o repo já esteve atrasado em relação ao ar.

**Fumaça em produção:** login com CPF inválido → **401** em 0,42s (não 500); ação sem token → 401.
**E2E contra a fn no ar: 65 6/6 e 64 1/1.**

### 18.2 Busca sem acento (pedido dele)
`contemSemAcento` (puro) tira acento e caixa dos dois lados, nas **três** buscas de entregador do
painel: grade, "Solicitar espelho" e o seletor do import. ⚠️ **Não reusei `normalizeDriverName`**: ele
também remove prefixo numérico, parênteses e "XPT" (serve pra CASAR planilha com cadastro) — numa
busca livre, procurar "xpt", "dutra" ou pelo código deixaria de achar. Há teste fixando isso.
**Conferido na tela:** `paixao`→Paixão · `mario`→MÁRIO · `chale`→Chalé · `conceicao`→Conceição ·
`caique`→Caíque · `joao`→7 resultados.

### 18.3 Dois E2E ajustados (não afrouxados)
- **65 cenário G** exigia 2 campos de arquivo. O "trocar" saiu com a regra "um print por entregador",
  e o líder vem do cenário E onde ele **já enviou** — então não tem mais onde enviar. A asserção passou
  a provar isso (1 campo + seção "Já enviados"), guardando a regra nova melhor que a contagem antiga.
- **64**: `getByText('1750')` quebrou por *strict mode* (3 elementos) quando a lista de rotas aninhou
  mais um `div`. Virou `.first()` — o que importa é o número estar na tela.

### 18.4 Perguntas dele, respondidas com evidência
- **"A próxima planilha já identifica as coletas sozinha?"** Sim. O leitor sempre separou
  `COLETA`→`Coleta Shopee`; o que faltava era a plataforma existir. Agora existe com **R$ 1,00**, e se
  vier plataforma nova não cadastrada o import **trava** em vez de deixar entrar zerada.
- **"As configurações se mantêm de uma quinzena pra outra?"** Sim — `driverpay_platforms`,
  `driverpay_platform_rates` (entregador × plataforma) e `driverpay_groups` **não têm `period_id`**.
  O que nasce vazio por quinzena: pacotes, descontos, vales, publicações e pedido de print.
  ⚠️ **`rate_snapshot` congela no import**: mudar a taxa depois NÃO altera o que já entrou (foi por
  isso que os 1.600 pacotes de coleta precisaram de acerto na mão).

### ⚠️ Armadilha de ambiente
A bateria `vitest run` foi **morta pelo WSL** (memória) duas vezes rodando em segundo plano, e uma
terceira falhou por eu ter usado `--reporter=basic`, que **não existe** nesta versão — a saída
parecia falha de teste e não era. Rodando em primeiro plano e sem flag: **936 passam, 59 arquivos,
zero falha**. O "1 failed" visto antes era o flaky conhecido dos testes que tocam o banco.

## 19. Desmarcar pagamento + ordenar grupos por espelho no app (`8aeaf61`)

### 19.1 🔑 A marca de "pago" nasce sozinha ao gerar relatório
Descoberto respondendo a pergunta dele sobre a etiqueta: a **MARIZE** apareceu como paga sem ter
sido. Não foi teste automatizado nem coisa minha — foi **ele**, às **22:35**, com o login **2626**,
gerando o **Relatório simples** só pra ver a etiqueta (`report_kind: 'simples'`). **Gerar relatório
carimba como pago todo mundo que sai no arquivo.** Vale saber antes de gerar "só pra conferir".

Marca de teste **removida a pedido dele**, com backup/rollback em
`backups/2026-08-04-marca-pagamento-teste/`.

### 19.2 Botão de desmarcar (o pedido que veio disso)
A etiqueta virou **botão**: clica → confirma → a marca sai. Pede confirmação porque, diferente do
"espelho conferido", isto é registro de **dinheiro**. Apaga as marcas de **todas** as plataformas
dele no período — "desmarcar pagamento" é uma coisa só pra quem usa. Se não havia marca, avisa em
vez de mentir que desfez.

### 19.3 Ordenar grupos por "Espelho no app"
Terceira régua da visão Grupos, ao lado de "NF validada" e "Espelho conferido".
⚠️ **Não confundir os dois espelhos:** *no app* = o PDF publicado; *conferido* = o print da Shopee
batendo com a planilha. Usa a **mesma regra do selo do cartão** (`some`): no grupo só o **líder**
recebe o espelho (decisão "Opção A", 24/07), então exigir todos daria sempre "não publicado" e a
ordenação discordaria do selo ao lado.

### Validação — aqui o que vale é a TELA, não função pura
- **Desmarcar:** recoloquei a marca, cliquei no selo, a confirmação veio com o nome certo, e a
  etiqueta sumiu **da tela E do banco** (0 marcas restantes).
- **Ordenar:** 1º clique põe os 6 primeiros grupos como "no app"; 2º clique inverte pra "não
  publicado". Antes vinham misturados.
- typecheck 61 (baseline, zero nos tocados) · eslint · build.

### ℹ️ Onde a etiqueta de pagamento aparece (dúvida dele)
Do lado do **nome**, na coluna "Driver / Rota". **Não existe etiqueta de "pendente"**: quem não foi
pago fica sem nada — numa quinzena de 98, marcar todos seria ruído. Só há
`pago SHOPEE+LOGGI` (parcial, âmbar) e `✓ pago DD/MM/AAAA` (completo, roxo), mais a etiqueta
vermelha **"vale a descontar"** quando ele foi pago sem o desconto sair.
