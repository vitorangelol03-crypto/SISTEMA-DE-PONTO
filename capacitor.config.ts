import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Sub-fase 17.1.1: Capacitor config — wrapper Android nativo.
 *
 * Setup MVP — não inclui build APK (precisa Android Studio instalado).
 * Quando Victor instalar Studio:
 *   npx cap sync android       # sincroniza web → android/
 *   npx cap open android       # abre Android Studio
 *   Build > Generate Signed Bundle/APK > APK release
 *
 * App ID convencional: br.com.sistemaponto.app (reverse-DNS Brasileiro).
 * webDir aponta pra dist/ (Vite build output).
 *
 * Servidor dev (testes locais com Android device físico):
 *   server.url = "http://<seu-IP>:5173" — descomentar pra dev
 */
const config: CapacitorConfig = {
  appId: 'br.com.sistemaponto.app',
  appName: 'Sistema de Ponto',
  webDir: 'dist',
  bundledWebRuntime: false,

  // Plugins — defaults razoáveis
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#1e40af', // blue-700 — cor primária do app
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1e40af',
      showSpinner: false,
    },
  },

  // Android — alvo SDK 33 (Android 13)
  android: {
    minWebViewVersion: 60,
    buildOptions: {
      keystorePath: undefined, // Victor configura ao gerar keystore
      keystoreAlias: undefined,
    },
  },
};

export default config;
