# CHECKPOINT SESSÃO — 2026-07-24 (LOGGI só-líder · PIX em massa · feature recebedor)

> Sessão em 3 frentes: (1) limpeza da leva LOGGI (dados), (2) preenchimento de PIX da
> planilha C6 (dados), (3) FEATURE "recebedor diferente" (código, commit `3820842`).

## O que foi feito (1 parágrafo)

A leva de espelhos LOGGI da quinzena **"2 Quinzena Junho"** (período `58e39a99-1091-4e4b-8da4-35c09b3589d5`,
aberto) tinha sido publicada **por driver individual** (scope `selection`), então **membros de grupo
receberam espelho** — 24 zerados (R$0) porque o LOGGI do grupo estava lançado no líder, e 2 LÍDERES
saíram R$0 porque o pacote estava num membro. Aplicada a **Opção A (decisão do Victor): só o LÍDER
recebe o espelho, agregando o grupo todo.**

## O que rodei (via painel 2626 + SQL, produção)

1. **Republicei 3 líderes em modo GRUPO (filtro LOGGI)** — o espelho de grupo agrega TODOS os membros e
   vai só pro líder: **Luan Kalleb R$98,00** (Daniel 49 LOGGI), **Greice R$25,00** (Mikael 10),
   **Mário R$82,50** (Mário 31 + Igor 2 = 33). Feito com Playwright dirigindo o painel real
   (botão "Espelho do grupo" → chip só LOGGI → "Republicar") — mesmo code-path do produto.
2. **Despubliquei os 25 espelhos de MEMBRO** (22 zerados + Daniel + Mikael + Igor) via SQL — o valor
   deles já está no líder. Regra do DELETE: pub LOGGI + é membro de grupo + NÃO é líder de nenhum.
3. **24 líderes que já estavam certos** (seguram 100% do LOGGI do grupo) — não toquei.
4. **Andrea e Iago** têm espelho "full" (todas plataformas) e **são líderes** → OK pela regra, mantidos.
5. **Cicero** (5 LOGGI, solo, sem CPF) — fora (sem CPF não loga mesmo).

## Como validei (empírico)

- **Banco:** 27 espelhos LOGGI restantes, **100% de LÍDER, ZERO membro**; **nenhum grupo com LOGGI ficou
  sem espelho no líder** (ninguém perdeu valor); total de publicações **54 → 29**.
- **Bucket `driverpay-mirrors`:** os 3 PDFs de grupo gravados na hora exata da publicação (17:32:10/19/28,
  ~23 KB cada).
- **DRY-RUN** (Playwright, sem publicar) fotografou os 3 previews antes → valores conferidos.

## Segurança / reversibilidade

- **Backup:** `backup_mirror_pub_20260724` (tabela no Postgres) = as **54 linhas originais** de publicação do
  período. Reverter = reinserir de lá. **Nenhum pagamento/pacote/PDF foi tocado** — só linhas de publicação;
  os PDFs antigos continuam no bucket. → **apagar a tabela quando o Victor mandar.**
- Senha do 2626 usada só em memória (env var na execução), não gravada.

## Regra nova travada (não re-perguntar)

- **Espelho de GRUPO = só o LÍDER recebe, agregando TODOS os membros** (mesmo os não-líderes). Membro de
  grupo **não** recebe espelho individual. (Igual à lógica que já vale no relatório e na NF.)

## (2) PIX em massa da planilha C6 (dados, produção)

Planilha `c6-template... (32).xlsx` (Downloads, aba "PIX chave ou código", 48 linhas: col 0=chave,
col 3=nome) → cruzada por tokens de nome (sem acento, sem de/da/dos) com os drivers ativos.
- **39 chaves preenchidas** em `driverpay_drivers.pix_key` (todas estavam null; guardado `pix_key is null`).
  Casos parecidos separados certo: Caio≠Caíque, 2 Fabricios, Gerson≠Jonas, Gessiley≠Gesiane, 2 João Pedro.
- **Backup:** `backup_driver_pix_20260724` (tabela no Postgres, estado anterior completo).
- **9 NÃO preenchidos** (dinheiro — não chutar): 6 com DOIS nomes na célula (membro+líder →
  viraram o caso de uso da feature recebedor, abaixo); 2 sem driver no sistema (othon saraiva
  Freitas 12701074614; PABLO PAULO ... RASPANTE 49860622000189); 1 sem chave (Vanusa).

## (3) FEATURE "Recebedor diferente" (código, commit `3820842`)

Caso real: líder cuja NOTA é emitida por outra pessoa (ex.: esposa) e o PIX é dela.
- **Banco:** migration `20260724190000_driverpay_recebedor` (`recebedor_nome`/`recebedor_pix`
  text null em driverpay_drivers) — **aplicada em prod**. Null = comporta como antes.
- **Cadastro do driver:** box âmbar "Recebedor diferente (opcional)" com os 2 campos.
- **Relatório GERAL:** nome do recebedor (só ele, decisão) na 1ª linha da unidade + coluna nova
  **CHAVE PIX** (última coluna — não desloca as plataformas). Sem recebedor → pix_key do líder.
