# CHECKPOINT_ARQUITETURA.md — Arquitetura técnica + Decisões

> Stack, padrões, fluxos, decisões D1-D6. Para visão executiva, ver `CHECKPOINT.md`.

---

## 1. Stack do projeto

### Frontend
- **React 18.3** + TypeScript 5.5 + **Vite 5.4** (oxc/rolldown experimental flags)
- Tailwind CSS + lucide-react (ícones)
- **react-hot-toast** (notificações)
- **face-api.js** (reconhecimento facial — feature opcional)
- **xlsx-js-style** (exportação Excel — com stream-stub local pra Vite browser compat)
- Roteamento: route próprio simples (sem react-router) — App.tsx switch por `window.location.pathname`

### Backend
- **Supabase** (PostgreSQL 17.6 em sa-east-1)
- **Edge Functions Deno** (4 ACTIVE em prod — ver `CHECKPOINT_BANCO.md`)
- Auth: **JWT custom HS256 (NÃO usa Supabase Auth)** — ver §3
- Storage: localStorage (`timecard_user`, `sistema_ponto_company_id`) + sessionStorage (`sb-custom-token`, `sistema-ponto-gotrue`)

### Testes
- **Vitest 4** (unit + integration — 422+ tests passing)
- **Playwright 1.59** (E2E — ~250+ tests passing, 0 flakes em workers=1)
- **ESLint 9.39** + tsc strict

### Project ID Supabase
`flcncdidxmmornkgkfbb` (PNR Dashboard, sa-east-1, PG 17.6)

---

## 2. Companies em prod

| Company | UUID | Admin local | Employees |
|---|---|---|---|
| **Caratinga** (CLAYTON B DOS SANTOS) | `6583bb2a-e334-41a7-b69c-7d98f3b46dfc` | 9999 (master) | ~30 |
| **Ponte Nova** (CD LOGISTICA LTDA) | `2b2abc4b-084c-4cf0-b5f1-02792513241d` | 8888 | 0 (onboarding pendente) |

**`DEFAULT_COMPANY_ID = '6583bb2a-...' (Caratinga)`** — fallback em `src/services/database.ts`.

---

## 3. Fluxo de autenticação (CRÍTICO — multi-tenant)

### Login
1. **Frontend** `loginUser(id, password)` → `fetch POST /functions/v1/auth-login` com `Authorization: Bearer ANON_KEY`.
2. **Edge fn `auth-login` v9:**
   - `SELECT users.password_hash WHERE id = ?` (via service_role)
   - `bcryptjs.compare(password, password_hash)` → valid?
   - Gera JWT HS256 manualmente: header + payload + HMAC-SHA256(data, `JWT_SECRET`)
   - JWT payload: `{sub: id, role: 'authenticated', aud: 'authenticated', company_id: <uuid>, exp: <24h>}`
   - Retorna `{token, user: {id, company_id}}`
3. **Frontend `loginUser`:** chama `setAuthToken(token)` de `src/lib/supabase.ts`.
4. **`setAuthToken`** persiste em `sessionStorage['sb-custom-token']`.
5. **Próximas queries Supabase:** fetch interceptor lê `sessionStorage` e injeta `Authorization: Bearer <jwt>`. RLS policies leem `auth.jwt() ->> 'company_id'`.

### Admin master `9999` bypass
- Policies têm `OR auth.jwt() ->> 'sub' = '9999'` → vê todas empresas.
- Switch via `CompanySwitcher` persiste em `localStorage['sistema_ponto_company_id']`.
- JWT permanece com `company_id` original; UI/state armazenam o switch.

### Logout
- `clearAuthToken()` remove `sessionStorage['sb-custom-token']` + `localStorage['timecard_user']`.
- Next request volta a ser anon (bloqueado pela maioria das policies).

### Sessão expirada (sub-fase 14.4.7)
- `useAuth.ts` detecta inconsistência: localStorage `timecard_user` presente, mas sessionStorage `sb-custom-token` ausente → força re-login (clean state).
- Causado por: aba duplicada, dev server restart, ou JWT expirado.

---

## 4. Refator supabase.ts (sub-fase 14.4.9 — CRÍTICO)

**Antes (problema):** Proxy + `buildClient()` recriando o `SupabaseClient` a cada `setAuthToken` → N instâncias de GoTrueClient → warning "Multiple GoTrueClient instances detected".

**Depois (solução):**
- **UMA** instância `supabase` criada uma única vez.
- **Custom fetch interceptor** lê `sessionStorage['sb-custom-token']` a cada request e injeta `Authorization: Bearer <jwt>`.
- Sem rebuild, sem Proxy, sem warning.

```ts
const customFetch: typeof fetch = (input, init) => {
  const token = sessionStorage.getItem('sb-custom-token');
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sistema-ponto-gotrue' },
  global: { fetch: customFetch },
});
```

`setAuthToken` / `clearAuthToken` apenas escrevem em sessionStorage — o fetch interceptor pega na próxima request automaticamente.

---

## 5. CompanyContext + Fast Refresh (sub-fase 14.4.9)

`getCurrentCompanyId` (helper síncrono) **NÃO pode ser exportado do mesmo arquivo que o componente `CompanyProvider`** — React Fast Refresh invalidaria o módulo a cada HMR → page reload → module duplication → `useCompany` throw `must be used inside Provider`.

