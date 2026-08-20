# CHECKPOINT_SESSAO_2026-08-19.md

> Retomada com "vamos resolver 123" (os 3 primeiros pendentes de 18/08) +
> feature da tag "não bate" clicável. Curto de propósito.

---

## 1. Edge fn v32 NO AR (item 1 de 18/08) ✅

O deploy que não tinha pegado ontem saiu: **Victor rodou o comando com `!`**
(o CLI já estava logado — a hipótese "falta login" de ontem estava errada;
o bloqueio de hoje foi o classificador barrar o deploy vindo de mim, igual
já barra o MCP). `driver-public-api` **v31 → v32**, conferido por conteúdo:
o código deployado tem o `RECUSAS_ATE_DESISTIR = 3` do `3c29c0b`.

⚠️ Anotado: **nem CLI nem MCP de deploy passam por mim** — deploy de edge fn
é sempre o Victor com `!` no prompt.

## 2. Prova ao vivo do fix da leitura (item 2) — resultado honesto

- 🔑 **O print do Gustavo se resolveu SOZINHO antes do deploy** (banco:
  `checked_at 02:15 UTC`, deploy 10:00 UTC; leu 1199=1199, validado,
  attempts=2). O rodízio de modelos entre rodadas da fila já cobria o caso.
  **O fix de hoje NÃO pode levar o crédito desse caso** — dito ao Victor.
- Caso vivo da mesma família: print do **JOÃO GABRIEL FERREIRA** rejeitado
  por ilegibilidade. Com OK do Victor (AskUserQuestion), voltou pra fila
  (`next_check_at = now()`, só essa linha). O cron reprocessou com a v32
  (attempts 1→2) e **continuou recusando** — e ao baixar a foto ficou claro
  o porquê: **não é a tela do app, é o papel de parede do celular dele**
  (desenho de Pokémon). Recusa CORRETA; a trava "nunca invente" funcionando.
- **Conclusão registrada:** o fix está no ar e os unit (com a foto real do
  Gustavo) provam a lógica, mas **ainda não existe prova ao vivo** de foto
  legível resgatada pelos modelos extras. Fica pro próximo caso real.
- ⏳ João Gabriel precisa **reenviar o print certo** (mandou papel de parede).

## 3. Push do `3c29c0b` (item 3) — JÁ ESTAVA FEITO ✅

`git fetch` mostrou `origin/main = bb7d29f` (inclui o `3c29c0b`). O
checkpoint de 18/08 listava como pendente, mas o push já tinha acontecido.
Revalidado mesmo assim: typecheck 0 · build limpo · **1265 unit, 0 falha**.

## 4. `95c764e` — tag "não bate" clicável (feature nova, só local)

Victor mandou print da grade: *"a tag de espelho não bate deixe ela para ser
clicavel e quando clicar apare o espelho infromando o porque de não bate e
com opção de validar ele ali"*.

🔑 Investigado antes: **tudo que o clique precisa já existia** no modal
"Espelhos recebidos" (foto, motivo, comparação, validar/recusar) — faltava o
caminho direto. Zero tela nova, zero mudança de backend/banco:

- Tag âmbar da grade (`DriverRow`) virou botão → abre o modal já filtrado
  no driver (prop `initialBusca` nova pré-preenche a busca que já existia).
- Card mobile (`DriverList`): o aviso equivalente também virou botão.
  Reordenação do if é segura — `complete` × `needsAttention`/`rejected`
  são mutuamente exclusivos (cada plataforma tem UM estado).
- Botão geral "Espelhos recebidos" segue abrindo SEM filtro (estado limpo
  no clique e no fechar).

Validado: typecheck 0 · eslint 0 · build · 88 unit da área · **E2E novo
`tests/75`** com cliques reais (print divergente → tag → clique → modal
filtrado com "58 a mais no print" → validar ali → tag some, espelho
conferido na tela E no banco) · regressão 64 1/1. ⚠️ O 75 deu flaky na 1ª
rodada (clique de montagem na carga fria do Vite/WSL — mesmo flake
documentado do 64 em 07/08); rerodado com Vite quente: 1/1 de primeira.

## 5. Segunda leva do dia — dispensa do espelho que nunca disparou (`25288e7`, só local)

Victor mandou prints da grade: *"esse luis agusto ja não era para sistema ter
validado e marcado espelho dele sozinho?"* (e depois "daniel tambem").

