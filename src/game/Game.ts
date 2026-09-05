// ── Game orchestrator: scene, cameras, turns, cinematic movement ────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildEnvironment } from './environment';
import { buildBoard, type BoardHandles } from './board';
import { buildSnakes, type SnakeHandles } from './snakes';
import type { RouteMode } from './snakes';
import { buildLadders, type LadderHandles } from './ladders';
import { buildTokens, type TokenHandles } from './tokens';
import { buildDice, type DiceHandles } from './dice';
import { SoundBank } from './audio';
import { Effects } from './effects';
import { makeGlowTexture } from './environment';
import {
  PLAYER_DEFS, SNAKES, LADDERS, DEFAULT_RULES,
  TOP_Y, easeInOut, smoother, type PlayerDef, type Rules,
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
  onProgress: () => void;
  onHover: (square: number | null, x?: number, y?: number) => void;
}

export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  private env: {
    update: (t: number, dt: number) => void;
    fadeOccluders: (camPos: THREE.Vector3, lookAt: THREE.Vector3) => void;
  };
  private fx: Effects;
  private marker: THREE.Group;
  private markerGlow: THREE.Sprite;
  private tiles: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private pointerClient = { x: 0, y: 0 };
  private pointerOnBoard = false;
  private dragging = false;
  private hovered: number | null = null;

  // — auto director: top overview at rest, tracking on action, drift when idle —
  director = true;
  private trackFn: (() => THREE.Vector3) | null = null;
  private trackOff = new THREE.Vector3(2.6, 3.8, 4.2);
  private lastInteract = -1000;
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

    // studio reflections for jewels, gold & clearcoat — kept low to protect the dusk mood
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if ('environmentIntensity' in this.scene) {
      (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.35;
    }
    pmrem.dispose();

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
    this.controls.autoRotate = !REDUCED_MOTION;
    this.controls.autoRotateSpeed = 0.5;

    this.env = buildEnvironment(this.scene);
    this.board = buildBoard(this.scene);
    this.snakes = buildSnakes(this.scene);
    this.ladders = buildLadders(this.scene);
    this.tokens = buildTokens(this.scene, PLAYER_DEFS);
    this.dice = buildDice(
      this.scene,
      () => this.sound.diceLand(),
      (s) => this.sound.bounce(s),
      (pos) => this.fx.burst(pos, { color: 0xffd76e, count: 2, speed: 0.7, up: 0.5, life: 0.45, size: 0.22, gravity: 0.6 }),
      (pos) => {
        this.fx.ring(pos, 0xffd76e, 1.7, 0.7);
        this.fx.burst(pos, { color: 0xffe1a1, count: 18, speed: 2.4, up: 2.6, life: 0.7, size: 0.3 });
      },
    );
    this.fx = new Effects(this.scene);

    // collect tile meshes for hover raycasts
    this.board.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.square) this.tiles.push(o);
    });

    // floating turn marker — a golden compass diamond over the active champion
    this.marker = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.17),
      new THREE.MeshStandardMaterial({ color: 0xffd76e, emissive: 0xcc8a00, emissiveIntensity: 1.8, metalness: 0.9, roughness: 0.2 }),
    );
    this.marker.add(gem);
    this.markerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: 0xffd76e, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.markerGlow.scale.set(0.9, 0.9, 1);
    this.marker.add(this.markerGlow);
    this.marker.visible = false;
    this.scene.add(this.marker);

    // hover inspector input
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerClient = { x: e.clientX, y: e.clientY };
      this.pointerOnBoard = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointerOnBoard = false;
      if (this.hovered !== null) {
        this.hovered = null;
        this.cb.onHover(null);
      }
    });
    canvas.addEventListener('pointerdown', () => {
      this.dragging = true;
      this.lastInteract = this.elapsed;
      if (this.hovered !== null) {
        this.hovered = null;
        this.cb.onHover(null);
        this.applyHoverFocus(null);
      }
    });
    // deliberate camera input (orbit / zoom) pauses the director's showcase
    canvas.addEventListener('wheel', () => {
      this.lastInteract = this.elapsed;
    }, { passive: true });
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });

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
        // smootherstep: no velocity or acceleration jumps at either end — no whip
        const k = smoother(Math.min(1, c.t / c.dur));
        this.camera.position.lerpVectors(c.p0, c.p1, k);
        this.controls.target.lerpVectors(c.t0, c.t1, k);
        if (c.t >= c.dur) this.camTween = null;
      } else if (this.director && this.trackFn) {
        // action tracking shot — exponential ease, critically damped: it can
        // lag behind the action but never overshoot, so no seasickness
        const anchor = this.trackFn();
        this.camera.position.lerp(anchor.clone().add(this.trackOff), 1 - Math.exp(-dt / 0.32));
        this.controls.target.lerp(anchor.clone().add(new THREE.Vector3(0, 0.5, 0)), 1 - Math.exp(-dt / 0.5));
      } else if (!this.director && this.cameraMode === 'follow' && this.players.length) {
        const p = this.players[this.current];
        const obj = this.tokens.objects.get(p.def.id);
        if (obj && !this.busy) {
          const want = new THREE.Vector3(obj.position.x + 4.0, 6.6, obj.position.z + 7.6);
          this.camera.position.lerp(want, 1 - Math.pow(0.001, dt));
          this.controls.target.lerp(new THREE.Vector3(obj.position.x, 0.4, obj.position.z), 1 - Math.pow(0.0005, dt));
        }
      }
      this.env.update(t, dt);
      this.board.update(t, dt);
      this.snakes.update(t, dt);
      this.ladders.update(t, dt);
      this.dice.update(t, dt);
      this.tokens.update(t, dt);
      this.fx.update(dt);
      // idle showcase: slow drift when the director is on and everyone is AFK
      if (this.director) {
        this.controls.autoRotate =
          !this.busy && !this.trackFn && !this.camTween && this.elapsed - this.lastInteract > 20;
        if (this.controls.autoRotate) this.controls.autoRotateSpeed = 0.45;
      }
      // turn marker rides above the active champion
      if (this.players.length) {
        const p = this.players[this.current];
        const obj = this.tokens.objects.get(p.def.id);
        if (obj?.visible) {
          this.marker.visible = true;
          const bob = REDUCED_MOTION ? 0 : Math.sin(t * 3) * 0.12;
          this.marker.position.set(obj.position.x, obj.position.y + 1.75 + bob, obj.position.z);
          this.marker.rotation.y += REDUCED_MOTION ? 0 : dt * 2.4;
          (this.markerGlow.material as THREE.SpriteMaterial).color.setHex(p.def.color);
        } else {
          this.marker.visible = false;
        }
      } else {
        this.marker.visible = false;
      }
      // hover inspector
      if (this.pointerOnBoard && !this.dragging && this.tiles.length) {
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        const hits = this.raycaster.intersectObjects(this.tiles, false);
        const sq = hits.length ? (hits[0].object.userData.square as number) : null;
        if (sq !== this.hovered) {
          this.hovered = sq;
          this.applyHoverFocus(sq);
          this.cb.onHover(sq, this.pointerClient.x, this.pointerClient.y);
        } else if (sq !== null) {
          this.cb.onHover(sq, this.pointerClient.x, this.pointerClient.y);
        }
      }
      this.controls.update();
      // foliage can never block the lens — ghost whatever stands in the way
      this.env.fadeOccluders(this.camera.position, this.controls.target);
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
    if (this.director) this.flyOverview();
    else this.setCameraMode('follow');
    this.board.pulse(1);
    this.cb.onTurn(this.players[0], 0);
    this.cb.onProgress();
    this.cb.onLog(`⚔️ ${this.players.map((p) => p.name).join(' vs ')} — may the best explorer win!`, 'info');
    this.sound.turn();
  }

  setCameraMode(m: CameraMode) {
    this.cameraMode = m;
    this.director = false; // a manual choice always wins over the director
    this.trackFn = null;
    this.controls.autoRotate = m === 'cine' && !REDUCED_MOTION;
    if (m === 'cine') this.flyTo(new THREE.Vector3(11.5, 10, 15.5), new THREE.Vector3(0, 0.2, 0), 1.6);
    else if (m === 'top') this.flyTo(new THREE.Vector3(0, 19, 3.2), new THREE.Vector3(0, 0, 0.4), 1.4);
    else if (m === 'follow') {
      const p = this.players[this.current];
      const obj = p ? this.tokens.objects.get(p.def.id) : undefined;
      const at = obj ? obj.position : new THREE.Vector3(0, 0, 0);
      this.flyTo(new THREE.Vector3(at.x + 4.0, 6.6, at.z + 7.6), new THREE.Vector3(at.x, 0.4, at.z), 1.4);
    }
    // 'free' → leave camera where it is
  }

  /** Hand the camera to the auto director (top home, action tracking, idle drift). */
  setDirector(on: boolean) {
    this.director = on;
    this.trackFn = null;
    this.controls.autoRotate = false;
    if (on && !this.busy && this.players.length) this.flyOverview();
  }

  /** Broadcast home: tilted-top view reading the whole board + dice pad. */
  private flyOverview() {
    const s = this.camera.aspect < 0.9 ? 1.55 : this.camera.aspect < 1.3 ? 1.2 : 1;
    this.trackFn = null;
    this.flyTo(new THREE.Vector3(0, 16.5 * s, 8.5 * s), new THREE.Vector3(0.8, 0, 1.2), 1.5);
  }

  /** Dice close-up: shot from open water, zero foliage in the lane. */
  private frameDice() {
    this.trackFn = null;
    this.flyTo(new THREE.Vector3(15.5, 4.2, 5.2), new THREE.Vector3(10.4, 0.5, 4.6), 1.0);
  }

  private flyTo(pos: THREE.Vector3, tgt: THREE.Vector3, dur: number) {
    this.camTween = { t: 0, dur, p0: this.camera.position.clone(), p1: pos.clone(), t0: this.controls.target.clone(), t1: tgt.clone() };
  }

  /** Spotlight the route(s) touching a square; everything else falls back. */
  private applyHoverFocus(sq: number | null) {
    let snakeHead: number | null = null;
    let ladderFoot: number | null = null;
    if (sq !== null) {
      if (SNAKES[sq] !== undefined) snakeHead = sq;
      else {
        for (const [h, t] of Object.entries(SNAKES)) {
          if (t === sq) {
            snakeHead = Number(h);
            break;
          }
        }
      }
      if (LADDERS[sq] !== undefined) ladderFoot = sq;
      else {
        for (const [f, t] of Object.entries(LADDERS)) {
          if (t === sq) {
            ladderFoot = Number(f);
            break;
          }
        }
      }
    }
    this.snakes.spotlight(snakeHead);
    this.ladders.spotlight(ladderFoot);
    this.snakes.setDimAll(ladderFoot !== null);
    this.ladders.setDimAll(snakeHead !== null);
  }

  /** Global route visibility: full detail, ghost outlines, or board-only. */
  routeMode: RouteMode = 'full';

  setRouteMode(m: RouteMode) {
    this.routeMode = m;
    this.snakes.setRouteMode(m);
    this.ladders.setRouteMode(m);
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
    // director: cut to the dice close-up for the throw
    if (this.director) this.frameDice();
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
      this.fx.landPoof(this.tokenObj(player).position.clone().add(new THREE.Vector3(0, 0.15, 0)), player.def.color);
    }
    this.cb.onProgress();
    this.trackFn = null; // release the tracking shot before the next beat

    if (value === 6 && this.rules.extraOnSix) this.sound.six();

    // victory
    if (player.square === 100) {
      this.celebrate(player);
      this.sound.win();
      this.busy = false;
      this.cb.onLock(false);
      this.cb.onProgress();
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
    this.board.pulse(Math.max(1, p.square), p.def.color);
    if (this.director) {
      // settle home — unless the player just grabbed the camera themselves
      if (this.elapsed - this.lastInteract > 6) this.flyOverview();
    } else if (this.cameraMode === 'follow') {
      const obj = this.tokens.objects.get(p.def.id)!;
      this.flyTo(
        new THREE.Vector3(obj.position.x + 4.0, 6.6, obj.position.z + 7.6),
        new THREE.Vector3(obj.position.x, 0.4, obj.position.z), 1.0,
      );
    }
    this.cb.onTurn(p, this.current);
    this.cb.onProgress();
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
    if (this.director) {
      // tracking shot glued to the hopping champion
      this.trackFn = () => obj.position.clone();
      this.trackOff.set(2.6, 3.8, 4.2);
    }
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
      this.fx.dust(dest);
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
    this.fx.snakePoof(obj.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
    if (this.director) {
      // low dramatic chase down the serpent's back
      this.trackFn = () => obj.position.clone();
      this.trackOff.set(3.4, 2.8, 4.8);
    }
    const dest = this.tokens.tokenPos(tail, this.slotOf(tail, p.def.id));
    const dur = 1.5;
    await tween(dur, (e) => {
      const pt = curve.getPoint(e);
      obj.position.lerpVectors(pt, dest, e * e * 0.25);
      obj.position.y = pt.y + 0.25 + Math.sin(e * Math.PI) * 0.15;
    });
    obj.position.copy(dest);
    this.fx.ring(dest, p.def.color, 1.2, 0.6);
    this.cb.onProgress();
  }

  private async climbAlong(p: PlayerState, foot: number, top: number) {
    const obj = this.tokenObj(p);
    const curve = this.ladders.curveOf(foot);
    if (!curve) {
      obj.position.copy(this.tokens.tokenPos(top, this.slotOf(top, p.def.id)));
      return;
    }
    const dest = this.tokens.tokenPos(top, this.slotOf(top, p.def.id));
    this.fx.ladderSparkle(obj.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    if (this.director) {
      this.trackFn = () => obj.position.clone();
      this.trackOff.set(3.4, 2.8, 4.8);
    }
    await tween(1.5, (e) => {
      const pt = curve.getPoint(e);
      const wobble = Math.sin(e * Math.PI * 6) * 0.05 * (1 - e);
      obj.position.set(pt.x + wobble, pt.y + 0.32, pt.z);
      if (e > 0.92) obj.position.lerp(dest, (e - 0.92) / 0.08);
    });
    obj.position.copy(dest);
    this.fx.ladderSparkle(dest.clone().add(new THREE.Vector3(0, 0.4, 0)));
    this.cb.onProgress();
  }

  /** Coronation moment: swoop the camera in + fountains of gold over square 100. */
  celebrate(winner: PlayerState) {
    const obj = this.tokens.objects.get(winner.def.id);
    if (!obj) return;
    this.trackFn = null;
    this.flyTo(
      new THREE.Vector3(obj.position.x + 2.8, 3.6, obj.position.z + 4.4),
      new THREE.Vector3(obj.position.x, 1.0, obj.position.z),
      1.8,
    );
    const at = new THREE.Vector3(obj.position.x, TOP_Y + 0.5, obj.position.z);
    this.fx.crownFountain(at);
    this.board.pulse(100, 0xffe1a1);
    if (!REDUCED_MOTION) {
      setTimeout(() => this.fx.crownFountain(at), 700);
      setTimeout(() => this.fx.crownFountain(at), 1500);
    }
  }
}
