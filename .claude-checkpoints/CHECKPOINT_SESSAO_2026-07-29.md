# CHECKPOINT SESSÃO — 2026-07-29 (caça ao que apagava ponto real + correção)

> Pedido do Victor: "investigue o que está apagando os registros" e, depois de achado,
> "faz o 2" (corrigir o teste **e** o botão), "muito cuidado para não perder nenhuma
> informação ou dados do banco de dados".

## 1. CAUSA RAIZ — encontrada e provada

**`tests/04-bonus.spec.ts`**, teste *"2626: Reset Geral do ponto remove bonificações
também"*. O spec inteiro roda **dentro de Ponte Nova** e clica no botão **"Reset Geral"**.

O que o botão fazia (`AttendanceTab.confirmReset`):

```js
const attendanceIds = attendances.map(att => att.employee_id);  // TODOS do dia
for (const empId of attendanceIds) await deleteAttendance(empId, selectedDate);
```

Montava os alvos a partir de **todos os registros do dia**, ignorando a busca da tela.
Como o spec roda em PN, levou junto o ponto de **Euder (08:14)** e **Ronaldo (08:16)** —
os únicos funcionários REAIS de PN com ponto naquele dia. Os 20 de Caratinga sobreviveram.

### Como cheguei lá (o método, porque o palpite falhou várias vezes)
1. Comparei **campo a campo** os 2 apagados contra os 20 sobreviventes: a única diferença
   real era **`company_id`** — não horário, não geo. Isso virou a hipótese.
2. Criei **duas sentinelas** (uma em PN, uma em CT), com ponto do dia e nomes fora de
   qualquer filtro de limpeza (`ZZSentinela …`, não `PW Test`, não `Demo PN`).
3. Rodei blocos: spec 101 sozinho → sobreviveram. Bloco multi-empresa (25/26/30) →
   sobreviveram. Bloco de ponto (03/04/08/09/14/29/40…) → **a de PN morreu**.
4. Rodei **só o spec 04** → **PN morreu, CT viveu**. Prova isolada.

### Descartados COM evidência (não por palpite)
- `cleanup.ts:214` — único delete de ponto sem filtro de funcionário, mas **preserva
  `date = hoje`** e só apaga o criado durante a suíte (os registros eram das 05h);
- limpeza administrativa do sistema — última em 17/07, próxima em 17/10;
- colisão de CPF (`70333673689`/`17366838616` não estão em nenhum spec);
- `scripts/seed-pn-fake.mjs` e o `afterAll` do 101 — filtram `Demo PN%`;
- spec 46 (wizard de exclusão em massa) — nunca digita o ID correto;
- as **30 exclusões de ponto** dos 66 specs — varredura completa: todas filtram por
  `employee_id`.

## 2. Correção (commit `fc41a09`) — os DOIS lados, como o Victor pediu

**O botão (produção):** `attendancesToReset()` — util **puro**, em
`src/utils/attendanceReset.ts` — devolve só os registros de quem está **visível** na tela.
Sem busca ativa o resultado é **idêntico ao de antes**; a mudança só aparece no caso
perigoso. O modal agora diz **quantos** e **quem** (até 5 nomes) será resetado e, com busca
ativa, avisa em destaque que os demais N registros do dia **não** serão tocados. O toast
passou a dizer o número, em vez de "todos".

> ⚠️ Isso mudou comportamento que a equipe usa: "Reset Geral" com busca ativa agora reseta
> **só a lista filtrada**. Foi decisão explícita do Victor (29/07).

**O teste:** o spec 04 virou **teste de regressão** — captura os registros dos OUTROS
funcionários de PN antes do Reset Geral e exige que fiquem idênticos depois. Se o bug
voltar, quem denuncia é o próprio teste que o causava.

## 3. Dados — nada perdido

Os 2 registros foram restaurados **duas vezes** (a 2ª porque a própria investigação, ao
rodar o spec 04, apagou de novo — o que fechou a prova). Total sempre de volta a **4.680**,
com os 39 campos e os mesmos ids.

