# CHECKPOINT — Sessão 2026-06-27

> Feature: **novo usuário mestre `2626`** + **edição de ponto exclusiva do `2626`** (ninguém
> mais — nem o 9999 — pode alterar data/horário de ponto). Reforço na tela **e** no servidor.
> Regra aplicada o tempo todo: nunca afirmar sem verificar empiricamente.

---

## 1. Pedido do Victor

1. Criar um novo usuário **mestre** (login `cdlogistica` / senha `cdlogistica26`).
2. Tirar do `9999` a permissão de alterar data/horário de ponto.
3. (refinado em conversa) **Ninguém** pode alterar ponto, **somente o `2626`**.

### Decisões de produto confirmadas (via perguntas)
| Decisão | Resposta do Victor |
|---|---|
| Alcance do novo mestre | **Mestre total** (cross-empresa, igual 9999) |
| Login alfanumérico? | **Não** — usar login numérico → ID do mestre = **`2626`** (senha `cdlogistica26`) |
| O que tirar do "editar ponto" | **Tudo de horário**: editar saída + horário manual + dias anteriores (+ reset) |
| Profundidade do bloqueio | **Tela + servidor** |

> "cdlogistica" tem letras e o login do sistema é só-numérico (regra idiomática). Por isso o
> login virou **2626**; a senha continua `cdlogistica26`.

---

## 2. Arquitetura descoberta (antes de mexer)

- O `9999` era o **mestre cravado** em 3 camadas: frontend (bypass de permissões em
  `usePermissions`/`database.ts`), edge fn `create-user`, e **RLS** (`auth.jwt()->>'sub'='9999'`
  em 36 policies). Por isso "tirar permissão pelo banco" não bastava — exigia código.
- Batida de ponto real = edge fn **`clock-in-validated`** com **service_role** (não as funções
  legadas `clockIn/clockOut` do `database.ts`, que estão **mortas**, sem chamadores).
- `recalcAttendance` só grava colunas **calculadas** (não toca horário) → seguro pro trigger.
- `users.id` é `text` (aceita "2626"); senha é bcrypt; `auth-login` aceita string.

---

## 3. O que foi feito (com fonte)

### 3.1 Banco — usuário 2626 (operacional, NÃO commitado)
- `INSERT users(id='2626', role='admin', company=Caratinga, password_hash=bcrypt('cdlogistica26'))`
  via SQL com `extensions.crypt(... gen_salt('bf',10))`. **Senha NÃO entra no git** (igual 9999/8888).
- Verificado: login real via `auth-login` retorna token; senha errada → 401.

### 3.2 RLS — 2626 vira mestre (migration `20260627120000_rls_add_master_2626.sql`)
- 36 policies: `= '9999'` → `IN ('9999','2626')` (preserva otimização initplan e o ramo de
  isolamento por empresa). Verificado real (SET ROLE + claims): 2626 vê 2 empresas (107 func.);
  8888/PN vê só 30; 01/Caratinga vê só 77 → **isolamento intacto**.

### 3.3 Trigger — ponto só o 2626 (migration `20260627120100_attendance_ponto_master_only_trigger.sql`)
- `enforce_ponto_master_only` BEFORE INSERT/UPDATE/DELETE em `attendance`, `SECURITY INVOKER`,
  `SET search_path=''`. Libera service_role/postgres/supabase_admin e `sub='2626'`; bloqueia
  alteração de colunas de horário/data e DELETE pros demais.
- Bateria de testes (ROLLBACK, sem poluir prod): service_role/2626 PASSAM; 01/9999 BLOQUEADOS
  em alterar horário, INSERT com horário e DELETE; supervisor marca status/recalc PASSA.

### 3.4 Frontend (`src/config/masters.ts` — fonte única)
- `MASTER_IDS=['9999','2626']`, `PONTO_EDITOR_ID='2626'`,
  `PONTO_EDIT_PERMISSIONS=['attendance.edit','editHistory','manualTime','reset']`.
- `usePermissions.ts` + `database.ts validatePermission`: permissões de ponto valem **só pro 2626**
  (acima do bypass — nem o 9999); demais permissões = mestres (9999/2626) liberados.
- `database.ts`: `deleteUser` protege 2626; `updateBonusDefault`/`unblockEmployeeBonus` aceitam 2626.
- `CompanySettings`, `PermissionsModal`, `SettingsTab`, `UsersTab`: reconhecem 2626 como mestre.
- `src/config/masters.test.ts`: 13 testes (lógica de mestre/ponto).

### 3.5 Edge fn `create-user` (v2, ACTIVE, verify_jwt:true)
- `callerCanCreateUser`: aceita `2626` além de `9999`. Redeploy via MCP.

---

## 4. O que NÃO foi feito (intencional)
- ❌ Login alfanumérico (Victor preferiu numérico → 2626).
- ❌ Senha do 2626 em migration/git (segredo; criado operacionalmente).
- ❌ Texto de ajuda do `SettingsTab` (linhas 194/206/211 ainda dizem "ID 9999, Senha 684171") —
  cosmético/pré-existente, fora de escopo. (Obs: expõe a senha do 9999 na UI — dívida antiga.)
