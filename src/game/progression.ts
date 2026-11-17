import {
  COMPANIONS,
  COSMETICS,
  createInitialSaveState,
  JOBS,
  MAPLE_RANKS,
  QUEST_TEMPLATES,
  RARITY_META,
  RARITY_ORDER,
  RELICS,
  SAVE_STORAGE_KEY,
  SUMMON_EXP_THRESHOLDS,
  SUMMON_RATES_BY_LEVEL,
  TRANSCEND_SKILLS,
  TRANSCEND_UNLOCK_STAGE,
  UPGRADE_LABELS,
  WEAPONS,
} from './constants';
import { SafeStorage } from './storage';
import {
  BuyMultiplier,
  CombatSnapshot,
  CompanionId,
  CosmeticId,
  GachaPullResult,
  JobId,
  LiveOpsConfig,
  OfflineGains,
  OwnedWeapon,
  PlayerSaveState,
  QuestType,
  Rarity,
  RelicId,
  StatUpgradeKey,
  TranscendSkillId,
  WeaponDef,
} from './types';

let activeLiveOps: LiveOpsConfig | null = null;

export function setActiveLiveOpsConfig(cfg: LiveOpsConfig | null): void {
  activeLiveOps = cfg;
}

export function getActiveLiveOpsConfig(): LiveOpsConfig | null {
  return activeLiveOps;
}

export function getEffectiveLiveOpsBonuses(): {
  active: boolean;
  mesoMult: number;
  expMult: number;
  starforceBonusPct: number;
  wagerRakeDiscount: number;
} {
  if (!activeLiveOps || !activeLiveOps.active || Date.now() >= activeLiveOps.ends_at) {
    return { active: false, mesoMult: 1, expMult: 1, starforceBonusPct: 0, wagerRakeDiscount: 0 };
  }
  return {
    active: true,
    mesoMult: Math.max(1, sanitizeNum(activeLiveOps.meso_multiplier || 1, 1)),
    expMult: Math.max(1, sanitizeNum(activeLiveOps.exp_multiplier || 1, 1)),
    starforceBonusPct: Math.max(0, Math.min(40, activeLiveOps.starforce_bonus_rate || 0)),
    wagerRakeDiscount: Math.max(0, Math.min(5, activeLiveOps.wager_rake_discount || 0)),
  };
}

export const MAX_FINITE_VAL = 1e304;

export function sanitizeNum(n: number, fallback = 0): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  if (n > MAX_FINITE_VAL) return MAX_FINITE_VAL;
  if (n < -MAX_FINITE_VAL) return -MAX_FINITE_VAL;
  return n;
}

export function safePow(base: number, exp: number): number {
  const b = sanitizeNum(base, 1);
  const e = sanitizeNum(exp, 0);
  if (b <= 0 && e !== Math.floor(e)) return 0;
  const res = Math.pow(b, e);
  return sanitizeNum(res, MAX_FINITE_VAL);
}

const STANDARD_SUFFIXES = ['', 'K', 'M', 'B', 'T'];

function getTierSuffix(tier: number): string {
  if (tier < STANDARD_SUFFIXES.length) return STANDARD_SUFFIXES[tier];
  const idx = tier - STANDARD_SUFFIXES.length; // 0 -> AA, 1 -> AB ... 675 -> ZZ
  if (idx >= 26 * 26) return 'ZZ';
  const first = String.fromCharCode(65 + Math.floor(idx / 26));
  const second = String.fromCharCode(65 + (idx % 26));
  return `${first}${second}`;
}

export function formatNumber(num: number): string {
  const safe = sanitizeNum(num, 0);
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  if (abs < 1000) return `${sign}${Math.floor(abs)}`;

  let tier = Math.floor(Math.log10(abs) / 3);
  let scale = Math.pow(10, tier * 3);
  let val = abs / scale;

  if (val >= 999.95 && tier < 680) {
    tier += 1;
    scale = Math.pow(10, tier * 3);
    val = abs / scale;
  }

  const formatted =
    val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
  return `${sign}${formatted}${getTierSuffix(tier)}`;
}

// Preserve formatNum export name across codebase
export const formatNum = formatNumber;

export function expForNextLevel(level: number): number {
  return Math.max(10, Math.floor(sanitizeNum(45 * safePow(1.15, Math.max(0, level - 1)), 45)));
}

export function getStageMonsterHp(stage: number, isBoss: boolean): number {
  const s = Math.max(1, stage);
  return Math.max(
    10,
    Math.floor(sanitizeNum(40 * safePow(1.16, s - 1) * (isBoss ? 12 : 1), 40))
  );
}

export function getStageMonsterAtk(stage: number, isBoss: boolean): number {
  const s = Math.max(1, stage);
  return Math.max(
    2,
    Math.floor(sanitizeNum(6 * safePow(1.12, s - 1) * (isBoss ? 2.4 : 1), 6))
  );
}

export function getStageMesoReward(stage: number, isBoss: boolean): number {
  const s = Math.max(1, stage);
  return Math.max(
    5,
    Math.floor(sanitizeNum(16 * safePow(1.135, s - 1) * (isBoss ? 8 : 1), 16))
  );
}

