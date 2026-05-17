# 📘 TUTORIAL — O que VOCÊ (Victor) precisa fazer

> **Sub-fase 14.43 (2026-05-16):** lista exaustiva e step-by-step de tudo
> que requer ação SUA (não posso fazer pelo sandbox/regras/credenciais).
>
> Ordenado por **urgência**: itens 1-3 destravam release oficial; itens 4+
> são features futuras sem urgência.

---

## 🚀 1. Publicar GitHub Release (30 segundos)

**Estado atual:**
- ✅ 21 commits no `origin/main` (pushados em 2026-05-16)
- ✅ Tag `v2.0.0-multi-tenant.1` no remote
- ⚠️ GitHub Release ainda não publicada

**O que fazer** — uma das opções:

### Opção A: via `gh` CLI no Claude Code

No prompt do Claude Code, digite (com prefixo `!`):

```
! gh release create v2.0.0-multi-tenant.1 --notes-file RELEASE_NOTES_v2.0.0.md --title "v2.0.0-multi-tenant.1 — Sessão estendida 2026-05-16"
```

O `!` faz rodar no seu terminal autenticado, fora do meu sandbox.

### Opção B: via browser

1. Abrir: https://github.com/vitorangelol03-crypto/SISTEMA-DE-PONTO/releases/new?tag=v2.0.0-multi-tenant.1
2. Title: `v2.0.0-multi-tenant.1 — Sessão estendida 2026-05-16`
3. Description: copiar e colar conteúdo de `RELEASE_NOTES_v2.0.0.md`
4. Clicar "Publish release"

---

## 📊 2. Importar planilha real Ponte Nova (~30 min)

**Estado atual:** PN tem 30 funcionários **Demo PN** (fake). Falta importar os
30 funcionários REAIS.

**O que fazer:**

1. **Preparar planilha Excel** baseada no template:
   - Template já gerado em `template-funcionarios-ponte-nova.xlsx`
   - Colunas obrigatórias: `Nome`, `CPF`, `PIX`, `Tipo Contrato` (CLT/Diarista/PJ)
   - 30 linhas (uma por funcionário PN real)

2. **Login admin master no app prod:**
   - https://sistema-ponto-zeta.vercel.app
   - ID: `9999` / Senha: `684171`
   - Selecionar empresa: **Ponte Nova**

3. **Importar:**
   - Tab Funcionários → botão "Importar Excel"
   - Selecionar planilha real
   - Aguardar validação (preview mostra erros se houver)
   - Confirmar import

4. **Smoke test:**
   - 1 funcionário PN faz CPF login em `/clock`
   - Configura PIN (primeira vez)
   - Marca ponto → confirma geo bloqueio ativo

---

## 🌐 3. ~~Instalar Webkit~~ ✅ FEITO em 2026-05-17

- libavif16 instalado por Victor ✅
- `npx playwright install webkit` ✅
- Subset essencial Webkit → **15/15 em 1.3min** ✅

Webkit pronto pra CI futuro (`--project=webkit`).

---

## 📱 4. Android Studio + APK (opcional — sub-fase 17.1)

**Estado atual:** roadmap futuro, sem implementação iniciada.

**Pré-requisitos:**

1. **Instalar Android Studio:** https://developer.android.com/studio (~3GB download)
2. **Aceitar licenças SDK:** primeira execução do Studio guia
3. **Decisão sua:** senha do keystore (pra assinar APK release). Anote em local seguro — sem ela, não consegue publicar updates compatíveis.

**Quando estiver pronto**, me avisa que eu:
- Adiciono Capacitor ao projeto
- Configuro `capacitor.config.ts`
- Gera `android/` directory + AndroidManifest
- Build APK assinado release

Estimativa: ~4 dias de trabalho (sub-fase 17.1 completa).

---

## 🔔 5. Firebase pra Push Notifications (opcional — sub-fase 17.4)

**O que fazer:**

1. **Criar projeto Firebase:** https://console.firebase.google.com/
2. **Habilitar Cloud Messaging (FCM):** Project Settings → Cloud Messaging
3. **Gerar Service Account Key:** Settings → Service accounts → Generate new private key (JSON)
4. **Me mandar o JSON** (ou colocar em `.env`):
   - `FCM_PROJECT_ID=...`
   - `FCM_PRIVATE_KEY_BASE64=...`

