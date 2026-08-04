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

**RELEASE — é só isto que falta pra estar no ar (nesta ordem):**
1. **Deploy da edge fn** pelo CLI (o MCP é bloqueado pelo classificador):
   `npx supabase functions deploy driver-public-api --no-verify-jwt --project-ref flcncdidxmmornkgkfbb`
2. **Reagendar o cron** pra valer (hoje está dormindo até 2028):
   `SELECT cron.schedule('driverpay-proof-queue', '*/15 * * * *', $job$ ... $job$);`
   — o corpo está na migration `20260804140000`, PARTE 3.
3. **Push** (do Victor): 5 commits locais.
4. Testar ao vivo: solicitar o espelho numa quinzena, anexar o print real pelo portal, ver a linha
   ficar verde sozinha.

**Depois do release:**
- Edge fn `driverpay-proof-admin` (anexar/reconferir **pelo painel**) — **NÃO foi feita**. Hoje só
  o portal do entregador anexa; quem manda por WhatsApp ainda depende de você por fora.
- E2E 64 (painel) e 65 (**primeiro spec do portal do driver** — hoje não existe nenhum).
- Estender `tests/cleanup.ts` pra tabela e bucket novos.

**Herdadas:** revogar o PAT do Supabase (desde 28/07) · trocar a chave do Gemini quando der ·
Marize (R$ 249×238) e Lucas (escaneada) · PIX do Pablo Raspante · 6 CPFs faltantes · painel responsivo.
