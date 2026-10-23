// On time Web — construction du site statique dans dist/ (aucune dépendance npm).
//  1. Regroupe le moteur partagé avec Windows (src/core, modules CommonJS) en un seul fichier navigateur.
//  2. Copie les fichiers de l'interface et injecte la configuration (version, lien Windows).
//  3. Génère la liste de fichiers mis en cache par le Service Worker.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

/* ---------- 1. Mini-bundler CommonJS ---------- */
const STUBS = { fs: '{}', path: '{}', electron: '{}' }; // store.js importe fs/path, inutilisés côté navigateur
function bundle(entries, base) {
  const modules = new Map();
  const visit = (abs) => {
    const id = path.relative(base, abs).split(path.sep).join('/');
    if (modules.has(id)) return id;
    const code = fs.readFileSync(abs, 'utf8');
    const deps = {};
    modules.set(id, { code, deps });
    for (const [, spec] of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      if (STUBS[spec]) { deps[spec] = `stub:${spec}`; continue; }
      if (!spec.startsWith('.')) throw new Error(`Module non pris en charge : ${spec} (dans ${id})`);
      let target = path.resolve(path.dirname(abs), spec);
      if (!fs.existsSync(target) && fs.existsSync(`${target}.js`)) target += '.js';
      deps[spec] = visit(target);
    }
    return id;
  };
  const ids = entries.map((e) => visit(path.join(base, e)));
  let out = '/* On time — moteur de calcul (généré par scripts/build.mjs à partir de src/core) */\n(function () {\n"use strict";\n';
  out += `var STUBS = {${Object.entries(STUBS).map(([k, v]) => `${JSON.stringify(`stub:${k}`)}: ${v}`).join(', ')}};\n`;
  out += 'var defs = {}, cache = {};\n';
  out += 'function load(id) {\n  if (id in STUBS) return STUBS[id];\n  if (cache[id]) return cache[id].exports;\n  var m = cache[id] = { exports: {} };\n  defs[id].fn.call(m.exports, m, m.exports, function (s) { return load(defs[id].deps[s]); });\n  return m.exports;\n}\n';
  for (const [id, { code, deps }] of modules) {
    out += `defs[${JSON.stringify(id)}] = { deps: ${JSON.stringify(deps)}, fn: function (module, exports, require) {\n${code}\n} };\n`;
  }
  out += `window.OnTimeCore = { prayer: load(${JSON.stringify(ids[0])}), store: load(${JSON.stringify(ids[1])}) };\n})();\n`;
  return { code: out, count: modules.size };
}

/* ---------- 2. Copie ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copyDir = (from, to, skip = () => false) => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (skip(a)) continue;
    if (entry.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyDir(a, b, skip); } else fs.copyFileSync(a, b);
  }
};
copyDir(SRC, OUT, (p) => p === path.join(SRC, 'core'));

const core = bundle(['main/prayer.js', 'main/store.js'], path.join(SRC, 'core'));
fs.writeFileSync(path.join(OUT, 'js/core.js'), core.code);

const win = config.windows && config.windows.url ? config.windows : null;
fs.writeFileSync(path.join(OUT, 'js/config.js'),
  `/* Généré par scripts/build.mjs depuis site.config.json */\nwindow.ONTIME_CONFIG = ${JSON.stringify({ version: config.version, repoUrl: config.repoUrl || null, windows: win }, null, 2)};\n`);

/* ---------- 3. Empreinte de version + Service Worker ---------- */
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(path.relative(OUT, p).split(path.sep).join('/'));
  }
};
walk(OUT);
const hash = crypto.createHash('sha256');
for (const f of files.sort()) hash.update(f).update(fs.readFileSync(path.join(OUT, f)));
const build = `${config.version}-${hash.digest('hex').slice(0, 10)}`;

const html = path.join(OUT, 'index.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replaceAll('__BUILD__', build));

const shell = ['./', ...files.filter((f) => f !== 'sw.js' && f !== 'index.html').map((f) => (/\.(js|css)$/.test(f) && f !== 'manifest.webmanifest' ? `${f}?v=${build}` : f))];
const sw = path.join(OUT, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD__', build).replace('__FILES__', JSON.stringify(shell, null, 2)));

// GitHub Pages : pas de traitement Jekyll ; 404 → application
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.copyFileSync(html, path.join(OUT, '404.html'));

console.log(`✓ dist/ prêt — version ${build} · ${core.count} modules du moteur · ${files.length} fichiers`);
console.log(win ? `✓ Lien Windows : ${win.url}` : '• Aucun installateur Windows configuré (site.config.json → windows)');
