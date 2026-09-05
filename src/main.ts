// ── Serpent Isles: UI wiring, HUD, confetti ──────────────────────────────────
import './style.css';
import { Game, type PlayerState, type MatchSnapshot } from './game/Game';
import { SoundBank } from './game/audio';
import { PLAYER_DEFS, CPU_NAMES, SNAKES, LADDERS, type Rules } from './game/constants';
import type { RouteMode } from './game/snakes';
import { Q, applyQuality, resolveChoice, loadChoice, saveChoice } from './game/quality';
import type { QualityChoice } from './game/quality';

const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const canvas = $('scene') as unknown as HTMLCanvasElement;
const sound = new SoundBank();

// graphics quality is decided BEFORE the scene is built (geometry bakes to it)
applyQuality(resolveChoice(loadChoice()));

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
let lastTurnWasCpu = false;
let matchLive = false;
let diceHistory: number[] = [];
let cpuTimer: number | null = null;
let lastWin: { name: string; turns: number } | null = null;

function clearCpuTimer() {
  if (cpuTimer !== null) {
    clearTimeout(cpuTimer);
    cpuTimer = null;
  }
}

/** The silicon sailor ponders, then rolls — never instant machine-gun turns.
 *  NOTE: must NOT consult game.busy here — onTurn fires mid-handoff while the
 *  previous turn still holds the lock; the fire-time check below is the real guard. */
function scheduleCpuRoll(p: PlayerState) {
  if (!p.isCPU || !$('win').classList.contains('hidden')) return;
  if (!$('pause').classList.contains('hidden')) return; // frozen while paused
  cpuTimer = window.setTimeout(
    () => {
      cpuTimer = null;
      if (game.activePlayer?.def.id === p.def.id && !game.busy) doAutoRoll();
    },
    1100 + Math.random() * 900,
  );
}

/** Pocket buzz — only after a real gesture (browsers scold otherwise). */
let canBuzz = false;
window.addEventListener('pointerdown', () => {
  canBuzz = true;
}, { passive: true });
window.addEventListener('keydown', () => {
  canBuzz = true;
});
function buzz(p: number | number[]) {
  if (!canBuzz) return;
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(p);
  } catch {
    /* still waters */
  }
}

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
  const goal = game.goal;
  const best = Math.max(0, ...pls.map((p) => p.square));
  document.querySelectorAll('.pcard').forEach((card) => {
    const id = Number(card.getAttribute('data-id'));
    const pl = pls.find((x) => x.def.id === id);
    if (!pl) return;
    const nameEl = card.querySelector('b')!;
    const posEl = card.querySelector('.pos') as HTMLElement;
    const leader = pl.square === best && best > 0;
    nameEl.textContent = `${leader ? '👑 ' : ''}${pl.name}`;
    if (pl.isCPU) {
      const tag = document.createElement('span');
      tag.className = 'cputag';
      tag.textContent = 'CPU';
      nameEl.appendChild(tag);
    }
    posEl.classList.toggle('exact', !lastRules.swift && lastRules.exactFinish && pl.square >= goal - 6 && pl.square < goal);
    if (pl.square === 0) posEl.textContent = '⛵ at bay';
    else if (!lastRules.swift && lastRules.exactFinish && pl.square >= goal - 6 && pl.square < goal)
      posEl.textContent = `🎯 needs exactly ${goal - pl.square}`;
    else if (pl.square >= goal) posEl.textContent = '👑 crowned!';
    else posEl.textContent = `■ ${pl.square} · ${goal - pl.square} to go`;
  });
}

