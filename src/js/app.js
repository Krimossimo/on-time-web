/* On time — logique de l'interface (version web, adaptée de src/renderer/app.js de la version Windows) */
(() => {
  'use strict';

  const api = window.ontime;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const PRAYERS = [
    { key: 'fajr', fr: 'Fajr', ar: 'الفجر' },
    { key: 'sunrise', fr: 'Chourouq', ar: 'الشروق' },
    { key: 'dhuhr', fr: 'Dhuhr', ar: 'الظهر' },
    { key: 'asr', fr: 'Asr', ar: 'العصر' },
    { key: 'maghrib', fr: 'Maghrib', ar: 'المغرب' },
    { key: 'isha', fr: 'Isha', ar: 'العشاء' },
  ];
  const BY_KEY = Object.fromEntries(PRAYERS.map((p) => [p.key, p]));

  const ACCENTS = ['#8B5CF6', '#6D28D9', '#A855F7', '#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#F43F5E', '#E879F9'];

  const COUNTRY_CODES = 'AF ZA AL DZ DE AD AO AG SA AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BY MM BO BA BW BR BN BG BF BI KH CM CA CV CF CL CN CY CO KM CG CD KR KP CR CI HR CU DK DJ DM EG AE EC ER ES EE SZ US ET FJ FI FR GA GM GE GH GR GD GT GN GQ GW GY GF GP HT HN HU IN ID IQ IR IE IS IL IT JM JP JO KZ KE KG KI XK KW LA LS LV LB LR LY LI LT LU MK MG MY MW MV ML MT MA MQ MU MR YT MX FM MD MC MN ME MZ NA NR NP NI NE NG NO NC NZ OM UG UZ PK PW PS PA PG PY NL PE PH PL PF PT QA DO CZ RE RO GB RU RW KN SM VC LC SB SV WS ST SN RS SC SL SG SK SI SO SD SS LK SE CH SR SY TJ TW TZ TD TH TL TG TO TT TN TM TR TV UA UY VU VA VE VN YE ZM ZW'.split(' ');

  const state = { settings: null, times: null, methods: [], adj: { min: -15, max: 15 }, info: null, lastMinute: -1 };

  /* ------------------------------------------------------------------ */
  /* Formats                                                             */
  /* ------------------------------------------------------------------ */

  const tz = () => state.times?.tz || state.settings?.location?.tz;

  function hm(ms, { seconds = false } = {}) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz(), hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(ms);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    let h = Number(get('hour'));
    const m = get('minute');
    const s = get('second');
    if (state.settings.display.timeFormat === '12') {
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return { text: `${h}:${m}`, s, ap };
    }
    return { text: `${String(h).padStart(2, '0')}:${m}`, s, ap: '' };
  }

  const timeHTML = (ms) => {
    if (!ms) return '—';
    const t = hm(ms);
    return t.ap ? `${t.text}<small>${t.ap}</small>` : t.text;
  };

  function countdown(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `dans ${h} h ${String(m).padStart(2, '0')}`;
    if (m > 0) return `dans ${m} min${m < 10 ? ` ${String(s).padStart(2, '0')} s` : ''}`;
    return `dans ${s} s`;
  }

  function gregorian(ms) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: tz(), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
  }

  function hijri(ms) {
    try {
      const f = new Intl.DateTimeFormat('fr-FR-u-ca-islamic-umalqura', { timeZone: tz(), day: 'numeric', month: 'long', year: 'numeric' });
      return f.format(ms).replace(/\s?(AH|ap\. ?J\.-C\.|H)$/i, '') + ' H';
    } catch {
      return '';
    }
  }

  const countryName = (cc) => {
    try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(cc); } catch { return cc; }
  };

  /* ------------------------------------------------------------------ */
  /* Thème                                                               */
  /* ------------------------------------------------------------------ */

  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.45 ? '#120c1d' : '#ffffff';
  }

  function applyTheme() {
    const d = state.settings.display;
    document.documentElement.dataset.theme = d.theme;
    document.documentElement.style.setProperty('--accent', d.accent);
    document.documentElement.style.setProperty('--accent-ink', inkFor(d.accent));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', d.theme === 'light' ? '#ffffff' : '#0b0911');
  }

  /* ------------------------------------------------------------------ */
  /* Accueil                                                             */
  /* ------------------------------------------------------------------ */

  function events() {
    const t = state.times;
    if (!t) return [];
    return [...t.yesterday, ...t.today, ...t.tomorrow].filter((e) => e.time);
  }

  function renderList() {
    const t = state.times;
    const n = state.settings.notifications;
    $('#list').innerHTML = t.today.map((e) => {
      const p = BY_KEY[e.key];
      const on = n.enabled && n.prayers[e.key];
      return `<li class="row ${e.key}" data-key="${e.key}">
        <span class="ico" data-icon="${e.key}"></span>
        <span class="nm">${p.fr}<small lang="ar">${p.ar}</small></span>
        <span class="tm">${timeHTML(e.time)}</span>
        <button class="bell ${on ? 'on' : ''}" data-bell="${e.key}" title="${on ? 'Désactiver' : 'Activer'} la notification" data-icon="${on ? 'bell' : 'bellOff'}"></button>
      </li>`;
    }).join('');
    Icons.hydrate($('#list'));

    const loc = state.settings.location;
    $('#placeName').textContent = [loc.city, loc.country].filter(Boolean).join(', ') || 'Choisir un lieu';
    const madhab = state.settings.calc.madhab === 'hanafi' ? 'Asr hanafi' : 'Asr standard';
    $('#meta').textContent = `${t.method.name} · ${madhab}`;
  }

  function renderClock() {
    if (!state.times || !state.settings) return;
    const now = Date.now();
    const c = hm(now);
    $('#clockHM').textContent = c.text;
    $('#clockS').textContent = state.settings.display.showSeconds ? c.s : '';
    $('#clockAP').textContent = c.ap;

    const minute = Math.floor(now / 60000);
    if (minute !== state.lastMinute) {
      state.lastMinute = minute;
      $('#dateG').textContent = gregorian(now);
      $('#dateH').textContent = hijri(now);
    }

    const evs = events().filter((e) => e.key !== 'sunrise');
    const nextIdx = evs.findIndex((e) => e.time > now);
    const next = evs[nextIdx];
    const prev = evs[nextIdx - 1];
    if (next) {
      const p = BY_KEY[next.key];
      $('#nextName').textContent = p.fr;
      $('#nextAr').textContent = p.ar;
      $('#nextTime').innerHTML = timeHTML(next.time);
      $('#countdown').textContent = countdown(next.time - now);
      const isTomorrow = !state.times.today.some((x) => x.time === next.time);
      $('#nextLabel').textContent = isTomorrow ? 'Prochaine prière · demain' : 'Prochaine prière';
      if (prev) {
        const pct = Math.min(100, Math.max(0, ((now - prev.time) / (next.time - prev.time)) * 100));
        $('#progress').style.width = `${pct.toFixed(2)}%`;
      }
    }

    // Lignes passées / prochaine
    const todayNext = state.times.today.find((e) => e.key !== 'sunrise' && e.time > now);
    $$('#list .row').forEach((row) => {
      const e = state.times.today.find((x) => x.key === row.dataset.key);
      row.classList.toggle('passed', !!e.time && e.time <= now);
      row.classList.toggle('next', !!todayNext && todayNext.key === e.key);
    });
  }

  function loop() {
    renderClock();
    const delay = 1000 - (Date.now() % 1000) + 5;
    setTimeout(loop, delay);
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */

  function openSettings(sectionId) {
    if (!$('#shell').classList.contains('settings-open')) {
      try { history.pushState({ ontime: 'settings' }, '', '#parametres'); } catch { /* ignore */ }
    }
    $('#shell').classList.add('settings-open');
    $('#viewSettings').setAttribute('aria-hidden', 'false');
    if (sectionId) requestAnimationFrame(() => scrollToSection(sectionId, false));
  }
  function closeSettings({ fromHistory = false } = {}) {
    if (!fromHistory && history.state?.ontime === 'settings') { history.back(); return; }
    if (!fromHistory && location.hash === '#parametres') {
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
    }
    $('#shell').classList.remove('settings-open');
    $('#viewSettings').setAttribute('aria-hidden', 'true');
    $('#cityResults').classList.remove('open');
  }
  function scrollToSection(id, smooth = true) {
    const sc = $('#settingsScroll');
    const el = document.getElementById(id);
    if (!el) return;
    sc.scrollTo({ top: el.offsetTop - sc.offsetTop - 4, behavior: smooth ? 'smooth' : 'auto' });
  }
  function syncChips() {
    const sc = $('#settingsScroll');
    const ids = $$('#chips button').map((b) => b.dataset.target);
    let current = ids[0];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el.offsetTop - sc.offsetTop - 40 <= sc.scrollTop) current = id;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) current = ids[ids.length - 1];
    $$('#chips button').forEach((b) => {
      const on = b.dataset.target === current;
      if (on && !b.classList.contains('active')) {
        // Fait défiler uniquement la barre de puces (jamais la fenêtre)
        const bar = $('#chips');
        const left = b.offsetLeft - bar.offsetLeft;
        if (left < bar.scrollLeft + 8) bar.scrollTo({ left: left - 16, behavior: 'smooth' });
        else if (left + b.offsetWidth > bar.scrollLeft + bar.clientWidth - 8) bar.scrollTo({ left: left + b.offsetWidth - bar.clientWidth + 16, behavior: 'smooth' });
      }
      b.classList.toggle('active', on);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Réglages : utilitaires                                              */
  /* ------------------------------------------------------------------ */

  const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
  const patchFor = (path, value) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), value);

  async function save(path, value) {
    state.settings = await api.setSettings(patchFor(path, value));
    return state.settings;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function bindSwitch(id, path) {
    const el = $(id);
    el.addEventListener('change', () => save(path, el.checked));
  }
  function bindSeg(id, path, cast = (v) => v) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) save(path, cast(b.dataset.value));
    });
  }
  function setSeg(id, value) {
    $$(`${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.value === String(value)));
  }

  /* ------------------------------------------------------------------ */
  /* Réglages : rendu                                                    */
  /* ------------------------------------------------------------------ */

  function buildStaticControls() {
    // Pays
    const sel = $('#selCountry');
    const list = COUNTRY_CODES.map((cc) => ({ cc, name: countryName(cc) })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    sel.innerHTML = list.map((c) => `<option value="${c.cc}">${c.name}</option>`).join('');

    // Méthodes
    const groups = {};
    state.methods.forEach((m) => (groups[m.group] ||= []).push(m));
    $('#selMethod').innerHTML =
      `<option value="auto">Automatique (selon le pays)</option>` +
      Object.entries(groups).map(([g, ms]) =>
        `<optgroup label="${g}">${ms.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</optgroup>`).join('');

    // Bascules par prière
    $('#prayerToggles').innerHTML = PRAYERS.map((p) =>
      `<button class="pt" data-pt="${p.key}"><span class="i" data-icon="${p.key}"></span>${p.fr}</button>`).join('');

    // Ajustements
    $('#adjustList').innerHTML = PRAYERS.map((p) => `
      <div class="adj-row" data-adj="${p.key}">
        <span class="adj-name"><span class="i" data-icon="${p.key}"></span>${p.fr}</span>
        <span class="stepper">
          <button data-step="-1" title="−1 minute">−</button>
          <output>0 min</output>
          <button data-step="1" title="+1 minute">+</button>
        </span>
        <span class="adj-time">--:--</span>
      </div>`).join('');

    // Couleurs
    $('#swatches').innerHTML = ACCENTS.map((c) =>
      `<button class="sw" style="--c:${c}" data-color="${c}" title="${c}" data-icon="check"></button>`).join('') +
      `<label class="sw custom-c" title="Couleur personnalisée"><input type="color" id="inpColor" /></label>`;

    Icons.hydrate();
  }

  function renderSettings() {
    const s = state.settings;
    const t = state.times;

    // Lieu
    setSeg('#segLocMode', s.location.mode);
    $('#secLocation .card').classList.toggle('is-manual', s.location.mode === 'manual');
    $('#locCity').textContent = s.location.city || countryName(s.location.countryCode) || '—';
    $('#locSub').textContent = `${s.location.country || ''} · ${s.location.lat.toFixed(4)}, ${s.location.lon.toFixed(4)} · ${s.location.tz}`;
    if (s.location.countryCode) $('#selCountry').value = s.location.countryCode;
    if (document.activeElement !== $('#inpLat')) $('#inpLat').value = s.location.lat;
    if (document.activeElement !== $('#inpLon')) $('#inpLon').value = s.location.lon;
    $('#locHint').textContent = s.location.mode === 'auto'
      ? 'Touchez « Détecter » pour utiliser la position de votre appareil. Sinon, elle est estimée à partir de votre connexion internet.'
      : 'Choisissez votre pays puis recherchez votre ville.';

    // Méthode
    $('#selMethod').value = s.calc.method;
    const m = t?.method;
    if (m) {
      $('#methodHint').textContent = s.calc.method === 'auto'
        ? `Pour ${s.location.country || 'votre pays'} : ${m.name} (${m.detail}).`
        : (m.id === 'custom' ? 'Définissez vos propres angles ci-dessous.' : m.detail);
    }
    $('#customPanel').classList.toggle('open', s.calc.method === 'custom');
    if (document.activeElement !== $('#inpFajrAngle')) $('#inpFajrAngle').value = s.calc.custom.fajr;
    if (document.activeElement !== $('#inpIshaAngle')) $('#inpIshaAngle').value = s.calc.custom.isha;
    if (document.activeElement !== $('#inpIshaInterval')) $('#inpIshaInterval').value = s.calc.custom.ishaInterval || '';
    setSeg('#segMadhab', s.calc.madhab);
    $('#selHighLat').value = s.calc.highLatitude;

    // Ajustements
    $$('#adjustList .adj-row').forEach((row) => {
      const key = row.dataset.adj;
      const v = s.calc.adjustments[key] || 0;
      const out = row.querySelector('output');
      out.textContent = v === 0 ? '0 min' : `${v > 0 ? '+' : '−'}${Math.abs(v)} min`;
      out.classList.toggle('zero', v === 0);
      row.querySelector('[data-step="-1"]').disabled = v <= state.adj.min;
      row.querySelector('[data-step="1"]').disabled = v >= state.adj.max;
      const e = t?.today.find((x) => x.key === key);
      const tm = row.querySelector('.adj-time');
      tm.innerHTML = e ? timeHTML(e.time) : '—';
      tm.classList.toggle('changed', v !== 0);
    });

    // Notifications
    $('#swNotif').checked = s.notifications.enabled;
    $('#secNotif .card').classList.toggle('disabled-children', !s.notifications.enabled);
    $$('#prayerToggles .pt').forEach((b) => b.classList.toggle('on', !!s.notifications.prayers[b.dataset.pt]));
    $('#selReminder').value = String(s.notifications.reminder);
    $('#swSound').checked = s.sound.enabled;
    $$('#tones button').forEach((b) => b.classList.toggle('active', b.dataset.tone === s.sound.tone));
    const vol = $('#rngVolume');
    vol.value = s.sound.volume;
    vol.style.setProperty('--p', `${s.sound.volume * 100}%`);

    // Affichage
    setSeg('#segWindowMode', s.display.windowMode);
    setSeg('#segFormat', s.display.timeFormat);
    setSeg('#segTheme', s.display.theme);
    $$('#swatches .sw[data-color]').forEach((b) =>
      b.classList.toggle('active', b.dataset.color.toLowerCase() === s.display.accent.toLowerCase()));
    const isCustom = !ACCENTS.some((c) => c.toLowerCase() === s.display.accent.toLowerCase());
    $('.sw.custom-c').classList.toggle('active', isCustom);
    $('.sw.custom-c').style.setProperty('--c', s.display.accent);
    $('#inpColor').value = s.display.accent;
    $('#swSeconds').checked = s.display.showSeconds;

    renderWeb();
  }

  function renderAll() {
    applyTheme();
    if (state.times) renderList();
    renderSettings();
    state.lastMinute = -1;
    renderClock();
  }

  /* ------------------------------------------------------------------ */
  /* Réglages : évènements                                               */
  /* ------------------------------------------------------------------ */

  function bindSettings() {
    // Lieu
    $('#segLocMode').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b) return;
      if (b.dataset.value === 'auto') {
        await detect();
      } else {
        await save('location.mode', 'manual');
        $('#inpCity').focus();
      }
    });
    $('#btnDetect').addEventListener('click', detect);

    $('#selCountry').addEventListener('change', () => {
      $('#inpCity').value = '';
      $('#cityResults').classList.remove('open');
      $('#inpCity').focus();
    });

    let searchTimer;
    let searchSeq = 0;
    const results = $('#cityResults');
    $('#inpCity').addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = $('#inpCity').value.trim();
      if (q.length < 2) { results.classList.remove('open'); return; }
      results.innerHTML = '<li class="empty">Recherche…</li>';
      results.classList.add('open');
      searchTimer = setTimeout(async () => {
        const seq = ++searchSeq;
        const res = await api.searchCity(q, $('#selCountry').value);
        if (seq !== searchSeq) return;
        if (!res.ok) {
          results.innerHTML = '<li class="empty">Recherche indisponible (connexion internet ?)</li>';
          return;
        }
        if (!res.results.length) {
          results.innerHTML = '<li class="empty">Aucune ville trouvée</li>';
          return;
        }
        results.innerHTML = res.results.map((r, i) =>
          `<li data-i="${i}"><strong>${escapeHTML(r.city)}</strong><small>${escapeHTML([r.region, r.country].filter(Boolean).join(' · '))}</small></li>`).join('');
        results._data = res.results;
      }, 350);
    });
    results.addEventListener('click', async (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      const r = results._data[Number(li.dataset.i)];
      const res = await api.setLocation(r);
      if (res.ok) {
        state.settings = res.settings;
        results.classList.remove('open');
        $('#inpCity').value = '';
        toast(`Lieu : ${r.city}`);
      }
    });
    $('#btnCoords').addEventListener('click', async () => {
      const lat = Number($('#inpLat').value);
      const lon = Number($('#inpLon').value);
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { toast('Coordonnées invalides'); return; }
      const loc = state.settings.location;
      const res = await api.setLocation({ lat, lon, city: loc.city, countryCode: $('#selCountry').value });
      if (res.ok) { state.settings = res.settings; toast('Coordonnées appliquées'); }
    });

    // Calcul
    $('#selMethod').addEventListener('change', (e) => save('calc.method', e.target.value));
    const num = (id, path) => $(id).addEventListener('change', (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) save(path, v);
    });
    num('#inpFajrAngle', 'calc.custom.fajr');
    num('#inpIshaAngle', 'calc.custom.isha');
    num('#inpIshaInterval', 'calc.custom.ishaInterval');
    bindSeg('#segMadhab', 'calc.madhab');
    $('#selHighLat').addEventListener('change', (e) => save('calc.highLatitude', e.target.value));

    $('#adjustList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-step]');
      if (!b) return;
      const key = b.closest('.adj-row').dataset.adj;
      const cur = state.settings.calc.adjustments[key] || 0;
      const v = Math.max(state.adj.min, Math.min(state.adj.max, cur + Number(b.dataset.step)));
      save(`calc.adjustments.${key}`, v);
    });
    $('#btnResetAdj').addEventListener('click', async () => {
      await save('calc.adjustments', { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 });
      toast('Ajustements remis à zéro');
    });

    // Notifications
    $('#swNotif').addEventListener('change', async (e) => {
      await save('notifications.enabled', e.target.checked);
      if (e.target.checked) await api.requestNotifications();
    });
    $('#btnPerm').addEventListener('click', async () => {
      const p = await api.requestNotifications();
      toast(p === 'granted' ? 'Notifications autorisées' : 'Autorisation refusée par le navigateur');
    });
    $('#prayerToggles').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pt]');
      if (b) save(`notifications.prayers.${b.dataset.pt}`, !state.settings.notifications.prayers[b.dataset.pt]);
    });
    $('#selReminder').addEventListener('change', (e) => save('notifications.reminder', Number(e.target.value)));
    bindSwitch('#swSound', 'sound.enabled');
    const vol = $('#rngVolume');
    vol.addEventListener('input', () => vol.style.setProperty('--p', `${vol.value * 100}%`));
    vol.addEventListener('change', () => save('sound.volume', Number(vol.value)));
    $('#btnTestSound').addEventListener('click', () =>
      Chime.play({ kind: 'adhan', volume: Number(vol.value), tone: state.settings.sound.tone }));
    $('#tones').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tone]');
      if (!b) return;
      Chime.play({ kind: 'adhan', volume: Number(vol.value), tone: b.dataset.tone }); // aperçu
      save('sound.tone', b.dataset.tone);
    });
    $('#btnTestNotif').addEventListener('click', async () => {
      const r = await api.testNotification();
      if (!r.ok) {
        toast(r.permission === 'denied'
          ? 'Notifications bloquées : autorisez-les dans les réglages du navigateur'
          : r.permission === 'unsupported' ? 'Ce navigateur ne gère pas les notifications' : 'Notification non affichée');
      }
      renderWeb();
    });

    // Affichage
    bindSeg('#segWindowMode', 'display.windowMode');
    bindSeg('#segFormat', 'display.timeFormat');
    bindSeg('#segTheme', 'display.theme');
    $('#swatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (b) save('display.accent', b.dataset.color);
    });
    $('#inpColor').addEventListener('input', (e) => document.documentElement.style.setProperty('--accent', e.target.value));
    $('#inpColor').addEventListener('change', (e) => save('display.accent', e.target.value));
    bindSwitch('#swSeconds', 'display.showSeconds');

    // Don / à propos
    const donate = () => api.openExternal(state.info.donateUrl);
    $('#btnDonate').addEventListener('click', donate);
    $('#btnPaypal').addEventListener('click', donate);

    // Désinstallation
    $('#btnUninstall').addEventListener('click', () => $('#modal').classList.add('open'));
    $('#btnCancel').addEventListener('click', () => $('#modal').classList.remove('open'));
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });
    $('#btnConfirm').addEventListener('click', async () => {
      state.settings = await api.resetAll();
      $('#modal').classList.remove('open');
      toast('Réglages réinitialisés');
    });

    // Installation (PWA)
    const doInstall = async () => {
      const st = api.capabilities().install;
      if (st === 'ios') { toast('Sur iPhone : touchez Partager puis « Sur l’écran d’accueil »'); return; }
      const r = await api.install();
      if (r === 'accepted') toast('On time est installé');
      renderWeb();
    };
    $('#btnInstall').addEventListener('click', doInstall);
    $('#btnInstallHero').addEventListener('click', doInstall);
    api.onInstall(renderWeb);
    api.onPermission(renderWeb);
    $('#btnFull').addEventListener('click', () =>
      save('display.windowMode', state.settings.display.windowMode === 'fullscreen' ? 'window' : 'fullscreen'));

    // Navigation
    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-target]');
      if (b) scrollToSection(b.dataset.target);
    });
    $('#settingsScroll').addEventListener('scroll', syncChips, { passive: true });
  }

  async function detect() {
    const btn = $('#btnDetect');
    btn.disabled = true;
    btn.querySelector('.svg')?.classList.add('spin');
    const res = await api.detectLocation();
    btn.disabled = false;
    btn.querySelector('.svg')?.classList.remove('spin');
    if (res.ok) {
      const where = res.location.city || res.location.country || 'position enregistrée';
      toast(res.source === 'ip' ? `Position estimée : ${where}` : `Position détectée : ${where}`);
    } else {
      toast('Impossible de détecter la position. Choisissez votre ville manuellement.');
      await save('location.mode', 'manual');
    }
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                           */
  /* ------------------------------------------------------------------ */

  async function init() {
    const [settings, times, methods, info] = await Promise.all([
      api.getSettings(), api.getTimes(), api.getMethods(), api.appInfo(),
    ]);
    Object.assign(state, { settings, times, methods: methods.methods, adj: { min: methods.adjMin, max: methods.adjMax }, info });

    $('#aboutVer').textContent = `Version ${info.version}`;
    $('#legal').textContent = `© ${info.year} Krimossimo — Tous droits réservés.`;
    $('#footYear').textContent = info.year;
    setupWindowsLinks(info.windows);
    if (info.repoUrl) { $('#lnkRepo').href = info.repoUrl; $('#lnkRepo').hidden = false; }

    buildStaticControls();
    bindSettings();
    renderAll();
    loop();
    if (location.hash === '#parametres') {
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
    }
    hideSplash();

    // Barre de titre
    $('#btnSettings').addEventListener('click', () =>
      ($('#shell').classList.contains('settings-open') ? closeSettings() : openSettings()));
    $('#btnBack').addEventListener('click', () => closeSettings());
    addEventListener('popstate', () => { if ($('#shell').classList.contains('settings-open')) closeSettings({ fromHistory: true }); });
    $('#placeBtn').addEventListener('click', () => openSettings('secLocation'));
    $('#list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bell]');
      if (!b) return;
      const key = b.dataset.bell;
      const n = state.settings.notifications;
      if (!n.enabled) {
        save('notifications', { enabled: true, prayers: { [key]: true } });
      } else {
        save(`notifications.prayers.${key}`, !n.prayers[key]);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if ($('#modal').classList.contains('open')) $('#modal').classList.remove('open');
        else if ($('#shell').classList.contains('settings-open')) closeSettings();
        // En plein écran, le navigateur gère lui-même la touche Échap (évènement fullscreenchange)
      }
    });

    // Mises à jour depuis le processus principal
    api.onTimes((t) => { state.times = t; renderList(); renderSettings(); renderClock(); });
    api.onSettings((s) => { state.settings = s; renderAll(); });
    api.onSound((opts) => Chime.play(opts));
    api.onNavigate((view) => (view === 'settings' ? openSettings() : closeSettings()));

    // Fenêtré / plein écran
    const setMode = (mode) => {
      document.documentElement.classList.toggle('is-fullscreen', mode === 'fullscreen');
      fitFullscreen();
      renderWeb();
    };
    api.onWindowMode(setMode);
    api.getWindowMode().then(setMode);
    window.addEventListener('resize', fitFullscreen);
  }

  /* ------------------------------------------------------------------ */
  /* Propre à la version web                                             */
  /* ------------------------------------------------------------------ */

  /** Relie les boutons « Télécharger pour Windows » au véritable fichier publié. */
  function setupWindowsLinks(win) {
    const ok = !!(win && /^https:\/\/github\.com\/.+\/releases\/download\//.test(win.url));
    ['#btnWinHero', '#btnWinHome', '#btnWinTop', '#btnWinSettings'].forEach((id) => {
      const a = $(id);
      if (ok) { a.href = win.url; a.setAttribute('download', ''); a.rel = 'noopener'; }
      a.hidden = !ok;
    });
    $('#rowWin').hidden = !ok;
    $('#winMissing').hidden = ok;
    if (ok) {
      const meta = [`Version ${win.version}`, 'Windows 10 et 11', win.sizeMB ? `${win.sizeMB} Mo` : '', 'gratuit'].filter(Boolean).join(' · ');
      $('#winMeta').textContent = meta;
      $('#winText').textContent = `${meta} — widget, alertes en arrière-plan, lancement avec Windows`;
    }
  }

  function renderWeb() {
    const cap = api.capabilities();
    // Plein écran (indisponible sur iPhone : la commande est masquée)
    $('#rowWindowMode').hidden = !cap.fullscreen;
    const full = state.settings?.display.windowMode === 'fullscreen';
    const bf = $('#btnFull');
    bf.hidden = !cap.fullscreen;
    if (bf.dataset.icon !== (full ? 'minimize' : 'maximize')) { bf.dataset.icon = full ? 'minimize' : 'maximize'; Icons.hydrate(bf.parentNode); }
    bf.title = full ? 'Quitter le plein écran' : 'Plein écran';

    // Autorisation des notifications
    const perm = cap.permission;
    const texts = {
      granted: 'Notifications autorisées par le navigateur',
      denied: 'Notifications bloquées : autorisez-les dans les réglages du navigateur',
      default: 'Le navigateur doit autoriser les notifications',
      unsupported: cap.ios && !cap.standalone
        ? 'Sur iPhone, installez d’abord l’application (Partager → Sur l’écran d’accueil)'
        : 'Ce navigateur ne gère pas les notifications',
    };
    $('#permRow').dataset.state = perm;
    $('#permText').textContent = texts[perm];
    $('#btnPerm').hidden = perm !== 'default';

    // Installation
    const inst = cap.install;
    const btn = $('#btnInstall');
    btn.hidden = !(inst === 'available' || inst === 'ios');
    $('#btnInstallHero').hidden = !(inst === 'available' || inst === 'ios');
    $('#installText').textContent = {
      installed: 'On time est installé sur cet appareil',
      available: 'Accès direct depuis l’écran d’accueil, même hors-ligne',
      ios: 'Sur iPhone / iPad : Partager → « Sur l’écran d’accueil »',
      unavailable: 'Utilisez le menu du navigateur → « Installer l’application » ou « Ajouter à l’écran d’accueil »',
    }[inst];
  }

  /** Écran de bienvenue : disparaît seul dès que l'interface est prête (≈ 1 s au maximum). */
  function hideSplash() {
    const splash = $('#splash');
    if (!splash) return;
    const reduced = document.documentElement.classList.contains('reduced');
    const shown = performance.now();
    const minVisible = reduced ? 150 : 950;
    setTimeout(() => {
      document.documentElement.classList.add('app-ready');
      splash.classList.add('out');
      setTimeout(() => splash.remove(), reduced ? 200 : 520);
    }, Math.max(0, minVisible - shown));
  }

  /* En plein écran, le widget est agrandi et centré */
  function fitFullscreen() {
    const fs = Math.min((innerWidth - 48) / 380, (innerHeight - 44 - 48) / 616, 2.6);
    document.documentElement.style.setProperty('--fs', Math.max(1, fs).toFixed(3));
  }

  init();
})();
