# CHECKPOINT_PROXIMOS_PASSOS.md — Pendências, decisões do Victor e roadmap

> Reescrito em **2026-08-31**. A versão anterior (19/05/2026, go-live/onboarding PN/release
> v2.0.0) ficou toda concluída e está no histórico do git. Fonte de verdade do estado:
> `00-INDEX.md` + último `CHECKPOINT_SESSAO_*.md`. Este arquivo é o **mapa do que falta**.

---

## 0. Onde estamos (31/08/2026)

Sistema multi-empresa em produção (Vercel, auto-deploy funcionando), CI verde desde 30/08,
lint 0/0. Aba Pagamentos Driver em uso real (3 quinzenas importadas com arquivos reais).
Em 31/08 o Victor ditou o **roadmap** (§4) e pediu pra **zerar as pendências antes**.
Sessão 31/08 fechou 6 pendências (§1) e levantou o que precisa de decisão dele (§2).

---

## 1. ✅ Fechadas em 31/08 (detalhe em `CHECKPOINT_SESSAO_2026-08-31.md`)

| Pendência | O que era | Como fechou |
|---|---|---|
| TOTAL GERAL em branco (20/08 §5) | célula do total só com fórmula, sem valor → prévia de celular mostra vazio | `formulaCell()` grava fórmula + valor nos 3 layouts + export C6; 9 testes de regressão (`driverReportTotalGeral.spec.ts`) |
| Filtro "quem já está pago" (20/08 §5) | cabeçalho do grupo na visão Grupos contava só as linhas filtradas → "todos pagos" com membros não pagos escondidos | `situacaoPagamentoDoGrupo()` sobre TODOS os membros (`allRows`); 7 testes (`driverPaySeloPagoGrupo.spec.ts`). O relato em si também coincide com a janela 17:46–18:34 de 20/08 (85 marcas erradas, já limpas) |
| Filtro "NF ok" (20/08 §5) | grupo do Mauricio com "NF 0/1" passando no filtro | **não era bug**: a nota do líder foi validada 18:39 de 20/08; antes disso não passava, depois passou por desenho. Achados colaterais → §2.2 |
| `tests/101` H1 fraco | `toHaveCount(0)` passava com a aba escondida no menu "Mais" | abre o menu antes de afirmar |
| CI: typecheck não checava nada | `npx tsc --noEmit` na raiz = 0 arquivos | `npm run typecheck` (142 arquivos) |
| Dependabot: 3 PRs de Actions (#13/#16/#3) | checkout/setup-node/upload-artifact v4 | v7 direto no `ci.yml` (Dependabot fecha os PRs) |
| `*.tsbuildinfo` no git · `CLAUDE.md` "nunca push" | artefato versionado · regra desatualizada | `.gitignore` + untrack · regra 5 alinhada a 10/08 |
| "Import grande nunca até o fim" (índice) | linha de 17/07 | **desatualizada**: banco prova imports reais completos em 17-18/07, 04/08 e 18/08. O que falta é §2.4 |

---

## 2. ⚖️ Preciso que o Victor decida (cada item com recomendação)

### 2.1 🔴 SEGURANÇA — 3 buracos abertos pra QUALQUER pessoa com a chave pública do site (provado ao vivo em 31/08)

Nada disso é "de tela": foi conferido com SELECT no banco de produção. Todos os fixes são
**migrations só restritivas** (tiram acesso de quem não devia ter; a UI atual continua igual).
**Não apliquei nada — migration precisa do teu OK.** Recomendo aplicar os 3 **hoje**, nesta ordem.

**(a) 12 tabelas `backup_*` sem RLS, com SELECT *e DELETE* liberados pro anônimo.** Criadas
à mão em produção (não estão no repo): `backup_attendance_20260813` (~5.042 pontos),
`backup_payments_20260813` (~3.036), `backup_employees_20260813` (96 funcionários — CPF, PIN,
descritor facial), `backup_driver_pix_20260724` (99), `backup_espelho_conferido_20260818`,
`backup_mirror_pub_2026072{4,7,8}`, `backup_nf_files_2026072{6,8}`, `backup_nf_imagens_20260724`,
`backup_driver_auth_20260725`. Nada no app lê essas tabelas.
```sql
-- trava tudo que começa com backup_ (RLS sem policy = ninguém além do service_role)
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'backup\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
```
Decisão extra: depois de travadas, **apagar** (já existe cópia em `backups/` local?) ou mover
pra um schema `backups` fora da API. Recomendo: travar agora, apagar depois de confirmar cópia.

**(b) View `driverpay_payment_computed` roda como dono (perdeu `security_invoker` na migration
de 17/07) e o anônimo lê os 325 pagamentos com valores.**
```sql
alter view public.driverpay_payment_computed set (security_invoker = true);
revoke all on public.driverpay_payment_computed from anon;
```
Único consumidor é `recomputePaymentTotals` rodando como 2626 (passa na RLS das tabelas base).

**(c) Função `driverpay_conclude_period_only` é SECURITY DEFINER, não checa quem chama e o
anônimo pode executá-la** (as outras duas RPCs tiveram REVOKE; esta, de 17/07, não). Com o
`period_id` que a view (b) entrega, dá pra concluir a quinzena aberta sem login.
```sql
revoke execute on function public.driverpay_conclude_period_only(uuid, uuid, text) from public, anon;
```
Segundo passo (migration à parte, precisa reescrever as 3 RPCs): checar dentro delas que o
chamador é `2626` (ou `service_role`).

### 2.2 🟠 SEGURANÇA — exclusividade do 2626 no driverpay é só de tela (decisão de produto)

No banco, as 24 tabelas `driverpay_*` têm UMA policy: "mesma empresa OU sub em (9999, 2626)".
Ou seja: os 5 supervisores e o 9999 cadastrados em Caratinga conseguem, **sem usar a aba**
(direto na API), ler CPF/PIX/telefone dos 119 drivers, trocar chave PIX (dinheiro iria pra
outra conta), alterar pacotes/descontos/vales, marcar/desmarcar pago e reabrir quinzena.
**Decisão:** a regra é "só 2626" (como a tela diz) ou "2626 + 9999"? Com a resposta, migration
que troca a policy das 24 tabelas + 4 policies de storage + RPC de reset de senha.
Recomendo **só 2626** (é o que o produto promete desde julho). Junto: trigger em
`driverpay_periods` impedindo reabrir/editar quinzena concluída por quem não é 2626, e
estender a trava de período concluído pras tabelas novas (payment_marks, deduction_ledger,
nota_fiscal_files, mirror_publications).

Menores (baixa): bucket `driverpay-discount-proofs` público (68 fotos; URL não adivinhável —
fechar exige trocar pra URL assinada no frontend); `driverpay_mirror_notice` com GRANT explícito
a anon (hoje não vaza, mas convida); `nf-upload` aceita `periodId` de outra empresa (nota órfã,
sem vazamento); respostas públicas ecoam `details` do Postgres; `driverpay_nfnames_cap2` sem
`search_path` fixo. Recomendo: incluir os 3 últimos na mesma leva; bucket fica.

### 2.3 🟡 Filtro "NF ok (validada)" — 2 escolhas de produto (achados de 31/08, código lido inteiro)

1. **Marca "na mão" faz o grupo INTEIRO passar em "NF ok (validada)"** sem nenhuma nota
   validada (aconteceu em 20/08: 2 grupos marcados assim pelo 2626). O selo verde não diz
   que foi manual. Opções: (a) filtro "NF ok" passa a exigir nota validada de verdade e
   ganha uma opção nova "marcada na mão"; (b) só o selo do grupo passa a dizer "NF ok (na
   mão)". **Recomendo (a)+(b).**
