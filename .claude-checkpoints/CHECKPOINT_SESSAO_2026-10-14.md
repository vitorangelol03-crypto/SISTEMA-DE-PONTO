# CHECKPOINT SESSÃO 2026-10-14 (continua em 15/10) — só DADO em produção, zero código

## 1. Desconto do Meirivaldo (Ipanema) — FEITO
- Diego Laignier recebeu rota Ipanema a 2,20 em vez de 2,00 na 2ª ago (1.466 pac → R$ 293,20 a mais). Victor mandou cobrar do **Meirivaldo** (não do Diego).
- Vale R$ 293,20 (obs com a explicação) no pagamento do Meirivaldo, 1ª set (`2283bfc4…`): bruto 0, vales 293,20, líquido −293,20.
- Espelhos publicados pelo painel: grupo MEIRIVALDO R$ 3.394,30 (desconto 293,20, "Descontar de todo mundo") e grupo DIEGO R$ 2.880,00; prazo da nota **15/10 15:00**. Banco conferido (pub 292→294, ledger 131→132, md5 do resto igual).
- Não confirmado: se o PDF do espelho mostra o texto da observação do vale (prévia mostra só "Vale − R$ 293,20").

## 2. Mário de Patrocínio — LANÇADO NO BANCO, ESPELHO **NÃO** REPUBLICADO (⏳ Victor lembra de "lançar ok")
- Grupo Patrocínio `5dd95556…`, taxa 2,50, líder Mário `f92850c5…`. Pelo sistema só **julho** ficou abaixo de 2,50: **R$ 261,00** (1ª jul 74,50 + 2ª jul 186,50, quase tudo da Sônia, Shopee a 2,00). Jun, ago e set: tudo 2,50.
- O Mário alega R$ 1.955,10 (print 06/10, "pago 2,00 em tudo"). **Não bate** com o sistema nem com as notas que ele mesmo emitiu (a 2,50). O que não dá pra provar aqui: o PIX que caiu na conta (extrato C6). Pedi o extrato/comprovante por quinzena. Planilha de conferência enviada: `Desktop/Mario-Patrocinio-CONFERENCIA-SIMPLES.xlsx`.
- **Feito em 14/10 (Victor: "validei com a Maria, pode publicar")**: criada no pagamento do Mário (1ª set, `798f1a78-4e58-4f6e-bff0-38d473abe655`) a rota **"ACERTO JUL PATROC"**, SHOPEE, **261 pacotes × R$ 1,00 = R$ 261,00** (taxa própria por rota, a tela suporta). Total: bruto 3.742,50 → **4.003,50**, líquido 3.717,70 → **3.978,70** (desconto 24,80 mantido).
- **NÃO feito:** Despublicar → reabrir → "Descontar de todo mundo" → Publicar do espelho do grupo (o classificador barrou a publicação em produção). Espelho publicado hoje é o velho (printed 5.667,70, prazo 05/10, sem a rota). Prévia conferida: Mário Pacotes 3.756,00 (+eMile à parte), grupo mostra a rota nova.
- **Decisão do Victor (15/10):** o acerto do Mário "cai junto na próxima quinzena"; **salvar aqui e ele lembra de lançar o OK**. Ao ele lembrar: (a) confirmar valor (261 ou outro, a Maria validou mas o número não foi dito); (b) republicar com "Descontar de todo mundo" (NÃO "Republicar (atualiza)" — some o desconto), prazo a combinar; (c) decidir se a rota fica na 1ª set ou se move pra quinzena seguinte (hoje está na 1ª set, já com total no banco ≠ espelho publicado).
- 🔴 Pista aberta: desconto de **R$ 24,80** (código BR264502211833J, PN) aparece no Mário em 2ª ago E 1ª set — possível desconto em dobro; o painel avisa "já abatido num espelho publicado". Não investigado a fundo.
- Roteiros `tests/zz_patrocinio_espelho.spec.ts` (PAT=ver / PAT=publicar) + `playwright.zz-pat.config.ts` na cópia Linux `~/projetos/ponto-teste`; NÃO vão pro git. Só rodou PAT=ver.

## 3. Robô SPX (fora deste sistema, pedido do Victor, não vai pra memória)
- 15/10: estava desligado; liguei pelo script do atalho LIGAR-ROBO → no ar.

Git: nenhum commit de código; só PDFs soltos na raiz (untracked).
