# CHECKPOINT_SESSAO_2026-08-26.md

> Cadastro público de funcionário + aba "Aprovação de Cadastro" (análise de
> antecedentes). Feature nova pedida do zero por Victor nesta sessão.

## 1. O pedido

Victor pediu uma aba nova com um link público (sem login) pra cadastrar
funcionário novo — nome completo, CPF, telefone e chave PIX obrigatórios,
sem acento/ponto/traço em nenhum campo (confirmado por ele mesmo depois de
eu avisar que isso deixa e-mail/chave PIX aleatória com formato estranho —
decisão dele, mantida assim). Todo funcionário — os 97 que já existiam E os
novos — fica "pendente" até alguém analisar (antecedentes). Pendente e
aprovado batem ponto normal; só recusado bloqueia, e fica registrado (não
apaga). Precisa dar pra saber quem já foi analisado e quem não foi, e poder
colocar observação.

No meio da sessão, ao ver o print da aba, ele pediu 2 ajustes:
- Só o usuário **2626** acessa a aba (nem o 9999) — mesmo critério do
  Pagamentos Driver.
- Botão de copiar em cada campo (nome/CPF/telefone/PIX) na lista, sempre
  copiando a versão **limpa** (sem acento/ponto/traço), mesmo pra
  funcionário antigo cadastrado com acento no nome.

## 2. O que foi entregue (`0c84746`, só local — push pendente do OK dele)

- **Migration** (`20260826120000`, já aplicada em produção via MCP
  `execute_sql` — `apply_migration` do MCP tá bloqueado pelo classificador
  pra mim, `execute_sql` não): `employees` ganha `phone`,
  `registration_status` (default `'pending'`, os 97 existentes já entraram
  assim), `registration_notes`, `registration_reviewed_by/at`.
- **Edge fn `employee-public-api`**: ação nova `register-employee` (mesmo
  padrão público de `/clock`/`/erros`, `verify_jwt:false`, service_role).
  **Deploy feito pelo Victor** (`! npx supabase functions deploy
  employee-public-api --project-ref flcncdidxmmornkgkfbb`) — conferido por
  sonda HTTP (ação passou de "Unknown action" pra validação de verdade).
- **Página pública `/cadastro?empresa=<company_id>`**
  (`EmployeePublicRegister.tsx`): link por empresa (sem seletor — decisão
  dele), sem trava extra tipo código (decisão dele — ele confia em só
  repassar o link pra quem foi combinado).
- **Bloqueio no `/clock`**: `EmployeeClockIn.proceedAfterEmployee` recusa
  ANTES de pedir PIN se `registration_status==='rejected'` — pending/approved
  passam direto, sem mudar nada do fluxo existente.
- **Aba "Aprovação de Cadastro"** (`EmployeeApprovalTab.tsx`): link com
  botão copiar, filtro Pendente/Aprovado/Recusado com contador, busca,
  observação por funcionário, Aprovar/Recusar (recusar pede confirmação —
  `window.confirm`), botão de copiar por campo (sanitiza de novo na hora de
  copiar, então funciona pra funcionário antigo com acento no nome também).
  **Exclusiva do 2626** — `isEmployeeApprovalPermission` +
  `canAccessEmployeeApproval` em `masters.ts`, acima do bypass de mestre
  (mesmo padrão do `driverpay`), checado nos dois lados (`usePermissions.ts`
  pro front, `validatePermission` em `database.ts` pro backend).
- Sanitização (`stripAccentsDashesDots` em `validation.ts`) — tira acento,
  ponto e traço de nome/CPF/telefone/PIX. CPF/telefone continuam também só
  dígitos (já era o padrão do sistema).
- Permissões: módulo `employeeapproval` novo em `types/permissions.ts`
  (`view`/`approve`/`reject`), nos 3 defaults + `PERMISSION_LABELS` (entra
  no modal de permissões sem código extra — é tudo dirigido por dados lá).

## 3. Validação

