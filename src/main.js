import { LedScreen } from './led/display.js';
import { Beeper } from './led/beeper.js';
import { GAMES, gameById } from './games/index.js';
import { Input, controlLegend } from './input.js';
import { AudioOut } from './audio-out.js';
import { Device } from './device.js';
import { store, toast } from './shared.js';
import { registerServiceWorker } from './sw-update.js';
import { setupInstall } from './install.js';
import { InputMode } from './input-mode.js';

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  arrowsLeft: false,   // the originals had the arrow keys on the right
  hintsFor: 'auto',    // which controls' hints to show: 'auto' (the input last used), 'touch', 'keys' or 'pad'
  haptics: true,
  sound: true,
  volume: 70,        // percent
};

const beeper = new Beeper();
const input = new Input();
const audio = new AudioOut(beeper);
const screen = new LedScreen($('screen2d'));
const device = new Device($('device'), $('screen2d'));
input.sources.push(device);

const settings = { ...DEFAULTS, ...(store.get('mobile') || {}) };
// Touch, keyboard or gamepad: which hints to show (the case is the touch control; keyboard and
// gamepad players get a card listing the game's keys or buttons).
const inputMode = new InputMode({ storageKey: 'LEDjs.inputMode' });
const state = { game: null, id: null, menuOpen: false, paused: false, prevButtons: 0 };
inputMode.override = settings.hintsFor;
inputMode.onChange = () => renderControls();

// Per-game preferences: the skill level.
const PREFS = 'gameprefs:';
function gamePrefs(id) { return (id && store.get(PREFS + id)) || {}; }
function setGamePref(key, value) { if (state.id) store.set(PREFS + state.id, { ...gamePrefs(state.id), [key]: value }); }

// Block page-level zoom/scroll gestures; this is a full-screen app.
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.sheet')) e.preventDefault();
}, { passive: false });

// ---------------------------------------------------------------- audio

// iOS only (re)starts audio inside a user gesture, and only some events count
// (touchend and click, not always pointer events whose default was prevented),
// so try on all of them. Capture phase so nothing can stop them first.
const unlockAudio = () => { if (settings.sound) audio.start(); };
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}
// Coming back from the background often leaves audio suspended or interrupted.
document.addEventListener('visibilitychange', () => { if (!document.hidden && settings.sound) audio.resume(); });

// ---------------------------------------------------------------- saves

// The game in progress is saved whenever play stops (pause, the menus, switching
// games, leaving the page), so a reload picks up where it was left.
const RESUME = 'resume:';
const RESUME_VERSION = 1;
function saveResume() {
  if (!state.game) return;
  store.trySet(RESUME + state.id, { v: RESUME_VERSION, state: state.game.saveState() });
}
// A saved game is only picked up if it's the shape the game is now: everything a new game has
// must be there (a game saved by an earlier version of it may lack what this one needs), and it
// must draw. Otherwise it's dropped and a new game starts.
function restoreResume(id) {
  const saved = store.get(RESUME + id);
  if (!saved || saved.v !== RESUME_VERSION) return false;
  const fresh = state.game.saveState();
  try {
    if (!saved.state || !Object.keys(fresh).every((k) => k in saved.state)) throw new Error('stale');
    state.game.loadState(saved.state);
    state.game.render();
    return true;
  } catch {
    state.game.loadState(fresh);
    store.remove(RESUME + id);
    return false;
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveResume(); });
window.addEventListener('pagehide', saveResume);

// ---------------------------------------------------------------- games

function loadGame(id) {
  if (state.paused) setPaused(false);
  saveResume();                                  // keep the game being left
  const G = gameById(id) || GAMES[0];
  const prefs = gamePrefs(G.id);
  state.id = G.id;
  state.game = new G(beeper);
  state.game.setSkill(prefs.skill || 1);
  state.resumed = restoreResume(G.id);
  if (!state.resumed) state.game.newGame(prefs.skill || 1);
  state.gameName = G.title;
  store.set('lastGame', G.id);
  buildDevice();
  screen.setLayout(state.game.layout);
  if (!state.resumed) showBooting(G.title);
  applyGame();
  renderControls();
  document.body.classList.add('help-intro');
  renderGames();
  layout();
}