2. **Bug real no sentido inverso:** despublicar o espelho "de todas" e republicar por
   plataforma faz notas já validadas **deixarem de contar** (caso vivo: ANDREA com 3 notas
   validadas mostrando "NF 1/3"; o operador contornou marcando na mão). Fix em
   `slotCoberto`: nota cuja chave de espelho não corresponde a nenhuma publicação viva volta
   a valer pelo CNPJ. **Recomendo fazer** (é técnico, mas muda contagem de NF → aviso antes).

### 2.4 🟡 Import de planilha — 3 travas de segurança (achados de 31/08)

1. **Re-clicar "Importar" depois de falha no meio duplica os drivers novos** (o modal mantém
   o estado). Paliativo: no erro, recarregar o contexto de nomes e zerar as resoluções.
   Raiz: RPC transacional (tudo ou nada). **Recomendo paliativo agora, RPC depois.**
2. O modal deixa escolher **quinzena concluída** como destino e o 2626 passa pela trava →
   um clique errado reescreve totais já pagos. **Recomendo listar só quinzenas abertas.**
3. Teste "até o fim" com arquivo real grande + falha no meio + reimport: **usar Ponte Nova
   como área de teste** (driverpay zerado lá; limpeza por `company_id` via service role).
   **Preciso do OK** pra usar PN e os arquivos reais de Downloads.

