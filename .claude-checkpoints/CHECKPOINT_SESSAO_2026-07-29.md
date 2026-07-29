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

## 5. PENDENTE

1. **Push do `fc41a09`** — ainda **só local**. Enquanto não subir, o "Reset Geral" em
   produção continua apagando o dia inteiro mesmo com busca ativa.
2. Os **2 testes vermelhos** do spec 26 (premissa "Ponte Nova vazia", morta desde 20/07) —
   Victor decide se reescreve ou põe em skip como os irmãos 26.3/26.9.
3. **Revogar o PAT do Supabase** colado no chat.
4. Herdadas: Marize (R$ 249×238) e Lucas (escaneada) · PIX do Pablo Raspante · apagar
   backups quando liberar · 6 CPFs faltantes · painel responsivo.
