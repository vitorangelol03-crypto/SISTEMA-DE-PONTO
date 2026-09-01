# CHECKPOINT_SESSAO_2026-08-31.md

> Pedido do Victor: *"resolver todas essas pendências pra preparar o sistema pra novas
> implementações"* + ditou o **roadmap** (facial+geo sem brecha, 4 batidas, ponto só em
> tablet, facial sem CPF com ordem automática, fora da empresa só "meus erros").
> Roadmap gravado na memória (`project_roadmap_ponto_tablet_facial`) e em
> `CHECKPOINT_PROXIMOS_PASSOS.md` §4 (reescrito hoje — estava parado em 19/05).

## 1. Método

Modo cirúrgico pra tudo que EDITA (eu, um arquivo por vez, teste antes/depois). Pra
INVESTIGAR as 6 pendências abertas usei um workflow de 6 agentes **só-leitura** (proibidos
de editar, de rodar build/testes e de escrever no banco) + 2 céticos por achado. Dos 26
agentes, **16 céticos caíram no limite de sessão** (reset 11:30) — então **todo achado em
que eu agi foi re-verificado por mim** (leitura do código + SELECT no banco); os que não
verifiquei estão marcados como "não confirmado" no PROXIMOS_PASSOS.

## 2. O que fechou (commits desta sessão)

### 2.1 `fdeb834` — TOTAL GERAL em branco + 101-H1 + tsbuildinfo + CLAUDE.md

- **Causa raiz do TOTAL GERAL** (relato de 20/08, print da planilha): as 3 linhas de total
  do `driverReport.ts` (geral, por grupo, simples) e a do `c6Export.ts` eram
  `{ f: 'SUM(...)' }` **sem valor**. Prova empírica (node + xlsx-js-style): o arquivo sai
  `<c r="A3"><f>SUM(A1:A2)</f></c>` — sem `<v>`; o próprio `XLSX.read` nem devolve a célula.
  Quem não recalcula fórmula ao abrir (prévia do WhatsApp/Gmail/Drive, iPhone, apps
  Android) vê vazio; Excel de PC e Google Sheets recalculam → "às vezes".
- **Fix:** `formulaCell(f, v)` grava `{ t:'n', f, v }` (valor arredondado em centavos — a
  soma crua vazava `300.59999999999997` pro XML). Somas do relatório geral vêm do
  `computeTotals` que o PDF já usava. `buildGeneralSheet`/`buildGroupSheet` exportadas.
  `Workbook.CalcPr.fullCalcOnLoad` NÃO adianta (a lib não escreve `<calcPr>`; testado).
- **Teste:** `tests/unit/driverReportTotalGeral.spec.ts` (9 casos: `f` + `t:'n'` + `v` =
  soma em todas as colunas, **roundtrip escrever→ler o .xlsx**, caso vazio = 0). Vermelho
  antes (6 falhas: `v` undefined), verde depois. `c6Export.spec` test 24 ganhou `v === 300`.
- `tests/101` H1: abre `abas-mais` (se existir) antes do `toHaveCount(0)` de
  Usuários/Gerenciamento (com o menu fechado passava mesmo com a aba escondida).
- `*.tsbuildinfo` untracked + `.gitignore`; `CLAUDE.md` regra 5 = push liberado (10/08).
- **Validado:** tsc 0 · eslint 0 · **vitest 1331 passed / 1 skipped** · build 2m06 ·
  E2E 101 H1+H2. ⚠️ H1 falhou 2× na 1ª rodada **no `page.goto('/')` (15s)** — Vite/WSL com
  a máquina ocupada (investigadores rodando node); re-rodado isolado: **1 passed (30s)**.

### 2.2 `66b8235` — CI: typecheck de verdade + actions v7

- 🔴 **O passo "TypeScript typecheck" do CI nunca checou nada**: `npx tsc --noEmit` na
  raiz usa `tsconfig.json` com `files: []` + `references` → **0 arquivos** (medido com
  `--listFilesOnly`: 0 vs 142 do `tsconfig.app.json`). Agora `npm run typecheck`.
- `actions/checkout`, `setup-node`, `upload-artifact` **v4 → v7** (PRs #13/#16/#3 do
  Dependabot; nenhum input usado mudou; runner Node 24). YAML parseado (3 jobs).

