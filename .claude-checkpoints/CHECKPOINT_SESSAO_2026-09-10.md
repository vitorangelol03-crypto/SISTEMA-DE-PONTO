# CHECKPOINT — Sessão 10/09/2026

> **A NOTA DIVIDIDA VIROU DE LADO: a divisão passou a ser DENTRO de um CNPJ.**
> Ordem do Victor, vinda da Shopee e da iMile: *"a Shopee não pode misturar com a nota
> que vai no CNPJ da iMile, e vice-versa"*.
>
> ⚠️ **NÃO FOI PARA PRODUÇÃO.** Falta o deploy da edge fn + o push (Vercel), e o
> apagar das 2 notas do Gessiley — os três esperando o OK do Victor.

---

## 1. O que estava errado (medido, não suposto)

De 04/09 a 09/09 a divisão era entre os DOIS TOMADORES: o sistema somava tudo
(`buildComboTotal`), cortava no meio e mandava uma metade contra a Shopee e a outra
contra a iMile.

Caso real, único no banco — **GESSILEY, 06/09**:

| | Valor de verdade | O que o sistema mandou emitir |
|---|---|---|
| Shopee/Anjun/Loggi | R$ 14.476,00 | R$ 7.990,30 |
| iMile | R$ 1.504,60 | R$ 7.990,30 |

**R$ 6.485,70 da Shopee saíram faturados dentro da nota da iMile.** As duas ainda por
cima no mesmo emissor (Joaerson) — o furo que a trava de 07/09 fechou depois.

## 2. A regra nova

Cada CNPJ tomador é um bloco fechado. O valor DELE é que se divide entre as duas
pessoas cadastradas. Nada atravessa de um bloco pro outro. Dividindo os dois, saem
4 notas: 7.238 + 7.238 (Shopee) e 752,30 + 752,30 (iMile).

A trava do backend **inverteu**: exigia tomadores DIFERENTES, agora exige o MESMO
tomador e emissores (pessoas) diferentes.

## 3. Decisões do Victor nesta sessão (não perguntar de novo)

- **30 minutos** continuam. As mensagens que diziam "10 minutos" (número cravado desde
  que a janela virou 30, em 05/09) foram corrigidas na raiz — agora saem da constante.
- **Um CNPJ de cada vez:** *"só quando ela anexar [as duas da Shopee] é que vai contar
  os trinta minutos da iMile"*. O backend já travava; o que faltava era a **tela dizer**.
- **Pagamento segue as notas:** dividiu os dois CNPJs → **4 pagamentos** no relatório.
- **Vale/perda desconta no CNPJ de MAIOR valor** (e o que não tem CNPJ vinculado, como
  a Zapex, também). A soma das partes sempre fecha o líquido — o rodapé não muda.
- **Apagar as 2 notas do Gessiley** de 06/09 pra ele refazer.

## 4. O que mudou no código

**Edge fn `driver-public-api`**
- `buildComboTotal` **removida** (era a origem da mistura; o comentário no lugar dela
  avisa pra não recriar).
- `nfSplitPreview` passa a receber `emitterId` + `mirrorKey` e usa o total DAQUELE CNPJ.
- `buildValueCandidates` devolve também o valor **por espelho** (`porEspelho`).
- `nfUpload`: trava invertida (`!==` → recusa); as fatias da parte 1 saem de **cada
  candidato daquele CNPJ**, e o `splitTotal` gravado é o total de onde a fatia saiu.
- `nfSlots`: `splitOpen` vai pro **mesmo** cartão da 1ª nota; os outros ganham
  `splitBlocked` (a tela explica em vez de deixar clicar e tomar erro).

**Funções puras novas** (`nfCheck.ts`, testadas no vitest): `escolherTotalDoCnpj`
(de onde sai a fatia, na ordem espelho-do-slot → abatido → bruto → líquido; **null**
quando não há base — o app não oferece dividir em vez de chutar) e `fatiasDaParte1`.

**App do entregador** (`DriverApp.tsx`): a escolha "inteira ou dividida" saiu do topo
da tela e foi **pra dentro de cada cartão**, com o valor daquele CNPJ na frente. Dá pra
dividir a Shopee e mandar a iMile inteira. Cartão travado explica o porquê e até quando.

**Painel** (`driverPayShared.ts`): `splitRecipientsFromNotes` passou a agrupar as duplas
**por tomador**; `linhasDePagamentoDaUnidade` + `repartirLiquidoPorTomador` (em
`nfSplit.ts`) montam 1, 3 ou 4 linhas. Nota antiga sem tomador gravado continua
dividindo a unidade inteira — pagamento já feito não se reescreve.

## 5. Validação

| O que | Resultado |
|---|---|
| typecheck | **0 erros** |
| lint | **0** |
| build | **limpo** |
| unitários de nota (8 arquivos) | **157/157** |
| suíte completa | ver §7 |
| **E2E 107** | ⏳ **depende do deploy da edge fn** (o teste fala com a fn deployada) |

Testes novos escritos: a repartição por tomador (com varredura provando que centavo
nenhum some), as duas funções puras, os 4 pagamentos no relatório, e o E2E 107
reescrito — onde o caso **B** agora prova que **R$ 480,00 (a metade do combinado, que
era o que o sistema mandava emitir) é RECUSADO**, e o **F** prova que a 2ª nota no
outro CNPJ é recusada e o outro cartão fica travado.

## 6. Armadilha nova desta máquina (custou tempo)

`--no-isolate` (o contorno pro vitest não subir worker no WSL) **faz mock vazar entre
arquivos**: a suíte cheia acusou **49 falhas** em `mirrorPdf` e `employeeImportRoundtrip`
que **não existem** — os mesmos arquivos passam **58/58** sem a flag. Usar
`--no-file-parallelism` sozinho; `--no-isolate` só em arquivo que não usa `vi.mock`.