export function getStageExpReward(stage: number, isBoss: boolean): number {
  const s = Math.max(1, stage);
  return Math.max(
    4,
    Math.floor(sanitizeNum(12 * safePow(1.135, s - 1) * (isBoss ? 7 : 1), 12))
  );
}

export function getMilestoneMultiplier(level: number): number {
  const milestones = Math.floor(Math.max(0, level) / 25);
  return safePow(2, Math.min(200, milestones));
}

export function getWeaponAtkPct(def: WeaponDef, owned?: OwnedWeapon): number {
  if (!owned?.unlocked) return 0;
  const lvMult = 1 + (owned.level - 1) * 0.25;
  const stars = owned.stars || 0;
  const starMult =
    1 +
    stars * 0.25 +
    (stars >= 5 ? 0.35 : 0) +
    (stars >= 10 ? 0.75 : 0) +
    (stars >= 15 ? 1.5 : 0);
  return Math.round(sanitizeNum(def.baseAtkPct * lvMult * starMult, def.baseAtkPct));
}

export function getStarForceConfig(currentStars: number): {
  successPct: number;
  baseSuccessPct: number;
  bonusPct: number;
  mesoCost: number;
  stoneCost: number;
  canDropOnFail: boolean;
} {
  const baseSuccessPct = Math.max(35, 95 - currentStars * 4 - Math.max(0, currentStars - 8) * 2);
  const bonusPct = getEffectiveLiveOpsBonuses().starforceBonusPct;
  const successPct = Math.min(100, baseSuccessPct + bonusPct);
  const mesoCost = Math.floor(sanitizeNum(250 * safePow(1.38, currentStars), 250));
  const stoneCost = 2 + Math.floor(currentStars / 2);
  return {
    successPct,
    baseSuccessPct,
    bonusPct,
    mesoCost,
    stoneCost,
    canDropOnFail: currentStars > 10,
  };
}

export function computeCosmeticCollectionBonus(save: PlayerSaveState): {
  atkPct: number;
  mesoPct: number;
  critDmg: number;
  unlockedCount: number;
  totalCount: number;
} {
  let atkPct = 0;
  let mesoPct = 0;
  let critDmg = 0;
  let unlockedCount = 0;
  const ids = Object.keys(COSMETICS) as CosmeticId[];

  for (const cid of ids) {
    if (!save.cosmeticsUnlocked[cid]) continue;
    unlockedCount++;
    const def = COSMETICS[cid];
    if (def.bonusType === 'atk_pct') atkPct += def.bonusValue;
    if (def.bonusType === 'meso_pct') mesoPct += def.bonusValue;
    if (def.bonusType === 'crit_dmg') critDmg += def.bonusValue;
  }

  return {
    atkPct,
    mesoPct,
    critDmg,
    unlockedCount,
    totalCount: ids.length,
  };
}

export function getFeverDuration(save: PlayerSaveState): number {
  const twLv = save.transcendSkills?.time_warp || 0;
  return 20 + twLv * 2;
}

export interface ClanShrineBuffs {
  mesoPct: number;
  bossDmgPct: number;
  wagerBonusPct: number;
}

let activeClanShrineLevel = 0;

export function setActiveClanShrineLevel(level: number): void {
  activeClanShrineLevel = Math.max(0, Math.floor(level));
}

export function getActiveClanShrineLevel(): number {
  return activeClanShrineLevel;
}

export function getClanShrineBuffs(level: number): ClanShrineBuffs {
  const lv = Math.max(0, Math.floor(level));
  return {
    mesoPct: lv * 4,
    bossDmgPct: lv * 5,
    wagerBonusPct: lv * 2,
  };
}

export interface ComputedStats {
  atk: number;
  maxHp: number;
  critRate: number;
  critDmg: number;
  critDmgCap: number;
  atkSpeed: number;
  primaryStatVal: number;
  mesoBonusPct: number;
  expBonusPct: number;
  bossDmgBonusPct: number;
  wagerBonusPct: number;
  combatPower: number;
}

