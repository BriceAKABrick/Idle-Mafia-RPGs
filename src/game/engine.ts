import { sfx } from './audio';
import {
  BOSS_NAMES_BY_STAGE,
  COMPANIONS,
  getZoneForStage,
  JOBS,
  MAPLE_RANKS,
  WEAPONS,
} from './constants';
import {
  computeStats,
  formatNum,
  getEffectiveLiveOpsBonuses,
  getFeverDuration,
  getStageExpReward,
  getStageMesoReward,
  getStageMonsterAtk,
  getStageMonsterHp,
  sanitizeNum,
} from './progression';
import { resetClockMonitor, sampleClockDrift } from './security';
import { HeroFrame, MonsterSpriteId, sprites } from './sprites';
import {
  ArenaMatchResult,
  ArenaTimelineEvent,
  ClanSiegeLaunchPayload,
  ClanSiegeResult,
  CombatMode,
  CompanionId,
  GameMode,
  LiveSnapshot,
  PlayerSaveState,
  RelicId,
  ZoneId,
} from './types';

export const CANVAS_W = 320;
export const CANVAS_H = 210;
const GROUND_Y = 166;
const HERO_X = 64;

interface MonsterEntity {
  uid: number;
  spriteId: MonsterSpriteId;
  name: string;
  x: number;
  y: number;
  vy: number;
  hp: number;
  maxHp: number;
  atk: number;
  isBoss: boolean;
  isChaosElite?: boolean;
  isZakumArm?: boolean;
  isZakumBody?: boolean;
  armSide?: 'left' | 'right';
  armIndex?: number;
  scale: number;
  flashTimer: number;
  atkTimer: number;
  windupTimer: number;
  hopPhase: number;
  squash: number;
}

interface HazardPillar {
  x: number;
  warnTimer: number;
  eruptTimer: number;
  damaged: boolean;
}

interface ProjectileEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  kind: 'arrow' | 'orb' | 'star' | 'meteor' | 'comp' | 'rain_arrow';
  targetUid: number | null;
  targetPoint?: { x: number; y: number };
  dmg: number;
  isCrit: boolean;
  aoe: boolean;
  spin: number;
  life: number;
}

interface SlashEffect {
  x: number;
  y: number;
  color: string;
  radius: number;
  life: number;
  maxLife: number;
  kind: 'arc' | 'ring' | 'lightning' | 'hammer';
  points?: Array<{ x: number; y: number }>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  gravity: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  color: string;
  stroke: string;
  isCrit: boolean;
  isDmg: boolean;
  age: number;
  life: number;
  maxLife: number;
}

interface DropEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'meso' | 'exp' | 'diamond' | 'chaos_core';
  amount: number;
  age: number;
  magnetized: boolean;
}

export interface EngineCallbacks {
  onKillMonster: (
    isBoss: boolean,
    mesos: number,
    exp: number,
    diamonds: number,
    chaosCores: number
  ) => void;
  onWaveCleared: () => void;
  onBossVictory: (diamonds: number, mesos: number) => void;
  onBossFailed: () => void;
  onDungeonComplete: (mode: 'DUNGEON_MESO' | 'DUNGEON_JEWEL', reward: number) => void;
  onZakumVictory: (droppedRelic: RelicId, diamonds: number, starStones: number, styleTickets: number) => void;
  onZakumFailed: () => void;
  onArenaMatchComplete: (result: ArenaMatchResult) => void;
  onClanSiegeComplete: (result: ClanSiegeResult) => void;
  onSnapshot: (snap: LiveSnapshot) => void;
  onSpeedhackDetected?: (reason: string) => void;
}

