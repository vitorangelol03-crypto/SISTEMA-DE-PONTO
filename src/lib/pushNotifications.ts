/**
 * Sub-fase 17.4.1: cliente Firebase Cloud Messaging (foreground).
 *
 * Wrapper isolado pra:
 *  - Solicitar permissão do browser
 *  - Pegar FCM token via getToken()
 *  - Upsertar token em push_subscriptions (DB)
 *  - Listener onMessage pra foreground
 *
 * STATUS: stub MVP. Funcional quando Victor configurar Firebase real.
 *
 * Como ativar:
 *   1. Criar projeto Firebase + habilitar Cloud Messaging
 *   2. Pegar config do Console (Settings → Project Settings → Web app)
 *   3. Adicionar VITE_FIREBASE_* vars ao .env (ver firebase-messaging-sw.js)
 *   4. Atualizar firebaseConfig abaixo + sw.js
 *   5. Chamar `initPushNotifications(userId, companyId)` após login admin
 */
import { supabase } from './supabase';

// FCM key VAPID pública — gerar em Firebase Console > Cloud Messaging > Web push certificates
const VAPID_KEY = (import.meta.env.VITE_FCM_VAPID_KEY as string) || '';

// Device ID persistente (gerado uma vez por device)
const DEVICE_ID_KEY = 'sp_device_id';

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function detectPlatform(): 'web' | 'android' | 'ios' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  return 'web';
}

export interface InitPushOptions {
  userId: string;
  userType: 'user' | 'employee';
  companyId: string;
}

/**
 * Inicializa FCM: registra SW, pede permissão, gera token, persiste no DB.
 *
 * Retorna o token gerado OU null se não foi possível (sem permissão, sem
 * config Firebase, browser sem suporte).
 */
export async function initPushNotifications(opts: InitPushOptions): Promise<string | null> {
  // Bail se config não foi setada
  if (!VAPID_KEY) {
    console.warn('[FCM] VITE_FCM_VAPID_KEY not set — push disabled');
    return null;
  }

  // Browser support check
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('[FCM] Browser não suporta notificações');
    return null;
  }

  // Pede permissão
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    console.warn('[FCM] Permissão negada');
    return null;
  }

  try {
    // Dynamic import (Firebase SDK ~50KB — evita engordar bundle se feature desligada)
    const { initializeApp } = await import('firebase/app');
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

    // Mesma config do sw.js (manter em sync)
    const firebaseConfig = {
      apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || '',
      authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || '',
      projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || '',
      storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || '',
      messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || '',
      appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || '',
    };

    if (!firebaseConfig.apiKey) {
      console.warn('[FCM] VITE_FIREBASE_API_KEY not set');
      return null;
    }

    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn('[FCM] Failed to get FCM token');
      return null;
    }

    // Upsert no DB
    const deviceId = getDeviceId();
    const platform = detectPlatform();

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert([{
        user_id: opts.userId,
        user_type: opts.userType,
        company_id: opts.companyId,
        fcm_token: token,
        device_id: deviceId,
        platform,
        user_agent: navigator.userAgent.slice(0, 500),
        enabled: true,
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      }], { onConflict: 'user_id,device_id' });

    if (error) {
      console.error('[FCM] DB upsert failed:', error);
      return null;
    }

    // Foreground listener
    onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message:', payload);
      const { title, body } = payload.notification || {};
      if (title && 'Notification' in window) {
        new Notification(title, { body: body || '', icon: '/icon-192.png' });
      }
    });

    return token;
  } catch (err) {
    console.error('[FCM] Init failed:', err);
    return null;
  }
}

/**
 * Desabilita push pro device atual (UI logout/opt-out).
 */
export async function disablePushNotifications(userId: string): Promise<void> {
  const deviceId = getDeviceId();
  await supabase
    .from('push_subscriptions')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('device_id', deviceId);
}
