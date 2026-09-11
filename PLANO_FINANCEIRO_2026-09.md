# PLANO — Reorganização do Financeiro + Espelho de Pagamento

> Ditado pelo Victor em 08–09/09/2026. **Nada foi implementado ainda.**
> Este documento é o combinado: o que entra, em que ordem, e o que cada etapa entrega.

---

## Regras que valem pro plano inteiro

1. **Nenhuma funcionalidade se perde.** Tudo que a tela faz hoje continua fazendo.
2. **Visível e organizado.** O que importa fica à vista.
3. **Poucos cliques.** Nada de empilhar clique pra chegar no que se usa todo dia.

---

## Escopo de seleção (vale pro C6 **e** pro Espelho)

Em qualquer um dos dois, dá pra escolher quem entra:

- **Tudo junto** (diaristas + carteira assinada)
- **Só carteira assinada**
- **Só diaristas**
- **Avulso** — escolhendo pessoa por pessoa, podendo misturar os dois tipos

---

> ✅ **NOME (decisão do Victor, 10/09/2026): "Arquivo de pagamento", sem citar banco.**
> Saiu o "C6" de tudo — botão, título e texto. O arquivo é um formato de remessa e
> **serve pra qualquer banco**; amarrar o nome a um deles fecha a porta pro dia em que
> a empresa trocar. Vale pro código também, quando a Etapa 1 for renomeada.

## ETAPA 1 — Arquivo de pagamento entra no Financeiro

**Como saber que funcionou:** estando no Financeiro com um período filtrado, em **2 cliques**
sai o arquivo do banco — sem trocar de aba e sem redigitar data nenhuma. E tudo que a aba
C6 fazia continua sendo possível.

**O que muda na tela**
- Botão **"Gerar pagamento C6"** dentro do Financeiro
- Ele abre um **popup flutuante** com a prévia já montada, usando o **período e o tipo que
  já estão selecionados** (o Financeiro tem exatamente os mesmos filtros que o C6 pede)
- A prévia é **editável, igual à tela de hoje**: corrigir valor, corrigir chave PIX, data em
  lote, tirar gente da lista, seleção múltipla
- Escolha de escopo (tudo / só CLT / só diarista / avulso)
- Botão **"Gerar arquivo do banco"**
- A aba "Pagamento C6" sai do menu (12 abas → 11)

**Travas de dinheiro que continuam valendo**
- Aviso antes de gerar quando tem problema na lista (sem PIX, valor zerado), com a escolha
  de gerar assim mesmo ou só os limpos
- Bloqueio de gerar sem enxergar os valores (quem está com valor mascarado não gera —
  senão pagaria errado)

**Banco:** nada muda.
**Risco:** baixo. A tela do C6 (1.223 linhas) é reaproveitada, não reescrita.
**Testes:** os que já existem do C6 continuam valendo + E2E do caminho novo (filtrar →
botão → prévia → editar → gerar).

---

## ETAPA 2 — Histórico de pagamentos no Financeiro

**Como saber que funcionou:** abrir o Financeiro e enxergar, sem clicar em nada, os
pagamentos do mês corrente — as semanas dos diaristas e o mês do carteira assinada — e
chegar nos detalhes de qualquer um com **um clique**.

**O que já existe (não precisa criar)**
- Tabela de períodos com as semanas gravadas ("Semana 07/09 a 13/09"), com situação
  aberta/paga, desde julho
- Um seletor que, ao escolher a semana, já preenche as datas do filtro

**O que falta (é o que vai ser feito)**
- O **histórico navegável**, no espírito das quinzenas do driverpay
- **Ciclos diferentes por tipo de contrato**: diarista **semanal**, carteira assinada
  **mensal** — e **os dois configuráveis**, não chumbados no código
- Dentro do mesmo lugar, os dados **separados** por tipo — sem aba própria pra cada um

