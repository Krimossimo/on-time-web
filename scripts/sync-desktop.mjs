// Recopie dans la version web les fichiers partagés avec la version Windows.
// À lancer depuis le dossier web/ placé dans le projet Windows : npm run sync
// (le dépôt web reste autonome : ces copies sont versionnées dans src/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = path.resolve(process.argv[2] || path.join(WEB, '..'));
const pkg = path.join(DESKTOP, 'package.json');
if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).productName !== 'On time') {
  console.error(`Projet Windows introuvable dans ${DESKTOP}`);
  process.exit(1);
}
const SHARED = [
  ['src/main/prayer.js', 'src/core/main/prayer.js'],
  ['src/main/store.js', 'src/core/main/store.js'],
  ['src/vendor', 'src/core/vendor'],
  ['src/renderer/icons.js', 'src/js/icons.js'],
  ['src/renderer/sound.js', 'src/js/sound.js'],
  ['src/renderer/styles.css', 'src/css/styles.css'],
];
for (const [from, to] of SHARED) {
  fs.cpSync(path.join(DESKTOP, from), path.join(WEB, to), { recursive: true });
  console.log(`✓ ${from} → ${to}`);
}
console.log('Les fichiers adaptés au web (src/js/app.js, src/index.html) ne sont pas écrasés.');
