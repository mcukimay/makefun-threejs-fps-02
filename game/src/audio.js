// Every sound in the game is synthesized with WebAudio: no audio files ship, nothing
// loads over the network, and the same code runs offline. The context is created lazily
// on the first user gesture, so the page never needs autoplay permission up front.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(dur, filterType, freq, gain, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // weapon: 'rifle' | 'smg' | 'sniper' | 'shotgun' | 'pistol'
  const SHOT = {
    rifle: () => { noise(0.11, 'lowpass', 1400, 0.9); tone(150, 0.09, 'square', 0.25, 60); },
    smg: () => { noise(0.07, 'bandpass', 2200, 0.7); tone(190, 0.06, 'square', 0.18, 80); },
    sniper: () => { noise(0.22, 'lowpass', 900, 1.0); tone(110, 0.18, 'sawtooth', 0.3, 45); },
    shotgun: () => { noise(0.2, 'lowpass', 700, 1.0); tone(90, 0.14, 'sawtooth', 0.35, 40); },
    pistol: () => { noise(0.08, 'bandpass', 1800, 0.7); tone(170, 0.06, 'square', 0.2, 70); },
  };

  return {
    unlock() { ensure(); },
    shot(weapon) { (SHOT[weapon] || SHOT.rifle)(); },
    distantShot() { noise(0.14, 'lowpass', 500, 0.22); },
    dryFire() { tone(1200, 0.03, 'square', 0.12); },
    reload() { tone(900, 0.04, 'square', 0.14); tone(620, 0.05, 'square', 0.16, 0, 0.32); },
    hit() { tone(1900, 0.05, 'square', 0.16); },
    kill() { tone(1500, 0.06, 'square', 0.18); tone(2200, 0.09, 'square', 0.18, 0, 0.07); },
    hurt() { tone(220, 0.12, 'sawtooth', 0.2, 90); },
    explosion() {
      noise(0.9, 'lowpass', 320, 1.0);
      tone(70, 0.8, 'sine', 0.9, 28);
      noise(0.3, 'highpass', 3000, 0.25);
    },
    beep(freq = 1100) { tone(freq, 0.09, 'square', 0.2); },
    plantTick() { tone(1400, 0.05, 'square', 0.14); },
    defuseTick() { tone(1000, 0.05, 'square', 0.14); },
    roundWin() { tone(523, 0.14, 'triangle', 0.25); tone(659, 0.14, 'triangle', 0.25, 0, 0.14); tone(784, 0.3, 'triangle', 0.28, 0, 0.28); },
    roundLose() { tone(392, 0.16, 'triangle', 0.22); tone(311, 0.16, 'triangle', 0.22, 0, 0.16); tone(233, 0.34, 'triangle', 0.24, 0, 0.32); },
    buy() { tone(880, 0.05, 'square', 0.14); tone(1320, 0.07, 'square', 0.14, 0, 0.05); },
    denied() { tone(220, 0.12, 'square', 0.16); },
    footstep() { noise(0.05, 'lowpass', 400, 0.07); },
    grenadePin() { tone(1600, 0.03, 'square', 0.12); tone(1200, 0.03, 'square', 0.12, 0, 0.06); },
  };
}
