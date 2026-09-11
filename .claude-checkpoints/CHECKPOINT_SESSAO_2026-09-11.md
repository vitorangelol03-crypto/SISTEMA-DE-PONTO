# CHECKPOINT — Sessão 10→11/09/2026 (madrugada)

> Duas frentes: **a nota dividida virou de lado** (por CNPJ, não entre CNPJs) e a
> **Etapa 2 do Financeiro** ficou completa. O Victor autorizou trabalhar enquanto
> dormia: *"pode começar E PODE FAZER TUDO"*, depois de eu listar onde pararia.

---

## 0. ⚡ O QUE VOCÊ PRECISA SABER EM 30 SEGUNDOS

| | |
|---|---|
| ✅ Suíte completa | **96/96 arquivos, 1.467 testes, ZERO falha** (rodada 2× ) |
| ✅ tsc · lint · build | limpos |
| ✅ Migration do carimbo do vínculo | **APLICADA e provada** (3.605 pagamentos) |
| ✅ Edge fn `employee-public-api` v15 | **no ar**, rotas antigas sondadas e OK |
| ✅ Recibo em lote + publicar pro funcionário | **feito** |
| ✅ E2E da tela nova | **6/6**, com dado real de produção |
| ✅ E2E do recibo no celular do funcionário | entra com CPF+PIN e abre o PDF |
| ✅ Nome do banco fora da tela | tinha ficado só no mockup (§3.5) |
| 🔴 **FALTA VOCÊ** | 1 policy de bucket (§5.1) e 1 decisão (§5.2) |

---

## 1. 🔴 O ERRO DE R$ 82.980 QUE A REVISÃO PEGOU

A gaveta **aberta** somava R$ 16.194 e a **fechada** dizia R$ 8.472. Pior: os
R$ 1.748 do dia 27/07 apareciam em **julho E em agosto**.

**Causa raiz:** produção tem **semanas sobrepostas** — "21/07 a 27/07" é paga em
julho e "27/07 a 02/08" em agosto, e o dia 27/07 está nas duas. Cada lançamento
caía em TODAS as semanas que o continham.

**Regra nova — dono único:** a semana que **começa antes** fica com o dia
(empate: termina antes, depois o id). Provado com o banco de verdade:

| | |
|---|---|
| Caixa real (todos os pagamentos de Caratinga) | **R$ 319.467,00** |
| Soma das gavetas **agora** | **R$ 319.467,00** ✓ |
| Soma das gavetas **antes** | R$ 402.447,00 — **R$ 82.980 a mais** |

O primeiro conserto (dedupe só no mês) estava pela **metade**: tirava a
duplicata do mês e deixava as semanas duplicando entre si. E um teste meu
**carimbava a duplicação como certa** — foi reescrito pra provar a invariante.

---

## 2. As outras 9 correções da mesma revisão

| O que estava errado | Como aparecia |
|---|---|
| Valor **mascarado** virava zero | a gaveta dizia "0 pagos" pra quem não pode ver dinheiro |
| 15 erros fora de qualquer período **sumiam calados** | dinheiro e erro reais fora de toda soma |
| Bloco roxo dizia "sem divisão por semana" | mentira: o CLT está DENTRO das semanas; somar os dois contava R$ 3.879 em dobro |
| Balão do hover **cortado** | `overflow-hidden` da gaveta fechada |
| Clicar em "sem erro" abria popup vazio | parecia defeito |
| 112 RPCs de uma vez | rajada; agora de 6 em 6 |
| Falha na busca deixava dado **da consulta anterior** na tela | número velho sem aviso |
| Piscava "Nenhum período cadastrado" | `histLoading` começava `false` |
| PDF do mês usava 1º e último da lista | com semanas sobrepostas, cortava o mês |

---

## 2.1 🔴 O BUG QUE SÓ O E2E PEGARIA

A linha do mês era um `role="button"` que **envolvia** a tag de erros e o botão
"PDF do mês" — botão dentro de botão. Medido no navegador:

```
>>> SEMANAS VISIVEIS AO ABRIR A ABA: 3      ← a gaveta abre sozinha, certo
>>> POPUP DO PDF APARECEU? 0                ← o clique não chegou no botão
>>> SEMANAS DEPOIS DO CLIQUE: 0             ← fechou a gaveta
```

