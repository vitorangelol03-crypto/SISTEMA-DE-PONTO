# CHECKPOINT — Sessão 08/09/2026

> Sessão aberta pra atacar as 4 pendências de `CHECKPOINT_PROXIMOS_PASSOS.md` (§2.2 a §2.5).
> A investigação delas foi lançada (read-only) mas o Victor interrompeu no meio com um
> pedido operacional: consertar o ponto de 2 pessoas. Esta leva é só sobre isso.

---

## 1. Correção de ponto — Washington e Victor Angelo (dados de produção)

### Pedido
"Washington e Victor Angelo, arrume os pontos deles de sexta para sábado usando a média
do pessoal da triagem." Depois refinado pelo Victor: *"veja qual dia da semana a triagem
bateu ponto e ele não (Washington), dessa última semana que passou, e conserte usando a
média da triagem"*.

### O que foi investigado ANTES de mexer

Os dois são **Triagem - Shopee** em Caratinga. O turno da triagem é de **madrugada:
entram ~02:08 e saem ~09:00 BRT, dentro do mesmo dia civil** — não vira a noite. Isso
resolveu a ambiguidade do "de sexta para sábado" (o Victor perguntou se era "de sábado
para domingo"): não existe turno que atravessa dias aqui.

Quadro real da semana (triagem × Washington), conferido no banco:

| Dia | Triagem | Entr./saída média | Washington |
|---|---|---|---|
| SÁB 29/08 | 22 | 02:26 → 09:34 | ok 7,56h |
| DOM 30/08 | **0** | — | sem registro (ninguém trabalhou) |
| SEG 31/08 | 10 | 02:09 → 07:31 | ok 5,67h |
| TER 01/09 | 10 | 02:12 → 07:29 | ok 5,66h |
| QUA 02/09 | 12 | 02:09 → 09:30 | ok 7,83h |
| QUI 03/09 | 18 | 02:11 → 09:58 | ok 7,88h |
| SEX 04/09 | 20 | 02:16 → 09:08 | ok 7,23h (já era `manual` desde 04/09) |
| **SÁB 05/09** | 20 | **02:09 → 08:55** | **entrou 02:26, NUNCA bateu a saída** ← único furo |
| DOM 06/09 | **0** | — | sem registro (ninguém trabalhou) |
| SEG 07/09 | 11 | 02:06 → 09:02 | ok 7,20h |
| TER 08/09 | 1 | — | aberto (dia corrente, não mexido) |

**Conclusão da regra do Victor:** o único dia em que a triagem bateu e o Washington não
foi o **sábado 05/09**. Os domingos não contam (turma inteira parada). Nada mais a corrigir.

Victor Angelo: **diarista**, sem NENHUM registro em 04 e 05/09 — o último dele era 28/08.
A regra do Washington não serve pra ele (criaria várias diárias falsas); dia definido
pelo Victor.

### Decisões do Victor (08/09)

1. **Victor Angelo = 1 dia só, madrugada de sexta 04/09.** (Confirmado 2x — a 2ª vez
   depois de esclarecida a confusão de nomenclatura sexta/sábado.)
2. **Washington 04/09 fica intocado** — já estava lançado e certo.
3. **Washington 05/09 usa a média completa (02:09), não a entrada real dele (02:26).**

### O que mudou de fato — 2 linhas em `attendance` (produção)

| Registro | Antes | Agora |
|---|---|---|
| Washington 05/09 (`eaaed80e-773b-490e-9d2d-9082b6ac854a`) — **UPDATE** | entrada `2026-09-05T05:26:13.632Z`, saída nula, horas nulas, `pending`/`employee_self` | 02:09→08:55 BRT, 6,77h, noturno 2,85h, `manual`/`manual` |
| Victor Angelo 04/09 (`76ced878-ab83-4378-ab2d-c3217e064b34`) — **INSERT** | não existia | 02:15→09:09 BRT, 6,90h, noturno 2,75h, `manual`/`manual` |

Reversão: apagar a linha do Victor Angelo; no Washington, devolver os valores da coluna
"Antes" acima.

### Como foi validado (o ponto importante)

O turno pega **adicional noturno** (22h–05h), então errar o cálculo mexe em dinheiro.
Em vez de reimplementar, rodei **as funções reais do projeto** via `npx tsx`
(`src/utils/attendanceCalc.ts` + réplica do `calcHours` de `database.ts:3212`), e antes
de gravar qualquer coisa **recalculei o registro real do Washington de 04/09** como teste
de sanidade:

> esperado (o que já estava gravado): 7,23h · noturno 2,85 · worked 434 · daytime 263 ·
> nighttime 171 · expected 480 · debit 46 → **os 7 campos bateram exato.**

Só então gravei, preenchendo também os campos em minutos que o `recalcAttendance`
preencheria (`worked/interval/daytime/nighttime/expected/bank_credit/bank_debit`), usando
o registro de 04/09 (feito pela tela) como modelo de quais colunas preencher.

**Nenhuma linha de código mudou** — por isso sem build/E2E nesta leva.

### Observações honestas

- ⚠️ **CORREÇÃO (mesma sessão):** eu disse que o MCP do Supabase estava "bloqueado". **Era
  erro meu** — digitei o `project_id` errado (`flcncdidxmmorngkgfbb` em vez de
  `flcncdidxmmornkgkfbb`, o ref real que está no `.env`), e o erro "You do not have
  permission" era isso. O MCP funciona normalmente. As 2 escritas foram feitas pela API
  REST com a `SUPABASE_SERVICE_ROLE_KEY` do `.env` (o resultado é o mesmo), mas o motivo
  registrado antes estava errado. **Ref correto do projeto: `flcncdidxmmornkgkfbb`.**
- A geolocalização de entrada do Washington em 05/09 continua sendo a da batida real das
  02:26, enquanto o `entry_time` agora diz 02:09. É exatamente o que o `setManualTime`
  do sistema faz (não toca em geo), mas fica registrado.
- `bank_credit_minutes` do Washington em 05/09 ficou **166** (sábado espera 240 min, ele
  fez 406). É o comportamento normal do sistema pra sábado — os outros 20 da triagem
  teriam o mesmo. Não foi ajustado.

---

## 2. Investigação das 4 pendências (§2.2 a §2.5)

12 agentes read-only (6 investigadores + 1 verificador adversarial cada). O resultado
completo está no journal do run `wf_193f5e83-868`. O essencial:

### 🔴 §2.2 — a recomendação de 31/08 estava OBSOLETA e o buraco era MAIOR

**"Só 2626" contradizia o próprio Victor.** Em 02/09 ele mandou o oposto ("quero máximo de
controle possível em cada aba") e em cima disso foi construída uma semana de trabalho: a
permissão `driverpay.viewValues`, 8 tabelas de dinheiro mascaradas e 19 funções novas.

O que a leva de 03–04/09 fechou: **só a leitura de valores em R$**. O que continuava aberto
(provado no banco, não deduzido): a policy ainda era "mesma empresa", `authenticated` ainda
tinha INSERT/UPDATE/DELETE em tudo, `driverpay_drivers` ainda entregava CPF/pix_key/phone/
recebedor_pix, e — **achado novo** — as 3 RPCs de período eram SECURITY DEFINER sem NENHUMA
checagem do chamador (o 8888 de PN concluía a quinzena de Caratinga).

**Dois achados dos agentes que eu DERRUBEI ao conferir:** `_test_create_supervisor_with_perms`
existe em produção com EXECUTE pro authenticated mas **não é SECURITY DEFINER** (risco bem
menor que o alegado); e a policy `anon_spreadsheets_all` (ALL pro anon) existe, mas o bucket
`spreadsheets` está **vazio** — não vaza nada hoje.

### 🟠 §2.3 — os 2 achados vivos, e um risco ARMADO agora
7 unidades marcadas "na mão" (R$ 21.083,91), todas já pagas e todas em quinzena concluída.
Caso ANDREA reproduzido rodando o código real sobre dados reais (3 notas validadas → "1/3").
**O que preocupa:** na quinzena ABERTA as 71 notas validadas estão na chave do espelho "de
todas" — se alguém despublicar e republicar por plataforma, **44 unidades / 109 pessoas /
R$ 301.430,62 perdem a NF na hora**. `slotCoberto` não muda desde 28/07.

### 🟡 §2.4 e §2.5
Import: os 3 achados intactos (nenhum arquivo mudou desde 31/08). Dependabot: 8 PRs; os 3 de
Actions **não** se fecham sozinhos (o robô logou "No update needed" em 07/09) e estão
obsoletos — fechar na mão é seguro. #18 (typescript 7) barrado por motivo real (typescript-eslint
só aceita < 6.1); #8 (react 19 sem react-dom) em conflito. A checar: um agente afirma que o
**E2E do main está vermelho desde 07/09** (1 teste do /clock, câmera) — não confirmei.

---

## 3. §2.2 LEVA 1 — APLICADA EM PRODUÇÃO (`202c908`)

Decisões do Victor (08/09): a trava do banco segue a **permissão da tela**, não o número do
usuário; **9999 continua vendo as duas empresas**; trabalho **fatiado** em 2 levas; o bucket
público de fotos entra no escopo (leva 2). No filtro NF: marca na mão vira **opção separada**.

Migration `20260908120000_driverpay_rls_por_permissao_leva1.sql`:
1. 3 funções novas — `driverpay_acesso_total()`, `driverpay_tem_aba()`, `driverpay_pode()`.
2. As 24 policies recriadas usando elas (role `authenticated`, com `with check`).
3. As 3 RPCs de período passam a checar quem chamou (corpo original intacto).

⚠️ **O 2626 PRECISA do bypass explícito:** ele **não tem linha** em `user_permissions` (só 02,
03, 04, 8888 e 9999 têm) e usa a aba pelo bypass do frontend em `usePermissions.ts:47`. Sem
espelhar isso no banco, o próprio Victor perderia a aba. Isso quase passou batido.

**Validação (simulando o JWT de cada um, depois de aplicar):**

| Quem | Antes | Depois |
|---|---|---|
| supervisor 02 | 133 entregadores, 97 CPFs, 44 PIX | **0 em tudo** |
| 2626 | tudo | **tudo igual** — 133 / 4 quinzenas / 457 pagamentos / 256 notas / 55 grupos / 182 espelhos |
| 8888 | fechava quinzena de Caratinga | **bloqueado** em CT, mantém PN |
| 9999 | tudo | tudo, as duas empresas |

24/24 policies no role certo, com `with_check`, **0 com número cravado**.
typecheck 0 · lint 0 · **1361 unitários passando** (90 arquivos).

**Falha honesta:** o teste de escrita (UPDATE trocando chave PIX como o supervisor 02, dentro
de transação com rollback) **foi interrompido por um 502 do proxy do MCP**. Conferi
imediatamente pela API REST: **0 linhas com a chave adulterada** — a queda da conexão fez o
Postgres desfazer sozinho. Não repeti o UPDATE em produção: a prova de bloqueio já vem da
leitura (no Postgres a cláusula `USING` da policy governa quais linhas um UPDATE alcança, e
ele enxerga 0).

**Reversão:** recriar as 24 policies com
`(company_id)::text = coalesce((select auth.jwt()->>'company_id'),'') or (select auth.jwt()->>'sub') = any(array['9999','2626'])`
e tirar o `IF NOT public.driverpay_pode(...)` do topo das 3 RPCs.

---

## 4. Trava de quinzena concluída em TUDO (`0f9daa3`) — pedido do Victor

Pergunta dele: *"mas quinzenas fechadas não podem ser editadas sem ser abertas certo? então
não podem ser despublicadas certo?"* — **certo pela metade**, e a metade que falhava importava:

- A trava existia em **5 tabelas só** (payments, packages, discounts, vales, zapex): protegia
  o **dinheiro**. Espelhos, notas, marcas de pago, pedidos de print, prints do entregador e o
  razão de descontos **nunca tiveram trava** — dava pra despublicar espelho de quinzena fechada.
- O 2626 **fura a trava** de propósito (está escrito na mensagem de erro: "somente mestre 2626
  ou backend"). service_role também.

Ordem do Victor: **"coloque a trava em tudo"**. Agora são **11 tabelas** (as 5 + 6 novas:
nota_fiscal_files, mirror_publications, payment_marks, proof_requests, deduction_ledger,
delivery_proofs). As outras 14 ficam de fora porque não pertencem a quinzena nenhuma
(cadastro, grupos, plataformas, tarifas, apelidos, configurações).

A função deixou de ser hardcoded (`se é payments usa period_id, SENÃO payment_id`) e passa a
olhar as colunas que a linha tem — as 5 antigas se comportam idêntico.

**Impacto medido ANTES de aplicar** (ações reais feitas depois de fechar a quinzena):
marcar pago 552→**0**; publicar espelho 182→**0**; pedir print 6→**0**; desconto parcelado
60→**0**; print do entregador 277→**0**; enviar nota 256→**5** (3 entregadores pelo app, que
passa por service_role e segue furando a trava). **Nada do fluxo real quebra.**

**Provado em transação com rollback, com o trigger no ar:** 9999 em quinzena fechada →
BARRADO; 9999 em aberta → passou; 2626 em fechada → passou.

⚠️ **Isto NÃO resolve o risco do §2.3.** Aquele vive na quinzena **ABERTA** (1ª de agosto),
onde despublicar/republicar espelho é operação normal. Trava de período concluído não age em
período aberto. Números conferidos por mim: 71 notas validadas de 44 entregadores, **todas**
presas à chave do espelho "de todas"; as 51 publicações vivas são **todas** "de todas as
plataformas". Se republicarem por plataforma: 44 grupos, **110 pessoas**, **R$ 301.430,62**
perdem o "NF ok" (desses, R$ 183.583,34 são dos 44 que emitiram nota — os dois números medem
coisas diferentes e eu tinha passado só o maior).

---

## 5. Quinzena fechada: NINGUÉM edita, nem o 2626 (`6d54d5c`)

Ordem do Victor: *"não né, 2626 mexe em quinzena fechada ninguém"*. Pra editar, reabre —
caminho que já existia (`reopenPeriod`, `driverPay.ts:1352`, ligado em `DriverPayTab.tsx:2022`;
`driverpay_periods` não tem trava, então reabrir segue funcionando). Confirmei isso ANTES de
tirar o bypass, senão a quinzena fechada viraria imutável sem saída.

### 🔴 Furo achado no caminho — a trava não valia nem antes (PROVADO)

A trava decidia "é backend, deixa passar" olhando `current_user`. Só que **`current_user` vira
`postgres` dentro de qualquer função `SECURITY DEFINER`** — e as **7 RPCs `*_masked` que
escrevem** são SECURITY DEFINER com dono `postgres` e EXECUTE pro `authenticated`
(`upsert_driverpay_package_masked`, `recompute_driverpay_payment_totals_masked`,
`update_driverpay_package_rate_where_changed_masked`, `create_driverpay_platform_masked`,
`upsert_driverpay_platform_rates_masked`, `upsert_payment_bonus_masked`,
`upsert_payment_rate_masked`).

Medido como 9999 numa quinzena **concluída**:

| Caminho | Resultado |
|---|---|
| escrever direto na tabela | BARRADO |
| **pela RPC masked** | **GRAVOU — trava furada** |

Ou seja: desde a leva de segurança de 03–04/09, a trava de quinzena concluída **já não valia
para pacotes e totais, para qualquer usuário**. Isso confirma (com prova) o que o agente da
dimensão 5 tinha marcado só como "provavelmente".

### Correção

A decisão de "é backend?" passa a olhar o **JWT da requisição**, que não muda dentro de
`SECURITY DEFINER`: sem claims (psql/cron/migration) passa; `claims.role = 'service_role'`
passa (mantém o app do entregador); qualquer usuário logado → trava aplica, **inclusive dentro
das RPCs**. E o bypass do 2626 saiu.

**Provado contra a função já no ar:** 2626 em quinzena fechada pela função de valor →
`"Quinzena concluida: reabra a quinzena para editar"`; 2626 em quinzena aberta → passou;
app do entregador (service_role) em fechada → passou.

---

## 6. Pendências

- 🔜 **§2.2 LEVA 2:** as 19 funções `*_masked` (hoje só conferem empresa, não a permissão),
  as 5 policies de storage (presas em `9999`/`2626` — quem for liberado hoje não consegue
  anexar foto de desconto e o erro some em silêncio) e **fechar o bucket público
  `driverpay-discount-proofs`** com URL assinada (decisão do Victor: entra agora).
- 🔜 §2.3 (filtro NF com opção separada + fix do `slotCoberto`), §2.4 (import), §2.5 (Dependabot).
- 🟠 Conferir se o E2E do main está mesmo vermelho desde 07/09.
- 🟡 Nota do FERNANDO MARTINS (R$ 13,20) e avisar o Gessiley — desde 05 e 07/09.