Depois implemento:
- Edge fn `send-push` que recebe `employee_id` + `message` e dispara via FCM
- UI admin pra disparar notificações em massa
- Service worker no app pra receber push

Estimativa: ~1-2 dias (sub-fase 17.4).

---

## 📋 6. Decisões de produto pendentes

### 6.1 PDF Holerite — layout corporativo

**Estado atual:** MVP funciona — A4 portrait com tabela + assinaturas (commit `b688e7f`).
Botão "Holerite PDF" disponível em FinancialTab > cada row.

**Pra customizar pra sua marca**, preciso saber:
- Logo da empresa (arquivo PNG/JPG)
- Cor principal (hex)
- Fonte preferida (default: Helvetica)
- Campos adicionais (data de contratação? matrícula? cargo?)
- Rodapé (CNPJ + endereço da empresa?)

Me manda essas decisões + arquivos e eu refatoro o `holeritePdf.ts`.

### 6.2 Multi-idioma — quais idiomas?

**Estado atual:** scaffold pt-BR + en (commit `413dcb7`), com 23 chaves base.

**Pra ativar de verdade:**
- Confirma se precisa de inglês mesmo (algum cliente fora do BR?)
- Outros idiomas? (espanhol pra LATAM?)
- Prioridade de strings (tudo? ou só Login/Header?)

Sem essas decisões, scaffold fica como tá.

### 6.3 API pública — qual integração?

**Estado atual:** MVP `GET /employees` funciona (commit `6d09e81`), tabela
`api_keys` criada, doc em `docs/API_PUBLICA_V1.md`.

**Pra expandir:**
- Qual ERP/sistema vai consumir? (Bling? Omie? SAP? sistema próprio?)
- Quais endpoints adicionais? `GET /attendance`? `POST /clock-in`?
- Auth API key suficiente ou precisa OAuth?
- Rate limit por key? (default atual: sem limit, só limit global Supabase)

Sem decisão concreta, MVP fica como está.

### 6.4 Reset facial automático — threshold

**Estado atual:** trigger DB ativo (commit `f7ab015`), defaults 5 falhas em 60min.

**Pra ajustar por empresa:**

```sql
-- Mais permissivo (10 falhas em 2h)
UPDATE public.face_recognition_config
   SET max_attempts_before_reset = 10, attempts_window_minutes = 120
 WHERE company_id = '6583bb2a-e334-41a7-b69c-7d98f3b46dfc';

-- Mais restritivo (3 falhas em 30min)
UPDATE public.face_recognition_config
   SET max_attempts_before_reset = 3, attempts_window_minutes = 30
 WHERE company_id = '<UUID_PN>';

-- Desligar auto-reset
UPDATE public.face_recognition_config
   SET max_attempts_before_reset = 0
 WHERE company_id = '<UUID>';
```

---

## 🤖 7. Auto-classifier bloqueando ações (opcional setup)

**Por quê:** o classifier do Claude Code bloqueia automaticamente algumas
ações sensíveis (push, sudo, etc.) mesmo se você me autorizar verbalmente.

**Pra liberar permanentemente** (cuidado!), edite `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(git push:*)",
      "Bash(gh release:*)"
    ]
  }
}
```

Ou só por sessão: aceitar o prompt de permissão quando aparecer.

**Recomendação:** mantém bloqueado. Mais seguro você executar 1 comando
manual do que eu pushar sem revisão.

---

## 📌 Resumo "TODO Victor"

| Prioridade | Item | Tempo | Status |
|---|---|---|---|
| 🔴 Alta | Publicar GitHub Release (item 1) | 30s | Bloqueado classifier |
| 🟡 Média | Importar planilha real PN (item 2) | 30min | Esperando você mandar |
| ✅ DONE | Webkit Linux deps (item 3) | 2min sudo | Resolvido 2026-05-17 |
| 🟢 Baixa | Android Studio (item 4) | 1-2h setup | Opcional, sub-fase 17.1 |
| 🟢 Baixa | Firebase (item 5) | 30min | Opcional, sub-fase 17.4 |
| 🟢 Baixa | Decisões produto (item 6) | depende | Quando você quiser expandir features |

**Tudo o que eu PODIA fazer está feito.** Bola está com você. 🏆
