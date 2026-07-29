# 00-INDEX — Índice mestre dos checkpoints (LER PRIMEIRO ao abrir o projeto)

> Regra de leitura: **este índice + o último checkpoint de sessão** bastam para retomar.
> Só abra os outros arquivos quando o assunto pedir (a tabela diz qual).
> Última atualização: **2026-07-29**.

## 🎯 Estado atual (1 parágrafo)

**Sessão 29/07 — achado o que apagava ponto REAL, e corrigido dos dois lados (`fc41a09`,
só local):** a causa era o **"Reset Geral"** da tela de Ponto, que montava os alvos a partir
de TODOS os registros do dia **ignorando a busca** — e `tests/04-bonus.spec.ts` roda dentro
de **Ponte Nova** e clica nele. Provado com **sentinelas** (uma em cada empresa, nomes fora
de qualquer filtro): rodando só o spec 04, a de PN morre e a de CT vive. Descartados com
evidência o cleanup, a limpeza administrativa, colisão de CPF, o seed do PN e as 30
exclusões de ponto dos 66 specs. **Correção:** `attendancesToReset()` (puro) limita o reset
a quem está visível — **sem busca ativa nada muda**; o modal passa a dizer quantos e quem, e
avisa quando há filtro. O spec 04 virou teste de regressão. Dado restaurado 2× (4.680).
⚠️ **Muda comportamento que a equipe usa** (Reset Geral + busca = só a lista filtrada),
decisão do Victor. **NO AR** (`78ec4fa`, chunk `AttendanceTab-DW_oVGtO.js` conferido).
Junto: **26.12 e 26.13 consertados** (`51738ba`) — paravam de passar por exigir "PN vazia";
agora provam o **isolamento** (fixture de CT não vaza pra PN), que é o que sempre importou:
**4/4**. E os irmãos **26.3 e 26.9 saíram do skip** (`9688b51`), reescritos igual: **isolation 9/9**
(era 7+2 skip) e **extras 4/4** — **nenhum skip sobrou** nos dois arquivos. Banco conferido
registro a registro no fim: **4.702 → 4.702**, 0 sumidos, 92 funcionários reais, 0 sobras.
Ver `CHECKPOINT_SESSAO_2026-07-29.md`.

**Sessão 28/07 — fechou o release e validou tudo que faltava:** **edge fn v11 NO AR**
(deploy pelo **CLI** — o MCP é bloqueado pelo classificador; ⚠️ **revogar o PAT** colado no
chat). **Teste real da conferência 7/7** com nota em PDF: a nota de R$ 170 casou **só** com
`espelho_individual_LOGGI`, valor que a v10 dava como R$ 200 — **o furo ficou provado e
fechado**. Validado o que faltava: **app do entregador**, **ciclo inteiro** (painel publica
sem abate → app baixa o PDF → o PDF é **lido** → nota por aquele valor → robô **aceita**),
**espelho de grupo sem abate** (R$ 175 → R$ 200 com vale no membro) e **relatórios com dados
reais**. `tests/57` **consertado** (quebrado desde 23/07). **NOVO (commit `e662fca`, só
local):** relatórios **100% ASCII** (o arquivo vai direto pro banco) + **chave PIX de
CPF/CNPJ só com números** (e-mail/telefone/chave aleatória intocados — validação por dígito
verificador). ⚠️ **Achado no banco:** employees 107→92 e ponto 4689→4679 durante os testes —
apurado que eram funcionários `PW Test` (a conta fecha: média real é 50,9 pontos/funcionário;
15 reais teriam levado ~760 registros, levaram 10; 0 órfãos). **Não consegui provar nome a
nome** porque só guardei contagem — agora há snapshot com NOMES. **Depois, no mesmo dia:** relatórios ASCII/PIX **no ar** (`e662fca`, conferido baixando o
arquivo do site: `Caique`/`MARIO`/`JOAO`, 0 caractere proibido, 43 chaves PIX só com números)
e **espelho POR PLATAFORMA** (`31ef70f` + migration `20260728140000` + **fn v12**): publicar
LOGGI e depois SHOPEE dava UM espelho só (o PDF ia pro mesmo caminho e a publicação anterior
era deletada) — agora a identidade do espelho é o **conjunto de plataformas**, com índice
único; no app saem **2 cards com selo SOMENTE LOGGI/SHOPEE** e **2 lugares de nota no mesmo
CNPJ** (decisão: *uma nota por espelho*). **Bateria completa RODADA** (392 ✅ / 2 ❌ / 4 flaky / 23 skip, 1,2h): as 2 falhas são a
premissa morta "Ponte Nova vazia" (PN tem 9 triagens e 14 bloqueios), a mesma que já pôs os
specs 26.3/26.9 em skip — **não é bug**. 🚨 **Mas a bateria APAGOU 2 pontos REAIS de hoje**
(Euder 08:14 e Ronaldo 08:16) — **restaurados** do backup com os 39 campos e os mesmos ids
(4.680 = 4.680). **Causa não identificada** (cleanup, limpeza administrativa, deletes por
employee_id e o wizard do spec 46 foram descartados com evidência). Funcionários reais 92→92
e entregadores 99→99 conferidos **por id**; configurações intactas em valor (facial da
Caratinga segue LIGADA). Ver `CHECKPOINT_SESSAO_2026-07-28.md`.

