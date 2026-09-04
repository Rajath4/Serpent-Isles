// ── Game orchestrator: scene, cameras, turns, cinematic movement ────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildEnvironment } from './environment';
import { buildBoard, type BoardHandles } from './board';
import { buildSnakes, type SnakeHandles } from './snakes';
import { buildLadders, type LadderHandles } from './ladders';
import { buildTokens, type TokenHandles } from './tokens';
import { buildDice, type DiceHandles } from './dice';
import { SoundBank } from './audio';
import {
  PLAYER_DEFS, SNAKES, LADDERS, DEFAULT_RULES,
  TOP_Y, easeInOut, type PlayerDef, type Rules,
} from './constants';

export interface PlayerState {
  def: PlayerDef;
  name: string;
  square: number;
  sixStreak: number;
  rolls: number;
  snakes: number;
  ladders: number;
  active: boolean;
}

export type CameraMode = 'cine' | 'follow' | 'top' | 'free';

interface Callbacks {
  onTurn: (p: PlayerState, idx: number) => void;
  onDice: (value: number, player: PlayerState) => void;
  onLog: (msg: string, kind: 'info' | 'good' | 'bad' | 'roll') => void;
  onWin: (winner: PlayerState, stats: { turns: number }) => void;
  onLock: (locked: boolean) => void;
}

interface Tween {
  t: number;
  dur: number;
  tick: (e: number) => void;
  done: () => void;
}

const tween = (dur: number, tick: (e: number) => void) =>
  new Promise<void>((resolve) => {
    tweens.push({ t: 0, dur, tick, done: resolve });
  });