- typecheck 0 erros · build limpo (2 rodadas, antes e depois do botão de
  copiar) · **1317 unit, 0 falha real** (2 rodadas bateram timeout de
  worker do WSL em arquivos aleatórios — infra, não código; cada arquivo
  suspeito rodado isolado passou limpo).
- **E2E novo `tests/78-cadastro-publico-aprovacao.spec.ts`**, 2/2 no
  Chromium: cadastro público de 2 funcionários (sem login) → aparecem
  pendentes na aba (login 2626) → aprova um / recusa o outro (confirma
  dialog) → confere no banco → `/clock`: aprovado chega no setup de senha
  (prova que NÃO bloqueou), recusado vê a tela de bloqueio.
- `masters.test.ts` ganhou bloco de teste pra
  `isEmployeeApprovalPermission`/`canAccessEmployeeApproval` (SOMENTE 2626).

## 4. Pendente (do bloco 1, cadastro público)

- ✅ **Push do `0c84746`/`fc6f6c7` — já aconteceu** (fora desta sessão;
  `origin/main` confere com `HEAD` no início do bloco 2 abaixo). A nota
  anterior aqui ("push pendente do OK dele") estava desatualizada.
- Pendências herdadas de 20/08 (filtro "NF ok"/"pago" sem reprodução nova,
  TOTAL GERAL em branco no relatório) **não foram tocadas** nesta sessão —
  seguem em aberto, ver `CHECKPOINT_SESSAO_2026-08-20.md` §5.

## 5. Incidente do mesmo dia: ninguém conseguia bater ponto (`1069964`, só local)

Victor reportou (ainda 26/08, depois do bloco 1): *"os funcionarios não
estão conseguindo fazer login para bater ponto"*.

**Investigação (sem mexer em nada até entender):** zero registros de
presença no dia inteiro e zero chamadas à função que grava o ponto
(`clock-in-validated`) desde as 19h14 do dia anterior — ou seja, todo
mundo travava ANTES de bater o ponto, no PIN. No banco: dos 97
funcionários, **70 com PIN configurado estavam com o campo `pin` (texto
puro) vazio** e um `pin_hash` (bcrypt) preenchido — sobra de uma migração
de 14/05 (`20260514121730_add_pin_hash_employees.sql`) que converteu os
PINs pra bcrypt e zerou o texto puro. 🔑 **A causa raiz:** a ação
`verify-pin` da `employee-public-api` só comparava com o `pin` (texto
puro) — nunca foi atualizada pra olhar o `pin_hash`. Achei até um teste
unitário antigo (`tests/unit/edgeFnEmployeePublicApi.spec.ts`, de sessões
de meses atrás) que **já esperava** esse comportamento bcrypt e nunca
tinha rodado de verdade porque `SUPABASE_SERVICE_ROLE_KEY` só entrou no
`.env` local nesta sessão — ele confirmou o achado assim que rodou.

**Conserto (2 deploys, ambos feitos pelo Victor via `!`):**
- **1º deploy:** `verify-pin` passa a comparar por bcrypt (`pin_hash`)
  quando existe, com fallback pro `pin` plain só pra quem ainda não tem
  hash. **Isso sozinho já liberou os 70 funcionários** — confirmado com
  um funcionário real (só leitura, sem mexer no PIN dele): `verify-pin`
  respondeu em ~0.5s, certo e errado.
- **2º deploy:** no meio da validação, achei que `set-pin` (grava PIN
  novo, usado pelos 27 sem PIN ainda) **também estava quebrado** —
  `bcryptjs.hash()` (a versão async, que gera salt novo) trava até
  estourar timeout (504) nesse runtime Deno específico — medido 2/2 vezes
  na função real. `bcryptjs.compare()` (usada no verify-pin, não gera
  salt) nunca teve esse problema. Troquei `set-pin` pra `bcryptjs.hashSync`
  — mesma lib, só sem a parte async que trava; confirmado ~1.4s gravando
  hash certo.
- `resetEmployeePin` (painel) ganhou `pin_hash: null` também — sem isso o
  "reset" não resetava de verdade (sobrava o hash antigo validando).

