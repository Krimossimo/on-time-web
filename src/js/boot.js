/* Applique le thème enregistré avant le premier affichage (évite un flash de couleur) */
(() => {
  try {
    const s = JSON.parse(localStorage.getItem('ontime.settings.v1') || '{}');
    const d = s.display || {};
    const root = document.documentElement;
    if (d.theme === 'light' || d.theme === 'dark') root.dataset.theme = d.theme;
    if (/^#[0-9a-f]{6}$/i.test(d.accent || '')) root.style.setProperty('--accent', d.accent);
  } catch { /* stockage indisponible : thème par défaut */ }
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('reduced');
  } catch { /* ignore */ }
})();
