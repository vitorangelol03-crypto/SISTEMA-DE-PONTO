import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sub-fase 17.4.3 — Smoke Firebase SW + cliente push
 *
 * Valida que infra Firebase Push (sub-fase 17.4.1) está intacta:
 *   1. public/firebase-messaging-sw.js existe + tem imports Firebase
 *   2. SW tem handler onBackgroundMessage (skipa se config placeholder)
 *   3. SW tem handler notificationclick
 *   4. src/lib/pushNotifications.ts exporta funções públicas
 *   5. Edge fn send-push existe no supabase/functions/
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe('Firebase Push infra (sub-fase 17.4.3)', () => {
  it('1. public/firebase-messaging-sw.js existe + importa Firebase compat', () => {
    expect(exists('public/firebase-messaging-sw.js')).toBe(true);
    const sw = read('public/firebase-messaging-sw.js');
    expect(sw).toContain('firebase-app-compat.js');
    expect(sw).toContain('firebase-messaging-compat.js');
  });

  it('2. SW tem firebaseConfig (placeholder ok pra dev)', () => {
    const sw = read('public/firebase-messaging-sw.js');
    expect(sw).toContain('firebaseConfig');
    expect(sw).toMatch(/apiKey:\s*['"]/);
    expect(sw).toMatch(/messagingSenderId/);
  });

  it('3. SW tem handler onBackgroundMessage (lazy se config real)', () => {
    const sw = read('public/firebase-messaging-sw.js');
    expect(sw).toContain('onBackgroundMessage');
    expect(sw).toContain('showNotification');
  });

  it('4. SW tem handler notificationclick (foco janela existente)', () => {
    const sw = read('public/firebase-messaging-sw.js');
    expect(sw).toContain("'notificationclick'");
    expect(sw).toContain('matchAll');
  });

  it('5. src/lib/pushNotifications.ts exporta initPushNotifications + disablePushNotifications', () => {
    expect(exists('src/lib/pushNotifications.ts')).toBe(true);
    const lib = read('src/lib/pushNotifications.ts');
    expect(lib).toContain('export async function initPushNotifications');
    expect(lib).toContain('export async function disablePushNotifications');
    expect(lib).toContain('VITE_FCM_VAPID_KEY');
  });
});
