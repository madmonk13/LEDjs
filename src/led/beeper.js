// The handhelds' sound: a piezo buzzer driven with square waves. Games queue
// tones and tunes; the samples go into a ring buffer that AudioOut drains.

export const SAMPLE_RATE = 22050;
const LEVEL = 0.22;

// Note names to frequencies, for writing tunes: 'c5', 'f#4', 'r' (rest).
const SEMI = { c: -9, d: -7, e: -5, f: -4, g: -2, a: 0, b: 2 };
export function noteFreq(name) {
  if (name === 'r') return 0;
  const m = /^([a-g])(#|b)?(\d)$/.exec(name);
  if (!m) return 0;
  const n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12;
  return 440 * 2 ** (n / 12);
}

export class Beeper {
  constructor() {
    this.buffer = new Float32Array(1 << 15);
    this.readPos = 0;
    this.writePos = 0;
    this.queue = [];       // { freq, samples }
    this.cur = null;
    this.phase = 0;
    this.carry = 0;
    this.lp = 0;
  }

  // Play a tone now, replacing whatever was playing.
  tone(freq, ms) { this.play([[freq, ms]]); }

  // A tune: [[freq or note name, ms], ...], replacing whatever was playing.
  play(notes) {
    this.queue = notes.map(([f, ms]) => ({ freq: typeof f === 'string' ? noteFreq(f) : f, samples: Math.round(ms * SAMPLE_RATE / 1000) }));
    this.cur = null;
  }

  // Add to the end of what's playing.
  then(notes) {
    for (const [f, ms] of notes) this.queue.push({ freq: typeof f === 'string' ? noteFreq(f) : f, samples: Math.round(ms * SAMPLE_RATE / 1000) });
  }

  busy() { return !!this.cur || this.queue.length > 0; }
  stop() { this.queue = []; this.cur = null; }

  render(n) {
    const buf = this.buffer, mask = buf.length - 1;
    for (let i = 0; i < n; i++) {
      if (!this.cur || this.cur.samples <= 0) this.cur = this.queue.shift() || null;
      let s = 0;
      if (this.cur) {
        this.cur.samples--;
        if (this.cur.freq > 0) {
          this.phase += this.cur.freq / SAMPLE_RATE;
          if (this.phase >= 1) this.phase -= Math.floor(this.phase);
          s = this.phase < 0.5 ? LEVEL : -LEVEL;
        }
      }
      // A touch of smoothing, like the buzzer's own response.
      this.lp += (s - this.lp) * 0.55;
      buf[this.writePos] = this.lp;
      this.writePos = (this.writePos + 1) & mask;
      if (this.writePos === this.readPos) this.readPos = (this.readPos + 1) & mask;
    }
  }

  // 1/60 second of sound.
  frame() {
    const want = SAMPLE_RATE / 60 + this.carry, n = Math.floor(want);
    this.carry = want - n;
    this.render(n);
  }

  available() { return (this.writePos - this.readPos) & (this.buffer.length - 1); }

  // Fallback output path (ScriptProcessor): resample into `out` at `outRate`.
  pull(out, outRate) {
    const buf = this.buffer, mask = buf.length - 1, step = SAMPLE_RATE / outRate;
    if (this.available() > SAMPLE_RATE * 0.075) this.readPos = (this.writePos - Math.floor(SAMPLE_RATE * 0.035)) & mask;
    let pos = this.frac || 0, last = this.last || 0;
    for (let i = 0; i < out.length; i++) {
      if (this.available() < 2) { out[i] = last *= 0.995; continue; }
      const s0 = buf[this.readPos], s1 = buf[(this.readPos + 1) & mask];
      last = out[i] = s0 + (s1 - s0) * pos;
      pos += step;
      while (pos >= 1 && this.available() > 1) { pos -= 1; this.readPos = (this.readPos + 1) & mask; }
    }
    this.frac = pos; this.last = last;
  }
}
