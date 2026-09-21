# CHECKPOINT — Sessão 20/09/2026 (fechamento do dia)

> **Em uma frase:** um conferidor independente, escrito a partir da regra da lei, achou
> que o sistema **jogava um centavo fora** em 5,34% dos salários — corrigido na raiz, e
> a folha inteira foi validada por fora, não só por testes que ela escreveu para si mesma.

---

## 1. O que o Victor pediu

> *"Eu quero que teste todo o sistema, fazer o fluxo completo. A gente sabe se está
> funcional mesmo ou não. Se ele calcula os valores corretos e pode realmente confiar
> nessas folhas, nos relatórios."*

E antes disso, no mesmo dia: acrescentar ao tutorial **uma página com a conta do INSS
aberta**, passo a passo.

A parte difícil do pedido não é rodar teste — é que **teste passando só prova que o
sistema concorda com ele mesmo**. Por isso o trabalho desta leva foi montar uma segunda
opinião independente.

---

## 2. O conferidor independente (o que realmente respondeu a pergunta)

Uma implementação **separada**, em Python, escrita a partir da regra (INSS progressivo,
IRRF pelo menor dos dois caminhos, FGTS 8% truncado, salário família, art. 130, avos do
13º, verbas da rescisão), rodando sobre o sistema em **431 casos** — salários de R$ 1.518
a R$ 12.000, com e sem filhos, com falta, com férias no meio do mês, com premiação, e os
4 motivos de rescisão.

Resultado final: **5.640 conferências, 0 divergências.**

Além de refazer o imposto, ele checa as leis que têm que valer sempre — e essas são as
que pegam bug de verdade:
- o líquido fecha (proventos − descontos) em todos os casos;
- salário família e premiação **não entram em base nenhuma**;
- a premiação muda **só** o líquido (comparando o mesmo caso com e sem ela);
- o INSS nunca cai quando a base sobe, e nunca passa de 14% da base;
- a 1ª parcela do 13º não desconta imposto, e 1ª + 2ª = parcela única (±1 centavo);
- justa causa não paga aviso, multa, 13º proporcional nem férias proporcionais;
- o corte do art. 130 é aplicado **por período aquisitivo**.

Scripts em `scratchpad` (descartáveis): `dump.ts` (gabarito do sistema) + `conferir.py`.

---

## 3. 🔴 O BUG: o centavo que o sistema jogava fora

`truncaCentavos` fazia `Math.floor(valor * 100) / 100`. Em ponto flutuante
`5.06 * 100` vale **505.99999999999994** — o `floor` derrubava para 505 e pagava R$ 5,05.

Medido salário por salário, de centavo em centavo, de R$ 1.000 a R$ 15.000:

| Onde | Salários afetados |
|---|---|
| Salário do mês (mês não cheio: falta, férias, admissão no meio) | **5,34%** (1 em 19) |
| FGTS | 0,24% |
| INSS | 0,04% |

Sempre **contra o funcionário**. Pouco dinheiro, mas é o centavo que faz o papel não
bater com o da contabilidade — que é exatamente para o que este sistema serve.

**Raiz:** o cortador estava **copiado em 4 arquivos** (`folhaCalc`, `impostos`,
`decimoTerceiro`, `rescisao`). Corrigir quatro vezes seria convite para a quinta.

**Correção:** `src/utils/folha/dinheiro.ts`, um lugar só. A ordem das duas limpezas é o
ponto — multiplica **primeiro**, limpa o ruído **depois**:

```ts
const emCentavos = Number((valor * 100).toFixed(6));
return Math.floor(emCentavos) / 100;
```

As 6 casas seguem necessárias no outro sentido (`1700 / 30 * 21` = 1189.9999999999998,
o recibo da Silvia). Teste `tests/unit/centavoTruncado.spec.ts` — escrito **vermelho
primeiro** (4 falhas), verde depois, e com 2 guardas que já passavam antes e não podiam
quebrar: "continua truncando de verdade" e "o caso da Silvia".

✅ **Produção intocada:** 0 de 105 fichas têm salário, 0 décimos, 0 rescisões, 0
premiações gravadas. O bug nunca chegou a pagar ninguém errado.

---

## 4. 🔴 O que NÃO está resolvido, e é mais sério que o bug

As duas tabelas no banco (`payroll_tax_tables`) estão gravadas como
**`confirmado: false`**, com o recado de quem as criou:

- **INSS:** *"1ª e 2ª faixa provadas no recibo; o resto a confirmar"*
- **IRRF:** *"NADA disto é provado pelo gabarito; a confirmar com o contador"*

Então a resposta honesta tem **duas partes**:

- ✅ **A conta está certa** — provado pelas 5.640 conferências.
- ❌ **A tabela não está confirmada** — faixas de 12% e 14%, o teto e **o IRRF inteiro**
  nunca foram batidos contra papel. Quem ganha até ~R$ 3.041 está em terreno provado;
  acima disso, não.

**Pendência com o Victor:** pedir ao contador a tabela de INSS e IRRF de 2026. Até lá o
recibo continua saindo com a tarja "VALORES EM CONFERÊNCIA" — e é certo que continue.

---

## 5. Quatro vezes em que eu estava errado, e o sistema certo

Registrado porque é o que evita repetir a conferência à toa:

1. **Falta não é só INSS+IRRF no desconto.** O sistema paga o salário cheio e lança a
   falta como desconto — como o holerite de verdade faz.