- ❌ Mexer no produto legado (tabelas drivers/routes/lost_* — outro sistema).

---

## 5. Validação (tudo verde)
- `tsc --noEmit`: **0 erros** (baseline era 0).
- `vitest run`: **446 passed / 18 skipped** (+13 novos). Única falha = `permissions.test.ts`
  **ambiental** (sem `.env` no WSL; passa no CI) — pré-existente, não causada por esta mudança.
- `npm run build`: **OK** (exit 0).
- Banco pós-tudo: users=8, 2626 ok, attendance=3970 (inalterado), employees=107 (inalterado),
  36 policies c/ 2626, trigger existe, **0 erros em error_logs nos últimos 30min**.
- Advisor `function_search_path_mutable` da função nova → **corrigido** (`search_path=''`).

### Smoke test recomendado pro Victor (no navegador)
1. Logar `2626`/`cdlogistica26` → deve ver e usar editar horário/horário manual/reset, em qualquer empresa.
2. Logar `9999` → NÃO deve ver botões de editar/horário manual/reset; mas continua mestre no resto.
3. Funcionário bate ponto no /clock normalmente (não afetado).

---

## 6. Como reverter (se precisar)
- Trigger: `DROP TRIGGER trg_enforce_ponto_master_only ON public.attendance;` (volta edição de ponto ao estado antigo).
- RLS: re-rodar as policies trocando `IN ('9999','2626')` por `= '9999'`.
- 2626: `DELETE FROM users WHERE id='2626';` + reverter os arquivos de frontend/edge fn.
- Edge fn: redeploy a versão anterior (remover `|| callerId==='2626'`).

---

## 7. Estado do git ao fim
- Branch `main` — **pushed para o GitHub** (autorizado pelo Victor). Push do WSL via **SSH**
  (`git@github.com:...`), pois o `origin` HTTPS não tem credencial aqui (memória do projeto).
- Commits desta sessão:
  - `6172ee7` feat(auth): mestre 2626 + edição de ponto exclusiva do 2626 (tela + servidor)
  - `5bad73e` fix(settings): remover senha do admin (684171) exposta na tela de ajuda
- Verificado: `git ls-remote` confirma GitHub `main` == `5bad73e` (local == remoto).
- `dist/` gitignored (não commitado). **Senha do 2626 não está no git.**

---

## 8. Pendências pré-existentes (continuam, não bloqueiam)
- 3 da §7 do checkpoint 29/05 (sync edge fn employee-public-api, validar p_supervisor_id, rate limit).
- ~~Texto de ajuda do SettingsTab expõe senha do 9999~~ → **RESOLVIDO** nesta sessão (commit `5bad73e`).

## 9. Deploy + verificação em produção (fim da sessão)
- **Push para GitHub** dos 2 commits (via SSH). GitHub `main` == `5bad73e` (confirmado por `ls-remote`).
- **Vercel redeployou** a partir do push. Deploy novo confirmado **read-only**: o bundle JS de
  produção (`/assets/index-D12LQ881.js`) contém o código novo (`2626`), prova de que a versão
  nova está no ar (a antiga só teria `9999`). Site responde HTTP 200.
- **Backend já estava no ar** independente do deploy do frontend: usuário 2626, RLS (36 policies),
  trigger e edge fn `create-user` v2 foram aplicados via MCP.

### Teste de login do 2626 em produção (READ-ONLY, zero escrita)
Reproduzida a sequência exata do `loginUser()` do site contra os endpoints reais:
1. `POST /functions/v1/auth-login` {2626 / cdlogistica26} → **token + user OK**.
2. `GET /rest/v1/users?id=eq.2626` com o token → retorna `{id:2626, role:admin}` (RLS deixa, sessão válida).
3. `GET /rest/v1/employees` com o token → **107 funcionários / 2 empresas** → comportamento de **mestre** confirmado.
- ⚠️ Navegador headless (Playwright) **não rodou no WSL**: falta lib de sistema `libnspr4.so`
  (precisa `sudo apt`/`playwright install-deps`). Mesma razão de o Playwright rodar só no CI.
  Não afeta o site — o teste acima exercita exatamente o que a tela de login chama.

### Integridade final (verificado ao vivo, nada se perdeu)
- `attendance` total **3970** (inalterado) · pontos de **hoje (27/06): 23**, todos com entrada.
- Todos os testes de trigger foram em transações com `ROLLBACK` → nunca gravaram. Linha de teste
  conferida: horários originais intactos. `error_logs` = 0 nos últimos 30 min.
- Working tree limpa; arquivo temporário de teste removido.

## 10. Como retomar
Ler este arquivo + `CHECKPOINT.md` (topo). Estado: **mestre 2626 no ar e logando**; edição de
ponto exclusiva do 2626 (frontend + RLS + trigger); 9999 segue mestre mas sem editar ponto.
Próximo passo opcional: Victor confere no navegador (login 2626 vê botões de editar ponto; 9999 não).

*Sessão 2026-06-27. Mestre 2626 + edição de ponto exclusiva do 2626 (tela + servidor), deployado, logando em prod, zero perda de dados. Verificado empiricamente. Claude Opus 4.8.*
