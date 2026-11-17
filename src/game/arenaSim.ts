import { ARENA_HOUSE_FEE_PCT, COMPANIONS, JOBS, RELICS } from './constants';
import { computeDataChecksum, sanitizeNum } from './progression';
import {
  ArenaBreakdownEntry,
  ArenaCurrency,
  ArenaMatchResult,
  ArenaOpponent,
  ArenaTimelineEvent,
  CombatSnapshot,
  DuelType,
} from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FighterSimState {
  side: 'player' | 'rival';
  snap: CombatSnapshot;
  hp: number;
  maxHp: number;
  atkCd: number;
  skillCds: Record<string, number>;
  compCds: Record<string, number>;
  stunTimer: number;
  attackCounter: number;
  totalDmg: number;
  crits: number;
  stuns: number;
  breakdown: Map<string, ArenaBreakdownEntry>;
}

export function simulateArenaDuel(
  playerSnap: CombatSnapshot,
  rival: ArenaOpponent,
  seed: number,
  duelType: DuelType,
  currency: ArenaCurrency,
  stake: number,
  wagerBonusPct = 0,
  houseFeePctOverride?: number
): ArenaMatchResult {
  const rng = mulberry32(seed);

  // Calibrate Arena pacing factor so evenly matched ±20% CP builds fight ~10-16s
  const avgDps =
    Math.max(
      20,
      (playerSnap.stats.atk * playerSnap.stats.atkSpeed +
        rival.stats.atk * rival.stats.atkSpeed) *
        0.5
    );
  const avgRawHp = Math.max(120, (playerSnap.stats.maxHp + rival.stats.maxHp) * 0.5);
  const targetArenaHp = Math.max(avgRawHp * 2.4, avgDps * 13.5);
  const hpNormalizeScale = targetArenaHp / avgRawHp;

  const initFighter = (side: 'player' | 'rival', snap: CombatSnapshot): FighterSimState => {
    const hasCore = snap.equippedRelics.includes('el_nath_core');
    const coreBonusHp = hasCore ? 1.08 : 1;
    const maxHp = Math.max(
      300,
      Math.round(sanitizeNum(snap.stats.maxHp * hpNormalizeScale * coreBonusHp, 1000))
    );
    const compCds: Record<string, number> = {};
    snap.equippedCompanions.forEach((cid, i) => {
      compCds[cid] = 0.6 + i * 0.35;
    });
    return {
      side,
      snap,
      hp: maxHp,
      maxHp,
      atkCd: side === 'player' ? 0.35 : 0.45,
      skillCds: {},
      compCds,
      stunTimer: 0,
      attackCounter: 0,
      totalDmg: 0,
      crits: 0,
      stuns: 0,
      breakdown: new Map<string, ArenaBreakdownEntry>(),
    };
  };

  const pState = initFighter('player', playerSnap);
  const rState = initFighter('rival', rival);

  const recordBreakdown = (
    fighter: FighterSimState,
    sourceName: string,
    kind: 'basic' | 'skill' | 'relic' | 'companion',
    dmg: number,
    isCrit: boolean,
    color: string
  ) => {
    const existing = fighter.breakdown.get(sourceName) || {
      sourceName,
      kind,
      totalDmg: 0,
      hits: 0,
      crits: 0,
      color,
    };
    existing.totalDmg += dmg;
    existing.hits += 1;
    if (isCrit) existing.crits += 1;
    fighter.breakdown.set(sourceName, existing);
    fighter.totalDmg += dmg;
    if (isCrit) fighter.crits += 1;
  };

  const rollHit = (
    attacker: FighterSimState,
    mult: number,
    bonusCritPct = 0
  ): { dmg: number; isCrit: boolean } => {
    const hasCore = attacker.snap.equippedRelics.includes('el_nath_core');
    const effCritRate = Math.min(95, attacker.snap.stats.critRate + bonusCritPct + (hasCore ? 6 : 0));
    const isCrit = rng() * 100 < effCritRate;
    const variance = 0.92 + rng() * 0.16;
    const raw = sanitizeNum(
      attacker.snap.stats.atk * mult * variance * (isCrit ? attacker.snap.stats.critDmg / 100 : 1),
      10
    );
    return { dmg: Math.max(5, Math.floor(raw)), isCrit };
  };

  const timeline: ArenaTimelineEvent[] = [];
  const dt = 0.05;
  let t = 0;

  const pushEvent = (
    attacker: FighterSimState,
    defender: FighterSimState,
    kind: 'basic' | 'skill' | 'relic' | 'companion',
    skillName: string,
    skillColor: string,
    dmg: number,
    isCrit: boolean,
    didStun: boolean,
    didKnockback: boolean,
    aoe: boolean,
    skillId?: string
  ) => {
    defender.hp = Math.max(0, defender.hp - dmg);
    if (didStun && defender.hp > 0) {
      defender.stunTimer = Math.max(defender.stunTimer, 0.7);
      attacker.stuns += 1;
    }
    recordBreakdown(attacker, skillName, kind, dmg, isCrit, skillColor);

    timeline.push({
      t: Number(t.toFixed(2)),
      attacker: attacker.side,
      kind,
      skillId,
      skillName,
      skillColor,
      dmg,
      isCrit,
      didStun,
      didKnockback,
      playerHpAfter: pState.hp,
      rivalHpAfter: rState.hp,
      aoe,
    });
  };

  const processFighterTick = (attacker: FighterSimState, defender: FighterSimState) => {
    if (attacker.hp <= 0 || defender.hp <= 0) return;

    const jobDef = JOBS[attacker.snap.job];
    for (const sk of jobDef.skills) {
      if ((attacker.skillCds[sk.id] || 0) > 0) {
        attacker.skillCds[sk.id] = Math.max(0, attacker.skillCds[sk.id] - dt);
      }
    }

    // Companion attacks tick independently even if hero is stunned
    for (const cid of attacker.snap.equippedCompanions) {
      const cDef = COMPANIONS[cid];
      if (!cDef) continue;
      attacker.compCds[cid] = (attacker.compCds[cid] ?? 0.5) - dt;
      if (attacker.compCds[cid] <= 0 && defender.hp > 0) {
        attacker.compCds[cid] = cDef.attackCooldown;
        const cLv = attacker.snap.companionLevels[cid] || 1;
        const cDmg = Math.max(
          4,
          Math.floor(attacker.snap.stats.atk * cDef.dpsMult * (1 + (cLv - 1) * 0.2))
        );
        pushEvent(
          attacker,
          defender,
          'companion',
          cDef.name,
          cDef.projectileColor,
          cDmg,
          false,
          false,
          false,
          false
        );
      }
    }

    if (defender.hp <= 0) return;

    if (attacker.stunTimer > 0) {
      attacker.stunTimer = Math.max(0, attacker.stunTimer - dt);
      return;
    }

    const hasCore = attacker.snap.equippedRelics.includes('el_nath_core');
    const effectiveAspd = attacker.snap.stats.atkSpeed * (hasCore ? 1.15 : 1);

    // Check active skills ready (prefer strongest unlocked off cooldown)
    let castSkill = null as (typeof jobDef.skills)[number] | null;
    for (let i = jobDef.skills.length - 1; i >= 0; i--) {
      const sk = jobDef.skills[i];
      const lv = attacker.snap.skillLevels[sk.id] || 0;
      if (lv > 0 && (attacker.skillCds[sk.id] || 0) <= 0) {
        castSkill = sk;
        break;
      }
    }

    let didTriggerPrimaryAttack = false;
    let triggerCrit = false;

    if (castSkill) {
      const skLv = attacker.snap.skillLevels[castSkill.id] || 1;
      const lvScale = 1 + (skLv - 1) * 0.16;
      attacker.skillCds[castSkill.id] = Math.max(2.2, castSkill.cooldown * 0.8);
      attacker.attackCounter += 1;
      didTriggerPrimaryAttack = true;

      let totalSkillDmg = 0;
      let anyCrit = false;
      for (let h = 0; h < castSkill.hits; h++) {
        const hit = rollHit(attacker, castSkill.dmgMult * lvScale * 0.85, 4);
        totalSkillDmg += hit.dmg;
        if (hit.isCrit) anyCrit = true;
      }
      triggerCrit = anyCrit;

      const stunChance =
        attacker.snap.job === 'warrior'
          ? 0.22
          : attacker.snap.job === 'magician'
            ? 0.16
            : attacker.snap.job === 'thief'
              ? 0.14
              : 0.12;
      const didStun = rng() < stunChance;
      const didKnockback = attacker.snap.job === 'bowman' || attacker.snap.job === 'warrior';

      pushEvent(
        attacker,
        defender,
        'skill',
        castSkill.name,
        castSkill.color,
        totalSkillDmg,
        anyCrit,
        didStun,
        didKnockback,
        castSkill.aoe,
        castSkill.id
      );
    } else {
      attacker.atkCd -= dt;
      if (attacker.atkCd <= 0) {
        attacker.atkCd = 1 / Math.max(0.5, effectiveAspd);
        attacker.attackCounter += 1;
        didTriggerPrimaryAttack = true;

        const hit = rollHit(attacker, 1.0);
        triggerCrit = hit.isCrit;
        const didKnockback = hit.isCrit && rng() < 0.35;

        pushEvent(
          attacker,
          defender,
          'basic',
          `${jobDef.weaponName} Strike`,
          jobDef.accentColor,
          hit.dmg,
          hit.isCrit,
          false,
          didKnockback,
          false
        );
      }
    }

    // Relic combat triggers
    if (didTriggerPrimaryAttack && defender.hp > 0) {
      if (attacker.snap.equippedRelics.includes('zakum_anger') && attacker.attackCounter % 5 === 0) {
        const rLv = attacker.snap.relicLevels.zakum_anger || 1;
        const mHit = rollHit(attacker, 1.55 * (1 + (rLv - 1) * 0.2), 10);
        pushEvent(
          attacker,
          defender,
          'relic',
          RELICS.zakum_anger.name,
          '#f97316',
          mHit.dmg,
          mHit.isCrit,
          rng() < 0.25,
          true,
          true
        );
      }

      if (triggerCrit && attacker.snap.equippedRelics.includes('horntail_pendant') && defender.hp > 0) {
        const rLv = attacker.snap.relicLevels.horntail_pendant || 1;
        const lHit = rollHit(attacker, 0.65 * (1 + (rLv - 1) * 0.2), 0);
        pushEvent(
          attacker,
          defender,
          'relic',
          RELICS.horntail_pendant.name,
          '#34d399',
          lHit.dmg,
          lHit.isCrit,
          false,
          false,
          false
        );
      }

      if (attacker.snap.equippedRelics.includes('war_sovereign_banner') && attacker.attackCounter % 4 === 0 && defender.hp > 0) {
        const rLv = attacker.snap.relicLevels.war_sovereign_banner || 1;
        const sHit = rollHit(attacker, 1.75 * (1 + (rLv - 1) * 0.22), 12);
        pushEvent(
          attacker,
          defender,
          'relic',
          RELICS.war_sovereign_banner.name,
          '#f43f5e',
          sHit.dmg,
          sHit.isCrit,
          rng() < 0.35,
          true,
          true
        );
      }

      if (triggerCrit && attacker.snap.equippedRelics.includes('crimson_citadel_sigil') && defender.hp > 0) {
        const rLv = attacker.snap.relicLevels.crimson_citadel_sigil || 1;
        const cHit = rollHit(attacker, 0.85 * (1 + (rLv - 1) * 0.22), 8);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.025));
        pushEvent(
          attacker,
          defender,
          'relic',
          RELICS.crimson_citadel_sigil.name,
          '#fbbf24',
          cHit.dmg,
          cHit.isCrit,
          false,
          false,
          false
        );
      }
    }
  };

  while (t < 60 && pState.hp > 0 && rState.hp > 0) {
    t += dt;
    // Alternate priority slightly by seed parity so player/rival feel fair
    if (Math.floor(t * 20) % 2 === 0) {
      processFighterTick(pState, rState);
      if (rState.hp > 0) processFighterTick(rState, pState);
    } else {
      processFighterTick(rState, pState);
      if (pState.hp > 0) processFighterTick(pState, rState);
    }
  }

  const playerPct = pState.hp / pState.maxHp;
  const rivalPct = rState.hp / rState.maxHp;
  const winner: 'player' | 'rival' =
    rState.hp <= 0 ? 'player' : pState.hp <= 0 ? 'rival' : playerPct >= rivalPct ? 'player' : 'rival';

  const pot = stake * 2;
  const feePct =
    duelType === 'SNAPSHOT'
      ? Math.max(0, houseFeePctOverride ?? ARENA_HOUSE_FEE_PCT)
      : 0;
  const houseFee = Math.floor((pot * feePct) / 100);
  const basePayout = Math.max(0, pot - houseFee);
  const shrineBonus = stake > 0 && wagerBonusPct > 0 ? Math.floor((basePayout * wagerBonusPct) / 100) : 0;
  const payout = winner === 'player' ? basePayout + shrineBonus : 0;
  const netDelta = winner === 'player' ? payout - stake : -stake;

  const sortBreakdown = (m: Map<string, ArenaBreakdownEntry>) =>
    Array.from(m.values()).sort((a, b) => b.totalDmg - a.totalDmg);

  const matchId = `DUEL-${seed.toString(36).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const summaryCore = {
    matchId,
    seed,
    winner,
    durationSec: Number(t.toFixed(2)),
    playerTotalDmg: pState.totalDmg,
    rivalTotalDmg: rState.totalDmg,
    stake,
    payout,
  };

  return {
    matchId,
    seed,
    duelType,
    currency,
    stake,
    houseFee,
    payout,
    netDelta,
    winner,
    durationSec: Number(t.toFixed(2)),
    playerMaxHp: pState.maxHp,
    rivalMaxHp: rState.maxHp,
    playerTotalDmg: pState.totalDmg,
    rivalTotalDmg: rState.totalDmg,
    playerCrits: pState.crits,
    rivalCrits: rState.crits,
    playerStuns: pState.stuns,
    rivalStuns: rState.stuns,
    playerBreakdown: sortBreakdown(pState.breakdown),
    rivalBreakdown: sortBreakdown(rState.breakdown),
    timeline,
    playerSnapshot: playerSnap,
    rival,
    checksum: computeDataChecksum(summaryCore),
  };
}