**Lição que salvou o dado:** o backup guardava os **registros inteiros**, não a contagem.
Com contagem, "4680 → 4678" seria um número estranho sem conserto possível.

## 4. Validação

tsc **0** · eslint **0** · build ok · **9 unit novos** (53 no bloco rodado) ·
**spec 04 6/6 com a sentinela de PN SOBREVIVENDO** e **0 registros do backup sumidos** ·
spec 03 (que também usa Reset) **7/7**.
Backups: `backups/2026-07-29/pre-fix-reset.json` + `backups/2026-07-28-pre-bateria/`.

## 5. Push e conserto dos testes vermelhos — FEITOS

**Push (`78ec4fa`) e Vercel conferidos**: o chunk `AttendanceTab-DW_oVGtO.js` que o site
serve tem o aviso de "busca ativa" e a lista "Quem será resetado". O Reset Geral em
produção **já respeita a busca**.

**Testes 26.12 e 26.13 (`51738ba`)**: paravam de passar porque exigiam PN vazia. O que eles
provam nunca foi isso, e sim o **isolamento** — a fixture criada em Caratinga não pode
aparecer em Ponte Nova. Reescritos pra verificar exatamente isso, então continuam valendo
mesmo com PN (e CT) crescendo. No 12 a espera da aba carregar virou explícita: afirmar
ausência sem esperar passaria com a tela ainda vazia (falso verde). Títulos corrigidos —
continuavam prometendo "PN: Nenhum registro". **26-extras: 4/4** (eram 2/4);
**26 principal: 7 passed / 2 skip**.

**Testes 3 e 9 recuperados do skip (`9688b51`)** — pedido do Victor depois do aviso.
Estavam parados desde 21/07 pela mesma premissa morta. Reescritos no molde do teste 8:
cada empresa ganha o SEU funcionário com dados próprios e o assert é por comparação.
  - **3 (Relatórios)** cria ponto do dia em cada empresa — sem isso nenhum apareceria e o
    teste passaria por tela vazia (falso verde);
  - **9 (Admin)** cria uma tentativa de GPS e uma facial em cada empresa, e re-autentica
    após o switch (a sessão do painel Admin cai na troca).

> ⚠️ **Pegadinha que derrubou a 1ª versão dos dois:** `getByText(nome)` casa com o
> `<option>` **HIDDEN** do filtro de funcionário, não com a linha — falhavam com
> "Received: hidden". O assert tem que ser em `tbody tr`. Já estava documentado no teste 13
> do 26-extras; agora vale para os quatro.

**Placar do isolamento:** `26-isolation` **9/9** (era 7 + 2 skip) · `26-extras` **4/4**
(era 2/4). **Nenhum skip sobrou nos dois arquivos.**

## 6. Auditoria das bonificações (pedido do Victor) — achado nos DOIS sentidos

### 6.1 SOBRANDO: o spec 04 deixou R$ 50 em funcionários REAIS
`applyBonus` aplica a bonificação do **DIA na EMPRESA inteira** — não só no funcionário
de teste. Lançou **R$ 10 em cada um dos 5 funcionários reais de Ponte Nova** (Amanda,
Euder, João Henrique, Leticia, Ronaldo), em pagamentos criados pelo próprio teste às
09:55 com a **diária ZERADA** — o que, na folha, faria essas 5 pessoas aparecerem como
tendo trabalhado de graça.

**Por que só apareceu agora:** antes o "Reset Geral" apagava o dia inteiro e levava o
bônus junto. Com o Reset restrito ao visível (`fc41a09`), o resíduo ficou exposto. Ou
seja: a correção da manhã **não criou** o problema, **revelou** — o teste sempre sujou.

### 6.2 SUMINDO: o spec 09 apagava bonificação real
Fazia `from('bonuses').delete().eq('date', today)` **sem filtrar empresa**, em dois
pontos. Bonificação lançada hoje pelo Victor — em qualquer das duas empresas — seria
destruída na próxima bateria.

