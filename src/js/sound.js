/*
 * Carillon sobre généré en temps réel (Web Audio) : aucune piste audio,
 * trois notes douces façon cloche avec une légère réverbération.
 */
(() => {
  let ctx;

  function context() {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function impulse(ac, seconds = 2.6, decay = 3.2) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function bell(ac, out, freq, at, gain = 0.5, length = 2.6) {
    // Partiels légèrement inharmoniques → timbre de petite cloche
    const partials = [[1, 1], [2.01, 0.32], [3.0, 0.12], [4.17, 0.05]];
    for (const [ratio, amp] of partials) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const peak = gain * amp;
      const len = length / (1 + (ratio - 1) * 0.6);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + len + 0.05);
    }
  }

  /* Note simple avec enveloppe (attaque / extinction exponentielle) */
  function tone(ac, out, { freq, at, gain = 0.4, attack = 0.01, length = 1.5, type = 'sine', glideTo = null, detune = 0 }) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + Math.min(0.25, length));
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  /* Corde pincée douce (harpe) : triangle filtré qui s'assombrit en s'éteignant */
  function pluck(ac, out, freq, at, gain = 0.35, length = 1.8) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 6, at);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.5, at + length);
    lp.connect(out);
    tone(ac, lp, { freq, at, gain, attack: 0.005, length, type: 'triangle' });
    tone(ac, lp, { freq: freq * 2, at, gain: gain * 0.25, attack: 0.005, length: length * 0.5 });
  }

  /*
   * Sons proposés à l'heure de la prière. Chacun a une version complète
   * (heure de la prière) et une version courte (rappel, Chourouq).
   */
  const TONES = {
    carillon(ac, bus, t, short) {
      // Do5 – Sol5 – Do6 : accord ouvert, calme
      if (short) return bell(ac, bus, 783.99, t, 0.35, 2.2);
      bell(ac, bus, 523.25, t, 0.5, 2.8);
      bell(ac, bus, 783.99, t + 0.38, 0.42, 2.8);
      bell(ac, bus, 1046.5, t + 0.76, 0.34, 3.2);
    },
    cristal(ac, bus, t, short) {
      // Deux notes aiguës de verre, très légères
      const glass = (f, at, g) => {
        tone(ac, bus, { freq: f, at, gain: g, attack: 0.004, length: 1.8 });
        tone(ac, bus, { freq: f * 2.76, at, gain: g * 0.12, attack: 0.004, length: 0.6 });
      };
      glass(1318.5, t, 0.48);
      if (!short) glass(1975.5, t + 0.22, 0.36);
    },
    harpe(ac, bus, t, short) {
      // Arpège montant Do – Mi – Sol – Do
      const notes = short ? [659.25, 783.99] : [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => pluck(ac, bus, f, t + i * 0.13, 0.32, 1.9));
    },
    bol(ac, bus, t, short) {
      // Bol chantant : note grave avec un léger battement
      const len = short ? 2.2 : 3.6;
      tone(ac, bus, { freq: 293.66, at: t, gain: 0.42, attack: 0.03, length: len });
      tone(ac, bus, { freq: 293.66, at: t, gain: 0.3, attack: 0.03, length: len, detune: 7 });
      tone(ac, bus, { freq: 293.66 * 2.71, at: t, gain: 0.09, attack: 0.02, length: len * 0.6 });
      tone(ac, bus, { freq: 293.66 * 5.1, at: t, gain: 0.03, attack: 0.01, length: len * 0.3 });
    },
    goutte(ac, bus, t, short) {
      // Gouttes d'eau : petites notes qui glissent vers le grave
      const drop = (f, at, g) => tone(ac, bus, { freq: f, glideTo: f * 0.55, at, gain: g, attack: 0.004, length: 0.45 });
      drop(1400, t, 0.6);
      if (!short) { drop(1750, t + 0.28, 0.45); drop(1180, t + 0.62, 0.5); }
    },
    aube(ac, bus, t, short) {
      // Accord tenu qui monte doucement puis s'efface (La – Do# – Mi)
      const len = short ? 1.8 : 3.2;
      [440, 554.37, 659.25].forEach((f, i) => {
        tone(ac, bus, { freq: f, at: t + i * 0.08, gain: 0.16, attack: 0.5, length: len });
        tone(ac, bus, { freq: f, at: t + i * 0.08, gain: 0.08, attack: 0.5, length: len, detune: -6 });
      });
    },
  };

  function play({ kind = 'adhan', volume = 0.6, tone: name = 'carillon' } = {}) {
    const ac = context();
    const master = ac.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume)) * 0.55;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp).connect(ac.destination);

    const verb = ac.createConvolver();
    verb.buffer = impulse(ac);
    const wet = ac.createGain();
    wet.gain.value = 0.28;
    verb.connect(wet).connect(master);

    const bus = ac.createGain();
    bus.connect(master);
    bus.connect(verb);

    const t = ac.currentTime + 0.05;
    (TONES[name] || TONES.carillon)(ac, bus, t, kind === 'soft');
  }

  window.Chime = { play, tones: Object.keys(TONES) };
})();