// The case for the current game, with the current control settings.
function buildDevice() {
  const G = state.game.constructor;
  device.build(G, { arrowsLeft: settings.arrowsLeft, skill: state.game.s.level });
  const L = state.game.layout;
  $('device').style.setProperty('--win-aspect', `${L.w} / ${L.h}`);
}
// The case's switch: Pro 1 / Pro 2, or (with the game's modifier button held, Football 2's
// Kick) Pro 3 / Pro 4. Moving to the other pair of levels, or moving it after the final
// whistle, starts a new game, as switching the original off and on did.
device.onLever = (name, pos) => { if (state.game && state.game.setLever) { state.game.setLever(name, pos); drawNow(); } };
device.onSwitch = (pos) => {
  if (!state.game) return;
  const G = state.game.constructor, mod = G.levelModifier ? G.actions.indexOf(G.levelModifier) : -1;
  const second = mod >= 0 && (input.read() & (0x10 << mod)) ? 2 : 0;
  setLevel(pos + 1 + second);
};
function setLevel(level) {
  const G = state.game.constructor;
  level = Math.min(level, (G.levels || [1, 2]).length);
  const was = state.game.s.level;
  if (Math.ceil(level / 2) !== Math.ceil(was / 2) || state.game.s.phase === 'over') { state.game.newGame(level); store.remove(RESUME + state.id); }
  else state.game.setSkill(level);
  setGamePref('skill', level);
  applyGame();
}

function renderGames() {
  const el = $('library');
  el.textContent = '';
  for (const G of GAMES) {
    const li = document.createElement('li');
    li.className = 'cart-item' + (G.id === state.id ? ' playing' : '');
    const play = document.createElement('button');
    play.className = 'cart-play';
    const name = document.createElement('b');
    name.textContent = G.title;
    const meta = document.createElement('small');
    meta.textContent = G.id === state.id ? 'Playing' : `${G.year}`;
    play.append(name, meta);
    play.addEventListener('click', () => { loadGame(G.id); closeMenu(); });
    li.append(play);
    el.append(li);
  }
  $('libraryInfo').textContent = 'Recreations of the 1970s LED handheld games.';
}

// The skill switch and help text for the current game.
function applyGame() {
  const level = state.game ? state.game.s.level : 1;
  const names = state.game?.constructor.levels || ['Pro 1', 'Pro 2'];
  // A game with one level has nothing to choose (Auto Race, Missile Attack); Bowling's switch
  // picks the number of bowlers.
  $('skillRow').hidden = names.length < 2;
  $('skillName').textContent = state.game?.constructor.switchTitle ? 'Bowlers' : 'Skill';
  const seg = $('skillSeg');
  seg.textContent = '';
  names.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.classList.toggle('active', i + 1 === level);
    b.addEventListener('click', () => setLevel(i + 1));
    seg.append(b);
  });
  device.setSkill(level);
  $('gameHelp').textContent = state.game ? state.game.constructor.help : '';
}

// ---------------------------------------------------------------- menu

// Settings and the games list are full-screen takeovers. The game pauses and
// the buttons go inert while either is open.
const SHEETS = { menu: 'closeMenu', cartsMenu: 'closeCarts' }; // backdrop id → close button id

function openSheet(id) {
  saveResume();
  for (const other of Object.keys(SHEETS)) $(other).hidden = other !== id;
  state.menuOpen = true;
  device.releaseAll();
  device.enabled = false;
  audio.setMuted(true);
}
function closeMenu() {
  state.menuOpen = false;
  device.enabled = !state.paused;
  audio.setMuted(!settings.sound || state.paused);
  for (const id of Object.keys(SHEETS)) $(id).hidden = true;
}
// Pause: stops the game (and its sound) until resumed from the bar button,
// the veil over the game, or P on a keyboard. The game is saved for resume.
function setPaused(paused) {
  state.paused = paused;
  padStartHeld = true;
  document.body.classList.toggle('help-intro', paused);
  if (paused) hideBooting();
  $('pausedGame').textContent = state.gameName || '';
  document.body.classList.toggle('paused', paused);
  $('paused').hidden = !paused;
  $('pauseBtn').setAttribute('aria-pressed', String(paused));
  $('pauseBtn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  if (paused) { device.releaseAll(); saveResume(); }
  device.enabled = !paused && !state.menuOpen;
  audio.setMuted(paused || state.menuOpen || !settings.sound);
}
// Open on release rather than 'click': mobile browsers can drop the click when
// the finger shifts slightly or another finger is already on the screen.
$('pauseBtn').addEventListener('pointerup', (e) => { e.preventDefault(); setPaused(!state.paused); });
$('pauseBtn').addEventListener('click', (e) => { if (e.detail === 0) setPaused(!state.paused); }); // keyboard
$('paused').addEventListener('pointerup', (e) => { e.preventDefault(); setPaused(false); });
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyP' || e.metaKey || e.ctrlKey || e.altKey || state.menuOpen) return;
  e.preventDefault();
  setPaused(!state.paused);
});