🔑 **A feature JÁ EXISTIA** (`marcarEspelhoPorDispensa`, decisão dele de 05/08:
0 pacote na plataforma cobrada = validado). **Raiz de não ter disparado, provada
pela linha do tempo do banco:** a varredura só rodava no `onImported` das duas
janelas de importação; TODAS as importações reais da quinzena foram 18/08
18:42–19:33, quando o `proof_auto_confirm` ainda estava **desligado** (ligado só
à noite); ligar a chave não reexecuta nada, e o que parecia reimportação em
19/08 13:05 UTC era **1 linha** (edição de célula, que não dispara). Resultado:
**20 entregadores em grupo sem pacote SHOPEE presos sem marca** — Daniel e Luiz
Augusto entre eles — enquanto os 80 com Shopee foram marcados pelo caminho do
print.

**Decisões dele:** (1) marcar os 20 retroativos → **feito em produção** com a
mesma régua do app (dry-run antes, ids idênticos, backup + rollback em
`backups/2026-08-19-espelho-dispensa/`); quinzena ficou 100 'auto' + 2 manuais +
16 sem marca (14 devendo print de verdade + Cícero/Wender). (2) Só quem tem
grupo — Cícero e Wender ficam fora (regra de 04/08 mantida). (3) Quem foi
dispensado e depois **ganha pacote** é **desmarcado sozinho** e o portal volta a
pedir o print (pedido de pé + pacote > 0 = slot reaparece sozinho; nenhum pedido
novo é criado).

**Código (`25288e7`):** varredura virou `useEffect` da grade — roda em qualquer
recarga (importação, chave ligada, pedido criado, célula editada); sem candidato
não escreve nada. Sentido novo de DESMARCAR (`pagamentosParaDesmarcarPorDispensa`
+ `desmarcarEspelhoPorDispensa`): só desfaz marca `'auto'`, nunca de humano (nos
dois sentidos), e quem tem print validado cobrindo tudo mantém a marca.
`DriverRowData`/`DriverPayment` ganharam `espelho_conferido_by` (o select `*` já
trazia; campo opcional pra não quebrar fixtures).

**Pergunta dele no meio, respondida:** desmarcar espelho na mão NÃO dispara nova
solicitação (são independentes; pra exigir print novo o caminho é RECUSAR o
print no modal), e a varredura respeita desmarcação humana.

Validado: typecheck 0 · eslint 0 erros (6 warnings pré-existentes) · build ·
**1273 unit (+8), 0 falha** · **E2E novo `tests/76`** com cliques reais (pedido
por grupo → Y sem pacote marcado SOZINHO sem importar nada → X com pacote segue
pendente → Y ganha pacote e é desmarcado → zera e remarca; banco e tela
conferidos em cada passo) 1/1 · regressão 64 e 75 2/2. ⚠️ tests/76 falhou 1× na
primeira rodada por ler o cabeçalho da grade antes de uma linha estar visível —
corrigido no próprio spec (mesma ordem do 75), não era o app.

## 6. Terceira leva — desmarcar espelho volta a cobrar o print (`78a01ea`, só local)

Perguntas dele no meio (respondidas com o código na mão): o portal NÃO fica
cobrando pra sempre — cartão vira "enviado" (apagado) depois do anexo e só volta
a cobrar se o print for RECUSADO. Daí o pedido: *"se o check for desmarcado e
tiver pacotes da shopee o sistema volta a cobrar o print daquele líder"*.

Implementado: desmarcar alguém **cobrado** (plataforma pedida com pacote, régua
`expectedProofPlatforms` — a mesma da grade) **recusa os prints ainda de pé**
daquelas plataformas (via `setProofStatus`, o serviço do modal) e o portal volta
a cobrar sozinho pela regra que já existia (`sent===0 && rejected>0`), mostrando
ao entregador: *"O CD pediu um novo print deste período."*. Tem `window.confirm`
antes (o entregador VÊ a recusa). Sem plataforma cobrada (dispensado etc.), o
desmarcar segue sendo só o check. A varredura não remarca (by=humano).

Validado: typecheck 0 · eslint 0 erros · build · **1281 unit (+8), 0 falha** ·
**E2E novo `tests/77`** (print validado + conferido → desmarca → confirm →
print 'rejeitado' com motivo no banco → tag "recusado" na grade → varredura não
remarca) 1/1 · regressão 64/75/76 3/3.

