'use strict';
/**
 * Sauvegarde des préférences dans %APPDATA%/On time/settings.json
 * Écriture atomique (fichier temporaire puis renommage) pour ne jamais
 * corrompre la configuration en cas de coupure.
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  version: 1,
  location: {
    mode: 'auto', // 'auto' (géolocalisation) | 'manual'
    city: 'Paris',
    country: 'France',
    countryCode: 'FR',
    lat: 48.8566,
    lon: 2.3522,
    tz: 'Europe/Paris',
  },
  calc: {
    method: 'auto', // 'auto' = selon le pays → Musulmans de France 12° pour la France
    madhab: 'shafi', // 'shafi' = Standard (Chafi'i / Maliki / Hanbali) | 'hanafi'
    highLatitude: 'auto', // 'auto' | 'middle' | 'seventh' | 'twilight'
    custom: { fajr: 12, isha: 12, ishaInterval: 0 },
    adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  },
  notifications: {
    enabled: true,
    prayers: { fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true },
    reminder: 0, // minutes avant (0 = désactivé)
  },
  sound: { enabled: true, volume: 0.6, tone: 'carillon' }, // tone : carillon | cristal | harpe | bol | goutte | aube
  display: {
    timeFormat: '24', // '24' | '12'
    theme: 'dark', // 'dark' | 'light'
    accent: '#8B5CF6',
    showSeconds: true,
    alwaysOnTop: false,
    windowMode: 'window', // 'window' (fenêtré) | 'fullscreen' (plein écran)
  },
  system: { launchAtStartup: false, startHidden: false, closeToTray: true },
  window: { x: null, y: null },
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!isObj(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = merge(DEFAULTS, this.#read());
  }

  #read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  get() {
    return this.data;
  }

  /** Fusionne un patch partiel et sauvegarde immédiatement. */
  set(patch) {
    this.data = merge(this.data, patch);
    this.save();
    return this.data;
  }

  reset() {
    this.data = merge(DEFAULTS, {});
    this.save();
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] save failed', err);
    }
  }
}

module.exports = { Store, DEFAULTS, merge };
