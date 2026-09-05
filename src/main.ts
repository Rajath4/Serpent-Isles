// ── Serpent Isles: UI wiring, HUD, confetti ──────────────────────────────────
import './style.css';
import { Game, type PlayerState } from './game/Game';
import { SoundBank } from './game/audio';
import { PLAYER_DEFS, SNAKES, LADDERS, type Rules } from './game/constants';
import type { RouteMode } from './game/snakes';

const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const canvas = $('scene') as unknown as HTMLCanvasElement;
const sound = new SoundBank();

const DICE_PIPS: Record<number, number[]> = {
  1: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  2: [1, 0, 0, 0, 0, 0, 0, 0, 1],
  3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  4: [1, 0, 1, 0, 0, 0, 1, 0, 1],
  5: [1, 0, 1, 0, 1, 0, 1, 0, 1],
  6: [1, 0, 1, 1, 0, 1, 1, 0, 1],
};

function renderDiceFace(v: number) {
  const holder = $('dice-face').querySelector('span')!;
  holder.innerHTML = '';
  DICE_PIPS[v].forEach((on) => {
    const i = document.createElement('i');
    if (!on) i.className = 'off';
    holder.appendChild(i);
  });
}
renderDiceFace(6);

// ── shared HUD helpers ─────────────────────────────────────────────────────
const hexOf = (id: number) => `#${PLAYER_DEFS[id].color.toString(16).padStart(6, '0')}`;
let matchStart = Date.now();
let lastTurnName = '';
let diceHistory: number[] = [];

function announce(msg: string) {
  $('sr-live').textContent = msg;
}

function pushHistory(v: number) {
  diceHistory.unshift(v);
  diceHistory = diceHistory.slice(0, 4);
  const wrap = $('dice-hist');
  wrap.innerHTML = '';
  diceHistory.forEach((n) => {
    const b = document.createElement('b');
    b.textContent = String(n);
    wrap.appendChild(b);
  });
}

/** Refresh player cards: position, exact-needed hint, leader crown. */
function updateCards() {
  const pls = game.players;
  const best = Math.max(0, ...pls.map((p) => p.square));
  document.querySelectorAll('.pcard').forEach((card) => {
    const id = Number(card.getAttribute('data-id'));
    const pl = pls.find((x) => x.def.id === id);
    if (!pl) return;
    const nameEl = card.querySelector('b')!;
    const posEl = card.querySelector('.pos') as HTMLElement;
    const leader = pl.square === best && best > 0;
    nameEl.textContent = `${leader ? '👑 ' : ''}${pl.name}`;
    posEl.classList.toggle('exact', lastRules.exactFinish && pl.square >= 94 && pl.square < 100);
    if (pl.square === 0) posEl.textContent = '⛵ at bay';
    else if (lastRules.exactFinish && pl.square >= 94 && pl.square < 100)
      posEl.textContent = `🎯 needs exactly ${100 - pl.square}`;
    else if (pl.square === 100) posEl.textContent = '👑 crowned!';
    else posEl.textContent = `■ ${pl.square} · ${100 - pl.square} to go`;
  });
}

/** Slide the race-tracker dots. */
function updateRace() {
  const track = $('race-track');
  game.players.forEach((p) => {
    let dot = track.querySelector(`[data-dot="${p.def.id}"]`) as HTMLElement | null;
    if (!dot) {
      dot = document.createElement('div');
      dot.className = 'race-dot';
      dot.dataset.dot = String(p.def.id);
      dot.style.setProperty('--pc', hexOf(p.def.id));
      dot.title = p.name;
      track.appendChild(dot);
    }
    dot.title = `${p.name} — ${p.square}`;
    dot.style.left = `${3 + (Math.min(100, p.square) / 100) * 90}%`;
  });
  const best = Math.max(0, ...game.players.map((p) => p.square));
  track.querySelectorAll('.race-dot').forEach((d) => {
    const id = Number((d as HTMLElement).dataset.dot);
    const pl = game.players.find((x) => x.def.id === id);
    d.classList.toggle('leader', !!pl && pl.square === best && best > 0);
  });
  $('round').textContent = `Round ${game.turnCount + 1}`;
}