### 2.3 (commit seguinte) — selo "todos pagos" do grupo contava só as linhas filtradas

- **Bug real** (relato "quem já está pago" de 20/08): `DriverList` recebe `rows={filteredRows}`
  e o selo do cabeçalho do grupo (visão Grupos) era calculado sobre `groupRows` — com o
  filtro "Já pagos" ligado só sobram os pagos, então **qualquer grupo com ≥1 pago virava
  "✓ pago · Todos os membros deste grupo já foram pagos"** (caso vivo em prod: grupo com
  1 pago e 5 não pagos somando R$ 20 mil). Verificado por mim em `DriverList.tsx:954-963`.
- **Fix:** `situacaoPagamentoDoGrupo(membros, pagamentoByPayment)` (pura, em
  `driverPayShared.ts`) + prop nova `allRows` na `DriverList` (a `DriverPayTab` passa `rows`
  completas) + `membrosPorGrupo` (memo) → o selo conta TODOS os membros. Mesma semântica de
  antes (`sem_pacote` fora; todos pendentes = sem selo).
- **Teste:** `tests/unit/driverPaySeloPagoGrupo.spec.ts` (7 casos, incl. o cenário exato do
  bug). E2E `tests/68` (visão Grupos, quinzena de teste descartável): passou (1 retry —
  ver §4). Falta E2E específico do selo com filtro (pendência técnica).
- O relato de 20/08 também coincide com um evento real: **85 entregadores marcados "pago"
  por uma puxada errada do relatório simples às 17:46, limpos ~18:34** (payment_marks só é
  escrito por ação humana: relatório com a caixa "é o pagamento de verdade" marcada, ou
  "Marcar como pago"; a varredura automática só toca `espelho_conferido`).

### 2.4 Filtro "NF ok" — NÃO era bug (fechado sem código)

Filtro, selo do grupo, pílula, rodapé e ordenação leem o MESMO mapa (`nfProgressByPayment`)
pela mesma chave. O grupo do Mauricio ficou "NF 0/1" **até 18:39 de 20/08**, quando a nota
do líder foi validada — depois passou no filtro **por desenho** (nota do líder vale pro
grupo). O print e a investigação de 20/08 são de antes das 18:39. Achados colaterais (marca
"na mão" faz o grupo passar; notas do espelho "de todas" deixam de contar após republicar por
plataforma — caso ANDREA) → decisões em PROXIMOS_PASSOS §2.3.

## 3. 🔴 Segurança — provado por MIM em prod (SELECT), NÃO aplicado (migration = OK do Victor)

Query em `pg_class`/`has_table_privilege`/`has_function_privilege` no projeto de produção:
- **12 tabelas `public.backup_*`** com `rls=false` e `anon` com SELECT **e DELETE**:
  `backup_attendance_20260813` (~5.042), `backup_payments_20260813` (~3.036),
  `backup_employees_20260813` (96 — CPF, PIN, descritor facial), `backup_driver_pix_20260724`
  (99), `backup_espelho_conferido_20260818` (109), `backup_mirror_pub_2026072{4,7,8}`,
  `backup_nf_files_2026072{6,8}`, `backup_nf_imagens_20260724`, `backup_driver_auth_20260725`.
- View `driverpay_payment_computed`: **sem opções** (perdeu `security_invoker` na migration
  `20260717182000`), `anon_select=true` → 325 pagamentos legíveis sem login.
- `driverpay_conclude_period_only`: `secdef=true`, **`anon_exec=true`** (create_period e
  conclude_period têm `false`).
SQL de correção (só restritivo; UI intacta) em `CHECKPOINT_PROXIMOS_PASSOS.md` §2.1.
Memória `project_seguranca_pendente_2026_08_31` manda levantar isso PRIMEIRO se ainda estiver
aberto na próxima sessão.

## 4. Ruído de ambiente registrado (não é bug de produto)

- `page.goto` > 15s no Vite/WSL quando a máquina está ocupada (101-H1 2× e 68 1×; todos
  passaram isolados/no retry). `vitest` caiu 1× com "Timeout waiting for worker to respond"
  (pool) rodando junto do build — re-rodado: verde.
