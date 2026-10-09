

// Sound: rain is looping filtered noise, thunder a low noise burst. Made with Web Audio, no files.
export const sound = { ctx: null, rain: null, noise: null, on: true };
export function initSound() {
  if (sound.ctx || !sound.on) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC(), n = ctx.sampleRate * 3, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) { // pink-ish noise
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.17;
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(hp).connect(gain).connect(ctx.destination);
  src.start();
  Object.assign(sound, { ctx, rain: gain, noise: buf });
}
export function setSound(on) {
  sound.on = on;
  if (on) initSound();
  if (sound.ctx) on ? sound.ctx.resume() : sound.ctx.suspend();
}
export function thunder(delay, strength) {
  const ctx = sound.ctx;
  if (!ctx || !sound.on) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = sound.noise; src.playbackRate.value = 0.3;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180 + strength * 120;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.6 * strength, t + 0.06 + delay * 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 + strength * 2);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(t, Math.random() * 2); src.stop(t + 5);
}