**Como fica na tela — GAVETAS (design fechado pelo Victor em 10/09/2026)**

Uma **gaveta por mês**; dentro dela, as **semanas**. O mês fechado já mostra tudo que
importa — *"sem precisar abrir as gavetas"* (palavras dele). Abrir só serve pra ver as
semanas por dentro.

```
FINANCEIRO

▶ SETEMBRO / 2026    R$ 48.900,00   38 pagos (32 diaristas · 6 CLT)   9 descontados   4 erros

▼ AGOSTO / 2026      R$ 45.200,00   37 pagos (31 diaristas · 6 CLT)   6 descontados   3 erros
    ├ 01–07/08   paga     R$ 3.100,00   21 pagos (18 D · 3 CLT)   2 descontados   1 erro
    ├ 08–14/08   paga     R$ 2.890,00   19 pagos (16 D · 3 CLT)   3 descontados   2 erros
    ├ 15–21/08   ABERTA   R$ 3.200,00   22 pagos (19 D · 3 CLT)   1 descontado    0 erros
    └ 22–28/08            R$ 3.260,00   20 pagos (17 D · 3 CLT)   0 descontados   0 erros
    ─────────────────────────────────────────────────────────────
    Carteira assinada (mês)   aberto   R$ 8.400,00 · 16 pessoas
```

**Os números que aparecem SEM abrir** (no mês E em cada semana):
- **valor total** do período
- **quantos funcionários foram pagos**
- **a divisão**: quantos diaristas e quantos carteira assinada
- **quantos foram descontados**
- **quantos erros**

✅ **DECIDIDO (Victor, 10/09/2026): a semana tem os DOIS vínculos.** Por isso o título é
só **"Por semana"**, sem a palavra "Diaristas" — carteira assinada também aparece ali
(adiantamento, extra), e é o que faz existir erro de CLT dentro de uma semana. O bloco
roxo no pé da gaveta continua sendo o **pagamento mensal** do carteira assinada, que é
outra coisa. Um clique na semana leva pro detalhe dela.

**Erros (decisão de 10/09):** aparecem **separados por vínculo** no mês E na semana
(`4 erros (3 D · 1 C)`). Passando o mouse na tag, um balão mostra **quem errou, a equipe
(function_role), o vínculo, a data e o erro escrito** (a observação do registro).
Clicando, abre a lista completa — na semana, só a dela; no mês, **todas as semanas
daquele mês** — sempre separada em Diaristas e Carteira assinada, com o total de pacotes.

✅ **DECIDIDO (Victor, 10/09/2026): a semana cai no mês em que foi PAGA.** Palavras dele:
*"ela cai no mês que foi paga"*. Então a semana 29/09–05/10, paga em outubro, aparece na
gaveta de **outubro** — é como o caixa fecha. A data que manda é a do pagamento, não a
do início nem a do fim da semana. Não perguntar de novo.

### Recibo em PDF — gerar e publicar (decisões do Victor, 10/09/2026)

> ✅ **FEITO em 11/09/2026**, com duas diferenças do que estava escrito aqui, ambas
> por motivo prático descoberto na hora:
> - **Vários recibos vêm num .zip**, não em vários downloads: o navegador **bloqueia**
>   downloads em sequência depois do segundo, e a pessoa receberia 2 de 40 sem aviso.
> - **Os recibos aparecem em um bloco no topo da tela de erros**, não numa aba separada
>   — quem nunca errou também recebe recibo, e uma aba "Erros" vazia ao lado de uma aba
>   "Recibos" cheia seria confuso. O selo NOVO e o contador ficam pra depois.

- **Botão de PDF na gaveta do mês E na de cada semana.** Clicando, abre a lista de quem
  entra: filtro por vínculo (todos / só diarista / só carteira assinada) **e** seleção
  pessoa a pessoa, podendo **misturar** alguns diaristas com alguns de carteira assinada.
  O filtro muda só quem APARECE; quem já foi marcado continua marcado.
