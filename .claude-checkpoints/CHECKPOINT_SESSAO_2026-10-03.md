# CHECKPOINT — Sessão 03/10/2026 — espelho de quem não tem pacote não marcava sozinho

> **Em uma frase:** consertado e no ar (`1f5e847`). Na 1ª quinzena de setembro 40 entregadores
> em grupo sem pacote de Shopee estavam sem "Espelho conferido" (print do Victor: Celita, grupo
> do João Gabriel, "Espelho 2/3"); agora os 40 estão marcados `auto` e a regra volta a valer.

## 1. Causa (provada)

- A dispensa (05/08, `23efdf9`) só enxergava quem tinha **pedido de print próprio** ou o **"pra
  todos"**. Três horas depois (`19eb546`) o pedido AUTOMÁTICO de depois da planilha passou a gravar
  pedido **individual só de quem tem pacote** (de propósito: o "pra todos" cobraria quem foi
  validado na mão). Quem tem 0 nunca era alcançado → nunca dispensado.
- Agosto funcionou porque teve clique manual em "pra todos" (1ª ago: 1 pedido geral; 2ª ago: o
  geral existiu até o incidente de 21/09). 1ª de setembro = 0 pedido geral, 97 individuais do
  automático (28/09 13:03) + 2 meus (02/10) → 40 sem marca: 30 com zero pacote + 10 só eMile/Loggi
  (estes eram marcados em agosto também — teste antigo já trazia o caso LOGGI dispensado da SHOPEE).

## 2. O que mudou

- `plataformaCobradaAlcanca` (driverPayShared): pra DISPENSAR, conta a plataforma ter pedido na
  quinzena (qualquer pedido alcança quem está em grupo). Cobrar print continua igual.
- `plataformasDevidasNaVarredura`: o sentido inverso — quem foi marcado com 0 e ganha pacote é
  desmarcado; `pedidosQueFaltamAoDesmarcar` cria o pedido individual dele (senão o app nunca pede).
  `desmarcarEspelhoPorDispensa` agora devolve os ids desmarcados.
- 🔴 **Trava de quinzena na varredura** (`rowsPeriodId`/`proofsPeriodId`/`historicoPeriodId`):
  linhas e pedidos chegam em chamadas separadas na troca de quinzena. **Achado no 1º E2E (sem a
  trava):** a varredura juntou as linhas da quinzena real com o pedido de eMile da quinzena de
  teste → marcou 32 de uma vez e **17 que devem print de Shopee** (desmarcou segundos depois).
  Provado por md5; o resto (campo `espelho_conferido_by` NULL→'auto' nos 17, sem efeito de tela)
  restaurado por SQL e conferido: os outros 102 pagamentos batem com a foto de antes.

## 3. Validação

18 unitários novos (4 vermelhos no código antigo) · suite unit 138 arquivos / 2.074 (12 lotes,
0 worker morto) · typecheck · lint do projeto · build · E2E `tests/131` (2 testes; o 2º com rede
lenta na troca de quinzena) + 76 + 77 no chromium — com a trava, quinzena real **idêntica** antes e
depois (md5 `9c66d45c…`), zero sobra "PW Test". Webkit/mobile não rodam por padrão (webkit sem
libs nesta máquina; mobile esconde a tabela) — nenhum dos dois roda no CI.

## 4. Pendências / avisos

- CI e deploy do `1f5e847`: conferir (ver índice).
- 🟡 Continua: quem entra no grupo DEPOIS da importação (ou ganha pacote na mão) fica sem pedido de
  print (caso Geisilaine/Diendrel de 02/10). Mesma peça (`plataformasDevidasNaVarredura`) resolve —
  esperando o Victor pedir.
- 🟡 `reloadProofs`/`rebuildFromServer` não descartam resposta fora de ordem: a TELA pode mostrar
  pedidos de outra quinzena num clique rápido (a varredura agora não age nisso). Não consertado.
- `tests/131` não está no CI (76/77 também não). Sugerido, não feito.
- Lição de teste: **E2E do driverpay abre a quinzena REAL primeiro** — código novo do painel age em
  dado real antes do deploy. Foto (md5) antes e depois sempre.
