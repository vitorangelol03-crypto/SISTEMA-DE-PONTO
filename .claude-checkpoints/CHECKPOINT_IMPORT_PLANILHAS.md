# CHECKPOINT — Importação automática de planilhas (iMile / Shopee / Anjun)

> Sessão 2026-07-17. Feature nova na aba **Pagamentos Driver** (branch `feature/pagamentos-driver`).
> Estado: **CONCLUÍDA (SF1–SF6)** — implementada e pushada; validada com clique real nas 3
> plataformas + Shopee real (parse em Web Worker, sem congelar a tela); produção íntegra.
> Fonte da verdade das decisões desta feature.

## 🎯 Objetivo (critério de sucesso combinado)
Victor sobe a planilha **crua** de qualquer plataforma (iMile, Shopee ou Anjun). O sistema:
1. **identifica sozinho** de qual plataforma é (pelo cabeçalho);
2. **conta os pacotes** por entregador e por cidade;
3. **aplica a taxa já cadastrada** (sem digitar valor);
4. mostra **prévia de conferência**; entregador não reconhecido → **popup** (criar novo, ou vincular a driver/grupo/rota existente) e o sistema **guarda o apelido** (aprende);
5. ao confirmar, os pacotes caem lançados no período escolhido.
E dá pra ter **mais de um período aberto ao mesmo tempo**.

## 📄 Formato das 3 planilhas (colunas-chave, 1 linha = 1 pacote)

### iMile — "Delivered (N).xlsx" (aba `sheet1`, ~32 col)
- Entregador: **`DA`** (col 6) — nome completo (com sujeira: `:VANILDO...`)
- Cidade/rota: **`Recipient City`** (col 12)
- Pacote: `Waybill No.` (col 1) · data `Delivered time`
- **Assinatura de detecção:** header contém `DA` + `Waybill No.` + `Recipient City`
- 1 plataforma → **eMile** (todos `Order Type = LM`)

### Shopee — "CLAYTONBDOSSANTOS (...).xlsx" (aba `Sheet1`, 53 col, ~132 mil linhas)
- **`Tipo do Serviço`** (col 0) = **ENTREGA** ou **COLETA**
- Entregador: **`Driver Name`** (col 52) — formato `108810-WINGLISON DE PAIVA` / `87191-XPT (DUTRA) GERSON...`
- Cidade/rota: **`Cidade Entrega`** (col 17)
- Pacote: `3PL Tracking Number` (col 6) · `Rota` (col 4)
- **Assinatura:** header contém `Tipo do Serviço` + `Driver Name` + `Cidade Entrega`
- **2 plataformas:** ENTREGA → **SHOPEE**; COLETA → **Coleta Shopee** (nova)
- Contagem real: 131.696 ENTREGA + 1.227 COLETA

### Anjun — "Taxas a Pagar (N).xlsx" (aba `sheet1`, 27 col, ~8,8 mil linhas)
- Entregador: **`operador de despacho`** (col 8) — formato login `RomarioAlvesD101` / `LUANKALLEBD101`
- Cidade/rota: **`Cidade destinatária`** (col 9)
- Pacote: `número do negócio` (col 0)
- **IGNORAR** `agente de cobrança` (col 7 — é outra coisa: Paloma, Ricardo) e `Valor a receber` (col 2)
- **Assinatura:** header contém `número do negócio` + `operador de despacho` + `Ponto a Pagar`
- 1 plataforma → **ANJUN**

## ✅ Decisões travadas com o Victor (2026-07-17)
1. **Vários períodos abertos ao mesmo tempo** — remover a trava `uq_driverpay_one_open_period` (migration). Na importação/lançamento, escolher o período de destino.
2. **Auto-detecção da plataforma pelo cabeçalho** — usuário só sobe o arquivo; se não reconhecer, avisa (não grava).
3. **Valor por pacote** — NÃO vem da planilha. Usa a taxa do driver/rota já cadastrada (`getDriverDefaultRates`); se não houver, o `default_rate` da plataforma.
4. **Entregador não reconhecido** — popup interativo: **criar novo driver**, ou **vincular** a driver/grupo/rota que já existe. O vínculo fica **salvo** (caderneta de apelidos → tabela nova `driverpay_driver_aliases`). Nas próximas importações reconhece automático.
5. **Shopee** — ENTREGA vira plataforma `SHOPEE`; COLETA vira plataforma nova **`Coleta Shopee`**.
6. **Anjun** — entregador = `operador de despacho`; paga **pacotes × taxa fixa** do sistema (ignora o "Valor a receber" da planilha).

