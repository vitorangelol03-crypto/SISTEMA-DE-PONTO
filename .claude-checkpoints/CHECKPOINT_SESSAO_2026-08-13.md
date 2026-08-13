# CHECKPOINT_SESSAO_2026-08-13.md

> Sessão de 13/08/2026. Curto de propósito — o `git log` conta o detalhe.

---

## 1. O que ele trouxe

Print da aba Financeiro: *"não trabalhou no dia 4 mas apareceu no sistema na aba financeiro
olha esse Adrian, o sistema está permitindo colocar presença sem estar presente foi bug
isso?"*

**Não era bug — era clique humano, com uma falha de produto atrás.** Apurado no banco antes
de afirmar qualquer coisa:

| Quando | Quem | O quê |
|---|---|---|
| 04/08, 14:53:26 | login mestre **9999** | marcou "Presente" em Bruno Eduardo Silva |
| 04/08, 14:53:35 | login mestre **9999** | marcou "Presente" em Adair pinheiro |
| 04/08, 14:55:36 | login mestre **9999** | marcou "Presente" em Adrian Luiz Vieira Sete |
| 11/08, 12:42 | login mestre **2626** | aplicou o pagamento da quinzena → R$ 150,00 pra cada |

Cliques individuais (9s e 2min entre eles), não marcação em massa. Nenhum dos três bateu
ponto (`entry_time` NULL, `clock_source='manual'`). Nos 13 dias de agosto, **só o dia 4**
tinha presença sem batida, e só nessas 3 pessoas.

🔑 **A falha de produto:** marcar pelo painel cria ponto **sem batida nenhuma**, com o
**mesmo selo verde** de quem bateu de verdade; o Financeiro conta qualquer linha `present`
como dia trabalhado e paga a diária. Quem pagou no dia 11 não tinha como perceber.

---

## 2. Correção dos dados · **feita, com OK dele** (*"eles não trabalharam não, apaga esses 3"*)

3 registros de ponto + 3 pagamentos apagados. Rollback em `backups/2026-08-13/RESTAURAR.sql`
(devolve as 6 linhas com os mesmos ids).

| | antes | depois |
|---|---|---|
| attendance / payments (total) | 5.045 / 3.039 | 5.042 / 3.036 |
| dia 04/08 — pessoas / valor | 22 / R$ 1.743,00 | 19 / R$ 1.293,00 |

Adair e Adrian ficaram com 0 dias e R$ 0,00 na quinzena. **Bruno segue com 2 dias e R$ 150,00**
— conferido um a um: 07/08 e 10/08, os dois com batida real dele. Só o dia 4 saiu.

---

## 3. A trava · `5ef68c0` · migration **APLICADA** · **só local (sem push)**

Pedido dele: *"faz um bloqueio, somente 2626 pode alterar pontos e bater ponto pela
plataforma"* → confirmado depois: *"bloqueia em todos os usuários"*.

🔑 **O buraco era conhecido e específico:** o gatilho de 27/06 já barrava apagar e mexer em
data/horário, mas **deixava passar INSERT sem horário** — exatamente o caminho do botão
"Presente".

- **`masters.ts`:** `attendance.mark` entrou em `PONTO_EDIT_PERMISSIONS`. Na tela os botões
  Presente/Falta ficam **desabilitados com o motivo no `title`** (não somem — some seria pior,
  a equipe não saberia por quê) e a **caixa de seleção some**, então marcar em massa fica
  impossível. Não precisei tocar no `AttendanceTab.tsx` da outra janela.
- **Migration `20260813120000`:** o gatilho passa a recusar **INSERT** de ponto e **UPDATE que
  mude o status**, para quem não é 2626/backend.

**Provado na função em produção, com 6 casos e rollback forçado (nada gravado):**

| | |
|---|---|
| 9999 marca presente · 9999 vira falta · supervisor 01 marca falta | 🔒 bloqueado |
| 9999 **aprova** ponto | ✅ passa |
| **funcionário batendo ponto no /clock** | ✅ passa |
| 2626 marca presente | ✅ passa |

🔑 **Por que a batida do funcionário não é afetada:** ela entra pela edge fn
`clock-in-validated`, com `SUPABASE_SERVICE_ROLE_KEY` → `current_user='service_role'`, que o
gatilho libera no topo. Prova empírica: as 33 batidas de 13/08 nasceram com `entry_time`
preenchido, coisa que o gatilho **já bloqueava** desde junho para quem não é 2626.