- 16 agentes céticos do workflow caíram por **limite de sessão** — sem prejuízo do que foi
  entregue (re-verificação manual), mas os achados de segurança §2.2 e de NF/import do
  PROXIMOS_PASSOS têm só a prova do investigador (+ a minha onde marcado).

## 5. Estado final / próximos passos

- `main` local com 4 commits desta sessão (código + CI + docs); push único no fim; CI e
  Vercel conferidos e registrados abaixo.
- **Aguardando o Victor:** decisões de `CHECKPOINT_PROXIMOS_PASSOS.md` §2 (segurança
  primeiro). Depois: roadmap §4, item 1 (auditoria dos caminhos de batida facial+geo).

### 5.1 CI / Vercel do push final — ✅ tudo verde

- Push único `80660d8..c88f6df` (4 commits: `fdeb834` TOTAL GERAL+101+tsbuildinfo+CLAUDE.md ·
  `66b8235` CI · `879ac37` selo do grupo · `c88f6df` docs).
- **CI run 33406628242: success nos 3 jobs** (`tsc + eslint` — primeira rodada com o
  typecheck de verdade e as actions v7 · `vitest (unit)` · `playwright (e2e)`), concluído
  15:17:54Z (~10 min).
- **Vercel:** deploy de produção `Ready` (41s) disparado pelo push; conferido **por conteúdo**
  — o `index.html` do site aponta pro mesmo bundle do build local (`assets/index-CoN1an_J.js`).
- Dependabot: PRs #13/#16/#3 (actions) ainda abertos logo após o push — o bot fecha sozinho
  quando revisitar o `main`; se não fechar até a próxima sessão, fechar à mão com nota.
- Ambiente: Vite local parado; scratchpad com as provas (`prova-formula.cjs`, logs de
  unit/E2E, digest do workflow em `wf-digest.md`).

## 6. 🔒 Segurança aplicada — OK do Victor ("pode aplicar"), mesmo dia

Migration `20260831160000_security_lock_backups_view_invoker_rpc_revoke.sql` (no repo) =
mesmo SQL aplicado em prod via MCP `apply_migration` (`success: true`). Antes de aplicar,
conferi os consumidores: a view só é lida por `recomputePaymentTotals` (como 2626) e por
`tests/70` (service_role); **nada** em `src/`, `supabase/functions/` ou `tests/` lê `backup_*`;
a RPC é chamada pela UI como `authenticated` (grant mantido).

**Prova pós-aplicação (3 níveis):**
1. Catálogo (`has_table_privilege`/`has_function_privilege`): 12 `backup_*` → `rls=true`,
   0 policies, `anon_select=false anon_delete=false auth_select=false`; view →
   `security_invoker=true`, `anon_select=false auth_select=true`; `driverpay_conclude_period_only`
   → `anon_exec=false auth_exec=true service_exec=true` (igual às outras 2 RPCs agora).
2. Simulação no banco: `set local role authenticated` + claims `sub=2626` → view devolve
   **325** pagamentos (o caminho do app continua igual); `set local role anon` → `42501
   permission denied for view`.
3. Sonda REAL na API (PostgREST) com a chave anon do bundle: view **401**,
   `backup_employees_20260813` **401**, `backup_attendance_20260813` **401**,
   `backup_driver_pix_20260724` **401**, `rpc/driverpay_conclude_period_only` **401** — antes
   eram 206 com dados. Controle: `driverpay_payments` segue **200 `[]`** (RLS normal).

Fica pra decisão dele: apagar/mover as `backup_*` depois de confirmar cópia; e a leva §2.2 do
PROXIMOS_PASSOS (policy "só 2626", checagem do chamador dentro das 3 RPCs, trava de período).

**CI do push `9a4beb1` (run 33408386035): ✅ success nos 3 jobs** (tsc+eslint · vitest ·
playwright), concluído 15:37:27Z — rodado de propósito SEM `[skip ci]`: o E2E inteiro passou
contra o banco já com as permissões novas, ou seja, o app segue funcionando.

## 7. 🔎 Auditoria do roadmap item 1 (facial+geo sem brecha) — só leitura, 31/08

