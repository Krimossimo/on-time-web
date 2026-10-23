'use strict';
/**
 * On time — moteur de calcul des heures de prière.
 *
 * S'appuie sur la bibliothèque astronomique « adhan » (Batoul Apps, licence MIT)
 * et ajoute : méthodes adaptées à la France, choix du madhab pour l'Asr,
 * règle haute latitude et ajustements manuels (-15 / +15 min) par prière.
 */
const adhan = require('../vendor/adhan/Adhan.js');
const tzlookup = require('../vendor/tz-lookup.js');

const { CalculationMethod: CM, CalculationParameters: CP, Coordinates, PrayerTimes,
  Madhab, HighLatitudeRule, PolarCircleResolution } = adhan;

const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const ADJ_MIN = -15;
const ADJ_MAX = 15;

/** Paramètres « angles seuls » (sans ajustement caché) */
const angles = (fajr, isha, ishaInterval = 0) => () => new CP('Other', fajr, isha, ishaInterval);

/**
 * Méthodes proposées. `make` renvoie un objet CalculationParameters neuf.
 * Les trois premières sont les références les plus utilisées en France
 * (Mawaqit et la plupart des mosquées françaises utilisent l'une d'elles).
 */
const METHODS = [
  { id: 'uoif', name: 'Musulmans de France (ex-UOIF)', detail: 'Fajr 12° · Isha 12°', group: 'France', make: angles(12, 12) },
  { id: 'france15', name: 'France 15°', detail: 'Fajr 15° · Isha 15°', group: 'France', make: angles(15, 15) },
  { id: 'paris18', name: 'Grande Mosquée de Paris', detail: 'Fajr 18° · Isha 18°', group: 'France', make: angles(18, 18) },
  { id: 'mwl', name: 'Ligue Islamique Mondiale', detail: 'Fajr 18° · Isha 17°', group: 'International', make: () => CM.MuslimWorldLeague() },
  { id: 'makkah', name: 'Umm al-Qura (La Mecque)', detail: 'Fajr 18,5° · Isha 90 min', group: 'International', make: () => CM.UmmAlQura() },
  { id: 'egypt', name: 'Autorité générale égyptienne', detail: 'Fajr 19,5° · Isha 17,5°', group: 'International', make: () => CM.Egyptian() },
  { id: 'isna', name: 'ISNA (Amérique du Nord)', detail: 'Fajr 15° · Isha 15°', group: 'International', make: () => CM.NorthAmerica() },
  { id: 'karachi', name: 'Université des sciences islamiques, Karachi', detail: 'Fajr 18° · Isha 18°', group: 'International', make: () => CM.Karachi() },
  { id: 'moonsighting', name: 'Moonsighting Committee', detail: 'Fajr 18° · Isha 18° (saisonnier)', group: 'International', make: () => CM.MoonsightingCommittee() },
  { id: 'morocco', name: 'Maroc (Ministère des Habous)', detail: 'Fajr 19° · Isha 17°', group: 'Pays', make: angles(19, 17) },
  { id: 'algeria', name: 'Algérie (Ministère des Affaires religieuses)', detail: 'Fajr 18° · Isha 17°', group: 'Pays', make: angles(18, 17) },
  { id: 'tunisia', name: 'Tunisie', detail: 'Fajr 18° · Isha 18°', group: 'Pays', make: angles(18, 18) },
  { id: 'turkey', name: 'Turquie (Diyanet)', detail: 'Fajr 18° · Isha 17°', group: 'Pays', make: () => CM.Turkey() },
  { id: 'dubai', name: 'Dubaï', detail: 'Fajr 18,2° · Isha 18,2°', group: 'Pays', make: () => CM.Dubai() },
  { id: 'kuwait', name: 'Koweït', detail: 'Fajr 18° · Isha 17,5°', group: 'Pays', make: () => CM.Kuwait() },
  { id: 'qatar', name: 'Qatar', detail: 'Fajr 18° · Isha 90 min', group: 'Pays', make: () => CM.Qatar() },
  { id: 'singapore', name: 'Singapour / Malaisie / Indonésie', detail: 'Fajr 20° · Isha 18°', group: 'Pays', make: () => CM.Singapore() },
  { id: 'tehran', name: 'Institut de géophysique, Téhéran', detail: 'Fajr 17,7° · Isha 14°', group: 'Pays', make: () => CM.Tehran() },
  { id: 'custom', name: 'Personnalisée', detail: 'Vos propres angles', group: 'Autre', make: null },
];
const METHOD_BY_ID = Object.fromEntries(METHODS.map((m) => [m.id, m]));