⚠️ **Efeito operacional real:** desde maio o 9999 marcou 164 (mai) · 61 (jun) · 28 (jul)
presenças pelo painel. Isso **acaba** — daqui pra frente só o 2626.

---

## 4. 🔴 Eu apaguei 27 pontos reais de hoje — restaurados byte a byte

**Causa, sem rodeio:** pra o `tests/40` conseguir marcar presença depois da trava, troquei o
login dele de 9999 pra 2626. O `afterEach` desse spec clicava em **"Reset Geral"**, que sem
busca ativa apaga o ponto do dia **da empresa inteira** (por desenho — decisão de 29/07).
Enquanto o spec entrava como 9999 aquilo era **código morto** (o botão é 2626-only desde
junho); ao trocar o login, **armou**.

**Dano medido contra o backup:** 27 pontos de **hoje** apagados · **0** de outros dias · **0**
pagamento tocado · 96 funcionários intactos. Depois, 24 dessas pessoas re-registraram no
relógio entre 09:18 e 09:28 (entrada + saída em segundos, 0,01h) e **3 ficaram sem registro**.

**Restauração (opção escolhida por ele: "restaura igual estava antes"):** apagados os 24
registros lixo + devolvidos os 27 originais com os mesmos ids. Conferido **por conteúdo**:
`md5` da tabela `attendance` inteira = `be761c8408a6ee0d543cd21b518bf0e1` nos dois lados,
**0 linhas diferentes**. Todo mundo de volta com a entrada real da madrugada (01:56 / 02:06 /
02:07 BRT).

**Raiz corrigida:** a função que clicava no "Reset Geral" foi **removida** do spec 40; a
limpeza passou a ser `cleanup()`, escopada no prefixo do próprio spec, via service role.

🔑 **A lição que vale pra sempre:** trocar o login de um teste para um usuário **mais
poderoso** pode **armar caminho destrutivo que estava morto por falta de permissão**. Antes de
promover o login de um spec, ler o que os hooks dele fazem.

ℹ️ Backup completo continua **dentro do banco**: `backup_attendance_20260813`,
`backup_payments_20260813`, `backup_employees_20260813` (podem ser dropadas quando ele quiser).

---

## 5. Validação

78 arquivos unit, **0 falha** (os "Errors" do vitest são workers que não sobem no WSL — cada
arquivo que ficou de fora foi rodado isolado e passou) · typecheck **61 = baseline**, nenhum
erro meu · eslint 0 · build · **E2E 03 8/8** (com regressão nova do incidente, provada dos
dois lados) · 15 e 40 nos testes de marcação · 100 B1/B2 e 101 C3 · banco conferido por hash
de conteúdo antes e depois.

⚠️ **Dois tropeços meus nas asserções**, corrigidos: escrevi que o botão *sumia* (quem some é
a caixa de seleção; o botão fica desabilitado) e pus **dois logins num teste só**, o que
estoura o limite de 30s no WSL — virou dois testes.

---

## 6. Pendências

- ⏳ **Não rodei a bateria E2E completa** — o banco é o de produção e tinha gente batendo
  ponto. Combinar horário sem movimento.
- 🔴 **`tests/40` "3. aplicar B=15" falha por causa da OUTRA janela**, não da trava: o
  `window.confirm` novo da bonificação (não commitado) é cancelado pelo Playwright, então a
  função sai antes do aviso de sucesso. É deles, não mexi.
- ⚠️ **`tests/15` "aprovação em lote"** estoura 30s nesta máquina e passa com 90s — medido
  isolado, com os dois logins. Lentidão de ambiente; **não aumentei o tempo** pra não mascarar.
- ⚠️ **`tests/101` B1 "Lista 30 Demo PN"** falha por elemento **escondido** (tela tem versão
  mobile e desktop). Pré-existente, fora do escopo.
- ⏳ **Push não feito** (regra do projeto: só commit local). No `origin` faltam 3 commits:
  `58a68b0` (Inter), `564a688` (checkpoint) e `5ef68c0` (esta trava).
- ⏳ Segue não commitada a **trava da bonificação** da outra janela (`bonusScope.ts`,
  `tests/unit/bonusScope.spec.ts`, `AttendanceTab.tsx`) — não toquei.