// ── confetti ───────────────────────────────────────────────────────────────
const confettiCanvas = $('confetti') as unknown as HTMLCanvasElement;
const cctx = confettiCanvas.getContext('2d')!;
let confettiParts: Array<{ x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number; c: string }> = [];
let confettiRunning = false;

function sizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
sizeConfetti();
window.addEventListener('resize', sizeConfetti);

function burstConfetti(n = 220) {
  const colors = ['#f3cf7a', '#ff3d5a', '#2fb8ff', '#38e08c', '#ffa41b', '#ffffff'];
  for (let i = 0; i < n; i++) {
    confettiParts.push({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 240,
      y: window.innerHeight * 0.32,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 11 - 3,
      s: 5 + Math.random() * 7,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[i % colors.length],
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    requestAnimationFrame(confettiTick);
  }
}

function confettiTick() {
  cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParts = confettiParts.filter((p) => p.y < confettiCanvas.height + 40);
  confettiParts.forEach((p) => {
    p.vy += 0.32;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate(p.r);
    cctx.fillStyle = p.c;
    cctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
    cctx.restore();
  });
  if (confettiParts.length) requestAnimationFrame(confettiTick);
  else {
    confettiRunning = false;
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

// ── toasts + log ───────────────────────────────────────────────────────────
function toast(msg: string, ms = 2400) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, ms);
}

function log(msg: string, kind: string) {
  const li = document.createElement('li');
  li.textContent = msg;
  if (kind !== 'info') li.className = kind;
  const list = $('log');
  list.prepend(li);
  while (list.children.length > 6) list.lastChild?.remove();
}

// ── game wiring ────────────────────────────────────────────────────────────
let lastNames: string[] = [];
let lastRules: Rules = { exactFinish: true, extraOnSix: true, startOnSix: false };

const game = new Game(canvas, sound, {
  onTurn: (p: PlayerState) => {
    $('turn-label').textContent = `${p.name} to roll`;
    const dot = $('turn-dot');
    dot.style.background = p.def.glow;
    dot.style.color = p.def.glow;
    $('turn-pill').style.borderColor = p.def.glow;
    document.querySelectorAll('.pcard').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-id') === String(p.def.id));
    });
    updateCards();
    updateRace();
    announce(`${p.name}'s turn.`);
    if (lastTurnName && lastTurnName !== p.name) toast(`📲 Pass the isles to ${p.name}`);
    lastTurnName = p.name;
  },
  onDice: (v: number, p: PlayerState) => {
    renderDiceFace(v);
    pushHistory(v);
    $('hint').classList.add('hidden');
    announce(`${p.name} rolled ${v}.`);
    if (v === 6) toast(`✨ ${p.name} rolled a 6!`);
  },
  onLog: (msg, kind) => {
    log(msg, kind);
    if (kind === 'good' || kind === 'bad') announce(msg);
  },
  onWin: (winner, stats) => {
    announce(`${winner.name} wins the game!`);
    $('win-title').textContent = `${winner.name} claims the crown!`;
    const pls = game.players;
    const most = (f: (p: PlayerState) => number) => pls.reduce((a, b) => (f(b) > f(a) ? b : a), pls[0]);
    const rows = pls
      .map(
        (p) => `<div class="stat"><b>${p.square}</b><small>${p.name} · 🎲${p.rolls} 🪜${p.ladders} 🐍${p.snakes}</small></div>`,
      )
      .join('');
    const mvps =
      `<div class="stat"><b>🪜</b><small>Climber · ${most((p) => p.ladders).name}</small></div>` +
      `<div class="stat"><b>🐍</b><small>Serpent-charmer · ${most((p) => p.snakes).name}</small></div>` +
      `<div class="stat"><b>⏱️</b><small>${stats.turns} rounds · ${elapsedStr()}</small></div>`;
    $('win-stats').innerHTML = rows + mvps;
    setTimeout(() => {
      $('win').classList.remove('hidden');
      if (!REDUCED) {
        burstConfetti(260);
        setTimeout(() => burstConfetti(160), 900);
      }
    }, 900);
    toast(`👑 ${winner.name} wins the Isles!`);
  },
  onLock: (locked: boolean) => {
    const btn = $('btn-roll') as HTMLButtonElement;
    btn.disabled = locked;
    btn.querySelector('.roll-label')!.textContent = locked ? 'ROLLING…' : 'ROLL DICE';
    btn.classList.toggle('attention', !locked);
  },
  onProgress: () => {
    updateCards();
    updateRace();
  },
  onHover: (sq: number | null, x = 0, y = 0) => {
    const chip = $('hover-chip');
    const overlayOpen =
      !$('setup').classList.contains('hidden') ||
      !$('win').classList.contains('hidden') ||
      !$('help').classList.contains('hidden');
    if (sq === null || overlayOpen) {
      chip.classList.add('hidden');
      return;
    }
    let fate = '';
    if (sq === 100) fate = ` <span class="fate-crown">👑 The Crown — exact roll only!</span>`;
    else if (sq === 1) fate = ` <span class="fate-ladder">★ Start</span>`;
    else if (LADDERS[sq] !== undefined) fate = ` <span class="fate-ladder">🪜 climbs to ${LADDERS[sq]}</span>`;
    else if (SNAKES[sq] !== undefined) fate = ` <span class="fate-snake">🐍 slides to ${SNAKES[sq]}</span>`;
    chip.innerHTML = `■ ${sq}${fate}`;
    chip.style.left = `${x}px`;
    chip.style.top = `${y}px`;
    chip.classList.remove('hidden');
  },
});