O robô da Shopee estava rodando (5 Chromes a ~90% de CPU, load 11 em 12 núcleos) — é o
que derruba o worker do vitest.

## 6.1 🔴 REVISÃO ADVERSARIAL (3 revisores em paralelo, pedido do Victor) — 6 achados

A primeira versão desta leva **não funcionaria**. Os revisores rodaram o código, não
só leram. O que pegaram, tudo corrigido em seguida:

| # | O que era | Onde |
|---|---|---|
| 1 🔴 | **A dupla NUNCA fecharia.** A parte 1 ocupava a vaga da própria parte 2 (a query filtra por `nota_emitter_id`, e a regra nova obriga o mesmo CNPJ). O entregador tomava "você já enviou a nota deste CNPJ" e perdia as duas em 30 min. **Foi isto que derrubou o E2E caso E — e eu tinha suspeitado de lentidão.** | `index.ts`, bloco da vaga |
| 2 🔴 | Card do espelho **verde "Nota enviada"** com a dupla pela metade (a parte 1 conta em `sent`). A pessoa parava por ali. | `myMirrors` → `nfEnviadas` |
| 3 🔴 | **O vale saía dos DOIS CNPJs.** `somaCnpj_*_abatido` era "bruto daquele CNPJ − TODOS os descontos", igual pros dois. LEANDRO: 18.620,03 + 1.672,03 = 20.292,06 contra 20.454,03 do espelho → **R$ 161,97 sem nota**. Contrariava a decisão "desconta no maior". | `buildValueCandidates` |
| 4 🔴 | **A parte 2 caía no valor CHEIO** quando a conferência da parte 1 falhava por dentro (`splitTotal` null): a metade certa era recusada e uma nota do valor cheio passava, validando junto a parte 1 nunca conferida (~1,5x faturado, tudo verde). | `nfUpload` |
| 5 🟠 | Textos ensinando a regra ANTIGA: "Cada CNPJ abaixo" logo após listar os CNPJs das PESSOAS; e a recusa do servidor dizia "CNPJ DIFERENTE" enquanto a tela dizia "as duas no mesmo CNPJ". | `DriverApp.tsx`, `index.ts` |
| 6 🟠 | Linha de **R$ 0,00 no arquivo do banco** (bloco zerado pelo vale virava 2 linhas zeradas); cartão travado apontando pro próprio cartão com 2 espelhos no mesmo CNPJ. | `driverPayShared.ts`, `nfSlots` |

**A correção de raiz do #3:** `repartirLiquidoPorTomador` passou a viver em `nfCheck.ts`
(a edge fn) e `src/utils/nfSplit.ts` a **reexporta**. É UMA função só decidindo o valor
que a nota tem que ter e o valor que o relatório paga — não dá mais pra divergirem.

**Registrado, NÃO mexido** (pré-existentes, fora do escopo): a Zapex não entra em nota
nenhuma (nunca entrou — `somaCnpj_*` nunca a somou); se a CD validar na mão a parte 1
que espera o par, a dupla nunca expira e só a CD destrava; o prazo vence na tela sem
contagem regressiva.

## 7. Ponte Nova (o Victor avisou: começa a ser usada ESTE MÊS)

**O código funciona lá sem mudança nenhuma** — conferido, não suposto: tudo o que
mexi é por `company_id` (emitters, plataformas, candidatos de valor, policies) e não
há CNPJ nem id de empresa cravado no caminho da nota. As funções da conta
(`escolherTotalDoCnpj`, `repartirLiquidoPorTomador`) são puras.

**O que falta em PN é CADASTRO, não código.** Hoje o driverpay de lá está zerado:

| | Caratinga | Ponte Nova |
|---|---|---|
| CNPJs tomadores (emitters) | 2 | **0** |
| Plataformas | 5 (todas vinculadas) | **0** |
| Entregadores | 133 | **0** |
| Quinzenas | 4 | **0** |

Ordem pra ligar lá:
1. **Cadastrar os CNPJs tomadores** de PN (aba Pagamentos Driver → CNPJs de nota).
   Sem isso **nenhum cartão de nota aparece** pro entregador — nem a inteira.
2. **Cadastrar as plataformas de PN e vincular cada uma ao seu CNPJ.**
3. Importar a quinzena e publicar espelho como em Caratinga.
4. Só pra quem for dividir: **2 emissores (nome + CNPJ)** na ficha do entregador — é
   esse cadastro que liga a opção de dividir.

⚠️ **Atenção no passo 2:** plataforma **sem CNPJ vinculado** não pede nota, e no
relatório dividido o valor dela entra no ajuste que cai no **CNPJ de maior valor**.
Vincular todas evita surpresa.

⚠️ **Avisado e NÃO mexido (fora do escopo desta leva):** o cabeçalho do espelho usa
`MIRROR_COMPANY_NAME = 'CD LOGISTICA'` cravado (`driverPayShared.ts:1289`) + a cidade.
A razão social de Caratinga é **CLAYTON B DOS SANTOS** e a de PN é **CD LOGISTICA
LTDA** — ou seja, o espelho de Caratinga já sai hoje com o nome da outra empresa. Com
PN entrando, vale decidir se o nome passa a vir da `companies`.

## 8. Pendente (esperando o Victor)

1. **Deploy da edge fn** `driver-public-api` — sem ele a regra nova não vale no celular.
2. **Push** (main = deploy na Vercel) — leva junto os **8 commits** de 09/09 que ele
   queria conferir acordado (o C6 dentro do Financeiro).
3. **Apagar as 2 notas do Gessiley** (ids `49c8d398…` e `599e7769…`, quinzena aberta).
4. **E2E 107** só roda depois do passo 1.
