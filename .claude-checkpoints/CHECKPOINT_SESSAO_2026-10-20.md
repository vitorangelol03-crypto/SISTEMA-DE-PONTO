# Checkpoint — Sessão 2026-10-20

## O que mudou
**fix(driverpay): não pedir print de quem teve o espelho conferido NA MÃO** — commit `2c38933`.

O app do entregador pedia o print mesmo de quem o operador já tinha marcado "Espelho
conferido" na mão (às vezes com 0 pacote da plataforma). Caso real (fotos do Victor):
**Luis Fernando**, 0 Shopee, espelho 2/2 no painel, e o app do líder ainda com o cartão
pedindo o print da Shopee ("Falta 1").

**Causa raiz:** `proofSlots` (edge `driver-public-api`) + `deveCobrarPrint`
(`_shared/proofCards.ts`) **nunca olhavam `espelho_conferido`** ao montar os cartões.

## Decisão do Victor (20/10) — opção (a)
"Não pedir dela": a marcação **na mão** é ponto final; não pede o print de novo, mesmo
com pedido "pra todos" no ar. A marca **`'auto'`** NÃO entra na regra (ali há print
validado de verdade, que segue aparecendo verde em "Já enviados").

## Como foi feito (aditivo)
- `supabase/functions/_shared/proofCards.ts`: função pura `espelhoMarcadoNaMao()`
  (`espelho_conferido===true && espelho_conferido_by != null && != 'auto'`). Humano grava
  o próprio `userId` em `setEspelhoConferido` (`driverPay.ts:1762`); automático grava `'auto'`.
- `supabase/functions/driver-public-api/index.ts` (`proofSlots`): o `select` dos pagamentos
  passa a trazer `espelho_conferido, espelho_conferido_by`; no laço que monta `precisa`,
  `continue` quando `espelhoMarcadoNaMao(pay)`.
- `tests/unit/proofEspelhoMarcadoNaMao.spec.ts`: cobre humano/auto/nulo/desmarcado/conferido-sem-by.
- Painel **não mudou**: a prévia (`previaDeQuemAindaDeve`) e a coluna Espelho já respeitavam
  o conferido.

## Como foi validado
- `npm run typecheck` → 0 erros.
- `vitest run proofEspelhoMarcadoNaMao driverPayCartaoPrintHistorico` → **28/28** (na cópia
  Linux `~/projetos/ponto-teste`; no `/mnt/c` o vitest não sobe — worker timeout). Inclui o
  teste de **paridade painel×app** (`deveCobrarPrint` × `expectedProofPlatforms`), que
  continua passando: não quebrei a regra que mora em dois lugares.
- `deno check --node-modules-dir=auto` (na cópia, p/ não quebrar o node_modules da árvore
  real): 5 erros, **todos pré-existentes** (bcryptjs, Uint8Array/BufferSource, 3× SlotOut
  cast); **0 citam a mudança**.

## Deploy (feito)
✅ Victor rodou `npx supabase functions deploy driver-public-api` → **v56 ACTIVE**.
Sonda `POST .../driver-public-api {"action":"my-mirrors"}` → HTTP 401 "Sessao invalida" (boot ok).
Já está valendo no app do entregador.

## Fora do sistema (pedido do Victor, não entra no repo)
Montei um PDF "Vibe Coding — Guia de Estudo" (9 páginas, reportlab) e mandei pelo chat.
Não foi salvo no projeto.

---

# SESSÃO PARALELA (MODO CIRÚRGICO) 19–20/10 — ANJUN (taxas) + Zapex lançado
> Outra sessão, **só DADO em produção** (Caratinga, 2ª quinzena de setembro aberta `9b8fd48b`), **zero código**.
> Execução via MCP Supabase (`execute_sql`), espelhando as primitivas do app (mesma tabela/view/fórmula).

## ANJUN — "Taxas a Pagar (46).xlsx" (19/10)
- Importados **13.996 pacotes ANJUN** na 2ª set, por motorista/cidade (plataforma ANJUN `6dec3cf5-073f-4ec1-ad78-cc5e12c9b6d1`),
  taxa por motorista (config > última usada > padrão 2,00). **Ignorei as datas da planilha** — tudo vai pra quinzena aberta (ordem do Victor).
- Casados em massa; **Wesley Jose criado** (`d2545cf7-4a4d-451e-9c5c-b1971cf00366`); **AndreaD101 → Andrea dos Santos Ramos** (`fcb77321-...`, apelido gravado).
- **2 descontos "assinatura falsa"** em `driverpay_discounts` — a view `calc_discounts` lê daqui, **NÃO** do `driverpay_deduction_ledger`
  (bug pego por verificação independente e corrigido): Winglison 97,16 / Rogério 28,83. Verificado: líquido Winglison **2.776,84**, Rogério **−26,83**.
- ⏳ **Pendente decisão do Victor:** 4 descontos Perda/Avaria sem dono (QRAJ260826113930001=146,69 · QRAJ260810129895201=302,53 ·
  QRAJ260729105351801=90,01 · QRAJ260906143266601=7,57); Multa SLA R$ 102 em 23 motoristas; Bônus +R$ 1.774,90 (repassar?).

## Zapex — primeira vez usado (conferência 19/10 → lançado 20/10)
- **Como funciona (achado no código):** 1 item por entrega (`driverpay_zapex`, `code` obrigatório + data) + `zapex_rate` por pagamento;
  **total = qtd × rate** (view `driverpay_payment_computed.calc_zapex = round(count × zapex_rate, 2)`). A tabela estava **vazia** (nunca usada).
- **Fonte:** grupo **"ZAPEX CARATINGA COMPROVANTE"** (`Downloads/ZAPEX CARATINGA COMPROVANTE (1) (1)/chat.txt`).
  ⚠️ O `chat.md`/`chat.txt` na RAIZ do Downloads é **OUTRA conversa** (grupo "Financeiro CD LOGÍSTICA") — **não usar**.
- 22/06→16/10: 149 fotos no período → **133 entregas** após eliminar 16 (escritório 8 + coordenação Zapex 31-7196=4 e 31-9769=3 + telefone 33-9917=1).
  Fafá CTGA = **Fabrício dos Santos Ferreira** (casado, ordem do Victor). 6 entregadores, todos já com pagamento na quinzena.
- **Lançado (R$ 2,00/entrega, igual p/ todos — decisão do Victor "2 reis"):** 133 linhas em `driverpay_zapex` (código sintético `ZAPEX #NNN`
  — não há código real nas fotos — + a data real de cada foto) + `zapex_rate=2,00` nos 6 pagamentos. **+R$ 266,00** no total.
- **Verificado no banco** (reconsulta): 133 linhas / 6 pagamentos / taxa 2,00. Líquidos — Fabrício 49→**4.668,00**, Lucas 37→**3.956,00**,
  Romário 26→**4.292,00**, João Pedro 18→**4.774,00**, Higino 2→**5.764,00**, Gerson 1→**7.334,00**.
- Se for lançar mais Zapex depois: mesma mecânica; o valor mora no pagamento (`zapex_rate`, hoje 2,00) × nº de itens.