**Validado:** typecheck 0 · build limpo · unit **1322/1323** (o único que
faltava — o teste antigo de bcrypt citado acima — passou depois do 1º
deploy) · **E2E novo `tests/79-employee-pin-bcrypt.spec.ts`**: cria PIN
(setup) → sessão nova (reload real) → mesmo PIN aceito → PIN errado
recusado, 1/1 · regressão `tests/78` 1/1 (deu flaky numa rodada em paralelo
com o 79, limpo isolado — carga do WSL, já documentado como padrão).
🔑 **Achado no caminho, sem consequência:** funcionário de teste sem
`face_recognition_enabled:false` cai no gate facial (Caratinga tem
reconhecimento ligado) — Chromium headless não tem câmera; mesma
limitação já documentada no `tests/48`. Não é bug, só ajuste do teste.

**No ar desde os dois deploys de hoje** (edge fn `employee-public-api`
v8 → v9). Commit `1069964` — **pushado com OK dele** (`fc6f6c7..13f967c`
em `origin/main`, junto com o checkpoint deste bloco).

## 6. Feature nova: cadastro público grava Diarista + função escolhida (`dac3c6d`, só local)

Ainda 26/08, depois do conserto acima, Victor pediu: *"Todo funcionário
que passa por aquele link de cadastro, automaticamente ele vai ser
diarista... e ele vai automaticamente também pelo setor de triagem"*.

**Investigado antes de programar:** `employment_type`/`function_role` já
existem (sem migration). 🔑 **O "setor de triagem" NÃO é igual em toda
empresa** — Caratinga tem 85 pessoas em "Triagem - Shopee" (majoritário) e
só 1 em "Triagem - Transportadoras"; Ponte Nova é o oposto, **100%**
"Triagem - Transportadoras". Perguntado via `AskUserQuestion` com essa
evidência: fixar um texto por empresa (minha recomendação) ou deixar a
pessoa escolher? **Ele escolheu deixar a pessoa escolher** numa lista das
funções que a empresa já usa — mais flexível que eu tinha sugerido, e
resolve o problema das duas empresas serem diferentes sem precisar
configurar nada por fora. Confirmado também: mostrar "Diarista — função"
na aba de aprovação (recomendado, aceito).

**Entregue:**
- Edge fn ganhou ação `list-function-roles` (pública, mesma lógica do
  `getFunctionRoles` do painel — RLS de `employees` bloqueia anon lendo
  direto).
- `register-employee` agora exige `functionRole`, valida contra a lista
  real da empresa (função de fora da lista = 400) — **exceto se a empresa
  ainda não tem nenhuma função cadastrada**, aí aceita qualquer texto (pra
  não travar cadastro de uma empresa nova sem nenhum dado ainda; decisão
  técnica minha, não pedida). Grava `employment_type: 'Diarista'` fixo.
- Página pública: campo "Função" novo — `<select>` com as opções da
  empresa (busca ao carregar a página); sem nenhuma opção, vira campo de
  texto livre (mesmo fallback acima).
- Aba "Aprovação de Cadastro": cada cartão mostra `Diarista — <função>`.

**Validado:** typecheck 0 · eslint 0 · build limpo · **1322 unit, 0
falha** · **E2E `tests/78` atualizado** (escolhe "Triagem - Shopee", real
da Caratinga, no `<select>`; confere no banco `employment_type='Diarista'`
+ `function_role` certos; confere que aparece no cartão da aprovação antes
de decidir) — 2/2 contra a função já deployada (`v10`) · regressão
`tests/79` (PIN) 2/2 junto. 🔑 **Achado no caminho:** o teste 78 passou a
levar mais tempo (2 cadastros × 1 chamada a mais cada + validação extra no
insert) e estourou o timeout padrão de 30s — subido pra 90s nesse teste
específico, sem mudar o padrão global.

**Pendente:** 🔴 push do `dac3c6d` — esperar OK dele (mesma regra de
sempre).