export function computeStats(save: PlayerSaveState): ComputedStats {
  const job = JOBS[save.job];
  const rank = MAPLE_RANKS[save.mapleRank] || MAPLE_RANKS[0];
  const tSkills = save.transcendSkills || {
    greed_pig: 0,
    empress_blessing: 0,
    hyper_crit: 0,
    gacha_aura: 0,
    time_warp: 0,
    fast_track: 0,
  };

  const primaryStatVal = Math.floor(12 + (save.level - 1) * 5 + save.mapleRank * 18);

  // Linear upgrade curve with x2 milestone multipliers every 25 levels
  const atkMilestone = getMilestoneMultiplier(save.upgrades.atk);
  const hpMilestone = getMilestoneMultiplier(save.upgrades.maxHp);
  const critDmgMilestone = getMilestoneMultiplier(save.upgrades.critDmg);

  const rawAtk = sanitizeNum(
    (15 + save.upgrades.atk * 7) * atkMilestone * (1 + primaryStatVal * 0.045),
    15
  );

  // Equipped weapon + Star Force multiplier
  const wpnId = save.equippedWeaponByJob[save.job];
  const wpnDef = WEAPONS.find((w) => w.id === wpnId);
  const wpnOwned = wpnId ? save.weapons[wpnId] : undefined;
  const wpnPct = wpnDef && wpnOwned?.unlocked ? getWeaponAtkPct(wpnDef, wpnOwned) : 0;
  const wpnCrit =
    wpnDef && wpnOwned?.unlocked
      ? (wpnDef.equipBonusCrit || 0) + Math.floor((wpnOwned.stars || 0) / 3)
      : 0;

  // Companion buffs
  let compAtkPct = 0;
  let compHpPct = 0;
  let compCritRate = 0;
  let compCritDmg = 0;
  let compMesoPct = 0;

  for (const cid of save.equippedCompanions) {
    const def = COMPANIONS[cid];
    const owned = save.companions[cid];
    if (!def || !owned?.unlocked) continue;
    const val = def.baseBuffValue * (1 + (owned.level - 1) * 0.25);
    if (def.buffType === 'atk_pct') compAtkPct += val;
    if (def.buffType === 'hp_pct') compHpPct += val;
    if (def.buffType === 'crit_rate') compCritRate += val;
    if (def.buffType === 'crit_dmg') compCritDmg += val;
    if (def.buffType === 'meso_pct') compMesoPct += val;
  }

  // Cosmetic Collection Bonus
  const cosBonus = computeCosmeticCollectionBonus(save);

  // Equipped Relics
  let relicAtkPct = 0;
  let relicCritRate = 0;
  for (const rid of save.equippedRelics) {
    const rDef = RELICS[rid];
    const rOwned = save.relics[rid];
    if (!rDef || !rOwned?.unlocked) continue;
    const lvScale = 1 + (rOwned.level - 1) * 0.3;
    relicAtkPct += rDef.atkPct * lvScale;
    relicCritRate += rDef.critRate;
  }

  // Blessing of the Empress (+20% multiplicative Base ATK & HP per level)
  const empressMult = 1 + (tSkills.empress_blessing || 0) * 0.2;

  const totalAtkMult =
    (1 + rank.atkBonusPct / 100) *
    (1 + (wpnPct + compAtkPct + cosBonus.atkPct + relicAtkPct) / 100) *
    empressMult;
  const atk = Math.max(10, Math.floor(sanitizeNum(rawAtk * totalAtkMult, 10)));

  const rawHp = sanitizeNum(
    (140 + save.upgrades.maxHp * 35 + save.level * 22) * hpMilestone,
    140
  );
  const maxHp = Math.max(
    100,
    Math.floor(
      sanitizeNum(rawHp * (1 + (rank.hpBonusPct + compHpPct) / 100) * empressMult, 140)
    )
  );

  const critRate = Math.min(
    95,
    job.baseCritRate + save.upgrades.critRate * 0.8 + wpnCrit + compCritRate + relicCritRate
  );

  const hyperCritLv = tSkills.hyper_crit || 0;
  const critDmgCap = 500 + hyperCritLv * 150;
  const rawCritDmg =
    job.baseCritDmg +
    save.upgrades.critDmg * 5 * critDmgMilestone +
    compCritDmg +
    cosBonus.critDmg +
    hyperCritLv * 15;
  const critDmg = Math.min(critDmgCap, sanitizeNum(rawCritDmg, job.baseCritDmg));

  const atkSpeedBonus = save.upgrades.atkSpeed * 0.04 * (save.upgrades.atkSpeed >= 25 ? 1.25 : 1);
  const atkSpeed = Number(
    Math.min(6.0, job.baseAtkSpeed * (1 + atkSpeedBonus)).toFixed(2)
  );

  const shrineBuffs = getClanShrineBuffs(save.clanId ? activeClanShrineLevel : 0);
  const greedBonusPct = (tSkills.greed_pig || 0) * 25;
  const mesoBonusPct =
    compMesoPct + cosBonus.mesoPct + save.mapleRank * 10 + greedBonusPct + shrineBuffs.mesoPct;
  const expBonusPct = rank.expBonusPct + greedBonusPct;
  const bossDmgBonusPct = shrineBuffs.bossDmgPct;
  const wagerBonusPct = shrineBuffs.wagerBonusPct;

  const avgCritMult = 1 + (critRate / 100) * (critDmg / 100 - 1);
  const combatPower = Math.floor(
    sanitizeNum(atk * atkSpeed * avgCritMult * 2.5 + maxHp * 0.25, 25)
  );

  return {
    atk,
    maxHp,
    critRate,
    critDmg,
    critDmgCap,
    atkSpeed,
    primaryStatVal,
    mesoBonusPct,
    expBonusPct,
    bossDmgBonusPct,
    wagerBonusPct,
    combatPower,
  };
}

export function getUpgradeCost(key: StatUpgradeKey, currentLevel: number): number {
  const cfg = UPGRADE_LABELS[key];
  return Math.max(1, Math.floor(sanitizeNum(cfg.baseCost * safePow(cfg.growth, currentLevel), cfg.baseCost)));
}

