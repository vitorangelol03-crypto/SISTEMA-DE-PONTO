# CHECKPOINT SESSÃO 2026-10-19 — leitura do espelho trocada do Gemini pro Claude (Haiku)

## O que motivou
Victor clicou em "Solicitar espelho" no painel do driver e reclamou de 2 coisas:
1. o botão não pode pedir de novo de quem **já enviou** nem de quem **já foi solicitado**;
2. **quem já enviou não estava sendo conferido automaticamente** — "verifique o que está acontecendo".

## Investigação (empírica, Caratinga aberta `9b8fd48b-2f87-444a-aef0-0d5fa73a115c`)
- A fila RODA (todos com `checked_at` de hoje, `check_attempts` subindo até 8), mas **100% das leituras voltavam vazias** (`read_packages` null, "falha na leitura"); 0 validados / 0 recusados; 7 já tinham **desistido** (`next_check_at` null).
- Histórico: leitura ~100% até **14/10**; **0 de 66 em 19/10**. Nenhum código mudou desde 14/10 → quebra **externa**.
- Diag temporário (`vision-diag`, apagado): a chave Gemini dá **HTTP 403 "Your project has been denied access"** em todos os modelos 3.x; os 2.0 dão **404 (aposentados)**. = projeto do Google bloqueado (billing/sinalização).

## Decisão do Victor
Trocar a leitora do espelho pro **Claude**, modelo **Haiku** (`claude-haiku-5-5`). A chave `ANTHROPIC_API_KEY` é dele (mandou no chat).

## O que foi feito (commit `2fb27c9`, additivo)
- `supabase/functions/_shared/visionRead.ts`: provedor `anthropic` (Messages API + **tool-use** forçado pro mesmo JSON `legivel/entregues/periodoInicio/periodoFim`), `DEFAULT_CLAUDE_MODELS=['claude-haiku-5-5']`, `visionConfigFromEnv` lê `ANTHROPIC_API_KEY`/`PROOF_VISION_PROVIDER=claude` (vazio mantém Gemini na frente). **Sem `temperature`** no corpo do Claude — a família Claude 5 recusa com HTTP 400 ("temperature is deprecated"); foi o bug que fez a 1ª tentativa falhar.
- `supabase/functions/_shared/nfVisionRead.ts`: trava — a leitura da NF é Gemini-only; se o provedor não for gemini, vai pro manual (não manda a chave do Claude pro Google).
- `tests/unit/visionRead.spec.ts`: +cobertura (liga Claude, ignora chave Gemini, sem chave = manual, monta corpo, lê/blinda resposta, sem temperature).

## Validação
- `npm run typecheck` 0 erros; `npx vitest run visionRead` **50/50**.
- Deploy: `npx supabase functions deploy driver-public-api --no-verify-jwt` → **v51**. Secrets setados via CLI (`secrets set`, 3).
- Teste ao vivo (lote supervisionado primeiro): fila reprocessada, leituras EXATAS (753=753, 649=649, 1067=1067, 3391=3391, 781=781, 130=130); divergentes são diferença real de poucas unidades; datas certas. **Nada apagado por engano.**
- Quadro final Caratinga: **35 validados (🟢 auto)**, **32 divergentes (manual)**, **6 recusados (data errada)**. `driverpay_payments.espelho_conferido` auto subiu p/ **84**.
- Outras quinzenas: só 1 print pendente e **agendado** (cron pega sozinho a cada 15 min). Nada preso.

## Como reproduzir / operar
- Fila manual: `POST https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/driver-public-api` body `{"action":"proof-process-queue","limit":50}` com `Authorization: Bearer <vault proof_queue_secret>`. **Para no 1º print ilegível** (`na-fila` → break) — é de propósito (poupava cota do Gemini).
- Requeue de parados: `update driverpay_delivery_proofs set next_check_at=now(), check_attempts=0 where ... status='recebido' and check_status='pendente'`.
- Trocar modelo/provedor = **secret**, não código (`PROOF_VISION_MODELS`, `PROOF_VISION_PROVIDER`).