Lido: `clock-in-validated/index.ts` (repo == deployado **v11**, `verify_jwt:true`),
`EmployeeClockIn.tsx` (fluxo `performClock`→`proceedClock`→`executeClock`), `FaceVerification.tsx`,
`clockGuards.ts`, config do toggle facial. Achados (brechas contra "ninguém bate sem facial E geo"):

- 🔴 **Facial NÃO é exigida no servidor.** O edge fn `clock-in-validated` recebe só
  `employee_id + cpf + clock_type + coords` — **nenhum parâmetro de facial**. A conferência
  facial é 100% no navegador (`FaceVerification` compara o descriptor com `compareFaces` <
  `MATCH_THRESHOLD` e chama `onSuccess()`; o resultado NÃO vai pro servidor). Logo: se
  `face_recognition_enabled=false` (ou sem descriptor cadastrado, ou config global off) a
  batida grava sem rosto; e qualquer chamada direta ao edge fn (anon key + employee_id + CPF)
  bate ponto sem facial. Identidade no servidor = só o CPF (que não é secreto).
- 🔴 **Geo só é bloqueada na 1ª entrada.** Nas posições 2/3/4 (saída intervalo, volta, saída),
  o edge fn registra `geo_fraud_attempts` mas **deixa passar** (`geoValid=false`, comentário
  literal "deixa passar"). Com as 4 batidas ligadas pra todo mundo, 3 das 4 ficam sem trava de geo.
- 🟠 **Geo da 1ª entrada depende de `block_outside`.** Default true, mas o override
  `geolocation_config.block_outside=false` desliga a trava até da entrada (vira só bloqueio de
  bônus). Conferir/forçar true em PN e Caratinga.
- 🟠 **Facial 1:1 é confiança-no-cliente.** Mesmo com facial ligada, o match roda no navegador
  e só o `onSuccess` dispara a gravação — replay/burla do cliente não é detectável no servidor.

Consequência de projeto: o item 1 ("sem brecha" de facial) exige **facial conferida no
servidor**, que é a base do item 4 (facial sem CPF, 1:N, no tablet). Por isso item 1/3/4 estão
entrelaçados — levei as decisões pro Victor (rumo/sequência + rigor anti-fraude) antes de programar.

**Decisões do Victor (31/08, via AskUserQuestion):** (1) **blindar o fluxo de hoje primeiro**
(servidor exige facial 1:1 + geo nas 4 batidas, CPF fica; tablet/1:N depois em cima dessa base);
(2) rigor = **"garantir que é a pessoa certa"** (servidor reconfere o rosto; SEM anti-foto-de-foto/
prova de vida por ora — pode entrar depois).

**Como o rosto é guardado (viável e barato no servidor):** `employees.face_descriptor` (jsonb, o
vetor de 128 números do face-api), gravado/lido pela edge fn `employee-public-api`
(`save-face`/`face-descriptor`). Match = `faceapi.euclideanDistance` < **0.5** (mesmo limite de
hoje). O servidor só precisa refazer essa distância — conta pura, sem lib pesada no Deno.

**Realidade dos dados (SELECT em prod, 31/08) — muda o rollout:**
| Empresa | batidas config | block_outside | raio | func | com rosto | SEM rosto | facial desligada |
|---|---|---|---|---|---|---|---|
| Caratinga | **2** | true | 150m | 91 | 59 | **32** | 4 |
| Ponte Nova | 4 | true | 150m | 6 | 5 | 1 | 1 |
- `block_outside=true` nas duas (bom). **Caratinga está em 2 batidas, não 4** → item 2 do roadmap
  é mudar `default_marking_count` 2→4 (afeta 91 pessoas). **32 de 91 em Caratinga NÃO têm rosto** →
  ligar a trava dura de uma vez trancaria essas 32; o rollout PRECISA de caminho de cadastro.
- Decisões de rollout levadas ao Victor: quem não tem rosto quando ligar (cadastra na hora ×
  bloqueia até responsável); ligar empresa-por-empresa × de uma vez.

## 8. 🔴 Correção urgente de última hora: "filtro certinho no topo, misturado ao rolar"

Pedido do Victor no meio da auditoria de segurança: "verifica os filtros, alguns que
não deviam passar aparecem misturados enquanto rola a lista". Pausei o trabalho do
roadmap (guardado intacto na branch `feature/ponto-facial-geo-servidor`) pra investigar.

