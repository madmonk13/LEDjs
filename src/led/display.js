// Draws a handheld's display: red LED blips and seven-segment digits behind a
// dark window, with the glow and short afterglow of real LEDs.
//
// A game describes its display once (layout) in its own units:
//   { w, h, leds: [{ x, y, w, h }], digits: [{ x, y, h }], lines: [{ x1, y1, x2, y2 }],
//     rects: printed areas under the LEDs, drawn in order: { x, y, w, h, color, r } (a
//            rectangle, r rounding its corners), { cx, cy, radius, color } (a circle), or
//            { points: [x, y, x, y, ...], color } (a polygon); lineColor, textColor }
// and each frame fills `leds` (brightness 0..1 per LED: about 0.35 reads as a
// dim blip, 1 as bright) and `digits` (characters, '.' after one adds its point).

// Seven-segment patterns: bit 0 = a (top), then b, c, d, e, f, g (middle).
// '|' and '!' are the right and left vertical bars; '<' and '>' are ⊢ and ⊣.
const SEG = {
  0: 0x3f, 1: 0x06, 2: 0x5b, 3: 0x4f, 4: 0x66, 5: 0x6d, 6: 0x7d, 7: 0x07, 8: 0x7f, 9: 0x6f,
  ' ': 0, '-': 0x40, _: 0x08, '|': 0x06, '!': 0x30, '<': 0x70, '>': 0x46, A: 0x77, b: 0x7c, C: 0x39, c: 0x58, d: 0x5e, E: 0x79, F: 0x71, G: 0x3d, H: 0x76, h: 0x74,
  I: 0x06, J: 0x1e, L: 0x38, n: 0x54, o: 0x5c, O: 0x3f, P: 0x73, r: 0x50, S: 0x6d, t: 0x78, U: 0x3e, u: 0x1c, y: 0x6e,
};
export function segments(ch) { return SEG[ch] ?? SEG[String(ch).toUpperCase()] ?? SEG[String(ch).toLowerCase()] ?? 0; }

const LIT = '#ff3b24', OFF = 'rgba(120, 18, 14, 0.28)', GLOW = 'rgba(255, 50, 30, 0.9)';

export class LedScreen {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = null;
    this.levels = new Float32Array(0);
  }

  setLayout(layout) {
    this.layout = layout;
    this.levels = new Float32Array(layout.leds.length);
    this.fit();
  }

  // Match the canvas's pixels to its size on screen.
  fit() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  // Draw a frame: target LED levels and digit text. LEDs light fast and fade a little slower.
  draw(leds, digits, text) {
    const L = this.layout;
    if (!L) return;
    const ctx = this.ctx, c = this.canvas, k = c.width / L.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#1a0907'); g.addColorStop(1, '#0d0504');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // Printed areas (a field, end zones), then markings.
    for (const r of L.rects || []) {
      ctx.fillStyle = r.color;
      ctx.beginPath();
      if (r.radius !== undefined) ctx.arc(r.cx, r.cy, r.radius, 0, Math.PI * 2);
      else if (r.points) { ctx.moveTo(r.points[0], r.points[1]); for (let i = 2; i < r.points.length; i += 2) ctx.lineTo(r.points[i], r.points[i + 1]); ctx.closePath(); }
      else if (ctx.roundRect && r.r) ctx.roundRect(r.x, r.y, r.w, r.h, r.r); else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
    }
    if (L.lines) {
      ctx.strokeStyle = L.lineColor || 'rgba(255, 120, 100, 0.13)';
      ctx.lineWidth = L.lineWidth || 0.6;
      ctx.beginPath();
      for (const ln of L.lines) { ctx.moveTo(ln.x1, ln.y1); ctx.lineTo(ln.x2, ln.y2); }
      ctx.stroke();
    }
    const labels = text || L.text;
    if (labels) {
      ctx.fillStyle = L.textColor || 'rgba(255, 140, 120, 0.32)';
      ctx.textBaseline = 'middle';
      for (const t of labels) {
        if (t.color) ctx.fillStyle = t.color;
        ctx.font = `600 ${t.size || 5}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = t.align || 'center';
        ctx.fillText(t.text, t.x, t.y);
      }
    }

    // LEDs: the unlit shape, then lit ones with a glow.
    const lv = this.levels;
    for (let i = 0; i < L.leds.length; i++) {
      const target = leds[i] || 0;
      lv[i] += (target - lv[i]) * (target > lv[i] ? 0.75 : 0.35);
      if (lv[i] < 0.01) lv[i] = 0;
    }
    for (const d of L.leds) this.blip(d, 0);
    ctx.save();
    for (let i = 0; i < L.leds.length; i++) if (lv[i]) this.blip(L.leds[i], lv[i]);
    ctx.restore();

    if (L.digits) L.digits.forEach((d, i) => this.digit(d, digits ? digits[i] : ' '));
  }

  blip(d, level) {
    const ctx = this.ctx, r = Math.min(d.w, d.h) / 2;
    if (!level) { ctx.fillStyle = OFF; ctx.shadowBlur = 0; }
    else {
      ctx.globalAlpha = Math.min(1, 0.25 + level * 0.75);
      ctx.fillStyle = LIT;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = (2 + level * 6) * (this.canvas.width / this.layout.w);
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, r);
    else ctx.rect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // One seven-segment digit, slanted a little; `ch` may end in '.' for the decimal point.
  digit(d, ch = ' ') {
    const ctx = this.ctx, h = d.h, w = h * 0.52, t = h * 0.13, slant = h * 0.08;
    const dot = typeof ch === 'string' && ch.length > 1 && ch.endsWith('.');
    const bits = segments(dot ? ch[0] : ch) | (dot ? 0x80 : 0);
    const x0 = d.x - w / 2, y0 = d.y - h / 2, hh = h / 2;
    // Segment rectangles (before slant): [x, y, w, h].
    const S = [
      [x0 + t * 0.6, y0, w - t * 1.2, t], [x0 + w - t, y0 + t * 0.6, t, hh - t * 0.9], [x0 + w - t, y0 + hh + t * 0.3, t, hh - t * 0.9],
      [x0 + t * 0.6, y0 + h - t, w - t * 1.2, t], [x0, y0 + hh + t * 0.3, t, hh - t * 0.9], [x0, y0 + t * 0.6, t, hh - t * 0.9],
      [x0 + t * 0.6, y0 + hh - t / 2, w - t * 1.2, t],
    ];
    const skew = (y) => (d.y - y) / h * slant;
    const seg = (r, on) => {
      const [x, y, sw, sh] = r;
      ctx.fillStyle = on ? LIT : OFF;
      if (on) { ctx.shadowColor = GLOW; ctx.shadowBlur = 5 * (this.canvas.width / this.layout.w); } else ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(x + skew(y), y); ctx.lineTo(x + sw + skew(y), y);
      ctx.lineTo(x + sw + skew(y + sh), y + sh); ctx.lineTo(x + skew(y + sh), y + sh);
      ctx.closePath();
      ctx.fill();
    };
    S.forEach((r, i) => { if (!(bits & (1 << i))) seg(r, false); });
    S.forEach((r, i) => { if (bits & (1 << i)) seg(r, true); });
    // Decimal point.
    ctx.fillStyle = bits & 0x80 ? LIT : OFF;
    ctx.beginPath();
    ctx.arc(x0 + w + t * 0.9 + skew(y0 + h), y0 + h - t / 2, t * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
