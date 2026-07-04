# CHECKPOINT — Sessão 2026-07-04 (auditoria + Fix Bug #1 e Bug #2)

> Auditoria read-only completa da aba **Pagamentos Driver** (7 dimensões + verificação
> adversarial) e correção dos **Bug #1 (rota-fantasma/duplicata multi-rota)** e
> **Bug #2 (salvar cadastro do driver apagava a taxa por rota)**. 100% aditivo, sem
> migration, validado ponta a ponta. Branch `feature/pagamentos-driver`.
> **Commit ainda NÃO feito** (aguarda ok do Victor); push é manual.

---

## 1. Auditoria (contexto)
Auditoria orquestrada (7 auditores + 9 verificadores adversariais). Achados, por severidade calibrada:

- 🔴 **Bug #1 — rota-fantasma/duplicata** (multi-rota): **CORRIGIDO** (§2a).
- 🔴 **Bug #2 — salvar config do driver reaplicava taxa plana a TODAS as rotas** apagando a taxa-por-rota: **CORRIGIDO** (§2b).
- 🟠 **Segurança — exclusividade "só 2626" é client-side apenas.** RLS = `company_id OR sub IN (9999,2626)`;
  RPCs de período sem authz do chamador. Insider mesma-empresa + 9999 acessam via PostgREST. **PENDENTE (decisão).**
- 🟡 `driverpay_periods` sem trigger de trava; bucket de provas público; `driverPayCalc.ts` sem termo Zapex (só teste). **PENDENTES.**
- 🟢 Baixas/UX (Zapex não reverte input em erro; reloadPayments engole erro; orfão de prova em falha de upload;
  driver em 2+ grupos some do subtotal; filtro de rota não reseta ao trocar período; driver novo não entra no período aberto sem aviso).

## 2a. Fix Bug #1 — rota-fantasma/duplicata (aditivo, sem migration)
**Raiz:** renomear/remover rota mirava o cache de ids do cliente (`packageIds`), vazio numa rota recém-criada.
A identidade real de uma rota é `(payment_id, route)`.
- `src/services/driverPay.ts` (+2 métodos): `deletePackagesByRoute` (apaga por `payment_id+route`) e
  `renameRoutePackages` (**UPDATE atômico** do `route`; preserva `rate_snapshot`; colisão → rollback do statement).
- `src/components/driverpay/DriverPayTab.tsx`: `onCityBlur` usa `renameRoutePackages`; `onRemoveRoute` usa
  `deletePackagesByRoute`; import ajustado (removido `deletePackage`).
- Fecha também DP-2 (remover reaparecia) e DP-02 (rename não-atômico).

## 2b. Fix Bug #2 — config do driver apagava a taxa por rota (aditivo, sem migration)
**Raiz:** `handleDriverSaved` reaplicava a taxa **plana** em **todas** as rotas, **incondicionalmente**
(disparava até editando só PIX/telefone), atropelando os overrides por rota.
**Correção:** o modal passa a informar **só as taxas que mudaram** (antigo→novo); a reaplicação é seletiva.
- `src/components/driverpay/DriverFormModal.tsx`: captura a taxa original ao abrir (`originalRatesRef`);
  `onSaved(driverId, rateChanges)` passa o delta; novo tipo `DriverRateChange`.
- `src/components/driverpay/driverPayShared.ts`: nova função **pura** `planRateReapply(routes, ratesByPlatform, rateChanges)`
  — reaplica SÓ nas rotas que ainda usavam a taxa antiga (preserva overrides por rota); vazio se nada mudou; comparação em centavos.
- `src/components/driverpay/DriverPayTab.tsx`: `handleDriverSaved(driverId, rateChanges)` usa `planRateReapply`;
  removido `getDriverRates` do import.
- `tests/unit/driverPayRateReapply.spec.ts` (**novo, 11 casos**): edição de PIX/telefone não mexe em nada; override por
  rota preservado; rota-no-padrão atualizada; float/centavos; fallback; multi-plataforma.

## 3. Validação (tudo verde — cobre os dois fixes juntos)
- **tsc** (`-p tsconfig.app.json`): **63 erros = baseline pré-existente**, **0 novos** no escopo driverpay.
- **build** (`vite build`): exit 0, chunk `DriverPayTab-*.js` gerado.
- **unit** (`vitest run`): **481 passed / 18 skipped / 0 failed** (era 470; +11 do teste novo). Os 18 skipped são
  edge-fns/push/face que exigem `SUPABASE_SERVICE_ROLE_KEY` (ausente local por design; rodam no CI; nenhum toca driverpay).
- **E2E banco REAL (Bug #1)** (Supabase `flcncdidxmmornkgkfbb`, `DO`-block revertido com `RAISE EXCEPTION`):
  comportamento ANTIGO reproduziu a duplicata (`OLD_distinct_routes=2`); NOVO: rename→1 rota, delete→0.
  **prod intacta** antes/depois: 62 linhas, 57 pagamentos, **R$ 27.862,30**, 0 marcadores.
- **Bug #2**: lógica de decisão isolada em função pura e coberta por 11 testes unit (deterministicos, sem tocar prod).
- **Playwright smoke** (spec 52, chromium): **2 passed / 2 skipped** — a aba renderiza com os dois fixes no working tree.
  (1ª tentativa falhou por cold-compile do Vite no WSL — `page.goto` 86s > `navigationTimeout` 15s; resolvido pré-aquecendo. Não era o fix.)

## 4. Ponte Nova
A aba **aparece** em Ponte Nova (visibilidade é do mestre 2626, não por empresa; módulo multi-empresa por `company_id`),
mas os dados de Ponte Nova estão **zerados** (0 drivers/plataformas/períodos/pagamentos). Só a **Caratinga** foi populada.
Para usar em Ponte Nova: logar 2626 + Ponte Nova → cadastrar/importar drivers → plataformas → criar período. Sem mudança de código.

## 5. Estado / próximos passos
- **Git:** 4 arquivos modificados + 1 teste novo (`driverPayRateReapply.spec.ts`), **sem commit** (aguarda ok). Push é manual.
- **Pendências da auditoria** (não tocadas): 🟠 Segurança 2626 server-side, 🟡 trava de `driverpay_periods`,
  bucket público, `driverPayCalc` Zapex, e as 🟢 baixas/UX.
- Próximo passo sugerido: commitar Fix #1 + Fix #2 e decidir os itens de segurança.

*Sessão 2026-07-04. Bug #1 e Bug #2 corrigidos na raiz, 100% aditivos, validados (tsc+build+unit 481/0+E2E banco real revertido+smoke). Claude Opus 4.8.*
