import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sub-fase 17.1.2 — Smoke Capacitor config
 *
 * Valida que setup mobile (sub-fase 17.1.1) está intacto:
 *   1. capacitor.config.ts existe e tem appId/webDir
 *   2. android/ directory existe
 *   3. AndroidManifest.xml tem permissions essenciais (CAMERA, GEO, NOTIFICATIONS)
 *   4. MainActivity.java em br/com/sistemaponto/app
 *   5. 4 plugins instalados via @capacitor/* deps
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe('Capacitor Android setup (sub-fase 17.1.2)', () => {
  it('1. capacitor.config.ts tem appId + webDir corretos', () => {
    expect(exists('capacitor.config.ts')).toBe(true);
    const cfg = read('capacitor.config.ts');
    expect(cfg).toContain("appId: 'br.com.sistemaponto.app'");
    expect(cfg).toContain("webDir: 'dist'");
    expect(cfg).toContain('LocalNotifications');
    expect(cfg).toContain('SplashScreen');
  });

  it('2. android/ directory + AndroidManifest existem', () => {
    expect(exists('android')).toBe(true);
    expect(exists('android/app/src/main/AndroidManifest.xml')).toBe(true);
    expect(exists('android/build.gradle')).toBe(true);
    expect(exists('android/settings.gradle')).toBe(true);
  });

  it('3. AndroidManifest tem permissions essenciais', () => {
    const xml = read('android/app/src/main/AndroidManifest.xml');
    expect(xml).toContain('android.permission.INTERNET');
    expect(xml).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(xml).toContain('android.permission.CAMERA');
    expect(xml).toContain('android.permission.POST_NOTIFICATIONS');
  });

  it('4. MainActivity em br/com/sistemaponto/app', () => {
    expect(exists('android/app/src/main/java/br/com/sistemaponto/app/MainActivity.java')).toBe(true);
  });

  it('5. 4 plugins Capacitor instalados como deps', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['@capacitor/core']).toBeTruthy();
    expect(deps['@capacitor/cli']).toBeTruthy();
    expect(deps['@capacitor/android']).toBeTruthy();
    expect(deps['@capacitor/geolocation']).toBeTruthy();
    expect(deps['@capacitor/camera']).toBeTruthy();
    expect(deps['@capacitor/local-notifications']).toBeTruthy();
    expect(deps['@capacitor/preferences']).toBeTruthy();
  });
});
