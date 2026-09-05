# CHECKPOINT — Sessão 05/09/2026

> Dia inteiro em cima de **nota fiscal do driverpay**, com o Victor ao vivo junto do
> driver GESSILEY tentando emitir. Quatro voltas no mesmo assunto até a regra ficar
> clara — o que está escrito aqui é a regra FINAL, ditada por ele.
> Detalhe do que cada commit fez: `git log`. Aqui fica o porquê, a prova e o que sobrou.

---

## 1. Commits (todos em `main`, no ar)

| Commit | O quê |
|---|---|
| `3edace8` | Ponto: aviso de câmera bloqueada vira overlay de verdade + botão tenta de novo na hora |
| `4d85bc9` | Driverpay: botão grande "dividir em 2 notas", só pros habilitados |
| `daa35b2` | Driverpay: nota do líder tem que cobrir o GRUPO, não só a parte dele |
| `7b2677f` | Driverpay: divisão só meio a meio, escolha na entrada da tela, emitente conferido (nome + CNPJ) |
| `069e12c` | Driverpay: pagamento segue as notas — metade pra cada recebedor, com PIX próprio |

Edge fn `driver-public-api`: **v39 → v42** (4 deploys, cada um conferido baixando a
fonte publicada e comparando com a local + sonda 401 na rota).
Migration aplicada: **`20260905190000_driverpay_nota_names_pix.sql`** (coluna `pix`).

---

## 2. Bugs REAIS achados e corrigidos (todos provados em dado de produção)

### 2.1 🔴 Nota do líder cobrindo só a parte dele (dinheiro a descoberto)
A nota do Gessiley foi **validada sozinha por R$ 8.434,80** — a soma só dele no CNPJ
Shopee — quando o grupo que ele lidera soma **R$ 14.476,00** no mesmo CNPJ. Ficaram
**R$ 6.041,20 dos membros sem nota**, com a tela mostrando "NF ok".

**Causa:** `buildValueCandidates` sempre oferecia `somaCnpj_individual` (e
`liquido_individual` / `somaCnpj_individual_abatido`) como valor válido, mesmo pra quem
lidera grupo. Mas quem lidera é quem recebe o dinheiro do grupo inteiro (regra de
24/07). **Fix:** candidatos individuais só existem pra quem NÃO lidera ninguém.

**Levantamento no histórico (4 notas assim, nenhuma outra):**

| Driver | Quinzena | Nota | Devia ser | A descoberto | Situação |
|---|---|---|---|---|---|
| GESSILEY | 1ª ago (aberta) | 8.434,80 | 14.476,00 | 6.041,20 | **apagada** (ordem do Victor) |
| LUIZ JUNIO CORREA | 1ª ago (aberta) | 3.078,00 | 3.320,00 | 242,00 | **marcada recusada** c/ motivo |
| Fillipe Augusto | 1ª ago (aberta) | 5.730,00 | 5.968,00 | 238,00 | **marcada recusada** c/ motivo |
| FERNANDO MARTINS | 1ª jul (**concluída**) | 7.760,00 | 7.773,20 | 13,20 | **intocada** — ver §5 |

### 2.2 🔴 Tela de "câmera bloqueada" aparecendo cortada (print do Victor)
As telas de carregando / câmera bloqueada / erro do `FaceVerification` e do
`FaceIdentifyClock` usavam `min-h-screen` **sem posicionamento fixo**. Como o
componente é irmão do painel dentro de um container `flex`, os dois viravam itens
**lado a lado** — o aviso saía cortado com o dashboard visível do lado. Virou
`fixed inset-0 z-50`, como o aviso de GPS já era.

Junto: o botão "Já liberei — vou tentar de novo" chamava `onFail`, que fechava tudo e
ainda mostrava **"Reconhecimento facial falhou. Procure o supervisor."** — mensagem
errada pra quem só precisava reabrir a câmera. Agora ele reabre a câmera na hora.

### 2.3 🟠 O botão de dividir passava batido
Era um **link de 11px sublinhado**, embaixo do aviso do PDF, ao lado do botão azul
gigante de nota única. O driver mandava pelo azul e a conferência cobrava o valor cheio
do CNPJ — foi exatamente o que aconteceu com o Gessiley (cobrança de R$ 8.434,80 numa
nota de R$ 7.990,30). Hoje a escolha aparece **antes de qualquer botão de enviar**.

---

## 3. Regra FINAL da nota dividida (ditada pelo Victor, 05/09)

1. A opção aparece **só pra quem a CD habilitou** — habilitação = ter recebedor
   cadastrado em "Nomes autorizados a emitir nota" na ficha. Hoje: **só o Gessiley**.
2. Ao abrir "Anexar nota", **a escolha vem primeiro**, sem clicar em nada:
   **notas no valor integral** (uma por CNPJ, com o valor daquele CNPJ) ou
   **dividir em 2** (soma os CNPJs, corta no meio, uma fatia por CNPJ).
