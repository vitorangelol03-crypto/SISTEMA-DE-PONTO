# CHECKPOINT_SESSAO_2026-09-01 — Rework Usuários/Permissões/Auditoria, Fase A

> Continuação da sessão que atravessou 31/08→01/09 (ver `CHECKPOINT_SESSAO_2026-08-31.md`
> §1-§32 pro que veio antes). Este arquivo cobre o pedido novo do Victor: refazer a aba
> Usuários "de forma mais completa e bem mais robusta".

## 0. O pedido (resumo)

Victor pediu (voz, 01/09/2026): usuários precisam ter nome completo e telefone, botão de
redefinir senha padrão, sistema de permissões por aba **realmente** granular (não só
cosmético — "quando bloqueia, realmente tira a visão"), e um histórico de auditoria
("clica no usuário, vê tudo que ele mexeu"). Pediu **investigação + plano antes de
programar** — não implementação direta.

## 1. Investigação e plano (sem código)

Investigado antes de qualquer mudança:
- `src/types/permissions.ts` já tinha um modelo de permissões bem mais completo do que o
  Victor imaginava (11 módulos, sub-permissões por ação) — mas **`UsersPermissions` não
  tinha `edit` nem `resetPassword`** (users só podia create/delete/managePermissions).
- **Causa raiz confirmada do "permissões não funcionam de verdade"**: todas as RLS
  policies (`employees`, `attendance`, `users`, `user_permissions`, `payments`) usam o
  mesmo template `rls_company_match_modify` — só checa `company_id` + bypass de mestre,
  **nunca olha pra `user_permissions`**. `validatePermission` no frontend é só um aviso de
  UX; não é fronteira de segurança nenhuma.
- Template de enforcement real **já existe e funciona em produção**: o trigger
  `enforce_ponto_master_only` (Postgres, lê `request.jwt.claims`, compara OLD/NEW,
  `RAISE EXCEPTION`). Vai ser generalizado na Fase B.
- **Achado que reduz escopo:** infraestrutura de auditoria já existe inteira
  (`audit_logs`, `activity_logs`, `auditService.ts` com `logCreate/logUpdate/logDelete/...`,
  tela `AuditLogsTab.tsx`) — só que **zero call sites** chamam o serviço. Fase C vira
  "plugar o que já existe", não "construir do zero".
- `create-user` (edge fn) usa `bcryptjs.hash()` assíncrono — mesma família do bug de hang
  já visto e documentado em set-pin/verify-pin. Trocado por `hashSync` como parte da Fase A
  (edge fn ia ser tocada de qualquer forma).

**Plano apresentado em 3 fases**, com decisões do Victor:
- **Fase A** (este checkpoint): cadastro completo + redefinir senha.
- **Fase B** (próxima, ainda não iniciada): enforcement real no banco. Victor escolheu
  começar por **só 2 módulos — Usuários e Funcionários** — provar o padrão sem quebrar
  nada, antes de expandir pros outros 9 módulos.
- **Fase C** (ainda não iniciada): plugar `auditService` nos pontos de mutação +
  melhorar `AuditLogsTab` pra mostrar diff (`old_data`/`new_data`) + timeline por usuário.
  Victor escolheu **tudo de uma vez, todas as áreas** (não fez a opção faseada que eu
  recomendei) — dezenas de call sites em `database.ts`, vai ser uma leva grande.
- **Senha padrão do reset:** Victor confirmou "Padrão (mesma senha pra todo mundo,
  recomendado), após o primeiro acesso coloca a senha que quiser" — decisão já tomada
  antes de eu perguntar formalmente. String escolhida por mim (decisão técnica, não de
  negócio): `mudar123`.

## 2. ✅ Fase A implementada e no ar (`bc47757`)

**Banco** (migration `20260901120000_users_profile_and_password_reset.sql`, **aplicada em
prod com OK explícito do Victor** — perguntei antes por ser migration):
`users` ganha `name` (text, opcional), `phone` (text, opcional), `must_change_password`
(boolean, default `false`). 100% aditivo — nenhum usuário existente muda de comportamento.