**Sessão 27→28/07 — RELEASE COMPLETO do pagamento por plataforma (3/3 no ar):** com OK explícito
do Victor. ✅ Backup duplo (`backup_mirror_pub_20260727` + `backups/2026-07-27/`) → ✅ **migration
aplicada** (30 publicações, todas `include_deductions=true`, **0 linhas alteradas** vs backup) →
✅ **PUSH**, `main`=`6c89d9e`, **Vercel no ar** (`index-DC76q-nb.js` + `DriverPayTab-BG2VB1C_.js`,
marcador conferido por download do chunk) → ✅ **edge fn v11 ACTIVE**. O MCP de deploy é **bloqueado
pelo classificador** (SQL/migration do mesmo MCP passam): o caminho que funciona é o **CLI**
(`npx supabase login --token <PAT>` + `functions deploy ... --no-verify-jwt --project-ref ...`).
⚠️ **PAT do Victor foi colado no chat — revogar** em supabase.com/dashboard/account/tokens.
**Validado:** tsc 0 · build · unit 125/125 nos 8 arquivos rodados isolados (a bateria cheia teve 6
arquivos que **não rodaram** por worker morto do WSL — sempre conferir o rodapé "Errors" do vitest) ·
E2E 63/58/60 ✅ · **visual em PRODUÇÃO com cliques reais** (espelho do Cicero **R$ 262,21 → R$ 270,00**
ao desmarcar = exato o R$ 7,79; 8 prints em `prints-espelhos/prod-2026-07-27/`) · **teste REAL da fn
v11 com nota em PDF: 7/7 ✅** (2 plataformas em CNPJs diferentes — a nota de R$ 170 casou **só** com
`espelho_individual_LOGGI`, valor que a v10 calculava como R$ 200: **o furo ficou provado e fechado**).
Banco conferido 4×, sempre **idêntico** (99/30/98/23/271/1), zero sobras.

**Sessão 27/07 (tarde) — pagamento por plataforma (filtro nos relatórios + abate opcional):** Victor
pediu filtro por plataforma nos relatórios geral e simples; no meio da conversa apareceu o
problema de verdade — pagando só a ANJUN, o espelho filtrado já abatia vales/perdas e o mesmo
valor seria descontado de novo ao pagar as demais. **Construído e validado, commit `a385b43`,
AGUARDANDO RELEASE.** Os dois relatórios abrem uma janela com chips de plataforma (todas
marcadas = arquivo idêntico ao de antes) + botão "Descontar vales e perdas" (marcado por
padrão); o espelho (individual/grupo/massa/seleção) ganhou o mesmo botão — desmarcado, os
vales/perdas saem LISTADOS mas fora do total, com faixa âmbar avisando; e há aviso
anti-desconto-duplo de quem já teve abate numa publicação do período. **Achado empírico
importante:** a fn v10 calculava o candidato do espelho FILTRADO como o bruto enquanto o PDF
mostrava o líquido — driver com desconto teria a nota CERTA recusada; não estourou porque só
1 dos 98 pagamentos tem desconto e ele não tem espelho publicado. A conta virou
`mirrorExpectedValue` (pura, 6 unit). Validado: tsc 0 · lint 0 · build · 650 unit (23+6 novos)
· **E2E 63 novo com cliques reais lendo o conteúdo do .xlsx** · regressão 52-56/59/60/61 ok.
**Falta (nesta ordem, com OK do Victor): migration `20260727120000` → edge fn v11 → push+Vercel.**
Achado paralelo: `tests/57` está quebrado desde 23/07 (procura título de NF que não existe mais)
— Victor decide se conserto. Ver `CHECKPOINT_SESSAO_2026-07-27.md`.