## Pendências — RESOLVIDAS na continuação do mesmo dia (ver abaixo)
~~1. BOTÃO "Solicitar espelho"~~ · ~~2. Nota fiscal pro Claude~~ — feitas.
3. Diags `vision-diag`/`vision-diag2`/`nf-diag`: criados e **apagados** (não sobraram no ar).

---

# CONTINUAÇÃO 2026-10-19 (parte 2) — prévia honesta do espelho + NF pro Claude

Victor respondeu **"1 2 sim"** (fazer as duas pendências) + decisão de produto.

## Tarefa 1 — prévia do "Solicitar espelho" (commit `7e98130`)
**Investigação (ponta a ponta, conferida no código):** a regra "não re-pedir de quem já
mandou/validou" JÁ valia no app do entregador (`DriverApp.tsx` 578-601: enviado→"Já enviados",
recusado→"reenviar"), no pedido automático (`proofAuto.ts` 38-43) e na grade (`DriverRow.tsx`).
O ÚNICO lugar errado era a **prévia do modal**: contava todo mundo com pacote
(`expectedProofPlatforms`, que ignora quem mandou/está verde) → dizia "67 entregadores" com 84
conferidos, parecendo que ia pedir da quinzena inteira de novo.
**Conserto:** função pura `previaDeQuemAindaDeve` (`driverPayShared.ts`), reusando
`computeProofProgressByPayment`. Conta só quem **ainda deve** = `missing + rejected`, pulando
quem tem `espelhoConferido` (verde). Modal passou a usá-la + textos honestos ("ainda devem o
print"). **O pedido gravado NÃO mudou** (segue a torneira por plataforma — cobre quem é novo na
quinzena ou teve print recusado); só a conta exibida ficou honesta.
**Decisão do Victor (19/10):** "ainda deve" = **faltando + recusado**. Pendente/divergente/verde
ficam de fora.
**Validação:** typecheck 0; `driverPayProofProgress` 36/36; lote vizinho 98/98; build OK. E2E 64 e
75 tiveram a asserção de texto atualizada ("ainda devem o print") — NÃO rodados ao vivo (abrem a
quinzena real, gravam em produção).

## Tarefa 2 — NF (nota fiscal) pro Claude (commit `1336ffd`, deploy v53)
`nfVisionRead.ts` ganhou ramo **Anthropic**: segue o MESMO provedor do espelho
(`visionConfigFromEnv`), então com `PROOF_VISION_PROVIDER=claude` a NF é lida pelo Claude Haiku.
- PDF vai como bloco **`document`** (imagem como `image`); `tool_use` forçado pro mesmo
  `{legivel, texto}`; **sem `temperature`** (Claude 5 recusa, HTTP 400); `max_tokens 4096`
  (transcrição de nota é texto longo, bem acima do print).
- Trava antiga relaxada: só vai pra manual se **não houver provedor/chave**; nunca manda a chave
  de um provedor pro endpoint do outro. **Fallback seguro:** Claude falhou → manual, como hoje.
**Validação:** typecheck 0; `nfVisionRead` +testes (57/57 com o espelho); build OK.
**Teste AO VIVO (diag `nf-diag`, apagada depois):** baixou uma NFS-e real de Caratinga (86 KB) e
chamou o Claude com bloco PDF → **HTTP 200**, `legivel:true`, **3.217 caracteres transcritos** em
6,6s. Confirma: Haiku aceita PDF (sem 400) e lê a nota.
> Obs.: NFs-PDF recentes têm texto extraível (não acionam a IA); a IA só entra em nota escaneada
> sem texto (caso Lucas Aredes) — mesmo caminho/modelo já provado aqui.

## Estado final
- Frontend (tarefa 1) no `main` → Vercel. Edge `driver-public-api` **v53** (espelho + NF pelo
  Claude). Secrets inalterados (NF reaproveita os do espelho).
- Push agrupado: `9ffea97..1336ffd`.