export class MapleEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTime = 0;
  private lastRenderAt = 0;
  private lowPowerMode = false;
  private speedhackNotified = false;

  private save: PlayerSaveState;
  private callbacks: EngineCallbacks;
  private gameMode: GameMode = 'TITLE_MENU';

  // World / Parallax
  private cameraX = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private hitStopTimer = 0;
  private waveTransitionTimer = 0;
  private animClock = 0;

  // Combat state
  private combatMode: CombatMode = 'FARMING';
  private heroHp = 200;
  private heroMaxHp = 200;
  private heroAtkTimer = 0;
  private heroSwingTimer = 0;
  private heroReviveTimer = 0;
  private heroFlashTimer = 0;
  private heroAttackCounter = 0;

  // Fever Time & Real DPS Meter
  private feverCharge = 0; // 0..100
  private feverTimer = 0; // 0..20s
  private damageLog: Array<{ t: number; dmg: number }> = [];

  private skillCooldowns: Record<string, number> = {};
  private companionTimers: Record<string, number> = {};

  private bossTimer = 0;
  private dungeonScore = 0;
  private dungeonTime = 0;
  private zakumTimer = 0;
  private zakumPillarCooldown = 2.4;
  private hazards: HazardPillar[] = [];

  private uidCounter = 1;
  private monsters: MonsterEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private slashes: SlashEffect[] = [];
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private drops: DropEntity[] = [];

  // 1v1 Henesys Colosseum PvP playback state
  private arenaMatch: ArenaMatchResult | null = null;
  private arenaClock = 0;
  private arenaEventIdx = 0;
  private arenaPlayerHp = 0;
  private arenaRivalHp = 0;
  private arenaPlayerX = 78;
  private arenaRivalX = 242;
  private arenaPlayerSwing = 0;
  private arenaRivalSwing = 0;
  private arenaPlayerFlash = 0;
  private arenaRivalFlash = 0;
  private arenaPlayerStun = 0;
  private arenaRivalStun = 0;
  private arenaFinishTimer = 0;
  private arenaCompletedFired = false;
  private arenaSpeedMult: 1 | 2 = 1;

  // Clan War Territory Siege state
  private siegePayload: ClanSiegeLaunchPayload | null = null;
  private siegeStatueHp = 0;
  private siegeStatueMaxHp = 1;
  private siegeStatueDmg = 0;
  private siegeTimer = 10;
  private siegeStatueFlash = 0;
  private siegeStatueAtkCd = 0;
  private siegeCompCds: Record<string, number> = {};
  private siegeCompleted = false;

  private snapshotTimer = 0;
  private ambientSpores: Array<{ x: number; y: number; speed: number; phase: number }> = [];

  constructor(canvas: HTMLCanvasElement, initialSave: PlayerSaveState, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    this.save = initialSave;
    this.lowPowerMode = Boolean(initialSave.lowPowerMode);
    this.callbacks = callbacks;

    const stats = computeStats(this.save);
    this.heroMaxHp = stats.maxHp;
    this.heroHp = stats.maxHp;

    for (let i = 0; i < 18; i++) {
      this.ambientSpores.push({
        x: Math.random() * CANVAS_W,
        y: 30 + Math.random() * (GROUND_Y - 40),
        speed: 6 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
      });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityReset);
    }

    this.spawnWave();
  }

  private handleVisibilityReset = () => {
    resetClockMonitor();
    this.lastTime = performance.now();
  };

  setLowPowerMode(enabled: boolean) {
    this.lowPowerMode = Boolean(enabled);
  }

  start() {
    if (this.rafId !== null) return;
    resetClockMonitor();
    this.lastTime = performance.now();
    this.lastRenderAt = this.lastTime;
    const loop = (now: number) => {
      const minFrameMs = this.lowPowerMode ? 33 : 0;
      if (minFrameMs > 0 && now - this.lastRenderAt < minFrameMs) {
        this.rafId = requestAnimationFrame(loop);
        return;
      }
      this.lastRenderAt = now;

      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const drift = sampleClockDrift();
      if (drift.speedhackSuspected && !this.speedhackNotified) {
        this.speedhackNotified = true;
        this.callbacks.onSpeedhackDetected?.('TIME_SCALE_SPEEDHACK');
      }
      const dt = Math.min(Math.max(rawDt, 0.001), Math.min(0.1, Math.max(0.015, drift.safeDtCap)));
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityReset);
    }
  }

  setGameMode(mode: GameMode) {
    this.gameMode = mode;
  }

  syncSave(nextSave: PlayerSaveState) {
    const prevMaxHp = this.heroMaxHp;
    this.save = nextSave;
    const stats = computeStats(nextSave);
    this.heroMaxHp = stats.maxHp;
    if (stats.maxHp > prevMaxHp) {
      this.heroHp += stats.maxHp - prevMaxHp;
    }
    this.heroHp = Math.min(this.heroHp, this.heroMaxHp);
  }

  resetForTranscendence(nextSave: PlayerSaveState) {
    this.save = nextSave;
    const stats = computeStats(nextSave);
    this.heroMaxHp = stats.maxHp;
    this.heroHp = stats.maxHp;
    this.combatMode = 'FARMING';
    this.waveTransitionTimer = 0;
    this.hitStopTimer = 0;
    this.heroReviveTimer = 0;
    this.hazards = [];
    this.projectiles = [];
    this.slashes = [];
    this.drops = [];
    this.damageLog = [];
    this.spawnWave();
    this.emitSnapshot();
  }

  triggerBossChallenge() {
    if (this.combatMode !== 'FARMING') return;
    sfx.playBossHorn();
    this.combatMode = 'BOSS';
    this.bossTimer = 30;
    this.waveTransitionTimer = 0;
    this.hitStopTimer = 0;
    this.heroReviveTimer = 0;
    this.hazards = [];
    this.monsters = [];
    this.projectiles = [];
    this.slashes = [];
    this.heroHp = this.heroMaxHp;
    this.spawnStageBoss();
    this.emitSnapshot();
  }

  triggerZakumExpedition() {
    if (this.combatMode !== 'FARMING') return;
    sfx.playBossHorn();
    this.combatMode = 'EXPEDITION_ZAKUM';
    this.zakumTimer = 60;
    this.zakumPillarCooldown = 2.2;
    this.waveTransitionTimer = 0;
    this.hitStopTimer = 0;
    this.heroReviveTimer = 0;
    this.hazards = [];
    this.monsters = [];
    this.projectiles = [];
    this.slashes = [];
    this.drops = [];
    this.heroHp = this.heroMaxHp;
    this.spawnZakumBoss();
    this.emitSnapshot();
  }

  triggerDungeon(mode: 'DUNGEON_MESO' | 'DUNGEON_JEWEL') {
    sfx.playBossHorn();
    this.combatMode = mode;
    this.dungeonTime = 15;
    this.dungeonScore = 0;
    this.waveTransitionTimer = 0;
    this.hitStopTimer = 0;
    this.heroReviveTimer = 0;
    this.hazards = [];
    this.monsters = [];
    this.projectiles = [];
    this.slashes = [];
    this.drops = [];
    this.heroHp = this.heroMaxHp;

    const stats = computeStats(this.save);
    const massiveHp = Math.max(5000, stats.combatPower * 800);
    const isMeso = mode === 'DUNGEON_MESO';

    this.monsters.push({
      uid: this.uidCounter++,
      spriteId: isMeso ? 'boss_golden_pig' : 'boss_crystal_golem',
      name: isMeso ? 'Armored Brinks Truck' : 'Treasury Vault Safe',
      x: 235,
      y: GROUND_Y,
      vy: 0,
      hp: massiveHp,
      maxHp: massiveHp,
      atk: 0,
      isBoss: true,
      scale: 2.5,
      flashTimer: 0,
      atkTimer: 99,
      windupTimer: 0,
      hopPhase: 0,
      squash: 1,
    });
    this.emitSnapshot();
  }

  triggerArenaPvp(match: ArenaMatchResult) {
    sfx.playBossHorn();
    this.combatMode = 'ARENA_PVP';
    this.arenaMatch = match;
    this.arenaClock = 0;
    this.arenaEventIdx = 0;
    this.arenaPlayerHp = match.playerMaxHp;
    this.arenaRivalHp = match.rivalMaxHp;
    this.arenaPlayerX = 78;
    this.arenaRivalX = 242;
    this.arenaPlayerSwing = 0;
    this.arenaRivalSwing = 0;
    this.arenaPlayerFlash = 0;
    this.arenaRivalFlash = 0;
    this.arenaPlayerStun = 0;
    this.arenaRivalStun = 0;
    this.arenaFinishTimer = 0;
    this.arenaCompletedFired = false;
    this.waveTransitionTimer = 0;
    this.hitStopTimer = 0;
    this.hazards = [];
    this.monsters = [];
    this.projectiles = [];
    this.slashes = [];
    this.drops = [];
    this.particles = [];
    this.texts = [];
    this.spawnLootText(CANVAS_W / 2, 76, 'FIGHT CLUB DUEL!', '#fbbf24');
    this.emitSnapshot();
  }

  setArenaSpeed(mult: 1 | 2) {
    this.arenaSpeedMult = mult;
  }

  exitArenaPvp() {
    if (this.combatMode !== 'ARENA_PVP') return;
    this.arenaMatch = null;
    this.combatMode = 'FARMING';
    this.projectiles = [];
    this.slashes = [];
    this.particles = [];
    this.texts = [];
    this.heroHp = this.heroMaxHp;
    this.spawnWave();
    this.emitSnapshot();
  }

  triggerClanSiege(payload: ClanSiegeLaunchPayload) {
    sfx.playBossHorn();
    this.combatMode = 'CLAN_SIEGE';
    this.siegePayload = payload;
    this.siegeCompleted = false;
    this.waveTransitionTimer = 0;
    this.hitStopTimer = 0;
    this.hazards = [];
    this.monsters = [];
    this.projectiles = [];
    this.slashes = [];
    this.drops = [];
    this.particles = [];
    this.texts = [];

    if (payload.targetType === 'defender' && payload.duelMatch) {
      const match = payload.duelMatch;
      this.arenaMatch = match;
      this.arenaClock = 0;
      this.arenaEventIdx = 0;
      this.arenaPlayerHp = match.playerMaxHp;
      this.arenaRivalHp = match.rivalMaxHp;
      this.arenaPlayerX = 78;
      this.arenaRivalX = 242;
      this.arenaPlayerSwing = 0;
      this.arenaRivalSwing = 0;
      this.arenaPlayerFlash = 0;
      this.arenaRivalFlash = 0;
      this.arenaPlayerStun = 0;
      this.arenaRivalStun = 0;
      this.arenaFinishTimer = 0;
      this.arenaCompletedFired = false;
      this.spawnLootText(CANVAS_W / 2, 76, `TURF RAID: ${payload.laneName}`, '#fbbf24');
    } else {
      this.arenaMatch = null;
      this.siegeStatueHp = payload.statueHp;
      this.siegeStatueMaxHp = Math.max(1, payload.statueMaxHp);
      this.siegeStatueDmg = 0;
      this.siegeTimer = 10;
      this.siegeStatueFlash = 0;
      this.siegeStatueAtkCd = 0.25;
      this.siegeCompCds = {};
      this.save.equippedCompanions.forEach((cid, i) => {
        this.siegeCompCds[cid] = 0.4 + i * 0.3;
      });
      this.spawnLootText(CANVAS_W / 2, 74, 'CRACK FAMILY SAFE!', '#f97316');
    }

    this.emitSnapshot();
  }

  exitClanSiege() {
    if (this.combatMode !== 'CLAN_SIEGE') return;
    this.siegePayload = null;
    this.arenaMatch = null;
    this.combatMode = 'FARMING';
    this.projectiles = [];
    this.slashes = [];
    this.particles = [];
    this.texts = [];
    this.heroHp = this.heroMaxHp;
    this.spawnWave();
    this.emitSnapshot();
  }

  castSkillManual(skillId: string) {
    if (this.gameMode !== 'PLAYING' || this.heroReviveTimer > 0) return;
    const rem = this.skillCooldowns[skillId] || 0;
    if (rem > 0) return;
    const job = JOBS[this.save.job];
    const skill = job.skills.find((s) => s.id === skillId);
    const lv = this.save.skillLevels[skillId] || 0;
    if (!skill || lv <= 0 || this.monsters.length === 0) return;
    this.executeSkill(skillId);
  }

  private getZoneMonsterPool(zone: ZoneId): MonsterSpriteId[] {
    if (zone === 'little_italy') return ['orange_mushroom', 'ribbon_pig', 'stump'];
    if (zone === 'docks') return ['curse_eye', 'orange_mushroom', 'stump'];
    if (zone === 'financial') return ['slime', 'stump', 'ribbon_pig'];
    if (zone === 'casino') return ['ribbon_pig', 'stump', 'wild_boar'];
    return ['wild_boar', 'slime', 'stump'];
  }

  private getMonsterDisplayName(id: MonsterSpriteId): string {
    const map: Record<MonsterSpriteId, string> = {
      orange_mushroom: 'Street Thug',
      slime: 'Corrupt Beat Cop',
      ribbon_pig: 'Club Bouncer',
      stump: 'Rival Enforcer',
      curse_eye: 'Dock Smuggler',
      wild_boar: 'Armored SWAT',
      boss_mushmom: 'Street Captain',
      boss_king_slime: 'Rival Don',
      boss_faust: 'Harbor Boss',
      boss_balrog: 'Kingpin Heavy',
      boss_golden_pig: 'Armored Brinks Truck',
      boss_crystal_golem: 'Treasury Vault Safe',
    };
    return map[id];
  }

  private spawnWave() {
    this.monsters = [];
    const stage = this.save.stage;
    const zoneInfo = getZoneForStage(stage);
    const pool = this.getZoneMonsterPool(zoneInfo.id);
    const count = 3 + (stage % 3);

    const baseHp = getStageMonsterHp(stage, false);
    const baseAtk = getStageMonsterAtk(stage, false);

    for (let i = 0; i < count; i++) {
      const spriteId = pool[(stage + i) % pool.length];
      this.monsters.push({
        uid: this.uidCounter++,
        spriteId,
        name: this.getMonsterDisplayName(spriteId),
        x: 205 + i * 24 + Math.random() * 8,
        y: GROUND_Y,
        vy: 0,
        hp: baseHp,
        maxHp: baseHp,
        atk: baseAtk,
        isBoss: false,
        isChaosElite: zoneInfo.isChaos,
        scale: zoneInfo.isChaos ? 1.42 : 1.35,
        flashTimer: 0,
        atkTimer: 1.2 + Math.random() * 0.8,
        windupTimer: 0,
        hopPhase: Math.random() * Math.PI * 2,
        squash: 1,
      });
    }
  }

  private spawnStageBoss() {
    const stage = this.save.stage;
    const zoneInfo = getZoneForStage(stage);
    let spriteId: MonsterSpriteId = 'boss_mushmom';
    if (stage % 10 === 0) spriteId = 'boss_king_slime';
    else if (zoneInfo.id === 'docks') spriteId = 'boss_faust';
    else if (zoneInfo.id === 'financial' || zoneInfo.id === 'casino' || zoneInfo.id === 'lockdown' || stage >= 20) spriteId = 'boss_balrog';

    const bossHp = getStageMonsterHp(stage, true);
    const bossAtk = getStageMonsterAtk(stage, true);
    const rawName = BOSS_NAMES_BY_STAGE[stage] || `${zoneInfo.worldLabel} ${this.getMonsterDisplayName(spriteId)}`;
    const bossName = zoneInfo.isChaos && !rawName.startsWith('Most Wanted') ? `Most Wanted ${rawName}` : rawName;

    this.monsters.push({
      uid: this.uidCounter++,
      spriteId,
      name: bossName,
      x: 235,
      y: GROUND_Y,
      vy: 0,
      hp: bossHp,
      maxHp: bossHp,
      atk: bossAtk,
      isBoss: true,
      isChaosElite: zoneInfo.isChaos,
      scale: 2.35,
      flashTimer: 0,
      atkTimer: 2.0,
      windupTimer: 0,
      hopPhase: 0,
      squash: 1,
    });
  }

  private spawnZakumBoss() {
    const stats = computeStats(this.save);
    // Tuned as an exciting 60s raid race scaled safely with CP & 1.16 stage curve
    const stageBossScale = getStageMonsterHp(this.save.stage, true) * 1.25;
    const scaleHp = sanitizeNum(Math.max(2400, stats.combatPower * 18 + stageBossScale), 2400);
    const armHp = Math.max(220, Math.floor(scaleHp * 0.11));
    const bodyHp = Math.max(900, Math.floor(scaleHp * 0.45));
    const baseAtk = Math.max(12, Math.floor(stats.maxHp * 0.09));

    const armYOffsets = [-56, -34, -14];

    // 3 Left Security Turrets (frontline targets)
    for (let i = 0; i < 3; i++) {
      this.monsters.push({
        uid: this.uidCounter++,
        spriteId: 'boss_balrog',
        name: `Vault Turret L-${i + 1}`,
        x: 192 - (i % 2) * 8,
        y: GROUND_Y + armYOffsets[i],
        vy: 0,
        hp: armHp,
        maxHp: armHp,
        atk: Math.floor(baseAtk * 0.5),
        isBoss: false,
        isZakumArm: true,
        armSide: 'left',
        armIndex: i,
        scale: 1.5,
        flashTimer: 0,
        atkTimer: 99,
        windupTimer: 0,
        hopPhase: i * 1.1,
        squash: 1,
      });
    }

    // 3 Right Security Turrets
    for (let i = 0; i < 3; i++) {
      this.monsters.push({
        uid: this.uidCounter++,
        spriteId: 'boss_balrog',
        name: `Vault Turret R-${i + 1}`,
        x: 274 + (i % 2) * 8,
        y: GROUND_Y + armYOffsets[i],
        vy: 0,
        hp: armHp,
        maxHp: armHp,
        atk: Math.floor(baseAtk * 0.5),
        isBoss: false,
        isZakumArm: true,
        armSide: 'right',
        armIndex: i,
        scale: 1.5,
        flashTimer: 0,
        atkTimer: 99,
        windupTimer: 0,
        hopPhase: i * 1.1 + 1.5,
        squash: 1,
      });
    }

    // Federal Reserve Main Vault (centered behind turrets)
    this.monsters.push({
      uid: this.uidCounter++,
      spriteId: 'boss_balrog',
      name: 'Federal Reserve Vault',
      x: 234,
      y: GROUND_Y - 4,
      vy: 0,
      hp: bodyHp,
      maxHp: bodyHp,
      atk: baseAtk,
      isBoss: true,
      isZakumBody: true,
      scale: 2.35,
      flashTimer: 0,
      atkTimer: 2.5,
      windupTimer: 0,
      hopPhase: 0,
      squash: 1,
    });
  }

  private addShake(intensity: number, duration = 0.14) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  private spawnParticles(x: number, y: number, color: string, count: number, speed = 70) {
    const cap = this.lowPowerMode ? 45 : 130;
    const n = this.lowPowerMode ? Math.max(1, Math.ceil(count * 0.5)) : count;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > cap) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.75) * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20,
        color,
        size: Math.random() < 0.4 ? 3 : 2,
        life: 0.28 + Math.random() * 0.25,
        maxLife: 0.5,
        gravity: true,
      });
    }
  }

  private spawnDamageText(x: number, y: number, dmg: number, isCrit: boolean) {
    if (this.texts.length > 42) this.texts.shift();
    const spreadVx = (Math.random() - 0.5) * (isCrit ? 34 : 26);
    this.texts.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y - 16,
      vx: spreadVx,
      vy: isCrit ? -68 : -48,
      text: isCrit ? `${formatNum(dmg)}!` : formatNum(dmg),
      color: isCrit ? '#fb923c' : '#fde047',
      stroke: isCrit ? '#450a0a' : '#1e1b2e',
      isCrit,
      isDmg: true,
      age: 0,
      life: isCrit ? 0.85 : 0.65,
      maxLife: isCrit ? 0.85 : 0.65,
    });
  }

  private spawnLootText(x: number, y: number, label: string, color: string) {
    this.texts.push({
      x,
      y: y - 10,
      vx: 0,
      vy: -24,
      text: label,
      color,
      stroke: '#0f172a',
      isCrit: false,
      isDmg: false,
      age: 0,
      life: 0.65,
      maxLife: 0.65,
    });
  }

  private recordDamage(dmg: number) {
    this.damageLog.push({ t: this.animClock, dmg });
  }

  private update(dt: number) {
    this.animClock += dt;

    // Prune rolling 3s DPS log
    while (this.damageLog.length > 0 && this.animClock - this.damageLog[0].t > 3.0) {
      this.damageLog.shift();
    }

    // Update ambient spores / embers
    for (const sp of this.ambientSpores) {
      sp.y -= sp.speed * dt;
      sp.x += Math.sin(this.animClock * 1.5 + sp.phase) * 8 * dt;
      if (sp.y < 15) {
        sp.y = GROUND_Y - 4;
        sp.x = Math.random() * CANVAS_W;
      }
    }

    if (this.gameMode === 'TITLE_MENU') {
      this.cameraX += 26 * dt;
      for (const m of this.monsters) {
        m.hopPhase += dt * 4;
      }
      return;
    }

    if (this.gameMode === 'PAUSED') return;

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      if (this.shakeTimer === 0) this.shakeIntensity = 0;
    }

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    // Fever Time countdown
    if (this.feverTimer > 0) {
      this.feverTimer = Math.max(0, this.feverTimer - dt);
      if (this.feverTimer === 0) {
        sfx.setFever(false);
      }
    }

    if (this.combatMode === 'ARENA_PVP') {
      this.updateArenaPvp(dt);
      return;
    }

    if (this.combatMode === 'CLAN_SIEGE') {
      this.updateClanSiege(dt);
      return;
    }

    const stats = computeStats(this.save);
    const job = JOBS[this.save.job];
    const isFever = this.feverTimer > 0;
    const effectiveAtkSpeed = stats.atkSpeed * (isFever ? 2.0 : 1.0);

    // Passive HP regen
    if (this.heroReviveTimer > 0) {
      this.heroReviveTimer -= dt;
      if (this.heroReviveTimer <= 0) {
        this.heroHp = this.heroMaxHp;
      }
    } else {
      this.heroHp = Math.min(this.heroMaxHp, this.heroHp + this.heroMaxHp * 0.035 * dt);
    }

    if (this.heroFlashTimer > 0) this.heroFlashTimer = Math.max(0, this.heroFlashTimer - dt);
    if (this.heroSwingTimer > 0) this.heroSwingTimer = Math.max(0, this.heroSwingTimer - dt);

    // Tick skill cooldowns
    for (const s of job.skills) {
      if ((this.skillCooldowns[s.id] || 0) > 0) {
        this.skillCooldowns[s.id] = Math.max(0, this.skillCooldowns[s.id] - dt);
      }
    }

    // Boss, Zakum & Dungeon timers
    if (this.combatMode === 'BOSS') {
      if (this.monsters.length === 0 && this.bossTimer > 0) {
        this.spawnStageBoss();
      }
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.combatMode = 'FARMING';
        this.spawnWave();
        this.callbacks.onBossFailed();
      }
    } else if (this.combatMode === 'EXPEDITION_ZAKUM') {
      this.zakumTimer -= dt;
      this.zakumPillarCooldown -= dt;
      if (this.zakumPillarCooldown <= 0) {
        this.zakumPillarCooldown = 2.6;
        // Telegraphed fiery pillars: one near hero + 2 across stage
        const xs = [HERO_X + (Math.random() < 0.5 ? 0 : 28), 115 + Math.random() * 45, 165 + Math.random() * 30];
        for (const hx of xs) {
          this.hazards.push({ x: hx, warnTimer: 0.9, eruptTimer: 0.35, damaged: false });
        }
      }

      // Update volcanic pillars
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const hz = this.hazards[i];
        if (hz.warnTimer > 0) {
          hz.warnTimer -= dt;
        } else {
          hz.eruptTimer -= dt;
          if (!hz.damaged) {
            hz.damaged = true;
            this.addShake(2.8, 0.14);
            this.spawnParticles(hz.x, GROUND_Y - 12, '#f97316', 8, 85);
            if (Math.abs(hz.x - HERO_X) < 18) {
              this.damageHero(this.heroMaxHp * 0.14);
            }
          }
          if (hz.eruptTimer <= 0) {
            this.hazards.splice(i, 1);
          }
        }
      }

      if (this.zakumTimer <= 0) {
        this.combatMode = 'FARMING';
        this.hazards = [];
        this.spawnWave();
        this.callbacks.onZakumFailed();
      }
    } else if (this.combatMode === 'DUNGEON_MESO' || this.combatMode === 'DUNGEON_JEWEL') {
      this.dungeonTime -= dt;
      if (this.dungeonTime <= 0) {
        const finishedMode = this.combatMode;
        const score = Math.max(250, Math.floor(this.dungeonScore));
        this.combatMode = 'FARMING';
        this.spawnWave();
        this.callbacks.onDungeonComplete(finishedMode, score);
      }
    }

    // Wave transition run-right animation
    if (this.waveTransitionTimer > 0) {
      this.waveTransitionTimer -= dt;
      this.cameraX += 92 * dt;
      if (this.waveTransitionTimer <= 0 && this.combatMode === 'FARMING') {
        this.spawnWave();
      }
    }

    // Move monsters toward hero range
    const targetEngageX = HERO_X + job.range * 0.85;
    let anyInRange = false;

    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (m.flashTimer > 0) m.flashTimer = Math.max(0, m.flashTimer - dt);
      if (m.squash < 1) m.squash = Math.min(1, m.squash + dt * 4);
      m.hopPhase += dt * (m.isBoss ? 3.2 : 5.5);

      if (this.combatMode === 'EXPEDITION_ZAKUM') {
        anyInRange = true;
      } else {
        const desiredX = Math.max(HERO_X + 24, targetEngageX + i * 16);
        if (m.x > desiredX) {
          m.x -= (m.isBoss ? 38 : 48) * dt;
          this.cameraX += 10 * dt;
        }
        if (m.x <= HERO_X + job.range + 12) {
          anyInRange = true;
        }
      }

      // Monster attacking Hero (Farming / Stage Boss)
      if (
        this.combatMode !== 'EXPEDITION_ZAKUM' &&
        this.heroReviveTimer <= 0 &&
        m.atk > 0 &&
        m.x <= HERO_X + (m.isBoss ? 54 : 38)
      ) {
        if (m.windupTimer > 0) {
          m.windupTimer -= dt;
          if (m.windupTimer <= 0) {
            this.damageHero(m.atk * 1.45);
            this.addShake(2.5, 0.12);
          }
        } else {
          m.atkTimer -= dt;
          if (m.atkTimer <= 0) {
            if (m.isBoss) {
              m.windupTimer = 0.45;
              m.atkTimer = 2.4;
            } else {
              this.damageHero(m.atk);
              m.atkTimer = 1.65;
            }
          }
        }
      }
    }

    // Hero & Companion attacks when monsters are present
    if (this.heroReviveTimer <= 0 && this.monsters.length > 0) {
      if (this.save.autoSkills && anyInRange) {
        for (const sk of job.skills) {
          const lv = this.save.skillLevels[sk.id] || 0;
          if (lv > 0 && (this.skillCooldowns[sk.id] || 0) <= 0) {
            this.executeSkill(sk.id);
            break;
          }
        }
      }

      if (anyInRange) {
        this.heroAtkTimer -= dt;
        if (this.heroAtkTimer <= 0) {
          this.heroAtkTimer = 1 / effectiveAtkSpeed;
          this.performBasicAttack();
        }
      }

      for (const cid of this.save.equippedCompanions) {
        const def = COMPANIONS[cid];
        const owned = this.save.companions[cid];
        if (!def || !owned?.unlocked) continue;
        this.companionTimers[cid] = (this.companionTimers[cid] || 0.4) - dt;
        if (this.companionTimers[cid] <= 0) {
          this.companionTimers[cid] = def.attackCooldown / (isFever ? 1.5 : 1);
          this.performCompanionAttack(cid);
        }
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.spin += dt * 16;

      if (pr.kind === 'meteor') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.y >= GROUND_Y - 12) {
          this.spawnParticles(pr.x, GROUND_Y - 8, '#f97316', 14, 110);
          this.addShake(3.5, 0.16);
          for (const m of [...this.monsters]) {
            if (Math.abs(m.x - pr.x) < 75) {
              this.applyDamageToMonster(m, pr.dmg, pr.isCrit);
            }
          }
          this.projectiles.splice(i, 1);
          continue;
        }
      } else if (pr.kind === 'rain_arrow') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.y >= GROUND_Y - 6) {
          this.spawnParticles(pr.x, GROUND_Y - 4, '#84cc16', 3, 40);
          this.projectiles.splice(i, 1);
          continue;
        }
      } else {
        const target =
          this.monsters.find((m) => m.uid === pr.targetUid) || this.getPriorityTarget();
        if (!target || pr.life <= 0) {
          this.projectiles.splice(i, 1);
          continue;
        }
        const tx = target.x;
        const ty = target.y - 12 * target.scale * 0.5;
        const dx = tx - pr.x;
        const dy = ty - pr.y;
        const dist = Math.hypot(dx, dy);
        const speed = 260;
        if (dist < 10) {
          if (pr.aoe) {
            this.spawnParticles(tx, ty, pr.color, 10, 80);
            for (const m of [...this.monsters]) {
              if (Math.abs(m.x - tx) < 48) {
                this.applyDamageToMonster(m, pr.dmg, pr.isCrit);
              }
            }
          } else {
            this.applyDamageToMonster(target, pr.dmg, pr.isCrit);
            this.spawnParticles(tx, ty, pr.color, 4, 45);
          }
          this.projectiles.splice(i, 1);
          continue;
        } else {
          pr.x += (dx / dist) * speed * dt;
          pr.y += (dy / dist) * speed * dt;
        }
      }
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].life -= dt;
      if (this.slashes[i].life <= 0) this.slashes.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.gravity) pt.vy += 220 * dt;
      if (pt.y > GROUND_Y) {
        pt.y = GROUND_Y;
        pt.vy *= -0.35;
      }
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      t.life -= dt;
      t.x += t.vx * dt;
      t.vx *= 0.92;
      t.y += t.vy * dt;
      if (t.isDmg) {
        t.vy += 88 * dt;
      } else {
        t.vy *= 0.94;
      }
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (!d.magnetized) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 260 * dt;
        if (d.y >= GROUND_Y - 4) {
          d.y = GROUND_Y - 4;
          d.vy *= -0.45;
          d.vx *= 0.6;
        }
        if (d.age > 0.42) d.magnetized = true;
      } else {
        const dx = HERO_X - d.x;
        const dy = GROUND_Y - 12 - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) {
          sfx.playCoin();
          this.spawnParticles(HERO_X, GROUND_Y - 12, d.kind === 'meso' ? '#10b981' : '#f59e0b', 3, 35);
          this.drops.splice(i, 1);
          continue;
        }
        const pullSpeed = 240 + d.age * 160;
        d.x += (dx / dist) * pullSpeed * dt;
        d.y += (dy / dist) * pullSpeed * dt;
      }
    }

    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 0.1) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
  }

  private getPriorityTarget(): MonsterEntity | undefined {
    if (this.combatMode === 'EXPEDITION_ZAKUM') {
      const arms = this.monsters.filter((m) => m.isZakumArm && m.hp > 0);
      if (arms.length > 0) return arms[0];
    }
    return this.monsters[0];
  }

  private emitSnapshot() {
    const boss =
      this.monsters.find((m) => m.isZakumBody) || this.monsters.find((m) => m.isBoss);
    const zakumArmsAlive = this.monsters.filter((m) => m.isZakumArm && m.hp > 0).length;
    const stats = computeStats(this.save);
    const avgCrit = 1 + (stats.critRate / 100) * (stats.critDmg / 100 - 1);
    const activeTimer =
      this.combatMode === 'BOSS'
        ? this.bossTimer
        : this.combatMode === 'EXPEDITION_ZAKUM'
          ? this.zakumTimer
          : this.combatMode === 'DUNGEON_MESO' || this.combatMode === 'DUNGEON_JEWEL'
            ? this.dungeonTime
            : this.combatMode === 'CLAN_SIEGE'
              ? this.siegeTimer
              : 0;

    const recentSum = this.damageLog.reduce((acc, item) => acc + item.dmg, 0);
    const realDps = Math.floor(recentSum / 3.0);

    const siegeTargetName =
      this.combatMode === 'CLAN_SIEGE' && this.siegePayload
        ? this.siegePayload.targetType === 'statue'
          ? `[${this.siegePayload.rivalClanTag}] Family Safe`
          : this.siegePayload.enemyDefender?.ign || 'Turf Defender'
        : undefined;

    this.callbacks.onSnapshot({
      heroHp: Math.max(0, Math.floor(this.heroHp)),
      heroMaxHp: this.heroMaxHp,
      combatMode: this.combatMode,
      bossName: boss ? boss.name : '',
      bossHp: boss ? Math.max(0, Math.floor(boss.hp)) : 0,
      bossMaxHp: boss ? boss.maxHp : 1,
      bossTimer: Math.max(0, activeTimer),
      dungeonScore: Math.floor(this.dungeonScore),
      skillCooldowns: { ...this.skillCooldowns },
      dpsEstimate: Math.floor(stats.atk * stats.atkSpeed * avgCrit),
      realDps,
      feverCharge: Math.round(this.feverCharge),
      feverTimer: Math.max(0, this.feverTimer),
      zakumArmsAlive,
      arenaRivalName: this.arenaMatch?.rival.ign,
      arenaRivalHp: this.arenaMatch ? Math.max(0, Math.floor(this.arenaRivalHp)) : undefined,
      arenaRivalMaxHp: this.arenaMatch?.rivalMaxHp,
      arenaPlayerHp: this.arenaMatch ? Math.max(0, Math.floor(this.arenaPlayerHp)) : undefined,
      arenaPlayerMaxHp: this.arenaMatch?.playerMaxHp,
      arenaClock: this.arenaMatch ? this.arenaClock : undefined,
      siegeTargetName,
      siegeLaneName: this.siegePayload?.laneName,
      siegeTargetHp:
        this.combatMode === 'CLAN_SIEGE'
          ? this.siegePayload?.targetType === 'statue'
            ? Math.max(0, Math.floor(this.siegeStatueHp))
            : Math.max(0, Math.floor(this.arenaRivalHp))
          : undefined,
      siegeTargetMaxHp:
        this.combatMode === 'CLAN_SIEGE'
          ? this.siegePayload?.targetType === 'statue'
            ? this.siegeStatueMaxHp
            : this.arenaMatch?.rivalMaxHp
          : undefined,
      siegeDamageDealt:
        this.combatMode === 'CLAN_SIEGE' ? Math.floor(this.siegeStatueDmg) : undefined,
    });
  }

  private updateClanSiege(dt: number) {
    const payload = this.siegePayload;
    if (!payload) {
      this.exitClanSiege();
      return;
    }

    if (payload.targetType === 'defender' && this.arenaMatch) {
      const match = this.arenaMatch;
      const simDt = dt * 1.5;
      this.arenaClock += simDt;

      this.arenaPlayerX += (78 - this.arenaPlayerX) * Math.min(1, simDt * 8);
      this.arenaRivalX += (242 - this.arenaRivalX) * Math.min(1, simDt * 8);

      if (this.arenaPlayerSwing > 0) this.arenaPlayerSwing = Math.max(0, this.arenaPlayerSwing - simDt);
      if (this.arenaRivalSwing > 0) this.arenaRivalSwing = Math.max(0, this.arenaRivalSwing - simDt);
      if (this.arenaPlayerFlash > 0) this.arenaPlayerFlash = Math.max(0, this.arenaPlayerFlash - simDt);
      if (this.arenaRivalFlash > 0) this.arenaRivalFlash = Math.max(0, this.arenaRivalFlash - simDt);
      if (this.arenaPlayerStun > 0) this.arenaPlayerStun = Math.max(0, this.arenaPlayerStun - simDt);
      if (this.arenaRivalStun > 0) this.arenaRivalStun = Math.max(0, this.arenaRivalStun - simDt);

      while (
        this.arenaEventIdx < match.timeline.length &&
        match.timeline[this.arenaEventIdx].t <= this.arenaClock
      ) {
        const ev = match.timeline[this.arenaEventIdx];
        this.arenaEventIdx += 1;
        this.playArenaEvent(ev, match);
      }

      this.tickSiegeVfx(simDt);

      if (this.arenaEventIdx >= match.timeline.length && !this.siegeCompleted) {
        this.arenaFinishTimer += dt;
        if (this.arenaFinishTimer >= 0.9) {
          this.siegeCompleted = true;
          const won = match.winner === 'player';
          if (won) sfx.playLevelUp();
          const baseSiege = Math.max(180, Math.round(payload.statueMaxHp * (won ? 0.36 : 0.16)));
          const siegeDmg = Math.round(baseSiege * (1 + payload.bossDmgBonusPct / 100));
          const res: ClanSiegeResult = {
            laneId: payload.laneId,
            targetType: 'defender',
            defenderId: payload.enemyDefender?.playerId,
            defenderIgn: payload.enemyDefender?.ign,
            victory: won,
            siegeDamage: siegeDmg,
            medalsEarned: won ? 25 : 10,
            contributionEarned: won ? 85 : 35,
            isStatueKill: false,
          };
          this.exitClanSiege();
          this.callbacks.onClanSiegeComplete(res);
          return;
        }
      }
    } else {
      // Giant Guild Guardian Statue Boss Blitz (10s raid burst)
      const stats = computeStats(this.save);
      const job = JOBS[this.save.job];
      this.siegeTimer = Math.max(0, this.siegeTimer - dt);
      if (this.heroSwingTimer > 0) this.heroSwingTimer = Math.max(0, this.heroSwingTimer - dt);
      if (this.siegeStatueFlash > 0) this.siegeStatueFlash = Math.max(0, this.siegeStatueFlash - dt);

      const effectiveAspd = stats.atkSpeed * (this.feverTimer > 0 ? 2.0 : 1.0);
      this.siegeStatueAtkCd -= dt;

      if (this.siegeStatueAtkCd <= 0 && this.siegeStatueHp > 0 && this.siegeTimer > 0) {
        this.siegeStatueAtkCd = 1 / Math.max(0.6, effectiveAspd);
        this.heroSwingTimer = 0.28;
        this.heroAttackCounter++;

        // Scale blitz hit reasonably against Statue MaxHP while preserving player Crit & Shrine Boss DMG
        const bossMult = 1 + stats.bossDmgBonusPct / 100;
        const { isCrit } = this.rollDamage(1);
        const scaledBase = Math.max(stats.atk, this.siegeStatueMaxHp * 0.055);
        const hitDmg = Math.max(
          25,
          Math.floor(scaledBase * bossMult * (isCrit ? Math.min(3.5, stats.critDmg / 100) : 1) * (0.9 + Math.random() * 0.2))
        );
        sfx.playAttack(job.id, isCrit);
        this.siegeStatueHp = Math.max(0, this.siegeStatueHp - hitDmg);
        this.siegeStatueDmg += hitDmg;
        this.siegeStatueFlash = 0.08;
        this.recordDamage(hitDmg);

        if (job.id === 'warrior') {
          this.slashes.push({
            x: 236,
            y: GROUND_Y - 28,
            color: isCrit ? '#fbbf24' : '#f43f5e',
            radius: 28,
            life: 0.16,
            maxLife: 0.16,
            kind: 'arc',
          });
        } else {
          this.projectiles.push({
            x: HERO_X + 14,
            y: GROUND_Y - 14,
            vx: 0,
            vy: 0,
            color: job.accentColor,
            size: 5,
            kind: job.id === 'bowman' ? 'arrow' : job.id === 'thief' ? 'star' : 'orb',
            targetUid: null,
            targetPoint: { x: 240, y: GROUND_Y - 26 },
            dmg: hitDmg,
            isCrit,
            aoe: false,
            spin: 0,
            life: 0.35,
          });
        }
        this.spawnDamageText(240, GROUND_Y - 36, hitDmg, isCrit);
        this.spawnParticles(240, GROUND_Y - 24, isCrit ? '#fbbf24' : '#f97316', isCrit ? 7 : 4, 75);
        if (isCrit) this.addShake(2.0, 0.09);
      }

      // Companions hammer Guardian Statue
      for (const cid of this.save.equippedCompanions) {
        const def = COMPANIONS[cid];
        const owned = this.save.companions[cid];
        if (!def || !owned?.unlocked) continue;
        this.siegeCompCds[cid] = (this.siegeCompCds[cid] ?? 0.4) - dt;
        if (this.siegeCompCds[cid] <= 0 && this.siegeStatueHp > 0) {
          this.siegeCompCds[cid] = def.attackCooldown;
          const cDmg = Math.max(12, Math.floor(this.siegeStatueMaxHp * 0.025 * def.dpsMult));
          this.siegeStatueHp = Math.max(0, this.siegeStatueHp - cDmg);
          this.siegeStatueDmg += cDmg;
          this.projectiles.push({
            x: HERO_X - 24,
            y: GROUND_Y - 16,
            vx: 0,
            vy: 0,
            color: def.projectileColor,
            size: 3,
            kind: 'comp',
            targetUid: null,
            targetPoint: { x: 240, y: GROUND_Y - 22 },
            dmg: cDmg,
            isCrit: false,
            aoe: false,
            spin: 0,
            life: 0.35,
          });
          this.spawnDamageText(235, GROUND_Y - 24, cDmg, false);
        }
      }

      this.tickSiegeVfx(dt);

      if ((this.siegeStatueHp <= 0 || this.siegeTimer <= 0) && !this.siegeCompleted) {
        this.siegeCompleted = true;
        const statueKilled = this.siegeStatueHp <= 0;
        if (statueKilled) sfx.playLevelUp();
        const res: ClanSiegeResult = {
          laneId: payload.laneId,
          targetType: 'statue',
          victory: statueKilled,
          siegeDamage: Math.max(120, Math.floor(this.siegeStatueDmg)),
          medalsEarned: statueKilled ? 45 : 22,
          contributionEarned: statueKilled ? 140 : 75,
          isStatueKill: statueKilled,
        };
        this.exitClanSiege();
        this.callbacks.onClanSiegeComplete(res);
        return;
      }
    }

    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 0.08) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
  }

  private tickSiegeVfx(simDt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= simDt;
      if (pr.kind === 'meteor') {
        pr.x += pr.vx * simDt;
        pr.y += pr.vy * simDt;
        if (pr.y >= GROUND_Y - 12 || pr.life <= 0) {
          this.spawnParticles(pr.x, GROUND_Y - 10, '#f97316', 10, 95);
          this.projectiles.splice(i, 1);
        }
      } else if (pr.targetPoint) {
        const dx = pr.targetPoint.x - pr.x;
        const dy = pr.targetPoint.y - pr.y;
        const dist = Math.hypot(dx, dy);
        const speed = 420;
        if (dist < 12 || pr.life <= 0) {
          this.spawnParticles(pr.targetPoint.x, pr.targetPoint.y, pr.color, 5, 60);
          this.projectiles.splice(i, 1);
        } else {
          pr.x += (dx / dist) * speed * simDt;
          pr.y += (dy / dist) * speed * simDt;
        }
      } else if (pr.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].life -= simDt;
      if (this.slashes[i].life <= 0) this.slashes.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= simDt;
      pt.x += pt.vx * simDt;
      pt.y += pt.vy * simDt;
      if (pt.gravity) pt.vy += 220 * simDt;
      if (pt.y > GROUND_Y) {
        pt.y = GROUND_Y;
        pt.vy *= -0.35;
      }
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += simDt;
      t.life -= simDt;
      t.x += t.vx * simDt;
      t.vx *= 0.92;
      t.y += t.vy * simDt;
      if (t.isDmg) t.vy += 88 * simDt;
      else t.vy *= 0.94;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  private updateArenaPvp(dt: number) {
    const match = this.arenaMatch;
    if (!match) {
      this.exitArenaPvp();
      return;
    }

    const simDt = dt * this.arenaSpeedMult;
    this.arenaClock += simDt;

    // Ease fighters back toward their arena anchor positions
    this.arenaPlayerX += (78 - this.arenaPlayerX) * Math.min(1, simDt * 8);
    this.arenaRivalX += (242 - this.arenaRivalX) * Math.min(1, simDt * 8);

    if (this.arenaPlayerSwing > 0) this.arenaPlayerSwing = Math.max(0, this.arenaPlayerSwing - simDt);
    if (this.arenaRivalSwing > 0) this.arenaRivalSwing = Math.max(0, this.arenaRivalSwing - simDt);
    if (this.arenaPlayerFlash > 0) this.arenaPlayerFlash = Math.max(0, this.arenaPlayerFlash - simDt);
    if (this.arenaRivalFlash > 0) this.arenaRivalFlash = Math.max(0, this.arenaRivalFlash - simDt);
    if (this.arenaPlayerStun > 0) this.arenaPlayerStun = Math.max(0, this.arenaPlayerStun - simDt);
    if (this.arenaRivalStun > 0) this.arenaRivalStun = Math.max(0, this.arenaRivalStun - simDt);

    // Fire deterministic timeline events whose timestamps have elapsed
    while (
      this.arenaEventIdx < match.timeline.length &&
      match.timeline[this.arenaEventIdx].t <= this.arenaClock
    ) {
      const ev = match.timeline[this.arenaEventIdx];
      this.arenaEventIdx += 1;
      this.playArenaEvent(ev, match);
    }

    this.tickSiegeVfx(simDt);

    // Check match completion after final timeline event + finisher beat
    if (this.arenaEventIdx >= match.timeline.length && !this.arenaCompletedFired) {
      this.arenaFinishTimer += dt;
      if (this.arenaFinishTimer >= 1.15) {
        this.arenaCompletedFired = true;
        if (match.winner === 'player') sfx.playLevelUp();
        this.callbacks.onArenaMatchComplete(match);
      }
    }

    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 0.08) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
  }

  private playArenaEvent(ev: ArenaTimelineEvent, match: ArenaMatchResult) {
    const isPlayerAtk = ev.attacker === 'player';
    const atkJob = isPlayerAtk ? match.playerSnapshot.job : match.rival.job;
    const ax = isPlayerAtk ? this.arenaPlayerX : this.arenaRivalX;
    const dx = isPlayerAtk ? this.arenaRivalX : this.arenaPlayerX;
    const dir = isPlayerAtk ? 1 : -1;

    if (isPlayerAtk) {
      this.arenaPlayerSwing = 0.28;
      if (atkJob === 'warrior') this.arenaPlayerX = Math.min(185, this.arenaPlayerX + 18);
      this.arenaRivalFlash = 0.12;
      if (ev.didStun) this.arenaRivalStun = 0.7;
      if (ev.didKnockback) this.arenaRivalX = Math.min(286, this.arenaRivalX + 16);
    } else {
      this.arenaRivalSwing = 0.28;
      if (atkJob === 'warrior') this.arenaRivalX = Math.max(135, this.arenaRivalX - 18);
      this.arenaPlayerFlash = 0.12;
      if (ev.didStun) this.arenaPlayerStun = 0.7;
      if (ev.didKnockback) this.arenaPlayerX = Math.max(34, this.arenaPlayerX - 16);
    }

    this.arenaPlayerHp = ev.playerHpAfter;
    this.arenaRivalHp = ev.rivalHpAfter;

    if (ev.kind === 'skill') {
      sfx.playSkill(atkJob);
      this.spawnLootText(ax, GROUND_Y - 38, ev.skillName, ev.skillColor);
    } else if (ev.kind === 'basic') {
      sfx.playAttack(atkJob, ev.isCrit);
    }

    if (ev.skillName.includes('Napalm') || ev.skillName === 'Golden Tommy Gun') {
      this.projectiles.push({
        x: dx - dir * 14,
        y: -12,
        vx: dir * 24,
        vy: 280,
        color: '#f97316',
        size: 8,
        kind: 'meteor',
        targetUid: null,
        dmg: ev.dmg,
        isCrit: ev.isCrit,
        aoe: true,
        spin: 0,
        life: 0.75,
      });
    } else if (ev.skillName.includes('Gasoline') || ev.skillName === "The Godfather's Ring") {
      this.slashes.push({
        x: ax,
        y: GROUND_Y - 16,
        color: ev.skillColor,
        radius: 26,
        life: 0.22,
        maxLife: 0.22,
        kind: 'lightning',
        points: [
          { x: ax + dir * 10, y: GROUND_Y - 16 },
          { x: (ax + dx) / 2, y: GROUND_Y - 22 },
          { x: dx, y: GROUND_Y - 14 },
        ],
      });
    } else if (atkJob === 'warrior' && ev.kind !== 'companion') {
      this.slashes.push({
        x: dx - dir * 10,
        y: GROUND_Y - 14,
        color: ev.skillColor,
        radius: ev.kind === 'skill' ? 28 : 20,
        life: 0.18,
        maxLife: 0.18,
        kind: ev.aoe ? 'ring' : 'arc',
      });
    } else {
      const pKind =
        ev.kind === 'companion'
          ? 'comp'
          : atkJob === 'bowman'
            ? 'arrow'
            : atkJob === 'thief'
              ? 'star'
              : 'orb';
      this.projectiles.push({
        x: ax + dir * 14,
        y: GROUND_Y - 14,
        vx: 0,
        vy: 0,
        color: ev.skillColor,
        size: 4,
        kind: pKind,
        targetUid: null,
        targetPoint: { x: dx, y: GROUND_Y - 14 },
        dmg: ev.dmg,
        isCrit: ev.isCrit,
        aoe: ev.aoe,
        spin: 0,
        life: 0.55,
      });
    }

    this.spawnDamageText(dx, GROUND_Y - 16, ev.dmg, ev.isCrit);
    this.spawnParticles(dx, GROUND_Y - 12, ev.isCrit ? '#fb923c' : ev.skillColor, ev.isCrit ? 8 : 4, 70);
    if (ev.didStun) {
      this.spawnLootText(dx, GROUND_Y - 34, 'STUNNED!', '#fde047');
    }
    if (ev.isCrit || ev.kind === 'skill') {
      this.addShake(ev.isCrit ? 2.4 : 1.5, 0.1);
    }
  }

  private rollDamage(mult = 1): { dmg: number; isCrit: boolean } {
    const stats = computeStats(this.save);
    const isCrit = Math.random() * 100 < stats.critRate;
    const variance = 0.92 + Math.random() * 0.16;
    const raw = sanitizeNum(stats.atk * mult * variance * (isCrit ? stats.critDmg / 100 : 1), 1);
    return { dmg: Math.max(1, Math.floor(raw)), isCrit };
  }

  private maybeTriggerRelicOnAttack(target: MonsterEntity | undefined, isCrit: boolean) {
    if (!target) return;

    // Zakum's Anger: Every 5th attack triggers a meteor!
    if (this.save.equippedRelics.includes('zakum_anger') && this.save.relics.zakum_anger?.unlocked) {
      if (this.heroAttackCounter % 5 === 0) {
        const { dmg, isCrit: mCrit } = this.rollDamage(1.85);
        this.projectiles.push({
          x: target.x - 18,
          y: -14,
          vx: 26,
          vy: 240,
          color: '#f97316',
          size: 8,
          kind: 'meteor',
          targetUid: null,
          dmg,
          isCrit: mCrit,
          aoe: true,
          spin: 0,
          life: 2,
        });
      }
    }

    // War Sovereign's Banner: Every 4th attack unleashes Siege Shockwave!
    if (
      this.save.equippedRelics.includes('war_sovereign_banner') &&
      this.save.relics.war_sovereign_banner?.unlocked &&
      this.heroAttackCounter % 4 === 0
    ) {
      const rLv = this.save.relics.war_sovereign_banner.level || 1;
      const { dmg, isCrit: sCrit } = this.rollDamage(1.95 * (1 + (rLv - 1) * 0.22));
      this.slashes.push({
        x: target.x,
        y: GROUND_Y - 14,
        color: '#f43f5e',
        radius: 36,
        life: 0.22,
        maxLife: 0.22,
        kind: 'ring',
      });
      for (const m of [...this.monsters]) {
        if (Math.abs(m.x - target.x) < 64) {
          this.applyDamageToMonster(m, dmg, sCrit, true);
        }
      }
    }

    // Crimson Citadel Sigil: Crits deal bonus Warlord flare & heal 3% HP
    if (
      isCrit &&
      this.save.equippedRelics.includes('crimson_citadel_sigil') &&
      this.save.relics.crimson_citadel_sigil?.unlocked
    ) {
      const rLv = this.save.relics.crimson_citadel_sigil.level || 1;
      const { dmg } = this.rollDamage(0.95 * (1 + (rLv - 1) * 0.22));
      this.heroHp = Math.min(this.heroMaxHp, this.heroHp + Math.floor(this.heroMaxHp * 0.03));
      this.applyDamageToMonster(target, dmg, true, true);
      this.spawnParticles(target.x, target.y - 12, '#fbbf24', 6, 70);
    }

    // Horntail Pendant: Critical strikes trigger arcing chain lightning!
    if (
      isCrit &&
      this.save.equippedRelics.includes('horntail_pendant') &&
      this.save.relics.horntail_pendant?.unlocked &&
      this.monsters.length > 0
    ) {
      const boltTargets = this.monsters.slice(0, 3);
      const pts: Array<{ x: number; y: number }> = [{ x: target.x, y: target.y - 12 }];
      for (const bt of boltTargets) {
        pts.push({ x: bt.x, y: bt.y - 10 });
        const { dmg } = this.rollDamage(0.65);
        this.applyDamageToMonster(bt, dmg, false, true);
      }
      this.slashes.push({
        x: target.x,
        y: target.y - 12,
        color: '#34d399',
        radius: 26,
        life: 0.2,
        maxLife: 0.2,
        kind: 'lightning',
        points: pts,
      });
    }
  }

  private performBasicAttack() {
    const job = this.save.job;
    const target = this.getPriorityTarget();
    if (!target) return;

    this.heroAttackCounter++;
    this.heroSwingTimer = 0.32;
    const { dmg, isCrit } = this.rollDamage(1);
    sfx.playAttack(job, isCrit);

    if (job === 'warrior') {
      this.slashes.push({
        x: HERO_X + 24,
        y: GROUND_Y - 12,
        color: isCrit ? '#fbbf24' : '#f87171',
        radius: 22,
        life: 0.16,
        maxLife: 0.16,
        kind: 'arc',
      });
      if (this.combatMode === 'EXPEDITION_ZAKUM') {
        // Warriors leap-slash even Zakum arms/body across the altar
        this.applyDamageToMonster(target, dmg, isCrit);
        if (this.monsters[1] && !this.monsters[1].isZakumBody) {
          this.applyDamageToMonster(this.monsters[1], dmg, isCrit);
        }
      } else {
        const cleaveTargets = this.monsters.slice(0, 2);
        for (const m of cleaveTargets) {
          this.applyDamageToMonster(m, dmg, isCrit);
        }
      }
    } else if (job === 'magician') {
      this.projectiles.push({
        x: HERO_X + 14,
        y: GROUND_Y - 14,
        vx: 0,
        vy: 0,
        color: '#f97316',
        size: 4,
        kind: 'orb',
        targetUid: target.uid,
        dmg,
        isCrit,
        aoe: false,
        spin: 0,
        life: 1.5,
      });
    } else if (job === 'bowman') {
      // Eject spinning brass shell casing!
      this.spawnParticles(HERO_X + 10, GROUND_Y - 16, '#fbbf24', 1, 38);
      this.projectiles.push({
        x: HERO_X + 14,
        y: GROUND_Y - 13,
        vx: 0,
        vy: 0,
        color: '#fef08a',
        size: 5,
        kind: 'arrow',
        targetUid: target.uid,
        dmg,
        isCrit,
        aoe: false,
        spin: 0,
        life: 1.5,
      });
    } else {
      const half = Math.max(1, Math.floor(dmg * 0.56));
      this.projectiles.push(
        {
          x: HERO_X + 12,
          y: GROUND_Y - 15,
          vx: 0,
          vy: 0,
          color: '#c084fc',
          size: 4,
          kind: 'star',
          targetUid: target.uid,
          dmg: half,
          isCrit,
          aoe: false,
          spin: 0,
          life: 1.5,
        },
        {
          x: HERO_X + 10,
          y: GROUND_Y - 10,
          vx: 0,
          vy: 0,
          color: '#e879f9',
          size: 4,
          kind: 'star',
          targetUid: target.uid,
          dmg: half,
          isCrit: Math.random() * 100 < computeStats(this.save).critRate,
          aoe: false,
          spin: 1,
          life: 1.5,
        }
      );
    }

    this.maybeTriggerRelicOnAttack(target, isCrit);
  }

  private performCompanionAttack(cid: CompanionId) {
    const target = this.getPriorityTarget();
    const def = COMPANIONS[cid];
    const owned = this.save.companions[cid];
    if (!target || !def || !owned) return;
    const stats = computeStats(this.save);
    const dmg = Math.max(1, Math.floor(stats.atk * def.dpsMult * (1 + (owned.level - 1) * 0.2)));
    const idx = this.save.equippedCompanions.indexOf(cid);
    const cx = HERO_X - 22 - idx * 18;
    const cy = GROUND_Y - 16 - (idx % 2) * 4;

    this.projectiles.push({
      x: cx + 4,
      y: cy,
      vx: 0,
      vy: 0,
      color: def.projectileColor,
      size: 3,
      kind: 'comp',
      targetUid: target.uid,
      dmg,
      isCrit: false,
      aoe: false,
      spin: 0,
      life: 1.5,
    });
  }

  private executeSkill(skillId: string) {
    const job = JOBS[this.save.job];
    const skill = job.skills.find((s) => s.id === skillId);
    const lv = this.save.skillLevels[skillId] || 1;
    if (!skill) return;

    this.heroAttackCounter++;
    this.skillCooldowns[skillId] = skill.cooldown;
    this.heroSwingTimer = 0.32;
    sfx.playSkill(job.id);

    const lvScale = 1 + (lv - 1) * 0.18;
    const priority = this.getPriorityTarget();
    const targets = skill.aoe ? [...this.monsters] : priority ? [priority] : [];

    if (skillId === 'm_meteor') {
      for (let i = 0; i < 4; i++) {
        const { dmg, isCrit } = this.rollDamage(skill.dmgMult * lvScale * 0.35);
        this.projectiles.push({
          x: 130 + i * 38,
          y: -15 - i * 18,
          vx: 35,
          vy: 230,
          color: '#fb7185',
          size: 8,
          kind: 'meteor',
          targetUid: null,
          dmg,
          isCrit,
          aoe: true,
          spin: 0,
          life: 2,
        });
      }
      return;
    }

    if (skillId === 'm_chain_lightning' && targets.length > 0) {
      const pts: Array<{ x: number; y: number }> = [{ x: HERO_X + 12, y: GROUND_Y - 16 }];
      for (const m of targets) {
        pts.push({ x: m.x, y: m.y - 10 });
      }
      this.slashes.push({
        x: HERO_X,
        y: GROUND_Y - 16,
        color: '#22d3ee',
        radius: 30,
        life: 0.24,
        maxLife: 0.24,
        kind: 'lightning',
        points: pts,
      });
    } else if (skillId === 'b_arrow_rain') {
      for (let i = 0; i < 10; i++) {
        this.projectiles.push({
          x: 145 + i * 16,
          y: -10 - (i % 3) * 14,
          vx: -12,
          vy: 250,
          color: '#4ade80',
          size: 5,
          kind: 'rain_arrow',
          targetUid: null,
          dmg: 0,
          isCrit: false,
          aoe: false,
          spin: 0,
          life: 1.5,
        });
      }
    } else if (skillId === 'w_heaven_hammer') {
      this.slashes.push({
        x: 205,
        y: GROUND_Y - 24,
        color: '#fde047',
        radius: 46,
        life: 0.32,
        maxLife: 0.32,
        kind: 'hammer',
      });
      this.addShake(4, 0.2);
    } else {
      this.slashes.push({
        x: HERO_X + 26,
        y: GROUND_Y - 14,
        color: skill.color,
        radius: skill.aoe ? 42 : 24,
        life: 0.22,
        maxLife: 0.22,
        kind: skill.aoe ? 'ring' : 'arc',
      });
    }

    let anyCrit = false;
    for (const m of targets) {
      for (let h = 0; h < skill.hits; h++) {
        const { dmg, isCrit } = this.rollDamage(skill.dmgMult * lvScale);
        if (isCrit) anyCrit = true;
        this.applyDamageToMonster(m, dmg, isCrit);
      }
      this.spawnParticles(m.x, m.y - 10, skill.color, 6, 75);
    }
    this.maybeTriggerRelicOnAttack(priority, anyCrit);
    this.addShake(2.2, 0.12);
  }

  private damageHero(amount: number) {
    if (this.heroReviveTimer > 0) return;
    this.heroHp -= Math.max(1, Math.floor(amount));
    this.heroFlashTimer = 0.14;
    if (this.heroHp <= 0) {
      this.heroHp = 0;
      this.heroReviveTimer = 1.4;
      if (this.combatMode === 'BOSS') {
        this.combatMode = 'FARMING';
        this.spawnWave();
        this.callbacks.onBossFailed();
      } else if (this.combatMode === 'EXPEDITION_ZAKUM') {
        this.combatMode = 'FARMING';
        this.hazards = [];
        this.spawnWave();
        this.callbacks.onZakumFailed();
      }
    }
  }

  private applyDamageToMonster(m: MonsterEntity, dmg: number, isCrit: boolean, fromRelic = false) {
    if (m.hp <= 0) return;

    // Zakum Main Body is protected until all 6 stone arms are shattered!
    if (m.isZakumBody) {
      const armsLeft = this.monsters.some((other) => other.isZakumArm && other.hp > 0);
      if (armsLeft) {
        if (!fromRelic) {
          this.spawnLootText(m.x, m.y - 42, 'TURRET LOCK', '#f59e0b');
        }
        return;
      }
    }

    // Dungeon vault scoring
    if (this.combatMode === 'DUNGEON_MESO' || this.combatMode === 'DUNGEON_JEWEL') {
      const gain =
        this.combatMode === 'DUNGEON_MESO'
          ? Math.max(
              25,
              Math.floor(
                sanitizeNum(dmg * 0.45 * Math.pow(1.06, Math.min(200, this.save.stage - 1)), 25)
              )
            )
          : Math.max(8, Math.floor(4 + Math.log10(Math.max(10, dmg) + 10) * 6));
      this.dungeonScore = sanitizeNum(this.dungeonScore + gain, this.dungeonScore);
      this.recordDamage(dmg);
      m.flashTimer = 0.08;
      m.squash = 0.72;
      this.spawnDamageText(m.x, m.y - 10, dmg, isCrit);
      if (Math.random() < 0.65) {
        this.drops.push({
          x: m.x,
          y: m.y - 18,
          vx: (Math.random() - 0.5) * 90,
          vy: -95 - Math.random() * 50,
          kind: this.combatMode === 'DUNGEON_MESO' ? 'meso' : 'diamond',
          amount: gain,
          age: 0,
          magnetized: false,
        });
      }
      if (isCrit) this.addShake(1.8, 0.08);
      return;
    }

    // Apply Clan Shrine shared Boss Damage buff on Stage Bosses & Zakum Raid
    const effectiveDmg =
      m.isBoss || m.isZakumArm || m.isZakumBody
        ? Math.max(
            1,
            Math.floor(sanitizeNum(dmg * (1 + computeStats(this.save).bossDmgBonusPct / 100), dmg))
          )
        : dmg;

    this.recordDamage(effectiveDmg);
    m.hp -= effectiveDmg;
    m.flashTimer = 0.09;
    m.squash = 0.76;
    this.spawnDamageText(m.x, m.y - 8 * m.scale, effectiveDmg, isCrit);

    if (isCrit) {
      this.hitStopTimer = 0.03;
      this.addShake(2.2, 0.09);
      this.spawnParticles(m.x, m.y - 10, '#fb923c', 5, 65);
    }

    if (m.hp <= 0) {
      const idx = this.monsters.indexOf(m);
      if (idx !== -1) this.monsters.splice(idx, 1);

      this.spawnParticles(m.x, m.y - 10, '#fef08a', m.isBoss ? 22 : 9, m.isBoss ? 115 : 70);
      if (m.isBoss || m.isZakumArm) {
        this.hitStopTimer = 0.055;
        this.addShake(4.2, 0.22);
      }

      // Fever Gauge charge on kill (Time Warp extends duration)
      if (this.feverTimer <= 0) {
        const hasCore =
          this.save.equippedRelics.includes('el_nath_core') &&
          this.save.relics.el_nath_core?.unlocked;
        const chargeGain = (m.isBoss ? 28 : 9) * (hasCore ? 1.6 : 1);
        this.feverCharge = Math.min(100, this.feverCharge + chargeGain);
        if (this.feverCharge >= 100) {
          this.feverCharge = 0;
          this.feverTimer = getFeverDuration(this.save);
          sfx.playFeverStart();
          sfx.setFever(true);
          this.spawnLootText(HERO_X + 20, GROUND_Y - 42, 'TURF WAR FRENZY!', '#ef4444');
        }
      }

      // Federal Reserve Heist Victory Check
      if (m.isZakumBody && this.combatMode === 'EXPEDITION_ZAKUM') {
        this.combatMode = 'FARMING';
        this.hazards = [];
        this.monsters = [];
        const relicPool: RelicId[] = ['zakum_anger', 'horntail_pendant', 'el_nath_core'];
        const unowned = relicPool.filter((rid) => !this.save.relics[rid]?.unlocked);
        const droppedRelic =
          unowned.length > 0
            ? unowned[Math.floor(Math.random() * unowned.length)]
            : relicPool[Math.floor(Math.random() * relicPool.length)];
        const diamonds = 300 + Math.min(2000, this.save.stage * 20);
        const starStones = 10 + Math.floor(this.save.stage / 2);
        const styleTickets = 2;
        this.callbacks.onZakumVictory(droppedRelic, diamonds, starStones, styleTickets);
        this.waveTransitionTimer = 0.8;
        return;
      }

      if (m.isZakumArm) {
        this.spawnLootText(m.x, m.y - 12, 'TURRET DOWN!', '#f59e0b');
        return;
      }

      const stats = computeStats(this.save);
      const liveOps = getEffectiveLiveOpsBonuses();
      const zoneInfo = getZoneForStage(this.save.stage);
      const feverMesoMult = this.feverTimer > 0 ? 2 : 1;
      const baseMeso = getStageMesoReward(this.save.stage, m.isBoss);
      const baseExp = getStageExpReward(this.save.stage, m.isBoss);
      const mesos = Math.max(
        5,
        Math.floor(
          sanitizeNum(baseMeso * (1 + stats.mesoBonusPct / 100) * feverMesoMult * liveOps.mesoMult, 5)
        )
      );
      const exp = Math.max(
        4,
        Math.floor(sanitizeNum(baseExp * (1 + stats.expBonusPct / 100) * liveOps.expMult, 4))
      );
      const diamonds = m.isBoss ? 150 + Math.min(2500, this.save.stage * 15) : 0;

      // High-Heat / Federal Lockdown (Stage 51+) drops Blackmail Files for leveling Heist Relics
      const chaosCores = zoneInfo.isChaos
        ? m.isBoss
          ? 3 + zoneInfo.chaosTier
          : Math.random() < 0.35
            ? 1
            : 0
        : 0;

      const coinCount = m.isBoss ? 10 : 2;
      for (let c = 0; c < coinCount; c++) {
        this.drops.push({
          x: m.x,
          y: m.y - 10,
          vx: (Math.random() - 0.5) * 80,
          vy: -85 - Math.random() * 45,
          kind: 'meso',
          amount: Math.ceil(mesos / coinCount),
          age: 0,
          magnetized: false,
        });
      }
      this.drops.push({
        x: m.x,
        y: m.y - 10,
        vx: (Math.random() - 0.5) * 60,
        vy: -90,
        kind: 'exp',
        amount: exp,
        age: 0,
        magnetized: false,
      });

      if (chaosCores > 0) {
        this.drops.push({
          x: m.x + 4,
          y: m.y - 14,
          vx: (Math.random() - 0.5) * 70,
          vy: -105,
          kind: 'chaos_core',
          amount: chaosCores,
          age: 0,
          magnetized: false,
        });
        this.spawnLootText(m.x, m.y - 30, `+${chaosCores} Blackmail File`, '#f43f5e');
      }

      this.spawnLootText(m.x, m.y - 20, `+$${formatNum(mesos)} Cash`, '#10b981');
      this.callbacks.onKillMonster(m.isBoss, mesos, exp, diamonds, chaosCores);

      if (m.isBoss && this.combatMode === 'BOSS') {
        this.combatMode = 'FARMING';
        this.callbacks.onBossVictory(diamonds, mesos);
        this.waveTransitionTimer = 0.7;
      } else if (this.monsters.length === 0 && this.combatMode === 'FARMING') {
        this.waveTransitionTimer = 0.65;
        this.callbacks.onWaveCleared();
      }
    }
  }

  // ==================== RENDERING ====================
  private render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.save();

    if (this.shakeTimer > 0) {
      const sx = Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity);
      const sy = Math.round((Math.random() - 0.5) * 2 * this.shakeIntensity);
      ctx.translate(sx, sy);
    }

    if (this.combatMode === 'ARENA_PVP') {
      this.drawColosseumStage(ctx);
      this.drawArenaFighters(ctx);
      this.drawProjectiles(ctx);
      this.drawSlashes(ctx);
      this.drawParticles(ctx);
      this.drawFloatingTexts(ctx);
      ctx.restore();
      return;
    }

    if (this.combatMode === 'CLAN_SIEGE') {
      this.drawColosseumStage(ctx);
      if (this.siegePayload?.targetType === 'defender' && this.arenaMatch) {
        this.drawArenaFighters(ctx);
      } else {
        this.drawHeroAndCompanions(ctx);
        this.drawGuardianStatue(ctx);
      }
      this.drawProjectiles(ctx);
      this.drawSlashes(ctx);
      this.drawParticles(ctx);
      this.drawFloatingTexts(ctx);
      ctx.restore();
      return;
    }

    if (this.combatMode === 'EXPEDITION_ZAKUM') {
      this.drawZakumAltar(ctx);
    } else {
      const zone = getZoneForStage(this.save.stage).id;
      this.drawEnvironment(ctx, zone);
    }

    this.drawDrops(ctx);
    this.drawHeroAndCompanions(ctx);
    this.drawMonsters(ctx);
    this.drawHazards(ctx);
    this.drawProjectiles(ctx);
    this.drawSlashes(ctx);
    this.drawParticles(ctx);
    this.drawFloatingTexts(ctx);

    // Turf War Frenzy police siren border glow!
    if (this.feverTimer > 0) {
      const sirenSwap = Math.floor(this.animClock * 10) % 2 === 0;
      const pulse = 0.5 + Math.sin(this.animClock * 14) * 0.25;
      ctx.strokeStyle = sirenSwap
        ? `rgba(220, 38, 38, ${pulse.toFixed(2)})`
        : `rgba(59, 130, 246, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
      ctx.strokeStyle = `rgba(245, 158, 11, ${(pulse * 0.65).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(5, 5, CANVAS_W - 10, CANVAS_H - 10);
    }

    ctx.restore();
  }

  private drawColosseumStage(ctx: CanvasRenderingContext2D) {
    // Underground Fight Club / Speakeasy Backroom Ring
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, '#09090d');
    grad.addColorStop(0.55, '#1c1218');
    grad.addColorStop(1, '#3b0d12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Underground brick cellar wall & arched speakeasy alcoves
    ctx.fillStyle = '#18141c';
    ctx.fillRect(0, 56, CANVAS_W, GROUND_Y - 56);
    ctx.fillStyle = '#2b2029';
    for (let y = 60; y < GROUND_Y; y += 12) {
      for (let x = ((y / 12) % 2) * 14; x < CANVAS_W; x += 28) {
        ctx.fillRect(x, y, 24, 9);
      }
    }

    // Hanging overhead bare light cone
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
    ctx.beginPath();
    ctx.moveTo(160, 14);
    ctx.lineTo(50, GROUND_Y);
    ctx.lineTo(270, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(158, 12, 4, 4);

    // Crimson velvet ring ropes & corner posts
    for (const px of [24, 296]) {
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(px - 3, GROUND_Y - 42, 6, 42);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px - 4, GROUND_Y - 44, 8, 4);
    }
    ctx.fillStyle = '#8b1e24';
    ctx.fillRect(24, GROUND_Y - 36, 272, 2);
    ctx.fillRect(24, GROUND_Y - 24, 272, 2);
    ctx.fillRect(24, GROUND_Y - 12, 272, 2);

    // Backroom wood & crimson carpet ring canvas
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 5);
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, GROUND_Y + 5, CANVAS_W, CANVAS_H - GROUND_Y - 5);
    for (let x = 0; x < CANVAS_W; x += 20) {
      ctx.fillStyle = (x / 20) % 2 === 0 ? '#991b1b' : '#7f1d1d';
      ctx.fillRect(x, GROUND_Y + 1, 20, 4);
      ctx.fillStyle = '#292524';
      ctx.fillRect(x + 4, GROUND_Y + 12, 12, 3);
    }
  }

  private drawGuardianStatue(ctx: CanvasRenderingContext2D) {
    const frame: 0 | 1 = Math.floor(this.animClock * 4) % 2 === 0 ? 0 : 1;
    const spr = sprites.getGuardianStatueSprite(frame);
    const scale = 2.15;
    const w = Math.round(spr.width * scale);
    const h = Math.round(spr.height * scale);
    const sx = Math.round(240 - w / 2);
    const sy = Math.round(GROUND_Y - h + 2);

    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.fillRect(sx - 6, GROUND_Y - 3, w + 12, 5);

    ctx.drawImage(spr, sx, sy, w, h);

    if (this.siegeStatueFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(sx, sy, w, h);
    }
  }

  private drawArenaFighters(ctx: CanvasRenderingContext2D) {
    const match = this.arenaMatch;
    if (!match) return;

    const drawFighter = (
      side: 'player' | 'rival',
      x: number,
      hp: number,
      maxHp: number,
      swingTimer: number,
      flashTimer: number,
      stunTimer: number
    ) => {
      const snap = side === 'player' ? match.playerSnapshot : match.rival;
      const rank = MAPLE_RANKS[snap.mapleRank];
      if (rank && rank.auraColor) {
        const pulse = Math.sin(this.animClock * 6) * 2;
        ctx.fillStyle = rank.auraColor;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(Math.round(x - 14 - pulse), GROUND_Y - 3, Math.round(28 + pulse * 2), 4);
        ctx.globalAlpha = 1;
      }

      snap.equippedCompanions.forEach((cid, idx) => {
        const frame: 0 | 1 = Math.floor(this.animClock * 4) % 2 === 0 ? 0 : 1;
        const spr = sprites.getCompanionSprite(cid, frame);
        const bob = Math.round(Math.sin(this.animClock * 5 + idx * 2) * 2);
        const dir = side === 'player' ? -1 : 1;
        const cx = x + dir * (24 + idx * 16);
        const cy = GROUND_Y - 14 + bob;
        ctx.save();
        if (side === 'rival') {
          ctx.translate(Math.round(cx + 7), Math.round(cy));
          ctx.scale(-1, 1);
          ctx.drawImage(spr, 0, 0, 14, 13);
        } else {
          ctx.drawImage(spr, Math.round(cx - 7), Math.round(cy), 14, 13);
        }
        ctx.restore();
      });

      let frame: HeroFrame = 'idle';
      if (swingTimer > 0) {
        const p = 1 - Math.min(1, swingTimer / 0.28);
        frame = p < 0.25 ? 'atk0' : p < 0.55 ? 'atk1' : p < 0.8 ? 'atk2' : 'atk3';
      } else {
        const wIdx = Math.floor(this.animClock * 6) % 4;
        if (wIdx === 1 || wIdx === 3) frame = `walk${wIdx}` as HeroFrame;
      }

      const heroSpr = sprites.getHeroSprite(
        snap.job,
        frame,
        snap.equippedWeaponId,
        snap.equippedCosmetics
      );
      if (hp <= 0) ctx.globalAlpha = 0.35;
      else if (flashTimer > 0) ctx.globalAlpha = 0.65;

      const drawW = 36;
      const drawH = 32;
      const hx = Math.round(x - drawW / 2);
      const hy = Math.round(GROUND_Y - drawH + 1);

      ctx.save();
      if (side === 'rival') {
        ctx.translate(hx + drawW, hy);
        ctx.scale(-1, 1);
        ctx.drawImage(heroSpr, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(heroSpr, hx, hy, drawW, drawH);
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      const bw = 38;
      const bx = Math.round(x - bw / 2);
      const by = hy - 9;
      ctx.fillStyle = '#121216';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = side === 'player' ? '#10b981' : '#dc2626';
      ctx.fillRect(bx, by, Math.max(0, Math.round(bw * Math.max(0, hp / Math.max(1, maxHp)))), 3);

      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = side === 'player' ? '#fbbf24' : '#fda4af';
      ctx.fillText(snap.ign.slice(0, 10), Math.round(x), by - 3);
      ctx.textAlign = 'left';

      if (stunTimer > 0) {
        const starOff = Math.round(Math.sin(this.animClock * 18) * 5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(x - 6 + starOff), hy - 14, 3, 3);
        ctx.fillRect(Math.round(x + 4 - starOff), hy - 14, 3, 3);
      }
    };

    drawFighter(
      'player',
      this.arenaPlayerX,
      this.arenaPlayerHp,
      match.playerMaxHp,
      this.arenaPlayerSwing,
      this.arenaPlayerFlash,
      this.arenaPlayerStun
    );
    drawFighter(
      'rival',
      this.arenaRivalX,
      this.arenaRivalHp,
      match.rivalMaxHp,
      this.arenaRivalSwing,
      this.arenaRivalFlash,
      this.arenaRivalStun
    );
  }

  private drawZakumAltar(ctx: CanvasRenderingContext2D) {
    // Federal Reserve Sub-Basement Bank Vault
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, '#0f0f13');
    grad.addColorStop(0.55, '#1e1b24');
    grad.addColorStop(1, '#3b151a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Reinforced steel vault beams & flashing alarm beacons
    ctx.fillStyle = '#27272a';
    for (let x = 0; x < CANVAS_W; x += 48) {
      ctx.fillRect(x, 0, 10, GROUND_Y);
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(x + 2, 16, 6, 4);
      ctx.fillStyle = '#27272a';
    }
    const alarmFlash = Math.floor(this.animClock * 6) % 2 === 0;
    ctx.fillStyle = alarmFlash ? '#ef4444' : '#7f1d1d';
    ctx.fillRect(36, 22, 6, 6);
    ctx.fillRect(156, 22, 6, 6);
    ctx.fillRect(276, 22, 6, 6);

    // Stacked gold bullion bars in background
    ctx.fillStyle = '#b45309';
    ctx.fillRect(24, GROUND_Y - 14, 24, 14);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(26, GROUND_Y - 12, 8, 4);
    ctx.fillRect(36, GROUND_Y - 12, 8, 4);
    ctx.fillRect(31, GROUND_Y - 17, 8, 4);

    // Falling alarm sparks
    for (const sp of this.ambientSpores) {
      ctx.fillStyle = Math.sin(this.animClock * 6 + sp.phase) > 0 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
    }

    // Polished marble vault floor
    ctx.fillStyle = '#52525b';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 6);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, GROUND_Y + 6, CANVAS_W, CANVAS_H - GROUND_Y - 6);
    for (let x = 0; x < CANVAS_W; x += 24) {
      ctx.fillStyle = (x / 24) % 2 === 0 ? '#71717a' : '#3f3f46';
      ctx.fillRect(x, GROUND_Y + 1, 24, 4);
    }
  }

  private drawEnvironment(ctx: CanvasRenderingContext2D, zone: ZoneId) {
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    if (zone === 'little_italy') {
      grad.addColorStop(0, '#0d0d14');
      grad.addColorStop(0.6, '#1f1621');
      grad.addColorStop(1, '#3b1c22');
    } else if (zone === 'docks') {
      grad.addColorStop(0, '#070b14');
      grad.addColorStop(0.6, '#0f2537');
      grad.addColorStop(1, '#16384d');
    } else if (zone === 'financial') {
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.6, '#182235');
      grad.addColorStop(1, '#26334a');
    } else if (zone === 'casino') {
      grad.addColorStop(0, '#160912');
      grad.addColorStop(0.6, '#3d1020');
      grad.addColorStop(1, '#5e1724');
    } else {
      // Stage 51+: Federal Lockdown high-heat police siren atmosphere!
      const sirenRed = Math.floor(this.animClock * 5) % 2 === 0;
      grad.addColorStop(0, '#09090d');
      grad.addColorStop(0.55, sirenRed ? '#3b0c14' : '#0f2042');
      grad.addColorStop(1, '#18181f');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Sky elements (Moon / Searchlights / Helicopters)
    if (zone === 'docks') {
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(250, 18, 16, 16);
      // Harbor water shimmer
      ctx.fillStyle = '#0c2d48';
      ctx.fillRect(0, GROUND_Y - 22, CANVAS_W, 22);
    } else if (zone === 'financial') {
      // Sweeping police searchlight beams!
      const beamX = 160 + Math.sin(this.animClock * 1.4) * 90;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
      ctx.beginPath();
      ctx.moveTo(60, GROUND_Y);
      ctx.lineTo(beamX - 24, 0);
      ctx.lineTo(beamX + 24, 0);
      ctx.closePath();
      ctx.fill();
    } else if (zone === 'casino') {
      // Luxury golden rooftop stars & marquee glow
      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect((i * 53 + 22) % CANVAS_W, 14 + (i % 3) * 12, 2, 2);
      }
    } else if (zone === 'lockdown') {
      // Patrol SWAT Helicopters & sweeping red/blue spotlights
      const heliX = ((this.animClock * 28) % (CANVAS_W + 60)) - 30;
      ctx.fillStyle = '#18181b';
      ctx.fillRect(Math.round(heliX), 26, 22, 8);
      ctx.fillRect(Math.round(heliX - 10), 28, 10, 3);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(Math.round(heliX - 4), 23, 30, 2); // rotor
      const redSide = Math.floor(this.animClock * 7) % 2 === 0;
      ctx.fillStyle = redSide ? '#ef4444' : '#3b82f6';
      ctx.fillRect(Math.round(heliX + 10), 34, 3, 3);
    } else {
      // Little Italy full amber moon
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(256, 20, 14, 14);
    }

    // Far parallax skyline layer
    const farOffset = Math.floor(this.cameraX * 0.22);
    for (let x = -64; x < CANVAS_W + 64; x += 64) {
      const rx = Math.floor(x - (farOffset % 64));
      if (zone === 'little_italy') {
        // Tenement silhouettes & fire escapes
        ctx.fillStyle = '#26171d';
        ctx.fillRect(rx, GROUND_Y - 78, 56, 78);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(rx + 10, GROUND_Y - 66, 6, 8);
        ctx.fillRect(rx + 36, GROUND_Y - 46, 6, 8);
      } else if (zone === 'docks') {
        // Shipping cranes & warehouse roofs
        ctx.fillStyle = '#132a3e';
        ctx.fillRect(rx + 6, GROUND_Y - 82, 6, 82);
        ctx.fillRect(rx + 6, GROUND_Y - 82, 42, 5);
        ctx.fillRect(rx + 28, GROUND_Y - 36, 30, 36);
      } else if (zone === 'financial') {
        // Art-Deco skyscrapers
        ctx.fillStyle = '#111827';
        ctx.fillRect(rx + 4, GROUND_Y - 108, 46, 108);
        ctx.fillRect(rx + 18, GROUND_Y - 122, 18, 14);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(rx + 12, GROUND_Y - 92, 4, 4);
        ctx.fillRect(rx + 32, GROUND_Y - 72, 4, 4);
      } else if (zone === 'casino') {
        // Penthouse & neon towers
        ctx.fillStyle = '#290b16';
        ctx.fillRect(rx + 2, GROUND_Y - 92, 52, 92);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(rx + 10, GROUND_Y - 92, 36, 4);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(rx + 20, GROUND_Y - 78, 16, 4);
      } else {
        // Lockdown dark city silhouettes
        ctx.fillStyle = '#18181f';
        ctx.fillRect(rx, GROUND_Y - 96, 52, 96);
        ctx.fillStyle = '#8b1e24';
        ctx.fillRect(rx + 12, GROUND_Y - 68, 8, 6);
      }
    }

    // Midground parallax street detail layer
    const midOffset = Math.floor(this.cameraX * 0.48);
    for (let x = -96; x < CANVAS_W + 96; x += 96) {
      const rx = Math.floor(x - (midOffset % 96));
      if (zone === 'little_italy') {
        // Brick storefront + neon pizzeria sign + vintage parked sedan
        ctx.fillStyle = '#4c1d24';
        ctx.fillRect(rx + 6, GROUND_Y - 52, 46, 52);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(rx + 12, GROUND_Y - 46, 30, 8);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(rx + 12, GROUND_Y - 38, 30, 2);
        // Parked vintage sedan
        ctx.fillStyle = '#27272a';
        ctx.fillRect(rx + 58, GROUND_Y - 14, 30, 10);
        ctx.fillRect(rx + 64, GROUND_Y - 21, 18, 7);
        ctx.fillStyle = '#09090b';
        ctx.fillRect(rx + 62, GROUND_Y - 5, 6, 5);
        ctx.fillRect(rx + 79, GROUND_Y - 5, 6, 5);
      } else if (zone === 'docks') {
        // Stacked shipping containers & wooden pier posts
        ctx.fillStyle = '#8b1e24';
        ctx.fillRect(rx + 8, GROUND_Y - 26, 40, 22);
        ctx.fillStyle = '#065f46';
        ctx.fillRect(rx + 14, GROUND_Y - 46, 34, 20);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(rx + 64, GROUND_Y - 18, 6, 18);
        ctx.fillRect(rx + 82, GROUND_Y - 18, 6, 18);
      } else if (zone === 'financial') {
        // Bank columns & streetlamp
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(rx + 10, GROUND_Y - 56, 44, 56);
        ctx.fillStyle = '#374151';
        ctx.fillRect(rx + 14, GROUND_Y - 50, 6, 50);
        ctx.fillRect(rx + 42, GROUND_Y - 50, 6, 50);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(rx + 74, GROUND_Y - 44, 6, 6);
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(rx + 76, GROUND_Y - 38, 2, 38);
      } else if (zone === 'casino') {
        // Golden chandelier & roulette table silhouettes
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(rx + 26, 16, 20, 4);
        ctx.fillRect(rx + 34, 6, 4, 10);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(rx + 26, 20, 4, 4);
        ctx.fillRect(rx + 42, 20, 4, 4);
        ctx.fillStyle = '#065f46';
        ctx.fillRect(rx + 16, GROUND_Y - 16, 42, 16);
        ctx.fillStyle = '#8b1e24';
        ctx.fillRect(rx + 14, GROUND_Y - 18, 46, 4);
      } else {
        // Armored police barricades & flashing strobe
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(rx + 16, GROUND_Y - 14, 34, 4);
        ctx.fillStyle = '#27272a';
        ctx.fillRect(rx + 20, GROUND_Y - 10, 4, 10);
        ctx.fillRect(rx + 42, GROUND_Y - 10, 4, 10);
        const siren = Math.floor(this.animClock * 9) % 2 === 0;
        ctx.fillStyle = siren ? '#ef4444' : '#3b82f6';
        ctx.fillRect(rx + 72, GROUND_Y - 22, 6, 4);
      }
    }

    // Floating city rain / embers / casino dust
    for (const sp of this.ambientSpores) {
      ctx.fillStyle =
        zone === 'casino'
          ? '#fbbf24'
          : zone === 'lockdown'
            ? Math.sin(this.animClock * 7 + sp.phase) > 0
              ? '#ef4444'
              : '#60a5fa'
            : '#f59e0b';
      ctx.globalAlpha = 0.55;
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
      ctx.globalAlpha = 1;
    }

    // Street Pavement / Casino Carpet / Dock Planks
    const groundOffset = Math.floor(this.cameraX);
    if (zone === 'docks') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, GROUND_Y, CANVAS_W, 5);
      ctx.fillStyle = '#292524';
      ctx.fillRect(0, GROUND_Y + 5, CANVAS_W, CANVAS_H - GROUND_Y - 5);
    } else if (zone === 'casino') {
      ctx.fillStyle = '#8b1e24';
      ctx.fillRect(0, GROUND_Y, CANVAS_W, 5);
      ctx.fillStyle = '#26080f';
      ctx.fillRect(0, GROUND_Y + 5, CANVAS_W, CANVAS_H - GROUND_Y - 5);
    } else {
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(0, GROUND_Y, CANVAS_W, 5);
      ctx.fillStyle = '#121216';
      ctx.fillRect(0, GROUND_Y + 5, CANVAS_W, CANVAS_H - GROUND_Y - 5);
    }

    // Road dashed yellow lines & steaming manhole covers
    for (let x = -32; x < CANVAS_W + 32; x += 28) {
      const tx = Math.floor(x - (groundOffset % 28));
      ctx.fillStyle = zone === 'casino' ? '#fbbf24' : zone === 'docks' ? '#92400e' : '#52525b';
      ctx.fillRect(tx + 4, GROUND_Y + 2, 10, 2);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(tx + 12, GROUND_Y + 14, 6, 3);
    }
  }

  private drawHeroAndCompanions(ctx: CanvasRenderingContext2D) {
    if (this.gameMode === 'TITLE_MENU') return;

    const rank = MAPLE_RANKS[this.save.mapleRank];
    if (rank && rank.auraColor) {
      const pulse = Math.sin(this.animClock * 6) * 2;
      ctx.fillStyle = rank.auraColor;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.round(HERO_X - 14 - pulse), GROUND_Y - 3, Math.round(28 + pulse * 2), 4);
      ctx.globalAlpha = 0.65;
      ctx.fillRect(Math.round(HERO_X - 9), GROUND_Y - 2, 18, 2);
      ctx.globalAlpha = 1;
    }

    this.save.equippedCompanions.forEach((cid, idx) => {
      const def = COMPANIONS[cid];
      const owned = this.save.companions[cid];
      if (!def || !owned?.unlocked) return;
      const frame: 0 | 1 = Math.floor(this.animClock * 4) % 2 === 0 ? 0 : 1;
      const spr = sprites.getCompanionSprite(cid, frame);
      const bob = Math.round(Math.sin(this.animClock * 5 + idx * 2) * 2);
      const cx = HERO_X - 24 - idx * 18;
      const cy = GROUND_Y - 14 + bob;
      ctx.drawImage(spr, Math.round(cx - 7), Math.round(cy), 14, 13);
    });

    let frame: HeroFrame = 'idle';
    if (this.heroSwingTimer > 0) {
      const p = 1 - Math.min(1, this.heroSwingTimer / 0.32);
      if (p < 0.25) frame = 'atk0';
      else if (p < 0.55) frame = 'atk1';
      else if (p < 0.8) frame = 'atk2';
      else frame = 'atk3';
    } else if (this.waveTransitionTimer > 0 || this.monsters.some((m) => m.x > HERO_X + 120)) {
      const wIdx = Math.floor(this.animClock * 10) % 4;
      frame = `walk${wIdx}` as HeroFrame;
    }

    const weaponId = this.save.equippedWeaponByJob[this.save.job];
    const heroSpr = sprites.getHeroSprite(this.save.job, frame, weaponId, this.save.equippedCosmetics);
    if (this.heroReviveTimer > 0) ctx.globalAlpha = 0.45;
    if (this.heroFlashTimer > 0) ctx.globalAlpha = 0.7;

    const drawW = 36;
    const drawH = 32;
    const hx = Math.round(HERO_X - 15);
    const hy = Math.round(GROUND_Y - drawH + 1);
    ctx.drawImage(heroSpr, hx, hy, drawW, drawH);

    const wpnDef = WEAPONS.find((w) => w.id === weaponId);
    const wpnOwned = weaponId ? this.save.weapons[weaponId] : undefined;
    if (wpnDef && (wpnDef.rarity === 'legendary' || wpnDef.rarity === 'unique' || (wpnOwned?.stars || 0) >= 5)) {
      const isLeg = wpnDef.rarity === 'legendary';
      const glintColor = isLeg ? '#6ee7b7' : '#fde047';
      const spPhase = this.animClock * 7;
      const sx1 = Math.round(HERO_X + 12 + Math.cos(spPhase) * 4);
      const sy1 = Math.round(GROUND_Y - 18 + Math.sin(spPhase * 1.3) * 4);
      ctx.fillStyle = glintColor;
      ctx.fillRect(sx1, sy1, 2, 2);
      if (isLeg || (wpnOwned?.stars || 0) >= 10) {
        const sx2 = Math.round(HERO_X + 10 + Math.sin(spPhase * 1.4) * 5);
        const sy2 = Math.round(GROUND_Y - 12 + Math.cos(spPhase) * 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(sx2, sy2, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawMonsters(ctx: CanvasRenderingContext2D) {
    // Draw Zakum Body first so arms layer cleanly around it
    const ordered = [...this.monsters].sort((a, b) => (a.isZakumBody ? -1 : b.isZakumBody ? 1 : 0));

    for (const m of ordered) {
      const frame: 0 | 1 = Math.floor(m.hopPhase) % 2 === 0 ? 0 : 1;

      if (m.isZakumBody) {
        const spr = sprites.getZakumBodySprite(frame);
        const w = Math.round(spr.width * m.scale);
        const h = Math.round(spr.height * m.scale * m.squash);
        const dx = Math.round(m.x - w / 2);
        const dy = Math.round(m.y - h);
        ctx.drawImage(spr, dx, dy, w, h);
        if (m.flashTimer > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(dx, dy, w, h);
        }
        continue;
      }

      if (m.isZakumArm) {
        const spr = sprites.getZakumArmSprite(m.armSide || 'left', frame);
        const sway = Math.round(Math.sin(m.hopPhase) * 3);
        const w = Math.round(spr.width * m.scale);
        const h = Math.round(spr.height * m.scale * m.squash);
        const dx = Math.round(m.x - w / 2);
        const dy = Math.round(m.y - h + sway);
        ctx.drawImage(spr, dx, dy, w, h);
        if (m.flashTimer > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillRect(dx, dy, w, h);
        }
        const bw = 20;
        const bx = Math.round(m.x - bw / 2);
        const by = dy - 4;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(bx, by, Math.max(1, Math.round(bw * (m.hp / m.maxHp))), 2);
        continue;
      }

      const spr = sprites.getMonsterSprite(m.spriteId, frame);
      const hopOffset = Math.abs(Math.sin(m.hopPhase)) * (m.isBoss ? 3 : 4);

      const w = Math.round(spr.width * m.scale);
      const h = Math.round(spr.height * m.scale * m.squash);
      const dx = Math.round(m.x - w / 2);
      const dy = Math.round(m.y - h - hopOffset);

      if (m.isChaosElite) {
        const pulse = 0.25 + Math.abs(Math.sin(this.animClock * 6 + m.uid)) * 0.3;
        ctx.fillStyle = `rgba(217, 70, 239, ${pulse.toFixed(2)})`;
        ctx.fillRect(dx - 2, dy - 2, w + 4, h + 4);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx - 2, dy - 2, w + 4, h + 4);
      }

      if (m.windupTimer > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.globalAlpha = 0.45;
        ctx.fillRect(dx - 2, dy - 2, w + 4, h + 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('!', Math.round(m.x - 2), dy - 6);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(Math.round(m.x - w * 0.38), GROUND_Y - 1, Math.round(w * 0.76), 2);

      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, 0, 0, w, h);
      ctx.restore();

      if (m.flashTimer > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(dx, dy, w, h);
      }

      if (!m.isBoss && m.hp < m.maxHp) {
        const bw = 22;
        const bx = Math.round(m.x - bw / 2);
        const by = dy - 5;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(bx, by, Math.max(1, Math.round(bw * (m.hp / m.maxHp))), 2);
      }
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D) {
    for (const hz of this.hazards) {
      const x = Math.round(hz.x);
      if (hz.warnTimer > 0) {
        const flash = Math.sin(this.animClock * 26) > 0;
        ctx.fillStyle = flash ? 'rgba(220, 38, 38, 0.6)' : 'rgba(245, 158, 11, 0.35)';
        ctx.fillRect(x - 14, GROUND_Y - 5, 28, 6);
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('!', x - 2, GROUND_Y - 10);
      } else {
        // Vertical crimson vault security laser sweep
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(x - 10, 18, 20, GROUND_Y - 18);
        ctx.fillStyle = '#fecaca';
        ctx.fillRect(x - 3, 18, 6, GROUND_Y - 18);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x - 14, GROUND_Y - 4, 28, 4);
      }
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    for (const pr of this.projectiles) {
      const px = Math.round(pr.x);
      const py = Math.round(pr.y);
      ctx.fillStyle = pr.color;
      if (pr.kind === 'arrow') {
        // High-velocity bullet tracer + muzzle tail
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(px - 6, py, 7, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(px + 1, py, 4, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 4, py - 1, 2, 3);
      } else if (pr.kind === 'rain_arrow') {
        // Suppressing gunfire volley from above
        ctx.fillStyle = '#facc15';
        ctx.fillRect(px, py - 5, 2, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px, py + 1, 2, 2);
      } else if (pr.kind === 'star') {
        // Concealed stiletto / switchblade throw
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(px - 4, py - 1, 8, 2);
        ctx.fillStyle = '#8b1e24';
        ctx.fillRect(px - 5, py - 1, 3, 2);
      } else if (pr.kind === 'meteor') {
        // Falling Molotov / incendiary cocktail
        ctx.fillStyle = '#8b1e24';
        ctx.fillRect(px - 4, py - 4, 8, 8);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(px - 3, py - 5, 6, 4);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(px - 2, py - 6, 4, 3);
      } else {
        ctx.fillRect(px - 2, py - 2, 5, 5);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }
  }

  private drawSlashes(ctx: CanvasRenderingContext2D) {
    for (const sl of this.slashes) {
      const alpha = Math.max(0, sl.life / sl.maxLife);
      ctx.globalAlpha = alpha;
      if (sl.kind === 'lightning' && sl.points && sl.points.length >= 2) {
        ctx.strokeStyle = sl.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sl.points[0].x, sl.points[0].y);
        for (let i = 1; i < sl.points.length; i++) {
          const midX = (sl.points[i - 1].x + sl.points[i].x) / 2;
          const midY = (sl.points[i - 1].y + sl.points[i].y) / 2 + (Math.random() - 0.5) * 14;
          ctx.lineTo(midX, midY);
          ctx.lineTo(sl.points[i].x, sl.points[i].y);
        }
        ctx.stroke();
      } else if (sl.kind === 'hammer') {
        // Heavy Mafia baseball bat / sledgehammer slam
        ctx.fillStyle = '#92400e';
        ctx.fillRect(sl.x - 16, sl.y - 24 * alpha, 32, 18);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(sl.x - 3, sl.y - 44 * alpha, 6, 22);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(sl.x - 36, GROUND_Y - 4, 72, 4);
      } else if (sl.kind === 'ring') {
        ctx.strokeStyle = sl.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, sl.radius * (1.2 - alpha * 0.4), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = sl.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(sl.x - 8, sl.y, sl.radius, -0.9, 0.9);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawDrops(ctx: CanvasRenderingContext2D) {
    for (const d of this.drops) {
      const spr = sprites.getDropSprite(d.kind);
      ctx.drawImage(spr, Math.round(d.x - 4), Math.round(d.y - 4), 8, 8);
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const fadeAlpha = Math.min(1, t.life / Math.max(0.01, t.maxLife * 0.35));
      ctx.globalAlpha = fadeAlpha;

      let scale = 1;
      if (t.isDmg) {
        const popT = Math.min(1, t.age / 0.13);
        if (popT < 1) {
          const ease = 1 - Math.pow(1 - popT, 3);
          scale = (t.isCrit ? 1.85 : 1.45) - (t.isCrit ? 0.65 : 0.45) * ease;
        } else {
          scale = t.isCrit ? 1.2 : 1.0;
        }
      }

      const x = Math.round(t.x);
      const y = Math.round(t.y);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      if (t.isCrit) {
        const pulse = 1 + Math.sin(t.age * 28) * 0.12;
        const bw = Math.round(16 * pulse);
        const bh = Math.round(6 * pulse);
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(-bw - 2, -bh - 2, bw * 2 + 4, bh * 2 + 1);
        ctx.fillStyle = '#8b1e24';
        ctx.fillRect(-bw, -bh - 1, bw * 2, bh * 2 - 1);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-bw - 4, -4, 3, 2);
        ctx.fillRect(bw + 1, -4, 3, 2);
        ctx.fillRect(-2, -bh - 4, 4, 3);
        ctx.fillRect(-2, bh, 4, 3);
      }

      ctx.font = t.isCrit ? 'bold 10px monospace' : 'bold 8px monospace';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.text, 0, 0);

      ctx.fillStyle = t.isDmg && t.age < 0.05 ? '#ffffff' : t.color;
      ctx.fillText(t.text, 0, 0);

      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