**Edge fn `create-user`** virou um dispatcher por `action` (mesmo padrão já usado em
`employee-public-api`), deployada via CLI (`npx supabase functions deploy`, v5→v6,
sondada com chamada real pós-deploy pra confirmar que não é silent-fail):
- `create` (default, compat com chamada antiga) — precisa `users.create`. Agora recebe
  `name`/`phone` também.
- `update` — precisa `users.edit` **(permissão nova)**. Só nome/telefone — `id` é PK
  referenciada como texto solto por outras tabelas, imutável de propósito.
- `resetPassword` — precisa `users.resetPassword` **(permissão nova)**. Seta hash da
  senha padrão + `must_change_password=true`. Retorna a senha padrão pro admin ver.
- `delete` — precisa `users.delete`. **Agora bloqueia auto-exclusão** e exclusão de
  mestre no servidor (antes só o frontend bloqueava; o DELETE ia direto pro Supabase sem
  passar pela edge fn — gap real fechado).
- `changeOwnPassword` — sem gate de permissão de módulo (qualquer autenticado troca a
  PRÓPRIA senha; alvo sempre é o `sub` do JWT, nunca vem do body). Usado pela tela de
  troca obrigatória.

Todas as ações fazem o permission check no servidor via `service_role`, independente do
frontend — mesmo padrão que `handleCreate` já usava.

**`UsersPermissions`** (`src/types/permissions.ts`) ganhou `edit` e `resetPassword`
(faltavam — só tinha `create`/`delete`/`managePermissions`). Atualizado nos 3 presets
(admin/supervisor/readonly), no `PERMISSION_LABELS`, e no fixture de
`permissions.test.ts` + `tests/47-supervisor-users-create.spec.ts` que tinham o shape
antigo hardcoded.

**Frontend:**
- `src/components/auth/ForceChangePasswordScreen.tsx` (novo) — tela cheia, bloqueia
  qualquer acesso ao app enquanto `must_change_password=true`. Único jeito de sair sem
  trocar é deslogar. Inserida em `App.tsx` **antes** até da seleção de empresa do admin
  (gate de segurança, não de navegação).
- `src/components/users/UsersTab.tsx`: form de criar supervisor ganhou Nome/Telefone
  **obrigatórios**; popup Editar (mesmo padrão `fixed inset-0` do modal de Funcionários);
  botão Redefinir Senha (confirm → toast mostra a senha padrão aplicada); tabela/cards
  ganham colunas Nome/Telefone. `data-testid="user-row"` adicionado (desktop `<tr>` E
  card mobile) pra E2E conseguir localizar a linha certa em qualquer viewport.
- `src/services/database.ts`: `User` ganha `name`/`phone`/`must_change_password`;
  `createUser` aceita nome/telefone; `updateUser`/`resetUserPassword`/`changeOwnPassword`
  novos; `deleteUser` agora chama a edge fn em vez de `DELETE` direto no Supabase.

## 3. Validação

- `npm run typecheck` limpo, `npm run build` limpo (⚠️ **nunca usar `npx tsc --noEmit` na
  raiz** — checa zero arquivos neste projeto, lição já perdida uma vez antes).
- `npm run test:unit`: 78/78 arquivos, 1220 testes passando, 1 skip — os "11 errors" são
  timeout de worker do vitest sob a máquina carregada (mesma família de flake de infra já
  documentada em sessões anteriores, exit code 0 no fim).
- E2E dedicado novo `tests/102-users-fase-a.spec.ts` (editar nome/telefone, redefinir
  senha + confirma hash/flag no banco, fluxo completo login-com-senha-padrão→tela
  obrigatória→troca→painel→login seguinte já com a senha nova) + `tests/37-create-user-e2e`
  e `tests/47-supervisor-users-create` atualizados pros campos novos obrigatórios.
  **20/20 passando em chromium + mobile-pixel5** depois de 3 rounds de fix nos LOCATORS
  dos meus próprios testes (não do app — ver §4).
- Regressão ampla (`tests/11`, `22`, `26`) rodada por precaução: achou **9 falhas
  pré-existentes, nenhuma causada por este trabalho** — ver §5.

## 4. Aprendizados de teste (pra não repetir)

