// Tiny synthesized sound effects (no audio files).
let ctx = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, type, gain, slideTo) {
  if (!ctx || ctx.state !== 'running') return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

export function play(event) {
  if (event.type === 'kick') tone(150 + event.power * 80, 0.09, 'triangle', 0.25 + event.power * 0.3, 60);
  else if (event.type === 'tackle') tone(90, 0.12, 'square', 0.12, 50);
  else if (event.type === 'save') tone(220, 0.1, 'triangle', 0.25, 110);
  else if (event.type === 'whistle') {
    tone(2100, event.final ? 0.9 : 0.35, 'square', 0.07);
  } else if (event.type === 'goal') {
    tone(2100, 0.5, 'square', 0.07);
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.2), 150 + i * 110));
  }
}
