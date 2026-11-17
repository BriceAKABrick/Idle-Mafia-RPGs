export type JobId = 'warrior' | 'magician' | 'bowman' | 'thief';
export type PrimaryStat = 'STR' | 'INT' | 'DEX' | 'LUK';
export type Rarity = 'common' | 'rare' | 'epic' | 'unique' | 'legendary';
export type StatUpgradeKey = 'atk' | 'maxHp' | 'critRate' | 'critDmg' | 'atkSpeed';
export type BuyMultiplier = 1 | 10 | 'MAX';
export type GameMode = 'TITLE_MENU' | 'PLAYING' | 'PAUSED';
export type CombatMode =
  | 'FARMING'
  | 'BOSS'
  | 'DUNGEON_MESO'
  | 'DUNGEON_JEWEL'
  | 'EXPEDITION_ZAKUM'
  | 'ARENA_PVP'
  | 'CLAN_SIEGE';
export type ZoneId = 'little_italy' | 'docks' | 'financial' | 'casino' | 'lockdown';
export type CompanionId = 'baby_dragon' | 'jr_boogie' | 'mini_yeti' | 'shroom_buddy' | 'pink_bean';

export type NetworkMode = 'SANDBOX' | 'LIVE';
export type ArenaCurrency = 'diamonds' | 'chaosCores' | 'honorCoins';
export type WagerTier = 100 | 500 | 2500 | 'ALL_IN';
export type DuelType = 'SNAPSHOT' | 'LIVE_INVITE';

export interface LiveOpsConfig {
  event_id: string;
  event_title: string;
  meso_multiplier: number;
  exp_multiplier: number;
  starforce_bonus_rate: number;
  wager_rake_discount: number;
  promo_code: string;
  promo_reward: {
    diamonds?: number;
    styleTickets?: number;
    starStones?: number;
    mesos?: number;
  };
  ends_at: number;
  active: boolean;
}

export interface PlayerWagerSubmission {
  matchId: string;
  seed: number;
  duelType: DuelType;
  currency: ArenaCurrency;
  stake: number;
  wagerBonusPct: number;
  houseFeePct: number;
  playerSnapshot: CombatSnapshot;
  rivalSnapshot: ArenaOpponent;
  submittedAt: number;
  submissionSig: string;
}
export type ProfileEmblemId =
  | 'maple_leaf'
  | 'zakum_crest'
  | 'balrog_horn'
  | 'empress_crown'
  | 'slime_king'
  | 'night_lord';
export type ProfileBorderId = 'bronze' | 'silver' | 'gold' | 'arcane' | 'chaos';

export type CosmeticSlot = 'hat' | 'cape' | 'face';
export type CosmeticId =
  | 'hat_bandana'
  | 'hat_mushroom'
  | 'hat_zakum'
  | 'hat_crown'
  | 'cape_adventurer'
  | 'cape_balrog'
  | 'cape_halo'
  | 'cape_warlord_aura'
  | 'cape_celestial_aura'
  | 'face_shades'
  | 'face_blush';

export interface CosmeticDef {
  id: CosmeticId;
  name: string;
  slot: CosmeticSlot;
  rarity: Rarity;
  isMythic?: boolean;
  warExclusive?: boolean;
  bonusType: 'atk_pct' | 'meso_pct' | 'crit_dmg';
  bonusValue: number;
  desc: string;
}

export interface EquippedCosmetics {
  hat: CosmeticId | null;
  cape: CosmeticId | null;
  face: CosmeticId | null;
}

export type RelicId =
  | 'zakum_anger'
  | 'horntail_pendant'
  | 'el_nath_core'
  | 'war_sovereign_banner'
  | 'crimson_citadel_sigil';

export interface RelicDef {
  id: RelicId;
  name: string;
  rarity: Rarity;
  isMythic?: boolean;
  warExclusive?: boolean;
  atkPct: number;
  critRate: number;
  passiveEffect:
    | 'meteor_every_5'
    | 'chain_lightning_crit'
    | 'fever_boost'
    | 'siege_shockwave'
    | 'warlord_crit';
  passiveLabel: string;
  desc: string;
}

export interface OwnedRelic {
  unlocked: boolean;
  level: number;
  count: number;
}

export type TranscendSkillId =
  | 'greed_pig'
  | 'empress_blessing'
  | 'hyper_crit'
  | 'gacha_aura'
  | 'time_warp'
  | 'fast_track';