export function computeBulkUpgrade(
  key: StatUpgradeKey,
  currentLevel: number,
  mesos: number,
  mult: BuyMultiplier
): { levels: number; totalCost: number } {
  const cfg = UPGRADE_LABELS[key];
  const maxLv = cfg.maxLevel ?? 999999;
  if (currentLevel >= maxLv) return { levels: 0, totalCost: 0 };

  const r = cfg.growth; // 1.08
  const c0 = sanitizeNum(cfg.baseCost * safePow(r, currentLevel), MAX_FINITE_VAL);
  if (c0 >= MAX_FINITE_VAL) return { levels: 0, totalCost: MAX_FINITE_VAL };

  const capCount = maxLv - currentLevel;
  const safeMesos = Math.max(0, sanitizeNum(mesos, 0));

  const geoSum = (k: number): number => {
    if (k <= 0) return 0;
    if (k === 1) return Math.floor(c0);
    const total = c0 * ((safePow(r, k) - 1) / (r - 1));
    return Math.floor(sanitizeNum(total, MAX_FINITE_VAL));
  };

  if (mult !== 'MAX') {
    const levels = Math.min(mult, capCount);
    return { levels, totalCost: geoSum(levels) };
  }

  if (safeMesos < Math.floor(c0)) return { levels: 0, totalCost: 0 };

  // Closed-form O(1) geometric series solve for MAX buy
  const ratioArg = 1 + (safeMesos * (r - 1)) / c0;
  let levels = Math.floor(Math.log(Math.max(1, ratioArg)) / Math.log(r));
  levels = Math.max(1, Math.min(capCount, levels));

  // Fine-tune boundary within +-1 due to floor rounding
  while (levels > 0 && geoSum(levels) > safeMesos) {
    levels--;
  }
  while (levels < capCount && geoSum(levels + 1) <= safeMesos) {
    levels++;
  }

  return { levels, totalCost: geoSum(levels) };
}

export function applyExpGain(save: PlayerSaveState, expGain: number): { save: PlayerSaveState; leveledUp: boolean } {
  let { level, exp, rankPoints } = save;
  exp = sanitizeNum(exp + expGain, exp);
  let leveledUp = false;
  let guard = 0;

  while (guard < 50 && exp >= expForNextLevel(level)) {
    exp -= expForNextLevel(level);
    level++;
    rankPoints++;
    leveledUp = true;
    guard++;
  }

  return {
    save: { ...save, level, exp: Math.max(0, exp), rankPoints },
    leveledUp,
  };
}

export function advanceQuestProgress(
  save: PlayerSaveState,
  type: QuestType,
  amount: number,
  absoluteValue?: number
): PlayerSaveState {
  if (save.quest.type !== type) return save;
  const nextProg =
    absoluteValue !== undefined
      ? Math.min(save.quest.target, Math.max(save.quest.progress, absoluteValue))
      : Math.min(save.quest.target, save.quest.progress + amount);

  if (nextProg === save.quest.progress) return save;
  return {
    ...save,
    quest: {
      ...save.quest,
      progress: nextProg,
    },
  };
}

export function claimCurrentQuest(save: PlayerSaveState): PlayerSaveState {
  if (save.quest.progress < save.quest.target) return save;
  const nextIndex = save.quest.index + 1;
  const tpl = QUEST_TEMPLATES[nextIndex % QUEST_TEMPLATES.length];
  const cycle = Math.floor(nextIndex / QUEST_TEMPLATES.length);
  const nextTarget = Math.max(1, Math.round(tpl.baseTarget * Math.pow(tpl.scale, cycle)));
  const rewardDiamonds = Math.round(tpl.diamonds * (1 + cycle * 0.25));
  const rewardTickets = tpl.tickets + Math.floor(cycle / 2);

  return {
    ...save,
    diamonds: save.diamonds + save.quest.rewardDiamonds,
    summonTickets: save.summonTickets + save.quest.rewardTickets,
    styleTickets: save.styleTickets + 1,
    starStones: save.starStones + 4,
    quest: {
      index: nextIndex,
      type: tpl.type,
      label: tpl.label(nextTarget),
      target: nextTarget,
      progress: 0,
      rewardDiamonds,
      rewardTickets,
    },
  };
}

function rollRarity(summonLevel: number): Rarity {
  const table = SUMMON_RATES_BY_LEVEL[Math.min(9, Math.max(0, summonLevel - 1))];
  const r = Math.random() * 100;
  let acc = 0;
  for (const rarity of RARITY_ORDER) {
    acc += table[rarity];
    if (r <= acc) return rarity;
  }
  return 'common';
}