function elapsedStr(): string {
  const s = Math.floor((Date.now() - matchStart) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(() => {
  if ($('topbar').classList.contains('hidden')) return;
  $('clock').textContent = elapsedStr();
  $('round').textContent = `Round ${game.turnCount + 1}`;
}, 1000);

// ── setup screen ───────────────────────────────────────────────────────────
let playerCount = 2;
const defaultNames = ['Ruby', 'Azure', 'Ember', 'Jade'];

interface SavedCrew {
  names: string[];
  rules: Rules;
}
function loadCrew(): SavedCrew | null {
  try {
    const raw = localStorage.getItem('serpent-crew');
    return raw ? (JSON.parse(raw) as SavedCrew) : null;
  } catch {
    return null;
  }
}

function renderNameInputs(saved: string[] = []) {
  const wrap = $('names');
  wrap.innerHTML = '';
  for (let i = 0; i < playerCount; i++) {
    const def = PLAYER_DEFS[i];
    const row = document.createElement('div');
    row.className = 'name-row';
    const hex = hexOf(i);
    row.innerHTML = `<i style="background:${hex};color:${hex}"></i>`;
    const input = document.createElement('input');
    input.maxLength = 12;
    input.value = saved[i] ?? defaultNames[i];
    input.placeholder = `Player ${i + 1} name`;
    input.setAttribute('aria-label', `Player ${i + 1} name`);
    row.appendChild(input);
    wrap.appendChild(row);
  }
}

// restore last crew + rules
const savedCrew = loadCrew();
if (savedCrew) {
  playerCount = Math.min(4, Math.max(2, savedCrew.names.length || 2));
  document.querySelectorAll('.count-row button').forEach((x) =>
    x.classList.toggle('on', Number((x as HTMLElement).dataset.count) === playerCount),
  );
  ($('rule-exact') as HTMLInputElement).checked = savedCrew.rules.exactFinish;
  ($('rule-six') as HTMLInputElement).checked = savedCrew.rules.extraOnSix;
  ($('rule-start') as HTMLInputElement).checked = savedCrew.rules.startOnSix;
  renderNameInputs(savedCrew.names);
} else {
  renderNameInputs();
}

document.querySelectorAll('.count-row button').forEach((b) => {
  b.addEventListener('click', () => {
    sound.click();
    document.querySelectorAll('.count-row button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    playerCount = Number((b as HTMLElement).dataset.count);
    const cur = [...document.querySelectorAll<HTMLInputElement>('#names input')].map((i) => i.value);
    renderNameInputs(cur);
  });
});

function readRules(): Rules {
  return {
    exactFinish: ($('rule-exact') as HTMLInputElement).checked,
    extraOnSix: ($('rule-six') as HTMLInputElement).checked,
    startOnSix: ($('rule-start') as HTMLInputElement).checked,
  };
}

function renderPlayerCards(names: string[]) {
  const wrap = $('players');
  wrap.innerHTML = '';
  $('race-track').querySelectorAll('.race-dot').forEach((d) => d.remove());
  names.forEach((n, i) => {
    const def = PLAYER_DEFS[i];
    const hex = hexOf(i);
    const card = document.createElement('div');
    card.className = 'pcard' + (i === 0 ? ' active' : '');
    card.dataset.id = String(def.id);
    card.style.setProperty('--pc', hex);
    card.innerHTML = `<div class="avatar">${(n || def.name).slice(0, 1).toUpperCase()}</div>
      <div class="meta"><b></b><small class="pos" data-id="${def.id}">⛵ at bay</small></div>`;
    card.querySelector('b')!.textContent = n || def.name;
    wrap.appendChild(card);
  });
}

function resetMatchChrome() {
  diceHistory = [];
  $('dice-hist').innerHTML = '';
  ($('log') as HTMLElement).innerHTML = '';
  renderDiceFace(6);
  matchStart = Date.now();
  lastTurnName = '';
  $('clock').textContent = '00:00';
  $('round').textContent = 'Round 1';
  $('hint').classList.remove('hidden');
}

function startMatch(names: string[], rules: Rules) {
  lastNames = [...names];
  lastRules = { ...rules };
  try {
    localStorage.setItem('serpent-crew', JSON.stringify({ names, rules }));
  } catch {
    /* private mode — play on regardless */
  }
  renderPlayerCards(names);
  resetMatchChrome();
  $('setup').classList.add('hidden');
  $('win').classList.add('hidden');
  ['topbar', 'players', 'dice-dock', 'logwrap', 'race'].forEach((id) => $(id).classList.remove('hidden'));
  game.resize();
  game.newGame(names, rules);
  ($('btn-roll') as HTMLButtonElement).disabled = false;
  ($('btn-roll') as HTMLButtonElement).classList.add('attention');
  updateRace();
}

$('btn-start').addEventListener('click', () => {
  sound.unlock();
  sound.startAmbient();
  sound.click();
  const names = [...document.querySelectorAll<HTMLInputElement>('#names input')].map((i) => i.value.trim() || 'Explorer');
  startMatch(names, readRules());
});

// ── input: dice, shortcuts ───────────────────────────────────────────────────
function doRoll() {
  sound.unlock();
  ($('btn-roll') as HTMLButtonElement).classList.remove('attention');
  void game.rollDice();
}
$('btn-roll').addEventListener('click', doRoll);

function cycleCamera() {
  const btns = [...document.querySelectorAll<HTMLElement>('.seg button')];
  const cur = btns.findIndex((b) => b.classList.contains('on'));
  btns[(cur + 1) % btns.length].click();
}

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  const setupOpen = !$('setup').classList.contains('hidden');
  const winOpen = !$('win').classList.contains('hidden');
  const helpOpen = !$('help').classList.contains('hidden');
  if (e.code === 'Space') {
    if (setupOpen || winOpen || helpOpen) return;
    e.preventDefault();
    doRoll();
  } else if (e.code === 'Enter' && setupOpen) {
    $('btn-start').click();
  } else if (e.code === 'KeyC' && !setupOpen) {
    cycleCamera();
  } else if (e.code === 'KeyM') {
    $('btn-sound').click();
  } else if (e.code === 'KeyH') {
    sound.click();
    $('help').classList.toggle('hidden', helpOpen);
    if (!helpOpen) $('btn-close-help').focus();
  } else if (e.code === 'Escape' && helpOpen) {
    $('help').classList.add('hidden');
  }
});

// ── camera ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.seg button').forEach((b) => {
  b.addEventListener('click', () => {
    sound.click();
    document.querySelectorAll('.seg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    game.setCameraMode((b as HTMLElement).dataset.cam as 'cine' | 'follow' | 'top' | 'free');
  });
});