2. **O desconto da falta é `salário − (dias pagos truncados)`**, não `trunc(dias de
   falta)`. Assim o que a pessoa recebe é exatamente `sal/30 × dias` truncado. Difere em
   1 centavo, e a escolha do sistema é a certa.
3. **13º 2ª parcela:** o adiantamento já está dentro do `brutoDaParcela`; descontar de
   novo é contar duas vezes.
4. **Art. 130 vale POR período aquisitivo**, não sobre o total de dias.

E duas armadilhas de ferramenta, que fizeram uma rodada inteira mentir:
- 🔴 **`--reporter=basic` não existe no vitest 4** — os 10 lotes morreram na largada com
  "Startup Error" e o log ainda assim terminou com "lotes com falha: 0".
- 🔴 **`código=$?` não funciona no bash** (acento no nome da variável) — o código de saída
  nunca foi capturado. **Os 3 sinais existem justamente para isso:** código de saída sem
  pipe + contagem de arquivos + zero worker morto.

---

## 6. Como foi validado

| O quê | Resultado |
|---|---|
| Conferidor independente | **5.640 conferências, 0 divergências** |
| `npm run typecheck` | zero erros |
| `npm run lint` | limpo |
| `npm run build` | ✓ em 1m22s |
| Unit (115 arquivos, 10 lotes) | **1.833 passaram, 1 pulado, 0 falharam**, 10/10 lotes código 0, 0 worker morto |
| E2E folha (`tests/115`–`124`) | **37/37**, saída 0, nenhum flaky |
| Tutorial em PDF | 10 páginas, 252 KB, regerado depois da correção |

---

## 7. Tutorial — a 10ª página

Acrescentada a página **"A conta do INSS, por dentro"** (seção 4; as seguintes
renumeraram). Mostra, com os números conferidos contra a tabela real do banco:

- as duas faixas abertas (7,5% até R$ 1.621,30 = R$ 121,5975 · 9% sobre R$ 78,70 = R$ 7,0830);
- **os centavos cortados no fim, não em cada faixa** (R$ 128,68; por faixa daria R$ 128,67);
- **o recibo imprime "9,00%" mas ela paga 7,57%** — a porcentagem é a faixa alcançada,
  não o que ela paga. É a dúvida mais comum de quem lê o recibo.

O PDF **não entra no repo** (artefato regenerável, tem nomes reais):
`GERAR_TUTORIAL=1 npx playwright test tests/gerar-tutorial.spec.ts --project=chromium`

---

## 8. 🔴 BÔNUS: excluir quinzena do driverpay NUNCA funcionou

Veio de rebote. O Victor mandou validar e subir a mudança do `tests/57` parada desde
15/09 (não commitada). Ela não passou — e a investigação achou um bug de produção.

**O A/B que separou as duas coisas** (`git stash` + rodar os dois):

| | Onde o teste morre |
|---|---|
| **SEM** a mudança de 15/09 | cedo, no `closeModal` (linha 44) |
| **COM** a mudança | vai até o fim da jornada, morre ao excluir a quinzena |

Ou seja: a mudança de 15/09 **está certa e é necessária** (desde 09/09 o X do cabeçalho
do `ModalShell` também tem `aria-label="Fechar"`, o `getByRole` achava 2 botões e o
clique travava). Ela só destapou um segundo problema que estava escondido atrás do
primeiro.

**O bug, provado pelo RASTRO DE REDE — não por leitura de código:**

```
DELETE driverpay_payments?period_id=... -> HTTP 400
RAISE EXCEPTION 'Quinzena concluida: reabra a quinzena para editar'
```

- O botão **Excluir** só aparece com `isConcluded` (`DriverPeriodSelector`).
- O trigger `driverpay_enforce_period_locked` recusa INSERT/UPDATE/**DELETE** nos
  lançamentos de quinzena concluída — **inclusive os que vêm por CASCADE**.
- O único estado em que o botão aparece é exatamente o que o banco recusa. E não havia
  saída: clicar em "Reabrir" faz o próprio Excluir sumir da tela.

**Correção (opção 1, escolhida pelo Victor):** `deletePeriod` lê o estado, destrava com o
`reopenPeriod` **que já existia**, e apaga. Se falhar no meio, devolve a trava
**exatamente** como estava (`status`, `concluded_at`, `concluded_by`) — senão sobraria
uma quinzena fechada editável sem ninguém saber.

Destravar por dentro **não afrouxa nada**: quem manda é `driverpay.managePeriods`, a
MESMA permissão do reabrir. Quem pode excluir já podia reabrir à mão.

⚠️ **Sem migration.** As outras duas opções (mexer no trigger, ou tirar o botão) foram
apresentadas e recusadas.

O `tests/57` **é** o teste de regressão: ele conclui a quinzena e depois exclui — o
caminho quebrado. Vermelho antes, verde depois (2/2, saída 0). Mais 31 arquivos e **414
unitários** de driverpay em 3 lotes, todos código 0. Commit `02386bf`.

---

## 9. Pendências

1. 🔴 **Tabela de INSS e IRRF de 2026 com o contador** — o maior risco aberto da folha.
2. ⚠️ **`tests/57-driverpay-edits-roundtrip.spec.ts` tem mudança de 15/09 não commitada**
   (estabilização da aba Pagamentos Driver: espera condição em vez de tempo fixo). Não é
   desta leva, ficou de fora do commit de propósito.
3. `x.pdf`, `lote.pdf`, `espelho.pdf` na raiz — sobras de execuções antigas, não
   ignoradas pelo git.
4. A folha segue **sem uso real**: 0 das 105 fichas tem salário.