**Clicar em "PDF do mês" fechava a gaveta em vez de abrir o PDF**, porque o nome
acessível da linha inteira incluía o texto do botão. E o leitor de tela anunciava
a linha toda como um botão só. Agora quem é botão é o de abrir/fechar, pequeno, à
esquerda, com `aria-expanded` — e o clique na linha segue valendo como atalho de
mouse.

---

## 3. O que ficou pronto nesta leva

### 3.1 Recibos EM LOTE com a lista de quem entra
*"abre um popup com lista dos funcionários; podem separar diarista ou carteira
assinada, ou tirar somente de alguns — diarista junto com carteira assinada"*.

O filtro de vínculo **não desmarca ninguém**, só muda quem aparece — por isso dá
pra marcar todos os diaristas, trocar pra CLT, marcar mais dois e gerar os dois
juntos. Começa com todo mundo marcado.

**1 pessoa = PDF. Mais de uma = 1 arquivo .zip** — o navegador bloqueia downloads
em sequência depois do segundo, e a pessoa receberia 2 de 40 sem aviso nenhum.

### 3.2 Publicar o recibo pro funcionário
Aparece na aba de erros dele, com o valor e um botão "Abrir". Bucket **privado**
+ link **assinado** de 10 min (ele não tem login). Republicar **substitui** e zera
o "visto". Publica um a um: se o 30º falhar, os 29 que foram mantêm o selo.

**Baixar e publicar são botões separados** — decisão sua: conferir antes de mandar.

**Provado ponta a ponta** (com um recibo de mentira, apagado no fim):

| Passo | |
|---|---|
| PDF sobe pro bucket privado | ok |
| Registro da publicação grava | ok |
| A edge fn devolve o recibo pro funcionário | **sim** |
| Título e valor chegam certos | `PROVA (apagar)` / `123.45` |
| O link assinado **baixa um PDF de verdade** | **sim** |
| `viewed_at` carimba na primeira leitura | **sim** |
| Sobrou lixo? | **0 registros** |

O único elo que falta é o **upload pelo navegador**, que depende da policy (§5.1).

### 3.5 O nome do banco saiu de TUDO
*"Tire completamente o nome do Banco C6 — o arquivo pode ser usado para qualquer
banco, não somente C6."* Isso tinha sido feito **só no mockup**; o código de
verdade ainda dizia "Gerar pagamento C6", "Pagamento C6 Bank", "Baixar Planilha
C6". Agora saiu de: botão, título do popup, permissões, auditoria, i18n, tutorial
e **de dentro da planilha** (título das 3 abas, instruções e o nome do arquivo,
que virou `Pagamento_em_lote_AAAAMMDD_HHMMSS.xlsx`).

A chave de permissão `c6payment` **continua** — é identificador no banco, não
texto de tela; trocar exigiria migration e não muda nada pra quem usa.

### 3.3 Carimbo do vínculo — a regra do histórico agora vale de verdade
*"Quem começa diarista e vira CLT mantém o histórico."* Cada pagamento guarda o
vínculo do dia em que foi feito.

Provado com INSERT que se desfaz sozinho: ficha CLT → carimbou "Carteira
Assinada"; ficha Diarista → "Diarista"; valor passado de propósito → **não** foi
sobrescrito. 3.605 pagamentos carimbados, 0 sem vínculo. Permissões da RPC
idênticas às de antes.

### 3.4 Vínculo preenchido onde faltava — e o Euder salvo
**Os 3 de Ponte Nova não estavam sem vínculo**: faltava só o campo de cadastro.
O operacional já dizia o que eles são — e o **Euder da Silva Machado é CARTEIRA
ASSINADA**, com 189 pagamentos. Marcar "os 3 como diaristas" teria posto ele
errado na folha. Espelhei o campo que já estava preenchido. Registro em
`backups/2026-09-11-vinculo-ponte-nova/`.

---

## 4. Como rodar a suíte NESTA máquina (armadilha resolvida)

O problema nunca foi o número de arquivos, era **concorrência**: mesmo em bloco
de 8, dois workers morriam. `npm test` puro dá **57 "Failed to start forks
worker"** e roda só 38 de 96 — uma rodada dessas **não vale**.