for (const [btn, sheet] of [['menuBtn', 'menu'], ['cartBtn', 'cartsMenu']]) {
  $(btn).addEventListener('pointerup', (e) => { e.preventDefault(); openSheet(sheet); });
  $(btn).addEventListener('click', (e) => { if (e.detail === 0) openSheet(sheet); }); // keyboard
}
for (const [sheet, close] of Object.entries(SHEETS)) {
  $(close).addEventListener('click', closeMenu);
  // After rotating, iOS can hit-test a full-screen sheet against its old layout,
  // so the close button (which moves) stops getting taps. Judge by position instead.
  $(sheet).addEventListener('pointerup', (e) => {
    const r = $(close).getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) closeMenu();
  });
}

function save() { store.set('mobile', settings); }

// The controls for a keyboard or gamepad: the card shown as a game starts and while paused, and the
// list in Settings.
const MODE_NAMES = { touch: 'touch', keys: 'keyboard', pad: 'gamepad' };
function renderControls() {
  const mode = inputMode.mode;
  const rows = mode !== 'touch' && state.game ? controlLegend(state.game.constructor, mode) : [];
  for (const id of ['keyHelpList', 'controlList']) {
    const dl = $(id);
    dl.textContent = '';
    for (const [keys, what] of rows) {
      dl.append(Object.assign(document.createElement('dt'), { textContent: keys }), Object.assign(document.createElement('dd'), { textContent: what }));
    }
  }
  for (const b of $('hintsFor').children) b.classList.toggle('active', b.dataset.mode === settings.hintsFor);
  $('hintsForInfo').textContent = settings.hintsFor === 'auto'
    ? `Showing ${MODE_NAMES[mode]} hints: Auto follows whichever you last used.`
    : `Always showing ${MODE_NAMES[mode]} hints.`;
}
$('hintsFor').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  settings.hintsFor = b.dataset.mode; save();
  inputMode.override = settings.hintsFor;
  renderControls();
});
// The first key, button or tap fades the card.
const dismissHelp = () => { if (!state.paused) document.body.classList.remove('help-intro'); };
input.onActivity = dismissHelp;
window.addEventListener('pointerdown', dismissHelp, { capture: true, passive: true });

function syncMenu() {
  $('leftHanded').checked = settings.arrowsLeft;
  $('haptics').checked = settings.haptics;
  $('sound').checked = settings.sound;
  $('volume').value = settings.volume;
  $('hapticsRow').hidden = !navigator.vibrate;
  device.haptics = settings.haptics;
  applySound();
}

$('leftHanded').addEventListener('change', (e) => {
  settings.arrowsLeft = e.target.checked; save();
  if (state.game) buildDevice();
  layout();
});
$('haptics').addEventListener('change', (e) => {
  settings.haptics = e.target.checked; save();
  device.haptics = settings.haptics;
  if (settings.haptics && navigator.vibrate) navigator.vibrate(15);
});
function applySound() {
  audio.setVolume(settings.volume / 100);
  $('volumeVal').textContent = `${settings.volume}%`;
  $('volume').disabled = !settings.sound;
}
$('sound').addEventListener('change', (e) => {
  settings.sound = e.target.checked; save();
  if (settings.sound) audio.start();
  audio.setMuted(!settings.sound || state.menuOpen);
  applySound();
});
$('volume').addEventListener('input', (e) => { settings.volume = +e.target.value; applySound(); save(); });
$('volume').addEventListener('change', () => audio.preview());
$('powerBtn').addEventListener('click', () => {
  if (!state.game) return;
  state.game.newGame();
  store.remove(RESUME + state.id);
  closeMenu();
});

// Starting: a card naming the game; it fades after 3 seconds, or on a tap.
let bootTimer = 0;
function showBooting(title) {
  $('bootingGame').textContent = title;
  const el = $('booting');
  el.hidden = true; void el.offsetWidth; el.hidden = false;      // restart the fade
  clearTimeout(bootTimer);
  bootTimer = setTimeout(hideBooting, 3000);
}
function hideBooting() { clearTimeout(bootTimer); $('booting').hidden = true; }
$('booting').addEventListener('pointerdown', hideBooting);
device.onPress = () => { hideBooting(); askForMotion(); };