export function performSummon(
  save: PlayerSaveState,
  banner: 'weapon' | 'companion',
  count: 1 | 10,
  useTickets: boolean
): { save: PlayerSaveState; results: GachaPullResult[] } | null {
  const diamondCost = count === 1 ? 100 : 900;
  const ticketCost = count;

  if (useTickets) {
    if (save.summonTickets < ticketCost) return null;
  } else {
    if (save.diamonds < diamondCost) return null;
  }

  let next = {
    ...save,
    diamonds: useTickets ? save.diamonds : save.diamonds - diamondCost,
    summonTickets: useTickets ? save.summonTickets - ticketCost : save.summonTickets,
    weapons: { ...save.weapons },
    companions: { ...save.companions },
    statsTotals: {
      ...save.statsTotals,
      totalSummons: save.statsTotals.totalSummons + count,
    },
  };

  const results: GachaPullResult[] = [];
  const compIds = Object.keys(COMPANIONS) as CompanionId[];
  const gachaAuraLv = save.transcendSkills?.gacha_aura || 0;
  const summonExpPerPull = 1 + gachaAuraLv * 0.1;

  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(next.summonLevel);
    if (banner === 'weapon') {
      const pool = WEAPONS.filter((w) => w.rarity === rarity);
      const jobPool = pool.filter((w) => w.job === next.job);
      const chosen =
        jobPool.length > 0 && Math.random() < 0.45
          ? jobPool[Math.floor(Math.random() * jobPool.length)]
          : pool[Math.floor(Math.random() * pool.length)];

      const prev = next.weapons[chosen.id] || { count: 0, level: 1, unlocked: false, stars: 0 };
      const isNew = !prev.unlocked;
      next.weapons[chosen.id] = {
        unlocked: true,
        level: prev.level,
        stars: prev.stars || 0,
        count: isNew ? prev.count : prev.count + 1,
      };

      results.push({
        category: 'weapon',
        id: chosen.id,
        name: chosen.name,
        rarity: chosen.rarity,
        isNew,
        job: chosen.job,
        subLabel: `${JOBS[chosen.job].name} · +${chosen.baseAtkPct}% ATK`,
      });
    } else {
      const matching = compIds.filter((cid) => COMPANIONS[cid].rarity === rarity);
      const chosenId =
        matching.length > 0
          ? matching[Math.floor(Math.random() * matching.length)]
          : compIds[Math.floor(Math.random() * compIds.length)];
      const def = COMPANIONS[chosenId];
      const prev = next.companions[chosenId];
      const isNew = !prev.unlocked;
      next.companions[chosenId] = {
        unlocked: true,
        level: prev.level,
        count: isNew ? prev.count : prev.count + 1,
      };
      if (isNew && next.equippedCompanions.length < 2 && !next.equippedCompanions.includes(chosenId)) {
        next.equippedCompanions = [...next.equippedCompanions, chosenId];
      }

      results.push({
        category: 'companion',
        id: def.id,
        name: def.name,
        rarity: def.rarity,
        isNew,
        subLabel: `+${def.baseBuffValue}% ${def.buffLabel}`,
      });
    }

    next.summonExp = Number((next.summonExp + summonExpPerPull).toFixed(2));
    while (
      next.summonLevel < 10 &&
      next.summonExp >= SUMMON_EXP_THRESHOLDS[next.summonLevel]
    ) {
      next.summonExp = Number((next.summonExp - SUMMON_EXP_THRESHOLDS[next.summonLevel]).toFixed(2));
      next.summonLevel += 1;
    }
  }

  next = advanceQuestProgress(next, 'summon_pulls', count);
  return { save: next, results };
}

export function performStyleBoxPull(
  save: PlayerSaveState,
  useTicket: boolean
): { save: PlayerSaveState; result: GachaPullResult; duplicateRefund: boolean } | null {
  const diamondCost = 150;
  if (useTicket) {
    if (save.styleTickets < 1) return null;
  } else {
    if (save.diamonds < diamondCost) return null;
  }

  const allIds = (Object.keys(COSMETICS) as CosmeticId[]).filter(
    (id) => !COSMETICS[id].warExclusive
  );
  const locked = allIds.filter((id) => !save.cosmeticsUnlocked[id]);

  const pool = locked.length > 0 && Math.random() < 0.78 ? locked : allIds;
  const chosenId = pool[Math.floor(Math.random() * pool.length)];
  const def = COSMETICS[chosenId];
  const isNew = !save.cosmeticsUnlocked[chosenId];

  const bonusLabel =
    def.bonusType === 'atk_pct'
      ? `+${def.bonusValue}% ATK`
      : def.bonusType === 'meso_pct'
        ? `+${def.bonusValue}% Cash`
        : `+${def.bonusValue}% Crit DMG`;

  const next: PlayerSaveState = {
    ...save,
    styleTickets: useTicket ? save.styleTickets - 1 : save.styleTickets,
    diamonds: useTicket ? save.diamonds : save.diamonds - diamondCost,
    starStones: isNew ? save.starStones : save.starStones + 4,
    cosmeticsUnlocked: {
      ...save.cosmeticsUnlocked,
      [chosenId]: true,
    },
    equippedCosmetics:
      isNew && !save.equippedCosmetics[def.slot]
        ? { ...save.equippedCosmetics, [def.slot]: chosenId }
        : save.equippedCosmetics,
  };

  return {
    save: next,
    duplicateRefund: !isNew,
    result: {
      category: 'cosmetic',
      id: def.id,
      name: def.name,
      rarity: def.rarity,
      isNew,
      subLabel: isNew ? `Respect: ${bonusLabel}` : `Owned (+4 Mod Parts)`,
    },
  };
}

export function applyStarForceAttempt(
  save: PlayerSaveState,
  weaponId: string,
  caughtGreenZone: boolean
): {
  save: PlayerSaveState;
  success: boolean;
  oldStars: number;
  newStars: number;
} | null {
  const owned = save.weapons[weaponId];
  const def = WEAPONS.find((w) => w.id === weaponId);
  if (!owned?.unlocked || !def) return null;
  if (def.rarity !== 'unique' && def.rarity !== 'legendary') return null;

  const oldStars = owned.stars || 0;
  if (oldStars >= 15) return null;

  const cfg = getStarForceConfig(oldStars);
  if (save.mesos < cfg.mesoCost || save.starStones < cfg.stoneCost) return null;

  const finalChance = Math.min(100, cfg.successPct + (caughtGreenZone ? 5 : 0));
  const success = Math.random() * 100 < finalChance;

  let newStars = oldStars;
  if (success) {
    newStars = oldStars + 1;
  } else if (cfg.canDropOnFail) {
    newStars = Math.max(10, oldStars - 1);
  }

  return {
    success,
    oldStars,
    newStars,
    save: {
      ...save,
      mesos: save.mesos - cfg.mesoCost,
      starStones: save.starStones - cfg.stoneCost,
      weapons: {
        ...save.weapons,
        [weaponId]: {
          ...owned,
          stars: newStars,
        },
      },
    },
  };
}

