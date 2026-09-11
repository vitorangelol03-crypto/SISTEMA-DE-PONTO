# Mockup da Etapa 2 do Financeiro (10/09/2026)

Desenhado com o Victor nesta data, antes de escrever código. As decisões viraram texto
em `PLANO_FINANCEIRO_2026-09.md` — **é lá que está a fonte da verdade**; estes arquivos
são o desenho que ilustra o combinado.

Canvas publicado: https://claude.ai/code/artifact/c81635e6-2efa-47c6-8531-8615aec9eef6

| Arquivo | O que mostra |
|---|---|
| `Main.dc.html` | Gavetas por mês, semanas dentro, números na linha fechada, balão e popup dos erros, botão de PDF |
| `Celular.dc.html` | O mesmo no celular (números empilham em 2×2) |
| `ArquivoPagamento.dc.html` | Escolher mês → semana em 2 cliques, filtro de vínculo |
| `PopupPDF.dc.html` | Quem entra no PDF: filtro + seleção avulsa, baixar OU publicar |
| `MeusRecibos.dc.html` | O que o funcionário vê: recibos publicados + erros |
| `ReciboCLT.dc.html` | O PDF do carteira assinada (INSS, FGTS, IRRF), 2 vias |
| `ReciboDiarista.dc.html` | O PDF do diarista, 2 vias |

O `.html` gerado (~2,5 MB) **não** é versionado: é derivado, montado pelo helper do
`/design` a partir destes arquivos + `canvas.json`.