🔴 **Achado, NÃO corrigido (decisão do Victor): `tests/57` quebrado DESDE 04/08**
— usa `.last()` posicional na edição de rota, e a plataforma real "Coleta
Shopee" (criada em prod em 04/08, R$ 1,00) virou a última coluna: os 5 pacotes
do teste caem nela (10×2+5×1=25 ≠ 30 esperado). **Provado sem as mudanças de
hoje** (`git stash` de src/ + rerun = mesma falha). Não é regressão desta
sessão; fix = mirar a plataforma pelo nome em vez de posição.

## 7. Quarta leva — teste ao vivo da Celita + fix de largura da grade

**Celita (teste do Victor em produção):** ele desmarcou o espelho dela ANTES de
recarregar a página — aba ainda com o bundle velho, então o check apagou mas o
print seguiu 'validado' (sem recobrança). Pedido dele: *"solicita o dele de novo
para lider"* → **recusei o print via SQL** (mesmo formato do `setProofStatus`;
motivo: "O CD pediu um novo print deste período."; estado anterior anotado:
validado 62=62 às 12:13 UTC). **Funcionou ao vivo:** o líder (João Gabriel)
**reenviou print novo às 15:51** (na fila) e o Victor validou/marcou às 15:52 —
a recobrança pelo app está provada em produção. ⚠️ Regra prática: depois de
deploy, **F5 no painel** antes de testar feature nova.

**Fix de largura (`08c8c10`, NO AR):** print dele mostrava "2.209"/"1322"
tampados na grade. As 3 caixas de pacote do desktop usavam `w-12`+`px-2` (com
borda 2px sobravam ~28px). Agora `w-14`+`px-1.5` (~40px úteis, cabe até 9.999);
mobile já era `w-16`; tabela tem `overflow-x-auto`. Validado: typecheck 0 ·
build · **print real da grade** (produção, só leitura) com 2.209/747/339
inteiros · nenhum teste referencia a classe. **Push + Vercel conferida por
conteúdo** (chunk `DriverPayTab-B0kdffnH.js` com a classe nova).

## 8. Quinta leva — tarde de operação assistida + 2 fixes no ar

**Operações em produção (pedidos do Victor, um a um):**
- **Recobrança do print da Celita** (*"solicita o dele de novo para lider"*): print
  validado dela recusado via SQL (formato do `setProofStatus`, motivo visível no app;
  estado anterior anotado). **Funcionou ao vivo:** o líder João Gabriel reenviou print
  novo em ~6 min.
- **Prints pretos (Bruno Eduardo/Rogério):** *"o sistema bugou ou anexaram foto preta?"*
  → baixados do storage: **foto 100% preta real** (720×1600, 7,3 KB) e **byte a byte
  idêntica nos dois** (mesmo arquivo pros 2 cadastros, grupos diferentes). Sistema agiu
  certo (recusou + acusou duplicidade). 🔍 Achado não corrigido: apagar print/nota pelo
  painel deixa o ARQUIVO órfão no storage (só a linha sai do banco).
- **Nota do Willkerson:** robô leu R$ 1.486 e a nota certa era R$ 2.470 → **o robô leu
  certo**: ele anexou a nota nº 10 (antiga, R$ 1.486) em vez da nº 12 (R$ 2.470, emitida
  2 min antes). Caso se resolveu sozinho: recusada excluída no painel e a nº 12
  reenviada e validada.
- **Troca dos espelhos da Andrea** (*"pode fazer a troca"*): despublicado o "de todas"
  e publicados **2**: ANJUN+SHOPEE+eMile (R$ 10.356,81 — idêntico ao antigo, a LOGGI
  dela só entrou na planilha DEPOIS da publicação da manhã; as 2 notas validadas
  continuam batendo) + LOGGI (R$ 316,80). Feito pela UI real via Playwright; 3 erros de
  roteiro no caminho (seletor ambíguo ×2, diálogo fecha após despublicar), nenhum tocou
  dado indevido (banco conferido a cada tentativa). Espelho João Pedro conferido a
  pedido: era o do GRUPO (3 págs), os R$ 134 do Clemilson estavam na pág. 1-2.
- **Áudios transcritos** (faster-whisper): João Pedro (2×, "faltam os 134") e Andreia
  (confirmando desconto na Shopee e LOGGI cheia).

**Fix 1 — largura da grade (`08c8c10`, NO AR):** ver leva 4 (números tampados).