- **`page.locator('tr', {hasText})` ou `getByText(...).first()` em telas com tabela
  desktop + card mobile (`hidden md:block` / `md:hidden`) pega o elemento ESCONDIDO**
  quando roda em viewport mobile — os dois ficam no DOM, só um é visível via CSS, e
  `.first()` segue ordem do DOM, não visibilidade. Fix: `page.locator('[data-testid="..."]
  :visible')` (pseudo-classe `:visible` do Playwright) em vez de confiar em `.first()`.
- Botão ícone-só na tabela desktop usa `title="X"`; o mesmo botão no card mobile só tem
  texto visível, sem `title`. `getByTitle()` falha no card mobile. Fix:
  `getByRole('button', {name: /X/i})` — acessa o nome acessível computado (que cai pro
  `title` quando não tem texto, e pro texto quando tem), funciona nos dois layouts.
- Antes de rodar Playwright, **suba um `npm run dev` persistente em background** — sem
  isso cada invocação nova do Playwright sobe um Vite do zero (o `webServer` do
  `playwright.config.ts` tem `reuseExistingServer: true`, mas só reusa se já tiver algo
  escutando); a 1ª navegação de cada run cold-starta e pode estourar timeout de 15s.

## 5. Achado de regressão pré-existente (reportado, NÃO consertado — fora de escopo)

Rodando `tests/11-permissions`, `22-permissions-complete`, `26-multi-company-ui-isolation`
em chromium+mobile-pixel5 por precaução: **9 falhas, nenhuma ligada à Fase A**:
- `11-permissions.spec.ts` e `22-permissions-complete.spec.ts` (3 testes cada, só
  mobile-pixel5): usam `page.locator('tbody tr')` puro pra achar linhas — mesmo bug de
  "pega o elemento escondido em mobile" do §4, mas em specs que eu **não toquei**.
  Confirmado com `git show HEAD` que o `hidden md:block`/`md:hidden` de `UsersTab.tsx` já
  existia ANTES de qualquer mudança minha — não é regressão desta sessão.
- `26-multi-company-ui-isolation.spec.ts` teste 8 (Financeiro, mobile-pixel5): mesmo
  padrão, em `FinancialTab.tsx` — arquivo que não toquei.
- `26-multi-company-ui-isolation.spec.ts` teste 9 (GPS/faciais, chromium **e**
  mobile-pixel5): timeout puro de 30s sem erro de asserção — tela de Admin/GPS/facial,
  nada a ver com Usuários; parece lentidão de ambiente (mesma família de flake já vista
  a sessão inteira).

**Não mexi** (regra do projeto: não conserta o que não foi pedido, só avisa). Se o Victor
quiser, o fix é mecânico e pequeno (mesmo padrão `data-testid`+`:visible` já aplicado nos
meus arquivos) — mas cabe a ele decidir se vale abrir uma leva só pra isso.

## 6. ✅ Push, CI e deploy — fechado (`bc47757` + `a246638` + `3795b45`)

Commit `bc47757` pushado (migration + edge fn + frontend + testes) + `a246638`
(checkpoint) + `3795b45` (fix de teste, ver §6.1). **CI verde nos 3 jobs** no push final
(run `33578008149`: tsc+eslint, vitest, playwright todos ✓). **Vercel confirmada por
conteúdo**: string `"Defina uma senha nova"` (só existe no `ForceChangePasswordScreen`
novo) presente no bundle servido em produção.

### 6.1. 🔴→🟢 Achado real de CI no meio da leva (não era bug da Fase A)

O primeiro push (`bc47757`+`a246638`) veio com **CI vermelho no job `vitest`** — 2 testes
falhando com `Cannot read properties of undefined`
(`tests/unit/edgeFnClockFacialGeoEstrito.spec.ts`, `edgeFnClockFourMarkingsLunch.spec.ts`).
Rerun confirmou que NÃO era flake (falhou 2x igual). Investigado até a causa raiz: os dois
arquivos (criados mais cedo hoje, antes da leva de Usuários, achado do roadmap item 1/2)
computavam `today` com `new Date().toISOString()` (**UTC puro**), mas o edge fn
`clock-in-validated` grava `attendance.date` com `getBrazilDateString()` (America/
Sao_Paulo, UTC-3). Na janela ~21h-00h BRT (00h-03h UTC) o UTC já virou o dia mas o Brasil
não — o push caiu bem nessa janela (~21:48-22:02 BRT), o `supaSelect` por `date=eq.{today}`
voltava vazio, e `att` saía `undefined`. **Não era regressão da Fase A** (confirmado: os
dois arquivos não tocam em `users`/permissões, e o padrão de bug — UTC vs BRT — já existia
neles desde que foram criados; só nunca tinha rodado nessa janela de horário em CI antes).
Fix (`3795b45`): trocado pro mesmo padrão `en-CA`+`America/Sao_Paulo` já usado em
`tests/26-multi-company-ui-isolation.spec.ts`. Reproduzido localmente na mesma janela
(rodando 22h BRT) — falhava antes do fix, passa depois. CI verde confirmado no push final.

