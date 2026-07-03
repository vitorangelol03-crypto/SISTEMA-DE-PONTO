# CHECKPOINT — Sessão 2026-07-03

> Feature nova completa: **aba "Pagamentos Driver"** (iMile CTGA / Caratinga) — pagamento
> quinzenal por pacote dos entregadores. Construída ponta a ponta (banco → serviço → UI →
> PDF/relatório → import → testes), 100% ADITIVA, sem tocar no sistema de ponto nem no SPX.

---

## 1. O que o Victor pediu
Nova aba pra automatizar a planilha `PLANILHA DE PAGAMENTOS IMILE CTGA 2026 (1).xlsx`:
57 drivers pré-cadastrados; valor/pacote **individual por plataforma** (eMile/ANJUN, padrão R$2);
**desconto** (valor + código do pacote) e **vale** (adiantamento) descem do total; **grupos**
(criar/editar + valor por grupo, filtrar, driver individual E no grupo); busca por nome + filtro
por rota; **espelho (PDF)** individual/grupo/massa **com pré-visualização**; adicionar **mais
plataformas** (individual ou em massa); **multi-rota** (pacotes por rota × plataforma, juntar/＋rota);
**concluir quinzena** → imutável → gera a próxima → histórico; **relatório geral**. Visual no tema
do sistema (claro, ícones lucide). "Construir completo e testar tudo E2E."

## 2. Arquitetura — namespace `driverpay_*` (ACHADO CRÍTICO)
O banco **já tinha** `public.drivers` (96 linhas), `routes`, `route_groups`, `driver_route_links`
etc — do **outro produto (Painel SPX / logística)** que divide o mesmo Supabase. Por isso TODAS as
tabelas novas usam o prefixo **`driverpay_*`**, 100% isolado. Nada do SPX foi tocado.

## 3. Banco (2 migrations aplicadas em prod + no repo)
`20260703170000_create_driverpay_module.sql` + `20260703170100_harden_driverpay_rpc_grants.sql`.
- **10 tabelas**: driverpay_drivers, _platforms, _platform_rates, _groups, _group_members,
  _periods, _payments, _payment_packages, _discounts, _vales.
- **1 view** `driverpay_payment_computed` (security_invoker) — fonte única da fórmula.
- RLS: 1 policy `FOR ALL` por tabela (company_id + mestre 9999/2626), padrão initplan-otimizado.
- **Trigger de trava** `driverpay_enforce_period_locked` (4 triggers): período concluído = imutável,
  exceto backend (service_role/postgres) e mestre **2626** — paridade com o ponto.
- **Trigger de coerência** `driverpay_enforce_child_company` (3 triggers): filha não aponta pai de
  outra empresa.
- **2 RPCs** SECURITY DEFINER: `driverpay_create_period` (cria + pré-carrega) e
  `driverpay_conclude_period` (congela totais → marca concluído → cria próxima → pré-carrega +
  carrega esqueleto de rotas). Hardening: EXECUTE revogado de anon/PUBLIC (só authenticated).
- Índices em todas as FKs (convenção `idx_driverpay_*`).
- **Fórmula**: `total_net = Σ(packages × rate_snapshot) − Σ descontos − Σ vales` (net pode ser negativo).

## 4. Código (aditivo)
- **Serviço** `src/services/driverPay.ts` (tipos + ~35 métodos; `ensurePerm` espelha
  validatePermission via helpers exportados).
- **Componentes** `src/components/driverpay/` (17 arquivos): DriverPayTab (orquestrador) +
  lista/linha (multi-rota inline, juntar/＋rota), filtros, seletor de período, e modais
  (driver, desconto, vale, grupos, plataforma, novo/concluir período, histórico, import, espelho).
- **PDF**: `src/utils/driverMirrorGenerator.ts` + `driverMirrorPdf.ts` (espelho A4 individual/grupo/massa,
  molde holerite; empresa "CD LOGISTICA").
- **Relatório**: `src/utils/driverReport.ts` (Excel xlsx-js-style com plataformas dinâmicas + PDF).
- **Import/seed**: `src/utils/driverImport.ts` (parser pareado/plano) + `src/data/driverSeed.ts` (57).
- **Cálculo puro testável**: `src/utils/driverPayCalc.ts`.
- **Fiação** (aditiva): TabType + ícone Truck (TabNavigation), lazy+case (App.tsx),
  `DriverPayPermissions` + 3 defaults + labels (types/permissions.ts — supervisor NÃO vê por padrão,
  decisão Victor "admin/mestre por ora"), i18n pt/en.

## 5. Seed em prod (Caratinga) — 57 drivers reais
Aplicado via MCP (DO block, idempotente). Plataformas eMile+ANJUN, 57 drivers, 114 taxas,
60 linhas de pacote (multi-rota Fernando 2 + Gessiley 3), desconto do Caio (R$50, pacote 741412525252),
período **1 QUINZENA DE JUNHO 2026 (aberto)**. **Total geral R$ 27.862,30** — e o `total_net`
gravado == recálculo da view (prova a fórmula ponta a ponta).

## 6. Validação (tudo verde)
- `tsc`: **0 erros novos** da feature (baseline pré-existente 63 inalterado; os 2 erros de
  services/permissions.ts e o React-unused de App.tsx são PRÉ-EXISTENTES, confirmado por diff).
- `npm run build`: **OK** (exit 0), chunk DriverPayTab gerado.
- `vitest run`: **460 passed / 18 skipped** (446 antigos + 14 novos; 0 regressão). Única falha =
  `permissions.test.ts` ambiental (sem .env no WSL; passa no CI) — pré-existente.
- **E2E de backend (via MCP, transação auto-revertida — prod intacta)**:
  recompute ao vivo (Igor +10 pacotes → R$120) ✓ · concluir → concluído + próxima com 57 payments +
  60 pacotes-esqueleto ✓ · **imutabilidade**: supervisor não-mestre bloqueado de editar período
  concluído ✓.
- SPX (`drivers` 96) e ponto (`attendance` 4077) **intactos** o tempo todo.

## 7. O que NÃO foi feito / pendências
- **E2E Playwright (browser)**: `tests/52-driverpay.spec.ts` criado, mas **não roda no WSL**
  (falta `libnspr4` — mesma limitação do resto; roda no CI). O E2E de backend acima cobre os
  fluxos críticos server-side.
- **Deploy do frontend**: a aba só aparece em produção depois do Victor dar deploy (Vercel) do build
  novo. O banco já está no ar.
- Driver cadastrado DEPOIS do período existir só entra na grade no próximo período (ou recriando com
  preload) — fluxo natural: cadastrar/importar drivers → criar período.
- Supervisores não veem a aba por padrão (liberável por usuário no PermissionsModal).

## 8. Git
- Branch **`feature/pagamentos-driver`** (isolada do main). Commit local (SEM push).
- Rollback do banco: ver rodapé de `supabase/migrations/20260703170000_create_driverpay_module.sql`.

## 9. Como retomar
Ler este arquivo + `CHECKPOINT.md`. Estado: aba pronta e validada; banco populado (Caratinga,
junho aberto). Próximo passo do Victor: **deploy Vercel** pra ver a aba no ar, conferir no navegador
(login mestre 2626 ou admin → aba "Pagamentos Driver"), e testar o fluxo real. Depois, se aprovado,
merge da branch.

*Sessão 2026-07-03. Aba Pagamentos Driver completa (banco + UI + PDF + relatório + import + seed 57),
validada ponta a ponta no backend, zero impacto no ponto/SPX. Claude Opus 4.8.*
