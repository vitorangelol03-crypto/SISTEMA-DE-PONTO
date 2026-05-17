# CHECKPOINT_OPERACAO.md — Deploy, Manual Ops, Troubleshoot

> Como operar o sistema em prod. Última atualização: **2026-05-13**.

---

## 1. Variáveis de ambiente (`.env` local)

```bash
VITE_SUPABASE_URL=https://flcncdidxmmornkgkfbb.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key — público, pode commitar em prod>
SUPABASE_SERVICE_ROLE_KEY=<service_role — SOMENTE LOCAL/CI, NUNCA no frontend prod>
```

**Frontend deploy (Vercel/Netlify/Cloudflare):** SOMENTE `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. **NUNCA** committar/upload `SERVICE_ROLE_KEY` — ela bypassa RLS completamente.

---

## 2. Deploy frontend (manual — pendente)

1. Build local: `npm run build`
2. Output em `dist/`
3. Upload pro hosting de escolha (Vercel/Netlify/Cloudflare Pages/etc.)
4. Configurar env vars no hosting: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
5. Smoke test pós-deploy: login admin `9999` + clock-in via `/clock`

---

## 3. Deploy edge function (via MCP)

```javascript
mcp__claude_ai_Supabase__deploy_edge_function({
  project_id: 'flcncdidxmmornkgkfbb',
  name: 'nome-da-fn',
  files: [{ name: 'index.ts', content: '...' }],
});
```

Após deploy:
- `mcp__claude_ai_Supabase__list_edge_functions` → confirmar status ACTIVE + nova versão.
- `mcp__claude_ai_Supabase__get_logs` (service='edge-function') → confirmar zero erros.

---

## 4. Aplicar migration (via MCP)

```javascript
mcp__claude_ai_Supabase__apply_migration({
  project_id: 'flcncdidxmmornkgkfbb',
  name: 'descricao_curta_da_migration',
  query: 'BEGIN; ... COMMIT;',
});
```

**Pre-check obrigatório** (Regra 1):
```javascript
mcp__claude_ai_Supabase__list_tables({ schemas: ['public'] });
mcp__claude_ai_Supabase__execute_sql({ query: 'SELECT count(*) FROM tabela_alvo' });
```

**Post-check obrigatório:**
```javascript
mcp__claude_ai_Supabase__execute_sql({
  query: "SELECT * FROM information_schema.tables WHERE table_name = 'nova_tabela'"
});
mcp__claude_ai_Supabase__get_advisors({ type: 'security' });
```

---

## 5. Onboarding nova empresa (manual via UI)

1. **Admin master `9999` faz login** → dashboard
2. **Admin tab** → digite senha admin (`Clayton2024`)
3. **Section "Companies"** → "Criar nova empresa" → preenche nome, CNPJ, cidade, lat/lng, radius
4. **Cria admin local** da empresa (id ex: `7777`) via Usuários tab
5. **Importa employees** via Funcionários tab → "Importar Excel"
6. **Configura `payment_period_config`** via Admin tab → "Configurações da Empresa"
7. **Configura `bonus_types`** (B, C1, C2 ou customizados) via Gestor de Bonificações

### Specifico Ponte Nova (pendente Victor)
- [ ] Importar ~30 employees via Excel
- [ ] Configurar geolocation (lat/lng + radius do escritório PN)
- [ ] Configurar bonus_types
- [ ] Validar login admin 8888
- [ ] Smoke test: 1 funcionário marca ponto via `/clock`

---

## 6. Reset PIN de funcionário (manual)

Via UI:
1. Admin master → tab Funcionários → busca employee → ícone "Editar"
2. Click "Resetar PIN" → confirma → `pin_configured` volta `false`, `pin` é wiped
3. Funcionário no próximo acesso ao `/clock` precisa configurar novo PIN

Via SQL (emergency):
```sql
UPDATE employees
SET pin = NULL, pin_configured = false
WHERE id = '<uuid>';
```

---

## 7. Reset facial de funcionário (manual)

Via UI:
1. Admin master → tab Funcionários → "Editar" → "Resetar Face"
2. `face_reset_requested = true` → próximo login funcionário precisa re-cadastrar
3. Audit trail em `face_auth_attempts`

---

## 8. Reset Geral (limpa dados de UMA empresa — destrutivo)

Via UI Admin Tab → Section "Reset Geral" → digita senha + nome empresa pra confirmar.
**ATENÇÃO:** Apaga TODAS as attendance, payments, bonuses da empresa selecionada. NÃO apaga employees, users, companies. Use com extremo cuidado.

---

## 9. Troubleshoot — Bugs latentes conhecidos

### "Multiple GoTrueClient instances detected"
- **Causa:** Proxy/rebuild de SupabaseClient (já fixado em 14.4.9).
- **Se reaparecer:** verificar se algum import circular em `src/lib/supabase.ts` ou se algum dev importou `createClient` direto em outro lugar.

### "useCompany must be used inside <CompanyProvider>"
- **Causa:** Fast Refresh invalidando module (já fixado em 14.4.9 com split de companyHelpers).
- **Se reaparecer:** verificar se algum arquivo importa `getCurrentCompanyId` de `CompanyContext.tsx` em vez de `companyHelpers.ts`.

### Funcionários sumindo da lista (lista vazia silenciosa)
- **Causa:** localStorage `timecard_user` presente sem sessionStorage `sb-custom-token` (já fixado em 14.4.7).
- **Manual fix:** abrir DevTools → Application → Storage → `localStorage.removeItem('timecard_user')` → reload.

### HTTP 401 payment_periods on boot
- **Causa:** `autoCreateWeeklyPeriod` fires antes do JWT estar setado (já fixado em 14.4.5 com guard).
- **Se reaparecer:** verificar `src/services/database.ts:autoCreateWeeklyPeriod` tem `if (!getAuthToken()) return;` early.

### HTTP 406 em queries `.single()`
- **Causa:** `.single()` exige exatamente 1 row, 0 rows retorna 406.
- **Fix:** trocar pra `.maybeSingle()` (já feito em várias funções em 14.4.4).

### Tela branca ao trocar empresa
- **Causa:** `setCompany(id)` throw → bloqueia reload (já fixado em 14.4.2).
- **Fix atual:** `CompanySwitcher` bypassa `setCompany`, escreve localStorage direto + `window.location.reload()`.

### Cold-start `create-user` (~150s primeira chamada)
- **Causa:** esm.sh bcryptjs download na primeira invocação após deploy/idle.
- **UI behavior:** Spec 37 tem `timeout: 60_000` no describe pra acomodar; UI mostra spinner.
- **TECH_DEBT 6.13** documenta. Não é bug, é característica da Supabase Edge Functions free tier.

---

## 10. Backup + restore (sub-fase 16.5 — drill automatizado)

### 10.1 Snapshot JSON aplicacional (todas empresas)

Script generalizado pra fazer snapshot de TODOS os dados das tabelas core,
particionado por `company_id` + dados globais (companies, feature_versions).

```bash
# Backup completo (~4-30 MB JSON dependendo do volume)
node scripts/backup-all.mjs
# → cria backups/all-YYYY-MM-DDTHHmm.json

