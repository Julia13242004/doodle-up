import {EMBEDDED_SPRITES} from './sprite-data.js';
import {Game, STEP, GIFT_GOAL, FOOD_EFFECTS} from './game.js?v=2';
import {Renderer, loadSprites} from './renderer.js?v=2';

const find = (id) => document.getElementById(id);
const ui = Object.fromEntries([
  'game', 'field', 'menu', 'paused', 'result', 'hud', 'controls', 'start', 'pause', 'resume', 'finish', 'restart',
  'left', 'right', 'fire', 'best', 'score', 'gifts', 'life', 'toast', 'certificate', 'locked', 'home', 'effects',
  'pause-title', 'result-title', 'final-score', 'final-burger', 'final-cherry', 'final-gift'
].map((id) => [id, find(id)]));

const renderer = new Renderer(ui.field);
for (const element of document.querySelectorAll('[data-sprite]')) {
  element.setAttribute(element.matches('link') ? 'href' : 'src', EMBEDDED_SPRITES[element.dataset.sprite]);
}
const foodIndicators = Object.keys(FOOD_EFFECTS).map((kind) => {
  const badge = find('effect-' + kind);
  return {kind, badge, number: badge.querySelector('span')};
});
const keys = new Set();
const pointers = new Map();
const keyDirection = {ArrowLeft: -1, ArrowRight: 1};
const fireKeys = ['ArrowUp', 'Space'];
const recordKey = 'doodle-up-best-v1';
let record = readRecord();
let game;
let mode = 'menu';
let lastFrame = 0;
let elapsed = 0;
let toastUntil = 0;
let tapDirection = 0;
let tapUntil = 0;
let queuedShot = false;

function readRecord() {
  try {
    const value = Number(localStorage.getItem(recordKey));
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  } catch {
    return 0;
  }
}

function clearControls() {
  for (const {button} of pointers.values()) button?.removeAttribute('data-pressed');
  pointers.clear();
  keys.clear();
  tapUntil = 0;
  queuedShot = false;
}

function show(next) {
  mode = next;
  ui.game.dataset.mode = next;
  for (const panel of ['menu', 'paused', 'result']) ui[panel].hidden = panel !== next;
  ui.hud.hidden = next === 'menu' || next === 'result';
  ui.controls.hidden = next !== 'running';
  ui.effects.hidden = true;
  ui.toast.hidden = true;
  toastUntil = 0;
  elapsed = 0;
  clearControls();
}

function start() {
  if (ui.start.disabled) return;
  game = new Game(renderer.height);
  renderer.sparkles = [];
  show('running');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  updateHud();
  renderer.draw(game);
}

function goHome() {
  game = undefined;
  renderer.sparkles = [];
  show('menu');
  renderer.draw();
  ui.start.focus();
}

function pause() {
  if (mode !== 'running') return;
  show('paused');
  ui['pause-title'].focus();
}

function resume() {
  if (mode !== 'paused') return;
  show('running');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function finish() {
  if (mode !== 'running' && mode !== 'paused') return;
  if (game.score > record) {
    record = game.score;
    try {
      localStorage.setItem(recordKey, String(record));
    } catch {
      // The in-memory record is still available when storage is blocked.
    }
  }
  ui['final-score'].textContent = game.score;
  for (const [kind, count] of Object.entries(game.collected)) ui['final-' + kind].textContent = count;
  ui.certificate.hidden = !game.unlocked;
  ui.locked.hidden = game.unlocked;
  show('result');
  ui['result-title'].focus();
}

function updateHud() {
  ui.score.textContent = game.score;
  ui.best.textContent = Math.max(record, game.score);
  ui.gifts.textContent = game.collected.gift;
  ui.life.textContent = game.lives;
  let hasEffect = false;
  for (const {kind, badge, number} of foodIndicators) {
    const seconds = Math.ceil(game.effectRemaining(kind));
    badge.hidden = seconds === 0;
    if (seconds) {
      hasEffect = true;
      if (number.textContent !== String(seconds)) number.textContent = seconds;
    }
  }
  ui.effects.hidden = !hasEffect;
}

function clearPointer(event) {
  const held = pointers.get(event.pointerId);
  if (!held) return;
  held.button?.removeAttribute('data-pressed');
  pointers.delete(event.pointerId);
  if (event.type === 'pointerup' && held.direction && performance.now() - held.started < 120) {
    tapDirection = held.direction;
    tapUntil = held.started + 120;
  }
}

function pointerDown(event, direction, shoot, button) {
  if (mode !== 'running' || event.button !== 0) return;
  event.preventDefault();
  const started = performance.now();
  pointers.set(event.pointerId, {direction, shoot, button, started});
  event.currentTarget.setPointerCapture(event.pointerId);
  if (shoot) queuedShot = true;
  button?.setAttribute('data-pressed', '');
}

function movePointer(event) {
  const held = pointers.get(event.pointerId);
  if (!held || held.button) return;
  const rect = ui.field.getBoundingClientRect();
  held.direction = event.clientX < rect.left + rect.width / 2 ? -1 : 1;
}

function attachPointer(target, directionForEvent, shoot = false, button = undefined) {
  target.addEventListener('pointerdown', (event) => pointerDown(event, directionForEvent(event), shoot, button));
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    target.addEventListener(eventName, clearPointer);
  }
}

