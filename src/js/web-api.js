/*
 * On time Web — couche navigateur.
 *
 * Fournit la même interface `window.ontime` que le « preload » de la version
 * Windows (Electron), mais implémentée avec les API du navigateur :
 *   - calculs     → même moteur que Windows (core/main/prayer.js, bundlé)
 *   - réglages    → localStorage, mêmes valeurs par défaut (core/main/store.js)
 *   - lieu        → géolocalisation de l'appareil, puis estimation par IP
 *   - alertes     → Notification API / Service Worker, tant que la page est ouverte
 *   - plein écran → Fullscreen API
 */
(() => {
  'use strict';

  const { prayer, store } = window.OnTimeCore;
  const CONFIG = window.ONTIME_CONFIG || {};
  const KEY = 'ontime.settings.v1';
  const NAMES = { fajr: 'Fajr', sunrise: 'Chourouq', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  const FIRE_WINDOW = 3 * 60_000; // tolérance : les onglets en arrière-plan sont ralentis par le navigateur

  /* --- Stockage sûr (navigation privée, stockage bloqué…) ---------------- */
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const parse = (s) => { try { return JSON.parse(s) || {}; } catch { return {}; } };

  /* --- Évènements (équivalent des canaux IPC) ---------------------------- */
  const channels = {};
  const on = (ch) => (cb) => {
    (channels[ch] ||= new Set()).add(cb);
    return () => channels[ch].delete(cb);
  };
  const emit = (ch, data) => (channels[ch] || []).forEach((cb) => {
    try { cb(data); } catch (err) { console.error(err); }
  });

  /* --- Réglages ------------------------------------------------------------ */
  let settings = store.merge(store.DEFAULTS, parse(storage.get(KEY)));
  // Le plein écran ne peut être demandé qu'après un geste de l'utilisateur
  settings = store.merge(settings, { display: { windowMode: 'window' } });
  let schedule = null;

  const persist = () => storage.set(KEY, JSON.stringify(settings));

  function recompute() {
    schedule = prayer.computeSchedule(settings, new Date());
    emit('times', schedule);
    updateTitle();
    return schedule;
  }

  function applySettings(patch) {
    const before = settings;
    settings = store.merge(settings, patch);
    persist();
    if (before.display.windowMode !== settings.display.windowMode) applyWindowMode(settings.display.windowMode);
    emit('settings', settings);
    recompute();
    return settings;
  }

  /* --- Lieu ----------------------------------------------------------------- */
  async function getJSON(url, timeoutMs = 9000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const countryName = (cc) => {
    try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(cc.toUpperCase()); } catch { return cc; }
  };

  function normalize({ lat, lon, city, countryCode }) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error('Coordonnées invalides');
    }
    const cc = (countryCode || '').toUpperCase();
    return {
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      city: city || '',
      countryCode: cc,
      country: cc ? countryName(cc) : '',
      tz: prayer.timezoneFor(lat, lon),
    };
  }

  const placeName = (a = {}) => a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || '';

  async function reverseGeocode(lat, lon) {
    const p = new URLSearchParams({ lat, lon, format: 'jsonv2', zoom: '10', addressdetails: '1', 'accept-language': 'fr' });
    const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?${p}`);
    return { city: placeName(j.address), countryCode: j.address?.country_code || '' };
  }

  function devicePosition(timeout = 12000) {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('Géolocalisation non disponible'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        (e) => reject(new Error(e.message || 'Géolocalisation refusée')),
        { enableHighAccuracy: false, timeout, maximumAge: 30 * 60_000 },
      );
    });
  }

  const IP_PROVIDERS = [
    async () => {
      const j = await getJSON('https://ipwho.is/?lang=fr');
      if (j.success === false) throw new Error(j.message || 'ipwho.is');
      return { lat: j.latitude, lon: j.longitude, city: j.city, countryCode: j.country_code };
    },
    async () => {
      const j = await getJSON('https://ipapi.co/json/');
      if (j.error) throw new Error(j.reason || 'ipapi.co');
      return { lat: j.latitude, lon: j.longitude, city: j.city, countryCode: j.country_code };
    },
    async () => {
      const j = await getJSON('https://get.geojs.io/v1/ip/geo.json');
      return { lat: j.latitude, lon: j.longitude, city: j.city, countryCode: j.country_code };
    },
  ];

  async function ipLocation() {
    let last;
    for (const provider of IP_PROVIDERS) {
      try { return normalize(await provider()); } catch (err) { last = err; }
    }
    throw last || new Error('Localisation indisponible');
  }

  /** Position précise de l'appareil (demande l'autorisation), sinon estimation par IP. */
  async function detectLocation({ precise = true } = {}) {
    if (precise) {
      try {
        const pos = await devicePosition();
        let place = { city: '', countryCode: '' };
        try { place = await reverseGeocode(pos.lat, pos.lon); } catch { /* garde les coordonnées */ }
        return { ...normalize({ ...pos, ...place }), source: 'gps' };
      } catch { /* refus ou indisponible → IP */ }
    }
    return { ...(await ipLocation()), source: 'ip' };
  }

  async function geolocationGranted() {
    try {
      const st = await navigator.permissions?.query({ name: 'geolocation' });
      return st?.state === 'granted';
    } catch { return false; }
  }

  async function searchCity(query, countryCode) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const params = new URLSearchParams({
      q, format: 'jsonv2', addressdetails: '1', limit: '8', 'accept-language': 'fr', featureType: 'settlement',
    });
    if (countryCode) params.set('countrycodes', countryCode.toLowerCase());
    const list = await getJSON(`https://nominatim.openstreetmap.org/search?${params}`);
    const seen = new Set();
    return list
      .map((r) => {
        const a = r.address || {};
        const region = a.state || a.county || a.region || '';
        const cc = (a.country_code || countryCode || '').toUpperCase();
        return { ...normalize({ lat: r.lat, lon: r.lon, city: placeName(a) || r.name, countryCode: cc }), region };
      })
      .filter((r) => {
        const k = `${r.city}|${r.region}|${r.countryCode}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  /* --- Son : un seul AudioContext, débloqué au premier geste --------------- */
  // Les navigateurs bloquent le son tant que la page n'a pas reçu de clic/toucher.
  const NativeAudio = window.AudioContext || window.webkitAudioContext;
  let audio = null;
  const sharedAudio = () => {
    if (!audio || audio.state === 'closed') audio = new NativeAudio();
    return audio;
  };
  if (NativeAudio) {
    // sound.js (partagé avec Windows) fait « new AudioContext() » à chaque son :
    // on lui rend toujours le même contexte, déjà débloqué.
    window.AudioContext = function AudioContextShared() { return sharedAudio(); };
    const unlock = () => {
      const ac = sharedAudio();
      ac.resume?.();
      try { // iOS : jouer un échantillon silencieux finit de débloquer l'audio
        const src = ac.createBufferSource();
        src.buffer = ac.createBuffer(1, 1, 22050);
        src.connect(ac.destination);
        src.start(0);
      } catch { /* ignore */ }
      if (ac.state === 'running') ['pointerdown', 'keydown', 'touchend'].forEach((e) => removeEventListener(e, unlock, true));
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((e) => addEventListener(e, unlock, true));
  }
  const audioReady = () => !!audio && audio.state === 'running';

  /* --- Notifications ------------------------------------------------------- */
  const notifSupported = () => 'Notification' in window;
  const notifPermission = () => (notifSupported() ? Notification.permission : 'unsupported');

  async function requestNotifications() {
    if (!notifSupported()) return 'unsupported';
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
    emit('permission', Notification.permission);
    return Notification.permission;
  }

  async function notify(title, body) {
    if (notifPermission() !== 'granted') return false;
    const opts = { body, icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', tag: `ontime-${title}`, silent: true, lang: 'fr' };
    try { // Android / iOS (application installée) : passage obligatoire par le Service Worker
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return true; }
    } catch { /* repli */ }
    try {
      const n = new Notification(title, opts);
      n.onclick = () => { window.focus(); n.close(); };
      return true;
    } catch { return false; }
  }

  function playChime(kind = 'adhan') {
    if (!settings.sound.enabled) return;
    emit('sound', { kind, volume: settings.sound.volume, tone: settings.sound.tone });
  }

  /* --- Horaires, rappels et titre de l'onglet ------------------------------ */
  const fmt = (ms) => new Intl.DateTimeFormat('fr-FR', {
    hour: 'numeric', minute: '2-digit', hour12: settings.display.timeFormat === '12', timeZone: schedule?.tz,
  }).format(ms);

  const allEvents = () => (schedule ? [...schedule.yesterday, ...schedule.today, ...schedule.tomorrow].filter((e) => e.time) : []);
  const nextPrayer = (now) => allEvents().find((e) => e.key !== 'sunrise' && e.time > now);

  let lastTitle = '';
  function updateTitle() {
    const next = nextPrayer(Date.now());
    const title = next ? `${NAMES[next.key]} ${fmt(next.time)} · On time` : 'On time';
    if (title !== lastTitle) { document.title = title; lastTitle = title; }
  }

  const fired = new Set();
  function markPast() {
    const now = Date.now();
    for (const e of allEvents()) if (e.time <= now) { fired.add(`${e.key}@${e.time}`); fired.add(`r:${e.key}@${e.time}`); }
  }

  function tick() {
    const now = Date.now();
    if (!schedule || prayer.datePartsIn(new Date(now), schedule.tz).d !== Number(schedule.dateKey.slice(8))) {
      recompute();
      markPastOlderThan(now - FIRE_WINDOW);
    }
    const n = settings.notifications;
    const place = settings.location.city || settings.location.country || '';
    for (const e of allEvents()) {
      const id = `${e.key}@${e.time}`;
      if (now >= e.time && now - e.time < FIRE_WINDOW && !fired.has(id)) {
        fired.add(id);
        if (n.enabled && n.prayers[e.key]) {
          const title = e.key === 'sunrise' ? 'Chourouq — lever du soleil' : `C’est l’heure de ${NAMES[e.key]}`;
          notify(title, `${fmt(e.time)}${place ? ` · ${place}` : ''}`);
          playChime(e.key === 'sunrise' ? 'soft' : 'adhan');
        }
        emit('times', schedule);
      }
      if (n.reminder > 0 && e.key !== 'sunrise') {
        const at = e.time - n.reminder * 60_000;
        const rid = `r:${id}`;
        if (now >= at && now - at < FIRE_WINDOW && !fired.has(rid)) {
          fired.add(rid);
          if (n.enabled && n.prayers[e.key]) {
            notify(`${NAMES[e.key]} dans ${n.reminder} min`, `À ${fmt(e.time)}${place ? ` · ${place}` : ''}`);
            playChime('soft');
          }
        }
      }
    }
    if (fired.size > 200) [...fired].slice(0, 100).forEach((k) => fired.delete(k));
    updateTitle();
  }
  function markPastOlderThan(limit) {
    for (const e of allEvents()) if (e.time <= limit) { fired.add(`${e.key}@${e.time}`); fired.add(`r:${e.key}@${e.time}`); }
  }

  /* --- Plein écran ----------------------------------------------------------- */
  const fsTarget = () => document.getElementById('shell') || document.documentElement;
  const fullscreenSupported = () => !!(document.fullscreenEnabled && fsTarget().requestFullscreen);
  const isFull = () => !!document.fullscreenElement;

  function applyWindowMode(mode) {
    if (mode === 'fullscreen' && !isFull() && fullscreenSupported()) {
      fsTarget().requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        settings = store.merge(settings, { display: { windowMode: 'window' } });
        emit('settings', settings);
      });
    } else if (mode !== 'fullscreen' && isFull()) {
      document.exitFullscreen().catch(() => {});
    }
  }
  document.addEventListener('fullscreenchange', () => {
    const mode = isFull() ? 'fullscreen' : 'window';
    if (settings.display.windowMode !== mode) {
      settings = store.merge(settings, { display: { windowMode: mode } });
      persist();
      emit('settings', settings);
    }
    emit('mode', mode);
  });

  /* --- Installation (PWA) ---------------------------------------------------- */
  let installEvent = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installState = () => (standalone() ? 'installed' : installEvent ? 'available' : isIOS() ? 'ios' : 'unavailable');
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; emit('install', installState()); });
  addEventListener('appinstalled', () => { installEvent = null; emit('install', 'installed'); });

  async function install() {
    if (!installEvent) return installState();
    installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    installEvent = null;
    emit('install', installState());
    return choice?.outcome || 'dismissed';
  }

  /* --- Service Worker (hors-ligne + notifications) ---------------------------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  /* --- Interface publique (identique au preload Electron + extras web) ------- */
  window.ontime = {
    platform: 'web',
    getSettings: async () => settings,
    setSettings: async (patch) => applySettings(patch),
    resetCalc: async () => applySettings({ calc: structuredClone(store.DEFAULTS.calc) }),
    resetAll: async () => {
      storage.del(KEY);
      settings = store.merge(store.DEFAULTS, {});
      persist();
      emit('settings', settings);
      recompute();
      return settings;
    },
    getTimes: async () => schedule || recompute(),
    getMethods: async () => ({ methods: prayer.METHODS, adjMin: prayer.ADJ_MIN, adjMax: prayer.ADJ_MAX }),
    recommendedMethod: async (cc) => prayer.recommendedMethod(cc),
    detectLocation: async () => {
      try {
        const loc = await detectLocation({ precise: true });
        const s = applySettings({ location: { ...stripSource(loc), mode: 'auto' } });
        return { ok: true, location: s.location, source: loc.source };
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    },
    searchCity: async (query, countryCode) => {
      try { return { ok: true, results: await searchCity(query, countryCode) }; } catch (err) { return { ok: false, error: String(err.message || err), results: [] }; }
    },
    setLocation: async (loc) => {
      try {
        const n = normalize(loc);
        return { ok: true, settings: applySettings({ location: { ...n, mode: 'manual' } }) };
      } catch (err) { return { ok: false, error: String(err.message || err) }; }
    },
    appInfo: async () => ({
      name: 'On time', version: CONFIG.version || '1.0.0', year: new Date().getFullYear(),
      donateUrl: 'https://paypal.me/Krimossimo', windows: CONFIG.windows || null, repoUrl: CONFIG.repoUrl || null,
    }),
    openExternal: async (url) => { if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
    testNotification: async () => {
      const perm = await requestNotifications();
      playChime('adhan');
      if (perm !== 'granted') return { ok: false, permission: perm };
      const ok = await notify('C’est l’heure de la prière', 'Ceci est une notification de test d’On time.');
      return { ok, permission: perm };
    },
    getWindowMode: async () => (isFull() ? 'fullscreen' : 'window'),
    // Extras propres au navigateur
    capabilities: () => ({
      fullscreen: fullscreenSupported(), notifications: notifSupported(), permission: notifPermission(),
      install: installState(), audioReady: audioReady(), ios: isIOS(), standalone: standalone(),
    }),
    requestNotifications,
    install,
    onTimes: on('times'),
    onSettings: on('settings'),
    onSound: on('sound'),
    onNavigate: on('navigate'),
    onWindowMode: on('mode'),
    onPermission: on('permission'),
    onInstall: on('install'),
  };
  function stripSource({ source, ...rest }) { return rest; }

  /* --- Démarrage ------------------------------------------------------------- */
  recompute();
  markPast();
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { recompute(); tick(); } });

  // Mode automatique : position précise si déjà autorisée, sinon estimation par IP (sans fenêtre d'autorisation)
  if (settings.location.mode === 'auto') {
    geolocationGranted()
      .then((granted) => detectLocation({ precise: granted }))
      .then((loc) => applySettings({ location: { ...stripSource(loc), mode: 'auto' } }))
      .catch(() => { /* garde la dernière position connue */ });
  }
})();