### 2.5 🟢 Dependabot — PRs de npm (5 abertos)

Nenhum pode ser mergeado pelo botão: o lock que o bot gera vem quebrado (`npm ci` falha em
10s — já aconteceu em 18/07) e o CI dos PRs do bot roda sem os secrets (vitest/playwright
sempre vermelhos por isso). Caminho: aplicar **localmente** com lock regenerado + validação.
- **#25** (20 minor/patch) + **#19** (globals 17): seguros em conteúdo → **recomendo aplicar**
  numa leva própria (typecheck+lint+unit+build+E2E essencial; `npx playwright install`).
- **#18 typescript 7.0.2**: compilador nativo (Go) sem API; quebra o typescript-eslint →
  **recomendo `@dependabot ignore this major version`** e planejar 5.6→5.9 depois.
- **#8 react 19 sem react-dom 19**: preview da Vercel já quebrou; em conflito →
  **recomendo ignorar o major**; React 19 é projeto próprio (código já compatível).
- **#5 rollup-plugin-visualizer 7**: só relatório de bundle; em conflito → ignorar ou junto do #25.

---

## 3. 📌 Pendências técnicas abertas (sem decisão de negócio)

- Marcas de pagamento podem "vazar" pra quinzena nova se a leitura das notas falhar ao
  trocar de período (`paymentMarks` não é zerado em `changePeriod`; índice sem período).
  Não confirmado em dados. Fix pequeno + guarda contra resposta fora de ordem.
- Marca "pago" é por plataforma, sem valor: alterar pacotes depois de pago mantém "✓ pago".
  Ideia: snapshot do total na marca + aviso "pago com R$ X — hoje R$ Y".
- Automações pós-import rodam no período **da aba**, não no escolhido no modal.
- Casamento de nomes do import só olha drivers ativos (arquivado vira "Criar novo").
- E2E pro selo do grupo com filtro "Já pagos" (hoje só unit).
- `tests/101` positivo ("abas que vê") ainda usa `.first().toBeVisible()` — ok hoje.
- CI dos PRs do Dependabot sem secrets (decisão: cadastrar em Dependabot secrets ou aceitar).
- `SSF.format` não entende o `BRL_FMT` (sem efeito no Excel; só CSV cru) — não mexer.

---

## 4. 🔮 ROADMAP ditado pelo Victor em 31/08/2026 (ordem combinada) — ver memória `project_roadmap_ponto_tablet_facial`

1. **Facial + geolocalização 100% obrigatórias, sem brecha.** Auditar TODOS os caminhos
   que registram batida e fechar cada um (toggle global, empresa sem geo, fallbacks).
2. **4 batidas/dia** (entrada, saída intervalo, volta, saída) em **PN e Caratinga**:
   cadastro, cálculo, aprovação, Financeiro e todos os relatórios.
3. **Modo tablet (quiosque):** 2 tablets da empresa; ponto só neles, dentro da localização.
   Celular pessoal e supervisor não batem/registram ponto fora dali.
4. **Facial sem CPF, ordem automática:** câmera aberta escaneando; reconhece → identifica →
   registra a próxima batida do dia sem clicar nada.
5. **Fora da empresa:** funcionário só vê os próprios erros.

**Ambiguidades a confirmar ANTES de programar** (não assumir): escopo do "tirar acesso de
supervisores"; como o tablet se identifica como "da empresa"; quem não tem facial no dia da
virada / falha de reconhecimento 1:N; regra do "próximo ponto" quando alguém pula uma batida.
Cada item entra com plano curto (critério de sucesso + backend/frontend/banco/fluxo/testes +
"Preciso que você decida").

---

## 5. Como retomar

1. Ler `00-INDEX.md` → `CHECKPOINT_SESSAO_2026-08-31.md` → este arquivo.
2. `git status --short` limpo · `npm run typecheck` 0 · `npm run lint` 0.
3. Se o Victor respondeu §2: aplicar as migrations aprovadas (arquivo em
   `supabase/migrations/`, via CLI/MCP, conferir com SELECT depois), depois §2.3–2.5.
4. Só então começar o roadmap (§4), item 1.