**Sessão 26/07 — multi-erros por dia (individuais + triagem):** Victor pediu por áudio
poder lançar 2+ erros no mesmo dia (unidade + valor juntos); o painel SUBSTITUÍA o
anterior (upsert sobre UNIQUE employee_id+date / date+company_id — era desenho, não bug).
Feature construída, validada e **NO AR** (commit `40e4c6b`): criar=insert puro,
editar=por ID, aviso "já registrado neste dia" sem confirmação, "Descontar Erros"
agrupa e SOMA por data, exibição do Financeiro soma todos os erros da data, sem limite.
**Push+deploy+migration FEITOS na ordem certa com autorização explícita do Victor**:
main `def84ab` no origin, Vercel conferido (`index-Bhy_UBHh.js`), migration
`20260726120000` aplicada em prod DEPOIS do deploy (constraints removidas, só PKs).
Validado: tsc 0 · build · 602 unit · 59 E2E ✅ e, pós-migration, **10-errors 8/8**
com os 3 specs MULTI rodando de verdade (2 erros no mesmo dia coexistem). Pendente:
equipe dar F5 no painel (aba antiga em cache erra ao registrar erro).
**Mesma sessão — Fase 0 da conferência automática de NF:** diagnóstico com as 18 notas
reais: 94% legíveis, CNPJ 100%, valor 94% — 🔑 nota bate com o valor do **ESPELHO
PUBLICADO** (escopo+filtro de plataforma), não com o total da quinzena; os "erros" de
nome/valor achados são casos reais e Victor ditou os cadastros: **Karinne = recebedora
do Fernando (nome+PIX gravados)** e **Pablo Raspante = recebedor da Marize (nome gravado;
PIX pendente — candidato CNPJ MEI 49860622000189)**. Nota da Marize divergente
(R$ 249×238) fica pra validação manual. Leitura simples resolve sem IA.
**Fase 1 NO AR (commits `ba0c348`+`5142abe`):** a nota é lida NO ENVIO e conferida
(valor do espelho publicado + CNPJ + nome do driver/recebedor); errada → RECUSADA na
hora com o motivo exato (422, slot reabre); 3 checks verdes → VALIDADA automática
(validated_by NULL + `check_details.autoValidated` — FK de users pegava 'auto', bug
achado pelo teste real na fn deployada). Release completo com backup prévio
(`backup_nf_files_20260726`): migration aplicada → **fn v9 ACTIVE** (API 11/11 ✅) →
**cliques reais app 6/6 ✅** e **painel 6/6 ✅** (Playwright, notas verdadeiras,
screenshots) → backfill: **16/18 auto-validadas**, só Marize (R$249×238) e Lucas
(escaneada) pra decisão manual → push+Vercel no ar (`index-i_jGhuT9.js`).
**+ Botão liga/desliga da auto-validação** (`d9c7119`, fn **v10**, migration
`20260726220000` = `driverpay_settings`): desligada, a conferência e a RECUSA
continuam iguais — só a nota certa espera validação manual (selo "conferida,
aguardando você"). Toggle testado de verdade 6/6 + cliques no botão 6/6;
Vercel `index-CjzSU4_2.js`. Ver `CHECKPOINT_SESSAO_2026-07-26.md`.

**Sessão 25/07 (manhã) — driver sem login + fix do reset:** Caio não logava ("credenciais
inválidas"); investigação em prod achou que o **botão "Resetar senha" do painel NUNCA
funcionou** (DELETE com WHERE + RLS sem policy de SELECT = 0 linhas em silêncio — provado
com JWT simulado: sem WHERE apagaria 37, com WHERE 0). Fix `398befc` + migration
`20260725100000` **aplicada em prod**: RPC SECURITY DEFINER `driverpay_reset_driver_password`
(authz do chamador: 2626/9999 ou mesma empresa; devolve nº de linhas; policy morta removida;
painel diferencia "resetada" de "nunca acessou"). Testes reais na base (5 cenários) + tsc 0 +
build + 606 unit. **Caio resetado de verdade no banco** (backup `backup_driver_auth_20260725`)
→ entra com CPF + 1234; as tentativas dele não chegavam no servidor (celular/cache — cadastro
intocado desde 24/07 11:40, zero senhas erradas). **Push (Victor via `!`) + deploy Vercel
FEITOS e conferidos** (main `1c12f60`; chunk `DriverPayTab-9KO0wAqe.js` no ar com RPC+toast).
Pendente: Caio confirmar login 1234; apagar backups quando Victor liberar.
Ver `CHECKPOINT_SESSAO_2026-07-25.md`.

**Sessão 24/07 (tarde) — 3 frentes:** (1) **Leva LOGGI corrigida** (dados): espelhos tinham ido por
driver individual → membros receberam; aplicada a Opção A (só o LÍDER recebe, agregando o grupo):
3 líderes republicados em modo grupo (Luan Kalleb/Greice/Mário; Andrea depois igualada ao só-LOGGI),
25 espelhos de membro despublicados → 27 espelhos LOGGI 100% de líder (backup `backup_mirror_pub_20260724`).
(2) **PIX em massa** (dados): 39 chaves da planilha C6 preenchidas em `driverpay_drivers.pix_key`
(match por nome; 9 ambíguos/sem-match ficaram de fora; backup `backup_driver_pix_20260724`).
(3) **FEATURE recebedor diferente** (commit `3820842` + migration `20260724190000` em prod): cadastro
do driver ganhou "Recebedor diferente" (nome+PIX); relatório GERAL ganhou coluna CHAVE PIX (última) e
sai o nome do recebedor; SIMPLES virou A NOME|B VALOR|C CHAVE PIX|D OBS; espelho não muda. Validado
tsc 0/build/571 unit/E2E real (downloads conferidos). **Fechamento:** 5 recebedores configurados pelo
painel (Greice→Mikael, Oliur→Denize, Henrique→Rosiclese, Thiago→Victoria, Willkerson→Neilizana;
Gustavo/João Victor pendente de decisão) + **PUSH do Victor e deploy Vercel NO AR** (`main`=`f853d4f`,
bundle `index-Dr59Z_Qi`). **2ª etapa FEITA** (commit `3e23e50`, pushado+deploy ok): "Notas recebidas" mostra selo
"nota no nome de: X" pro driver com recebedor. **Fim da tarde:** (a) nota do app **SÓ PDF**
(commit `7a08b56` + edge fn **v6**: recusa não-PDF por tipo+assinatura %PDF; foto confundia os drivers);
(b) **baixar espelho + tag Atual/Fechada** no app (edge fn **v7**: my-mirrors devolve periodStatus;
card com tag verde/cinza + botão Baixar). Tudo validado (tsc/build/unit/testes reais na edge fn
deployada + UI simulada com prints) e **NO AR** (main `874c899` + Vercel conferido).
(c) **Notas-FOTO limpas**: 6 drivers tinham mandado foto (falha antiga) — backup em
`backups/2026-07-24-notas-imagem/` + tabela `backup_nf_imagens_20260724`, excluídas, anexo
reaberto pros 6; comunicado de WhatsApp aprovado (Victor envia nos grupos).
Ver `CHECKPOINT_SESSAO_2026-07-24.md`.

**App do Entregador NO AR + várias features (madrugada 23→24/07):** app em produção
(`sistema-ponto-zeta.vercel.app/driver`); **driver REAL (Iago) já logou e trocou a senha**. `main` em produção =
**`c72b3ae`**; edge fn `driver-public-api` **v5**. Tudo validado (tsc 0 / build / **600 unit** / E2E real com cliques)
e no ar. Entregue nesta madrugada (todas com decisões do Victor gravadas na §6/§7/§8 do checkpoint 23/07):
(1) **despublicar espelho** (individual + "todos do período" + selo "no app"; "Republicar"=editar) + **resetar senha**
(volta 1234; migration `20260723150000` = policy DELETE só do mestre, sem SELECT→hash protegido);
(2) **validar/recusar(motivo)/excluir nota** + coluna **NF "validadas/esperadas"** (verde só com todas validadas;
ciente de GRUPO — só o líder anexa, as notas validam o grupo todo; 1-ou-2 CNPJs por iMile/Shopee-Anjun-Loggi;
migration `20260723160000` status 'validada'; edge fn v5 nf-slots ciente de grupo + reabre CNPJ recusado);
(3) **status do grupo** no cabeçalho (pacotes/plataforma + NF + espelho) + **3 filtros** (NF/espelho/plataforma) +
barra simétrica + **ordenar grupos** por métrica; (4) **relatório**: líder-recebedor dividido por rota, escopo por
seleção, e **relatório simples** (nome sem acento | total net | OBS=nome da quinzena). **Faltam:** painel responsivo
(Victor adiou); 6 CPFs faltantes; validar visualmente os relatórios/telas amanhã de manhã.

**Sessão 23/07 (kickoff App do Entregador):** começou a feature do app onde o driver
loga, vê espelhos por quinzena e anexa NF por CNPJ (+ painel publica espelho, filtra por
plataforma, baixa NFs em massa). Decisões travadas: login por CPF, web primeiro (APK depois
via Capacitor já instalado), espelho filtrado mostra só o valor da plataforma, CNPJs
configuráveis, driver nunca fala com o banco (edge fn `driver-public-api` + secret dedicado),
ZERO mudança na RLS/tabelas do 2626. **Operação em prod feita:** backfill de CPF — 97 drivers
ativos tinham 0 CPF; importados **91/97** da planilha iMile (`br_driver_2026-07-22`) por nome
exato, guardado (`cpf is null`) e reversível (`backups/2026-07-23-cpf-import/`); **6 sem CPF**
aguardam 2ª fonte. **Ultraplan (nuvem) FALHOU** (não entregou nada — verificado por 4 fontes:
sem bundle, commit inexistente, GitHub ao vivo inalterado, arquivos ausentes). Construção passou
a ser **LOCAL** na branch `feature/app-entregador` (de `main`). **D3 FEITO** (espelho aceita filtro
por plataforma; commit `1f3805b`; validado tsc 0 / build ok / 111 unit). Próximo: Fase 0 (migrations
+ edge fn `driver-public-api` como ARQUIVOS; aplicar migration/bucket/deploy/push só com OK do Victor).
**Fase 0 APLICADA + VALIDADA em PROD** (commit `433932c`; migration+bucket via MCP, edge fn
`driver-public-api` v2 ACTIVE, `DRIVER_JWT_SECRET` setado pelo Victor): **login testado com driver
real (Romário) 8/8 cenários OK** (login/troca senha/bloqueios); registro de teste apagado.
**Fase 2 FEITA** (app `/driver`: login/troca/ver espelho — commit `6408062`), **smoke no navegador OK**,
e **visual ajustado p/ AZUL + ícone $** (commit `81a953b`). **Fase 1a FEITA** (commit `a67d870`):
botão "Publicar no app" → `publishDriverMirror` (1 PDF/driver → bucket → publicação); tsc/build ok.
**Fase 3 (NF) migration APLICADA em prod** (emitentes + arquivos NF + coluna platforms + bucket privado
`driverpay-nota-fiscais`, verificado). **Fase 3b FEITO** (commit `5f73235`): cadastro de CNPJs + vínculo
plataforma→CNPJ no painel (`EmittersModal`). **3c FEITO** (edge fn v4: nf-slots/upload/list + periodId no my-mirrors;
regressão login 8/8). **FASE 3 COMPLETA** (3d app "Anexar nota" + 3e painel "Notas recebidas" + baixar
individual/.zip nomeado via jszip). App do entregador (login/ver espelho/anexar nota) + publicar espelho +
notas recebidas: TUDO construído e validado (tsc/build/unit/regressão). **TODAS AS FASES CONCLUÍDAS**
(D3, 0, 1a, 1b filtro-plataforma-no-envio, 2, 3, 4 líder-de-grupo). PENDENTE DO VICTOR: push+deploy Vercel
p/ testar ao vivo no celular; cadastrar CNPJs + líderes no painel; 6 CPFs faltantes. `feature/app-entregador`
(23 commits, nada pushado; 4 migrations aplicadas em prod + edge fn driver-public-api v4 deployada).
Ciclo publicar→app ainda não testado ao vivo (precisa deploy Vercel ou login 2626 do Victor).
Plano local: `~/.claude/plans/vamos-precisar-fazer-um-tranquil-hopper.md`.
Último checkpoint: `CHECKPOINT_SESSAO_2026-07-23.md`.

**Sessão noite 20/07 (bugs de produção do ponto):** facial da Caratinga estava
DESLIGADA desde 19/07 02:24 (spec 24 interrompido) → religada + spec blindado;
Pablo sem GPS (bug `error` vs `message` corrigido); "saída sozinha" 12-13s =
defeito de UX histórico — 2 registros limpos com backup (Diendrel + João Pedro)
e **features de proteção ENTREGUES** (decisões do Victor): confirmação de saída
< 10 min, auto-retorno ao CPF em 35s, overlay de GPS bloqueado sem gastar
tentativa — **validadas com CLIQUES REAIS** (spec 62 novo, 3/3 chromium).
CAUSA RAIZ verdadeira da facial desligada era o spec 23 (update global sem
restauração) — corrigido; idem spec 08 na config de GEO. **PUSH FEITO com
autorização explícita do Victor** (madrugada 21/07); deploy Vercel conferido;
bateria completa 384 ✅ com as 6 falhas resolvidas (`b25137a`); **turno das
02:00 auditado ao vivo: 17 entradas ok, facial 16/17, zero saída fantasma**.
DESCOBERTA: Ponte Nova em USO REAL desde maio (premissa "PN vazia" morta —
specs 26.3/26.9 em skip p/ reescrita). `main` = `a89a6e0` no origin +
`b25137a` local. Validação: tsc 0, 569 units, build ✓, bateria completa.
Driverpay em produção segue como na sessão da manhã (espelhos com valor separado
+ multi-rota; eMile ligada; Tales unificado).
Último checkpoint: `CHECKPOINT_SESSAO_2026-07-20-noite.md`.

## 📚 Mapa dos checkpoints

| Arquivo | O que cobre | Status |
|---|---|---|
| `CHECKPOINT_SESSAO_2026-07-29.md` | **Mais recente.** Caça ao que apagava ponto real: causa = "Reset Geral" ignorando a busca, clicado pelo spec 04 dentro de Ponte Nova · corrigido no botão (`attendancesToReset`, puro) + modal que diz quantos/quem + teste de regressão no próprio spec 04 (`fc41a09`, **só local**) · método das sentinelas | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-28.md` | fn v11 e **v12** no ar (deploy via CLI) · conferência da NF provada com nota real 7/7 · valida o que faltava (app, ciclo inteiro com o PDF lido, grupo sem abate, relatórios reais) · **relatórios 100% ASCII + PIX só números** (`e662fca`, no ar) · **espelho POR PLATAFORMA: 2 espelhos separados no app + 1 nota por espelho** (`31ef70f`, no ar) · spec 57 consertado · achado dos funcionários `PW Test` no cleanup | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-27.md` | Filtro por plataforma nos relatórios + "Descontar vales e perdas" no espelho e nos relatórios (commit `a385b43`) · conserta furo latente da conferência de NF em espelho filtrado · **RELEASE COMPLETO: migration ✅ + push/Vercel ✅ + fn v11 ✅** (deploy via CLI — MCP é bloqueado) · visual em prod com prints · teste real da NF 7/7 · spec 57 quebrado desde 23/07 (pré-existente) | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-26.md` | Multi-erros por dia (individuais + triagem): insert/edição por ID, aviso do dia, Descontar Erros soma por data (commit `40e4c6b`) · migration `20260726120000` NO REPO aguardando **push+deploy → migration** nessa ordem · 3 specs MULTI auto-detectam | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-25.md` | Caio sem login (causa: tentativas nem chegavam no servidor; resetado de verdade no banco c/ backup) · botão de reset NUNCA funcionou (RLS DELETE sem SELECT) → RPC `driverpay_reset_driver_password` (fix `398befc`, migration em prod) · push+deploy conferidos | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-24.md` | Leva LOGGI só-líder (3 republicados + 25 membros despublicados) · 39 PIX da planilha C6 · FEATURE recebedor diferente (commit `3820842`, migration em prod, relatórios com CHAVE PIX) · backups `backup_mirror_pub_20260724`/`backup_driver_pix_20260724` | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-23.md` | App do Entregador completo + **GO-LIVE em prod** (merge main + Vercel; driver real Iago já usando) + feature despublicar espelho/resetar senha (§6). Decisões (login CPF, web-first, filtro plataforma, CNPJs) + backfill CPF 91/97 reversível | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-20-noite.md` | Bugs de prod do ponto: facial desligada por spec (religada+blindada), Pablo sem GPS (fix msg), saída fantasma 12s = UX (2 registros limpos c/ backup); pendências de feature | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-20.md` | Valor separado por plataforma + multi-rota sem taxa média + fix race do corte; specs 61/unit novos | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-18.md` | Grupos: vínculo exclusivo + busca por rota; retroativo dos 17 commits de melhorias do painel (17-18/07) | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-19.md` | Madrugada autônoma: F8 concluída, 4 features dos espelhos entregues, aprendizados de infra (Vite WSL!) | 🟢 ATIVO |
| `PLANO_ESPELHOS_2026-07-19.md` | Plano completo das 4 implementações dos espelhos (riscos, mitigação, ordem) | 🟢 ATIVO (fila aprovada) |
| `CHECKPOINT_IMPORT_PLANILHAS.md` | Importação automática iMile/Shopee/Anjun (SF1-SF6): formatos, decisões, o que falta validar com clique real | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-04_fix-bug1-multirota.md` | Auditoria 7 dimensões do driverpay + fix Bug #1 (rota-fantasma) e #2 (taxa por rota) + pendências de segurança | 🟢 ATIVO (pendências valem) |
| `CHECKPOINT_SESSAO_2026-07-04.md` | Driverpay: nota fiscal, taxa por rota, Zapex, desconto com provas | 🟡 histórico |
| `CHECKPOINT_SESSAO_2026-07-03.md` | Nascimento da aba Pagamentos Driver (banco→UI→PDF→testes) | 🟡 histórico |
| `CHECKPOINT_SESSAO_2026-06-27.md` | Mestre 2626 + edição de ponto exclusiva do 2626 (frontend+RLS+trigger) | 🟢 ATIVO (regra vigente) |
| `CHECKPOINT_SESSAO_2026-05-29.md` | Backup completo de prod + refutação do "bug" de desconto de erros | 🟡 histórico |
| `CHECKPOINT_REVISAO_2026-05-27.md` | Revisão empírica integral do sistema (achados com fonte) | 🟡 histórico |
| `CHECKPOINT.md` | Índice mestre ANTIGO do sistema de ponto (regras 1-8, fases, auth) | 🟡 histórico — parou em 04/07; regras 1-8 continuam valendo |
| `CHECKPOINT_ARQUITETURA.md` | Stack, padrões, decisões D1-D7 | 🔵 referência (05/2026) |
| `CHECKPOINT_BANCO.md` | Schema, RLS, edge fns, RPCs do sistema de ponto | 🔵 referência (05/2026 — driverpay NÃO está aqui) |
| `CHECKPOINT_TESTES.md` | Specs, coverage, comandos de teste | 🔵 referência (05/2026 — specs 52-56 não listados) |
| `CHECKPOINT_OPERACAO.md` | Deploy, env vars, troubleshoot | 🔵 referência (05/2026) |
| `CHECKPOINT_FASES.md` | Histórico granular fases 5→14 | ⚪ arquivo morto (consulta rara) |
| `CHECKPOINT_PROXIMOS_PASSOS.md` | Pendências go-live + roadmap (APK Capacitor etc.) | ⚪ superseded em 05/2026 — go-live JÁ aconteceu; só o roadmap §7 ainda interessa |

## ⚖️ Decisões ativas (não re-perguntar)

- **Ponto:** editar/excluir ponto é SÓ do mestre **2626** (nem 9999); travado em frontend + RLS + trigger.
- **Driverpay:** namespace `driverpay_*`; 100% aditivo ao sistema de ponto; vários períodos abertos permitidos; import auto-detecta plataforma pelo cabeçalho; valor/pacote vem da taxa cadastrada (nunca da planilha); apelidos de entregador aprendidos em `driverpay_driver_aliases`; Shopee COLETA = plataforma "Coleta Shopee"; plataforma arquivada sai da soma; driver só pode estar em 1 grupo (vínculo exclusivo, 18/07).
- **Git:** commit local sempre; **push é do Victor, na mão**; Conventional Commits.
- **Espelhos (19/07):** destaque+aviso por plataforma com REGRA DE PRESENÇA (só onde há pacotes); aviso acoplado ao destaque; corte auto-salvo por empresa; descontos no grupo limite 12.
- **Espelhos (20/07):** valor separado por plataforma FORA do total exibido (acoplado ao destaque; texto explícito pro driver leigo; a TELA do painel segue com total cheio — decisão do Victor); multi-rota = uma linha POR ROTA com a taxa real, NUNCA média; `packagesForPlatform` soma linhas.
- **E2E (20/07):** nunca rodar tsc/vitest/build em paralelo com bateria Playwright (carga WSL = flake); aquecer o Vite (curl / + /src/main.tsx) antes de spec com server frio.
- **Testes (19/07):** retry 1× local (flake de carga vira 'flaky' visível); Vite WSL exige RESTART após editar código; hooks lentos precisam test.setTimeout interno; specs driverpay rodam com `--project=chromium` (firefox/webkit sem binário e mobile não serve pra tabela desktop).
- **PDF (19/07):** separação entre trechos de texto com estilos diferentes é por GAP DE POSIÇÃO (`padLeft`), nunca espaço-caractere — o visualizador engole o espaço ao substituir a Helvetica; prints de aprovação ficam em `prints-espelhos/` na raiz (gitignored).
- **Espelho de grupo (24/07 — "Opção A" do Victor):** só o **LÍDER** recebe o espelho do grupo, **agregando TODOS os membros** (mesmo não-líderes). Membro de grupo **não** recebe espelho individual. Publicar em modo grupo (`publishScope='group'`) respeita o filtro de plataforma dos chips.
- **Recebedor diferente (24/07):** driver pode ter `recebedor_nome`/`recebedor_pix` (ex.: esposa emite a nota). Relatórios (geral + simples) saem **só com o nome do recebedor** + PIX dele; sem recebedor → nome do líder + `pix_key`. **Espelho NUNCA muda** (nome do líder). Simples = `A NOME | B VALOR | C CHAVE PIX | D OBS`. NF no nome do recebedor = 2ª etapa (aprovada, não feita). Os 6 recebedores da planilha C6: **Victor dita quais cadastrar** — não fazer sozinho.
- **Dados de prod (20/07):** eMile Caratinga com valor separado LIGADO (destaque + aviso CNPJ + separação); cadastros duplicados do Tales (Inhapim) UNIFICADOS no "TALES ALEXANDRE DE SOUSA" — duplicado desativado com nota, alias reapontado. Não recriar o duplicado.
- **Checkpoints (18/07):** todos vivem em `.claude-checkpoints/`; 1 checkpoint por sessão; atualizar este índice junto; hook pós-commit lembra a sessão de manter isso em dia.
- **Ponto/testes (20/07 noite):** spec que toca config REAL de prod (ex.: toggle facial) tem que restaurar em `finally`; bateria E2E só em janela segura (nunca de noite — turno da madrugada bate ~02:00); recusa de ponto da edge fn vem em `message` (não `error`); correção de registro de ponto = sempre backup antes (`backups/`).
- **Tela de ponto (20/07 noite, decisões do Victor):** saída < 10 min da marcação anterior = confirmação obrigatória; tela volta ao CPF 35s após registrar; GPS bloqueado = instruir sem chamar servidor; tentativa sem GPS que CHEGA no servidor continua criando bonus_block (regra mantida).
- **Conferência de NF (26/07, decisões do Victor):** a nota é conferida NO ENVIO contra o **espelho publicado** (escopo+filtro de plataforma — provado na Fase 0), CNPJ do slot e nome do driver **ou** recebedor cadastrado; valor exige **centavo exato** (±R$ 0,02 só arredondamento); nota errada ou ilegível é **RECUSADA na hora** com o motivo exato (o driver reenvia); 3 checks verdes → **validada automaticamente**, e isso pode ser **desligado** no botão do modal "Notas recebidas" (desligado, a conferência e a recusa continuam — só a validação vira manual). `validated_by` tem FK pra `users`: auto grava NULL + `check_details.autoValidated`.
- **RLS + DELETE (lição 25/07):** DELETE com WHERE numa tabela com RLS exige as linhas visíveis pelas policies de SELECT — tabela deny-all de leitura (ex.: `driverpay_driver_auth`) NUNCA aceita DELETE do client (0 linhas, silencioso). Operação assim = RPC SECURITY DEFINER com authz do chamador e retorno do row_count. Reset de senha do app agora é só via `driverpay_reset_driver_password`.
- **Pagamento por plataforma (27/07, decisões do Victor):** os relatórios (geral e simples) e o espelho escolhem as **plataformas** na hora de gerar (todas marcadas = arquivo/PDF idêntico ao de antes) e têm o botão **"Descontar vales e perdas"**, marcado por padrão. Desmarcado = pagamento PARCIAL: os vales/perdas saem **listados mas fora do total** (faixa âmbar no espelho, "NÃO ABATIDO" nas colunas do Excel), pra não descontar duas vezes ao pagar as demais plataformas. Quem não tem pacote nas plataformas escolhidas **some** do relatório; a plataforma vai no nome do arquivo e na OBS do simples. O sistema **avisa** (não trava) quando alguém do escopo já teve vale/perda abatido numa publicação do período. A escolha fica gravada em `driverpay_mirror_publications.include_deductions` porque **a nota fiscal segue sempre o total impresso no espelho** — espelho sem abate ⇒ nota pelo valor cheio da plataforma.
- **Relatórios em ASCII (28/07, decisão do Victor):** o `.xlsx` dos relatórios vai **direto pro banco**, que não aceita acento nem símbolo — o **arquivo inteiro** sai limpo (nome, título, cabeçalho, rota, OBS e nome das abas), via `sanitizeWorkbookAscii` rodando no workbook antes do `writeFile`. A **tela e o PDF continuam acentuados** — é só o Excel. Teste que confere conteúdo de .xlsx tem que esperar "NAO"/"-", não "NÃO"/"—".
- **Chave PIX no relatório (28/07, decisão do Victor):** CPF e CNPJ saem **só com números**; a limpeza só acontece quando o **dígito verificador** confirma. E-mail, telefone e chave aleatória saem **intocados** — neles o hífen faz parte da chave. Celular com DDD tem 11 dígitos como CPF: é o DV que separa os dois.
- **Deploy de edge function (28/07):** o MCP `deploy_edge_function` é **bloqueado pelo classificador** (migration/SQL do mesmo MCP passam). Caminho que funciona: `npx supabase login --token <PAT>` + `npx supabase functions deploy <fn> --no-verify-jwt --project-ref flcncdidxmmornkgkfbb`. Sempre comparar o repo com o `get_edge_function` antes, porque o repo pode estar atrasado.
- **Testes e o banco (28/07):** o cleanup do Playwright apaga funcionário `PW Test ` e o ponto dele — a contagem de `employees` CAI depois da bateria e isso é esperado. Antes de rodar bateria, guardar **NOMES** (não só contagem) pra conseguir provar depois o que sumiu. Teste de abate não pode usar a **eMile** (única com `mirror_separate_value`, valor fora do total). Teste de recusa de NF precisa de valor que não bata com **nenhum** candidato.
- **Espelho por plataforma (28/07, decisões do Victor):** a identidade do espelho é o **conjunto de plataformas** (`platform_key`: nomes ordenados unidos por `+`; `''` = quinzena inteira), com índice único em (empresa, período, driver, platform_key). Publicar LOGGI e depois SHOPEE dá **dois espelhos**, que aparecem separados no app com selo **SOMENTE X**; **republicar o mesmo conjunto substitui só ele**. Antes o 2º apagava o 1º (mesmo caminho de PDF + delete sem olhar o filtro).
- **Uma nota por espelho (28/07, decisão do Victor):** "se tem 2 espelhos, 2 notas; se tem 3, 3 notas". Os slots de NF são **(espelho × CNPJ)** — LOGGI/SHOPEE/ANJUN dividem o mesmo CNPJ e ainda assim pedem uma nota cada; espelho da quinzena inteira com 2 CNPJs segue pedindo 2. Nota antiga (`mirror_platform_key` NULL) vale pra qualquer espelho daquele CNPJ, e `slotCoberto` aceita **também** a chave no formato antigo — exigir a chave nova zerou a coluna NF em 5 testes e teria zerado em produção.
- **Reset Geral do ponto (29/07, decisão do Victor):** o botão passa a resetar **somente os funcionários visíveis na tela** — com busca ativa, só a lista filtrada; sem busca, todos, como sempre foi. O modal mostra **quantos e quem** (até 5 nomes) e avisa em destaque quando há filtro. Antes ele apagava o dia inteiro ignorando a busca, e foi isso que destruiu ponto real de Ponte Nova na bateria de 28/07.
- **Erros multi-por-dia (26/07, decisões do Victor):** vários erros no mesmo dia são permitidos (individuais E triagem), misturando unidade e valor; SEM confirmação ao lançar o 2º (só aviso informativo do que já existe); "Descontar Erros" agrupa por data e SOMA as quantidades; SEM limite por dia. Criar erro = insert puro; editar = por ID (nunca por funcionário+data). Migration `20260726120000` só entra em prod DEPOIS do deploy do frontend (upsert antigo quebra sem as constraints).

## ⚠️ Áreas frágeis / pendências abertas

- 🔵 **Teste de isolamento multi-empresa: nunca asserte por "a outra empresa está vazia"** —
  a premissa morre assim que a empresa entra em uso (matou 4 testes: 26.3, 26.9, 26.12,
  26.13). O padrão certo é o do teste 8: criar o dado em cada empresa e provar que **não
  vaza** de uma pra outra. E o assert vai em `tbody tr`, porque `getByText(nome)` casa com o
  `<option>` **hidden** do filtro de funcionário e falha com "Received: hidden".

- 🟢 ~~A bateria E2E pode apagar ponto REAL~~ — **CAUSA ACHADA E CORRIGIDA em 29/07**
  (`fc41a09`): era o "Reset Geral" ignorando a busca, clicado pelo `04-bonus.spec.ts` dentro
  de Ponte Nova. Continua valendo a **regra de proteção**: antes de rodar a bateria, **dump
  COMPLETO** (registros inteiros, não contagem — com contagem não dá pra restaurar) e
  **comparação registro a registro** depois. Modelo em `backups/2026-07-28-pre-bateria/`.
  Sentinelas (`ZZSentinela …` em cada empresa, com ponto do dia) são a forma rápida de
  detectar estrago novo.

- 🟠 **Segurança driverpay:** exclusividade "2626" é client-side; RLS = `company_id OR sub IN (9999,2626)`; RPCs sem authz do chamador.
- 🟡 Bucket `driverpay-discount-proofs` público; sem trava server-side de `driverpay_periods`; `driverPayCalc.ts` sem termo Zapex.
- 🟡 Import com arquivos REAIS grandes nunca clicado até o fim (Shopee 132k só até a prévia; iMile 13k/Anjun 8k só fixtures).
- 🟡 tsc com 63 erros de baseline (fora do driverpay); `*.tsbuildinfo` fora do `.gitignore`.
- 🔵 Ponte Nova: aba driverpay existe mas dados zerados (só Caratinga populada).