// Tilting the phone (Bowling hooks the ball with it): the left-right tilt, -1 to 1 (about 25
// degrees is full tilt), whichever way the screen is turned. iOS asks permission, which has to
// come from a tap, so it's asked on the first press of a key in a game that uses it.
let motionAsked = false;
function askForMotion() {
  if (motionAsked || !state.game?.constructor.motion || typeof DeviceOrientationEvent === 'undefined') return;
  motionAsked = true;
  const listen = () => window.addEventListener('deviceorientation', (e) => {
    if (e.gamma === null || !state.game?.setTilt) return;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const t = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : angle === 180 ? -e.gamma : e.gamma;
    state.game.setTilt(Math.max(-1, Math.min(1, t / 25)));
  });
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
  } else listen();
}

// ---------------------------------------------------------------- layout

// Safe-area insets in px, measured from a probe that uses env().
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(probe);

// The handheld fills the space below the top bar, keeping its proportions:
// tall in portrait (window above the controls), wide in landscape (controls
// either side of the window). --u is the size unit the case is drawn in.
//
// On a phone the phone becomes the handheld: the case is the whole screen, edge to edge,
// its plastic running under the top bar and the notch (the safe areas go into its padding),
// and the extra height (or width) goes to the control panel.
const FILL_MAX = 600;     // px: screens whose short side is at most this are phones
function layout() {
  if (!state.game) return;
  const el = $('device');
  const ps = getComputedStyle(probe);
  const sl = parseFloat(ps.paddingLeft) || 0, sr = parseFloat(ps.paddingRight) || 0;
  const st = parseFloat(ps.paddingTop) || 0, sb = parseFloat(ps.paddingBottom) || 0;
  const W = window.innerWidth, H = window.innerHeight;
  const barH = $('bar').offsetHeight;
  const fill = Math.min(W, H) <= FILL_MAX;
  const pad = fill ? 0 : 10;
  const availW = W - sl - sr - pad * 2, availH = H - barH - sb - pad * 2;
  const L = state.game.layout, aspect = L.w / L.h;
  const landscape = W > H;
  el.classList.toggle('landscape', landscape);
  el.classList.toggle('fill', fill);
  // Case proportions in units: portrait 60 wide x 100 tall, landscape 124 x 62.
  const [cw, ch] = landscape ? [124, 62] : [60, 100];
  const u = Math.min(availW / cw, availH / ch);
  // Framed, the case is drawn at those proportions; filling, it's the screen, and the
  // drawing area inside its padding is what's left of the screen.
  const w = fill ? availW : cw * u, h = fill ? availH : ch * u;
  if (fill) {
    el.style.width = `${W}px`;
    el.style.height = `${H}px`;
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.setProperty('--fill-t', `${Math.max(barH, st)}px`);
    el.style.setProperty('--fill-b', `${sb}px`);
    el.style.setProperty('--fill-l', `${sl}px`);
    el.style.setProperty('--fill-r', `${sr}px`);
  } else {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${sl + pad + (availW - w) / 2}px`;
    el.style.top = `${barH + pad + (availH - h) / 2}px`;
  }
  el.style.setProperty('--u', `${u}px`);
  // The phone's own bars take the case's colour when it fills the screen.
  const themeColor = fill ? (state.game.constructor.body?.case || '#2b2b30') : '#0b0d14';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColor);
  document.body.classList.toggle('fill', fill);
  // The LED window: full width in portrait (unless a tall display needs to leave room for
  // the panel, grille and plate below it); in landscape, the middle, with the controls either side.
  // (The case's padding and the stadium surround take 8.4 units across and down; in portrait
  // the panel, grille, plate and gaps take about 33 more down; in landscape the plate about 6.)
  // A phone in portrait can put one of the controls beside the display (Auto Race's gear lever,
  // where the original had it): the display then takes most of the width, the control the rest.
  const besideName = fill && !landscape ? state.game.constructor.controls.besideWindow : null;
  placeBeside(el, besideName);
  // The skill switch: where the case has it, on its own row under the keys, or (in landscape, for
  // some games) above the display; the display leaves room for it.
  const switchTop = placeSwitch(el, landscape);
  // (Side flippers, Bowling's, take about 8 units from the width on each side.)
  const sideW = state.game.constructor.controls.sideKeys ? u * 17 : 0;
  const winW = landscape
    ? Math.min(w * 0.44 - sideW, (h - u * (switchTop ? 22 : 15)) * aspect)
    : besideName
      ? Math.min((w - u * 8.4) * 0.7, (h - u * 34) * aspect)
      : Math.min(w - u * 8.4 - sideW, (h - u * 41.5) * aspect);
  el.style.setProperty('--win-w', `${winW}px`);
  scaleControls(fill, landscape, u);
  if (fill) fitInside(el, winW, aspect, H - sb - u * 1.6, !!state.game.constructor.controls.keysFirst);
  screen.fit();
  drawNow();
}

// A control beside the display (a phone in portrait): Auto Race's gear lever, Missile Attack's
// Fire button. Moved out of the panel into the case, and back when the screen turns or grows.
function placeBeside(dev, name) {
  if (dev._besideHome && !dev._besideHome.el.isConnected) dev._besideHome = null;     // a rebuilt case
  const home = dev._besideHome;
  if (home && (!name || home.name !== name)) {
    if (home.parent.isConnected) home.parent.insertBefore(home.el, home.next);
    home.el.classList.remove('beside');
    dev._besideHome = null;
  }
  dev.classList.toggle('beside-window', !!name);
  if (!name || dev._besideHome) return;
  // A lever (Auto Race's gear shift) or a button (Missile Attack's Fire).
  const wrap = device.levers[name]?.el.closest('.lever-wrap') || device.keys[name]?.el.closest('.action-wrap');
  if (!wrap) return;
  dev._besideHome = { name, el: wrap, parent: wrap.parentNode, next: wrap.nextSibling };
  wrap.classList.add('beside');
  dev.querySelector('.case').insertBefore(wrap, dev.querySelector('.window'));
}

// The skill switch. In landscape, a game with controls.switchTop has it above the display (the
// sides then hold just the keys); a switch on its own row under all the keys (Football's) goes
// under the buttons there, as the panel is split either side of the display. Otherwise it's
// where the case put it. Returns whether it's above the display.
function placeSwitch(dev, landscape) {
  const sw = dev.querySelector('.skill');
  if (!sw) return false;
  if (!dev._swHome || dev._swHome.el !== sw || !dev._swHome.parent.isConnected) {
    dev._swHome = { el: sw, parent: sw.parentNode, next: sw.nextSibling };
  }
  const top = landscape && !!state.game.constructor.controls.switchTop;
  dev.classList.toggle('switch-top', top);
  sw.classList.toggle('switch-top', top);
  if (top) { if (sw.parentNode !== dev.querySelector('.case')) dev.querySelector('.case').append(sw); return true; }
  if (landscape && sw.classList.contains('switch-row')) { dev.querySelector('.group.left').append(sw); return false; }
  const home = dev._swHome;
  if (sw.parentNode !== home.parent) home.parent.insertBefore(sw, home.next && home.next.parentNode === home.parent ? home.next : null);
  return false;
}

// Stacking moves one control into the run keys' row (before the cross); unstacking puts it back
// where the case had it.
function stack(dev, el) {
  dev.classList.add('stacked');
  if (!el) return;
  dev._moved = { el, parent: el.parentNode, next: el.nextSibling };
  const right = dev.querySelector('.group.right');
  right.insertBefore(el, right.firstChild);
}
function unstack(dev) {
  dev.classList.remove('stacked');
  const m = dev._moved;
  if (m && m.parent.isConnected) m.parent.insertBefore(m.el, m.next);
  dev._moved = null;
}

// Filling a phone, the case's contents must end above the screen's bottom edge (a tall display,
// like Auto Race's, uses most of the height): if they don't, the keys go back to their usual size,
// then the display gives up what's still over.
function fitInside(el, winW, aspect, bottom, keysFirst = false) {
  const over = () => Math.max(...[...el.querySelectorAll('.plate, .grille, .panel')].map((e) => e.getBoundingClientRect().bottom)) - bottom;
  if (over() <= 0) return;
  // Keys first: the display shrinks to make room (it's sized by its width; height follows).
  if (keysFirst) {
    let w = winW;
    for (let i = 0; i < 3 && over() > 0; i++) { w = Math.max(80, w - over() * aspect); el.style.setProperty('--win-w', `${w}px`); }
    if (over() <= 0) return;
  }
  // Shrink the grown keys just enough (a few tries, as the panel's height isn't all keys)...
  const panel = el.querySelector('.panel');
  const base = parseFloat(getComputedStyle(el).getPropertyValue('--u'));
  for (let i = 0; i < 4 && panel.style.getPropertyValue('--u') && over() > 0; i++) {
    const pu = parseFloat(panel.style.getPropertyValue('--u')), h = panel.getBoundingClientRect().height;
    const next = pu * Math.max(0.5, (h - over() - 2) / h);
    if (next <= base) panel.style.removeProperty('--u'); else panel.style.setProperty('--u', `${next}px`);
  }
  // ...then the display gives up what's still over.
  const extra = over();
  if (extra > 0) el.style.setProperty('--win-w', `${Math.max(80, winW - extra * aspect)}px`);
}

// Filling a phone, the control panel has room to spare (a tall screen gives it the extra
// height): the keys grow to use it, as far as the panel's width and height allow. A case whose
// run keys are a group of their own (the football games) can instead stack its two groups, the
// buttons above the run keys, when that lets the keys grow more than keeping them in one row.
const BTN_K = 1.25;       // stacked, the game buttons are this much bigger than the run keys (style.css)
function scaleControls(fill, landscape, u) {
  const dev = $('device'), panel = dev.querySelector('.panel');
  if (!panel) return;
  panel.style.removeProperty('--u');
  unstack(dev);
  if (!fill) return;
  const groups = [...panel.querySelectorAll('.group')];
  const kidsOf = (g) => [...g.children];
  // What the columns need at the current size (with the gaps between them), against the room:
  // in portrait the panel's width (all the columns side by side) and the height left below the
  // window; in landscape each side group's own box.
  // (A switch on a row of its own under a group's buttons adds to that group's height, not to
  // the row's width.)
  const need = (kids, k = 1) => {
    const row = kids.filter((e) => !e.classList.contains('switch-row'));
    const under = kids.filter((e) => e.classList.contains('switch-row')).reduce((n, e) => n + e.offsetHeight + u * 1.6, 0);
    return {
      w: row.reduce((n, e) => n + e.offsetWidth * (e.classList.contains('action-wrap') ? k : 1), 0) + u * 2.6 * (row.length + 1),
      h: Math.max(...row.map((e) => e.offsetHeight * (e.classList.contains('action-wrap') ? k : 1))) + under + u * 4.4,
    };
  };
  let scale = 1.8;
  if (landscape) {
    for (const g of groups) {
      if (!g.children.length) continue;
      const n = need(kidsOf(g)), box = g.getBoundingClientRect();
      scale = Math.min(scale, box.width / n.w, box.height / n.h);
    }
  } else {
    const n = need(groups.flatMap(kidsOf)), box = panel.getBoundingClientRect();
    const swRow = panel.querySelector(':scope > .switch-row');
    if (swRow) n.h += swRow.offsetHeight + u * 1.8;
    const win = dev.querySelector('.window').getBoundingClientRect();
    // (Down to the name plate; on a case with the plate at the top, down to the grille.)
    const below = dev.querySelector(dev.classList.contains('plate-top') ? '.grille' : '.plate').getBoundingClientRect();
    const roomH = below.top - win.bottom - u * 6;
    const C = state.game.constructor.controls;
    if (dev.classList.contains('compact')) {
      // Compact (the court games): the keys packed in one centred row, 1.1 units apart, the
      // panel's padding either side; the switch row and the panel's padding below and above.
      const kids = groups.flatMap(kidsOf).filter((e) => !e.classList.contains('switch-row'));
      const cs = getComputedStyle(panel);
      n.w = kids.reduce((t, e) => t + e.offsetWidth, 0) + u * 1.1 * (kids.length - 1) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      n.h = Math.max(...kids.map((e) => e.offsetHeight)) + (swRow ? swRow.offsetHeight + u * 1.8 : 0) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    }
    // Keys first (the court games): the keys grow to fill the width, and the display gives up
    // the height they need (see fitInside).
    // (Below a control beside the display, the steering lever stretches across the width, so
    // only the height limits it.)
    // (A compact row is kept a little short of the full width, so rounding never wraps it.)
    const widthLimit = dev.classList.contains('beside-window') ? Infinity
      : (box.width * (dev.classList.contains('compact') ? 0.96 : 1)) / n.w;
    scale = Math.min(C.maxGrow || 1.8, widthLimit, C.keysFirst ? Infinity : roomH / n.h);
    // Stacked: the buttons in one row (each column's keys side by side), the run keys in another
    // with one control beside them (the game's choice, controls.runRow: Football 2's Pass; else the
    // skill switch); the wider row against the width, both rows (and the gap) against the height.
    const padOnly = state.game.constructor.controls.stack !== false
      && groups.some((g) => g.children.length === 1 && g.firstElementChild.classList.contains('pad'));
    if (padOnly && groups.length === 2) {
      const pick = state.game.constructor.controls.runRow;
      const beside = pick ? device.keys[pick]?.el.closest('.action-wrap') : panel.querySelector('.skill');
      const topRow = [...panel.querySelectorAll('.action-wrap, .skill:not(.switch-row)')].filter((e) => e !== beside);
      const runRow = [panel.querySelector('.pad'), ...(beside ? [beside] : [])];
      const under = swRow ? swRow.offsetHeight + u * 1.8 : 0;          // a switch row beneath both
      const fit = (k) => {
        const rows = [need(topRow, k), need(runRow, k)];
        return Math.min(1.8, box.width / Math.max(...rows.map((r) => r.w)), roomH / (rows[0].h + rows[1].h + u * 2 + under));
      };
      // Stack if that's worth it at the usual button size; then size it with the buttons a size up
      // (unless every key is one size, as on Football 2).
      const mirror = dev.classList.contains('mirror-keys');
      if (fit(1) > scale * 1.15) { scale = fit(mirror ? 1 : BTN_K); stack(dev, beside); }
    }
  }
  if (scale > 1.05) panel.style.setProperty('--u', `${u * scale}px`);
}
function onViewportChange() {
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  layout();
}
let settleTimer = 0;
function onRotate() {
  onViewportChange();
  clearTimeout(settleTimer);
  settleTimer = setTimeout(onViewportChange, 350);
}
window.addEventListener('resize', onRotate);
window.addEventListener('orientationchange', onRotate);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onRotate);

function drawNow() {
  if (!state.game) return;
  // Levers show where the game has them (they move by key as well as by touch).
  if (state.game.levers) for (const [name, pos] of Object.entries(state.game.levers())) device.setLever(name, pos);
  const f = state.game.render();
  screen.draw(f.leds, f.digits, f.text);
}

// ---------------------------------------------------------------- loop

// A gamepad's Start button pauses and resumes (each press once it's been let go of since the last).
let padStartHeld = true;
function resumeFromPad() {
  const down = padStart();
  if (down && !padStartHeld) { setPaused(false); input.padStartHeld = true; }
  padStartHeld = down;
}
// The games don't use Start, so while playing it pauses.
function pauseFromPad() {
  const down = padStart();
  if (down && !padStartHeld) setPaused(true);
  else padStartHeld = down;
}
function padStart() {
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  return !!(pad && pad.buttons[9] && pad.buttons[9].pressed);
}

let acc = 0, lastTime = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  const running = state.game && !state.menuOpen && !state.paused && !document.hidden;
  if (running) {
    pauseFromPad();
    acc += dt;
    let ran = 0;
    // Steps of 1/60 second, each with 1/60 second of sound.
    while (acc >= 1 / 60 && ran < 4) {
      const held = input.read(), pressed = held & ~state.prevButtons;
      state.prevButtons = held;
      acc -= 1 / 60;
      state.game.tick(held, pressed);
      beeper.frame();
      ran++;
    }
    if (ran === 4) acc = 0;
    audio.flush();
    if (ran) drawNow();
  } else {
    acc = 0;
    if (state.paused && !state.menuOpen) resumeFromPad();
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- boot

(() => {
  syncMenu();
  audio.setMuted(!settings.sound);
  $('loading').classList.remove('show');
  loadGame(store.get('lastGame') || GAMES[0].id);
  // A reload resumes paused, so play starts when the player is ready.
  if (state.resumed) setPaused(true);
  requestAnimationFrame(tick);
})();

window.ledjs = state;
window.input = input;
window.audio = audio;

// Offline support: the service worker (sw.js, written by tools/build-sw.mjs)
// caches the app so it runs without a network once installed, and a new
// version shows an update screen while it installs. Browsers only allow it on
// https or localhost.
registerServiceWorker('LEDjs');
setupInstall($('installBtn'), (msg) => toast(msg, { info: true }));