## Conferência da prévia na Caratinga (pedido do Victor, ao vivo)
Reproduzi `previaDeQuemAindaDeve` em SQL sobre a quinzena aberta (`9b8fd48b`, SHOPEE, 93 pedidos
individuais, todos com pacote): prévia **ANTES = 93** → **AGORA = 21** (todos "faltando"; 0
recusado). Os 93 = 40 verdes + 32 divergentes + 21 ainda devem. Bate. Conserto provado em dado real.

## 💤 FILA — NF conferida SEM IA e SEM humano (ideia do Victor 19/10, NÃO mexer hoje)
Contexto que motivou: só **5% das notas** usam IA (20 de 393 PDFs desde ago); 95% já conferem
sozinhas lendo o TEXTO embutido no PDF digital (`extractText` + `runNfCheck`, sem IA, sem humano).
A IA (Claude, hoje) só entra na nota **escaneada/fotografada** (imagem sem texto — caso Lucas Aredes).
Caminho limpo pra tirar a IA desses 5% (quando o Victor quiser):
- **Opção recomendada:** ler a **chave de acesso (44 díg.) / QR code** da nota (biblioteca de QR,
  NÃO é IA) e **consultar o portal oficial** → valor/CNPJ direto do governo (verdade absoluta,
  mais confiável que qualquer leitura). Caratinga usa **DANFSe v2.0 (padrão nacional)** — vi a
  "CHAVE DE ACESSO DA NFS-e" no PDF de teste. Precisa de plano curto: confirmar como o portal
  (nacional/municipal) deixa consultar; pode exigir certificado.
- Apoio: incentivar/obrigar o **PDF ORIGINAL** da prefeitura (não foto) — aí nem cai no scan.
- Descartado: OCR local (Tesseract) — erra número em scan ruim; dinheiro errado é pior que o Claude.
Enquanto isso: **Claude cobre os 5%** (v53, provado). Nada a fazer até o Victor pedir.

## Tarefa 3 — Furo do print de quem entra no grupo DEPOIS (caso Bruno, commit `b2116b1`)
**Relato (Victor, print do grupo "Ipanema, MG FILIPE", líder Filipe):** o espelho do **Bruno Bacelar**
não estava sendo solicitado no app, mesmo clicando "solicitar de todos".
**Diagnóstico (provado pela linha do tempo):**
- 16/10 13:46 — Bruno entra na planilha (importação) já com 69 SHOPEE.
- 16/10 13:51 — pedido automático cria 93 pedidos individuais, mas **Bruno ainda estava SEM grupo**
  → pulado certo (regra 04/08: "pra todos" só cobra quem está em grupo, quem anexa é o líder).
- 19/10 10:41 — Bruno **adicionado ao grupo** do Filipe (3 dias depois). Nada re-pediu.
Causa raiz: **o pedido automático só roda NA IMPORTAÇÃO**; entrar num grupo depois não dispara nada.
E o botão "Solicitar espelho", com 93 pedidos já gravados, abre em "Manter os 93" e **não completa
quem falta** (o clique vira no-op). A prévia (tarefa 1) mexeu só no número exibido — NÃO é a causa.
**Correções:**
1. **Bruno já (SQL, produção):** inserido pedido individual SHOPEE pro Bruno (`driverpay_proof_requests`,
   requested_by '2626'). Cartão passa a aparecer no app do Filipe. Conferido: 0 ficaram sem pedido.
2. **Raiz (código, decisão do Victor = "varredura do painel pega"):** a varredura automática do
   painel (que já roda a cada recarga da grade) agora **COMPLETA** os pedidos — `driversParaCompletarPrint`
   (`proofAuto.ts`, reusa `driversParaPedirPrint`): por plataforma pedida e com planilha, cria pedido
   individual de quem está em grupo, com pacote, não-verde, sem print e sem pedido que o alcance.
   Só adiciona, nunca apaga; sem candidato não escreve (abrir o painel não gera escrita).
**Validação:** typecheck 0; `proofAuto` 22/22; 5 specs vizinhos 97/97; build OK. Push `17729ab..b2116b1`
→ Vercel. ⚠️ E2E não rodados ao vivo (abrem quinzena real).