**Método:** login real como 2626 via Playwright ad-hoc (scratchpad, não fica no repo),
Caratinga, aba Pagamentos Driver, comparando o DOM renderizado contra SELECT direto no
banco de produção (verdade absoluta) pra cada filtro.

**Hipótese óbvia (Pagamento pago/não pago) — DESCARTADA com prova:** testei os 3
períodos reais (118+109+98 pagamentos) nos dois filtros ('pago'/'nao_pago'), Lista E
Grupos: **zero divergência** — nome por nome bate 100% com a query SQL, inclusive no
caso "Raul Soares, MG" (1 pago de 6) onde o cabeçalho do grupo mostra honestamente
"pago 1/6" (fix da sessão anterior, `situacaoPagamentoDoGrupo`, funcionando certinho).

**Causa real achada: filtro "Espelho no app · Publicado".** Esse filtro JÁ era ciente de
grupo (só o líder publica, conta pro grupo inteiro) — mas o SELO "no app" de cada linha
olhava só o `driver_id` de quem publicou, sem checar o grupo. Medido ao vivo: **das 113
linhas que passavam no filtro "Publicado", 61 apareciam SEM o selo** — todo membro que
não era o líder. Isso é literalmente "filtro certinho, mas misturado ao rolar" (rolando
a lista de 113, a maioria não tem o selo que deveria ter).

**Fix (commit `f26c492`):** função pura nova `rowPublicadoNoApp()` em `driverPayShared.ts`
— filtro, selo da linha (desktop + mobile) E cabeçalho do grupo agora chamam a MESMA
função, não tem mais como divergir. O cabeçalho do grupo tinha o mesmo bug irmão (calculava
sobre `groupRows` filtradas, não todos os membros — mesma família do `situacaoPagamentoDoGrupo`).

**Prova pós-fix:** 61→0 linhas sem selo; "Não publicado" seguiu correto (5, nenhuma com
selo indevido); Grupos view "Raul Soares, MG" com filtro "Falta pagar" continua
excluindo corretamente quem já foi pago. Teste novo
`tests/unit/driverPayEspelhoNoAppSelo.spec.ts` (5 casos).

**Validado:** tsc 0 · eslint 0/0 · build limpo · vitest completo **1358 passed** (12
arquivos bateram timeout de worker do vitest — infra do WSL, não código: até um teste
trivial sem import nenhum falhou na 1ª rodada; recuperou sozinho na 2ª — mesma família do
flake "Timeout waiting for worker to respond" já documentado) · E2E 64+68 2/2 (1 flaky
no cold-start do Vite, recuperado no retry).

**Push `f26c492`: CI verde nos 3 jobs** (run 33424676706) · **Vercel conferida por
conteúdo** — produção (`sistema-ponto-zeta.vercel.app`) serve o mesmo bundle
(`index-BP0qeZwx.js`) do build local deste commit. No ar.
## 9. 🚧 Roadmap item 1 (facial+geo sem brecha) — código pronto na branch, aguardando 2 OKs pra ir ao ar

Branch `feature/ponto-facial-geo-servidor` (rebasada em cima do `main` de hoje, 6 commits):

- **`5f08752` backend:** edge fn `clock-in-validated` ganha bloco `strictFacial` — quando
  `companies.require_facial_clock=true` (migration `20260831170000`, coluna nova, **default
  false**): exige `face_descriptor_now` no corpo e reconfere contra `employees.face_descriptor`
  (euclideanDistance < 0.5, mesmo limite do navegador); quem não tem rosto cadastrado tem o
  rosto do momento salvo na hora (self-enroll, decisão do Victor); geo inválida recusa em
  **QUALQUER** das 4 posições (antes só a 1ª bloqueava — 2/3/4 "deixavam passar").
- **`fb3710e` frontend:** `/clock` manda o rosto reconhecido junto da batida
  (`face_descriptor_now`); com a chave ligada, a facial vira obrigatória (ignora toggle por
  funcionário/config global).
- **`2e237a6` doc:** auditoria completa do que estava furado hoje + decisões do Victor via
  AskUserQuestion (blindar fluxo primeiro; rigor = identidade correta, sem prova-de-vida por
  ora; self-enroll; ligar empresa por empresa).
