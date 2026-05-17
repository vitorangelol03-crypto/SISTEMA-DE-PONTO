# 🔔 Firebase Push Notifications — Sistema de Ponto

> **Sub-fase 17.4.1 (2026-05-17):** infraestrutura local 100% pronta.
> Falta APENAS você criar projeto Firebase + plugar credenciais.

---

## ✅ O que já está pronto (eu fiz)

**Banco de dados (Supabase migrations):**
- ✅ Tabela `push_subscriptions` (id, user_id, user_type, company_id, fcm_token, device_id, platform, enabled, last_used_at)
- ✅ Tabela `push_send_log` (audit de envios: title, body, target_type, recipients_count, success_count, fail_count, fcm_response JSONB)
- ✅ RLS multi-empresa em ambas

**Edge Function:**
- ✅ `send-push` deployed (status ACTIVE)
- ✅ Auth: JWT custom HS256 + role check (admin/supervisor only)
- ✅ Body: `{ title, body, target_type: 'all'|'user'|'employee'|'role', target_id? }`
- ✅ Resolve targets via push_subscriptions, monta lista de tokens
- ✅ Log automático em push_send_log
- ✅ **MOCK FCM** quando `FCM_PROJECT_ID` não configurado (response `{mocked: true}`)

**Service Worker:**
- ✅ `public/firebase-messaging-sw.js` — recebe push em background, mostra notificação, handler de click
- ✅ Detecta config placeholder vs real (não quebra se não configurado)

**Cliente (foreground):**
- ✅ `src/lib/pushNotifications.ts`
  - `initPushNotifications({ userId, userType, companyId })` — pede permissão, gera FCM token, persiste em DB
  - `disablePushNotifications(userId)` — opt-out
- ✅ Detecção automática de platform (web/android/ios)
- ✅ Device ID persistente em localStorage

---

## 🛠️ O que você precisa fazer (~30min)

### 1. Criar projeto Firebase

1. Acessar: https://console.firebase.google.com/
2. **Add project** → nome: `Sistema de Ponto` (ou outro)
3. Desabilitar Google Analytics (opcional)
4. Aguardar criação (1min)

### 2. Adicionar Web app

1. Em Project Overview → ícone Web `</>`
2. Apelido: `Sistema de Ponto Web`
3. **NÃO** marcar "Firebase Hosting"
4. **Copiar o `firebaseConfig`** que aparece — você vai usar abaixo

### 3. Habilitar Cloud Messaging

1. Sidebar → **Engage** → **Messaging**
2. Aceitar termos (se primeira vez)

### 4. Gerar VAPID key (Web Push certificate)

1. Project Settings → **Cloud Messaging** tab
2. Role pra baixo até **Web configuration** → **Web Push certificates**
3. Botão **Generate key pair**
4. Copiar a chave gerada (~88 caracteres)

### 5. Configurar `.env`

Adicionar ao `.env` da raiz:

```bash
# Sub-fase 17.4.1 — Firebase Web SDK config
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=sistema-de-ponto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sistema-de-ponto
VITE_FIREBASE_STORAGE_BUCKET=sistema-de-ponto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123
VITE_FCM_VAPID_KEY=BHe1mq... (a chave VAPID do passo 4)
```

### 6. Atualizar Service Worker (`public/firebase-messaging-sw.js`)

Substituir o objeto `firebaseConfig` placeholder (linha ~26) pelo mesmo config do .env (mas hardcoded, porque SW não tem acesso a `import.meta.env`):

```javascript
const firebaseConfig = {
  apiKey: 'AIzaSy...',
  authDomain: 'sistema-de-ponto.firebaseapp.com',
  projectId: 'sistema-de-ponto',
  storageBucket: 'sistema-de-ponto.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abc123',
};
```

### 7. Instalar `firebase` package (cliente)

```bash
npm install firebase
```

(Sem isso, `import('firebase/app')` em `pushNotifications.ts` falha em runtime.)

### 8. Gerar Service Account Key (pro server-side FCM send)

1. Firebase Console → Project Settings → **Service accounts** tab
2. Botão **Generate new private key** → confirmar
3. JSON baixa automaticamente
4. Codificar em base64:
   ```bash
   cat service-account.json | base64 -w 0
   ```
5. Adicionar como secret no Supabase:
   - Dashboard → Edge Functions → Secrets
   - `FCM_PROJECT_ID=sistema-de-ponto` (o projectId)
   - `FCM_SERVICE_ACCOUNT_JSON_BASE64=<output do base64 acima>`

### 9. Atualizar edge fn `send-push` (TODO marcado no código)

Quando você plugar as keys, é só descomentar a implementação real de `sendViaFcm()` em `supabase/functions/send-push/index.ts`. Por agora ela retorna `{mocked: true}`.

(Posso fazer essa parte quando você confirmar que tem o projeto Firebase.)

---

## 🧪 Como testar

Após configurar:

1. **No app**, após login admin, chamar:
   ```typescript
   import { initPushNotifications } from '@/lib/pushNotifications';
   await initPushNotifications({ userId: '9999', userType: 'user', companyId: '...' });
   ```
   (Pode ser via console do browser, ou adicionar a um useEffect no AdminTab.)

2. **Browser pede permissão de notificação** — aceitar

3. **Conferir no DB** que `push_subscriptions` tem row novo:
   ```sql
   SELECT * FROM push_subscriptions ORDER BY created_at DESC LIMIT 5;
   ```

4. **Disparar push de teste** via edge fn (com JWT admin):
   ```bash
   curl -X POST https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/send-push \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <JWT_CUSTOM>" \
     -H "apikey: <ANON_KEY>" \
     -d '{"title":"Teste","body":"Funcionou!","target_type":"all"}'
   ```

5. **Notificação aparece** no browser/device (após config completa)

---

## 📋 Roadmap features push

Quando push estiver funcional, possíveis casos de uso:

- **Lembrete de bater ponto** (não bateu até X horário) — local notification, não precisa FCM
- **Aprovação pendente** (supervisor avisa admin de erro) — FCM target=role:admin
- **Banco de horas aplicado** (notifica funcionário) — FCM target=employee
- **Mass message** (admin → todos funcionários) — FCM target=all
- **Reset facial automático** (notifica funcionário) — integração com sub-fase 17.3

---

## 🔗 Referências

- Firebase Web SDK: https://firebase.google.com/docs/web/setup
- FCM HTTP v1 API: https://firebase.google.com/docs/cloud-messaging/migrate-v1
- Service account auth: https://firebase.google.com/docs/cloud-messaging/auth-server
- VAPID keys: https://firebase.google.com/docs/cloud-messaging/js/client#configure_web_credentials_with_fcm