## 🔬 Validação real do reconhecimento (protótipo sobre dados reais, 2026-07-17)
Limpeza (tira `12345-`, `D101`/`101`, `XPT (DUTRA)`, `( )`, acentos) + casamento com os 57 cadastrados:
- **iMile:** 51/59 automático (86%); 8 no popup (gente realmente nova).
- **Shopee:** 42/89 automático (~47%); a Shopee tem 89 entregadores (equipe maior que o cadastro) — muitos genuinamente novos + alguns com grafia diferente (SOUSA/SOUZA, JUNIO/JUNIOR) que o matcher de produção deve tolerar.
- **Anjun:** 28/48 automático (58%); 4 ambíguos + 16 no popup. Apelidos grudados em MAIÚSCULA (`LUANKALLEBD101`) só resolvem por vínculo manual 1× — e ficam salvos.
Conclusão: a limpeza automática resolve a maioria; o popup + caderneta fecha o resto e **aprende** — como o Victor quer.

## 🧱 Implementação — CONCLUÍDA (SF1–SF5), todas pushadas
- ✅ **SF1 — Banco** (commit `4fbd34b` + migration `20260717120000`): tabela `driverpay_driver_aliases` + RLS; trava `uq_driverpay_one_open_period` removida; plataforma `Coleta Shopee`; `getOpenPeriod` seguro p/ vários abertos. Validado: criar 2º período aberto funciona.
- ✅ **SF2 — Leitor** (`5fcf399`): detecção por cabeçalho + agregação + matching. Validado com as **3 planilhas reais** (iMile 59/13.447/85% auto; Shopee 89/132.923/SHOPEE+Coleta/47%; Anjun 48/8.844/56%).
- ✅ **SF3 — Distribuição** (`fa2f922`): `applyDriverImport` (cria driver, aprende apelido, lança pacotes por rota com a taxa). Modelo no banco validado (R$ 307,50).
- ✅ **SF4 — Tela** (`f831005`): `PlatformImportModal` + botão "Importar planilha". E2E clique real (iMile) com gravação verificada no banco.
- ✅ **SF5 — Regressão** (`1595b23`): fixtures + testes unit das 3 plataformas; E2E clique real das 3 na tela (4 plataformas distribuídas, incl. Coleta Shopee). 496 unit passando.
- ✅ **SF6 — Otimização** (`fbd2b58`): parse em Web Worker (`driverSheetImport.worker.ts`) — a tela não congela. Validado na Shopee real: parse 30,7s (era 54s), UI respondeu ≤322ms durante todo o parse. + aviso de progresso.

## ⚠️ Validado COM CLIQUE REAL × o que ainda FALTA (honesto)
**Validado com clique real (navegador):** importar iMile/Shopee/Anjun com **fixtures pequenas** (detecta→prévia→importa→grava 4 plataformas incl. Coleta Shopee, no banco); **Shopee real de 29 MB até a prévia** (detecta 89/132.923, sem congelar via Web Worker, UI ≤322ms). Produção limpa depois de cada teste.
**Validado por outra via (não é clique):** leitor com as 3 planilhas REAIS (unit/script); distribuição (modelo no banco R$ 307,50 + 496 unit); migração (SQL: criar 2º período funciona).
**NÃO validado com clique real ainda:**
- **Importar a Shopee real DE VERDADE** (clicar Importar com as 132k) — só cheguei à prévia; não cliquei Importar (evitava criar ~47 drivers reais). O Victor roda com os dados reais, conferindo os 47 no popup.
- **iMile real (13k) e Anjun real (8k) na tela** — só a Shopee real foi subida; as outras duas só com fixtures pequenas.
- **Criar 2 períodos abertos pela TELA** (clicar "Novo período" 2×) — validado por SQL, não por clique.
- Popup de conferência com muitos nomes reais não exercitado; taxa real da Coleta Shopee (2,00 placeholder); só Chromium; 2 botões de importar (decidir).

## ⚠️ Riscos/atenções
- **Volume:** Shopee ~132 mil linhas — o parse roda no navegador; agregar em memória e gravar só os **totais por (driver, cidade, plataforma)**, nunca 132 mil linhas.
- **Matching de produção** deve tolerar grafia (SOUSA/SOUZA) e ser bidirecional (planilha com mais/menos sobrenomes que o cadastro).
- **Apelidos ALL-CAPS grudados** (`LUANKALLEBD101`) → só vínculo manual (aprende depois).
- Arquivos-fonte de referência (fora do repo): `Delivered (9).xlsx` (na pasta do projeto), `CLAYTONBDOSSANTOS ( 2026 06 02 85).xlsx` e `Taxas a Pagar (29).xlsx` (em Downloads).