export interface TranscendSkillDef {
  id: TranscendSkillId;
  name: string;
  shortName: string;
  desc: string;
  effectPerLvLabel: string;
  maxLevel: number;
  baseCost: number;
  costStep: number;
  isCapstone?: boolean;
  requires?: TranscendSkillId[];
  // Normalized 0..100 SVG coordinates for constellation graph
  x: number;
  y: number;
}

export interface SkillDef {
  id: string;
  job: JobId;
  name: string;
  desc: string;
  cooldown: number; // seconds
  dmgMult: number; // multiplier of hero ATK
  hits: number;
  aoe: boolean;
  unlockCost: number; // Mesos
  color: string;
}

export interface JobDef {
  id: JobId;
  name: string;
  advancementTitle: string;
  primaryStat: PrimaryStat;
  weaponName: string;
  desc: string;
  range: number; // px on logical 320px canvas
  baseAtkSpeed: number; // attacks per second
  baseCritRate: number; // %
  baseCritDmg: number; // %
  tunicColor: string;
  accentColor: string;
  hairColor: string;
  capeColor: string;
  skills: SkillDef[];
}

export interface MapleRankTier {
  tier: number;
  name: string;
  cost: number; // Rank Points
  atkBonusPct: number;
  hpBonusPct: number;
  expBonusPct: number;
  auraColor: string;
}

export interface WeaponDef {
  id: string;
  name: string;
  job: JobId;
  rarity: Rarity;
  baseAtkPct: number;
  equipBonusCrit?: number;
}

export interface OwnedWeapon {
  count: number; // duplicates available to merge
  level: number; // enhancement level
  unlocked: boolean;
  stars?: number; // Star Force 0..15 for Unique/Legendary
}

export interface CompanionDef {
  id: CompanionId;
  name: string;
  rarity: Rarity;
  buffLabel: string;
  buffType: 'atk_pct' | 'crit_rate' | 'hp_pct' | 'meso_pct' | 'crit_dmg';
  baseBuffValue: number;
  dpsMult: number;
  attackCooldown: number;
  projectileColor: string;
}

export interface OwnedCompanion {
  unlocked: boolean;
  count: number;
  level: number;
}

export type QuestType =
  | 'kill_monsters'
  | 'upgrade_atk'
  | 'upgrade_hp'
  | 'clear_waves'
  | 'defeat_boss'
  | 'summon_pulls'
  | 'reach_stage'
  | 'use_dungeon';

export interface QuestProgressState {
  index: number;
  type: QuestType;
  label: string;
  target: number;
  progress: number;
  rewardDiamonds: number;
  rewardTickets: number;
}

export interface PlayerProfile {
  playerId: string;
  ign: string;
  clanTag: string;
  emblem: ProfileEmblemId;
  border: ProfileBorderId;
  createdAt: number;
}

export interface ArenaStats {
  wins: number;
  losses: number;
  streak: number;
  totalWonDiamonds: number;
}

export interface CombatSnapshot {
  playerId: string;
  ign: string;
  clanTag: string;
  emblem: ProfileEmblemId;
  border: ProfileBorderId;
  job: JobId;
  level: number;
  mapleRank: number;
  combatPower: number;
  stats: {
    atk: number;
    maxHp: number;
    critRate: number;
    critDmg: number;
    atkSpeed: number;
  };
  equippedWeaponId: string;
  weaponStars: number;
  weaponLevel: number;
  skillLevels: Record<string, number>;
  equippedRelics: RelicId[];
  relicLevels: Partial<Record<RelicId, number>>;
  equippedCosmetics: EquippedCosmetics;
  equippedCompanions: CompanionId[];
  companionLevels: Partial<Record<CompanionId, number>>;
  wins: number;
  losses: number;
  syncedAt: number;
  checksum: string;
}

export interface ArenaOpponent extends CombatSnapshot {
  isSimulated: boolean;
  onlineStatus: 'online' | 'in_lobby' | 'snapshot';
  preferredCurrency: ArenaCurrency;
}

export interface ArenaBreakdownEntry {
  sourceName: string;
  kind: 'basic' | 'skill' | 'relic' | 'companion';
  totalDmg: number;
  hits: number;
  crits: number;
  color: string;
}

export interface ArenaTimelineEvent {
  t: number;
  attacker: 'player' | 'rival';
  kind: 'basic' | 'skill' | 'relic' | 'companion';
  skillId?: string;
  skillName: string;
  skillColor: string;
  dmg: number;
  isCrit: boolean;
  didStun: boolean;
  didKnockback: boolean;
  playerHpAfter: number;
  rivalHpAfter: number;
  aoe: boolean;
}

