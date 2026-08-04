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
