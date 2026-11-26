/**
 * Focus-first procedural Web Audio SFX engine.
 * Tuned to warm, low-passed pentatonic acoustics and subtle felt-hammer micro-ticks
 * so every interaction feels crisp, energizing, and non-distracting.
 */

export const SFX_CUES = [
  'tick',
  'select',
  'drawerOpen',
  'drawerClose',
  'sweepOn',
  'sweepOff',
  'complete',
  'uncheck',
  'create',
  'levelUp',
  'paperStab',
  'paperTear',
  'holePunch',
  'swipeKeep',
  'swipeArchive',
  'delete',
  'graphOpen',
  'mascotOpen',
  'mascotBye',
  'alert',
  'recStart',
  'recStop',
];

const CUE_COOLDOWN_MS = {
  tick: 45,
  select: 55,
  drawerOpen: 110,
  drawerClose: 110,
  sweepOn: 120,
  sweepOff: 120,
  complete: 65,
  uncheck: 55,
  create: 80,
  levelUp: 240,
  paperStab: 55,
  paperTear: 38,
  holePunch: 90,
  swipeKeep: 70,
  swipeArchive: 70,
  delete: 80,
  graphOpen: 90,
  mascotOpen: 100,
  mascotBye: 180,
  alert: 180,
  recStart: 90,
  recStop: 90,
};

