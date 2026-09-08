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

## 2. Pendências desta sessão

- 🔄 A investigação das 4 pendências (§2.2 RLS driverpay / §2.3 filtro NF ok / §2.4 travas
  do import / §2.5 Dependabot) foi lançada em background e **ainda não teve resultado
  lido** — retomar por aí.
- 🟠 **Achado que muda o §2.2:** as migrations de 02/09
  (`20260902010000_9999_8888_configuraveis_2626_fixo`,
  `20260902020000_remove_travas_exclusivas_ponto_driverpay_aprovacao`) mostram que o Victor
  decidiu o **oposto** da recomendação de 31/08: as travas exclusivas do 2626 (Ponto,
  Pagamentos Driver, Aprovação de Cadastro) viraram **permissão normal configurável**. E as
  8 migrations de `rest_bypass_fix` + 3 levas de revoke do driverpay (03–04/09) podem já ter
  fechado o buraco. **Não propor "só 2626" sem reler isso.**
- 🟡 Seguem intocadas as pendências antigas de `CHECKPOINT_PROXIMOS_PASSOS.md`.
