import {
  CompanionId,
  CosmeticId,
  EquippedCosmetics,
  JobId,
  RelicId,
  WeaponDef,
} from './types';
import { JOBS, WEAPONS } from './constants';

export type MonsterSpriteId =
  | 'orange_mushroom'
  | 'slime'
  | 'ribbon_pig'
  | 'stump'
  | 'curse_eye'
  | 'wild_boar'
  | 'boss_mushmom'
  | 'boss_king_slime'
  | 'boss_faust'
  | 'boss_balrog'
  | 'boss_golden_pig'
  | 'boss_crystal_golem';

export type HeroFrame =
  | 'idle'
  | 'walk0'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'atk0'
  | 'atk1'
  | 'atk2'
  | 'atk3';

const HERO_FRAME_MAP: Record<
  HeroFrame,
  {
    bob: number;
    leftFoot: [number, number];
    rightFoot: [number, number];
    capeWave: number;
    swingStage: number; // -1 idle, 0 windup, 1 strike, 2 followthrough, 3 recover
  }
> = {
  idle: { bob: 0, leftFoot: [14, 29], rightFoot: [18, 29], capeWave: 0, swingStage: -1 },
  walk0: { bob: -1, leftFoot: [13, 28], rightFoot: [19, 29], capeWave: 1, swingStage: -1 },
  walk1: { bob: 0, leftFoot: [15, 29], rightFoot: [17, 29], capeWave: 0, swingStage: -1 },
  walk2: { bob: -1, leftFoot: [19, 28], rightFoot: [13, 29], capeWave: -1, swingStage: -1 },
  walk3: { bob: 0, leftFoot: [15, 29], rightFoot: [17, 29], capeWave: 0, swingStage: -1 },
  atk0: { bob: -1, leftFoot: [13, 29], rightFoot: [19, 29], capeWave: 1, swingStage: 0 },
  atk1: { bob: 0, leftFoot: [13, 29], rightFoot: [20, 29], capeWave: -1, swingStage: 1 },
  atk2: { bob: 1, leftFoot: [14, 29], rightFoot: [20, 29], capeWave: -1, swingStage: 2 },
  atk3: { bob: 0, leftFoot: [14, 29], rightFoot: [18, 29], capeWave: 0, swingStage: 3 },
};

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  palette: Record<string, string>,
  ox = 0,
  oy = 0
) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || !palette[ch]) continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

export class SpriteBank {
  private heroCache = new Map<string, HTMLCanvasElement>();
  private weaponIconCache = new Map<string, HTMLCanvasElement>();
  private monsterCache = new Map<string, HTMLCanvasElement>();
  private companionCache = new Map<string, HTMLCanvasElement>();
  private dropCache = new Map<string, HTMLCanvasElement>();
  private cosmeticCache = new Map<string, HTMLCanvasElement>();
  private relicCache = new Map<string, HTMLCanvasElement>();
  private zakumBodyCache = new Map<number, HTMLCanvasElement>();
  private zakumArmCache = new Map<string, HTMLCanvasElement>();
  private statueCache = new Map<number, HTMLCanvasElement>();

