# Checkpoint — Sessão 2026-10-22

## Caso Fafá: pagamento R$ 9.380 × nota R$ 9.478 (SÓ INVESTIGAÇÃO, nada alterado)

Victor mandou áudio + foto do operador: o Fafá (Fabrício dos Santos Ferreira, líder de
grupo em Caratinga) reclamou que recebeu R$ 9.380 mas a nota dele é R$ 9.478 (−R$ 98).
Victor perguntou se foi desconto. **Não foi desconto** (grupo com desconto 0, vale 0,
livro-caixa vazio, espelho publicado com `deducted_amount = 0`).

**Causa (provada no banco, 2ª quinzena de setembro `9b8fd48b`, Caratinga):**
a planilha de pagamento (lote C6) foi exportada na noite de 19/10 — depois do import
ANJUN (19/10 19:06 UTC), antes do Zapex (19/10 23:26 UTC) e do import eMile
(20/10 12:22 UTC). Tudo que entrou depois ficou fora do lote:

- **Zapex R$ 266,00** (6 entregadores, 133×R$ 2,00 — o lançamento de 19–20/10).
  O do Fafá: 49×2 = **R$ 98,00** → exatamente a diferença reclamada.
- **eMile R$ 29.595,05** (64 linhas, import 20/10 12:22) — pago por transferência
  separada (marca "pago" do eMile num clique à parte, 20/10 20:24:58 UTC); a planilha
  do eMile só pode ter sido gerada depois do import, então deve estar certa — conferir
  com o Clayton.
- **2 lançamentos tardios fora até do espelho das 12:34:** LOGGI 68×2,20 = **R$ 149,60**
  do Rogério (Vermelho Novo, 12:39) e ANJUN 55×2,00 = **R$ 110,00** do Thales (grupo do
  Romário, 13:04). Os espelhos desses 2 grupos foram republicados segundos depois
  (12:39:57 / 13:04:59) — espelhos atuais, lote velho.

**Prova:** os 16 valores legíveis na foto da planilha batem no centavo com o estado
pré-Zapex/pré-eMile reconstruído por SQL (payment_packages por created_at), incluindo
os nomes de emitente de nota (Luila=Lucas Aredes, Mikael=grupo da Greice, Denize=Oliur,
Rosiclese=Henrique). As 2 notas do Fafá estão validadas: R$ 9.478 (tomador CD
11.802.464/0001-38, candidato `espelho_group_cheio=9478`) + R$ 1.010 (tomador iMile
53.824.315/0001-10). Espelho do grupo publicado 20/10 12:34 com R$ 10.488 = 9.478+1.010.

**Falta pagar no lote principal (total R$ 525,60):** Fafá 98,00 · Romário 162,00
(52 Zapex + 110 Thales) · Rogério 149,60 · Lucas Aredes 74,00 · João Pedro Gomes 36,00 ·
Higino 4,00 · Gerson 2,00.

**⏳ Esperando o Victor decidir:** pagar as diferenças (e como registrar — fora do
sistema ou lançando algo); confirmar com o Clayton que a transferência do eMile saiu da
planilha pós-import. **Causa raiz é de processo:** lote exportado antes de a quinzena
estar completa; o sistema não avisa "tem lançamento mais novo que o lote/espelho" —
feature possível se o Victor quiser (não feita).
