# CHECKPOINT_SESSAO_2026-10-09 — Valor do Rômulo/Higino, padrão SHOPEE 2,00, investigação do "2,20 sozinho", ponto do Washington

> Sessão de 09/10 a 10/10/2026. Nada de código mudou (zero commit de código). Tudo foi DADO em produção,
> feito pelo próprio painel (roteiro Playwright na cópia Linux, logado 2626) ou SQL direto a pedido do Victor.
> Roteiro: `~/projetos/ponto-teste/tests/zz_higino_valor.spec.ts` + `playwright.zz-prod-manual.config.ts`
> (config de PRODUÇÃO SEM globalSetup/globalTeardown — a limpeza global apaga dado real). NÃO vão pro git.

## 1. ✅ Grupo do Higino (Caratinga, 1ª quinzena de setembro — a única ABERTA)

- Cadastro do **ROMULO EUGENIO DA SILVA** → SHOPEE 2,20 → **2,00** (tela "Configurar valores / PIX").
  A tela reaplicou nos 317 pacotes: bruto 827,40 → **764,00**, desconto 149,99, líquido **614,01**.
  Efeito colateral normal do Salvar: gravou também eMile/ANJUN/LOGGI 2,00 e Coleta 1,00 no cadastro dele.
- Espelho do grupo **Despublicar → reabrir → "Descontar de todo mundo" → Publicar no app**
  (NÃO usar "Republicar (atualiza)" — bug de 03/10, some com o desconto). Publicação nova:
  printed **4.886,01** (antes 4.949,41), deducted 149,99, prazo 09/10 18:00 (igual), 1 linha só no livro-caixa.
- Higino ainda não tinha nota → nenhuma nota com valor velho.
- Prova: md5 do resto de Caratinga (pacotes, pagamentos, publicações, livro-caixa, taxas dos outros) idêntico antes/depois.
- 2ª quinzena de agosto do Rômulo (393×2,20) e da Alcione (12×2,20) ficaram como estão: quinzena CONCLUÍDA.

## 2. ✅ Padrão da plataforma SHOPEE em Caratinga: 2,20 → **2,00** (ordem do Victor, pelo painel)

Só o `default_rate` (cor/aviso/destaque iguais, conferido no banco). Não mexe em cadastro nem pacote lançado.
Demais: eMile/ANJUN/LOGGI já 2,00; **Coleta Shopee 1,00 NÃO mexida** (decisão pendente, §4).

## 3. 🔎 Investigação "gente vindo com 2,20 sozinha" — causa raiz (código lido)

1. `applyImportResolutions` (driverPay.ts ~2786) cria o driver novo da planilha **sem cadastro de taxa**;
   o pacote pega `getDriverDefaultRates` (cadastro → última taxa usada) `?? default da plataforma` (era 2,20).
2. "Última taxa usada" carimba o 2,20 pra sempre nas quinzenas seguintes.
3. `addDriverToGroup` (regra de 04/09) só herda se o grupo tiver `default_rate` — Higino/Maurício/Thiago/
   Escritório estão SEM valor — e só grava o CADASTRO, **não refaz os pacotes da quinzena aberta**
   (o `applyGroupRate` faz; o adicionar não).
4. O valor do grupo é UM número aplicado a TODAS as plataformas ativas (inclui eMile e Coleta).

Lista entregue ao Victor (quinzena aberta): Ray Augusto (Maurício, 422×2,20, líder 2,00) · Romario de Oliveira
Pedra (Thiago, 299×2,20, líder 2,00) · Diendrel (Escritório, 10×2,20) · Marize+Pablo (grupo BOM JESUS PABLO
valor 2,00 mas cadastro/pacotes 3,00) · Angélica (Gessiley 2,20, eMile 135×2,00 sem cadastro) · Irineu
(Suíços 5,00, eMile 2×2,00 com cadastro 5,00) · Filipe (Ipanema 2,00, Coleta 632×1,00). Grupos a 2,20 DE
PROPÓSITO (Gessiley, Lucas Aredes, Pingo, Oliur, Andrea, Rogério, Victor Ian), Dom Lara 4,00 e Mutum 2,15 = certos.

## 4. ⏸️ Preciso que o Victor decida (NÃO começado — plano entregue na conversa)

Regra nova pedida: "movido pra grupo COM valor definido → pega o valor do grupo (cadastro E pacotes da quinzena
aberta)"; driver novo nasce 2,00. Plano: no `addDriverToGroup`, depois do cadastro, refazer os pacotes da quinzena
aberta (mesma rotina do `applyGroupRate`); nunca quinzena fechada; sem migration; unit + E2E com grupo de teste.
Decisões (com minha recomendação):
1. Coleta Shopee: fica 1,00 ou vai pra 2,00? → **manter 1,00**.
2. Valor do grupo vale pra TODAS as plataformas? → **todas menos Coleta**.
3. Corrigir a lista: Ray/Romario/Diendrel → 2,00; Irineu eMile → 5,00; Pablo/Marize: grupo (2,00) ou pessoas
   (3,00)? → corrigir os 4 + Victor diz o do Pablo; espelho publicado que mudar = despublicar/publicar.
4. Gravar valor fixo 2,00 nos grupos Higino/Maurício/Thiago? → **sim**.

## 5. ✅ Ponto do Washington (pedido avulso, 10/10)

Washington Luiz da Silva agarido (Caratinga, turno da madrugada) não bateu a entrada de 10/10. INSERT direto
(id `bb0b670b-…`): entrada **02:10** (média das 20 entradas da madrugada = 02:09:35), `clock_source=manual`,
`marked_by=2626` — mesmo formato do caso dele em 08/10. Ele bateu a saída sozinho às **09:32** → 7,38 h
(2,83 noturnas). Conferido no banco.

## 6. Outras pendências que seguem (não mexidas)

- DEMO "Transportes Exemplo (DEMO)" (§23 do checkpoint de 06/10): dados semeados (100 drivers, 2 quinzenas,
  118 espelhos, 148 marcas), roteiros de print na cópia Linux; **PDF final não encontrado** — próximo passo é
  tirar os prints e montar o PDF.
- As do índice: modo galpão no tablet real, supervisores + permissões, 4 avisos de segurança, lavinia na TESTE
  TABLET, planilha LOGGI 1ª set, R$ 154 Loggi do André, nota do Adriano, 14 bloqueios sem GPS.
