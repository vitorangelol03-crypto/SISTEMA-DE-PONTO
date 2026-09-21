# CHECKPOINT — Sessão 21/09/2026

> **Em uma frase:** as tabelas de INSS e IRRF do sistema estavam **erradas**, e o jeito de
> calcular também — as duas coisas achadas em cima do "pode puxar a tabela da internet?"
> do Victor, e as duas corrigidas com a fonte oficial e o gabarito dos recibos reais.

---

## 1. O que o Victor pediu

Depois de eu dizer que a tabela de imposto era a pendência que eu não conseguia fechar
sozinho: **"vc não consegue puxar essa tabela de contador da rede?"** — e, na sequência,
**"vamos arrumar todas lacunas detectadas"** e **"pode seguir e corrigir que esse sistema
completo"**.

---

## 2. 🔴 As três coisas erradas (em ordem de descoberta)

### 2.1 A tabela do INSS: 3 faixas e o teto

|  | Estava | Oficial |
|---|---|---|
| 1ª faixa (7,5%) | 1.621,**30** | 1.621,**00** |
| 2ª faixa (9%) | 3.041,65 | **2.902,84** |
| 3ª faixa (12%) | 4.562,47 | **4.354,27** |
| Teto | 9.124,94 | **8.475,55** |

Efeito medido: salário 3.000 descontava 245,68 (devia 248,60) · 5.000 → 493,18 (501,51) ·
9.500 → 1.070,67 quando o teto é 988,08.

**Até R$ 2.902 não havia erro** — e é isso que o torna perigoso: era exatamente onde os
11 recibos do gabarito paravam (maior salário R$ 2.200).

### 2.2 O IRRF não tinha a redução da Lei 15.270/2025

Desde janeiro/2026 quem ganha até R$ 5.000 é **isento**, e de R$ 5.000 a R$ 7.350 paga com
desconto decrescente. O sistema não sabia disso e **cobrava imposto de quem a lei isenta**:
R$ 312,89 de quem ganha R$ 5.000, R$ 114,76 de quem ganha R$ 4.000.

### 2.3 🎯 O MÉTODO DE CÁLCULO (o achado que só apareceu porque o gabarito existia)

Ao trocar a tabela pela oficial, **o gabarito dos 11 recibos reais ficou vermelho em 4**.

A tabela oficial publica DOIS jeitos de calcular, e eles discordam em 1 centavo:

| método | erros nos 11 recibos |
|---|---|
| somar faixa a faixa | **4** (Camila 135,24 × papel 135,23) |
| `base × alíquota − parcela a deduzir` | **0** |

A parcela publicada é **arredondada** (a conta exata dá 24,315 e a tabela traz 24,32), e
esse meio centavo vira um centavo depois do truncamento. **A contabilidade usa a parcela
a deduzir.**

E isso explicou o `1.621,30`: não era um valor real — era o limite **entortado** pra fazer
o método errado imitar o resultado certo. Funcionava até R$ 2.902 e quebrava acima.

> 🔴 **A LIÇÃO DESTE DIA: bater com o gabarito não é estar certo — é estar certo no
> pedaço que o gabarito cobre.**

---

## 3. O que foi feito

- **`impostos.ts`**: motor novo `impostoDaTabela` (parcela a deduzir, com queda para a
  soma progressiva quando a faixa não tem `deduzir`); `ReducaoDoIrrf`; `calcularIrrf`
  devolve `valorSemReducao` e `reducao`; tabelas padrão com os valores oficiais.
- **A redução só sai se quem chama pedir** (`{ incidenciaMensal: true }`), e **o padrão é
  não reduzir**. Só a folha do mês liga. 13º e rescisão não — decisão do Victor, porque
  reduzir por engano faz a empresa recolher imposto a MENOS, que vira dívida.
- **Recibo**: a linha do IRRF passa a dizer quanto a lei abateu
  (`27,50% - reducao Lei 15.270 R$ 179,75`), senão o contador vê um imposto menor que o da
  tabela sem saber de onde veio.
- **`FolhaCalculada.reducaoDoIrrf`** e o carregador do banco lendo a coluna nova.
- **Tutorial**: página do INSS com os números oficiais, o teto (988,08) e o atalho da
  parcela a deduzir. Saiu a caixa do truncamento — com a tabela nova ela **deixou de ser
  verdade** no exemplo de R$ 1.700, e tutorial com coisa errada não fica.

### Migrations aplicadas (as 3 liberadas pelo Victor)
| versão | o quê |
|---|---|
| `20260921092418` | faixas e teto oficiais do INSS |
| `20260921092748` | coluna `reducao` + a redução da Lei 15.270 |
| `20260921095508` | `deduzir` em todas as faixas (INSS e IRRF) |

`confirmado` segue **FALSO** nas duas tabelas e a tarja "VALORES EM CONFERÊNCIA" continua
no recibo — decisão do Victor: os números vêm do governo, mas a contabilidade dele não
olhou.

---

## 4. Gabaritos que agora batem

- **11 de 11 recibos reais** da contabilidade Arruda (INSS).
- **O exemplo oficial da Receita** (Lei 15.270): Rita, R$ 6.000, INSS 649,60 →
  base 5.350,40 → imposto 562,63 → redução 179,75 → **IRRF 382,88**. Bate no centavo.

---

## 5. Como foi validado

| O quê | Resultado |
|---|---|
| Suíte unitária | **118 arquivos, 1.858 testes, 0 falhas**, 14/14 rodadas código 0, 0 worker morto |
| E2E folha (`115`–`124`) | **37/37**, saída 0 (1 flaky por carga da máquina, provado rodando o `117` sozinho: 5/5 sem retry) |
| `tsc` · `lint` · `build` | limpos |
| Arquivo novo | `tests/unit/tabelasOficiais2026.spec.ts` (14 testes) |

⚠️ **A máquina estava com o robô da Shopee de pé** (23 Chrome, carga 18+): o pool `forks`
não sobe e mente com código de saída 0. Rodado com `--pool=vmThreads
--no-file-parallelism`, com os 4 arquivos que usam `vi.mock` rodando **sozinhos**.

---

## 6. Três testes que mudaram de expectativa (e por quê)

Nenhum foi "ajustado pra passar" — os três tinham valor antigo:

1. `centavoTruncado`: os exemplos deixaram de cair na borda do centavo com o método novo.
   **Refeitos** com bases que ainda exercitam o bug (1.694 e 1.695).
2. `folhaCalc` "caminho de menos imposto": comparava o imposto já reduzido contra o cheio.
   Agora os dois lados usam a mesma regra.
3. `folhaNoReciboERelatorio`: INSS de 123,58 → **123,57** pela parcela a deduzir.

---

## 7. Pendências

1. 🔴 **Levar ao contador** — três perguntas concretas agora, não uma vaga:
   - as tabelas conferem? (aí `confirmado` vira true e a tarja sai)
   - a redução da Lei 15.270 vale no **13º** e no **saldo de salário da rescisão**?
   - no teto do INSS, vale **988,08** (fórmula) ou **988,09** (o que o material publica)?
2. **6 pessoas** com `employment_type` e `contract_type` discordando.
3. **18 das 21** de carteira sem data de admissão.
4. **0 das 21** com salário preenchido — a folha segue sem uso real.