### 6.3 Correção (`9596a76`): captura + restauração nos dois
Em vez de delete cego, os dois specs **fotografam o estado antes e devolvem depois**.
Isso protege bonificação **legítima** (volta idêntica) e remove só o que o teste criou.
Filtrar por prefixo/empresa não resolveria: o teste suja registro de gente **real**.

**Provado com sentinelas:**
- spec 04 → rodada nova deixa **0 pagamentos e 0 bônus** em PN (antes: 5 e R$ 50);
- spec 09 → um bônus de **R$ 33 em Caratinga SOBREVIVE** à rodada, com o mesmo id
  (antes seria apagado).

### 6.4 Limpeza dos dados (autorizada)
Os 5 pagamentos-resíduo foram removidos **com OK explícito do Victor**, com backup
dedicado (`backups/2026-07-29-bonus/removidos-residuo-teste.json`) e **guarda no
script**: só apagava o que tivesse diária 0, banco de horas 0 e `created_by = 2626` —
abortaria se algum não casasse.

### 6.5 ⚠️ CORREÇÃO da minha própria análise: "diária zerada" NÃO é lixo de teste

Chamei de "fantasma" todo pagamento com diária 0 — **estava errado**. São **104** no
sistema: **49 têm ponto no dia** e **15 foram criados pelo supervisor `01`** (lançamento
humano). Em **06/11/2025** há 15 funcionários assim de uma vez, com bônus de R$ 30 pelo
supervisor. É **padrão normal do sistema**, não sujeira. **Não mexi em nenhum deles.**

Os 5 que foram removidos não bateram só na diária zerada, e sim em **4 critérios juntos**:
criados às 09:55:18 (janela exata do spec 04), por `2626` (usuário do teste), com bônus de
**R$ 10** (valor que aquele teste aplica) e **sem pagamento anterior** naquele dia.

### 6.6 As 2 "cascas" de 28/07 — o que eram, e removidas
Euder e Ronaldo, 28/07, **tudo zero** e `bonus_breakdown {}`. Reconstrução: eles eram os
**únicos 2 de PN com ponto** naquele dia; o spec 04 aplicou o bônus do dia (que vale pra
empresa inteira) e criou o pagamento dos dois; segundos depois o **Reset Geral** (versão
antiga) apagou o ponto deles e **zerou** o bônus. Sobrou a casca.

**Não eram inofensivas:** `payments` tem **UNIQUE (employee_id, date)** — as cascas
**ocupavam a vaga** do pagamento de 28/07 de quem trabalhou. Removidas com OK do Victor,
backup em `backups/2026-07-29-bonus/removidos-casca-28-07.json`, guarda no script (abortaria
se houvesse qualquer valor) e **ponto dos dois conferido INTACTO** depois.

### 6.7 Últimos 10 dias — conferência pedida pelo Victor
Comparação por id contra o backup: **ponto 257 → 0 sumidos**; **bonificações 64 → 64, 0
sumidos**; **pagamentos**: dos 84 do período saíram **exatamente os 5 autorizados**, nada a
mais. Valores coerentes no período (Caratinga R$ 350–400/dia, PN R$ 541–550).
**Observação pro Victor:** 26, 27 e 29/07 estão **sem pagamento lançado** em nenhuma das
duas empresas, embora haja ponto — pode ser lançamento em lote pendente.

## 7. Banco — conferido registro a registro no fim

Comparação por **id** contra `backups/2026-07-29-bonus/pre-auditoria.json`:

| Tabela | Antes | Agora | Sumidos |
|---|---|---|---|
| bonuses | 64 | 64 | **0** |
| bonus_removals | 58 | 58 | **0** |
| bonus_blocks | 82 | 82 | **0** |
| employees | 92 | 92 | **0** |
| attendance | 4.703 | 4.703 | **0** |
| payments | 2.787 | 2.782 | **5** (exatamente os autorizados) |

## 8. PENDENTE

1. **Revogar o PAT do Supabase** colado no chat.
2. Herdadas: Marize (R$ 249×238) e Lucas (escaneada) · PIX do Pablo Raspante · apagar
   backups quando liberar · 6 CPFs faltantes · painel responsivo.
