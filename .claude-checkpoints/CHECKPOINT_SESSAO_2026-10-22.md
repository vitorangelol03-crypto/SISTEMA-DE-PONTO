# Checkpoint — Sessão 2026-10-22

## Caso Fafá: pagou 9.380, nota 9.478 — CAUSA REAL: filtro de plataforma derruba o Zapex

Victor mandou áudio + foto do operador: o Fafá (Fabrício dos Santos Ferreira, líder de
grupo em Caratinga) recebeu R$ 9.380 mas a nota dele é R$ 9.478 (−R$ 98). Victor
perguntou se foi desconto. **Não foi desconto** (grupo com desconto 0, vale 0,
livro-caixa vazio, espelho com `deducted_amount = 0`).

### Causa raiz (provada nos ARQUIVOS reais + código) — 2ª set `9b8fd48b`, Caratinga

As planilhas de pagamento foram geradas **20/10 17:24–17:25** (Downloads):
`Relatorio_Simples_..._LOGGI_SHOPEE_ANJUN_Coleta_Shopee.xlsx` (a principal, **com
filtro de plataforma, sem eMile** — o jeito padrão de pagar) e
`Relatorio_Simples_..._eMile.xlsx` (eMile à parte). As marcas "pago" têm os mesmos
horários (17:24:48 as 4 plataformas / 17:24:58 eMile).

**Bug: relatório com QUALQUER filtro de plataforma exclui o Zapex, em silêncio.**
`computeRowTotals` (`driverPayShared.ts:1345`) só conta Zapex se 'Zapex' estiver no
filtro (`isAllowed('Zapex')`), e 'Zapex' **não existe como opção** nos chips do
`ReportOptionsModal` (`platformOptions` vem só de `driverpay_platforms`). Como o fluxo
padrão é SEMPRE filtrado (tudo-menos-eMile + só-eMile), **o Zapex nunca sai em planilha
nenhuma**. Nunca doeu antes porque a tabela Zapex estava vazia até 19/10 (1º uso).
Espelho publicado POR PLATAFORMA tem a mesma regra (D3) — espelho "de todas" não
(sem filtro, Zapex entra; foi por isso que o espelho do grupo saiu certo, 10.488).

Conferido linha a linha nos 2 arquivos contra o banco: Fabrício 9.380 (= tudo menos
eMile menos Zapex) + 1.010 no eMile; Rogério 7.339,20 **inclui** a LOGGI 149,60
lançada 09:39; Romário 4.350 **inclui** a ANJUN do Thales 110 lançada 10:04; eMile
todo certo. ⚠️ **A 1ª análise desta sessão (commit `f91b270`) concluiu errado**
"planilha gerada na noite de 19/10, falta R$ 525,60" — os números do banco batiam com
duas hipóteses e eu afirmei uma sem discriminador; o Victor corrigiu ("tirei a
planilha às 17h") e os arquivos provaram. Lição regravada: duas hipóteses explicando
os mesmos números = achar o dado que separa (aqui, o próprio .xlsx) ANTES de afirmar.

### O que falta pagar (só o Zapex): **R$ 266,00**
Fafá 98,00 · Lucas Aredes ("Luila") 74,00 · Romário 52,00 · João Pedro Gomes 36,00 ·
Higino 4,00 · Gerson 2,00. (49+37+26+18+2+1 = 133 entregas × R$ 2,00.)
As notas do Fafá estão validadas (9.478 CD + 1.010 iMile = espelho 10.488).

### ⏳ Esperando o Victor decidir
1. Como acertar os R$ 266 (posso gerar planilha C6 com as 6 linhas).
2. **Conserto do bug**: opção "Zapex" nos chips do filtro do relatório (marcada por
   padrão) — sem isso, TODA quinzena com Zapex vai pagar errado de novo. Mesma atenção
   pro espelho por plataforma. NÃO feito, esperando OK.

Nada alterado no banco. Investigação só-leitura + leitura dos .xlsx do Downloads.