export function createSoundFXEngine(options = {}) {
  const getAudioContextCtor =
    options.getAudioContextCtor ||
    (() => (typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null));
  const nowMsFn = options.nowMs || (() => Date.now());

  let enabled = options.enabled !== false;
  let masterVolume = typeof options.masterVolume === 'number' ? options.masterVolume : 0.42;
  let ctx = null;
  let masterGain = null;
  let noiseBuffer = null;
  const lastPlayedAt = Object.create(null);

  function ensureContext() {
    if (!enabled) return null;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    if (!ctx) {
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        ctx.resume();
      } catch (_) {}
    }
    return ctx;
  }

  function ensureNoiseBuffer(audioCtx) {
    if (noiseBuffer && noiseBuffer.sampleRate === audioCtx.sampleRate) return noiseBuffer;
    const length = Math.floor(audioCtx.sampleRate * 0.18);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // Soft pink-ish smoothed noise so swooshes/paper rustles stay warm, never harsh
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.92 * b0 + white * 0.08;
      b1 = 0.72 * b1 + white * 0.28;
      data[i] = (b0 + b1) * 0.6;
    }
    noiseBuffer = buffer;
    return buffer;
  }

  function playTone(audioCtx, cfg) {
    const startAt = audioCtx.currentTime + (cfg.delay || 0);
    const dur = cfg.duration || 0.09;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    let dest = masterGain;

    if (cfg.filterFreq) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = cfg.filterType || 'lowpass';
      filter.frequency.setValueAtTime(cfg.filterFreq, startAt);
      if (cfg.filterEndFreq) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, cfg.filterEndFreq), startAt + dur);
      }
      filter.connect(masterGain);
      dest = filter;
    }

    osc.type = cfg.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(40, cfg.freq), startAt);
    if (cfg.endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, cfg.endFreq), startAt + dur);
    }
    if (cfg.midFreq && cfg.midTime) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, cfg.midFreq), startAt + cfg.midTime);
      if (cfg.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, cfg.endFreq), startAt + dur);
      }
    }

    const peak = Math.max(0.001, cfg.gain || 0.12);
    const attack = Math.min(dur * 0.35, cfg.attack || 0.008);
    gain.gain.setValueAtTime(0.0008, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, startAt + dur);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.012);
  }

  function playFilteredNoise(audioCtx, cfg) {
    const startAt = audioCtx.currentTime + (cfg.delay || 0);
    const dur = cfg.duration || 0.08;
    const src = audioCtx.createBufferSource();
    src.buffer = ensureNoiseBuffer(audioCtx);

    const filter = audioCtx.createBiquadFilter();
    filter.type = cfg.filterType || 'bandpass';
    filter.Q.setValueAtTime(cfg.q || 1.4, startAt);
    filter.frequency.setValueAtTime(Math.max(80, cfg.freq || 700), startAt);
    if (cfg.endFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, cfg.endFreq), startAt + dur);
    }

    const gain = audioCtx.createGain();
    const peak = Math.max(0.001, cfg.gain || 0.06);
    gain.gain.setValueAtTime(0.0008, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + Math.min(0.02, dur * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0008, startAt + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start(startAt);
    src.stop(startAt + dur + 0.015);
  }

  function play(cue, opts = {}) {
    if (!enabled) return false;
    if (!SFX_CUES.includes(cue)) return false;

    const nowMs = nowMsFn();
    const cooldown = CUE_COOLDOWN_MS[cue] || 50;
    if (!opts.bypassCooldown && lastPlayedAt[cue] && nowMs - lastPlayedAt[cue] < cooldown) {
      return false;
    }
    lastPlayedAt[cue] = nowMs;

    try {
      const audioCtx = ensureContext();
      if (!audioCtx) return false;

      switch (cue) {
        case 'tick':
          playTone(audioCtx, { type: 'sine', freq: 310, endFreq: 185, duration: 0.028, gain: 0.14, attack: 0.004, filterFreq: 1100 });
          break;

        case 'select':
          playTone(audioCtx, { type: 'triangle', freq: 523.25, endFreq: 554.37, duration: 0.055, gain: 0.16, attack: 0.005, filterFreq: 1650 });
          break;

        case 'drawerOpen':
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 340, endFreq: 760, q: 1.6, duration: 0.15, gain: 0.11 });
          playTone(audioCtx, { type: 'sine', freq: 261.63, endFreq: 392.0, duration: 0.13, gain: 0.075, attack: 0.02, filterFreq: 1200 });
          break;

        case 'drawerClose':
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 620, endFreq: 280, q: 1.5, duration: 0.13, gain: 0.095 });
          playTone(audioCtx, { type: 'sine', freq: 349.23, endFreq: 233.08, duration: 0.11, gain: 0.065, attack: 0.015, filterFreq: 1000 });
          break;

        case 'sweepOn':
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 420, endFreq: 1150, q: 2.0, duration: 0.22, gain: 0.09 });
          playTone(audioCtx, { type: 'sine', freq: 523.25, duration: 0.18, gain: 0.12, attack: 0.025, filterFreq: 1900 });
          playTone(audioCtx, { type: 'triangle', freq: 783.99, delay: 0.075, duration: 0.22, gain: 0.1, attack: 0.02, filterFreq: 2100 });
          break;

        case 'sweepOff':
          playTone(audioCtx, { type: 'sine', freq: 659.25, endFreq: 440.0, duration: 0.14, gain: 0.095, attack: 0.012, filterFreq: 1500 });
          break;

        case 'complete':
          // Crisp bubbly focus pop + warm pentatonic fifth chime
          playTone(audioCtx, { type: 'sine', freq: 330, midFreq: 920, midTime: 0.058, endFreq: 165, duration: 0.125, gain: 0.34, attack: 0.008 });
          playTone(audioCtx, { type: 'triangle', freq: 659.25, delay: 0.04, duration: 0.21, gain: 0.16, attack: 0.012, filterFreq: 2400 });
          playTone(audioCtx, { type: 'triangle', freq: 987.77, delay: 0.082, duration: 0.24, gain: 0.13, attack: 0.012, filterFreq: 2600 });
          break;

        case 'uncheck':
          playTone(audioCtx, { type: 'sine', freq: 260, endFreq: 175, duration: 0.06, gain: 0.13, attack: 0.006, filterFreq: 900 });
          break;

        case 'create':
          playTone(audioCtx, { type: 'triangle', freq: 523.25, duration: 0.11, gain: 0.16, attack: 0.008, filterFreq: 2000 });
          playTone(audioCtx, { type: 'triangle', freq: 783.99, delay: 0.055, duration: 0.16, gain: 0.15, attack: 0.008, filterFreq: 2300 });
          break;

        case 'levelUp':
          // Uplifting warm marimba pentatonic triad (C5 -> E5 -> G5 -> C6)
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
            playTone(audioCtx, {
              type: 'triangle',
              freq,
              delay: idx * 0.068,
              duration: idx === 3 ? 0.34 : 0.2,
              gain: idx === 3 ? 0.17 : 0.14,
              attack: 0.01,
              filterFreq: 2600,
            });
          });
          break;

        case 'paperStab':
          playFilteredNoise(audioCtx, { filterType: 'highpass', freq: 1400, endFreq: 900, q: 0.9, duration: 0.055, gain: 0.095 });
          playTone(audioCtx, { type: 'sine', freq: 210, endFreq: 96, delay: 0.02, duration: 0.075, gain: 0.22, attack: 0.004, filterFreq: 800 });
          break;

        case 'paperTear':
          // Crisp, short, dry small-page flip / flick (inspired by small notebook/calendar page turn)
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 1850, endFreq: 3150, q: 1.5, duration: 0.046, gain: 0.145 });
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 2550, endFreq: 1220, q: 1.65, delay: 0.018, duration: 0.072, gain: 0.175 });
          playFilteredNoise(audioCtx, { filterType: 'highpass', freq: 2200, endFreq: 1380, q: 0.9, delay: 0.044, duration: 0.052, gain: 0.068 });
          playTone(audioCtx, { type: 'triangle', freq: 620, endFreq: 940, delay: 0.01, duration: 0.038, gain: 0.022, attack: 0.004, filterFreq: 1800 });
          break;

        case 'holePunch':
          // Mechanical steel jaw click + crisp cardstock punch-through shear + solid anvil thud + subtle spring return
          playTone(audioCtx, { type: 'triangle', freq: 1380, endFreq: 760, duration: 0.022, gain: 0.14, attack: 0.002, filterFreq: 2800 });
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 2100, endFreq: 780, q: 1.35, delay: 0.01, duration: 0.046, gain: 0.2 });
          playTone(audioCtx, { type: 'sine', freq: 235, endFreq: 74, delay: 0.012, duration: 0.068, gain: 0.3, attack: 0.003, filterFreq: 720 });
          playTone(audioCtx, { type: 'sine', freq: 640, endFreq: 450, delay: 0.072, duration: 0.026, gain: 0.065, attack: 0.004, filterFreq: 1600 });
          break;

        case 'swipeKeep':
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 500, endFreq: 1100, q: 1.5, duration: 0.085, gain: 0.09 });
          playTone(audioCtx, { type: 'sine', freq: 587.33, endFreq: 783.99, delay: 0.015, duration: 0.09, gain: 0.12, attack: 0.008, filterFreq: 2000 });
          break;

        case 'swipeArchive':
          playFilteredNoise(audioCtx, { filterType: 'bandpass', freq: 650, endFreq: 300, q: 1.4, duration: 0.085, gain: 0.08 });
          playTone(audioCtx, { type: 'sine', freq: 330, endFreq: 240, duration: 0.075, gain: 0.1, attack: 0.008, filterFreq: 1100 });
          break;

        case 'delete':
          playTone(audioCtx, { type: 'sine', freq: 220, endFreq: 118, duration: 0.11, gain: 0.19, attack: 0.006, filterFreq: 750 });
          break;

        case 'graphOpen':
          playTone(audioCtx, { type: 'sine', freq: 587.33, duration: 0.12, gain: 0.14, attack: 0.008, filterFreq: 2100 });
          playTone(audioCtx, { type: 'triangle', freq: 880.0, delay: 0.05, duration: 0.19, gain: 0.12, attack: 0.01, filterFreq: 2400 });
          break;

        case 'mascotOpen':
          playTone(audioCtx, { type: 'sine', freq: 587.33, endFreq: 659.25, duration: 0.09, gain: 0.13, attack: 0.008, filterFreq: 1900 });
          playTone(audioCtx, { type: 'sine', freq: 783.99, delay: 0.05, duration: 0.12, gain: 0.11, attack: 0.01, filterFreq: 2100 });
          break;

        case 'mascotBye':
          // Gentle warm two-note descending "bye-bye"
          playTone(audioCtx, { type: 'sine', freq: 783.99, endFreq: 740, duration: 0.11, gain: 0.14, attack: 0.01, filterFreq: 2000 });
          playTone(audioCtx, { type: 'sine', freq: 659.25, endFreq: 587.33, delay: 0.105, duration: 0.18, gain: 0.12, attack: 0.012, filterFreq: 1800 });
          break;

        case 'alert':
          playTone(audioCtx, { type: 'sine', freq: 880.0, duration: 0.18, gain: 0.11, attack: 0.01, filterFreq: 2400 });
          playTone(audioCtx, { type: 'sine', freq: 1318.5, delay: 0.06, duration: 0.22, gain: 0.08, attack: 0.012, filterFreq: 2600 });
          break;

        case 'recStart':
          playTone(audioCtx, { type: 'sine', freq: 659.25, endFreq: 783.99, duration: 0.095, gain: 0.14, attack: 0.008, filterFreq: 2000 });
          break;

        case 'recStop':
          playTone(audioCtx, { type: 'sine', freq: 659.25, endFreq: 523.25, duration: 0.1, gain: 0.13, attack: 0.008, filterFreq: 1800 });
          break;
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    play,
    isEnabled: () => enabled,
    setEnabled(next) {
      enabled = Boolean(next);
      return enabled;
    },
    setMasterVolume(vol) {
      masterVolume = Math.max(0, Math.min(1, Number(vol) || 0));
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      }
    },
    unlock() {
      return Boolean(ensureContext());
    },
  };
}