// ==================== TRANSCENDENCE (PRESTIGE) ====================
export function isTranscendUnlocked(save: PlayerSaveState): boolean {
  return (save.highestStageCleared || 0) >= TRANSCEND_UNLOCK_STAGE || save.stage > TRANSCEND_UNLOCK_STAGE;
}

export function computePendingArcaneSymbols(save: PlayerSaveState): number {
  if (!isTranscendUnlocked(save)) return 0;
  const highestSeen = Math.max(save.highestStageCleared || 0, Math.max(0, save.stage - 1));
  const stageBasis = Math.max(save.stage, highestSeen);
  const runSymbols = Math.floor(
    safePow(Math.max(1, stageBasis - 24), 1.35) * 0.75 + Math.floor(save.level / 4)
  );
  return Math.max(2, Math.floor(sanitizeNum(runSymbols, 2)));
}

export function getTranscendSkillCost(id: TranscendSkillId, currentLevel: number): number {
  const def = TRANSCEND_SKILLS[id];
  return def.baseCost + currentLevel * def.costStep;
}

export function canUpgradeTranscendSkill(save: PlayerSaveState, id: TranscendSkillId): boolean {
  const def = TRANSCEND_SKILLS[id];
  const lv = save.transcendSkills?.[id] || 0;
  if (lv >= def.maxLevel) return false;
  if (def.requires && def.requires.length > 0) {
    const hasParent = def.requires.some((reqId) => (save.transcendSkills?.[reqId] || 0) > 0);
    if (!hasParent) return false;
  }
  const cost = getTranscendSkillCost(id, lv);
  return save.arcaneSymbols >= cost;
}

export function upgradeTranscendSkill(save: PlayerSaveState, id: TranscendSkillId): PlayerSaveState | null {
  if (!canUpgradeTranscendSkill(save, id)) return null;
  const lv = save.transcendSkills?.[id] || 0;
  const cost = getTranscendSkillCost(id, lv);
  return {
    ...save,
    arcaneSymbols: save.arcaneSymbols - cost,
    transcendSkills: {
      ...save.transcendSkills,
      [id]: lv + 1,
    },
  };
}

export function performTranscendence(save: PlayerSaveState): {
  save: PlayerSaveState;
  gainedSymbols: number;
  startStage: number;
} | null {
  if (!isTranscendUnlocked(save)) return null;
  const gainedSymbols = computePendingArcaneSymbols(save);
  const newHighest = Math.max(save.highestStageCleared || 0, Math.max(0, save.stage - 1));
  const hasFastTrack = (save.transcendSkills?.fast_track || 0) > 0;
  const startStage = hasFastTrack ? Math.max(1, Math.floor(newHighest * 0.5)) : 1;

  return {
    gainedSymbols,
    startStage,
    save: {
      ...save,
      stage: startStage,
      highestStageCleared: newHighest,
      wave: 1,
      bossReady: false,
      level: 1,
      exp: 0,
      mesos: 120,
      arcaneSymbols: save.arcaneSymbols + gainedSymbols,
      transcendCount: (save.transcendCount || 0) + 1,
      upgrades: {
        atk: 1,
        maxHp: 1,
        critRate: 0,
        critDmg: 0,
        atkSpeed: 0,
      },
    },
  };
}