/** Méthode recommandée selon le pays (mode « Automatique ») */
const COUNTRY_METHOD = {
  FR: 'uoif', MC: 'uoif', RE: 'uoif', GP: 'uoif', MQ: 'uoif', GF: 'uoif', YT: 'uoif', NC: 'uoif', PF: 'uoif',
  BE: 'mwl', CH: 'mwl', LU: 'mwl', DE: 'mwl', NL: 'mwl', ES: 'mwl', IT: 'mwl', PT: 'mwl',
  MA: 'morocco', DZ: 'algeria', TN: 'tunisia', LY: 'egypt', EG: 'egypt', SD: 'egypt',
  SA: 'makkah', YE: 'makkah', BH: 'makkah', OM: 'makkah', AE: 'dubai', KW: 'kuwait', QA: 'qatar',
  TR: 'turkey', IR: 'tehran', PK: 'karachi', IN: 'karachi', BD: 'karachi', AF: 'karachi',
  US: 'isna', CA: 'isna', GB: 'moonsighting', IE: 'moonsighting',
  SG: 'singapore', MY: 'singapore', ID: 'singapore', BN: 'singapore',
};

function recommendedMethod(countryCode) {
  return COUNTRY_METHOD[(countryCode || '').toUpperCase()] || 'mwl';
}

function clampAdj(v) {
  const n = Math.round(Number(v) || 0);
  return Math.max(ADJ_MIN, Math.min(ADJ_MAX, n));
}

function clampAngle(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(25, n));
}

/** Construit les paramètres adhan à partir des réglages utilisateur. */
function buildParams(calc, location) {
  const methodId = calc.method === 'auto' ? recommendedMethod(location.countryCode) : calc.method;
  const method = METHOD_BY_ID[methodId] || METHOD_BY_ID.uoif;

  let params;
  if (method.id === 'custom') {
    const fajr = clampAngle(calc.custom?.fajr, 12);
    const interval = Math.max(0, Math.min(180, Math.round(Number(calc.custom?.ishaInterval) || 0)));
    const isha = clampAngle(calc.custom?.isha, 12);
    params = new CP('Other', fajr, interval > 0 ? 0 : isha, interval);
  } else {
    params = method.make();
  }

  params.madhab = calc.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;

  const coords = new Coordinates(location.lat, location.lon);
  const rules = {
    middle: HighLatitudeRule.MiddleOfTheNight,
    seventh: HighLatitudeRule.SeventhOfTheNight,
    twilight: HighLatitudeRule.TwilightAngle,
  };
  // « Automatique » : on garde les vrais angles tant qu'ils existent (comme Mawaqit),
  // le milieu de la nuit ne sert que de borne de sécurité. Au-delà de 55° on passe
  // à la méthode « angle du crépuscule », plus adaptée au Nord de l'Europe.
  const autoRule = Math.abs(location.lat) >= 55 ? HighLatitudeRule.TwilightAngle : HighLatitudeRule.MiddleOfTheNight;
  params.highLatitudeRule = rules[calc.highLatitude] || autoRule;
  params.polarCircleResolution = PolarCircleResolution.AqrabYaum;

  const adj = calc.adjustments || {};
  params.adjustments = {
    fajr: clampAdj(adj.fajr),
    sunrise: clampAdj(adj.sunrise),
    dhuhr: clampAdj(adj.dhuhr),
    asr: clampAdj(adj.asr),
    maghrib: clampAdj(adj.maghrib),
    isha: clampAdj(adj.isha),
  };

  return { params, coords, method };
}

/** Fuseau horaire IANA d'un point (hors-ligne). */
function timezoneFor(lat, lon) {
  try { return tzlookup(lat, lon); } catch { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
}

/** Année / mois / jour civils de `date` dans le fuseau `tz`. */
function datePartsIn(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function dayTimes(coords, params, y, m, d) {
  // adhan lit uniquement année/mois/jour de la date fournie.
  const pt = new PrayerTimes(coords, new Date(y, m - 1, d, 12), params);
  return PRAYERS.map((key) => ({ key, time: pt[key] instanceof Date && !isNaN(pt[key]) ? pt[key].getTime() : null }));
}

/**
 * Calcule les horaires d'hier, aujourd'hui et demain pour le lieu choisi,
 * « aujourd'hui » étant la date civile dans le fuseau du lieu.
 */
function computeSchedule(settings, now = new Date()) {
  const location = settings.location;
  const tz = location.tz || timezoneFor(location.lat, location.lon);
  const { params, coords, method } = buildParams(settings.calc, location);
  const { y, m, d } = datePartsIn(now, tz);
  return {
    tz,
    dateKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    yesterday: dayTimes(coords, params, y, m, d - 1),
    today: dayTimes(coords, params, y, m, d),
    tomorrow: dayTimes(coords, params, y, m, d + 1),
    method: { id: method.id, name: method.name, detail: method.detail },
    params: {
      fajrAngle: params.fajrAngle, ishaAngle: params.ishaAngle, ishaInterval: params.ishaInterval,
      madhab: params.madhab, highLatitudeRule: params.highLatitudeRule,
    },
  };
}

function publicMethods() {
  return METHODS.map(({ id, name, detail, group }) => ({ id, name, detail, group }));
}

module.exports = {
  PRAYERS, ADJ_MIN, ADJ_MAX, METHODS: publicMethods(), recommendedMethod,
  computeSchedule, timezoneFor, buildParams, datePartsIn,
};