export interface ArenaMatchResult {
  matchId: string;
  seed: number;
  duelType: DuelType;
  currency: ArenaCurrency;
  stake: number;
  houseFee: number;
  payout: number;
  netDelta: number;
  winner: 'player' | 'rival';
  durationSec: number;
  playerMaxHp: number;
  rivalMaxHp: number;
  playerTotalDmg: number;
  rivalTotalDmg: number;
  playerCrits: number;
  rivalCrits: number;
  playerStuns: number;
  rivalStuns: number;
  playerBreakdown: ArenaBreakdownEntry[];
  rivalBreakdown: ArenaBreakdownEntry[];
  timeline: ArenaTimelineEvent[];
  playerSnapshot: CombatSnapshot;
  rival: ArenaOpponent;
  checksum: string;
}

export interface ArenaMatchHistoryItem {
  matchId: string;
  rivalIgn: string;
  rivalClan: string;
  rivalJob: JobId;
  rivalCp: number;
  duelType: DuelType;
  currency: ArenaCurrency;
  stake: number;
  netDelta: number;
  winner: 'player' | 'rival';
  timestamp: number;
}

export type ClanCrestIconId =
  | 'maple_crest'
  | 'dragon_fang'
  | 'golden_crown'
  | 'crimson_blade'
  | 'arcane_star'
  | 'slime_sigil'
  | 'zakum_mask'
  | 'storm_bolt';

export type ClanCrestBgColor =
  | 'crimson'
  | 'cobalt'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'obsidian';

export interface ClanCrest {
  icon: ClanCrestIconId;
  bgColor: ClanCrestBgColor;
}

export type ClanRank = 'master' | 'jr_master' | 'member';

export interface ClanMember {
  playerId: string;
  ign: string;
  job: JobId;
  level: number;
  combatPower: number;
  rank: ClanRank;
  onlineStatus: 'online' | 'in_war' | 'offline';
  weeklyContribution: number;
  equippedWeaponId: string;
  equippedCosmetics: EquippedCosmetics;
  snapshot: CombatSnapshot;
}

export interface ClanShrineState {
  level: number;
  exp: number;
  nextLevelExp: number;
  totalMesoDonated: number;
  totalDiamondDonated: number;
}

export interface ClanChatMessage {
  id: string;
  senderIgn: string;
  senderRank?: ClanRank;
  kind: 'chat' | 'system';
  text: string;
  timestamp: number;
}

export interface ClanInfo {
  clanId: string;
  name: string;
  tag: string;
  crest: ClanCrest;
  minCp: number;
  memberCount: number;
  maxMembers: number;
  totalCp: number;
  level: number;
  shrine: ClanShrineState;
  members: ClanMember[];
  createdAt: number;
}

export interface ClanDirectoryEntry {
  clanId: string;
  name: string;
  tag: string;
  crest: ClanCrest;
  minCp: number;
  memberCount: number;
  maxMembers: number;
  totalCp: number;
  level: number;
  shrineLevel: number;
}

export type WarLaneId = 'henesys_fortress' | 'kerning_tower' | 'perion_citadel';

export interface WarDefender {
  playerId: string;
  ign: string;
  job: JobId;
  level: number;
  combatPower: number;
  defeated: boolean;
  snapshot: CombatSnapshot;
}

export interface WarLaneState {
  id: WarLaneId;
  name: string;
  subtitle: string;
  citadelHp: number;
  citadelMaxHp: number;
  ourCitadelHp: number;
  ourCitadelMaxHp: number;
  ourDefenders: WarDefender[];
  enemyDefenders: WarDefender[];
  enemyStatueHp: number;
  enemyStatueMaxHp: number;
  ourStatueHp: number;
  ourStatueMaxHp: number;
  controlledBy: 'ally' | 'enemy' | 'contested';
}

export interface ClanWarChestReward {
  won: boolean;
  lanesWon: number;
  lanesLost: number;
  contributionRank: number;
  rankTier: string;
  diamonds: number;
  warMedals: number;
  mythicRelicId?: RelicId;
  cosmeticAuraId?: CosmeticId;
  claimed: boolean;
}

export interface ClanWarState {
  warId: string;
  status: 'IDLE' | 'ACTIVE' | 'ENDED';
  startedAt: number;
  endsAt: number;
  rivalClan: {
    clanId: string;
    name: string;
    tag: string;
    crest: ClanCrest;
    totalCp: number;
  };
  attacksRemaining: number;
  maxAttacks: number;
  playerAssignedLane: WarLaneId | null;
  playerWarMedals: number;
  lanes: Record<WarLaneId, WarLaneState>;
  battleLog: Array<{ id: string; text: string; timestamp: number }>;
  chestReward?: ClanWarChestReward;
}