export function autoMergeAndEquipBest(save: PlayerSaveState): {
  save: PlayerSaveState;
  mergesDone: number;
} {
  let mergesDone = 0;
  const weapons = { ...save.weapons };
  const jobs: JobId[] = ['warrior', 'magician', 'bowman', 'thief'];

  for (const job of jobs) {
    for (let rIdx = 0; rIdx < RARITY_ORDER.length; rIdx++) {
      const rarity = RARITY_ORDER[rIdx];
      const wpn = WEAPONS.find((w) => w.job === job && w.rarity === rarity);
      if (!wpn) continue;
      const owned = weapons[wpn.id];
      if (!owned || owned.count < 5) continue;

      const batch = Math.floor(owned.count / 5);
      weapons[wpn.id] = { ...owned, count: owned.count - batch * 5 };
      mergesDone += batch;

      if (rIdx < RARITY_ORDER.length - 1) {
        const nextRarity = RARITY_ORDER[rIdx + 1];
        const nextWpn = WEAPONS.find((w) => w.job === job && w.rarity === nextRarity);
        if (nextWpn) {
          const targetOwned = weapons[nextWpn.id] || { unlocked: false, count: 0, level: 1, stars: 0 };
          weapons[nextWpn.id] = {
            unlocked: true,
            level: targetOwned.level,
            stars: targetOwned.stars || 0,
            count: targetOwned.unlocked ? targetOwned.count + batch : targetOwned.count + Math.max(0, batch - 1),
          };
        }
      } else {
        weapons[wpn.id] = {
          ...weapons[wpn.id],
          level: weapons[wpn.id].level + batch,
        };
      }
    }
  }

  const companions = { ...save.companions };
  (Object.keys(companions) as CompanionId[]).forEach((cid) => {
    const owned = companions[cid];
    if (owned.count >= 5) {
      const batch = Math.floor(owned.count / 5);
      companions[cid] = {
        ...owned,
        count: owned.count - batch * 5,
        level: owned.level + batch,
      };
      mergesDone += batch;
    }
  });

  const equippedWeaponByJob = { ...save.equippedWeaponByJob };
  for (const job of jobs) {
    const candidates = WEAPONS.filter((w) => w.job === job && weapons[w.id]?.unlocked);
    if (candidates.length > 0) {
      candidates.sort((a, b) => getWeaponAtkPct(b, weapons[b.id]) - getWeaponAtkPct(a, weapons[a.id]));
      equippedWeaponByJob[job] = candidates[0].id;
    }
  }

  const unlockedComps = (Object.keys(companions) as CompanionId[]).filter((cid) => companions[cid].unlocked);
  unlockedComps.sort((a, b) => {
    const scoreA = RARITY_META[COMPANIONS[a].rarity].mult * companions[a].level;
    const scoreB = RARITY_META[COMPANIONS[b].rarity].mult * companions[b].level;
    return scoreB - scoreA;
  });
  const equippedCompanions = unlockedComps.slice(0, 2);

  return {
    save: {
      ...save,
      weapons,
      companions,
      equippedWeaponByJob,
      equippedCompanions,
    },
    mergesDone,
  };
}

export function regenDungeonKeys(save: PlayerSaveState): PlayerSaveState {
  const now = Date.now();
  const intervalMs = 10 * 60 * 1000;
  const elapsed = now - save.dungeonKeys.lastRegenAt;
  if (elapsed < intervalMs) return save;

  const gained = Math.floor(elapsed / intervalMs);
  const newMeso = Math.min(5, save.dungeonKeys.meso + gained);
  const newJewel = Math.min(5, save.dungeonKeys.jewel + gained);
  return {
    ...save,
    dungeonKeys: {
      ...save.dungeonKeys,
      meso: Math.max(save.dungeonKeys.meso, newMeso),
      jewel: Math.max(save.dungeonKeys.jewel, newJewel),
      lastRegenAt: save.dungeonKeys.lastRegenAt + gained * intervalMs,
    },
  };
}

export function calculateOfflineGains(save: PlayerSaveState): OfflineGains | null {
  const now = Date.now();
  const elapsedSeconds = Math.min(86400, Math.floor((now - save.lastSavedAt) / 1000));
  if (elapsedSeconds < 20) return null;

  const stats = computeStats(save);
  const liveOps = getEffectiveLiveOpsBonuses();
  const timeWarpMult = 1 + (save.transcendSkills?.time_warp || 0) * 0.2;
  const killsPerMin = 12 + Math.min(18, stats.atkSpeed * 6);
  const totalKills = (elapsedSeconds / 60) * killsPerMin;

  const mesoPerKill =
    getStageMesoReward(save.stage, false) * (1 + stats.mesoBonusPct / 100) * liveOps.mesoMult;
  const expPerKill =
    getStageExpReward(save.stage, false) * (1 + stats.expBonusPct / 100) * liveOps.expMult;

  const mesos = Math.max(50, Math.floor(sanitizeNum(totalKills * mesoPerKill * 0.65 * timeWarpMult, 50)));
  const exp = Math.max(30, Math.floor(sanitizeNum(totalKills * expPerKill * 0.65 * timeWarpMult, 30)));
  const tickets = elapsedSeconds >= 300 ? Math.min(10, Math.floor(elapsedSeconds / 600) + 1) : 0;

  return { elapsedSeconds, mesos, exp, tickets };
}