**Solução:** split em 2 arquivos:
- `src/contexts/CompanyContext.tsx` — só componente + hook.
- `src/contexts/companyHelpers.ts` — `getCurrentCompanyId`, `COMPANY_STORAGE_KEY`.

`ErrorBoundary.tsx` importa **direto** de `companyHelpers.ts` (não via re-export do Context).

---

## 6. Decisões arquiteturais (D1-D6 — TODAS RESOLVIDAS)

| # | Decisão | Resolução | Sub-fase | Commit |
|---|---|---|---|---|
| **D1** | `nighttime_minutes → nightCreditMinutes` | **C — Diurno primeiro** | 8.3 | `e70da28` |
| **D2** | `admin_cleanup_config` strategy | **ES — Estrutural** (UNIQUE + lazy-create) | 7.2 + 7.2.1 | `19a72f3`, `0840f9c` |
| **D3** | **RLS strategy** | **C — auth.jwt() ->> 'company_id'** (JWT custom HS256) | 11.2 + 11.1 | `27b7796`, `23dc365` |
| **D4** | **Hash de senhas** | **B — Edge fn `auth-login` com bcrypt** | 11.3 | `41bd25c` |
| **D5** | `error_logs` adicionar `company_id` | **A — Sim, adicionar** | 7.4 | `b2a1bbb` |
| **D6** | `bonus_defaults` legacy | **C — Drop após validar callers** | 7.3 | `73d7649` |

---

## 7. Restrições arquiteturais confirmadas

- **Login SEM email.** ID numérico + senha, ponto. (Memory `project_auth_no_email`.)
- **Tabelas legado (15)** — `drivers`, `lost_*`, `routes`, `ai_reports`, etc. — são de **outro projeto** ("objetos perdidos") no mesmo Supabase. **Não mexer.**
- **`users.password` plain text — DROPADA em 11.1.** Único guardião: `password_hash` bcrypt.
- **PIN funcionário (`employees.pin`) ainda plain text** — validado server-side via edge fn `employee-public-api/verify-pin`. Não exposto a anon (RLS bloqueia). Migrar pra bcrypt = sub-fase 11.9 (postponed; sem necessidade urgente).
- **32 tabelas backup_*** dropadas em 11.0 — sem mecanismo de restore.

---

## 8. Padrões idiomáticos do projeto

### React
- Componentes em **PascalCase**; hooks com prefix `use`.
- `useEffect` com `[company?.id]` deve ter cleanup de state ID-based.
- `useCallback` com deps corretas — **NÃO suprimir warnings**.
- Class component (ex: `ErrorBoundary`) usa helpers diretos do localStorage.

### TypeScript
- **Sem `any`** sem comentário inline justificando.
- Tipos explícitos sempre.
- Supabase queries: `const { data, error } = await ...; if (error) throw error;`

### Estilos
- Tailwind exclusivamente (sem CSS modules).
- Componentes mobile-first (`min-h-[44px]` em botões pra touch).

### Multi-tenant
- `company.id` sempre passado por param em funções de service.
- RLS policies idiomáticas: `auth.jwt() ->> 'company_id' = company_id`.

### Edge functions
- Deno + esm.sh imports.
- `verify_jwt: true` por default. Exceções: `auth-login` (emite tokens, `false`) + `employee-public-api` (fluxo público, `false`).

---

## 9. Storage layout

| Chave | Local | Conteúdo | Quando usar |
|---|---|---|---|
| `timecard_user` | localStorage | `{id, role, name?, company_id}` | Hidratação inicial pós-login |
| `sistema_ponto_company_id` | localStorage | UUID da empresa atual | Admin switch CompanySwitcher |
| `sb-custom-token` | sessionStorage | JWT custom HS256 | Auth header em requests Supabase |
| `sistema-ponto-gotrue` | localStorage | Supabase JS GoTrue internal | Não usado por nós (persistSession=false), só pra storageKey único |

---

## 10. Build + Vite quirks

### Stream stub (sub-fase 14.4.6)
`xlsx-js-style` importa `stream` (Node.js core) → Vite browser bundle falha. Solução:
- `src/lib/stream-stub.ts` — empty stub.
- `vite.config.ts` → `resolve.alias: { stream: path.resolve(__dirname, 'src/lib/stream-stub.ts') }`.

### Lint config
- ESLint 9 flat config (`eslint.config.js`).
- Vitest globals via `tsconfig.app.json` types.
- Playwright globals via `tsconfig.json`.

---

## 11. Fluxos públicos pós-RLS (sub-fase 11.8)

`/clock` e `/erros` são acessadas SEM login (anon). Mas tabelas têm RLS ON. Solução: todas as queries passam pela edge fn `employee-public-api` (verify_jwt: false), que usa **service_role internamente** pra bypass RLS após validar CPF/PIN do funcionário.

**11 actions:**
- `lookup-companies-by-cpf` — descobre quais empresas o CPF está cadastrado
- `lookup-employee` — busca employee por CPF + companyId
- `verify-pin` — valida PIN
- `set-pin` — configura PIN inicial (primeira vez)
- `today-attendance` — busca attendance do dia
- `attendance-history` — histórico paginado
- `face-config` — config facial da company
- `face-descriptor` — descriptor salvo do employee
- `save-face` — salva descriptor + photoUrl
- `log-face-attempt` — log de tentativa (success/failure)
- `employee-errors-by-period` — busca erros do funcionário num período

Todas exigem `cpf` ou `employeeId` no body — auth via dados do próprio funcionário (não JWT).
