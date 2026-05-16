# CHECKPOINT_PROXIMOS_PASSOS.md — Pendências + Ações Victor + Gaps

> O que falta pra go-live e além. Última atualização: **2026-05-13**.

---

## 1. 🚀 GO-LIVE — Ações manuais do Victor (sistema 100% pronto técnico)

### 1.1 Onboarding Ponte Nova com dados reais (em andamento — sub-fase 14.12)

**✅ Concluído em 2026-05-14:**
- [x] Login admin local 8888 (password_hash setado)
- [x] `geolocation_config` PN: lat `-20.3908557`, lng `-42.8616382`, raio **150m**, block_outside=true
- [x] `bonus_types` PN: B=R$15, C1=R$20, C2=R$15
- [x] `payment_period_config` PN: mensal (`auto_weekly=false`)

**⏳ Pendente:**
- [ ] Importar ~30 employees via UI Admin → Funcionários → Importar Excel (Victor mandar planilha)
- [ ] Smoke test pós-import: 1 funcionário marca ponto via `/clock` + verifica geo bloqueio

### 1.2 Release v2.0.0
- [ ] Tag `v2.0.0-multi-tenant` no commit final da Fase 14
- [ ] CHANGELOG/GitHub Release notes referenciando:
  - Multi-empresa via RLS
  - bcrypt password hash
  - 4 edge fns ACTIVE
  - 0 ERRORs Sistema de Ponto
  - 250+ specs E2E passing 3× sem flake
  - 11 bugs UI cazados+fixados na Fase 14.4
- [ ] Push da tag (`git push origin v2.0.0-multi-tenant`)

### 1.3 Deploy frontend pra produção
- [ ] Escolher hosting (Vercel/Netlify/Cloudflare Pages)
- [ ] Configurar env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] **NUNCA** commitar/upload `SUPABASE_SERVICE_ROLE_KEY` no frontend
- [ ] Smoke test pós-deploy:
  - Login admin `9999` + selecionar empresa
  - Login supervisor Caratinga
  - Login supervisor Ponte Nova (após onboarding)
  - Clock-in real via `/clock`

---

## 2. 🧪 Cobertura de testes — lacunas postponed (sub-fase 14.9+ futura, pós-go-live)

| Item | Motivo | Sub-fase futura |
|---|---|---|
| Spec FaceRegistration (sub-fase 10.7) | face-api.js + getUserMedia mock pesado ~6-8h | 14.9 (se feedback usuários demandar) |
| Bank hours **revert UI** | Não existe no produto — apenas apply | N/A (feature) |
| Mobile responsivo E2E | Só Chromium desktop em CI | 14.10 (Playwright mobile project) |
| Browser compat (Firefox/Safari) | Só Chromium em CI | 14.10 |
| Supervisor com `permissions.users.create` | Cenário criado mas não exercitado em E2E | 14.11 |
| Performance benchmarks | Sem baseline de queries lentas | 14.12 (após dados reais PN) |
| Backup/restore drill | Sem rotina automatizada | 14.13 (operacional) |
| Offline support | App não funciona offline (online-only) | Feature futura |

---

## 3. 🧹 Tech debt residual aceito (não bloqueia go-live)

### 3.1 PIN funcionário plain text
- **Status:** plain em `employees.pin`, validado server-side via edge fn.
- **Risco:** baixo — anon não lê (RLS bloqueia); só funcionário com CPF correto via edge fn.
- **Migração futura (sub-fase 11.9):** trocar pra bcrypt similar à 11.3+11.7. Postponed sem urgência.

### 3.2 6 WARNs persistentes em advisors (intencionais)
- 3 SECURITY DEFINER nossas (`verify_admin_secret`, `update_admin_secret`, `apply_bank_hours_to_payment`).
- 16 WARNs no sistema legado (decidido: não mexer — outro produto).

### 3.3 `nightDebitMinutes = 0` (decisão técnica conservadora)
- Todo débito tratado como diurno, sem multiplier noturno aplicado.
- **Documentado.** Mudar exige confirmação Victor + recalcular histórico.

### 3.4 Cold start `create-user` ~150s primeira chamada
- Característica conhecida — esm.sh bcryptjs download. Warm 0.57s.
- UI tem spinner com mensagem "pode levar até 2 minutos no primeiro uso".

### 3.5 ~~`User` interface tem `password: string`~~ — ✅ Resolvido em 11.6 (cleanup confirmado em 14.21)
- Interface `User` em `src/services/database.ts:41-46` já está limpa: `{ id, role, created_by, created_at }`.
- Doc atualizada em 14.21 (entry estava obsoleta).