export interface ClanSiegeLaunchPayload {
  laneId: WarLaneId;
  laneName: string;
  targetType: 'defender' | 'statue';
  enemyDefender?: WarDefender;
  statueHp: number;
  statueMaxHp: number;
  rivalClanTag: string;
  rivalClanName: string;
  playerSnapshot: CombatSnapshot;
  duelMatch?: ArenaMatchResult;
  bossDmgBonusPct: number;
}

export interface ClanSiegeResult {
  laneId: WarLaneId;
  targetType: 'defender' | 'statue';
  defenderId?: string;
  defenderIgn?: string;
  victory: boolean;
  siegeDamage: number;
  medalsEarned: number;
  contributionEarned: number;
  isStatueKill: boolean;
}

export interface PlayerSaveState {
  version: number;
  profile: PlayerProfile;
  clanId: string | null;
  warMedals: number;
  clanDailyDonations: {
    dateKey: string;
    mesoCount: number;
    diamondCount: number;
  };
  job: JobId;
  level: number;
  exp: number;
  rankPoints: number;
  mapleRank: number; // 0 to 5
  stage: number;
  highestStageCleared: number;
  wave: number; // 1 to 10
  bossReady: boolean;
  autoBoss: boolean;
  mesos: number;
  diamonds: number;
  honorCoins: number; // Arena Honor Coins / wagerTokens
  summonTickets: number;
  styleTickets: number;
  starStones: number;
  chaosCores: number;
  arcaneSymbols: number;
  transcendCount: number;
  transcendSkills: Record<TranscendSkillId, number>;
  expeditionTickets: number;
  lastExpeditionAt: number;
  upgrades: Record<StatUpgradeKey, number>;
  skillLevels: Record<string, number>; // skillId -> level (0 = locked, 1+ = active)
  autoSkills: boolean;
  equippedWeaponByJob: Partial<Record<JobId, string>>;
  weapons: Record<string, OwnedWeapon>;
  equippedCompanions: CompanionId[];
  companions: Record<CompanionId, OwnedCompanion>;
  cosmeticsUnlocked: Record<CosmeticId, boolean>;
  equippedCosmetics: EquippedCosmetics;
  relics: Record<RelicId, OwnedRelic>;
  equippedRelics: RelicId[];
  summonLevel: number;
  summonExp: number;
  dungeonKeys: {
    meso: number;
    jewel: number;
    lastRegenAt: number;
    lastFreeClaimAt: number;
  };
  quest: QuestProgressState;
  statsTotals: {
    monstersKilled: number;
    bossesDefeated: number;
    totalUpgrades: number;
    totalSummons: number;
  };
  arenaStats: ArenaStats;
  arenaHistory: ArenaMatchHistoryItem[];
  integrityFlags: string[];
  tainted: boolean;
  _sig?: string;
  muted: boolean;
  sfxVolume: number;
  bgmVolume: number;
  lowPowerMode: boolean;
  redeemedPromoCodes: string[];
  showDpsMeter: boolean;
  lastSavedAt: number;
}

export interface OfflineGains {
  elapsedSeconds: number;
  mesos: number;
  exp: number;
  tickets: number;
}

export interface GachaPullResult {
  category: 'weapon' | 'companion' | 'cosmetic';
  id: string;
  name: string;
  rarity: Rarity;
  isNew: boolean;
  job?: JobId;
  subLabel: string;
}

export interface LiveSnapshot {
  heroHp: number;
  heroMaxHp: number;
  combatMode: CombatMode;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossTimer: number; // seconds left
  dungeonScore: number;
  skillCooldowns: Record<string, number>; // remaining seconds
  dpsEstimate: number;
  realDps: number;
  feverCharge: number; // 0..100
  feverTimer: number; // 0..20s+
  zakumArmsAlive: number;
  arenaRivalName?: string;
  arenaRivalHp?: number;
  arenaRivalMaxHp?: number;
  arenaPlayerHp?: number;
  arenaPlayerMaxHp?: number;
  arenaClock?: number;
  siegeTargetName?: string;
  siegeLaneName?: string;
  siegeTargetHp?: number;
  siegeTargetMaxHp?: number;
  siegeDamageDealt?: number;
}