- **`59ee72c` teste:** suíte E2E-de-verdade (bate na edge fn real, empresa fixture própria,
  sem tocar Caratinga/PN) provando as 4 marcações do dia com rosto certo/errado/ausente e
  geo certo/longe em CADA posição. Rodei agora: **falhou DE PROPÓSITO** — "companies.
  require_facial_clock não existe" — porque a migration ainda não foi aplicada. Confirma que
  o teste está certo; falta só o pré-requisito.

**Validado (com a chave OFF, que é o estado de produção hoje):** tsc 0 · eslint 0/0 · build
limpo · funções puras 12/12 (node) · `deno check` exit 0 · E2E specs 02+08+23+62 **24/24**
(fluxo de hoje intacto, zero regressão).

## 10. ✅ Roadmap item 1 — migration aplicada, edge fn publicada e PROVADA (OK do Victor "pode seguir")

Pergunta dele antes de autorizar: *"aplicando o sistema atual para de funcionar?"* — resposta
honesta dada (migration quase zero risco, provado hoje; deploy da edge fn com risco baixo mas
NÃO comprovado até rodar contra a infra real) + plano: publicar e IMEDIATAMENTE testar contra
a função ao vivo, com rollback pronto. Ele autorizou ("pode seguir").

1. **Migration `companies_require_facial_clock_flag` aplicada via MCP** — conferida depois:
   coluna existe, `boolean not null default false`; Caratinga e Ponte Nova com `false` (nada mudou).
2. **Backup do código antigo (v11) salvo em arquivo local** ANTES de publicar — conferido
   byte a byte contra o commit `fda9a80` (main antes das mudanças) — rollback garantido caso
   algo desse errado.
3. **Edge fn `clock-in-validated` publicada (v11→v12)** via MCP `deploy_edge_function`.
4. **Prova ao vivo, na hora, contra a função REAL recém-publicada** (não só código lido):
   - `tests/unit/edgeFnClockFacialGeoEstrito.spec.ts` — **PASSOU** (empresa fixture com
     `require_facial_clock=true`): sem rosto cadastrado E sem mandar rosto → recusa; manda o
     rosto pela 1ª vez → cadastra sozinho e deixa bater; rosto de outra pessoa → recusa; geo
     longe nas posições 2 E 3 (não só a 1ª!) → recusa; tudo certo → passa; attendance do dia
     fecha com as 4 marcações. **A trava bloqueia de verdade, provado contra produção.**
   - E2E specs **02+08+23+62 rodadas de novo, ao vivo, contra Caratinga real** (chave `false`
     lá) — **24/24 passed** contra a função JÁ PUBLICADA. Fluxo de hoje continua idêntico.
5. **Merge fast-forward** de `feature/ponto-facial-geo-servidor` pra `main` (6 commits) — o
   repositório agora bate com o que está de fato publicado (antes só o local da branch sabia).

**Estado final do item 1:** código + migration + deploy no ar, comportamento de hoje intacto
(provado ao vivo), trava nova provada funcionando (provado ao vivo) — mas **desligada em toda
empresa** (`require_facial_clock=false` em Caratinga e Ponte Nova). Falta só: decidir com o
Victor QUANDO ligar pra cada empresa (ele já decidiu o COMO: cadastra na hora, empresa por
empresa, só depois de todos terem rosto — Ponte Nova quase pronta, Caratinga com 32 sem rosto).

## 11. Pedido rápido no meio do deploy: grupo sem nada a receber não é "falta pagar"

