// The handheld itself: a case around the LED window, with real buttons to
// press instead of gesture zones. Each game describes its case (colours, name)
// and its buttons; the arrow keys are a cross of four.
//
// Every key is its own touch target and tracks its own pointers, so several
// can be held at once. A press lasts at least MIN_PRESS, so a quick tap is
// never shorter than a frame the game polls.
//
// As an input source (see Input.sources): dir() -> direction bits (0x10 up,
// 0x20 down, 0x40 left, 0x80 right) and buttons() -> the game's button bits.

const DIR_BITS = { up: 0x10, down: 0x20, left: 0x40, right: 0x80 };
const MIN_PRESS = 70;     // ms

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 10H5z" fill="currentColor"/></svg>';
// Football's forward key: printed with arrows both ways (forward is either way, by team).
const TWO_WAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12l8-6v12zM22 12l-8-6v12z" fill="currentColor"/></svg>';

export class Device {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.enabled = true;      // false while a menu is open or the game is paused
    this.haptics = true;
    this.onSwitch = null;     // (position 0 / 1) when the case's skill switch is moved
    this.onPress = null;      // any key down (audio unlock, etc.)
    this.onLever = null;      // (name, position) when a lever is moved to a position
    this.levers = {};         // name -> { el, slots, pos }
    this.keys = {};           // name -> { el, ids: Set, until }
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Build the case for a game class. The game lists its buttons in G.actions
  // (their order gives their input bits: 0x10, 0x20, 0x40, 0x80) and lays out
  // its panel in G.controls:
  //   columns: each a list of button ids (and 'switch' for the skill switch, or a
  //            lever: { lever, labels, vertical, title }), or 'arrows' for the
  //            cross of arrow keys
  //   pad:     the arrow keys the case has (default all four), and dot: the one
  //            printed with a dot (Basketball's score key); padStyle 'forward' lays
  //            them out as Football's: a two-way forward key beside up over down;
  //            keyColors: { direction: colour } for arrow keys of their own colour
  //   stack:   false keeps a phone from stacking the controls in two rows
  //   switchTop: in landscape, the skill switch above the display
  //   sideKeys: two buttons as long flippers down the case's sides, beside the display (Bowling's)
  //   landscapeHide: buttons left out in landscape (the court games' second shoot key)
  //   evenColumns: on a phone in portrait, all the columns spread evenly across the panel
  //   switchBelow: the skill switch on its own row under all the keys (Football's)
  //   mirror:  the game buttons the run keys' size, spaced as they are (Football's, whose
  //            two halves mirror each other)
  //   keyScale, keyHeight: the keys' size (1 as usual) and the game buttons' height in units
  //            (5 as usual; Football's are squarer)
  //   split:   where the right-hand group starts, for landscape (the groups sit
  //            either side of the display)
  //   buttons: { id: { label, color, face } } (face: letters printed on the key itself,
  //            as Football's ST, SC and K, instead of a label above it)
  build(G, { arrowsLeft = false, skill = 1 } = {}) {
    const body = G.body || {};
    const root = this.root;
    root.textContent = '';
    this.keys = {};
    this.levers = {};
    this.actions = G.actions || [];
    const vars = {
      case: body.case || '#2b2b30', 'case-hi': body.caseHi || '#3a3a42', panel: body.panel || 'rgba(0,0,0,0.25)',
      trim: body.trim || '#c9a227', print: body.print || '#ece6d6', key: body.key || '#e6e0d2', 'key-ink': body.keyInk || '#3a332c',
      plate: body.plate || '#d8c79a', 'plate-ink': body.plateInk || '#2a2418', grille: body.grille || 'rgba(0, 0, 0, 0.42)',
      'surround-a': (body.surround || [])[0] || '#1b1b1b', 'surround-b': (body.surround || [])[1] || '#2c2c2c',
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--${k}`, v);
    root.classList.toggle('arrows-left', arrowsLeft);
    const C0 = G.controls;
    root.style.setProperty('--keys-k', C0.keyScale || 1);
    root.style.setProperty('--act-h', C0.keyHeight || 5);
    root.classList.toggle('mirror-keys', !!C0.mirror);
    root.classList.toggle('compact', !!C0.compact);
    root.classList.toggle('even-columns', !!C0.evenColumns);
    root.classList.toggle('side-keys', !!C0.sideKeys);
    root.classList.toggle('plate-top', !!G.plateTop);

    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    const kase = el('div', 'case');

    // The display, set in a ribbed surround.
    const win = el('div', 'window');
    win.append(this.canvas);

    // The control panel: the game's buttons in columns (each labelled above), the
    // skill switch, and the arrow keys, in two groups.
    const panel = el('div', 'panel');
    const C = G.controls;
    const groups = [el('div', 'group left'), el('div', 'group right')];
    C.columns.forEach((column, ci) => {
      const group = groups[ci < (C.split ?? C.columns.length - 1) ? 0 : 1];
      if (column === 'arrows') { group.append(this.makePad(el, body, C)); return; }
      const col = el('div', 'actions');
      for (const id of column) {
        if (id === 'switch') { col.append(this.makeSwitch(el, G)); continue; }
        if (typeof id === 'object' && id.lever) { col.append(this.makeLever(el, id)); continue; }
        const b = C.buttons[id];
        const wrap = el('div', `action-wrap${(C.landscapeHide || []).includes(id) ? ' hide-landscape' : ''}`);
        const k = el('button', `key action${b.round ? ' round' : ''}`, b.face ? `<span class="key-face">${b.face}</span>` : undefined);
        k.style.setProperty('--btn', b.color);
        k.setAttribute('aria-label', b.label);
        if (b.face) wrap.append(k); else wrap.append(el('span', 'action-label', b.label.toUpperCase()), k);
        col.append(wrap);
        this.bind(id, k);
      }
      group.append(col);
    });
    panel.append(...groups);
    // Football's switch runs along the bottom of the panel, under all the keys.
    if (C.switchBelow) {
      const sw = this.makeSwitch(el, G);
      sw.classList.add('switch-row');
      panel.append(sw);
    }

    // Speaker grille and the name plate.
    const grille = el('div', 'grille');
    const plate = el('div', 'plate', `<b>${G.title.toUpperCase()}</b>`);

    kase.append(win, panel, grille, plate);
    // Bowling's flippers: long ribbed keys down both sides, beside the display.
    (C.sideKeys || []).forEach((id, i) => {
      const b = C.buttons[id];
      const k = el('button', `key flipper ${i ? 'right' : 'left'}`, b.face ? `<span class="flip-face">${b.face}</span>` : undefined);
      k.style.setProperty('--btn', b.color);
      k.setAttribute('aria-label', b.label);
      kase.append(k);
      this.bind(id, k);
    });
    root.append(kase);
    this.setSkill(skill);
  }

  makePad(el, body, { pad: dirs = ['up', 'left', 'right', 'down'], dot = null, padStyle = '', keyColors = {} } = {}) {
    const pad = el('div', `pad ${padStyle}`);
    for (const d of ['up', 'left', 'right', 'down']) {
      if (!dirs.includes(d)) continue;
      const two = padStyle === 'forward' && d === 'right';
      const k = el('button', `key arrow ${d}${d === dot ? ' dot' : ''}`, two ? TWO_WAY : ARROW);
      if (keyColors[d]) k.style.setProperty('--key', keyColors[d]);
      k.setAttribute('aria-label', two ? 'forward' : d);
      pad.append(k);
      this.bind(d, k);
    }
    pad.append(el('span', 'pad-label', body.padLabel ?? 'RUN'));
    return pad;
  }

  // The two-position skill switch. A game with more levels picks them by what's
  // held as the switch moves (Football 2: Kick held for Pro 3 and 4).
  makeSwitch(el, G) {
    const [a, b] = G.switchLabels || ['PRO 1', 'PRO 2'];
    const sw = el('button', 'skill');
    sw.setAttribute('aria-label', G.switchTitle || 'Skill');
    // A switch that isn't the skill level says what it is (Bowling's: the number of bowlers).
    if (G.switchTitle) sw.append(el('span', 'action-label', G.switchTitle));
    sw.append(el('span', 'skill-labels', `<span>${a}</span><span>${b}</span>`), el('span', 'track', '<i></i>'));
    sw.addEventListener('click', () => { const pos = this.switchPos === 1 ? 0 : 1; if (this.onSwitch) this.onSwitch(pos); });
    this.skillEl = sw;
    return sw;
  }

  // A lever with several positions (Auto Race's gear shift and steering): tap a position
  // to move it there. The game owns its position; setLever shows it.
  makeLever(el, { lever, labels, vertical = false, title = '' }) {
    const wrap = el('div', `lever-wrap${vertical ? ' vertical' : ''}`);
    if (title) wrap.append(el('span', 'action-label', title));
    const box = el('div', 'lever');
    const slots = labels.map((label, i) => {
      const slot = el('button', 'lever-slot', `<span>${label}</span>`);
      slot.setAttribute('aria-label', `${title || lever} ${label || i + 1}`);
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.onPress) this.onPress();
        if (this.enabled && this.onLever) this.onLever(lever, i);
        if (this.haptics && navigator.vibrate) navigator.vibrate(10);
      });
      box.append(slot);
      return slot;
    });
    const knob = el('i', 'lever-knob');
    box.append(knob);
    wrap.append(box);
    this.levers[lever] = { el: box, slots, knob, vertical, pos: -1 };
    return wrap;
  }

  setLever(name, pos) {
    const L = this.levers[name];
    if (!L || L.pos === pos) return;
    L.pos = pos;
    L.slots.forEach((s, i) => s.classList.toggle('on', i === pos));
    const k = (pos + 0.5) / L.slots.length * 100;
    if (L.vertical) L.knob.style.top = `${k}%`; else L.knob.style.left = `${k}%`;
  }

  // Show the switch at the position for a skill level (levels alternate positions: 1, 3 left; 2, 4 right).
  setSkill(skill) {
    this.switchPos = (skill - 1) % 2;
    if (this.skillEl) this.skillEl.classList.toggle('pro2', this.switchPos === 1);
  }

  bind(name, el) {
    const key = this.keys[name] = { el, ids: new Set(), until: 0 };
    const down = (e) => {
      e.preventDefault();
      if (this.onPress) this.onPress();
      if (!this.enabled) return;
      key.ids.add(e.pointerId);
      key.until = performance.now() + MIN_PRESS;
      el.classList.add('isdown');
      if (this.haptics && navigator.vibrate) navigator.vibrate(10);
    };
    const up = (e) => {
      if (!key.ids.delete(e.pointerId)) return;
      if (!key.ids.size) el.classList.remove('isdown');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  held(name) {
    const k = this.keys[name];
    return !!k && (k.ids.size > 0 || performance.now() < k.until);
  }

  releaseAll() {
    for (const k of Object.values(this.keys)) { k.ids.clear(); k.until = 0; k.el.classList.remove('isdown'); }
  }

  // Input source interface.
  dir() {
    if (!this.enabled) return 0;
    let d = 0;
    for (const [name, bit] of Object.entries(DIR_BITS)) if (this.held(name)) d |= bit;
    return d;
  }
  buttons() {
    if (!this.enabled) return 0;
    let bits = 0;
    this.actions.forEach((id, i) => { if (this.held(id)) bits |= 0x10 << i; });
    return bits;
  }
}
