# 📱 Build APK Android — Sistema de Ponto

> **Sub-fase 17.1.1 (2026-05-17):** estrutura Capacitor configurada.
> Falta APENAS você instalar Android Studio + rodar build.

---

## ✅ O que já está pronto (eu fiz)

- ✅ `npm install @capacitor/core @capacitor/cli @capacitor/android` + 4 plugins:
  - `@capacitor/geolocation` (clock-in geo)
  - `@capacitor/camera` (face recognition)
  - `@capacitor/local-notifications` (lembretes)
  - `@capacitor/preferences` (storage nativo)
- ✅ `capacitor.config.ts` na raiz (appId: `br.com.sistemaponto.app`)
- ✅ `android/` directory inicializada via `npx cap add android`
- ✅ AndroidManifest.xml com permissions: GEO, CAMERA, NOTIFICATIONS, INTERNET
- ✅ Sync ✅ — `npx cap sync android` rodou no add

---

## 🛠️ O que você precisa fazer

### 1. Instalar Android Studio

Download: https://developer.android.com/studio (~3GB)

Após instalar, primeira execução:
- Aceitar licenças do SDK Android
- Instalar Android SDK 33 (Android 13) — minimum target do Capacitor 8
- Configurar AVD pra emulador OU plugar device físico

### 2. Abrir projeto Android

```bash
cd /home/victor/SISTEMA-DE-PONTO
npx cap open android
```

Isso abre o Studio com `android/` carregado. Aguarde Gradle sync (1-3min).

### 3. Gerar keystore (UMA VEZ — pra release signing)

No Android Studio: `Build > Generate Signed Bundle/APK > APK > Create new...`

Configurar:
- **Keystore path:** `/home/victor/SISTEMA-DE-PONTO/android/keystore/release.jks`
- **Password:** sua senha forte — **ANOTE em local seguro**, sem ela você não consegue gerar updates do app!
- **Alias:** `sistemaponto`
- **Validity:** 25 anos (default)
- **First/Last name:** seu nome

⚠️ **CRÍTICO:** o `.jks` + senha juntos = identidade do app. Perder = ter que publicar app NOVO (usuários precisam desinstalar e reinstalar).

### 4. Build APK release

No Studio: `Build > Generate Signed Bundle/APK > APK > Next > Release > Finish`

APK final em: `android/app/build/outputs/apk/release/app-release.apk` (~15-20MB)

### 5. Distribuir

**Sideload (sem Play Store, sem custo):**
1. Envia o `.apk` por link/Slack/email pros funcionários
2. No Android: Settings > Apps > Special access > Install unknown apps → permitir o browser/Gmail
3. Tocar no .apk → instalar
4. ⚠️ Cada update, repete o processo (sem auto-update)

**Play Store (US$25 conta dev one-time, recomendado quando >5 instalações):**
1. Criar conta: https://play.google.com/console
2. Upload APK + screenshots + descrição
3. Revisão Google: 1-7 dias
4. Após aprovado: auto-update funciona automaticamente

---

## 🔧 Workflow desenvolvimento

Toda vez que mudar código web:

```bash
npm run build              # Vite build → dist/
npx cap sync android       # Copia dist/ pro android/app/src/main/assets/public/
# Opcional: rebuild no Studio se quiser testar
```

---

## 🐛 Debug device físico

1. Plugar USB
2. Habilitar Developer Mode no Android (tap 7× em Build Number nos Settings)
3. Habilitar USB Debugging
4. No Studio: Run → escolher device → Run

Chrome remote inspect: `chrome://inspect/#devices` mostra WebView do app.

---

## 📋 Plugins instalados

| Plugin | Uso no app | Status |
|---|---|---|
| `@capacitor/geolocation` | Clock-in com geo (substitui `navigator.geolocation`) | ✅ Pronto |
| `@capacitor/camera` | Face recognition (substitui `getUserMedia`) | ✅ Pronto |
| `@capacitor/local-notifications` | Lembretes ("você esqueceu de bater ponto?") | ✅ Pronto |
| `@capacitor/preferences` | Storage nativo (substitui localStorage se WebView resetar) | ✅ Pronto |
| `@capacitor/push-notifications` | Push server→device | Não instalado (requer Firebase — sub-fase 17.4.1) |

**Refator código web pra usar plugins nativos:** follow-up. Atualmente, `navigator.geolocation` e `getUserMedia` funcionam dentro do WebView do Capacitor (Cordova/Capacitor bridge), então NÃO é bloqueante pra MVP APK. Trocar pelos plugins nativos é otimização futura.

---

## ⚠️ Gotchas conhecidos

- **face-api.js modelos:** carregam ~10MB do `/public` — primeira abertura do APK demora 5-10s
- **WebView reseta localStorage** em alguns Android: refatorar pra `@capacitor/preferences` se virar bug
- **iOS:** não suportado nessa sub-fase (precisa Mac + Apple Developer $99/ano). Pode adicionar depois com `npx cap add ios`
- **Tamanho final APK:** ~15-20MB (overhead Capacitor + WebView). Aceitável

---

## 🔗 Referências

- Capacitor docs: https://capacitorjs.com/docs
- Android Studio: https://developer.android.com/studio
- Play Console: https://play.google.com/console
