/**
 * Sub-fase 17.4.1: Service Worker pra Firebase Cloud Messaging (FCM).
 *
 * Recebe push notifications quando o app está em background/closed.
 * Quando app está em foreground, o handler vai pro código React (FCM SDK).
 *
 * IMPORTANTE: este arquivo precisa estar em `/public/` pra ficar acessível
 * via `/firebase-messaging-sw.js` (root). FCM espera esse path exato.
 *
 * Quando Victor configurar Firebase real:
 *   1. Substituir o objeto `firebaseConfig` abaixo pelas keys reais do projeto
 *   2. Importar Firebase SDK via CDN (já configurado abaixo)
 *   3. Inicializar messaging e setar onBackgroundMessage handler
 *
 * STATUS ATUAL: stub funcional — registra mas não recebe push (sem key real).
 */

// Versão Firebase compat (CDN sem build step)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// TODO Victor (sub-fase 17.4.1): substituir por config real do Firebase Console
// Settings → Project Settings → General → Your apps → SDK setup and configuration
const firebaseConfig = {
  apiKey: 'PLACEHOLDER_FIREBASE_API_KEY',
  authDomain: 'placeholder.firebaseapp.com',
  projectId: 'placeholder',
  storageBucket: 'placeholder.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:placeholder',
};

// Só inicializa Firebase se config foi populada (evita erro com placeholders)
if (firebaseConfig.apiKey !== 'PLACEHOLDER_FIREBASE_API_KEY') {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Handler de mensagens em background
  messaging.onBackgroundMessage((payload) => {
    console.log('[FCM SW] Background message:', payload);

    const title = payload.notification?.title || 'Sistema de Ponto';
    const body = payload.notification?.body || '';
    const options = {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: payload.data || {},
      tag: payload.data?.tag || 'default',
      requireInteraction: false,
    };

    self.registration.showNotification(title, options);
  });
} else {
  console.warn('[FCM SW] Firebase config not set — push notifications disabled');
}

// Click em notificação abre/foca a janela do app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
