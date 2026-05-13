# CHECKPOINT_PROXIMOS_PASSOS.md — Pendências + Ações Victor + Gaps

> O que falta pra go-live e além. Última atualização: **2026-05-13**.

---

## 1. 🚀 GO-LIVE — Ações manuais do Victor (sistema 100% pronto técnico)

### 1.1 Onboarding Ponte Nova com dados reais
- [ ] Importar ~30 employees via UI Admin → Funcionários → Importar Excel
- [ ] Configurar `payment_period_config` (auto_weekly?, semana de pagamento)
- [ ] Configurar `geolocation_config` (lat/lng + radius do escritório de PN)
- [ ] Configurar `bonus_types` (B, C1, C2 ou customizados)
- [ ] Validar login do admin local de Ponte Nova (id `8888`)
- [ ] Smoke test: 1 funcionário marca ponto via `/clock`

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

### 3.5 `User` interface (`database.ts:14-20`) ainda tem `password: string`
- TS aceita (campo opcional faltante = undefined).
- **Limpeza cosmética** — não funcional. Sub-fase 14.X cleanup.

### 3.6 Vite warnings (esbuild deprecated, optimizeDeps.esbuildOptions)
- Vite 5 → 6 migration trigger.
- Sem impacto funcional. Sub-fase 14.X cleanup.

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
| App mobile React Native | Decisão de produto | Baixa (web mobile-first cobre) |
| Multi-idioma | Expansão geográfica | Baixa |
| API pública pra integrações ERP | Demanda enterprise | Baixa |

---

## 8. 🔄 Estado atual do trabalho (2026-05-13)

### Sub-fases concluídas nesta sessão pré-almoço Victor

- ✅ 14.5 + 14.6 + 14.7 + 14.8 — 5 specs novos (39, 40, 41, 42, edgeFn) + 2 race fixes (26, 37)
- ✅ Fixes pós-criação (40 test 4, 41 test 5, 42 test 2) — strict mode + reload
- ✅ Validação isolada de cada spec: 39 (5/5), 40 (5/5), 41 (5/5), 42 (3/3+1skip), edgeFn (4/4+1skip), 26 (9/9), 37 (5/5)
- ✅ Checkpoint dividido em arquivos (este e os outros 5)

### Em andamento background
- 🔄 Playwright suite completa (workers=1) — confirmar batch passa também

### Pendente próxima sessão (após Victor reiniciar PC)
- ⏳ Confirmar suite completa passou no batch (workers=1)
- ⏳ Commit final consolidado (sub-fase 14.5/6/7/8 + race fixes)
- ⏳ Próximo passo Victor: onboarding Ponte Nova OU release/deploy
