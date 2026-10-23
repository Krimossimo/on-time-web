// Vérifie le site généré : le moteur bundlé se charge et calcule comme la version Windows.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = (f) => path.join(ROOT, 'dist', f);

const sandbox = { window: {}, Intl, Date, Math, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(dist('js/core.js'), 'utf8'), sandbox);
const { prayer, store } = sandbox.window.OnTimeCore;

const settings = store.merge(store.DEFAULTS, {});
const hhmm = (ms, tz) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(ms);
const times = (s, iso) => Object.fromEntries(prayer.computeSchedule(s, new Date(iso)).today.map((e) => [e.key, hhmm(e.time, 'Europe/Paris')]));

// Référence : Paris, 20 octobre 2026, méthode Musulmans de France 12° (valeurs de la version Windows)
assert.deepEqual(times(settings, '2026-10-20T12:00:00Z'),
  { fajr: '07:10', sunrise: '08:18', dhuhr: '13:35', asr: '16:20', maghrib: '18:52', isha: '20:00' });
// Madhab hanafi + ajustements
const s2 = store.merge(settings, { calc: { madhab: 'hanafi', adjustments: { asr: 5, isha: -3 } } });
const t2 = times(s2, '2026-10-20T12:00:00Z');
assert.equal(t2.asr, '17:08');
assert.equal(t2.isha, '19:57');
// Ajustements bornés à ±15 min
const t3 = times(store.merge(settings, { calc: { adjustments: { fajr: 99 } } }), '2026-10-20T12:00:00Z');
assert.equal(t3.fajr, '07:25');
// Fuseau automatique
assert.equal(prayer.timezoneFor(33.5731, -7.5898), 'Africa/Casablanca');
assert.equal(prayer.recommendedMethod('FR'), 'uoif');
assert.ok(prayer.METHODS.length >= 18);

// Fichiers attendus et chemins relatifs (fonctionne sous /on-time-web/ sur GitHub Pages)
for (const f of ['index.html', '404.html', 'sw.js', 'manifest.webmanifest', '.nojekyll', 'js/app.js', 'js/web-api.js', 'js/config.js', 'css/app.css', 'assets/icon-192.png']) {
  assert.ok(fs.existsSync(dist(f)), `manquant : ${f}`);
}
const html = fs.readFileSync(dist('index.html'), 'utf8');
assert.ok(!/(src|href)="\/(?!\/)/.test(html), 'chemin absolu trouvé dans index.html');
assert.ok(!html.includes('__BUILD__'));
const sw = fs.readFileSync(dist('sw.js'), 'utf8');
assert.ok(!sw.includes('__FILES__'));
for (const f of JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1])) {
  if (f !== './') assert.ok(fs.existsSync(dist(f.split('?')[0])), `fichier du cache absent : ${f}`);
}
// Lien Windows : uniquement une vraie adresse de téléchargement GitHub Releases
const cfg = fs.readFileSync(dist('js/config.js'), 'utf8');
const win = JSON.parse(cfg.slice(cfg.indexOf('{'), cfg.lastIndexOf('}') + 1)).windows;
if (win) assert.match(win.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/(latest\/)?download\/[^/]+\.exe$/);
console.log('✓ Tous les tests passent');