// ── top buttons ────────────────────────────────────────────────────────────
const ROUTE_ICON: Record<RouteMode, string> = { full: '🐍', ghost: '👻', hidden: '🚫' };
let routeMode: RouteMode = 'full';
try {
  const saved = localStorage.getItem('serpent-routes') as RouteMode | null;
  if (saved && ROUTE_ICON[saved]) routeMode = saved;
} catch {
  /* ignore */
}
game.setRouteMode(routeMode);
$('btn-routes').textContent = ROUTE_ICON[routeMode];
$('btn-routes').addEventListener('click', () => {
  sound.click();
  routeMode = routeMode === 'full' ? 'ghost' : routeMode === 'ghost' ? 'hidden' : 'full';
  game.setRouteMode(routeMode);
  ($('btn-routes') as HTMLButtonElement).textContent = ROUTE_ICON[routeMode];
  try {
    localStorage.setItem('serpent-routes', routeMode);
  } catch {
    /* ignore */
  }
  toast(
    routeMode === 'full'
      ? '🐍 Routes in full color'
      : routeMode === 'ghost'
        ? '👻 Routes ghosted — hover a tile to spotlight'
        : '🚫 Routes hidden — pure board focus',
  );
});
$('btn-sound').addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const muted = !sound.muted;
  sound.setMuted(muted);
  btn.textContent = muted ? '🔇' : '🔊';
  btn.classList.toggle('on', !muted);
});
$('btn-help').addEventListener('click', () => {
  sound.click();
  $('help').classList.remove('hidden');
});
$('btn-close-help').addEventListener('click', () => {
  sound.click();
  $('help').classList.add('hidden');
});
$('help').addEventListener('click', (e) => {
  if (e.target === $('help')) $('help').classList.add('hidden');
});
$('btn-restart').addEventListener('click', () => {
  sound.click();
  if (!lastNames.length) return;
  $('win').classList.add('hidden');
  renderPlayerCards(lastNames);
  resetMatchChrome();
  game.newGame(lastNames, lastRules);
  ($('btn-roll') as HTMLButtonElement).disabled = false;
  ($('btn-roll') as HTMLButtonElement).classList.add('attention');
  updateRace();
  toast('↺ New voyage begun!');
});
$('btn-rematch').addEventListener('click', () => {
  sound.click();
  $('win').classList.add('hidden');
  renderPlayerCards(lastNames);
  resetMatchChrome();
  game.newGame(lastNames, lastRules);
  ($('btn-roll') as HTMLButtonElement).disabled = false;
  ($('btn-roll') as HTMLButtonElement).classList.add('attention');
  updateRace();
});
$('btn-change').addEventListener('click', () => {
  sound.click();
  $('win').classList.add('hidden');
  $('setup').classList.remove('hidden');
});

// hover ticks
document.querySelectorAll('button').forEach((b) => {
  b.addEventListener('mouseenter', () => sound.hover(), { passive: true });
});

// loader out
requestAnimationFrame(() => requestAnimationFrame(() => {
  setTimeout(() => $('loader').classList.add('done'), 500);
}));