  // 36x32 pixel-art Mobster Hero wearing sharp pinstripe suit, fedora & Paper-Doll Arsenal
  getHeroSprite(
    jobId: JobId,
    frame: HeroFrame,
    weaponId?: string,
    cosmetics?: EquippedCosmetics
  ): HTMLCanvasElement {
    const cosKey = cosmetics
      ? `${cosmetics.hat || 'n'}_${cosmetics.cape || 'n'}_${cosmetics.face || 'n'}`
      : 'n_n_n';
    const key = `${jobId}_${frame}_${weaponId || 'def'}_${cosKey}`;
    const existing = this.heroCache.get(key);
    if (existing) return existing;

    const c = makeCanvas(36, 32);
    const ctx = c.getContext('2d')!;
    const job = JOBS[jobId];
    const pose = HERO_FRAME_MAP[frame];
    const bob = pose.bob;

    const wpnDef = weaponId ? WEAPONS.find((w) => w.id === weaponId) : undefined;
    const capeId = cosmetics?.cape || null;
    const hatId = cosmetics?.hat || null;
    const faceId = cosmetics?.face || null;

    // 1. Overcoat / Cape / Syndicate Aura layer behind hero
    if (capeId === 'cape_warlord_aura') {
      ctx.fillStyle = pose.capeWave >= 0 ? 'rgba(220, 38, 38, 0.38)' : 'rgba(139, 30, 36, 0.5)';
      ctx.fillRect(4, 10 + bob, 24, 18);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(6, 13 + bob, 2, 3);
      ctx.fillRect(25, 11 + bob, 2, 3);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(7, 22 + bob, 2, 2);
      ctx.fillRect(24, 20 + bob, 2, 2);
    } else if (capeId === 'cape_celestial_aura') {
      ctx.fillStyle = pose.capeWave >= 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.35)';
      ctx.fillRect(4, 9 + bob, 24, 19);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(5, 12 + bob, 2, 3);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(25, 12 + bob, 2, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(10, 8 + bob, 12, 1);
    } else if (capeId === 'cape_balrog') {
      // Fur-Collar Mob Overcoat shoulders + crimson lining
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(6 + pose.capeWave, 16 + bob, 8, 12);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(7 + pose.capeWave, 15 + bob, 6, 11);
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(9, 14 + bob, 5, 2); // fur collar
    } else if (capeId === 'cape_halo') {
      // White Silk Scarf trailing in night breeze
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(7 + pose.capeWave, 16 + bob, 6, 2);
      ctx.fillRect(5 + pose.capeWave, 18 + bob, 5, 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6 + pose.capeWave, 20 + bob, 3, 2);
    } else {
      // Trenchcoat / Pinstripe coat tail
      const coatColor = capeId === 'cape_adventurer' ? '#3f3f46' : job.capeColor;
      ctx.fillStyle = coatColor;
      ctx.fillRect(9 + pose.capeWave, 17 + bob, 5, 10);
      ctx.fillRect(8 + pose.capeWave, 23 + bob, 4, 4);
    }

    // 2. Dress Shoes (animated walk feet)
    ctx.fillStyle = '#09090b';
    ctx.fillRect(pose.leftFoot[0], pose.leftFoot[1], 3, 2);
    ctx.fillRect(pose.rightFoot[0], pose.rightFoot[1], 3, 2);
    ctx.fillStyle = '#f8fafc'; // white spats trim
    ctx.fillRect(pose.leftFoot[0], pose.leftFoot[1], 2, 1);
    ctx.fillRect(pose.rightFoot[0], pose.rightFoot[1], 2, 1);

    // 3. Pinstripe Trousers & Crisp Jacket Body
    ctx.fillStyle = '#18181b'; // charcoal suit slacks
    ctx.fillRect(14, 24 + bob, 3, 5);
    ctx.fillRect(18, 24 + bob, 3, 5);
    ctx.fillStyle = '#3f3f46'; // pinstripes
    ctx.fillRect(15, 24 + bob, 1, 5);
    ctx.fillRect(19, 24 + bob, 1, 5);

    ctx.fillStyle = '#1f1f26'; // suit jacket torso
    ctx.fillRect(13, 17 + bob, 9, 8);
    ctx.fillStyle = job.tunicColor; // crimson/job lapel & vest
    ctx.fillRect(14, 17 + bob, 7, 7);
    ctx.fillStyle = '#f8fafc'; // crisp white dress shirt V
    ctx.fillRect(16, 17 + bob, 3, 4);
    ctx.fillStyle = job.accentColor; // silk tie
    ctx.fillRect(17, 18 + bob, 1, 5);
    // Pinstripe highlights on shoulders
    ctx.fillStyle = '#52525b';
    ctx.fillRect(13, 18 + bob, 1, 6);
    ctx.fillRect(21, 18 + bob, 1, 6);

    // 4. Chibi Mobster Head + Dark Hair + Face Cosmetics
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(12, 8 + bob, 11, 9);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(12, 15 + bob, 11, 2); // jawline shadow

    // Slicked hair
    ctx.fillStyle = job.hairColor;
    ctx.fillRect(11, 6 + bob, 13, 4);
    ctx.fillRect(11, 9 + bob, 2, 5);
    ctx.fillRect(22, 9 + bob, 2, 3);

    // Eyes
    ctx.fillStyle = '#09090b';
    ctx.fillRect(16, 12 + bob, 2, 2);
    ctx.fillRect(20, 12 + bob, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(16, 12 + bob, 1, 1);
    ctx.fillRect(20, 12 + bob, 1, 1);

    // Face cosmetics (Aviator Shades / Lit Cigar)
    if (faceId === 'face_shades') {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(15, 11 + bob, 8, 3);
      ctx.fillStyle = '#f59e0b'; // gold aviator bridge
      ctx.fillRect(18, 11 + bob, 2, 1);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(16, 12 + bob, 1, 1);
      ctx.fillRect(20, 12 + bob, 1, 1);
    } else if (faceId === 'face_blush') {
      // Lit Cuban Cigar & glowing ember!
      ctx.fillStyle = '#78350f';
      ctx.fillRect(21, 14 + bob, 4, 2);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(25, 14 + bob, 1, 2);
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(25, 12 + bob, 1, 1);
    }

    // 5. Default Fedora + Hat Cosmetics
    if (hatId === 'hat_bandana') {
      // Borsalino Fedora w/ Crimson Ribbon
      ctx.fillStyle = '#27272a';
      ctx.fillRect(12, 3 + bob, 11, 4);
      ctx.fillStyle = '#8b1e24';
      ctx.fillRect(12, 6 + bob, 11, 1);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(10, 7 + bob, 15, 2);
    } else if (hatId === 'hat_mushroom') {
      // Tweed Street Flat Cap
      ctx.fillStyle = '#78716c';
      ctx.fillRect(12, 5 + bob, 12, 3);
      ctx.fillStyle = '#44403c';
      ctx.fillRect(14, 7 + bob, 11, 2);
    } else if (hatId === 'hat_zakum') {
      // Godfather Velvet Homburg
      ctx.fillStyle = '#18181b';
      ctx.fillRect(12, 3 + bob, 11, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(12, 6 + bob, 11, 1);
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(10, 7 + bob, 15, 2);
    } else if (hatId === 'hat_crown') {
      // Capo Gold Crown
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(12, 5 + bob, 11, 3);
      ctx.fillRect(12, 3 + bob, 2, 2);
      ctx.fillRect(17, 2 + bob, 2, 3);
      ctx.fillRect(21, 3 + bob, 2, 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(17, 6 + bob, 2, 1);
    } else {
      // Signature Mobster Fedora!
      ctx.fillStyle = '#27272a';
      ctx.fillRect(12, 4 + bob, 11, 3);
      ctx.fillStyle = job.accentColor;
      ctx.fillRect(12, 6 + bob, 11, 1);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(10, 7 + bob, 15, 2);
    }

    // 6. Paper-Doll Weapon in Hand
    const tier = wpnDef
      ? wpnDef.rarity === 'legendary'
        ? 5
        : wpnDef.rarity === 'unique'
          ? 4
          : wpnDef.rarity === 'epic'
            ? 3
            : wpnDef.rarity === 'rare'
              ? 2
              : 1
      : 1;

    this.drawPaperDollWeapon(ctx, jobId, tier, bob, pose.swingStage);

    this.heroCache.set(key, c);
    return c;
  }

  private drawPaperDollWeapon(
    ctx: CanvasRenderingContext2D,
    jobId: JobId,
    tier: number,
    bob: number,
    swingStage: number
  ) {
    const handX = swingStage === 0 ? 19 : swingStage === 1 || swingStage === 2 ? 23 : 22;
    const handY = 20 + bob;

    // Fist/gloved hand
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(handX - 1, handY, 3, 2);

    if (jobId === 'warrior') {
      // Enforcer: Brass Knuckles -> Bat -> Crowbar -> Cleaver -> Gold Mace
      const metal =
        tier === 5
          ? '#fbbf24'
          : tier === 4
            ? '#e5e7eb'
            : tier === 3
              ? '#94a3b8'
              : tier === 2
                ? '#b45309'
                : '#71717a';
      const trim = tier >= 4 ? '#dc2626' : '#f59e0b';

      if (swingStage === 0) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(16, 13 + bob, 2, 7);
        ctx.fillStyle = metal;
        ctx.fillRect(13, 9 + bob, 5, 5);
        if (tier >= 4) {
          ctx.fillStyle = trim;
          ctx.fillRect(14, 10 + bob, 2, 2);
        }
      } else if (swingStage === 1 || swingStage === 2) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(24, 18 + bob, 4, 2);
        ctx.fillStyle = metal;
        ctx.fillRect(27, 15 + bob, 8, 5);
        ctx.fillStyle = trim;
        ctx.fillRect(32, 16 + bob, 3, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(26, 12 + bob, 7, 2);
      } else {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(22, 17 + bob, 2, 5);
        ctx.fillStyle = metal;
        ctx.fillRect(23, 11 + bob, 4, 7);
        if (tier >= 3) {
          ctx.fillStyle = trim;
          ctx.fillRect(24, 11 + bob, 2, 2);
        }
      }
    } else if (jobId === 'magician') {
      // Arsonist: Whiskey Molotov -> Phosphorus Vial -> Nitro Dynamite -> Thermite -> Hellfire
      const glow =
        tier === 5
          ? '#ef4444'
          : tier === 4
            ? '#f97316'
            : tier === 3
              ? '#dc2626'
              : tier === 2
                ? '#10b981'
                : '#d97706';
      const thrust = swingStage === 1 || swingStage === 2 ? 2 : 0;
      ctx.fillStyle = '#10b981'; // bottle/canister glass
      ctx.fillRect(22 + thrust, 15 + bob, 4, 6);
      ctx.fillStyle = glow;
      ctx.fillRect(23 + thrust, 16 + bob, 2, 4);
      // Burning rag / fuse!
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(23 + thrust, 13 + bob, 2, 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(22 + thrust, 11 + bob, 3, 2);
      if (swingStage === 1 || swingStage === 2) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(27 + thrust, 12 + bob, 4, 4);
      }
    } else if (jobId === 'bowman') {
      // Hitman: Silenced Pistol -> Sawed-Off -> Tommy Gun -> Carbine -> Gold Tommy
      const gunMetal = tier === 5 ? '#fbbf24' : tier >= 3 ? '#27272a' : '#52525b';
      const wood = tier >= 3 ? '#78350f' : '#3f3f46';
      const drawBack = swingStage === 0 ? -1 : swingStage === 1 ? 1 : 0;
      ctx.fillStyle = wood;
      ctx.fillRect(21 + drawBack, 19 + bob, 3, 3); // grip
      ctx.fillStyle = gunMetal;
      ctx.fillRect(22 + drawBack, 17 + bob, tier >= 3 ? 11 : 8, 2); // barrel
      if (tier >= 3) {
        // Drum magazine!
        ctx.fillStyle = tier === 5 ? '#f59e0b' : '#18181b';
        ctx.fillRect(25 + drawBack, 19 + bob, 4, 4);
      }
      // Muzzle flash on strike!
      if (swingStage === 1 || swingStage === 2) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(33, 16 + bob, 3, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(34, 17 + bob, 2, 1);
      }
    } else {
      // Mastermind: Switchblade -> Derringer -> Stiletto -> Pearl Revolver -> Omertà Phantom
      const blade =
        tier === 5
          ? '#fbbf24'
          : tier === 4
            ? '#f8fafc'
            : tier === 3
              ? '#e2e8f0'
              : '#94a3b8';
      const thrust = swingStage === 1 || swingStage === 2 ? 3 : 0;
      ctx.fillStyle = '#18181b';
      ctx.fillRect(22 + thrust, 19 + bob, 3, 2);
      ctx.fillStyle = blade;
      ctx.fillRect(25 + thrust, 18 + bob, 6, 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(29 + thrust, 18 + bob, 2, 1);
    }
  }

  getWeaponIcon(weapon: WeaponDef): HTMLCanvasElement {
    const existing = this.weaponIconCache.get(weapon.id);
    if (existing) return existing;

    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    const tier =
      weapon.rarity === 'legendary'
        ? 5
        : weapon.rarity === 'unique'
          ? 4
          : weapon.rarity === 'epic'
            ? 3
            : weapon.rarity === 'rare'
              ? 2
              : 1;

    const prim =
      tier === 5
        ? '#f59e0b'
        : tier === 4
          ? '#fbbf24'
          : tier === 3
            ? '#c084fc'
            : tier === 2
              ? '#10b981'
              : '#9ca3af';

    if (weapon.job === 'warrior') {
      // Brass knuckles / Bat / Mace
      ctx.fillStyle = '#78350f';
      ctx.fillRect(3, 10, 4, 3);
      ctx.fillStyle = prim;
      ctx.fillRect(6, 5, 7, 5);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(7, 6, 2, 2);
    } else if (weapon.job === 'magician') {
      // Molotov / Dynamite
      ctx.fillStyle = prim;
      ctx.fillRect(5, 6, 6, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(7, 3, 2, 3);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(6, 1, 4, 2);
    } else if (weapon.job === 'bowman') {
      // Tommy Gun / Pistol
      ctx.fillStyle = '#78350f';
      ctx.fillRect(2, 8, 4, 4);
      ctx.fillStyle = prim;
      ctx.fillRect(4, 6, 10, 3);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(7, 9, 4, 4);
    } else {
      // Switchblade / Revolver
      ctx.fillStyle = '#18181b';
      ctx.fillRect(3, 9, 4, 4);
      ctx.fillStyle = prim;
      ctx.fillRect(6, 7, 8, 2);
      ctx.fillRect(12, 6, 2, 2);
    }

    this.weaponIconCache.set(weapon.id, c);
    return c;
  }

  getCosmeticIcon(cosmeticId: CosmeticId): HTMLCanvasElement {
    const existing = this.cosmeticCache.get(cosmeticId);
    if (existing) return existing;
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d')!;

    if (cosmeticId === 'hat_bandana') {
      ctx.fillStyle = '#27272a';
      ctx.fillRect(3, 4, 10, 6);
      ctx.fillStyle = '#8b1e24';
      ctx.fillRect(3, 8, 10, 2);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(1, 10, 14, 2);
    } else if (cosmeticId === 'hat_mushroom') {
      ctx.fillStyle = '#78716c';
      ctx.fillRect(3, 6, 10, 4);
      ctx.fillStyle = '#44403c';
      ctx.fillRect(5, 10, 9, 2);
    } else if (cosmeticId === 'hat_zakum') {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(3, 4, 10, 6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(3, 8, 10, 1);
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(1, 10, 14, 2);
    } else if (cosmeticId === 'hat_crown') {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(2, 8, 12, 4);
      ctx.fillRect(2, 4, 2, 4);
      ctx.fillRect(7, 3, 2, 5);
      ctx.fillRect(12, 4, 2, 4);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(7, 9, 2, 2);
    } else if (cosmeticId === 'cape_adventurer') {
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(4, 3, 8, 10);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(6, 3, 4, 3);
    } else if (cosmeticId === 'cape_balrog') {
      ctx.fillStyle = '#27272a';
      ctx.fillRect(3, 4, 10, 10);
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(4, 3, 8, 3);
      ctx.fillStyle = '#8b1e24';
      ctx.fillRect(6, 6, 4, 8);
    } else if (cosmeticId === 'cape_halo') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(3, 5, 10, 3);
      ctx.fillRect(4, 8, 4, 6);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(5, 10, 2, 4);
    } else if (cosmeticId === 'cape_warlord_aura') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(3, 3, 10, 10);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(6, 6, 4, 4);
    } else if (cosmeticId === 'cape_celestial_aura') {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(2, 4, 6, 8);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(8, 4, 6, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(6, 6, 4, 4);
    } else if (cosmeticId === 'face_shades') {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(2, 6, 5, 4);
      ctx.fillRect(9, 6, 5, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(7, 6, 2, 2);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(3, 7, 2, 1);
      ctx.fillRect(10, 7, 2, 1);
    } else {
      // Lit Cuban Cigar
      ctx.fillStyle = '#78350f';
      ctx.fillRect(3, 9, 8, 3);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(11, 9, 2, 3);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(11, 5, 2, 3);
    }

    this.cosmeticCache.set(cosmeticId, c);
    return c;
  }

  getRelicIcon(relicId: RelicId): HTMLCanvasElement {
    const existing = this.relicCache.get(relicId);
    if (existing) return existing;
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d')!;

    if (relicId === 'zakum_anger') {
      // Golden Tommy Gun
      ctx.fillStyle = '#78350f';
      ctx.fillRect(2, 8, 4, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(4, 6, 10, 3);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(7, 9, 4, 4);
    } else if (relicId === 'horntail_pendant') {
      // The Godfather's Ring
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(4, 5, 8, 8);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(6, 7, 4, 4);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(6, 3, 4, 3);
    } else if (relicId === 'war_sovereign_banner') {
      // Capo Syndicate Ledger
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(3, 2, 10, 12);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(5, 5, 6, 2);
      ctx.fillRect(5, 9, 4, 2);
    } else if (relicId === 'crimson_citadel_sigil') {
      // Bribed Precinct Badge
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(4, 2, 8, 12);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(6, 5, 4, 6);
    } else {
      // Fed Master Key
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(3, 5, 5, 5);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(5, 7, 1, 1);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(8, 7, 6, 2);
      ctx.fillRect(11, 9, 3, 2);
    }

    this.relicCache.set(relicId, c);
    return c;
  }

  // Federal Reserve Vault Boss + 6 Armored Security Turret Arms
  getZakumBodySprite(frame: 0 | 1): HTMLCanvasElement {
    const existing = this.zakumBodyCache.get(frame);
    if (existing) return existing;

    const c = makeCanvas(32, 32);
    const ctx = c.getContext('2d')!;
    const pulse = frame === 1;

    // Massive Armored Federal Reserve Bank Vault Door
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(4, 4, 24, 25);
    ctx.fillStyle = '#52525b';
    ctx.fillRect(6, 6, 20, 21);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(8, 8, 16, 17);

    // Vault Steel Dial & Spokes
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(13, 12, 6, 6);
    ctx.fillRect(11, 14, 10, 2);
    ctx.fillRect(15, 10, 2, 10);

    // Red Security Alarm Lights
    ctx.fillStyle = pulse ? '#ef4444' : '#7f1d1d';
    ctx.fillRect(7, 5, 4, 3);
    ctx.fillRect(21, 5, 4, 3);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(14, 21, 4, 2);

    this.zakumBodyCache.set(frame, c);
    return c;
  }

  getZakumArmSprite(side: 'left' | 'right', frame: 0 | 1): HTMLCanvasElement {
    const key = `${side}_${frame}`;
    const existing = this.zakumArmCache.get(key);
    if (existing) return existing;

    const c = makeCanvas(16, 12);
    const ctx = c.getContext('2d')!;
    const shift = frame === 1 ? 1 : 0;

    // Armored Vault Laser Turret / Heavy Guard Rig
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(2, 3 + shift, 12, 6);
    ctx.fillStyle = '#71717a';
    ctx.fillRect(4, 4 + shift, 8, 4);
    ctx.fillStyle = '#dc2626';
    if (side === 'left') {
      ctx.fillRect(0, 4 + shift, 4, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(1, 5 + shift, 2, 1);
    } else {
      ctx.fillRect(12, 4 + shift, 4, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(13, 5 + shift, 2, 1);
    }

    this.zakumArmCache.set(key, c);
    return c;
  }

  // Turf War HQ Landmark / Armored Front Safe
  getGuardianStatueSprite(frame: 0 | 1): HTMLCanvasElement {
    const existing = this.statueCache.get(frame);
    if (existing) return existing;

    const c = makeCanvas(28, 34);
    const ctx = c.getContext('2d')!;
    const shimmer = frame === 1;

    // Marble Mafia Clubhouse Pedestal + Armored Vault Safe
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(4, 27, 20, 7);
    ctx.fillStyle = '#52525b';
    ctx.fillRect(6, 25, 16, 2);

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(6, 7, 16, 18);
    ctx.fillStyle = '#374151';
    ctx.fillRect(8, 9, 12, 14);
    ctx.fillStyle = shimmer ? '#fbbf24' : '#d97706';
    ctx.fillRect(11, 13, 6, 6);
    ctx.fillStyle = '#8b1e24';
    ctx.fillRect(8, 3, 12, 4);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(10, 4, 8, 2);

    this.statueCache.set(frame, c);
    return c;
  }

  // Mafia Crew Companions: Corrupt Accountant, Hired Muscle, Explosives Expert, Wheelman, Attack Doberman
  getCompanionSprite(id: CompanionId, frame: 0 | 1): HTMLCanvasElement {
    const key = `${id}_${frame}`;
    const existing = this.companionCache.get(key);
    if (existing) return existing;

    const c = makeCanvas(14, 13);
    const ctx = c.getContext('2d')!;
    const bob = frame === 1 ? 1 : 0;

    if (id === 'shroom_buddy') {
      // Corrupt Accountant (green banker visor + vest + ledger)
      const rows = [
        '....gggggg....',
        '...gggggggg...',
        '...ssssssss...',
        '...skssssks...',
        '....ssssss....',
        '...wwwwwwww...',
        '...wwbbbbww...',
        '...wwwwwwww...',
        '....bb..bb....',
      ];
      drawGrid(ctx, rows, {
        g: '#10b981',
        s: '#fde68a',
        k: '#09090b',
        w: '#f8fafc',
        b: '#3f3f46',
      }, 0, bob);
    } else if (id === 'baby_dragon') {
      // Hired Muscle (bulky bouncer in shades + dark suit)
      const rows = [
        '....kkkkkk....',
        '...kkkkkkkk...',
        '...ssggggss...',
        '...ssssssss...',
        '..bbbbbbbbbb..',
        '..bbbrrrrbbb..',
        '..bbbbbbbbbb..',
        '...bbb..bbb...',
        '...kk....kk...',
      ];
      drawGrid(ctx, rows, {
        k: '#09090b',
        s: '#fde68a',
        g: '#18181b',
        b: '#27272a',
        r: '#8b1e24',
      }, 0, bob);
    } else if (id === 'jr_boogie') {
      // Explosives Expert (orange goggles + TNT bundle)
      const rows = [
        '....oooooo....',
        '...ooyyyyoo...',
        '...ssssssss...',
        '...skssssks...',
        '...rrrrrrrr...',
        '...rrryyrrr...',
        '...rrrrrrrr...',
        '....bb..bb....',
      ];
      drawGrid(ctx, rows, {
        o: '#9a3412',
        y: '#fbbf24',
        s: '#fde68a',
        k: '#09090b',
        r: '#dc2626',
        b: '#18181b',
      }, 0, bob);
    } else if (id === 'mini_yeti') {
      // Wheelman (flat cap + leather driving jacket + gloves)
      const rows = [
        '...cccccccc...',
        '..cccccccccccc',
        '...ssssssss...',
        '...sskkkkss...',
        '..bbbbbbbbbb..',
        '..bbwwwwwwbb..',
        '..bbbbbbbbbb..',
        '...bbb..bbb...',
      ];
      drawGrid(ctx, rows, {
        c: '#52525b',
        s: '#fde68a',
        k: '#09090b',
        b: '#78350f',
        w: '#e4e4e7',
      }, 0, bob);
    } else {
      // Attack Doberman (sleek black & tan mob guard dog)
      const rows = [
        '..k......kk...',
        '..kk....kkbk..',
        '...kkkkkkkkb..',
        '....kkkkkbbk..',
        '.kkkkkkkkk....',
        '.kbbkkkkkbb...',
        '..kk.....kk...',
        '..tt.....tt...',
      ];
      drawGrid(ctx, rows, {
        k: '#18181b',
        b: '#d97706',
        t: '#f59e0b',
      }, 0, bob);
    }

    this.companionCache.set(key, c);
    return c;
  }

  getMonsterSprite(id: MonsterSpriteId, frame: 0 | 1): HTMLCanvasElement {
    const key = `${id}_${frame}`;
    const existing = this.monsterCache.get(key);
    if (existing) return existing;

    const isBoss = id.startsWith('boss_');
    const w = isBoss ? 24 : 16;
    const h = isBoss ? 24 : 16;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d')!;
    const sq = frame === 1 ? 1 : 0;

    if (id === 'orange_mushroom') {
      // Street Thug (knit beanie + hoodie + bat)
      drawGrid(
        ctx,
        [
          '.....rrrrrr.....',
          '....rrrrrrrr....',
          '....ssssssss....',
          '....skssssks....',
          '...rrrrrrrrrr...',
          '...rrgggggggr...',
          '...rrrrrrrrrr...',
          '....bb....bb....',
        ],
        {
          r: '#3f3f46',
          s: '#fde68a',
          k: '#09090b',
          g: '#71717a',
          b: '#18181b',
        },
        0,
        4 + sq
      );
    } else if (id === 'slime') {
      // Corrupt Beat Cop (blue cap + badge + nightstick)
      drawGrid(
        ctx,
        [
          '....bbbbbbbb....',
          '...bbbbbbbbbb...',
          '....ssssssss....',
          '....skssssks....',
          '...bbbbbbbbbb...',
          '...bbbyyyybbb...',
          '...bbbbbbbbbb...',
          '....kk....kk....',
        ],
        {
          b: '#1e3a8a',
          s: '#fde68a',
          k: '#09090b',
          y: '#fbbf24',
        },
        0,
        4 + sq
      );
    } else if (id === 'ribbon_pig') {
      // Club Bouncer (sunglasses + burgundy jacket)
      drawGrid(
        ctx,
        [
          '....kkkkkkkk....',
          '....ssssssss....',
          '...sskkkkkkss...',
          '....ssssssss....',
          '..rrrrrrrrrrrr..',
          '..rrrwwwwwwrrr..',
          '..rrrrrrrrrrrr..',
          '...kk......kk...',
        ],
        {
          k: '#09090b',
          s: '#fde68a',
          r: '#8b1e24',
          w: '#f8fafc',
        },
        0,
        4 + sq
      );
    } else if (id === 'stump') {
      // Rival Syndicate Enforcer (black fedora + trenchcoat)
      drawGrid(
        ctx,
        [
          '...dddddddddd...',
          '..dddddddddddd..',
          '....ssssssss....',
          '....skssssks....',
          '...dddddddddd...',
          '...dddrrrrddd...',
          '...dddddddddd...',
          '....dd....dd....',
        ],
        {
          d: '#27272a',
          s: '#fde68a',
          k: '#09090b',
          r: '#dc2626',
        },
        0,
        4 + sq
      );
    } else if (id === 'curse_eye') {
      // Dockside Smuggler (knit cap + striped shirt)
      drawGrid(
        ctx,
        [
          '.....oooooo.....',
          '....oooooooo....',
          '....ssssssss....',
          '....skssssks....',
          '...wwwwwwwwww...',
          '...bbbbbbbbbb...',
          '...wwwwwwwwww...',
          '....kk....kk....',
        ],
        {
          o: '#9a3412',
          s: '#fde68a',
          k: '#09090b',
          w: '#e4e4e7',
          b: '#1e293b',
        },
        0,
        4 + sq
      );
    } else if (id === 'wild_boar') {
      // Armored SWAT Trooper (riot helmet + visor + kevlar)
      drawGrid(
        ctx,
        [
          '....kkkkkkkk....',
          '...kkkcccckkk...',
          '...kkcccccckk...',
          '..kkkkkkkkkkkk..',
          '..kkbbbbbbbbkk..',
          '..kkkkkkkkkkkk..',
          '...kkk....kkk...',
          '...kk......kk...',
        ],
        {
          k: '#18181b',
          c: '#38bdf8',
          b: '#3f3f46',
        },
        0,
        4 + sq
      );
    } else if (id === 'boss_mushmom') {
      // Street Captain Boss (crimson fedora + pinstripe coat)
      drawGrid(
        ctx,
        [
          '......rrrrrrrr......',
          '....rrrrrrrrrrrr....',
          '...dddddddddddddd...',
          '.....ssssssssss.....',
          '.....sskksskkss.....',
          '.....ssssssssss.....',
          '...dddddddddddddd...',
          '...ddddwwwwwwdddd...',
          '...ddddrryyrrdddd...',
          '...ddddddddddddd....',
          '.....ddd....ddd.....',
        ],
        {
          r: '#8b1e24',
          d: '#18181b',
          s: '#fde68a',
          k: '#09090b',
          w: '#f8fafc',
          y: '#f59e0b',
        },
        2,
        6 + sq
      );
    } else if (id === 'boss_king_slime') {
      // Rival Don (white suit + gold crown + cigar)
      drawGrid(
        ctx,
        [
          '......yyyyyyyy......',
          '....yyggggggggyy....',
          '.....ssssssssss.....',
          '.....sskkkkkkss.....',
          '.....ssssssssss.....',
          '...wwwwwwwwwwwwww...',
          '...wwwwrrrrrrwwww...',
          '...wwwwwwwwwwwwww...',
          '....wwww....wwww....',
          '....kkkk....kkkk....',
        ],
        {
          y: '#fbbf24',
          g: '#27272a',
          s: '#fde68a',
          k: '#09090b',
          w: '#f1f5f9',
          r: '#991b1b',
        },
        2,
        6 + sq
      );
    } else if (id === 'boss_faust') {
      // Harbor Syndicate Boss (captain hat + fur coat)
      drawGrid(
        ctx,
        [
          '.....bbbbbbbbbb.....',
          '...bbbyyyyyyyybbb...',
          '.....ssssssssss.....',
          '.....skksssskks.....',
          '...dddddddddddddd...',
          '...dddggggggggddd...',
          '...ddddddddddddd....',
          '....dddd....dddd....',
        ],
        {
          b: '#0f172a',
          y: '#fbbf24',
          s: '#fde68a',
          k: '#09090b',
          d: '#3f3f46',
          g: '#10b981',
        },
        2,
        7 + sq
      );
    } else if (id === 'boss_golden_pig') {
      // Armored Brinks Cash Truck!
      drawGrid(
        ctx,
        [
          '..gggggggggggggggg..',
          '.gggggggggggggggggg.',
          '.ggyyyyyyyyyyyyyygg.',
          '.ggyyggggggggggyygg.',
          '.ggggggggggccgggggg.',
          '.ggggggggggccgggggg.',
          '.kkkkkkkkkkkkkkkkkk.',
          '...kkk........kkk...',
        ],
        {
          g: '#065f46',
          y: '#fbbf24',
          c: '#bae6fd',
          k: '#18181b',
        },
        2,
        8 + sq
      );
    } else if (id === 'boss_crystal_golem') {
      // Diamond District Treasury Safe!
      drawGrid(
        ctx,
        [
          '....dddddddddddd....',
          '...ddyyyyyyyyyydd...',
          '..dddggggggggggddd..',
          '..ddggyyyyyyyyggdd..',
          '..ddggyyyyyyyyggdd..',
          '..dddggggggggggddd..',
          '...dddddddddddddd...',
          '....kkk......kkk....',
        ],
        {
          d: '#3f3f46',
          y: '#fbbf24',
          g: '#18181b',
          k: '#09090b',
        },
        2,
        7 + sq
      );
    } else {
      // Crimson Balrog -> Federal Director / Kingpin Heavy
      drawGrid(
        ctx,
        [
          '....rrrrrrrrrrrr....',
          '...rrddddddddddrr...',
          '....ssssssssssss....',
          '....sskkkkkkkkss....',
          '..dddddddddddddddd..',
          '..dddrrrrrrrrrrddd..',
          '..dddyyyyyyyyyyddd..',
          '..dddddddddddddddd..',
          '....dddd....dddd....',
        ],
        {
          r: '#dc2626',
          d: '#18181b',
          s: '#fde68a',
          k: '#09090b',
          y: '#fbbf24',
        },
        2,
        6 + sq
      );
    }

    this.monsterCache.set(key, c);
    return c;
  }

  getDropSprite(kind: 'meso' | 'exp' | 'diamond' | 'chaos_core'): HTMLCanvasElement {
    const existing = this.dropCache.get(kind);
    if (existing) return existing;

    const c = makeCanvas(8, 8);
    const ctx = c.getContext('2d')!;
    if (kind === 'meso') {
      // Crisp Emerald Cash Stack ($)
      ctx.fillStyle = '#065f46';
      ctx.fillRect(0, 2, 8, 5);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(1, 2, 6, 4);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(3, 2, 2, 4); // paper currency band
    } else if (kind === 'diamond') {
      // Gold Bullion Bar
      ctx.fillStyle = '#b45309';
      ctx.fillRect(1, 2, 6, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(1, 2, 5, 3);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(2, 2, 2, 1);
    } else if (kind === 'chaos_core') {
      // Blackmail Manila Folder
      ctx.fillStyle = '#92400e';
      ctx.fillRect(1, 1, 6, 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(1, 2, 6, 5);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(2, 4, 4, 2); // TOP SECRET stamp
    } else {
      // Street Respect Star / EXP Chip
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(3, 1, 2, 6);
      ctx.fillRect(1, 3, 6, 2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(3, 3, 2, 2);
    }

    this.dropCache.set(kind, c);
    return c;
  }
}

export const sprites = new SpriteBank();
