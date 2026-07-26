# CHECKPOINT SESSÃO — 2026-07-26 (multi-erros por dia: individuais + triagem)

> Feature pedida pelo Victor em 2 áudios de WhatsApp (transcritos com faster-whisper):
> o sistema substituía o erro anterior ao lançar um 2º erro no mesmo dia (valor engolia
> unidade e vice-versa), tanto nos erros individuais quanto na triagem.

## Causa raiz (provada em prod antes de mexer)

- `error_records` tinha **UNIQUE(employee_id, date)** e `triage_errors` tinha
  **UNIQUE(date, company_id)**; o frontend usava `upsert` com `onConflict` em cima —
  segundo lançamento do dia trocava o primeiro em silêncio. Era desenho ("1 erro/dia"),
  não bug pontual: a edição funcionava por funcionário+data por cima da trava.
- Verificado tudo que consome as tabelas: Financeiro, C6 (`getEmployeeNetPayments`),
  holerite, edge fn `employee-public-api`, distribuição de triagem, estatísticas,
  limpeza de dados — **todos somam por registro**, funcionam com N registros/dia.
  Nenhuma função/trigger do banco referencia as tabelas. RLS não muda (policy ALL).

## Decisões do Victor (26/07)

1. **Sem confirmação** ao lançar 2º erro no dia — só aviso informativo do que já existe.
2. **"Descontar Erros" soma tudo** do dia (ex.: 3+5 unidades → 8 × valor).
3. **Sem limite** de erros por dia.

## O que mudou (commit `40e4c6b`)

- `database.ts`: `upsertErrorRecord` → `insertErrorRecord` + `updateErrorRecord` (por ID);
  `upsertTriageError` → `insertTriageError`; `computeTriageDistribution` conta datas
  distintas (não linhas).
- `ErrorsTab`: edição por ID do registro; aviso azul "ℹ️ Já registrado neste dia: …"
  no modal (busca dedicada por dia/funcionário); guarda anti-clique-duplo (`savingError`).
- `TriageTab`: aviso "ℹ️ Este dia já tem: …"; key do preview aceita data repetida.
- `FinancialTab`: "Descontar Erros" agrupa quantidade **por data** e soma (antes o 2º
  registro do dia sobrescreveria o desconto do 1º); exibição por dia soma todos os
  erros da data (antes `.find()` pegava só o 1º).
- Migration `20260726120000_allow_multiple_errors_per_day.sql` (dropa as 2 constraints)
  — **ARQUIVO no repo, NÃO aplicada em prod ainda**.
- Specs MULTI novos em `tests/10-errors.spec.ts` com **probe de auto-detecção**: pulam
  ("skipped") enquanto a migration não estiver em prod; rodam de verdade depois.

## Validação

tsc **0 erros** (baseline de 63 zerada em sessão anterior) · build ok · vitest
**602 passed / 1 skip / exit 0** com `--maxWorkers=2` (rodada com workers default deu
flake de infra WSL "Failed to start forks worker"; com 2 workers restou 1 unhandled
error de infra sem detalhe capturado — **nenhum teste falhou**) · E2E chromium
**59 passed / 0 fail**: 10-errors (5✅ + 3 MULTI skip aguardando migration),
18+14 (13✅), 16+20 (16✅ + 2 skips históricos declarados), 31+11+22 (25✅).

## ✅ DEPLOY COMPLETO (autorização explícita do Victor: "pode fazer deploy push e migration")

1. ✅ Código validado + commit local `40e4c6b`.
2. ✅ **Push FEITO** (main `1c12f60..def84ab` no origin, merge ff da feature) +
   deploy Vercel **conferido no ar** (bundle `index-Bhy_UBHh.js` + chunk
   `FinancialTab-CbNk8YNf.js`, hashes idênticos ao build local validado).
3. ✅ **Migration APLICADA em prod** via MCP (`allow_multiple_errors_per_day`) DEPOIS
   do deploy; verificado no banco: só sobraram as PKs nas duas tabelas.
4. ✅ Specs MULTI rodados DE VERDADE pós-migration: **10-errors 8/8 ✅** (📦+💰 mesmo
   dia = 2 registros; 📦3+📦5 preservados; triagem 📦+💰 = 2 registros; avisos
   visíveis). Dados de teste limpos pelos próprios specs.
5. ⏳ Equipe recarregar o painel (F5) — aba aberta com código antigo (cache) dá erro
   ao registrar erro. **Victor avisa a equipe.**

Rollback da migration: recriar as constraints — só enquanto não houver 2 erros no
mesmo dia lançados (SQL no cabeçalho da migration).

## Fase 0 — diagnóstico da conferência automática de NF (leitura, sem mudar nada)

Victor propôs: sistema conferir automaticamente valor/CNPJ/nome quando a nota chega.
Rodado diagnóstico com as **18 notas reais** do bucket (script no scratchpad; pdfminer.six
instalado no user site igual ao faster-whisper). **Resultados:**

- **17/18 legíveis** (94%) — 1 é PDF escaneado (Lucas Aredes, 0 chars; só OCR/IA leria).
- **CNPJ: 17/17 (100%)** — o CNPJ esperado do slot aparece como tomador em todas.
- **Valor: 16/17 (94%)** — 🔑 **REGRA DESCOBERTA: a nota bate com o valor do ESPELHO
  PUBLICADO** (escopo grupo/individual + filtro de plataforma da publicação — a leva
  LOGGI de 24/07), **não** com o total da quinzena. Ex.: Rodrigo LOGGI 17×2,50=42,50 ✓.
  A única divergência é REAL: Marize emitiu R$ 249,00 × espelho R$ 238,00.