## 7. Pendente / próximo passo

- **Fase B não começou**: generalizar enforcement real (RLS/trigger) pros módulos
  Usuários + Funcionários primeiro, provar sem quebrar nada, só depois expandir.
- **Fase C não começou**: plugar `auditService` em todos os pontos de mutação +
  melhorar `AuditLogsTab` com diff old/new + timeline por usuário — Victor escolheu
  fazer tudo de uma vez (não faseado).
- Reportar ao Victor o achado do §5 (9 falhas pré-existentes de mobile-pixel5 em specs
  que não fazem parte deste trabalho) e perguntar se ele quer que eu conserte numa leva
  separada.

## 8. ✅ Os 3 specs de mobile-pixel5 do §5, consertados (`d1c4e99`, a pedido dele)

`tests/11-permissions.spec.ts` + `tests/22-permissions-complete.spec.ts`: `tbody tr`/
`getByTitle` → `[data-testid="user-row"]:visible` + `getByRole` (mesmo motivo do §4).
`tests/26-multi-company-ui-isolation.spec.ts` testes 8 (Financeiro) e 9 (Admin
GPS/faciais): sem `data-testid` pra usar, trocado por `getByText(...).and(':visible')`
— teste 9 teve uma pegadinha a mais: o card mobile do AdminTab é um `<div>`, nem chega a
ser `<tr>`, então `tbody tr` nunca ia bater lá (não bastava só adicionar `:visible`).
**56/56 chromium+mobile-pixel5, typecheck limpo.** Nenhum código do app tocado — só teste.

## 9. ✅ Fase B — APLICADA em produção e validada ao vivo (`4759f2e`)

Ele mandou "pode começar a fase B" e foi tomar banho; migration escrita, apresentada, e
**"pode aplicar" explícito recebido** antes de rodar (regra "migration sempre pede OK"
respeitada mesmo com o sinal verde geral já dado antes).
(`supabase/migrations/20260901180000_fase_b_enforcement_usuarios_funcionarios.sql`,
aplicada via `apply_migration`, commitada depois de validada).

Fecha, com trigger no banco (mesmo padrão do `enforce_ponto_master_only`, já provado em
produção): `users` (create/edit/delete real, hoje já protegido pela edge fn mas sem
segunda camada se alguém pular ela), `user_permissions` (🔴 achado sério: `saveUserPermissions`
em `permissions.ts` fazia UPDATE/INSERT direto SEM NENHUM check de permissão no código —
só a UI escondia o botão; qualquer usuário da mesma empresa podia se auto-conceder
`managePermissions` via REST direto) e `employees` (create/edit/delete real — hoje só
`validatePermission` client-side "de aviso"; aprovação de cadastro continua exclusiva do
2626, mesmo critério de `canAccessEmployeeApproval`).

Achado extra ao mapear os call sites de `employees` em `database.ts`: `resetEmployeePin`,
`setFaceRecognitionForEmployee` e `resetFaceForEmployee` (as 2 últimas só no AdminTab,
gated pela senha interna "Clayton2024") não tinham NENHUM check de permissão — a migration
passa a exigir `employees.edit` nas 3. Risco baixo (supervisor padrão já nasce com
`employees.edit=true`), mas é uma mudança de comportamento real — avisado ao Victor antes
de aplicar. Decisão deliberadamente FORA desta migration: enforcement de LEITURA (SELECT) —
Victor falou em "realmente tira a visão", que pode significar isso também, mas é bem mais
arriscado (relatórios/joins hoje dependem de leitura ampla) — fica pra perguntar depois,
separado desta leva.

### 9.1. Validação pós-apply