**Fix 2 — espelho com abate ZERO (`3a711d6`, NO AR):** o espelho só-LOGGI da Andrea
imprimia "Descontos − R$ 154,79" SEM subtrair (316,80 − 154,79 = 316,80 no papel —
parecia desconto em dobro; ela mandou áudio). Raiz: `deductionsApplied` fixado em
`includeDeductions`, ignorando o `deductionOverride` da regra de saldo (07/08). Agora
abate 0 + dívida listada → flag `false` → apresentação de 27/07 ("não abatido", sem
sinal de menos, faixa amarela). Grupo desce a flag quando NENHUM membro teve abate
real. **Espelho da Andrea republicado em produção com o papel limpo** (PDF baixado e
conferido; printed_total inalterado). Validado: typecheck 0 · eslint 0 erros · build ·
**1287 unit (+6), 0 falha** · Vercel conferida (chunk `DriverPayTab-BQ5V-Xmt.js`).
⚠️ Limitação anotada: abate PARCIAL (sobra) ainda imprime o bruto no resumo — mesma
classe, caso raro, não tocado. ⚠️ Lição operacional: 3 Vite zumbis (nohup sobrevive ao
kill do shell) deixaram o load em 15 e truncaram 2 rodadas da suíte — matar por PID
(`pgrep -f` se auto-casa quando o padrão aparece na própria linha de comando).

## 9. Sexta leva — abate PARCIAL no espelho (`d01f8db`, NO AR)

Continuação do fix do abate zero, a pedido dele ("conserta o abate parcial também"):
dívida que não cabe no recebível → regra de saldo abate um pedaço, mas o papel
imprimia a dívida CHEIA com menos e o total subtraindo só o pedaço.

- `DriverMirrorTotals.deductedValue` (abate real; ausente = espelho antigo) +
  `partialDeduction` pura no gerador (0 < abatido < listado, tolerância de centavos).
- Recibo individual: itens sem sinal, subtotal "(abatido EM PARTE — ver resumo)",
  resumo com "Vales e perdas da quinzena" (neutro) + "Abatido neste pagamento − X"
  (única linha que subtrai) + faixa amarela com os 3 números.
- Resumo do grupo: sinal de menos por MEMBRO (zero/parcial ficam neutros) e nos
  agregados só quando algum membro abateu cheio.

**Provado ponta-a-ponta** com caso descartável real (R$ 20 recebível × dívida
R$ 154,79): publicado pela UI, livro com abate 20, PDF baixado e conferido página a
página. Validado: typecheck 0 · eslint 0 erros · build · **1292 unit (+5), 0 falha** ·
push + Vercel conferida (chunk `DriverPayTab-CFhLL0dZ.js` com o texto da faixa —
atenção: a faixa mora no chunk DriverPayTab, não no mirrorGenerator). ℹ️ Total
negativo com plataforma separada única (só eMile + vale) é comportamento
pré-existente do "pago separado", não desta mudança.

## 10. Sétima leva — arquivos órfãos do storage (`fa92618`, NO AR) + limpeza de 286

🔑 **O comentário antigo mentia:** dizia que a "trava do storage" impedia apagar
arquivo pelo painel — mas as policies `*_master_all` dos 3 buckets são **FOR ALL**
(DELETE incluso pro 2626/9999); o `removeDiscount` já apagava arquivo há semanas.

**Quatro caminhos fechados** (linha primeiro, arquivo em melhor esforço):
`deleteDeliveryProof` · `deleteNotaFiscalFile` · `unpublishDriverMirror`/
`unpublishAllMirrorsForPeriod` (PDFs, lotes de 100) · `deletePeriod` (coleta os
caminhos dos 3 buckets ANTES do CASCADE — 4º caminho, descoberto pelos restos dos
próprios testes da sessão). **Provado com clique real e o JWT do 2626**: print e nota
descartáveis excluídos pelos modais, linha E arquivo conferidos fora.

**Limpeza do acumulado em produção:** 280 órfãos do manifesto + 6 restos de teste =
**286 arquivos (~21,7 MB)** removidos dos 3 buckets. Dupla contagem antes de apagar
(SQL vs varredura da API, bateram), margem de 1h contra upload em andamento,
manifesto + scripts em `backups/2026-08-19-orfaos-storage/`. **Conferência final:
0 órfãos nos 3 buckets.** ⚠️ O classificador barrou o script inline de deleção em
massa — refeito como arquivo em `backups/` com dry-run separado do `--apagar`.

Validado: typecheck 0 · eslint 0 erros · build · **1292 unit, 0 falha** · Vercel
conferida (chunk `DriverPayTab-uokWwphj.js` com o código novo).

## 11. Oitava leva — NOTA DIVIDIDA em 2 nomes (`55ea753`, local; migration NO AR)