# Backup Caratinga-only (legacy, mantido)
node scripts/backup-caratinga.mjs
# → cria backups/caratinga-YYYY-MM-DD-HHMMSS.json
```

Requer `SUPABASE_SERVICE_ROLE_KEY` em `.env` (bypassa RLS).

### 10.2 Verificação de integridade (drill)

```bash
# Compara backup vs estado atual do DB (row counts por tabela)
node scripts/verify-backup.mjs backups/all-YYYY-MM-DDTHHmm.json
# Exit codes: 0=match perfeito, 1=drift (DB ativo), 2=erro
```

Output:
- `✅ Match`: row count idêntico (sem mudanças desde backup)
- `⚠️  Drift`: count diferente (esperado se DB ativo)
- `❌ Error`: falha de acesso a tabela

**Use como drill mensal:** rodar backup-all + verify-backup. Drift > 100 rows
em tabelas core sem atividade real = investigar (possível corrupção, race).

### 10.3 Backup schema + dados completo (DDL)

```bash
# Via supabase CLI (instalar primeiro: npm i -g supabase)
supabase db dump --project-ref flcncdidxmmornkgkfbb > backup-$(date +%Y%m%d).sql
```

Diferença vs JSON aplicacional:
- `db dump` = schema + dados completos (~MB grandes, restore via psql)
- `backup-all.mjs` = só dados aplicacionais (sem schema, restore via UPSERT manual)

### 10.4 Restore (CUIDADO — só em emergência total)

```bash
# Schema + dados (SQL completo)
psql "postgres://postgres:<password>@db.flcncdidxmmornkgkfbb.supabase.co:5432/postgres" < backup-XXXX.sql

# Dados JSON aplicacional: restore manual via UPSERT (não automatizado)
# Pra cada tabela: ler backup.companies_data[id].tables[name].rows
# e UPSERT via service_role respeitando FKs.
```

**Backups antigos `backup_*`** foram dropados em 11.0 — não tentar restore de `backup_*`.

---

## 11. Monitoring (instalado em 14.4.5)

Tabela `monitoring_settings` com seed `error_tracking_enabled=true`.
`ErrorBoundary.tsx` envia JS errors para `error_logs` via `errorTracking.captureError`.

Para desligar tracking (debugging local):
```sql
UPDATE monitoring_settings SET error_tracking_enabled = false WHERE id = '<id>';
```

---

## 12. Rotação de JWT_SECRET (CUIDADO)

Se precisar rotacionar JWT_SECRET:
1. **Supabase Dashboard → Settings → API → JWT Settings → "Generate new JWT Secret"**
2. **Dashboard → Settings → Edge Functions → Secrets → `JWT_SECRET`** → atualizar pra novo valor
3. **TODOS os JWTs custom emitidos com o secret antigo são invalidados** — todos os users são deslogados.
4. Pode levar até 5min pra Edge Functions terem o novo secret propagado.

---

## 13. Comandos úteis (cheat sheet)

```bash
# Estado atual do banco
mcp__claude_ai_Supabase__list_tables({ schemas: ['public'] })
mcp__claude_ai_Supabase__list_edge_functions()
mcp__claude_ai_Supabase__get_advisors({ type: 'security' })

# Logs edge function (últimas 24h)
mcp__claude_ai_Supabase__get_logs({ service: 'edge-function' })

# SQL ad-hoc
mcp__claude_ai_Supabase__execute_sql({ query: 'SELECT ...' })

# Git
git log --oneline -10
git status --short
git diff --stat HEAD~5

# Tests
npx tsc --noEmit
npx vitest run
npx playwright test --workers=1 --reporter=line
```