function input(now) {
  const held = [...pointers.values()];
  const pointerDirection = held.findLast(({direction}) => direction)?.direction;
  const keyboardDirection = [...keys].findLast((code) => keyDirection[code]);
  return {
    direction: pointerDirection ?? keyDirection[keyboardDirection] ?? (now < tapUntil ? tapDirection : 0),
    shoot: queuedShot || fireKeys.some((code) => keys.has(code)) || held.some(({shoot}) => shoot)
  };
}

function announce(message, now) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  toastUntil = now + 3200;
}

function processEvents(now) {
  for (const event of game.events.splice(0)) {
    if (event.type === 'item') {
      if (event.unlocked) announce('Приз открыт! Можно прыгать дальше.', now);
      if (event.kind in FOOD_EFFECTS) {
        const label = event.kind === 'burger' ? 'Ускорение!' : 'Платформы ↔';
        renderer.sparkles.push({...event, label, end: now + 570});
      }
    } else if (event.type === 'lost-life' && (!toastUntil || now >= toastUntil)) {
      announce('Потрачена одна жизнь', now);
    }
  }
}

function frame(now) {
  const delay = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0;
  lastFrame = now;
  if (mode === 'running') {
    elapsed += delay;
    while (elapsed >= STEP && !game.ended) {
      const previousCooldown = game.player.firing;
      game.step(STEP, input(now));
      if (game.player.firing > previousCooldown) queuedShot = false;
      elapsed -= STEP;
    }
    processEvents(now);
    if (toastUntil && now >= toastUntil) {
      ui.toast.hidden = true;
      toastUntil = 0;
    }
    updateHud();
    renderer.draw(game, now);
    if (game.ended) finish();
  }
  requestAnimationFrame(frame);
}

async function prepare() {
  ui.start.disabled = true;
  ui.start.textContent = 'Загрузка…';
  try {
    renderer.sprites = await loadSprites();
    renderer.draw();
    ui.start.textContent = 'Играть';
    ui.start.disabled = false;
  } catch (error) {
    console.error(error);
    ui.start.textContent = 'Повторить загрузку';
    ui.start.disabled = false;
  }
}

ui.start.addEventListener('click', () => Object.keys(renderer.sprites).length ? start() : prepare());
ui.restart.addEventListener('click', start);
ui.home.addEventListener('click', goHome);
ui.pause.addEventListener('click', pause);
ui.resume.addEventListener('click', resume);
ui.finish.addEventListener('click', finish);
const fieldDirection = (event) => {
  const rect = ui.field.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? -1 : 1;
};
attachPointer(ui.field, fieldDirection);
ui.field.addEventListener('pointermove', movePointer);
attachPointer(ui.left, () => -1, false, ui.left);
attachPointer(ui.right, () => 1, false, ui.right);
attachPointer(ui.fire, () => 0, true, ui.fire);
for (const [button, direction] of [[ui.left, -1], [ui.right, 1]]) {
  button.addEventListener('click', (event) => {
    if (event.detail || mode !== 'running') return;
    tapDirection = direction;
    tapUntil = performance.now() + 120;
  });
}
ui.fire.addEventListener('click', (event) => {
  if (event.detail === 0 && mode === 'running') queuedShot = true;
});
window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.code === 'Escape') {
    if (!event.repeat && mode === 'running') pause();
    else if (!event.repeat && mode === 'paused') resume();
    return;
  }
  if (mode !== 'running' || !(event.code in keyDirection || fireKeys.includes(event.code))) return;
  event.preventDefault();
  keys.add(event.code);
  if (!event.repeat && fireKeys.includes(event.code)) queuedShot = true;
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
new ResizeObserver(() => {
  renderer.resize();
  if (game) game.height = renderer.height;
  renderer.draw(game, performance.now());
}).observe(ui.field);

ui.hud.querySelector('.goal').textContent = '/ ' + GIFT_GOAL;
renderer.draw();
prepare();
requestAnimationFrame(frame);