```
npx vitest run --maxWorkers=3      # 96/96, 1.467 testes, ~24 min
```

---

## 5. 🔴 O QUE DEPENDE DE VOCÊ

### 5.1 Uma policy de bucket (2 minutos)
O modo automático **barra criar policy em `storage.objects`** — é tabela
compartilhada do Supabase, e eu não contorno isso. A tabela e o bucket já estão
aplicados; falta **só** este arquivo:

`supabase/migrations/20260911051000_payment_receipts_storage_policy.sql`

Cole no SQL Editor do Supabase e rode (ou `supabase db push`).

> Os arquivos de migration foram **renomeados pra bater com as versões que o banco
> registrou** — senão um `supabase db push` tentaria rodar tudo de novo. Hoje só
> este 3/3 aparece como pendente, que é a verdade. **Sem ele o botão "Publicar" dá erro de
permissão** (o aviso na tela diz exatamente isso e onde está o remédio).

Segue o padrão que os 4 buckets do driverpay já usam em produção: checa a
**permissão do módulo**, não só a empresa — quem não pode ver pagamento não pode
escrever um recibo de pagamento.

### 5.2 🔴 21 pessoas com os dois campos de vínculo DISCORDANDO
Não mexi: muda relatório e filtro de gente que recebe de verdade.

- **19** com cadastro "CLT" e operacional "Diarista" (Caratinga) — inclui gente
  com 171, 157 e 138 pagamentos.
- **2** com cadastro "Diarista" e operacional "Carteira Assinada".

**Quem manda hoje é o operacional (`employment_type`)** — é ele que filtra a
lista, o filtro "Tipo de Vínculo" e o carimbo do pagamento.

<details><summary>A lista completa (quantos pagamentos cada um tem)</summary>

**Cadastro "CLT", operacional "Diarista" — 19, todos de Caratinga:**
Alexsandro lombardo alves (171) · Gerson Antonio Reginaldo (157) · Roger Dias
Monteiro dos Santos (138) · Eduardo da Silva Junior (86) · Ian Willian Gomes da
Silva Santos (78) · Bruno Eduardo Silva (53) · Jose Geraldo (52) · Erick de
Paula Matias (31) · Lucas Manaces de Almeida (19) · Matheus Henrique Gomes
Ferreira (15) · Milleny Zeli (15) · Hendrews Dutra (13) · Maria Clara Vieira (3)
· Tiago Marinho da Silva (2) · Henrique Goncalves (1) · Jose Adelmo dos Santos
Junior (1) · Willian Weslley Santos da Silva (1) · DayaneAzevedo (0) · Kayque
Belmiro jones (0).

**Cadastro "Diarista", operacional "Carteira Assinada" — 2:**
Marcos Gabriel Caetano das Gracas (39) · Marcos Antonio Pires das gracas (22).

</details>

(O mesmo em `backups/2026-09-11-vinculo-ponte-nova/README.md`, que fica só na sua
máquina — `backups/` é ignorado pelo git.)

**A pergunta:** esses 19 são diaristas (e o cadastro está errado) ou CLT (e os
carimbos precisam ser refeitos pra eles)? Quanto antes, melhor — Ponte Nova
entra este mês.

### 5.3 🟡 Registrado, não corrigido
- O filtro "Tipo de Vínculo" do `getPayments` (`database.ts:1082`) olha a FICHA,
  enquanto o histórico exibe o CARIMBO. Pra quem mudou de vínculo, a mesma linha
  pode aparecer "Diarista" e sumir do filtro "Diarista". Não quebra nada hoje.
- 3 PDFs de teste soltos na raiz (`espelho.pdf`, `lote.pdf`, `x.pdf`), de
  10/09. Não commitei nem apaguei — são seus.

---

## 6. Armadilhas desta máquina

- **`--maxWorkers=3`** é obrigatório (§4).
- `--no-isolate` **faz mock vazar entre arquivos** (49 falhas fantasmas).
- E2E e vitest juntos se atrapalham: o login do portal não renderiza em 10s com
  a máquina carregada. Um de cada vez.
- `getByText` do Playwright procura na PÁGINA inteira: com dois cartões dizendo
  a mesma coisa (e os dois certos), dá strict mode violation. Prender ao cartão.