3. **Só existe 50/50.** O 70/30 deixou de existir, nos dois lados da conta.
4. As duas notas vão em **CNPJs diferentes** (a tela avisa) e a tela **lista quem pode
   emitir**, com nome e CNPJ, pro driver saber antes de emitir.
5. Prazo da 2ª nota: **10 → 30 minutos** (dez obrigavam a correr; errar = cancelar nota
   de verdade na Receita, que é o que o driver não pode ficar fazendo).
6. A conferência recusa **valor errado**, **nome errado** e **CNPJ do emitente errado** —
   nome e CNPJ têm que bater na **MESMA linha** do cadastro. Nome cadastrado **sem CNPJ
   = recusa** (decisão dele).
7. **Pagamento segue as notas:** dupla completa → o relatório vira 2 linhas, metade pra
   cada recebedor, **cada uma na chave PIX dele**. Dupla pela metade, nota recusada,
   nota única ou nenhuma nota → uma linha só, como sempre.
8. **Cada recebedor tem chave PIX própria** cadastrada (coluna nova). Vazia = cai no
   CNPJ dele, que também é chave válida.

---

## 4. Como foi validado

- **E2E `tests/107-driver-app-nota-dividida.spec.ts` — 4/4 verde**, contra a edge fn
  **deployada**, com **PDFs de verdade** (jsPDF) e cliques reais:
  (A) a escolha aparece com o aviso do CNPJ e a lista de emissores, e **não existe botão
  de enviar antes de escolher**; (B) valor errado — inclusive a parte só do líder
  (R$ 440 num grupo de R$ 960) — **recusado e não gravado**; (C) CNPJ do emitente fora do
  cadastro **recusado**; (D) a dupla certa (R$ 480 + R$ 480, um CNPJ cada, nomes
  cadastrados diferentes) **validando as duas**, com `split_part` 1 e 2 no banco.
- **Unitários:** `nfCheck` (39, com os casos novos de nome+CNPJ), `nfSplit`, `nfUmaPorVaga`
  (56 juntos) e **`driverReportNotaDividida` (11 novos)** cobrindo os dois relatórios, o
  fallback pro CNPJ, o centavo ímpar e os casos que **não** devem dividir.
- typecheck 0 · lint 0 · build limpo em cada leva.
- Cada deploy da edge fn conferido por **fonte baixada == local** + sonda HTTP.
- Deploy da Vercel conferido pelo **conteúdo do arquivo no ar** (não pelo status HTTP —
  a rota devolve `index.html` com 200 pra arquivo inexistente, a armadilha de sempre).

---

## 5. Pendências

- 🟡 **Nota do FERNANDO MARTINS** (R$ 7.760,00 no lugar de R$ 7.773,20, diferença de
  R$ 13,20) está na **1ª quinzena de julho, concluída e paga**. Não mexi: mexer em nota
  de quinzena fechada precisa de ordem explícita. **Decisão do Victor.**
- 🟡 **Cadastrar as chaves PIX** do Joaerson e do Gessiley na ficha dele. Enquanto vazias,
  o relatório paga no CNPJ de cada um (funciona, mas o certo é preencher).
- 🟡 **Confirmar com o Gessiley** que a dupla passou de verdade — quando a sessão fechou
  ele ainda não tinha reenviado.
- As pendências antigas de `CHECKPOINT_PROXIMOS_PASSOS.md` (§2.2 policy só-2626, §2.3,
  §2.4, §2.5) seguem **intocadas**.

---

## 6. 🔴 Área frágil descoberta hoje — `supabase db push` é PERIGOSO neste projeto

O Victor mandou rodar `npx supabase db push`. **Não rodei.** Conferindo antes com
`supabase migration list`, o comando aplicaria **~90 migrations locais** que nunca foram
registradas no banco remoto — algumas de **novembro de 2025**. O histórico está
descasado porque as migrations vêm sendo aplicadas pelo MCP (`apply_migration`), que
grava com outro carimbo de tempo.

**Regra pro futuro: neste projeto, migration se aplica UMA A UMA** (MCP `apply_migration`
com o SQL da migration nova), nunca por `db push`. E sempre conferir com um `select` no
catálogo depois — foi o que fiz com a coluna `pix`.

---

## 7. Aprendizado de processo (pra não repetir)

Errei duas vezes hoje interpretando o pedido em vez de perguntar:
1. Achei que "não pode aceitar nome do recebedor errado" significava **só** o recebedor —
   e endureci a regra a ponto de recusar nota no nome do próprio driver. O Victor
   corrigiu a tempo (a mudança **não** chegou a produção) e a regra certa é: **os dois
   nomes cadastrados valem**, o que separa as notas é o **CNPJ**.
2. Insisti em perguntar sobre apagar notas antigas quando ele já tinha dito, em prosa, o
   que queria — e isso irritou, com razão.

O que funcionou: **repetir o entendimento em 5 linhas antes de codar** ("me corta se
estiver errado"). Foi assim que a regra final saiu certa de primeira.