- ✅ **Baixar e publicar são ações SEPARADAS** (*"pode deixar separado mesmo"*): dá pra
  gerar o PDF, conferir, e só então publicar. Publicar antes de conferir é o caminho pra
  o funcionário receber um recibo errado.
- **Baixar** abre em outra aba e salva. **Publicar** manda o mesmo PDF pra tela do
  funcionário.
- **Onde o funcionário vê:** na tela "Meus Erros" que já existe (`EmployeeErrorsPage`,
  por período de pagamento), agora com duas abas — **Recibos** e **Erros**. Recibo novo
  vem com selo NOVO e contador na aba, igual ao espelho do entregador no driverpay.
  Quando houve desconto, a linha diz o porquê ("Com R$ 25,00 de desconto por erro").
- **Dois modelos de recibo**, ambos com 2 vias: carteira assinada (salário, adicional
  noturno, salário família, INSS, bases de FGTS e IRRF) e diarista (diárias, dias
  listados, descontos, e a linha dizendo que não há retenção pela empresa).
- **Isolamento por período (confirmado com o Victor):** cada semana é um período fechado.
  Abrir Janeiro/Semana 2 mostra só o que foi pago e descontado naquela semana; outro mês,
  outra semana, outros dados. Vale pra tela, pro arquivo de pagamento e pro PDF.

### ⚠️ REGRA: quem MUDA de diarista para carteira assinada (Victor, 10/09/2026)

*"Começa como diarista, futuramente muda pra CLT — o sistema não exclui o histórico dele.
Mantém o histórico de diarista, e os próximos como carteira assinada."*

> ✅ **NO AR desde 11/09/2026** — migration `20260911020000` aplicada: 3.605 pagamentos
> carimbados, 0 sem vínculo, e um **trigger** carimba todo pagamento novo lendo a ficha
> na hora. Provado com INSERT que se desfaz sozinho. ⚠️ **Correção do que está escrito
> abaixo:** o campo que vale é **`employees.employment_type`** (o operacional, que filtra
> a lista e o relatório), **não** `contract_type` (que é só cadastro). Os dois existem e
> **discordam em 21 pessoas** — decisão pendente do Victor.
>
> 🟡 **O selo "era Diarista até 31/07" ainda NÃO foi feito.** O carimbo já existe no
> banco e a gaveta já conta certo; falta só o aviso na tela.

**O problema é real e foi medido (10/09):** o vínculo vive SÓ na ficha
(`employees.contract_type`); a tabela `payments` **não tem coluna nenhuma de vínculo**.
Então trocar a ficha de uma pessoa reescreve o passado dela: os pagamentos de julho e
agosto passam a contar como CLT sem ninguém ter mexido neles, e o "38 pagos (32 diaristas
· 6 CLT)" das gavetas antigas muda sozinho. Hoje são 33 CLT, 37 diaristas e **22 sem
vínculo definido** em Caratinga.

**A regra:**
- O pagamento guarda o vínculo **do dia em que foi feito** — um carimbo, não um espelho da
  ficha. É o mesmo padrão que o driverpay já usa (`driver_name_snapshot`, `rate_snapshot`).
- Mudar a ficha vale **daquele dia em diante**. O que já foi pago não se mexe.
- O histórico continua inteiro: a mesma pessoa aparece como **diarista** nas semanas antigas
  e como **carteira assinada** nas novas, e as duas coisas são verdade.
- O recibo em PDF segue o carimbo do pagamento — recibo antigo continua saindo no modelo de
  diarista, mesmo depois de a pessoa virar CLT.
- Na tela, quem mudou no período leva um selo do tipo **"era Diarista até 31/07"**, pra
  ninguém achar que é erro de contagem.

