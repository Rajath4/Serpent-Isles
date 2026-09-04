// ── Serpent Isles: UI wiring, HUD, confetti ──────────────────────────────────
import './style.css';
import { Game, type PlayerState } from './game/Game';
import { SoundBank } from './game/audio';
import { PLAYER_DEFS, type Rules } from './game/constants';

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
    document.querySelectorAll('.pcard').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-id') === String(p.def.id));
    });
    document.querySelectorAll('#players .pos').forEach((el) => {
      const id = Number((el as HTMLElement).dataset.id);
      const pl = game.players.find((x) => x.def.id === id);
      if (pl) el.textContent = pl.square === 0 ? '⛵ at bay' : `■ ${pl.square}`;
    });
  },
  onDice: (v: number, p: PlayerState) => {
    renderDiceFace(v);
    if (v === 6) toast(`✨ ${p.name} rolled a 6!`);
  },
  onLog: (msg, kind) => log(msg, kind),
  onWin: (winner, stats) => {
    $('win-title').textContent = `${winner.name} claims the crown!`;
    const rows = game.players
      .map(
        (p) => `<div class="stat"><b>${p.square}</b><small>${p.name} · 🎲${p.rolls} 🪜${p.ladders} 🐍${p.snakes}</small></div>`,
      )
      .join('');
    $('win-stats').innerHTML = rows + `<div class="stat"><b>${stats.turns}</b><small>rounds played</small></div>`;
    setTimeout(() => {
      $('win').classList.remove('hidden');
      burstConfetti(260);
      setTimeout(() => burstConfetti(160), 900);
    }, 900);
    toast(`👑 ${winner.name} wins the Isles!`);
  },
  onLock: (locked: boolean) => {
    ($('btn-roll') as HTMLButtonElement).disabled = locked;
  },
});

// ── setup screen ───────────────────────────────────────────────────────────
let playerCount = 2;
const defaultNames = ['Ruby', 'Azure', 'Ember', 'Jade'];

function renderNameInputs() {
  const wrap = $('names');
  wrap.innerHTML = '';
  for (let i = 0; i < playerCount; i++) {
    const def = PLAYER_DEFS[i];
    const row = document.createElement('div');
    row.className = 'name-row';
    const hex = `#${def.color.toString(16).padStart(6, '0')}`;
    row.innerHTML = `<i style="background:${hex};color:${hex}"></i>`;
    const input = document.createElement('input');
    input.maxLength = 12;
    input.value = defaultNames[i];
    input.placeholder = `Player ${i + 1} name`;
    input.setAttribute('aria-label', `Player ${i + 1} name`);
    row.appendChild(input);
    wrap.appendChild(row);
  }
}
renderNameInputs();

document.querySelectorAll('.count-row button').forEach((b) => {
  b.addEventListener('click', () => {
    sound.click();
    document.querySelectorAll('.count-row button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    playerCount = Number((b as HTMLElement).dataset.count);
    renderNameInputs();
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
  names.forEach((n, i) => {
    const def = PLAYER_DEFS[i];
    const hex = `#${def.color.toString(16).padStart(6, '0')}`;
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

function startMatch(names: string[], rules: Rules) {
  lastNames = [...names];
  lastRules = { ...rules };
  renderPlayerCards(names);
  $('setup').classList.add('hidden');
  $('win').classList.add('hidden');
  ['topbar', 'players', 'dice-dock', 'logwrap'].forEach((id) => $(id).classList.remove('hidden'));
  game.resize();
  game.newGame(names, rules);
  ($('btn-roll') as HTMLButtonElement).disabled = false;
  toast(`⚓ ${names[0]} rolls first — good luck!`);
}

$('btn-start').addEventListener('click', () => {
  sound.unlock();
  sound.startAmbient();
  sound.click();
  const names = [...document.querySelectorAll<HTMLInputElement>('#names input')].map((i) => i.value.trim() || 'Explorer');
  startMatch(names, readRules());
});

// ── dice ───────────────────────────────────────────────────────────────────
function doRoll() {
  sound.unlock();
  void game.rollDice();
}
$('btn-roll').addEventListener('click', doRoll);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !$('setup').classList.contains('hidden') === false) {
    // space on setup starts game
  }
  if (e.code === 'Space' && $('setup').classList.contains('hidden') && $('win').classList.contains('hidden') && $('help').classList.contains('hidden')) {
    e.preventDefault();
    doRoll();
  }
  if (e.code === 'Enter' && !$('setup').classList.contains('hidden')) {
    $('btn-start').click();
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
  game.newGame(lastNames, lastRules);
  renderPlayerCards(lastNames);
  ($('log') as HTMLElement).innerHTML = '';
  ($('btn-roll') as HTMLButtonElement).disabled = false;
  toast('↺ New voyage begun!');
});
$('btn-rematch').addEventListener('click', () => {
  sound.click();
  $('win').classList.add('hidden');
  game.newGame(lastNames, lastRules);
  renderPlayerCards(lastNames);
  ($('log') as HTMLElement).innerHTML = '';
  ($('btn-roll') as HTMLButtonElement).disabled = false;
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