- **Relatório SIMPLES:** agora `A NOME | B VALOR TOTAL | C CHAVE PIX | D OBS` (decisão).
- **ESPELHO não muda** — continua no nome do líder.
- Núcleo puro: `unitRecipientInfo(unit)` em driverPayShared.ts (nunca pega PIX de membro).
- Validação: tsc 0 · build ok · **571 unit** (7 novos) · E2E real (download dos 2 xlsx conferidos
  + foto do modal). Decisões gravadas: ordem de colunas; só nome do recebedor; NF = 2ª etapa.

## (4) Fechamento — 5 recebedores configurados + PUSH/DEPLOY (fim da tarde)

- **Victor decidiu**: configurar 5 recebedores, **Gustavo/João Victor fica de fora** (ele decide depois).
  Aplicados PELO PAINEL (cliques reais, prints enviados) e conferidos no SQL + no relatório simples
  baixado (5/5 com nome+PIX do recebedor; nome do líder não vaza):
  Greice→Mikael (39481738000153) · Oliur→Denize (64704511000177) · Henrique→Rosiclese (52620082000170) ·
  Thiago→Victoria Gabriella (51663165000184) · Willkerson→Neilizana (66816111000189).
- **PUSH FEITO pelo Victor** (via `!` — o classificador do ambiente bloqueou git merge/push pro agente):
  main `aecb2b6..f853d4f` + feature no origin. **Deploy Vercel conferido no ar** (bundle `index-Dr59Z_Qi`).

## (5) 2ª etapa do recebedor — NOTAS (commit `3e23e50`)

- "Notas recebidas": driver com recebedor ganha selo âmbar **"nota no nome de: X"** no cabeçalho do
  bloco (quem valida confere o nome certo na nota). `listNotaFiscalFiles` junta `recebedor_nome`.
- Validação: tsc 0 · build ok · 571 unit · E2E real (selo visível com recebedor de TESTE na Marize —
  `ZZZ TESTE (ignorar)` — **revertido em seguida**; os 5 reais intactos, conferido no SQL).
- Commit **local** (`3e23e50`) — push é do Victor (classificador bloqueia git push pro agente).

## (6) Nota SÓ PDF no app (commit `7a08b56` + edge fn v6)

- Motivo (Victor): a opção de foto/câmera confundia os drivers; a nota deve ser SEMPRE o PDF.
- App: input `accept=application/pdf` (sem `capture`), botão "Enviar PDF da nota", aviso
  "Somente arquivo PDF — foto não é aceita" + validação amigável.
- **Edge fn v6 deployada**: nf-upload recusa não-PDF validando tipo declarado E assinatura `%PDF`
  (cliente antigo em cache não fura). Validado NA DEPLOYADA: imagem→400, PDF-falso→400, PDF real→200
  (registro/arquivo de teste apagados; teste logou Adao lazy-1234, inofensivo).

## (7) Baixar espelho + tag Atual/Fechada no app (edge fn v7)

- Pedido do Victor: driver poder BAIXAR o PDF do espelho + saber qual quinzena é a ATUAL.
- **Edge fn v7 deployada**: my-mirrors devolve `periodStatus` ('aberto'/'concluido').
- App: card do espelho ganha tag verde **"Atual"** (aberta) / cinza **"Fechada"** (concluída — muda
  sozinho quando o painel conclui a quinzena) + botão **"Baixar"** (signed URL → blob → download
  nomeado "Espelho - <quinzena>.pdf"); "Ver espelho" virou "Ver" (3 botões no card).
- Validado: tsc 0 · build ok · my-mirrors REAL na v7 devolvendo status (login lazy Gessiley,
  read-only) · UI com API simulada (tags + download com nome certo) · prints enviados.

## (8) Limpeza das notas-FOTO + comunicado (fim da sessão)

- **6 drivers tinham anexado FOTO** em vez de PDF (falha antiga do sistema; todas pendentes,
  nenhuma validada): Bruno Eduardo (Caratinga), Fabricio Ferreira (Caratinga), João Pedro da
  Silveira (Caratinga), Fernando Martins (Vermelho Novo), Filipe Augusto Pena (Ipanema),
  Tiago André (Pocrane) — todas do CNPJ Shopee/Anjun/Loggi, 2ª quinzena junho.
- **Backup**: fotos em `backups/2026-07-24-notas-imagem/` (gitignored) + registros na tabela
  `backup_nf_imagens_20260724`. Depois **excluídas** (registro + arquivo do bucket) → o anexo
  REABRIU no app dos 6 pra reenviarem em PDF. Estado final: 0 imagens, 8 notas PDF intactas.
- **Comunicado de WhatsApp** montado e aprovado pelo Victor (aviso PDF-only + lista dos 6 +
  como fazer + novidade do Baixar/tag) — ele envia nos grupos.

## Pendências

- **Push do último commit de docs** — merge main é do Victor (feature branch já no origin).
- Apagar `backup_mirror_pub_20260724` e `backup_driver_pix_20260724` quando o Victor confirmar.
- **Recebedor do grupo Mutum (Gustavo × João Victor)**: Victor decide depois — PIX 66409705000175 na mão.
- PIX pendentes: othon saraiva / Pablo Raspante (sem driver no sistema — perguntar ao Victor).
- 6 CPFs faltantes (Cicero entre eles) — segue da sessão 23/07.