---

# CONTINUAÇÃO 2026-10-19 (parte 3) — Adriano/Ilha, grupo do Filipe (print preto) + aviso do líder

## Verificação pedida: ADRIANO FURTUNATO (líder "Ilha - ADRIANO", grupo só dele)
Queixa: "quinzena atual não aparece, só a passada / nem pra anexar". **Não era bug.**
- O app lista uma quinzena pelo **espelho de PAGAMENTO publicado** (`my-mirrors` → `driverpay_mirror_publications`).
  O card de PRINT é separado (`proof-slots`, independe de espelho publicado) e some quando já enviou.
- Adriano: print SHOPEE pedido 16/10 → **ele mesmo enviou pelo app** 19/10 → **validado auto 🟢** (860/860).
  Nada pendente. O espelho de pagamento da 2ª set **não foi publicado** (só 2 de 145 na empresa) → quinzena
  atual não aparece. Vai aparecer quando publicar os espelhos da 2ª de setembro.

## Grupo "Ipanema, MG FILIPE" (líder Filipe; membros Bruno, Elias) — print "não aceita"
**Causa (vista com os olhos, baixei as imagens):** não é outro app nem o leitor. Todos SHOPEE, `src=app`.
- Filipe: print REAL, lido **3347** (vs 3346 planilha = divergência de 1, ok).
- Bruno e Elias: **imagem TODA PRETA** (7.507 B, byte a byte idêntica → o MESMO arquivo preto) reenviada
  (Elias 13x). Leitor acertou em recusar "ilegível". Filipe precisa pegar o print real de cada um.
- **Limpeza feita (produção, SQL):** apagados os 16 registros rejeitado/ilegível do grupo (Bruno 1, Elias 13,
  Filipe 2). Bruno/Elias voltaram a "falta enviar"; print bom do Filipe intacto. (16 blobs órfãos de 7,5KB no
  storage — classificador barrou apagar em massa via shell; inofensivos; a automação v54 limpa daqui pra frente.)

## Feature implementada (commit `9c24ba2`) — decisões do Victor: "só recusado" + "guardar só o último"
1. **Frontend `DriverApp.tsx`:** a faixa de situação dos espelhos do app aparece MESMO com 0 pendentes
   (antes sumia → tela vazia do Adriano). Verde "todos enviados", âmbar "a CD espera N", **vermelho** quando
   algum deu erro na leitura. Estado novo: `proofTotal`, `proofErros`. Abre a lista 🟢/🟡/🔴 que já existia.
2. **Backend `driver-public-api` (v54):** print ILEGÍVEL não acumula — mantém só o último (pra CD ver o que
   mandaram) e apaga os ilegíveis anteriores do mesmo entregador/quinzena/plataforma (arquivo + registro).
   Escopo trava em `status='rejeitado' AND check_status='ilegivel'` (print válido nunca é tocado). Dentro de
   `conferir()`, após gravar. O reabrir automático do card já existia (recusado libera a vaga).
**Validação:** typecheck 0; build 0; **129 testes** (driverAppCartaoPrint, proofRecusaEApagar, proofCheck,
proofAuto, driverPayProofProgress). deno check = 7 erros PRÉ-EXISTENTES (baseline, fora do meu diff).
**Deploy:** front push `8956f49..9c24ba2` → Vercel. Edge v54 pelo Victor via CLI (classificador barrou o meu);
sonda `my-mirrors` sem token → **401 `{"error":"Sessao invalida"}`** (bootou ok).
⚠️ Percalço: `deno check --node-modules-dir=auto` quebrou o node_modules do npm (vite/jsdom) → `npm ci` (9min)
pra restaurar. Lição: NÃO rodar deno check com auto node_modules nesta árvore; validar edge fn de outro jeito.

## Pendência operacional (do Victor, não é código)
Publicar os **espelhos de pagamento da 2ª de setembro** — sem isso ninguém (Adriano, Filipe…) consegue anexar
a NOTA da quinzena atual (a nota só é cobrada após o espelho publicado). Só 2 de 145 publicados.

