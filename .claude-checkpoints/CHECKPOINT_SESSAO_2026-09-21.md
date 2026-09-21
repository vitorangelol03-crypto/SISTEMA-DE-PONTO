# CHECKPOINT — Sessão 21/09/2026

> **Em uma frase:** a queixa "o app está duplicando, parece que mandei 2 espelhos" era
> verdadeira na tela — e, puxando o fio, achamos que o print de uma líder estava gravado
> no nome de um membro que não entrega Shopee.

---

## 1. O que o Victor pediu

> *"na parte de pagamentos dos drivers alguns me relataram que o sistema está duplicando
> visualmente para eles, mostrando como se ele tivesse enviado 2 espelhos"* — depois, com
> o print da tela e o do painel: *"sistema atribui aí Mikael quem nem entrega tem da
> shopee"* → *"passa o print pro nome da greice e arruma a tela"*.

---

## 2. 🔴 O print da Greice estava no nome do Mikael (dado de produção, corrigido)

Não era duplicata de linha: 183 publicações de espelho sem chave repetida, 374 prints sem
par idêntico. O que existia era **atribuição errada**:

| | |
|---|---|
| Print gravado em | Mikael Barbosa Do Carmo |
| Pacotes SHOPEE do Mikael na quinzena | **0** (ANJUN, eMile e LOGGI só) |
| O print mostra | 1.132 |
| Pacotes SHOPEE da Greice | **1.132** (1.030 + 102) |
| `uploaded_by` do registro | a **Greice** |

**Causa, provada por carimbo de hora:** pedido do print em **17/09 11:10** → envio em
**17/09 20:35** → planilha da Shopee só entrou em **19/09 10:09**. A regra "pedir antes da
planilha" (04/08) mostra cartão para **todo o grupo** enquanto a planilha não chegou —
nessa quinzena, **31 pessoas em grupo sem um pacote sequer de Shopee** viraram cartão na
tela do líder. A líder mandou o print dela no cartão do membro.

Efeito colateral que ninguém veria: o pagamento do **Mikael** ficou com `espelho_conferido
= true` (automático, 19/09 13:09) e o da **Greice** ficou sem.

**Correção (autorizada por ele):** print movido (driver + payment), `expected_packages`
1132 e `check_qtd` true (bate exato), marca de conferido passada de um para o outro.
Backup com o SQL de desfazer em `backups/2026-09-21/` (fora do git). Conferido depois:
print com a Greice, pagamento dela conferido, Mikael com **0 prints** e sem a marca.
⚠️ O arquivo no bucket ficou no caminho antigo (tem o id do Mikael) — o caminho é opaco,
nada quebra; mover objeto no storage foi descartado para não arriscar perder o print.

Mais **2 prints** estão em nome de quem não tem pacote daquela plataforma (Cloves/2ª de
agosto e Camilli/2ª de julho), os dois sem número lido. Não foram tocados.

---

## 3. ✅ A tela (commit `1fc0e46`, no ar)

A identidade do cartão era `driverId|platformName` — **sem a quinzena** — escrita à mão em
4 lugares, e a tela junta **todas** as quinzenas com print pedido. Duas quinzenas da mesma
pessoa colidiam: chave repetida no React, "Enviando..." nos dois cartões, acompanhamento
da conferência no slot errado — e, na tela, **duas linhas iguais em "Já enviados"**.

- `chaveDoCartaoDePrint()` num lugar só, com a quinzena na identidade.
- A linha de "já enviado" passou a dizer a quinzena (antes **nunca** dizia; a de quem falta
  já dizia).
- O placar dizia "Quinzenas em aberto" **mesmo com quinzena concluída** — agora nomeia as
  que estão na tela.
- Passo 2 do "como tirar o print" não dizia qual quinzena escolher quando há mais de uma.

**Validado:** typecheck 0 · lint 0 · build ok · 6/6 unitários novos
(`tests/unit/driverAppCartaoPrint.spec.ts`) + 144 dos 6 arquivos de print · E2E
`tests/65` cenário I **1/1**. **A/B provando o vermelho:** com os 2 arquivos revertidos ao
HEAD o cenário falha com `Expected: 2, Received: 0`. O print "já enviado" do cenário entra
**direto no banco** — provar tela não pode gastar leitura da cota do Gemini que a operação
usa.

---

## 4. Lições

- 🔴 **Gastei um workflow de 7 agentes à toa.** O Victor cortou no meio ("cuidado com
  agente rodando à toa e gastando muito token") e ele tinha razão: a causa saiu de 6
  SELECTs e 2 leituras de código. Bug com caso concreto em produção se ataca pelo **dado**,
  não por fan-out.
- 🔴 **Havia trabalho NÃO COMMITADO de outra sessão dele na árvore** (folha: tabela INSS
  2026, IRRF da Lei 15.270, 3 migrations novas), aparecendo aos poucos enquanto eu
  trabalhava. `git diff --stat` antes de commitar salvou de commitar por cima. Para o A/B
  usei cópia dos meus 2 arquivos + `git checkout --` **só neles** (nunca `git stash`, que
  teria levado o trabalho dele junto), e conferi a volta com `md5sum -c`.
- A tela do driver junta quinzenas porque `proof-slots` sem `periodId` varre **todas** as
  que têm pedido — inclusive **concluídas**. É por desenho (04/08), mas a tela precisa
  dizer de qual quinzena é cada linha.

---

## 5. Pendências

1. 🔴 **Cartão de print para quem não entrega a plataforma** (a causa do print trocado)
   **continua aberto** — é decisão de produto, apresentada e ainda não respondida.
   Recomendação: enquanto a planilha não chega, mostrar só quem já é conhecido por entregar
   aquela plataforma nas quinzenas anteriores.
2. 🟡 **Juntar cadastro duplicado ao vincular no import** (pedido dele nesta sessão): o
   alias `Luis101 -> Luis Fernando Ramos Torres` **existe**, mas o cadastro `Luis101` segue
   ativo e com pagamento próprio — por isso aparecem dois drivers no mesmo grupo. O alias
   ensina a **próxima** importação; não junta o que já entrou. Plano curto entregue,
   aguardando as decisões dele.
3. 🟡 **Dois entregadores com 678 da Shopee no grupo Dom Lara** (pergunta dele): não é
   linha duplicada — ANGELO é 127 (Caratinga, 19/09) + **551 (Sapucaia, importado 21/09
   05:58)** e ROGERIO é 678 numa linha só (Caratinga, 19/09). O histórico do Angelo sempre
   teve Sapucaia alto (477, 621, 484). **Só a planilha fecha a resposta** — pedida a ele.
4. Os 2 prints restantes em nome de quem não tem pacote da plataforma (§2).
