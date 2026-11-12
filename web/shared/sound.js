// Synthesised cues (Web Audio), so no audio files are needed.

let ctx = null;
let master = null;
let reverb = null;

function setup() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.connect(ctx.destination);
  reverb = ctx.createConvolver();
  reverb.buffer = impulse(3.6, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet).connect(master);
  return ctx;
}

function impulse(seconds, decay) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

function noise(seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  return node;
}

function out(dry = 1) {
  const gain = ctx.createGain();
  const dryGain = ctx.createGain();
  dryGain.gain.value = dry;
  gain.connect(dryGain).connect(master);
  gain.connect(reverb);
  return gain;
}

function envelope(param, t, attack, peak, release) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

export function unlock() {
  const c = setup();
  if (c && c.state === "suspended") c.resume();
}

export function setVolume(percent) {
  if (!setup()) return;
  master.gain.value = Math.pow(Math.max(0, Math.min(100, percent)) / 100, 1.6);
}

/** Low impact and a dark swelling chord. */
export function playDeath() {
  if (!setup()) return;
  unlock();
  const t = ctx.currentTime + 0.02;
  const bus = out(0.9);

  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(70, t);
  thump.frequency.exponentialRampToValueAtTime(34, t + 1.4);
  const thumpGain = ctx.createGain();
  envelope(thumpGain.gain, t, 0.01, 0.9, 2.2);
  thump.connect(thumpGain).connect(bus);
  thump.start(t);
  thump.stop(t + 2.5);

  const dust = noise(2.5);
  const dustFilter = ctx.createBiquadFilter();
  dustFilter.type = "lowpass";
  dustFilter.frequency.setValueAtTime(900, t);
  dustFilter.frequency.exponentialRampToValueAtTime(120, t + 2);
  const dustGain = ctx.createGain();
  envelope(dustGain.gain, t, 0.02, 0.25, 1.8);
  dust.connect(dustFilter).connect(dustGain).connect(bus);
  dust.start(t);

  const chord = [55, 82.4, 103.8, 116.5];
  const pad = ctx.createBiquadFilter();
  pad.type = "lowpass";
  pad.frequency.value = 520;
  const padGain = ctx.createGain();
  envelope(padGain.gain, t + 0.15, 0.9, 0.16, 3.2);
  pad.connect(padGain).connect(bus);
  for (const f of chord) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    osc.detune.value = (Math.random() - 0.5) * 14;
    osc.connect(pad);
    osc.start(t);
    osc.stop(t + 4.6);
  }
}

/** Bright, slow bloom of overtones. */
export function playFelled(great = false) {
  if (!setup()) return;
  unlock();
  const t = ctx.currentTime + 0.02;
  const bus = out(0.7);
  const base = great ? 196 : 220;
  const partials = [1, 1.5, 2, 2.52, 3, 4];
  partials.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 ? "triangle" : "sine";
    osc.frequency.value = base * ratio;
    const gain = ctx.createGain();
    envelope(gain.gain, t + i * 0.06, 0.5, 0.12 / (1 + i * 0.4), great ? 5.5 : 4);
    osc.connect(gain).connect(bus);
    osc.start(t);
    osc.stop(t + 7);
  });
  const shimmer = noise(3);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 5200;
  band.Q.value = 3;
  const shimmerGain = ctx.createGain();
  envelope(shimmerGain.gain, t + 0.2, 1.2, 0.05, 1.6);
  shimmer.connect(band).connect(shimmerGain).connect(bus);
  shimmer.start(t);
}

/** Deep drone swell for a boss announcement. */
export function playBoss() {
  if (!setup()) return;
  unlock();
  const t = ctx.currentTime + 0.02;
  const bus = out(0.8);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180, t);
  filter.frequency.exponentialRampToValueAtTime(900, t + 1.6);
  filter.frequency.exponentialRampToValueAtTime(200, t + 3.4);
  const gain = ctx.createGain();
  envelope(gain.gain, t, 1.2, 0.2, 2.4);
  filter.connect(gain).connect(bus);
  for (const f of [41.2, 61.7, 82.4, 123.5]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + 4);
  }
}