- **Nome: 15/17** — as 2 "falhas" são recebedores de fato NÃO cadastrados no sistema:
  nota da Marize emitida por PABLO PAULO DE SOUZA LIMA RASPANTE (nome que já está na
  pendência de PIX de 25/07!) e a do Fernando Martins por KARINNE ROBERTA DA SILVA
  PEREIRA. Feature flagaria certo; resolve cadastrando o recebedor.

**Conclusão:** leitura simples (grátis, sem IA) já cobre 94%; IA só ajudaria na nota
escaneada. Desenho a seguir (aprovado na conversa): pré-conferência com selos ✓/✗ no
painel + aviso imediato ao driver, humano continua validando; valor esperado ancorado
na PUBLICAÇÃO do espelho (scope + platform_filter). Aguarda OK do Victor pro plano da
Fase 1 (implementação).

## Recebedores cadastrados (ditados pelo Victor, 26/07 — a partir do diagnóstico)

- **FERNANDO MARTINS DA SILVA** → recebedor `KARINNE ROBERTA DA SILVA PEREIRA`,
  PIX `65853284000104` (o pix_key que já estava no cadastro É o CNPJ MEI dela —
  batido com a nota; era só o nome que faltava). Antes: recebedor null/null.
- **MARIZE DE LOURDES GOMES** → recebedor `PABLO PAULO DE SOUZA LIMA RASPANTE`,
  **PIX pendente** (não inventado). Antes: recebedor null/null; pix_key dela segue null.
  CNPJ MEI do Pablo na nota: 49.860.622/0001-89 (candidato a PIX, Victor confirma).

## Fase 1 — conferência automática de NF CONSTRUÍDA (commit `ba0c348`, aguarda release)

Decisões do Victor (26/07, chat): **errado → recusa na hora** dizendo o ponto exato e
pedindo reenvio no padrão; **valor exato** (±R$ 0,02 só arredondamento); **"validar já
no envio"** = 3 checks verdes → nota entra `validada` automaticamente (`validated_by='auto'`).

O que foi feito:
- `supabase/functions/driver-public-api/nfCheck.ts` — módulo PURO (edge fn + vitest,
  16 unit novos): normalização, CNPJs, valores BR, nomes (driver OU recebedor), motivos
  em português leigo. Ilegível (PDF escaneado) também recusa (padrão configurado).
- Edge fn `index.ts` → **v8 (SÓ NO REPO, ainda não deployada)**: unpdf\@1.8.0 extrai o
  texto; candidatos de valor = espelhos publicados (escopo+filtro) + soma por CNPJ +
  líquidos (individual e grupo); recusa = HTTP 422 + status 'rejeitada' + motivo
  `[automático] ...` (slot reabre; app antigo em cache mostra erro — nunca "enviada");
  erro interno → 'pendente', upload nunca falha pela conferência; check null (ex.: sem
  espelho publicado) nunca valida nem recusa sozinho.
- Painel (`NotasRecebidasModal` + `listNotaFiscalFiles`): selos ✓/✗ valor·CNPJ·nome,
  "validada (auto)", filtro "só as que precisam de atenção" (zip continua com todas).
- App (`DriverApp` + `driverApp.ts`): toast "enviada e validada ✓" / recusada com motivo
  (12s) + recarga do slot.
- Migration `20260726200000_driverpay_nf_auto_check.sql` (colunas check_* aditivas) —
  **NÃO aplicada**.
- Scripts prontos no scratchpad (`nf-diagnostico/`): `testar-fn-v8.mjs` (teste real da fn
  deployada com driver de teste descartável + notas reais 01/04, cleanup total) e
  `backfill-checks.mjs` (18 notas antigas: preenche selos + auto-valida as 100% verdes;
  divergente/ilegível antiga NÃO recusa retroativo — fica pra decisão manual do Victor).

**ORDEM DE RELEASE (diferente da feature de erros — migration PRIMEIRO):**
1. ⏳ Migration em prod (aditiva, painel atual nem vê).
2. ⏳ Deploy edge fn v8 (2 arquivos: index.ts + nfCheck.ts) + rodar `testar-fn-v8.mjs`.
3. ⏳ Push + Vercel (painel novo consulta as colunas novas — por isso migration antes).
4. ⏳ Backfill das 18 notas.
Validação local FEITA: tsc 0 · build ok · 622 unit (41 files) · smoke E2E 52-driverpay ·
pipeline real local (unpdf + nfCheck na nota real do Rodrigo: ok/3 checks ✓).

## Pendências

- **Release da conferência de NF** (passos 1-4 acima — aguarda OK do Victor).
- Equipe dar F5 no painel (multi-erros, seção acima).
- **PIX do recebedor da Marize (Pablo Raspante)** — Victor confirmar (candidato: CNPJ
  MEI 49860622000189). Liga com a pendência antiga "PIX othon/Pablo Raspante" de 25/07.
- **Nota da Marize divergente** (R$ 249,00 × espelho LOGGI R$ 238,00) — decisão do
  Victor na validação manual (backfill vai marcar ✗ valor, sem recusar sozinho).
- Herdadas de 25/07: Caio confirmar login 1234; apagar backups
  (`backup_driver_auth_20260725`, `backup_mirror_pub_20260724`, `backup_driver_pix_20260724`)
  quando Victor liberar; recebedor Mutum (Gustavo × João Victor); PIX Othon/Pablo
  Raspante; 6 CPFs faltantes; painel responsivo adiado.