Enquanto verificava o deploy, Victor pediu (print da visão Grupos, botão "Ordenar por
Pagamento"): grupos com R$ 0,00 a receber (zero pacotes na quinzena) não podem contar como
"falta pagar" nem aparecer misturados — têm que ficar sempre por último. Isso REVERTE uma
decisão dele mesmo de 14/08 (que colocava esses grupos junto com "nada pago" de propósito).

Fix (commit `0f6193d`): `groupMetric`/`contagemDoCriterio` (chave 'pagamento') agora tratam
grupo com zero pacote como `null`/"não se aplica" (mesma regra do NF), que
`compararPorCriterios` manda sempre pro fim — igual ao NF e Espelho no app já faziam. Teste de
14/08 atualizado pra refletir a decisão nova. Prova ao vivo: os 3 grupos sem pacote
(CARATINGA-ESCRITORIO, Ipanema-MAIULY, Sem grupo) ficam nas 3 últimas posições de 55, nos dois
sentidos do clique. 🔑 Achado no caminho: todo o resto (103 pagamentos) já estava "concluído"
no período aberto — o Victor deve ter pago/gerado relatório enquanto eu trabalhava em paralelo;
não sobrou ninguém "pendente" de verdade nessa quinzena pra aparecer primeiro no "falta pagar".

**Validado:** tsc 0 · eslint 0/0 · build limpo · vitest completo **1344 passed** (1 skipped) —
primeira rodada, sem nenhum flake de infra dessa vez.

**Push `bdb35e7`: CI verde nos 3 jobs** (run 33441166404) · **Vercel conferida por
conteúdo** — produção serve o mesmo bundle (`index-B9UUtLhq.js`) do build local. No ar.

## 12. Duas perguntas do Victor pós-deploy, respondidas com prova (sem código novo)

- **"Aplicando isso, o sistema atual para de funcionar?"** — Não: expliquei o porquê com
  evidência (migration só soma coluna default false; edge fn só muda comportamento dentro de
  `if (strictFacial)`, que nunca é true pra Caratinga/PN hoje) e citei as provas já feitas
  (24 E2E reais + CI completo rodados DEPOIS do deploy).
- **"O pessoal sem facial, quando for bater ponto, vai pedir pra cadastrar?"** — Testado AO
  VIVO agora (não só lido no código): criei empresa+funcionário fictício com
  `require_facial_clock=true` e `face_registered=false`, simulei o login (CPF+PIN) via
  Playwright. Resultado: cai direto na tela **"Cadastro Facial"** (mesma tela que já existe
  no app), NÃO no painel — confirmado por screenshot mostrando "Preparando câmera... /
  Carregando reconhecimento facial". `continueAfterPin` força isso porque `strict=true` vira
  `activeGlobally=true` independente do toggle antigo por funcionário. Quem tenta pular
  (`onSkip`) só é deslogado — não existe caminho pra chegar ao botão de bater ponto sem
  cadastrar. Empresa e funcionário fictícios apagados depois do teste (nada ficou no banco).

## 13. Pausa a pedido do Victor (reinício do PC) — estado pra retomar

Nada ficou pra trás: `git status` limpo, `main` local = `origin/main` = `ed14294`, nenhum
processo em segundo plano (Vite/Playwright todos encerrados). Branch
`feature/ponto-facial-geo-servidor` já foi mergeada (fast-forward) em `main` — pode ser
apagada quando quiser, não tem mais uso.

**Pendências reais pra próxima sessão (nenhuma é código — todas são decisão/operação do Victor):**
1. **Rollout do item 1:** ligar `require_facial_clock=true` — precisa esperar cadastro de
   rosto de quem falta (Ponte Nova: 1 pessoa; Caratinga: 32 de 91) OU decidir ligar mesmo
   assim (o autocadastro cobre tecnicamente, mas ele preferiu esperar por segurança — decisão
   dele, não peço de novo).
2. **PROXIMOS_PASSOS.md §2** ainda tem itens em aberto sem decisão: policy "só 2626" no banco
   do driverpay, filtro NF (marca na mão / bug do espelho republicado), travas do import,
   Dependabot npm (#25/#19 seguros, #18/#8 recomendo ignorar).
3. **Próximo item do roadmap (se ele quiser seguir sem esperar o rollout):** item 2 — 4
   batidas em Ponte Nova e Caratinga. Já sei que Caratinga está configurada pra 2 batidas
   hoje (`default_marking_count`), precisa virar 4 — mas NADA foi investigado/auditado ainda,
   é só esse fato solto.

**Ao reabrir:** ler este arquivo + `00-INDEX.md` primeiro (regra do projeto). Nenhuma ação
pendente de finalizar — é ponto de parada limpo, não meio de tarefa.

## 14. ✅ Rollout item 1 — Ponte Nova LIGADA (pedido do Victor, mesmo dia, nova sessão)

Victor pediu "pode ligar a facial em Ponte Nova, falta só 1 pessoa". Conferido em produção
ANTES de mexer (não confiei só no número do checkpoint): 6 funcionários em Ponte Nova, só
**Euder da Silva Machado** sem `face_descriptor` (cadastro `pending`, o que não bloqueia o
ponto — só o rosto travaria); `geolocation_config` da empresa com `block_outside=true` e
raio 150m intactos.

Aplicado via MCP `execute_sql` (UPDATE simples, não é DDL — não precisa de migration):
`companies.require_facial_clock = true` só na Ponte Nova (`2b2abc4b-084c-4cf0-b5f1-02792513241d`).
Conferido depois: Ponte Nova `true`, **Caratinga segue `false`** (intacta). Sem deploy —
edge fn e frontend já estavam publicados e provados ao vivo na leva anterior (§9-10 e §12),
incluindo o caminho exato do Euder (sem rosto → cai no cadastro facial, self-enroll, não é
bloqueado).

**Pendência 1 do §13 fechada.** Faltam as pendências 2 (PROXIMOS_PASSOS §2) e 3 (roadmap
item 2, 4 batidas — Caratinga com 32/91 sem rosto ainda, decisão de quando ligar lá segue
em aberto, ele não pediu isso agora).

## 15. ✅ Rollout item 1 — Caratinga LIGADA também (mesma sessão, na sequência)

Victor perguntou "mesmo com os 32 sem rosto, quando logar vai pedir pra cadastrar certo?"
antes de autorizar. Conferido em produção (contagem por `registration_status`, não só o
total): dos 32 sem `face_descriptor`, **28 já são `rejected`** — bloqueados no CPF, ANTES
do PIN/facial (`EmployeeClockIn.tsx:233`), então ligar a chave não muda nada pra eles. Só
**4 têm cadastro `approved` e sem rosto** — esses caem no auto-cadastro facial na próxima
batida (mesmo caminho provado com o Euder/PN e com o fixture da leva anterior; a chave
força a facial mesmo nos 4 que tinham o toggle antigo `face_recognition_enabled=false`
individual, comportamento já testado ao vivo, não é hipótese).

Achado corrige o número do roadmap/PROXIMOS_PASSOS ("32 sem rosto" → só 4 de fato afetados
na prática; os outros 28 já não batem ponto de jeito nenhum).

Aplicado: `companies.require_facial_clock = true` em Caratinga
(`6583bb2a-e334-41a7-b69c-7d98f3b46dfc`). Conferido depois: **as duas empresas com a chave
ligada** (Caratinga `true`, Ponte Nova `true`). Sem deploy — mesmo código já provado ao vivo.

**Roadmap item 1 (facial+geo sem brecha) fechado por completo — nas duas empresas, no ar.**
Restam as pendências 2 (PROXIMOS_PASSOS §2: policy "só 2626", filtro NF, travas do import,
Dependabot) e o próximo item do roadmap (item 2 — 4 batidas/dia).

## 16. 🔑 Decisão confirmada — os 28 recusados de Caratinga NÃO voltam a pedir facial

Vitor pediu "corrigir pra solicitar o cadastro da facial desses 32 quando fizerem login".
Antes de mexer, puxei quem são os 28 `rejected`: **`registration_reviewed_by='2626'`,
27/08/2026, 27 com nota "não está trabalhando" e 1 (Ian Willian Gomes da Silva Santos)
com nota "fralde no sistema de ponto"** — decisão de segurança dele mesmo, recente. Pedir
facial pra eles implicaria deixá-los passar do CPF de novo (hoje são barrados ANTES do
PIN), inclusive o caso de fraude.

Perguntado via `AskUserQuestion` com essa evidência — **confirmado: só os 4 `approved` sem
rosto** (não os 28 `rejected`). Esses 4 já pedem cadastro sozinhos no próximo login (mesmo
comportamento provado em §15) — **nenhuma mudança de código necessária**, pedido já estava
atendido. Os 28 recusados continuam barrados como antes.

⚠️ Achado à parte, não mexido (fora do pedido): **Arthur Teixeira de Paula Miguel** está
`approved` mas com nota "não esta indo trabalhar" — mesma frase dos 27 rejeitados, mas
ficou como aprovado. Pode ser inconsistência de quem revisou; avisar o Victor, não corrigir
sem ele confirmar (ele decide status de cadastro, não eu).