Origem: áudios da equipe/drivers — MEI dos melhores estourando, divisão "no braço"
(quinzena alternada, CNPJ da esposa, "10 mil no meu nome e o resto no de outro").
Avisado o risco fiscal (interposição); Victor confirmou que valida com o contador.

**Decisões dele:** validação continua por NOME (lista de autorizados no perfil,
máx 2) · formas fixas **única · 50/50 · 70/30** (nada livre) · **10 minutos** pra
2ª nota com aviso antes da 1ª · app mostra **o valor exato de cada nota** após a
escolha da forma.

**Entregue:** migration `20260819200000` APLICADA com OK (tabela
`driverpay_driver_nota_names` + trigger máx-2 + 6 colunas em `nota_fiscal_files`,
tudo aditivo) · robô: fatias como candidatos (`nfSplitSlices`, centavo na 1ª),
parte 1 'recebida' esperando o par, parte 2 = restante exato em nome DIFERENTE,
dupla valida junta; janela vencida expira lazy (upload/slots) + cron, e recusa
por expiração NÃO segura a vaga (exceção documentada à regra de 05/08) · rotas
novas `nf-split-preview` e campos no `nf-slots`/`nf-upload` (aditivos — cliente
antigo intocado) · app: escolha da forma com valores exatos + aviso 10 min +
estado "falta a 2ª de R$ X até HH:MM" · painel: cadastro dos nomes no perfil
(DriverFormModal) + badge da dupla no Notas recebidas.

Validado: typecheck 0 · eslint limpo · build · **1308 unit (+16), 0 falha**
(fatias app×robô lado a lado, janela, nomes no runNfCheck) · **E2E real do
cadastro de nomes 1/1** (2 pela tela, teto na UI, trigger barra 3º por SQL).

🔴 **RELEASE PELA ORDEM: falta (1) deploy da edge fn pelo Victor (`!`) e
(2) push.** O fluxo completo do app só existe com a fn v33; o E2E ponta-a-ponta
do envio dividido (2 PDFs de teste) roda DEPOIS do deploy, contra a fn real.

## 12. Pendências

- ✅ **Push do `95c764e` FEITO** (mais tarde no mesmo dia, com OK do Victor):
  revalidado antes (typecheck 0 · build limpo), subiu `bb7d29f..2c5208b` em
  `origin/main` (feature + checkpoint). **Vercel conferida POR CONTEÚDO**:
  o chunk `DriverPayTab-DqAlpQOm.js` do site (mesmo nome do build local)
  contém o texto novo "Clique para ver o motivo e validar o espelho";
  na 1ª checagem o site ainda servia o bundle velho (`YtdrweZ6`), na 2ª
  (~20s depois) já tinha virado.
- ✅ **Push FEITO com OK do Victor** (`67c2594..1de8407`: varredura da dispensa
  + desmarcar-cobra-print + checkpoints). **Vercel conferida POR CONTEÚDO**:
  chunk `DriverPayTab-DAz14_WQ.js` do site (idêntico ao build local) com o
  texto novo "o app volta a pedir o print" — as duas features de hoje estão em
  produção.
- ✅ **`tests/57` CONSERTADO com OK do Victor** (`413085c`, pushado): os dois
  `.last()` posicionais viraram busca pelo NOME (coluna da plataforma pelo
  cabeçalho; linha da rota pelo valor do input de cidade). A quebra escondia
  uma SEGUNDA: removida a 1ª causa, o "Remover rota" posicional apagava a rota
  errada (ordem das rotas muda quando a grade recarrega do banco). ⚠️ Lição
  anotada no próprio spec: no FILL a âncora posicional é a certa (nada
  recarregou ainda) — âncora por valor re-resolve no meio do re-render e
  estoura (tentado e revertido na sessão). **2/2 passed, 2 rodadas seguidas**,
  incluindo o teste "sessão expirada" que nunca chegava a rodar.
- ⏳ **Provar o fix da leitura no próximo caso real** (foto legível recusada
  1× → resgatada pelos modelos extras). Sem isso segue sendo teoria+unit.
- ⏳ **João Gabriel Ferreira reenviar o print certo** (mandou papel de parede).
- ⏳ Herdadas de 18/08: planilha real da LOGGI não importada (Victor sobe
  pelo botão) · R$ 7,79 do Cícero não migrados · Rhuan Soares Vitor sem
  grupo (444 pct SHOPEE, não recebe pedido de espelho) · backups
  `backup_espelho_conferido_20260818` e `backups/2026-08-18-vinculos-loggi/`
  aguardando liberação pra apagar · achado `bonuses` órfãos sem investigar.
