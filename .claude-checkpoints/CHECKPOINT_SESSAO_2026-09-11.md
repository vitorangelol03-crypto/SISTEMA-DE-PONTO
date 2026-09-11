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
| ✅ Policy do bucket | **APLICADA em 11/09** — publicar funciona ponta a ponta |
| 🔴 **FALTA VOCÊ** | 1 decisão (§5.2) |

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

## 3.6 🔴 O DEPLOY QUEBROU — e por que a validação local não pegou

O push subiu, a Vercel tentou publicar e **falhou em 16 segundos**:

```
Could not resolve "../../supabase/functions/driver-public-api/nfCheck"
  from "src/utils/nfSplit.ts"
```

O que estava no ar **não mudou** — o deploy quebrado nem chegou a substituir o
anterior, então ninguém viu nada.

**Por que passa aqui e quebra lá:** o `.vercelignore` ignorava a pasta `supabase`
INTEIRA, e o `src/utils/nfSplit.ts` reexporta a conta do desconto de dentro dela
(de propósito — é a mesma função do robô e do relatório, que em 10/09 divergiram
e deixaram dinheiro sem nota). Aqui o arquivo existe; lá, a Vercel nunca o
recebeu. `npm run build` local **nunca ia pegar isso**.

**Corrigido:** o `.vercelignore` agora ignora `supabase/migrations`,
`supabase/.temp` e `supabase/.branches` — não a pasta toda.

**E travado:** `tests/unit/vercelignore.spec.ts` percorre TODOS os imports
relativos de `src/` e reprova qualquer um que caia numa pasta ignorada. Provei
que ele pega, voltando o arquivo ao estado quebrado:

> `src/utils/nfSplit.ts importa "../../supabase/.../nfCheck" → que está em`
> `"supabase" no .vercelignore. O build da Vercel não vai achar.`

---

## 3.7 🔴 A AUDITORIA DA POLICY ACHOU TRÊS BURACOS — DOIS ERAM MEUS

Pedi a três auditores que tentassem furar a policy do bucket por ângulos
diferentes, e cada achado grave passou por refutadores independentes.

**A policy passou**: um usuário da empresa A é mesmo barrado nos recibos da B.
Mas eles seguiram a linha e acharam o resto.

### (a) 🔴 Qualquer um baixava o recibo sabendo só o CPF — ERA MEU

A rota `employee-receipts` nasceu só com `employeeId + companyId`, no mesmo nível
das outras daqui. Confirmei contra a produção:

```
Passo 1 — só o CPF:    lookup-employee devolveu o id (e nome, CPF, PIX, telefone)
Passo 2 — com esse id: employee-receipts respondeu. Sem senha. Sem PIN.
```

A chave anon está no bundle público do site. Era o holerite da pessoa, com o
salário, ao alcance de quem soubesse o CPF. Para contagem de erro já era
discutível; para holerite não dá.

**Corrigido e provado depois do deploy:** a rota exige o PIN e confere no
SERVIDOR, com bcrypt — o mesmo PIN que a pessoa já digita pra entrar.
`sem pin → PIN obrigatorio` · `pin errado → PIN invalido` · `pin certo → entrega`.

### (b) 🔴 Quem só podia VER pagamento podia APAGAR recibo — ERA MEU

A policy nasceu `for all`, e `for all` inclui DELETE. Três supervisores tinham
esse poder sem querer. Agora são 3 policies — **ler / publicar / republicar** — e
**nenhuma de apagar**. O UPDATE fica porque republicar o mesmo período SUBSTITUI
o recibo, que é como se corrige um valor errado. Migration `20260911124322`.

### (c) 🔴 O `create-user` não olhava empresa — JÁ EXISTIA, e foi corrigido

Nenhuma ação comparava a empresa de quem chama com a do alvo. Como a função
escreve com `service_role` e o porteiro liberava qualquer `role === 'admin'`, o
administrador de UMA unidade alcançava os usuários de TODAS. E o
`handleResetPassword` — ao contrário do `handleDelete` — **não protegia os
mestres**: dava pra zerar a senha do 9999/2626, entrar com a senha padrão e virar
mestre.

**Provado com o ataque de verdade** (`tests/111-create-user-empresa.spec.ts`):
rodado contra a versão que estava no ar, deu `Expected 403, Received 200` — o
admin da Ponte Nova redefiniu mesmo a senha de um usuário da Caratinga. Depois do
deploy, 7/7:

| Tentativa | Antes | Agora |
|---|---|---|
| Redefinir senha de outra empresa | conseguia | 403 |
| Redefinir senha do MESTRE | conseguia | 403 |
| Excluir / renomear de outra empresa | conseguia | 403 |
| Criar usuário DENTRO de outra empresa | conseguia | 403 |
| Admin na PRÓPRIA empresa | ✓ | ✓ continua |
| Mestre nas duas empresas | ✓ | ✓ continua |

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

### 5.1 ✅ RESOLVIDO — a policy do bucket está aplicada

Na madrugada o modo automático barrou (é tabela compartilhada do Supabase).
Quando você perguntou se eu não conseguia rodar, tentei de novo e **passou**.
Migration `20260911051000_payment_receipts_storage_policy.sql`.

**Provado com clique de verdade** (`tests/110-publicar-recibo-do-painel.spec.ts`):
entra no painel, abre a lista de quem entra, deixa uma pessoa marcada, clica em
"Publicar" — e confere que o PDF foi parar no bucket privado, que a linha gravou
com o caminho `{empresa}/{periodo}/{pessoa}.pdf`, que o selo "no app" apareceu, e
que o arquivo baixado é um PDF de verdade com mais de 1 KB. Apaga tudo no fim.

Era **esse** o elo que dependia da policy: o navegador, com o JWT de quem usa o
sistema, escrevendo no bucket. O resto da corrente já estava provado.

### 5.1.1 🔴 NUNCA rode `supabase db push` neste projeto

Descoberto ao procurar um jeito de aplicar a policy pelo terminal:

```
arquivos locais que o CLI acha que FALTAM aplicar: 78  (o mais antigo é de 2025-11-04)
migrations aplicadas que NÃO têm arquivo local:   137
```

O histórico da pasta e o da tabela `supabase_migrations.schema_migrations`
divergiram faz tempo. Um `db push` tentaria **reaplicar 78 migrations de uma vez**
contra a produção, algumas de novembro de 2025.

**O jeito certo de aplicar UMA migration** é a ferramenta que aplica só aquele
SQL — e depois **renomear o arquivo local pro `version` que ficou registrado**,
senão ele fica pendente pra sempre e engorda essa dívida. Foi o que fiz com as 4
migrations de hoje.

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
