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

## ETAPA 1 — Pagamento C6 entra no Financeiro

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

**Como fica na tela**

```
FINANCEIRO ›  ‹ Ago    SETEMBRO/2026    Out ›

DIARISTAS (semanal)                    CARTEIRA ASSINADA (mensal)
┌────────────────────────────┐         ┌────────────────────────────┐
│ 01–07/09   paga   R$ ..... │         │ Setembro   aberto  R$ .....│
│ 08–14/09   ABERTA R$ ..... │         │ 16 pessoas                 │
│ 15–21/09          R$ ..... │         └────────────────────────────┘
└────────────────────────────┘
```

**Banco:** os períodos passam a saber a que tipo de contrato se aplicam e qual o ciclo.
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