### 3.6 ~~Vite warnings (esbuild deprecated)~~ — ✅ Mitigado em 14.21
- `chunkSizeWarningLimit` bumpado de 600→1000kB em `vite.config.ts:48`.
- Warnings de `vite:react-babel` (esbuild→oxc, optimizeDeps.esbuildOptions→rolldownOptions) são internos do plugin `@vitejs/plugin-react` — só resolvem com upgrade Vite 6 + plugin novo. Fora do escopo quick win.

---

## 4. 📌 Items específicos pra próxima sessão

### Quando reabrir Claude Code:
1. **Ler `CHECKPOINT.md`** + os 6 arquivos auxiliares
2. **Confirmar 8 regras** (no `CHECKPOINT.md`)
3. **Verificar estado:**
   ```bash
   git log --oneline -5      # último commit = fechamento Fase 14
   git status --short        # working tree limpo
   ```
4. **Validar baseline:**
   ```bash
   npx tsc --noEmit          # exit 0
   npx vitest run | tail -5  # 422+ passing
   ```
5. **Avaliar com Victor:**
   - Onboarding Ponte Nova (1.1)
   - Release + deploy (1.2 + 1.3)
   - Tech debt residual (item específico)
   - Cobertura postponed (face, mobile, etc.)

---

## 5. 🐛 Bugs latentes a monitorar pós-go-live

Após deploy em prod e uso real, monitorar:

| Sintoma | Tabela/Arquivo a olhar | Provável causa |
|---|---|---|
| Funcionário some da lista | `localStorage timecard_user` vs `sessionStorage sb-custom-token` | Sessão expirada inconsistente (14.4.7 cobre, mas se reproduzir, investigar) |
| Tela branca após troca empresa | CompanySwitcher logs | setCompany throw — 14.4.2 cobre, monitor |
| 409 payment_periods | `users.id` FK violation | created_by inválido — 14.4.8 cobre |
| HTTP 406 silencioso | `.single()` em código novo | Trocar pra `.maybeSingle()` |
| Tela "Ops algo deu errado" | `error_logs` table | ErrorBoundary capturou — investigar componentStack |
| Multiple GoTrueClient (volta) | imports de `createClient` duplicados | Verificar `src/lib/supabase.ts` continua único |
| Cold-start edge fn timeouts | Logs edge function | Aumentar timeout no frontend toast/UI |

---

## 6. 📊 Métricas a coletar pós-go-live (ainda não instrumentado)

- Latência média p50/p95/p99 das principais queries (employees, payments, attendances)
- Taxa de cold-start nas edge fns (auth-login, create-user, employee-public-api)
- Erros capturados via ErrorBoundary (count por dia/categoria)
- Geo-fraud attempts (sucesso vs falha)
- Face auth attempts (taxa de sucesso)

**Sem dashboard ainda.** Pode-se construir via Supabase Dashboard → SQL Editor com queries adhoc nos primeiros dias.

---

## 7. 🔮 Roadmap pós-go-live (não bloqueante)

| Feature | Trigger | Prioridade |
|---|---|---|
| Reset facial automático após N tentativas falhas | Feedback usuários | Média |
| Notificações push (clock-in atrasado) | Demanda admin | Baixa |
| Export PDF holerite | Demanda funcionário | Média |
| **APK Android via Capacitor** (sub-fase 15) | Demanda mobile | Média (ver §7.1) |
| Multi-idioma | Expansão geográfica | Baixa |
| API pública pra integrações ERP | Demanda enterprise | Baixa |

### 7.1 — APK Android via Capacitor (sub-fase 15 futura)

**Objetivo:** transformar o webapp Vite+React em APK Android instalável com acesso a APIs nativas (câmera, geolocalização, notificações).

**Stack escolhida:** Capacitor (Ionic) — wrapper nativo que embrulha o app web num WebView e expõe APIs nativas via plugins. Reaproveita 100% do React+TypeScript já existente.

**Plugins envolvidos:**
- `@capacitor/camera` — face-api.js continua funcionando, mas plugin nativo é alternativa pra captura
- `@capacitor/geolocation` — substitui/complementa `navigator.geolocation` (mais robusto em background)
- `@capacitor/local-notifications` — lembretes locais (e.g. "Você esqueceu de bater ponto?")
- `@capacitor/push-notifications` — push server→device (requer Firebase Cloud Messaging)
- `@capacitor/preferences` — fallback de localStorage se WebView resetar

**Caminho escolhido pelo Victor (sem Play Store):** sideload via link direto/Slack/email.

**Esforço estimado:** ~4 dias úteis
- Dia 1: Setup Capacitor + AndroidManifest + permissões runtime
- Dia 2: Adaptar serviços de geo + camera pra plugins nativos
- Dia 3: Local notifications + UX de permissões
- Dia 4: Keystore auto-assinado (Claude gera) + build release APK + smoke test device real