export function computeDataChecksum(payload: unknown): string {
  const json = JSON.stringify(payload);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((h1 >>> 16) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildCombatSnapshot(save: PlayerSaveState): CombatSnapshot {
  const stats = computeStats(save);
  const wpnId =
    save.equippedWeaponByJob[save.job] ||
    WEAPONS.find((w) => w.job === save.job && w.rarity === 'common')?.id ||
    'wpn_w_1';
  const wpnOwned = save.weapons[wpnId];

  const relicLevels: Partial<Record<RelicId, number>> = {};
  for (const rid of save.equippedRelics) {
    if (save.relics[rid]?.unlocked) {
      relicLevels[rid] = save.relics[rid].level;
    }
  }

  const companionLevels: Partial<Record<CompanionId, number>> = {};
  for (const cid of save.equippedCompanions) {
    if (save.companions[cid]?.unlocked) {
      companionLevels[cid] = save.companions[cid].level;
    }
  }

  const core = {
    playerId: save.profile?.playerId || 'MI-LOCAL-GUEST',
    ign: save.profile?.ign || 'Capo',
    clanTag: save.profile?.clanTag || 'SYND',
    emblem: save.profile?.emblem || 'maple_leaf',
    border: save.profile?.border || 'bronze',
    job: save.job,
    level: save.level,
    mapleRank: save.mapleRank,
    combatPower: stats.combatPower,
    stats: {
      atk: stats.atk,
      maxHp: stats.maxHp,
      critRate: Number(stats.critRate.toFixed(1)),
      critDmg: Math.round(stats.critDmg),
      atkSpeed: stats.atkSpeed,
    },
    equippedWeaponId: wpnId,
    weaponStars: wpnOwned?.stars || 0,
    weaponLevel: wpnOwned?.level || 1,
    skillLevels: { ...save.skillLevels },
    equippedRelics: [...save.equippedRelics],
    relicLevels,
    equippedCosmetics: { ...save.equippedCosmetics },
    equippedCompanions: [...save.equippedCompanions],
    companionLevels,
    wins: save.arenaStats?.wins || 0,
    losses: save.arenaStats?.losses || 0,
    syncedAt: Date.now(),
  };

  return {
    ...core,
    checksum: computeDataChecksum(core),
  };
}

export function loadSaveState(): PlayerSaveState | null {
  try {
    const raw = SafeStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerSaveState>;
    const base = createInitialSaveState();

    const mergedWeapons: Record<string, OwnedWeapon> = { ...base.weapons };
    if (parsed.weapons) {
      for (const [wid, wVal] of Object.entries(parsed.weapons)) {
        mergedWeapons[wid] = { ...base.weapons[wid], ...wVal, stars: wVal.stars ?? 0 };
      }
    }

    const mergedRelics = { ...base.relics };
    if (parsed.relics) {
      for (const rid of Object.keys(base.relics) as RelicId[]) {
        if (parsed.relics[rid]) {
          mergedRelics[rid] = { ...base.relics[rid], ...parsed.relics[rid] };
        }
      }
    }

    const parsedStage = parsed.stage ?? base.stage;
    const highestStageCleared = Math.max(
      parsed.highestStageCleared ?? 0,
      Math.max(0, parsedStage - 1)
    );

    const todayKey = new Date().toISOString().slice(0, 10);
    const savedDonations = parsed.clanDailyDonations;
    const clanDailyDonations =
      savedDonations && savedDonations.dateKey === todayKey
        ? {
            dateKey: todayKey,
            mesoCount: savedDonations.mesoCount ?? 0,
            diamondCount: savedDonations.diamondCount ?? 0,
          }
        : {
            dateKey: todayKey,
            mesoCount: 0,
            diamondCount: 0,
          };

    return {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...(parsed.profile || {}) },
      clanId: parsed.clanId !== undefined ? parsed.clanId : base.clanId,
      warMedals: sanitizeNum(parsed.warMedals ?? base.warMedals, 0),
      clanDailyDonations,
      highestStageCleared,
      honorCoins: sanitizeNum(parsed.honorCoins ?? base.honorCoins, base.honorCoins),
      chaosCores: sanitizeNum(parsed.chaosCores ?? base.chaosCores, 0),
      arcaneSymbols: sanitizeNum(parsed.arcaneSymbols ?? base.arcaneSymbols, 0),
      transcendCount: parsed.transcendCount ?? base.transcendCount,
      transcendSkills: { ...base.transcendSkills, ...(parsed.transcendSkills || {}) },
      upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
      skillLevels: { ...base.skillLevels, ...(parsed.skillLevels || {}) },
      equippedWeaponByJob: { ...base.equippedWeaponByJob, ...(parsed.equippedWeaponByJob || {}) },
      weapons: mergedWeapons,
      companions: { ...base.companions, ...(parsed.companions || {}) },
      cosmeticsUnlocked: { ...base.cosmeticsUnlocked, ...(parsed.cosmeticsUnlocked || {}) },
      equippedCosmetics: { ...base.equippedCosmetics, ...(parsed.equippedCosmetics || {}) },
      relics: mergedRelics,
      equippedRelics: parsed.equippedRelics ?? base.equippedRelics,
      dungeonKeys: { ...base.dungeonKeys, ...(parsed.dungeonKeys || {}) },
      quest: { ...base.quest, ...(parsed.quest || {}) },
      statsTotals: { ...base.statsTotals, ...(parsed.statsTotals || {}) },
      arenaStats: { ...base.arenaStats, ...(parsed.arenaStats || {}) },
      arenaHistory: Array.isArray(parsed.arenaHistory) ? parsed.arenaHistory.slice(0, 15) : [],
      integrityFlags: Array.isArray(parsed.integrityFlags) ? parsed.integrityFlags.slice(0, 10) : [],
      tainted: Boolean(parsed.tainted),
      _sig: typeof parsed._sig === 'string' ? parsed._sig : undefined,
      sfxVolume: typeof parsed.sfxVolume === 'number' ? Math.max(0, Math.min(1, parsed.sfxVolume)) : base.sfxVolume,
      bgmVolume: typeof parsed.bgmVolume === 'number' ? Math.max(0, Math.min(1, parsed.bgmVolume)) : base.bgmVolume,
      lowPowerMode: Boolean(parsed.lowPowerMode),
      redeemedPromoCodes: Array.isArray(parsed.redeemedPromoCodes) ? parsed.redeemedPromoCodes : [],
    };
  } catch {
    return null;
  }
}

export function persistSaveState(save: PlayerSaveState): void {
  try {
    SafeStorage.setItem(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        ...save,
        lastSavedAt: Date.now(),
      })
    );
  } catch {
    // Ignore serialization errors
  }
}
