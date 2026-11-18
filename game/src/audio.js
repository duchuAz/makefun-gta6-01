// Every sound is synthesised with WebAudio at runtime: no files, no network. The engine is
// two detuned oscillators whose pitch follows speed; the siren is a two-tone LFO; guns are
// shaped noise bursts; and a small step sequencer turns each radio station's scale into a
// loop. The context is created on the first click, as browsers require.
import { RADIO } from './config.js';
import { clamp, rng } from './math.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let enabled = true;
  let started = false;
  let station = 0;
  let radioOn = true;
  let ambientOn = false;

  let engineOscA = null;
  let engineOscB = null;
  let engineGain = null;
  let engineFilter = null;
  let skidSource = null;
  let skidGain = null;
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;

  let noiseBuffer = null;
  let nextNote = 0;
  let step = 0;
  let musicTimer = null;
  let tempoScale = 1;

  const random = rng(77);

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.55 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.24;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);
    noiseBuffer = makeNoise(ctx, 2.2);
    started = true;
    startMusicClock();
    return ctx;
  }

  function makeNoise(ac, seconds) {
    const length = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    return buffer;
  }

  function noiseHit({ duration = 0.16, gain = 0.5, filter = 1800, type = 'lowpass', q = 0.8, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(120, filter * 0.28), t + duration);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function tone({ freq = 440, end = 0, duration = 0.2, gain = 0.18, type = 'sine', when = 0, bus = sfxBus }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (end > 0) osc.frequency.exponentialRampToValueAtTime(end, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function startEngine() {
    if (!ctx || engineOscA) return;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineFilter.Q.value = 3.5;
    engineOscA = ctx.createOscillator();
    engineOscA.type = 'sawtooth';
    engineOscB = ctx.createOscillator();
    engineOscB.type = 'square';
    engineOscA.frequency.value = 48;
    engineOscB.frequency.value = 72;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    engineOscA.connect(engineFilter);
    engineOscB.connect(bGain).connect(engineFilter);
    engineFilter.connect(engineGain).connect(sfxBus);
    engineOscA.start();
    engineOscB.start();
  }

  function setEngine(active, speed = 0, throttle = 0) {
    if (!ctx || !engineGain) {
      if (active) startEngine();
      if (!engineGain) return;
    }
    const norm = clamp(speed, 0, 1);
    const target = active ? 0.055 + norm * 0.075 + throttle * 0.02 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    const rpm = 42 + norm * 120 + throttle * 12;
    engineOscA.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
    engineOscB.frequency.setTargetAtTime(rpm * 1.49, ctx.currentTime, 0.1);
    engineFilter.frequency.setTargetAtTime(260 + norm * 900 + throttle * 180, ctx.currentTime, 0.11);
  }

  function startSkid() {
    if (!ctx || skidSource) return;
    skidSource = ctx.createBufferSource();
    skidSource.buffer = noiseBuffer;
    skidSource.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 980;
    f.Q.value = 1.1;
    skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSource.connect(f).connect(skidGain).connect(sfxBus);
    skidSource.start();
  }

  function setSkid(on) {
    if (on) startSkid();
    if (skidGain) skidGain.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 0.06);
  }

  function startSiren() {
    if (!ctx || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 680;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'triangle';
    sirenLfo.frequency.value = 0.42;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(sfxBus);
    sirenOsc.start();
    sirenLfo.start();
  }

  function setSiren(on, intensity = 1) {
    if (on) startSiren();
    if (sirenGain) sirenGain.gain.setTargetAtTime(on ? 0.028 + intensity * 0.02 : 0, ctx.currentTime, 0.12);
  }

  function startMusicClock() {
    if (musicTimer) return;
    musicTimer = setInterval(() => {
      if (!ctx || !ambientOn || !radioOn || !enabled) return;
      scheduleMusic();
    }, 110);
  }

  function scheduleMusic() {
    if (!ctx) return;
    const stationDef = RADIO[station];
    const spb = 60 / (stationDef.bpm * tempoScale);
    const lookahead = ctx.currentTime + 0.55;
    if (nextNote < ctx.currentTime - 0.2) nextNote = ctx.currentTime + 0.06;
    while (nextNote < lookahead) {
      playStep(step, nextNote, stationDef, spb);
      nextNote += spb * 0.5;
      step = (step + 1) % 32;
    }
  }

  function midiToHz(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function playStep(s, when, stationDef, spb) {
    const scale = stationDef.scale;
    const rootMidi = stationDef.root;
    const bar = Math.floor(s / 8) % 4;
    const stepInBar = s % 8;
    const bus = musicBus;
    // Bass on the bar's root, with a pick-up on the last eighth.
    if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6) {
      const note = rootMidi + scale[(bar * 2) % scale.length] + (stepInBar === 6 ? 12 : 0);
      tone({ freq: midiToHz(note - 12), duration: spb * 1.4, gain: 0.16, type: 'sawtooth', when: when - ctx.currentTime, bus });
    }
    // Pad chord on each bar.
    if (stepInBar === 0) {
      for (let k = 0; k < 3; k++) {
        const note = rootMidi + scale[(bar + k * 2) % scale.length];
        tone({ freq: midiToHz(note), duration: spb * 7.6, gain: 0.035, type: 'triangle', when: when - ctx.currentTime, bus });
      }
    }
    // Arpeggio sparkle, sparse and station-coloured.
    if ((s + bar) % 3 === 0 || (stationDef.bpm > 110 && stepInBar % 2 === 0)) {
      const note = rootMidi + 12 + scale[Math.floor(random() * scale.length)] + (stepInBar > 4 ? 12 : 0);
      tone({ freq: midiToHz(note), duration: spb * 0.7, gain: 0.04, type: 'sine', when: when - ctx.currentTime, bus });
    }
    // Soft kick and brushed hat for the faster stations.
    if (stationDef.bpm >= 100) {
      if (stepInBar === 0 || stepInBar === 4) tone({ freq: 120, end: 44, duration: 0.16, gain: 0.13, type: 'sine', when: when - ctx.currentTime, bus });
      if (stepInBar % 2 === 1) noiseHit({ duration: 0.035, gain: 0.018, filter: 7000, type: 'highpass', when: when - ctx.currentTime });
    }
  }

  const api = {
    ensure,
    get enabled() { return enabled; },
    get station() { return RADIO[station]; },
    get stationIndex() { return station; },
    get radioOn() { return radioOn; },
    setEnabled(on) {
      enabled = on;
      if (master && ctx) master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05);
      if (on) ensure();
    },
    toggle() { api.setEnabled(!enabled); return enabled; },
    setRadio(on) { radioOn = on; if (!on) { for (const g of [musicBus]) if (g && ctx) g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } else if (musicBus && ctx) { musicBus.gain.setTargetAtTime(0.24, ctx.currentTime, 0.1); } },
    setAmbient(on) { ambientOn = on; },
    nextStation(dir = 1) {
      station = (station + dir + RADIO.length) % RADIO.length;
      step = 0;
      nextNote = ctx ? ctx.currentTime + 0.04 : 0;
      api.ui(1);
      return RADIO[station];
    },
    setStation(index) {
      station = ((index % RADIO.length) + RADIO.length) % RADIO.length;
      step = 0;
      nextNote = ctx ? ctx.currentTime + 0.04 : 0;
    },
    setEngine,
    setSkid,
    setSiren,
    gunshot(kind = 'pistol') {
      if (!ctx) return;
      if (kind === 'smg') {
        noiseHit({ duration: 0.09, gain: 0.34, filter: 2600, q: 1.2 });
        tone({ freq: 180, end: 70, duration: 0.07, gain: 0.15, type: 'square' });
      } else if (kind === 'pistol') {
        noiseHit({ duration: 0.18, gain: 0.55, filter: 2000, q: 0.9 });
        tone({ freq: 150, end: 55, duration: 0.13, gain: 0.23, type: 'triangle' });
        noiseHit({ duration: 0.05, gain: 0.2, filter: 5200, type: 'highpass' });
      }
    },
    punch() {
      noiseHit({ duration: 0.09, gain: 0.35, filter: 480, q: 2 });
      tone({ freq: 96, end: 48, duration: 0.12, gain: 0.26, type: 'sine' });
    },
    explosion() {
      if (!ctx) return;
      noiseHit({ duration: 0.9, gain: 0.8, filter: 900, q: 0.6 });
      noiseHit({ duration: 0.4, gain: 0.5, filter: 320, q: 1.4 });
      tone({ freq: 70, end: 28, duration: 0.7, gain: 0.4, type: 'sawtooth' });
    },
    impact() {
      noiseHit({ duration: 0.13, gain: 0.4, filter: 1400, q: 1 });
      tone({ freq: 90, end: 40, duration: 0.14, gain: 0.2, type: 'square' });
    },
    ui(dir = 0) {
      tone({ freq: dir < 0 ? 380 : 520, end: 700, duration: 0.07, gain: 0.07, type: 'sine' });
    },
    pickup() {
      if (!ctx) return;
      tone({ freq: 660, duration: 0.1, gain: 0.1, type: 'sine' });
      tone({ freq: 990, duration: 0.14, gain: 0.08, type: 'sine', when: 0.08 });
    },
    cash() {
      if (!ctx) return;
      tone({ freq: 880, duration: 0.09, gain: 0.09, type: 'triangle' });
      tone({ freq: 1320, duration: 0.16, gain: 0.07, type: 'triangle', when: 0.07 });
    },
    wantedUp() {
      if (!ctx) return;
      tone({ freq: 240, end: 330, duration: 0.16, gain: 0.13, type: 'square' });
      tone({ freq: 330, end: 460, duration: 0.2, gain: 0.1, type: 'square', when: 0.12 });
    },
    busted() {
      if (!ctx) return;
      tone({ freq: 420, end: 90, duration: 1.1, gain: 0.22, type: 'sawtooth' });
      noiseHit({ duration: 0.5, gain: 0.3, filter: 800 });
    },
    missionComplete() {
      if (!ctx) return;
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone({ freq: f, duration: 0.32, gain: 0.1, type: 'triangle', when: i * 0.13 }));
    },
    damage() {
      if (!ctx) return;
      noiseHit({ duration: 0.12, gain: 0.2, filter: 380, q: 2 });
    },
    horn() {
      if (!ctx) return;
      tone({ freq: 330, duration: 0.32, gain: 0.08, type: 'square' });
      tone({ freq: 415, duration: 0.32, gain: 0.06, type: 'square' });
    },
    stopAll() {
      api.setEngine(false);
      api.setSkid(false);
      api.setSiren(false);
    },
  };
  return api;
}