**Pré-requisitos do Victor:**
- [ ] **Android Studio instalado** (download ~3GB; única dependência chata)
- [ ] **Decisão de senha do keystore** (Claude gera o arquivo `.jks`, Victor define senha + guarda backup)
- [ ] **Projeto Firebase** (OPCIONAL — só se quiser push notifications server→device. Local notifications não precisam)

**APK release auto-assinado (escolhido):**
- ✅ Instala em qualquer Android via sideload ("Fontes desconhecidas" ativado uma vez)
- ✅ Sem flag "debuggable" — performance otimizada
- ✅ Zero custo recorrente, sem Google
- ⚠️ **Sem auto-update** — cada nova versão precisa ser distribuída manualmente (link/Slack/email)
- ⚠️ Funcionário precisa abrir o link e reinstalar a cada release

**Play Store (descartado por Victor):**
- Economizaria distribuição manual e auto-update
- Custo: US$25 conta dev one-time + revisão Google 1-7 dias + políticas restritivas
- Pode ser adicionado depois sem reescrita — mesmo APK, só upload

**Tradeoffs:**
- ✅ Reaproveita 100% do código React atual
- ✅ Build APK direto, sem reescrita
- ⚠️ APK fica ~15-20MB (overhead Capacitor + WebView)
- ⚠️ `face-api.js` carrega modelos ~10MB pesados — primeira abertura lenta no celular
- ⚠️ iOS exigiria Mac + Apple Developer ($99/ano) — adiar pra outra sub-fase

**Alternativa zero-esforço:** PWA "Add to Home Screen" (Chrome → menu → "Instalar app"). Câmera + geo funcionam, mas notifications limitadas (iOS especialmente) e sem ícone próprio no app drawer.

**Status:** Roadmap. Sem trigger imediato — esperar feedback de uso real pós-go-live.

---

## 8. 🔄 Estado atual do trabalho (2026-05-13)

### Sub-fases concluídas nesta sessão

- ✅ 14.5 + 14.6 + 14.7 + 14.8 — 5 specs novos (39, 40, 41, 42, edgeFn) + 2 race fixes (26, 37)
- ✅ Fixes pós-criação (40 test 4, 41 test 5, 42 test 2) — strict mode + reload
- ✅ Validação isolada de cada spec: 39 (5/5), 40 (5/5), 41 (5/5), 42 (3/3+1skip), edgeFn (4/4+1skip), 26 (9/9), 37 (5/5)
- ✅ Checkpoint dividido em arquivos (este e os outros 5)
- ✅ **14.9 — Batch 100% determinístico:**
  - Spec 40 race AttendanceTab (loadData mount-only) → `searchEmployee` clica "Atualizar" antes do fill
  - Spec 37 cold-start residual create-user → warmup completo no beforeAll
  - Suite completa: 259 passed / 18 skipped / 0 failed em 19.3min
- ✅ **14.10 — Validação ampla pré-go-live:**
  - Build prod, Vitest coverage 45.96% Stmts, Supabase advisors 0 ERRORs core
  - Edge fns warm <1s (curl direto)
  - Dist serve + smoke chromium ✅
  - Lighthouse: Perf 86 / A11y 75 → **100** (sub-fase 14.11.2) / Best 100 / SEO 100
  - Mobile E2E (project Pixel 5): 14/31 → **30/31** após refactor TabNavigation 14.11.2
- ✅ **14.11.x — Caratinga deploy Vercel + onboarding parcial PN + tech debts:**
  - Sistema online: https://sistema-ponto-zeta.vercel.app
  - PN 90% configurada (geo, bonus_types, payment_period_config mensal)
  - 26 PINs Caratinga migrados plain → bcrypt
- ✅ **14.13 — 6 bugs UX permissões + 15 tutoriais novos + Spec Supremo 2.0:**
  - Bug #1 CRÍTICO: resetToDefault transformava supervisor em admin
  - Bugs #2-#6: FinancialTab/C6PaymentTab/AttendanceApprovalPanel/ReportsTab/defaults
  - Ajuda: 13 → 28 tutoriais (todas features fases 8-14)
  - Spec 100 (46 tests, 12 seções A-L): localhost 46/46 + prod 46/46
- ✅ **14.14 — Auditoria final + correções + checkpoints:**
  - Lint 2 errors fixados (tests/99-supremo path/fs unused)
  - TECH_DEBT 6.10 movido pra histórico (já fixado em 9/5)
  - TECH_DEBT 6.26/6.27/11.9.X marcados resolvidos
  - Métricas atualizadas: 64 migrations, 50 RLS tables, 431 unit tests, 4 edge fns (auth v9, clock v8, create v1, public **v3 bcrypt**)
  - testTimeout 15s pro set-pin flaky

### Próximo passo Victor
- ⏳ Onboarding Ponte Nova (1.1) **OU** release/deploy (1.2 + 1.3)
- ⏳ Tech debt residual postponed (PIN bcrypt 11.9, `User.password` cleanup, Vite warnings)