Confirmado com SQL direto que os 4 triggers existem e estão `enabled` (`tgenabled='O'`):
`trg_enforce_users_permission_check`, `trg_enforce_user_permissions_permission_check`,
`trg_enforce_employees_permission_check` (novos) + `trg_enforce_ponto_master_only`
(já existia, intacto). Tentei uma sonda negativa direta (JWT real do supervisor 04 —
restrito, `employees.edit=false`/`users.*=false` confirmado no banco — tentando um UPDATE
via REST puro) mas o classificador do Claude Code bloqueou a chamada `curl` direta contra
prod (razoável — é mutação bruta em prod). Validação girou então pra bateria de testes
E2E reais (JWT de usuário de verdade, não bypass de service_role):

**28/28 verdes** (`tests/05`, `21`, `39`, `78`, `80`, `37`, `47`, `102`, chromium): criar/
editar/excluir funcionário via UI, cadastro público → aprovação (exclusiva do 2626, mesmo
critério que a migration usa — os testes 78/80 JÁ esperavam isso antes de eu tocar em
nada, confirma que meu mapeamento bateu com o comportamento real), criar/editar usuário,
fluxo completo de redefinir senha. `tests/28` (import em massa): o teste que REALMENTE
insere no banco (`2. Importar 3 funcionários OK... 3 inseridos`) passou — prova que
`employees.import` funciona pelo trigger. 2 testes desse mesmo arquivo falharam
(`getByText('Erros')` hidden em chromium) mas são validação 100% client-side (preview
antes de qualquer escrita no banco) — confirmado que não têm NENHUMA relação com a
migration (zero interação com banco nesses 2 casos específicos); reportado ao Victor como
achado à parte, não investigado a fundo (fora do escopo desta leva).

typecheck limpo, build não precisou rodar de novo (migration não mexe em frontend).

### 9.1.1. 🔴→🟢 Bug real achado e corrigido na hora (`38b1d1b`, ~40min no ar)

Victor perguntou "tudo pronto tem certeza?" depois do §9.1 — em vez de repetir a
confirmação, reverifiquei do zero e achei um bug de verdade: `user_has_module_permission`
tratava "usuário SEM linha em `user_permissions`" como "zero permissão nenhuma". Mas o
frontend (`mergePermissionsWithDefaults` em `permissions.ts`) sempre tratou "sem linha"
como `DEFAULT_SUPERVISOR_PERMISSIONS` (que já vem com `employees.create/edit/import=true`).
Confirmado no banco: as contas **REAIS** `01` (supervisor) e `8888` (admin não-mestre)
nunca tiveram linha própria — ficaram **bloqueadas de criar/editar/importar funcionário**
desde o deploy da Fase B até o hotfix (~40min de janela).

Avisei o Victor na hora, expliquei o alcance real, ele mandou aplicar
(`20260902000000_fase_b_fix_default_permissions_sem_linha.sql`). Fix: mesmo fallback do
frontend, só pros módulos que a Fase B usa hoje — linhas customizadas (ex: supervisor 04,
restrito) continuam 100% respeitadas. Validado por 3 caminhos: (1) SQL direto, 6 casos
batendo com o esperado incl. o supervisor 04 continuar bloqueado; (2) `tests/103` novo,
prova a conta REAL `01` criando funcionário pela UI de verdade (login real → trigger
real); (3) 29/29 verde na suíte completa de novo. CI verde.

**Lição:** os 28 testes do §9.1 validaram o caminho de "quem tem permissão" (via admin,
que sempre ignora a trave) mas nenhum validava especificamente "conta real sem linha
salva" fazendo uma ação de verdade pela UI — esse buraco só apareceu numa segunda rodada
de verificação, não na primeira. `tests/103` fecha essa lacuna de cobertura de vez.

### 9.2. Em aberto pra próxima leva

- Fase B só cobre 2 dos 11 módulos (Usuários + Funcionários) — expandir pros outros 9 é
  decisão explícita do Victor pra quando ele quiser.
- Enforcement de LEITURA (SELECT) — deliberadamente fora desta migration, mais arriscado.
- Fase C (auditoria) nem começou.
- Os 2 testes de `tests/28-employee-import-v2.spec.ts` (`Erros` hidden, client-side,
  achado nesta leva mas não investigado) — mesma categoria dos achados do §5/§8: reportar
  e perguntar se vale consertar numa leva separada.