const tweens: Tween[] = [];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private board: BoardHandles;
  private snakes: SnakeHandles;
  private ladders: LadderHandles;
  private tokens!: TokenHandles;
  private dice: DiceHandles;
  private env: { update: (t: number, dt: number) => void };
  private sound: SoundBank;
  private cb: Callbacks;

  players: PlayerState[] = [];
  current = 0;
  rules: Rules = { ...DEFAULT_RULES };
  turnCount = 0;
  busy = false;
  cameraMode: CameraMode = 'cine';
  private camTween: { t: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3 } | null = null;
  private elapsed = 0;

  constructor(private canvas: HTMLCanvasElement, sound: SoundBank, cb: Callbacks) {
    this.sound = sound;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene.background = new THREE.Color(0x0b1035);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(26, 20, 30);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 60;
    this.controls.target.set(0, 0.4, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;

    this.env = buildEnvironment(this.scene);
    this.board = buildBoard(this.scene);
    this.snakes = buildSnakes(this.scene);
    this.ladders = buildLadders(this.scene);
    this.tokens = buildTokens(this.scene, PLAYER_DEFS);
    this.dice = buildDice(this.scene, () => this.sound.diceLand());

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // intro sweep
    this.flyTo(new THREE.Vector3(11.5, 10, 15.5), new THREE.Vector3(0, 0.2, 0), 3.2);

    const clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      this.elapsed += dt;
      const t = this.elapsed;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        tw.tick(easeInOut(k));
        if (k >= 1) {
          tweens.splice(i, 1);
          tw.done();
        }
      }
      if (this.camTween) {
        const c = this.camTween;
        c.t += dt;
        const k = easeInOut(Math.min(1, c.t / c.dur));
        this.camera.position.lerpVectors(c.p0, c.p1, k);
        this.controls.target.lerpVectors(c.t0, c.t1, k);
        if (c.t >= c.dur) this.camTween = null;
      } else if (this.cameraMode === 'follow' && this.players.length) {
        const p = this.players[this.current];
        const obj = this.tokens.objects.get(p.def.id);
        if (obj && !this.busy) {
          const want = new THREE.Vector3(obj.position.x + 3.4, 5.4, obj.position.z + 6.2);
          this.camera.position.lerp(want, 1 - Math.pow(0.001, dt));
          this.controls.target.lerp(new THREE.Vector3(obj.position.x, 0.6, obj.position.z), 1 - Math.pow(0.0005, dt));
        }
      }
      this.env.update(t, dt);
      this.board.update(t, dt);
      this.snakes.update(t, dt);
      this.ladders.update(t, dt);
      this.dice.update(t, dt);
      this.tokens.update(t, dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── setup ────────────────────────────────────────────────────────────────
  newGame(names: string[], rules: Rules) {
    this.rules = { ...rules };
    this.turnCount = 0;
    this.current = 0;
    this.players = names.map((name, i) => ({
      def: PLAYER_DEFS[i],
      name: name.trim() || PLAYER_DEFS[i].name,
      square: 0,
      sixStreak: 0,
      rolls: 0,
      snakes: 0,
      ladders: 0,
      active: true,
    }));
    // park all tokens, show only playing ones
    PLAYER_DEFS.forEach((d) => {
      const o = this.tokens.objects.get(d.id);
      if (!o) return;
      const playing = d.id < names.length;
      o.visible = playing;
      if (playing) this.tokens.placeInstant(d.id, 0, d.id);
    });
    this.tokens.setActive(this.players[0].def.id);
    this.setCameraMode('follow');
    this.cb.onTurn(this.players[0], 0);
    this.cb.onLog(`⚔️ ${this.players.map((p) => p.name).join(' vs ')} — may the best explorer win!`, 'info');
    this.sound.turn();
  }

  setCameraMode(m: CameraMode) {
    this.cameraMode = m;
    this.controls.autoRotate = m === 'cine';
    if (m === 'cine') this.flyTo(new THREE.Vector3(11.5, 10, 15.5), new THREE.Vector3(0, 0.2, 0), 1.6);
    else if (m === 'top') this.flyTo(new THREE.Vector3(0, 19, 3.2), new THREE.Vector3(0, 0, 0.4), 1.4);
    else if (m === 'follow') {
      const p = this.players[this.current];
      const obj = p ? this.tokens.objects.get(p.def.id) : undefined;
      const at = obj ? obj.position : new THREE.Vector3(0, 0, 0);
      this.flyTo(new THREE.Vector3(at.x + 3.4, 5.4, at.z + 6.2), new THREE.Vector3(at.x, 0.6, at.z), 1.4);
    }
    // 'free' → leave camera where it is
  }

  private flyTo(pos: THREE.Vector3, tgt: THREE.Vector3, dur: number) {
    this.camTween = { t: 0, dur, p0: this.camera.position.clone(), p1: pos.clone(), t0: this.controls.target.clone(), t1: tgt.clone() };
  }

  get activePlayer(): PlayerState | undefined {
    return this.players[this.current];
  }

  slotOf(square: number, exceptId: number): number {
    const sharing = this.players.filter((p) => p.square === square && p.def.id !== exceptId).length;
    return sharing % 4;
  }

  // ── core turn ────────────────────────────────────────────────────────────
  async rollDice(): Promise<void> {
    if (this.busy || !this.players.length) return;
    const player = this.players[this.current];
    this.busy = true;
    this.cb.onLock(true);
    this.sound.dice();

    const value = 1 + Math.floor(Math.random() * 6);
    player.rolls++;
    // cinematic: keep dice in frame briefly
    if (this.cameraMode === 'follow') {
      const obj = this.tokens.objects.get(player.def.id)!;
      this.flyTo(
        new THREE.Vector3((obj.position.x + 9.2) / 2 - 1.5, 7.5, (obj.position.z + 8.6) / 2 + 5.5),
        new THREE.Vector3(4.2, 0.4, 4.2), 0.7,
      );
    }
    await this.dice.roll(value);
    this.cb.onDice(value, player);
    this.board.pulse(Math.max(1, player.square));
    await this.wait(420);

    // third consecutive six → forfeit move (classic rule)
    if (value === 6) {
      player.sixStreak++;
      if (this.rules.extraOnSix && player.sixStreak >= 3) {
        this.cb.onLog(`🎲 ${player.name} rolled a third straight 6 — turn skipped!`, 'bad');
        player.sixStreak = 0;
        await this.wait(500);
        return this.endTurn(false);
      }
    } else {
      player.sixStreak = 0;
    }

    // leaving base?
    if (player.square === 0 && this.rules.startOnSix && value !== 6) {
      this.cb.onLog(`🎲 ${player.name} rolled ${value} — needs a 6 to set sail.`, 'info');
      return this.endTurn(value === 6 && this.rules.extraOnSix);
    }

    let target = player.square + value;
    if (target > 100) {
      if (this.rules.exactFinish) {
        this.cb.onLog(`🎯 ${player.name} rolled ${value} — needs exactly ${100 - player.square}. Stays put.`, 'info');
        return this.endTurn(value === 6 && this.rules.extraOnSix);
      }
      target = 100;
    }
    if (player.square === 0 && target === value) {
      // stepping onto the board from staging
    }

    await this.hopAlong(player, player.square, target);
    player.square = target;
    this.board.pulse(target);

    // snakes / ladders
    if (SNAKES[target] !== undefined) {
      player.snakes++;
      const tail = SNAKES[target];
      this.cb.onLog(`🐍 ${player.name} met the serpent at ${target} — sliding to ${tail}!`, 'bad');
      this.sound.snake();
      this.board.pulse(tail, 0xff3d5a);
      await this.wait(350);
      await this.slideAlong(player, target, tail);
      player.square = tail;
    } else if (LADDERS[target] !== undefined) {
      player.ladders++;
      const top = LADDERS[target];
      this.cb.onLog(`🪜 ${player.name} found a sky-ladder at ${target} — climbing to ${top}!`, 'good');
      this.sound.ladder();
      this.board.pulse(top, 0xffd76e);
      await this.wait(350);
      await this.climbAlong(player, target, top);
      player.square = top;
    } else {
      this.cb.onLog(
        value === 6 ? `🎲 ${player.name} rolled 6 and marched to ${target}.` : `🎲 ${player.name} rolled ${value} → ${target}.`,
        'roll',
      );
    }

    if (value === 6 && this.rules.extraOnSix) this.sound.six();

    // victory
    if (player.square === 100) {
      this.sound.win();
      this.busy = false;
      this.cb.onLock(false);
      this.cb.onWin(player, { turns: this.turnCount + 1 });
      return;
    }

    const keepTurn = value === 6 && this.rules.extraOnSix;
    if (keepTurn) this.cb.onLog(`✨ ${player.name} earned another roll!`, 'good');
    return this.endTurn(keepTurn);
  }

  private endTurn(keep: boolean): Promise<void> {
    if (!keep) {
      this.current = (this.current + 1) % this.players.length;
      this.turnCount++;
      this.sound.turn();
    }
    const p = this.players[this.current];
    this.tokens.setActive(p.def.id);
    if (this.cameraMode === 'follow') {
      const obj = this.tokens.objects.get(p.def.id)!;
      this.flyTo(
        new THREE.Vector3(obj.position.x + 3.4, 5.4, obj.position.z + 6.2),
        new THREE.Vector3(obj.position.x, 0.6, obj.position.z), 1.0,
      );
    }
    this.cb.onTurn(p, this.current);
    this.busy = false;
    this.cb.onLock(false);
    return Promise.resolve();
  }

  private wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  private tokenObj(p: PlayerState) {
    return this.tokens.objects.get(p.def.id)!;
  }

  private async hopAlong(p: PlayerState, from: number, to: number) {
    const obj = this.tokenObj(p);
    const start = from === 0 ? new THREE.Vector3(-6.4, TOP_Y, 6.4) : null;
    if (start) obj.position.copy(start);
    for (let s = from + 1; s <= to; s++) {
      const dest = this.tokens.tokenPos(s, this.slotOf(s, p.def.id));
      const src = obj.position.clone();
      this.sound.hop(s);
      await tween(0.24, (e) => {
        obj.position.lerpVectors(src, dest, e);
        obj.position.y = THREE.MathUtils.lerp(src.y, dest.y, e) + Math.sin(e * Math.PI) * 0.55;
      });
      obj.position.copy(dest);
      this.board.pulse(s, p.def.color);
    }
  }

  private async slideAlong(p: PlayerState, head: number, tail: number) {
    const obj = this.tokenObj(p);
    const curve = this.snakes.curveOf(head);
    if (!curve) {
      obj.position.copy(this.tokens.tokenPos(tail, this.slotOf(tail, p.def.id)));
      return;
    }
    const dest = this.tokens.tokenPos(tail, this.slotOf(tail, p.def.id));
    const dur = 1.5;
    await tween(dur, (e) => {
      const pt = curve.getPoint(e);
      obj.position.lerpVectors(pt, dest, e * e * 0.25);
      obj.position.y = pt.y + 0.25 + Math.sin(e * Math.PI) * 0.15;
    });
    obj.position.copy(dest);
  }

  private async climbAlong(p: PlayerState, foot: number, top: number) {
    const obj = this.tokenObj(p);
    const curve = this.ladders.curveOf(foot);
    if (!curve) {
      obj.position.copy(this.tokens.tokenPos(top, this.slotOf(top, p.def.id)));
      return;
    }
    const dest = this.tokens.tokenPos(top, this.slotOf(top, p.def.id));
    await tween(1.5, (e) => {
      const pt = curve.getPoint(e);
      const wobble = Math.sin(e * Math.PI * 6) * 0.05 * (1 - e);
      obj.position.set(pt.x + wobble, pt.y + 0.32, pt.z);
      if (e > 0.92) obj.position.lerp(dest, (e - 0.92) / 0.08);
    });
    obj.position.copy(dest);
  }
}