**Banco:** `payments` ganha o vínculo carimbado (migration aditiva; o que já existe é
preenchido com o vínculo atual da ficha, que é a melhor verdade disponível pro passado —
e daí em diante nunca mais muda sozinho). Os períodos passam a saber a que tipo de
contrato se aplicam e qual o ciclo.
Migration aditiva — o que já está gravado continua valendo como "semanal / diarista".
**Testes:** unitários do cálculo dos ciclos (semana que atravessa o mês, mês fechado) +
E2E navegando pelo histórico.

---

## ETAPA 3 — Espelho de pagamento (o modelo do recibo)

Baseado no PDF `569 - REC PGTO.pdf` (holerite da CD Logística, Julho/2026, feito pela
contabilidade Arruda no sistema SCI).

**Como saber que funcionou:** rodar o mês de Julho/2026 no sistema e o valor líquido bater
**centavo a centavo** com os 12 recibos do PDF. O PDF é o gabarito.

### O que o espelho mostra, e de onde vem cada pedaço

| No espelho | Situação hoje |
|---|---|
| Empresa: nome, endereço, CNPJ | ✅ já tem |
| Mês de referência | ✅ já tem |
| Nome, CPF, função | ✅ já tem |
| Código do colaborador | ⚠️ dá pra usar o crachá |
| Admissão | ⚠️ só 2 dos 14 CLT preenchidos |
| **PIS** | ⚠️ campo existe, **vazio nas 98 pessoas** |
| **CBO, CTPS/Série** | ❌ não existem |
| Salário mensalista (30 × valor) | ❌ o sistema só tem **diária** |
| **Adicional noturno** | ✅ já tem, calculado certo |
| Salário família | ❌ precisa de dependentes |
| **INSS** (faixa 7,5% / 9%) | ❌ cálculo novo |
| PLR, crédito do trabalhador, férias | ❌ cada um é uma regra |
| Totais e líquido | derivado |
| Base INSS / FGTS / Valor FGTS / Base IRRF | ❌ cálculo novo |
| 2 vias + assinatura | layout |

### Sub-etapas

**3a. Cadastro** — abrir na ficha do funcionário: PIS, CTPS/série, CBO, salário mensal,
dependentes. *Depende de alguém preencher os dados das 16 pessoas CLT.*

**3b. A conta** — INSS por faixas, IRRF com deduções, FGTS 8%, salário família, adicional
noturno, DSR. As tabelas do governo ficam **versionadas por ano de vigência**, e a data
aparece na tela.

**3c. O documento** — o espelho no formato do modelo, com as 2 vias e a assinatura, com o
mesmo **escopo de seleção** (tudo / só CLT / só diarista / avulso).

### O que precisa ser dito com clareza

- **Errar folha vira problema trabalhista.** Enquanto não bater com a contabilidade por
  alguns meses, o sistema não deve ser a fonte oficial.
- **As tabelas mudam por lei todo ano.** Sem atualizar, a folha sai errada em silêncio.
- **Férias, 13º, rescisão e eSocial não entram aqui** — cada um é do tamanho do resto.

---

## Ordem combinada

1. **Etapa 1** — C6 dentro do Financeiro
2. **Etapa 2** — Histórico de pagamentos
3. **Etapa 3** — Espelho (3a cadastro → 3b conta → 3c documento)

**Relatórios** fica fora por enquanto: vai receber implementações próprias antes, e só
depois se decide se funde com o Financeiro (evita mexer duas vezes).

---

## Em aberto (decidir na hora certa)

- **Permissões:** hoje dá pra liberar Relatórios pra alguém sem liberar o Financeiro. Com o
  C6 dentro do Financeiro, quem tem acesso ao Financeiro passa a poder gerar pagamento?
- **Quem entra na primeira folha:** os 14 CLT de Caratinga (que já batem ponto aqui) ou
  também os 2 de Ponte Nova?
- **Modo de conferência:** o sistema roda em paralelo à contabilidade por alguns meses,
  mostrando as diferenças, antes de virar oficial?