---

# CONTINUAÇÃO 2026-10-19 (parte 5) — estado "Analisando" no envio do print (`57c3e84`, v55)

**Motivo (perguntas do Victor):** confirmei que a tela atualiza sozinha sem recarregar (`acompanharConferencia`
poda de 5 em 5s por ~1 min). Mas achei um incômodo real: o print recém-enviado já aparecia como "enviado"
(recebido conta como enviado) ANTES de a IA ler — e se desse ruim virava "recusado" segundos depois, parecendo
um "enviado" que voltou atrás. Victor pediu um estado **"Analisando..."** nesses segundos. Escolheu a **opção A**
(jeito certo, com flag no servidor) em vez da B (só front, 6s fixos).

**Feito (decisão A):**
- **Backend `proof-slots` (v55):** cada cartão devolve `lendo` = último print não-recusado está `recebido` +
  `check_status='pendente'` (na fila da IA). validado(ok)/divergente = leitura concluída → não é lendo.
- **Frontend (`DriverApp.tsx` + `ProofSlot.lendo` em `driverApp.ts`):** 3 estados no cartão, no placar e no botão
  da home → 🔵 "Analisando…" (rodinha) · 🟢 "enviado" · 🔴 "recusado, envie outro". `acompanharConferencia` só
  para quando recusa OU é lido e aceito (`sent>0 && !lendo`); enquanto `lendo`, continua esperando (antes parava
  no 1º poll porque recebido já contava como sent). **Trava anti-travamento:** se a janela (~1 min) acaba ainda
  lendo, o cartão vira "conferindo…" calmo (`analiseEmFila`) — nunca fica girando; o cron relê em até 15 min.
  Toast do envio virou "Print recebido — analisando…".
**Validação:** typecheck 0; build 0; **129 testes** (mesma leva). Push `e8ce09c..57c3e84` → Vercel.
Edge v55 pelo Victor via CLI; sonda `my-mirrors` sem token → **401 `{"error":"Sessao invalida"}`** (bootou).
⚠️ NÃO rodei deno check (quebra o node_modules); o `lendo` é type-safe e o bundler do deploy pega sintaxe.

---

# CONTINUAÇÃO 2026-10-19 (parte 6) — "Analisando a nota…" + descoberta: NF já valida sozinha (`b71be5c`)

Victor pediu pra "implementar o mesmo tipo de validação automática na NOTA (recusar se nome/valor/CNPJ
do tomador e de quem emitiu não bater; tela analisando; recusar na hora com o problema)". **INVESTIGUEI
antes de codar e descobri que JÁ ESTÁ FEITO e em produção** (desde ~05–09/09):
- `nfUpload` (edge fn) chama `readNotaFiscalTexto` + `runNfCheck` (`nfCheck.ts`) **SÍNCRONO** e
  **`autoReject = check.status !== 'ok'`** → qualquer divergência recusa na hora (HTTP 422) com o motivo,
  apaga o arquivo e libera a vaga. Mensagens já prontas: CNPJ do tomador errado; valor ≠ espelho; nome/CNPJ
  de quem emitiu errado; ilegível; "é o espelho, não a nota". 3 verdes → auto-valida.
- **Ressalvas (contei ao Victor):** só recusa o que CONSEGUE conferir — valor exige espelho publicado;
  CNPJ do emissor exige cadastro na ficha. Sem isso, não recusa "no escuro" → fica p/ validação manual.
  Por ser síncrona, a NF **não tem o flip** "enviado→recusado" do print.
- **Único gap (feito, `b71be5c`):** o botão da nota mostrava só uma rodinha ao enviar; agora diz
  **"Analisando a nota…"** (os 2 botões: nota única e 2ª nota da dupla), igual ao print e honesto (nota
  escaneada leva ~segundos). Só texto, frontend. typecheck 0, build 0. Push → Vercel. Sem deploy de servidor.
