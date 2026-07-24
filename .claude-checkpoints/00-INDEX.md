# 00-INDEX — Índice mestre dos checkpoints (LER PRIMEIRO ao abrir o projeto)

> Regra de leitura: **este índice + o último checkpoint de sessão** bastam para retomar.
> Só abra os outros arquivos quando o assunto pedir (a tabela diz qual).
> Última atualização: **2026-07-24** (tarde).

## 🎯 Estado atual (1 parágrafo)

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
bundle `index-Dr59Z_Qi`). Pendente: 2ª etapa (nota no nome do recebedor). Ver `CHECKPOINT_SESSAO_2026-07-24.md`.

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
| `CHECKPOINT_SESSAO_2026-07-24.md` | **Mais recente.** Leva LOGGI só-líder (3 republicados + 25 membros despublicados) · 39 PIX da planilha C6 · FEATURE recebedor diferente (commit `3820842`, migration em prod, relatórios com CHAVE PIX) · backups `backup_mirror_pub_20260724`/`backup_driver_pix_20260724` | 🟢 ATIVO |
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

## ⚠️ Áreas frágeis / pendências abertas

- 🟠 **Segurança driverpay:** exclusividade "2626" é client-side; RLS = `company_id OR sub IN (9999,2626)`; RPCs sem authz do chamador.
- 🟡 Bucket `driverpay-discount-proofs` público; sem trava server-side de `driverpay_periods`; `driverPayCalc.ts` sem termo Zapex.
- 🟡 Import com arquivos REAIS grandes nunca clicado até o fim (Shopee 132k só até a prévia; iMile 13k/Anjun 8k só fixtures).
- 🟡 tsc com 63 erros de baseline (fora do driverpay); `*.tsbuildinfo` fora do `.gitignore`.
- 🔵 Ponte Nova: aba driverpay existe mas dados zerados (só Caratinga populada).