/** Slide the race-tracker dots. */
function updateRace() {
  const track = $('race-track');
  const goal = game.goal;
  game.players.forEach((p) => {
    let dot = track.querySelector(`[data-dot="${p.def.id}"]`) as HTMLElement | null;
    if (!dot) {
      dot = document.createElement('div');
      dot.className = 'race-dot';
      dot.dataset.dot = String(p.def.id);
      dot.style.setProperty('--pc', hexOf(p.def.id));
      track.appendChild(dot);
    }
    dot.title = `${p.name}${p.isCPU ? ' (CPU)' : ''} — ${p.square}`;
    dot.style.left = `${3 + (Math.min(goal, p.square) / goal) * 90}%`;
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
let lastRules: Rules = { exactFinish: true, extraOnSix: true, startOnSix: false, swift: false };
let lastCpu: boolean[] = [];

const game = new Game(canvas, sound, {
  onTurn: (p: PlayerState) => {
    clearCpuTimer();
    $('turn-label').textContent = `${p.isCPU ? '🤖 ' : ''}${p.name} to roll`;
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
    const btn = $('btn-roll') as HTMLButtonElement;
    btn.disabled = p.isCPU;
    btn.classList.toggle('attention', !p.isCPU);
    if (p.isCPU) $('hint').classList.add('hidden');
    if (!matchLive) {
      matchLive = true;
      toast(`⚓ ${p.name} rolls first — good luck!`);
    } else if (p.isCPU) {
      toast(`🤖 ${p.name} takes the dice…`);
    } else if (lastTurnName && (lastTurnName !== p.name || lastTurnWasCpu)) {
      toast(lastTurnWasCpu ? `🎲 Your move, ${p.name}!` : `📲 Pass the isles to ${p.name}`);
    }
    lastTurnWasCpu = p.isCPU;
    lastTurnName = p.name;
    scheduleCpuRoll(p);
  },
  onDice: (v: number, p: PlayerState) => {
    renderDiceFace(v);
    pushHistory(v);
    buzz(12);
    $('hint').classList.add('hidden');
    announce(`${p.name} rolled ${v}.`);
    if (!REDUCED) {
      // center-screen result punch — gold erupts for a six
      const flash = $('roll-flash');
      $('roll-flash-num').textContent = String(v);
      flash.classList.toggle('six', v === 6);
      flash.classList.remove('hidden', 'show');
      void flash.offsetWidth;
      flash.classList.add('show');
      window.clearTimeout((flash as unknown as { _t?: number })._t);
      (flash as unknown as { _t?: number })._t = window.setTimeout(() => flash.classList.add('hidden'), 980);
    }
    if (v === 6) toast(`✨ ${p.name} rolled a 6!`);
  },
  onLog: (msg, kind) => {
    log(msg, kind);
    if (kind === 'good' || kind === 'bad') announce(msg);
    if (kind === 'bad') buzz(60);
    else if (kind === 'good') buzz(35);
  },
  onWin: (winner, stats) => {
    clearCpuTimer();
    clearSave();
    recordWin(game.players, winner);
    buzz([40, 60, 120]);
    announce(`${winner.name} wins the game!`);
    $('win-title').textContent = `${winner.name} claims the crown!`;
    const pls = game.players;
    const most = (f: (p: PlayerState) => number) => pls.reduce((a, b) => (f(b) > f(a) ? b : a), pls[0]);
    const fortune = pls.reduce((a, b) => (b.ladders - b.snakes > a.ladders - a.snakes ? b : a), pls[0]);
    const sixPct = stats.rolls ? Math.round((stats.sixes / stats.rolls) * 100) : 0;
    const rows = pls
      .map(
        (p) => `<div class="stat"><b>${p.square}</b><small>${p.name}${p.isCPU ? ' 🤖' : ''} · 🎲${p.rolls} 🪜${p.ladders} 🐍${p.snakes}</small></div>`,
      )
      .join('');
    const mvps =
      `<div class="stat"><b>🪜</b><small>Climber · ${most((p) => p.ladders).name}</small></div>` +
      `<div class="stat"><b>🐍</b><small>Serpent-charmer · ${most((p) => p.snakes).name}</small></div>` +
      `<div class="stat"><b>🍀</b><small>Fortune favors ${fortune.name} (+${fortune.ladders - fortune.snakes})</small></div>` +
      `<div class="stat"><b>🎲</b><small>${stats.rolls} rolls · sixes ${sixPct}% (fair ≈17%)</small></div>` +
      `<div class="stat"><b>⏱️</b><small>${stats.turns} rounds · ${elapsedStr()}</small></div>`;
    $('win-stats').innerHTML = rows + mvps;
    lastWin = { name: winner.name, turns: stats.turns };
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
    if (!locked) {
      const p = game.activePlayer;
      btn.classList.toggle('attention', !p || !p.isCPU);
      if (p?.isCPU) btn.disabled = true;
    }
  },
  onProgress: () => {
    updateCards();
    updateRace();
    saveMatch();
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

// live debug handle (harmless in production; invaluable for support)
(window as unknown as { __serpent?: unknown }).__serpent = {
  game,
  state: () => ({
    busy: game.busy,
    current: game.current,
    turn: game.activePlayer?.name ?? null,
    squares: game.players.map((p) => `${p.name}:${p.square}${p.isCPU ? '(cpu)' : ''}`),
    turnCount: game.turnCount,
    goal: game.goal,
  }),
};
setInterval(() => {
  if ($('topbar').classList.contains('hidden')) return;
  $('clock').textContent = elapsedStr();
  $('round').textContent = `Round ${game.turnCount + 1}`;
}, 1000);

// ── setup screen ───────────────────────────────────────────────────────────
let playerCount = 2;
let voyage: 'classic' | 'swift' = 'classic';
const cpuSeats: boolean[] = [false, false, false, false];
const defaultNames = ['Ruby', 'Azure', 'Ember', 'Jade'];

interface SavedCrew {
  names: string[];
  cpu?: boolean[];
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

function currentNames(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#names input')].map((i) => i.value);
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
    const tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'cpu-toggle' + (cpuSeats[i] ? ' on' : '');
    tog.textContent = cpuSeats[i] ? '🤖' : '🧑';
    tog.title = cpuSeats[i] ? 'CPU sailor — tap for human' : 'Human — tap for CPU';
    tog.setAttribute('aria-label', `Seat ${i + 1}: ${cpuSeats[i] ? 'CPU' : 'human'}`);
    tog.addEventListener('click', () => {
      sound.unlock();
      sound.click();
      cpuSeats[i] = !cpuSeats[i];
      if (cpuSeats[i] && !input.value.trim()) input.value = CPU_NAMES[i % CPU_NAMES.length];
      renderNameInputs(currentNames());
    });
    row.appendChild(tog);
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
  ($('rule-exact') as HTMLInputElement).checked = savedCrew.rules.exactFinish !== false;
  ($('rule-six') as HTMLInputElement).checked = savedCrew.rules.extraOnSix !== false;
  ($('rule-start') as HTMLInputElement).checked = !!savedCrew.rules.startOnSix;
  if (Array.isArray(savedCrew.cpu)) {
    for (let i = 0; i < 4; i++) cpuSeats[i] = !!savedCrew.cpu[i];
  }
  if (savedCrew.rules.swift) {
    voyage = 'swift';
    document.querySelectorAll('.mode-row button').forEach((x) =>
      x.classList.toggle('on', (x as HTMLElement).dataset.mode === 'swift'),
    );
  }
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
    renderNameInputs(currentNames());
  });
});

document.querySelectorAll('.mode-row button').forEach((b) => {
  b.addEventListener('click', () => {
    sound.click();
    document.querySelectorAll('.mode-row button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    voyage = (b as HTMLElement).dataset.mode === 'swift' ? 'swift' : 'classic';
  });
});

function readRules(): Rules {
  return {
    exactFinish: ($('rule-exact') as HTMLInputElement).checked,
    extraOnSix: ($('rule-six') as HTMLInputElement).checked,
    startOnSix: ($('rule-start') as HTMLInputElement).checked,
    swift: voyage === 'swift',
  };
}

function renderPlayerCards(names: string[], cpu: boolean[] = []) {
  const wrap = $('players');
  wrap.innerHTML = '';
  $('race-track').querySelectorAll('.race-dot').forEach((d) => d.remove());
  names.forEach((n, i) => {
    const def = PLAYER_DEFS[i];
    const hex = hexOf(i);
    const isCpu = !!cpu[i];
    const card = document.createElement('div');
    card.className = 'pcard' + (i === 0 ? ' active' : '') + (isCpu ? ' cpu' : '');
    card.dataset.id = String(def.id);
    card.style.setProperty('--pc', hex);
    card.innerHTML = `<div class="avatar">${isCpu ? '🤖' : (n || def.name).slice(0, 1).toUpperCase()}</div>
      <div class="meta"><b></b><small class="pos" data-id="${def.id}">⛵ at bay</small></div>`;
    const bEl = card.querySelector('b')!;
    bEl.textContent = n || def.name;
    if (isCpu) {
      const tag = document.createElement('span');
      tag.className = 'cputag';
      tag.textContent = 'CPU';
      bEl.appendChild(tag);
    }
    wrap.appendChild(card);
  });
}

function resetMatchChrome() {
  clearCpuTimer();
  diceHistory = [];
  lastWin = null;
  $('dice-hist').innerHTML = '';
  ($('log') as HTMLElement).innerHTML = '';
  renderDiceFace(6);
  matchStart = Date.now();
  lastTurnName = '';
  lastTurnWasCpu = false;
  matchLive = false;
  $('clock').textContent = '00:00';
  $('round').textContent = 'Round 1';
  $('hint').classList.remove('hidden');
}

// ── save / resume ──────────────────────────────────────────────────────────
function saveMatch() {
  if (!game.players.length || !$('win').classList.contains('hidden')) return;
  try {
    localStorage.setItem(
      'serpent-save',
      JSON.stringify({ ...game.snapshot(), elapsedMs: Date.now() - matchStart }),
    );
  } catch {
    /* private mode — play on regardless */
  }
}
function clearSave() {
  try {
    localStorage.removeItem('serpent-save');
  } catch {
    /* ignore */
  }
}
function loadSave(): (MatchSnapshot & { elapsedMs?: number }) | null {
  try {
    const raw = localStorage.getItem('serpent-save');
    if (!raw) return null;
    const s = JSON.parse(raw) as MatchSnapshot & { elapsedMs?: number };
    return s && s.v === 1 && Array.isArray(s.names) ? s : null;
  } catch {
    return null;
  }
}
function refreshResume() {
  const s = loadSave();
  const btn = $('btn-resume');
  if (s && s.names.length >= 2 && s.names.length <= 4) {
    btn.classList.remove('hidden');
    btn.textContent = `⛵ Resume last voyage — round ${(Math.max(0, s.turnCount | 0)) + 1}`;
  } else {
    btn.classList.add('hidden');
  }
}

// ── Hall of Fame (local legends) ───────────────────────────────────────────
interface HofEntry {
  wins: number;
  games: number;
}
function loadHof(): Record<string, HofEntry> {
  try {
    return JSON.parse(localStorage.getItem('serpent-hof') ?? '{}') as Record<string, HofEntry>;
  } catch {
    return {};
  }
}
function renderHof() {
  const hof = loadHof();
  const top = Object.entries(hof)
    .filter(([, e]) => e && (e.wins > 0 || e.games > 0))
    .sort((a, b) => b[1].wins - a[1].wins || b[1].games - a[1].games)
    .slice(0, 6);
  const wrap = $('hof');
  if (!top.some(([, e]) => e.wins > 0)) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  const list = $('hof-list');
  list.innerHTML = '';
  top.forEach(([name, e]) => {
    const d = document.createElement('div');
    d.className = 'hof-chip';
    const b = document.createElement('b');
    b.textContent = `👑 ${e.wins}`;
    const s = document.createElement('small');
    s.textContent = `${name} · ${e.games} sailed`;
    d.append(b, s);
    list.appendChild(d);
  });
}
function recordWin(players: PlayerState[], winner: PlayerState) {
  try {
    const hof = loadHof();
    players.forEach((p) => {
      const e = hof[p.name] ?? { wins: 0, games: 0 };
      e.games++;
      if (p.def.id === winner.def.id) e.wins++;
      hof[p.name] = e;
    });
    const keys = Object.keys(hof);
    if (keys.length > 24) {
      keys
        .sort((a, b) => hof[a].wins - hof[b].wins)
        .slice(0, keys.length - 24)
        .forEach((k) => delete hof[k]);
    }
    localStorage.setItem('serpent-hof', JSON.stringify(hof));
  } catch {
    /* ignore */
  }
  renderHof();
}

function enterMatch(
  names: string[],
  rules: Rules,
  cpu: boolean[],
  snap?: MatchSnapshot & { elapsedMs?: number },
) {
  lastNames = [...names];
  lastRules = { ...rules };
  lastCpu = [...cpu];
  try {
    localStorage.setItem('serpent-crew', JSON.stringify({ names, cpu, rules }));
  } catch {
    /* private mode — play on regardless */
  }
  clearCpuTimer();
  renderPlayerCards(names, cpu);
  resetMatchChrome();
  $('setup').classList.add('hidden');
  $('win').classList.add('hidden');
  $('pause').classList.add('hidden');
  ['topbar', 'players', 'dice-dock', 'logwrap', 'race'].forEach((id) =>
    $(id).classList.remove('hidden'),
  );
  game.resize();
  if (snap) {
    matchStart = Date.now() - (snap.elapsedMs ?? 0);
    matchLive = true; // the resume log covers the greeting
    if (!game.restore(snap)) {
      game.newGame(names, rules, cpu);
    }
    toast('⛵ Voyage resumed — good luck!');
  } else {
    game.newGame(names, rules, cpu);
  }
  const btn = $('btn-roll') as HTMLButtonElement;
  const active = game.activePlayer;
  btn.disabled = !active || active.isCPU;
  btn.classList.toggle('attention', !!active && !active.isCPU);
  updateRace();
}

function restartMatch() {
  if (!lastNames.length) return;
  enterMatch(lastNames, lastRules, lastCpu);
  toast('↺ New voyage begun!');
}

function quitToMenu() {
  clearCpuTimer();
  $('pause').classList.add('hidden');
  $('win').classList.add('hidden');
  $('hover-chip').classList.add('hidden');
  ['topbar', 'players', 'dice-dock', 'logwrap', 'race', 'hint'].forEach((id) =>
    $(id).classList.add('hidden'),
  );
  $('setup').classList.remove('hidden');
  game.resize();
  refreshResume();
  renderHof();
  toast('⚓ Back at port.');
}

$('btn-start').addEventListener('click', () => {
  sound.unlock();
  sound.startAmbient();
  sound.click();
  const names = currentNames().map((v) => v.trim() || 'Explorer');
  enterMatch(names, readRules(), cpuSeats.slice(0, playerCount));
});

$('btn-resume').addEventListener('click', () => {
  sound.unlock();
  sound.startAmbient();
  sound.click();
  const s = loadSave();
  if (!s) {
    toast('No saved voyage found.');
    return;
  }
  enterMatch([...s.names], { ...lastRules, ...s.rules }, [...(s.cpu ?? [])], s);
});

// ── input: dice, shortcuts, pause ────────────────────────────────────────────
function doRoll() {
  if (game.activePlayer?.isCPU) return; // humans can't roll for silicon sailors
  sound.unlock();
  ($('btn-roll') as HTMLButtonElement).classList.remove('attention');
  void game.rollDice();
}
/** CPU drivers roll through here — same throw, no human gate. */
function doAutoRoll() {
  sound.unlock();
  void game.rollDice();
}
$('btn-roll').addEventListener('click', doRoll);
// the die hops hello when you hover ROLL — delight before the throw
($('btn-roll') as HTMLButtonElement).addEventListener('mouseenter', () => game.nudgeDice());

function openPause() {
  if (!$('setup').classList.contains('hidden')) return; // no match to pause
  if (!$('win').classList.contains('hidden')) return;
  if (!$('help').classList.contains('hidden')) $('help').classList.add('hidden');
  clearCpuTimer(); // freeze silicon sailors mid-ponder
  const p = game.activePlayer;
  $('pause-sub').textContent = p
    ? `${p.isCPU ? '🤖 ' : ''}${p.name} to roll · round ${game.turnCount + 1}`
    : 'The isles wait for your return.';
  try {
    const st = game.stats();
    const label = st.tier === 'low' ? 'Eco' : st.tier === 'balanced' ? 'Balanced' : 'Cinematic';
    $('perf-line').textContent =
      `${label} · ${st.calls} draws · ${(st.tris / 1000).toFixed(0)}k tris · ${game.gpuLine()}`;
  } catch {
    /* still waters */
  }
  $('pause').classList.remove('hidden');
  $('btn-continue').focus();
}
function closePause() {
  $('pause').classList.add('hidden');
  // unfreeze: a waiting CPU resumes pondering where it left off
  const p = game.activePlayer;
  if (p && game.players.length) scheduleCpuRoll(p);
}
$('btn-continue').addEventListener('click', () => {
  sound.click();
  closePause();
});
$('btn-p-restart').addEventListener('click', () => {
  sound.click();
  closePause();
  restartMatch();
});
$('btn-quit').addEventListener('click', () => {
  sound.click();
  quitToMenu();
});

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
  const pauseOpen = !$('pause').classList.contains('hidden');
  if (e.code === 'Space') {
    if (setupOpen || winOpen || helpOpen || pauseOpen) return;
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
  } else if (e.code === 'Escape') {
    if (helpOpen) $('help').classList.add('hidden');
    else if (pauseOpen) closePause();
    else if (!setupOpen && !winOpen) openPause();
  }
});

// ── camera ─────────────────────────────────────────────────────────────────
let directorSaved = true;
try {
  directorSaved = localStorage.getItem('serpent-director') !== '0';
} catch {
  /* ignore */
}
game.setDirector(directorSaved);
document.querySelectorAll('.seg button').forEach((x) =>
  x.classList.toggle('on', (x as HTMLElement).dataset.cam === (directorSaved ? 'auto' : 'follow')),
);
document.querySelectorAll('.seg button').forEach((b) => {
  b.addEventListener('click', () => {
    sound.click();
    document.querySelectorAll('.seg button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    const cam = (b as HTMLElement).dataset.cam!;
    if (cam === 'auto') game.setDirector(true);
    else game.setCameraMode(cam as 'cine' | 'follow' | 'top' | 'free');
    try {
      localStorage.setItem('serpent-director', cam === 'auto' ? '1' : '0');
    } catch {
      /* ignore */
    }
  });
});

// ── top buttons ────────────────────────────────────────────────────────────
function syncGfxSeg() {
  const cur = loadChoice();
  document.querySelectorAll('#gfx-seg button').forEach((x) =>
    x.classList.toggle('on', (x as HTMLElement).dataset.gfx === cur),
  );
}
syncGfxSeg();
document.querySelectorAll('#gfx-seg button').forEach((b) => {
  b.addEventListener('click', () => {
    sound.click();
    const choice = (b as HTMLElement).dataset.gfx as QualityChoice;
    saveChoice(choice);
    syncGfxSeg();
    // geometry bakes to quality at boot — a change needs one reload.
    // the voyage is saved first, so Resume brings it straight back.
    if (resolveChoice(choice) !== Q.tier) {
      saveMatch();
      toast('🎨 Graphics apply after reload — voyage saved.');
      window.setTimeout(() => location.reload(), 900);
    } else {
      toast('🎨 Already sailing at that quality.');
    }
  });
});
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
$('btn-menu').addEventListener('click', () => {
  sound.click();
  openPause();
});
$('btn-rematch').addEventListener('click', () => {
  sound.click();
  enterMatch(lastNames, lastRules, lastCpu);
});
$('btn-change').addEventListener('click', () => {
  sound.click();
  quitToMenu();
});
$('btn-share').addEventListener('click', async () => {
  sound.click();
  if (!lastWin) return;
  const text = `👑 ${lastWin.name} conquered Serpent Isles in ${lastWin.turns} rounds! Think you can take the crown?`;
  try {
    const nav = navigator as Navigator & {
      share?: (d: { title: string; text: string; url: string }) => Promise<void>;
    };
    if (!nav.share) throw new Error('no-share');
    await nav.share({ title: 'Serpent Isles', text, url: location.href });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return; // dismissed — no noise
    try {
      await navigator.clipboard.writeText(`${text} ${location.href}`);
      toast('📋 Victory copied — paste it anywhere!');
    } catch {
      toast(`📣 ${text}`);
    }
  }
});

// hover ticks
document.querySelectorAll('button').forEach((b) => {
  b.addEventListener('mouseenter', () => sound.hover(), { passive: true });
});

// loader out
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    setTimeout(() => $('loader').classList.add('done'), 500);
  }),
);

// local legends + unfinished business
renderHof();
refreshResume();

// PWA: installable offline shell in production builds only
try {
  const prod = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD;
  if (prod && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      (
        navigator as Navigator & { serviceWorker: { register(s: string): Promise<unknown> } }
      ).serviceWorker
        .register('./sw.js')
        .catch(() => undefined);
    });
  }
} catch {
  /* still waters */
}

// hidden demo hook: ?quickplay drops straight into a self-playing 2-CPU swift
// voyage — perfect for attract screens and smoke tests
try {
  if (new URLSearchParams(location.search).get('quickplay') !== null) {
    enterMatch(['Coral', 'Reef'], { ...readRules(), swift: true }, [true, true]);
  }
} catch {
  /* still waters */
}