## 10. ✅ 9999/8888 configuráveis, 2626 fixo como líder único (`2159bab`)

Pedido novo do Victor (02/09/2026, meio da madrugada): "vamos tornar os usuários 9999,
8888, 2626 em usuários normal do sistema mais com full acessos que eles vão ser os
usuários dos chefes mas podendo ser limitados também igual outros usuários". Foi ficando
mais preciso em 3 rodadas de mensagens curtas — resumo final:
- **2626 = líder único, fixo.** Ponto/Pagamentos Driver/Aprovação de Cadastro continuam
  100% exclusivos dele (sem mudar nada). Permissão dele nunca é editável, nem por ele.
- **9999** = vê as duas empresas (igual hoje), nasce com tudo liberado (menos os 3 itens
  do 2626 acima), mas agora É configurável/limitável de verdade.
- **8888** = já só via Ponte Nova (não mudou), nasce com tudo liberado (mesma exceção),
  também configurável/limitável.
- **Só o 2626 edita a permissão do 9999/8888** — nem eles mesmos, nem outro admin com
  "gerenciar permissões" comum.

Achado no meio da investigação que **reduziu bastante o risco**: a "empresa que cada
mestre enxerga" já era exatamente isso que o Victor queria (9999/2626 no bypass das ~60
RLS policies de `company_id`, 8888 nunca esteve nesse bypass — `company_id` dele já era
Ponte Nova) — **não precisou mexer em RLS nenhuma**. Só a camada de PERMISSÃO/AÇÃO
precisava mudar (frontend + os 3 triggers da Fase B), não a de visibilidade de linha.

**Implementado:**
- Migration `20260902010000_9999_8888_configuraveis_2626_fixo.sql`: seed de permissão
  total (UPSERT) pro 9999 (tinha linha antiga incompleta) e 8888 (nunca teve linha) +
  os 3 triggers da Fase B (`enforce_users_permission_check`,
  `enforce_user_permissions_permission_check`, `enforce_employees_permission_check`)
  trocam o bypass de `sub IN ('9999','2626')` pra só `sub = '2626'`, e o trigger de
  `user_permissions` ganha uma trava nova: mexer no `user_id` 9999 ou 8888 é exclusivo
  do 2626, mesmo pra quem tem `managePermissions=true`.
- Frontend: `usePermissions.ts` (2 bypasses), `validatePermission` em `database.ts`,
  `driverPay.ts` — trocado `isMaster(userId)` por `userId === PONTO_EDITOR_ID` nos pontos
  que davam bypass total (não nos usos cosméticos como "não pode excluir"/"mostra
  Sistema", que continuam em `isMaster()`/`MASTER_IDS` intocados). `PermissionsModal.tsx`
  + `UsersTab.tsx` ganham a trava "só 2626 edita 9999/8888" nas duas camadas (UI +
  trigger real).

**Validado ao vivo:** 48 testes da suíte de Funcionários/Usuários (que usam o 9999
pesadamente como conta padrão de admin em quase todo teste da sessão) continuam 100%
verdes — nada quebrou pro caminho "acesso total por padrão". `tests/104` novo (3 testes)
prova as duas pontas com login real: 9999 mantém tudo funcionando, 9999 (mesmo com
`managePermissions=true`) é bloqueado tentando mexer no 8888, e o 2626 consegue abrir a
tela do 8888 normalmente. tsc + lint + build limpos.

**Em aberto:** Victor não pediu (e não mexi) enforcement de LEITURA (SELECT) nem tornar a
"empresa que cada um vê" editável por UI — hoje é só o bypass de RLS que já existia,
inalterado. Se ele quiser isso configurável de verdade no futuro, é uma leva nova.

**CI pegou 1 teste desatualizado, corrigido (`6c638e7`):** `tests/101-supremo-pn.spec.ts`
H1 esperava 8888 SEM acesso a Usuários/Gerenciamento — premissa correta ANTES desta
migration, agora o oposto do pretendido (8888 ganhou acesso total de propósito).
Atualizado pra esperar acesso total (menos Pagamentos Driver, que continua exclusivo do
2626). 25/25 do arquivo inteiro verde depois do fix.
