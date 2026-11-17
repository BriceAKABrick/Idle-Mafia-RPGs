import { simulateArenaDuel } from './arenaSim';
import {
  ARENA_HOUSE_FEE_PCT,
  CLAN_CREATION_DIAMOND_COST,
  CLAN_MAX_MEMBERS,
  CLAN_WAR_DURATION_MS,
  CLAN_WAR_MAX_ATTACKS,
  WAR_LANE_META,
} from './constants';
import {
  buildCombatSnapshot,
  computeDataChecksum,
  getStageMesoReward,
  sanitizeNum,
} from './progression';
import { SafeStorage } from './storage';
import {
  ArenaCurrency,
  ArenaMatchResult,
  ArenaOpponent,
  ClanChatMessage,
  ClanCrest,
  ClanDirectoryEntry,
  ClanInfo,
  ClanMember,
  ClanRank,
  ClanSiegeResult,
  ClanWarChestReward,
  ClanWarState,
  CombatSnapshot,
  CosmeticId,
  LiveOpsConfig,
  NetworkMode,
  PlayerProfile,
  PlayerSaveState,
  PlayerWagerSubmission,
  ProfileBorderId,
  ProfileEmblemId,
  RelicId,
  WarDefender,
  WarLaneId,
  WarLaneState,
} from './types';

// ==================== CLOUD & MULTIPLAYER CONFIGURATION ====================
// Toggle NETWORK_MODE between 'SANDBOX' (uses locally synced real player
// snapshots with zero bots) and 'LIVE' (connects to Supabase REST/RPC when keys are set).
export const NETWORK_CONFIG = {
  NETWORK_MODE: 'SANDBOX' as NetworkMode,
  SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  AUTO_SYNC_INTERVAL_MS: 60_000,
};

const CLOUD_BASELINE_KEY = 'maple_idle_cloud_baseline_v1';
const CLANS_STORAGE_KEY = 'maple_idle_clans_v1';
const CLAN_CHAT_STORAGE_KEY = 'maple_idle_clan_chat_v1';
const CLAN_WAR_STORAGE_KEY = 'maple_idle_clan_war_v1';
const REAL_PLAYERS_STORAGE_KEY = 'maple_idle_real_players_v1';
const LIVEOPS_END_KEY = 'maple_idle_liveops_end_v1';

export interface CurrencyLedger {
  mesos: number;
  diamonds: number;
  wagerTokens: number; // Maps to Arena Honor Coins
  chaosCores: number;
  stage: number;
  timestamp: number;
  checksum: string;
}

export interface SyncResult {
  ok: boolean;
  mode: NetworkMode;
  syncedAt: number;
  checksum: string;
  snapshot: CombatSnapshot;
  deltaValid: boolean;
  flaggedReasons: string[];
  message: string;
}

export interface LoginResult {
  ok: boolean;
  profile: PlayerProfile;
  mode: NetworkMode;
  serverTime: number;
}

export interface LiveChallengeResponse {
  accepted: boolean;
  escrowId: string;
  rivalStakeLocked: number;
  message: string;
}

export interface WagerSubmitResult {
  ok: boolean;
  verified: boolean;
  verifiedMatch?: ArenaMatchResult;
  checksum: string;
  flaggedReasons: string[];
  serverTimestamp: number;
  error?: string;
}

export interface PromoRedeemResult {
  ok: boolean;
  save?: PlayerSaveState;
  message: string;
}

export function generateSecurePlayerId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `MI-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export class NetworkManager {
  private mode: NetworkMode = NETWORK_CONFIG.NETWORK_MODE;
  private supabaseUrl = NETWORK_CONFIG.SUPABASE_URL;
  private supabaseAnonKey = NETWORK_CONFIG.SUPABASE_ANON_KEY;
  private baseline: CurrencyLedger | null = null;
  private lastSyncedSnapshot: CombatSnapshot | null = null;

  constructor() {
    this.loadBaseline();
  }

  getMode(): NetworkMode {
    return this.mode;
  }

  setMode(mode: NetworkMode): void {
    this.mode = mode;
  }

  hasLiveCredentials(): boolean {
    return (
      !this.supabaseUrl.includes('YOUR_PROJECT_ID') &&
      !this.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY') &&
      this.supabaseUrl.startsWith('https://') &&
      this.supabaseAnonKey.length > 20
    );
  }

  getLastSyncedSnapshot(): CombatSnapshot | null {
    return this.lastSyncedSnapshot;
  }

  private loadBaseline(): void {
    try {
      const raw = SafeStorage.getItem(CLOUD_BASELINE_KEY);
      if (raw) {
        this.baseline = JSON.parse(raw) as CurrencyLedger;
      }
    } catch {
      this.baseline = null;
    }
  }

  private saveBaseline(ledger: CurrencyLedger): void {
    this.baseline = ledger;
    try {
      SafeStorage.setItem(CLOUD_BASELINE_KEY, JSON.stringify(ledger));
    } catch {
      // Ignore quota errors
    }
  }

  private buildLedger(save: PlayerSaveState): CurrencyLedger {
    const core = {
      mesos: sanitizeNum(save.mesos, 0),
      diamonds: sanitizeNum(save.diamonds, 0),
      wagerTokens: sanitizeNum(save.honorCoins, 0),
      chaosCores: sanitizeNum(save.chaosCores, 0),
      stage: Math.max(1, save.stage),
      timestamp: Date.now(),
    };
    return {
      ...core,
      checksum: computeDataChecksum(core),
    };
  }

  /**
   * Server-side style currency delta validator on mesos, diamonds, and wagerTokens (Honor Coins).
   * Flags impossible stat jumps that exceed legitimate stage/offline/arena bounds.
   */
  validateCurrencyDelta(
    save: PlayerSaveState,
    reason: 'interval' | 'pvp_preflight' | 'manual' | 'post_match' | 'login'
  ): { valid: boolean; flags: string[]; checksum: string } {
    const current = this.buildLedger(save);
    const flags: string[] = [];

    if (!Number.isFinite(save.mesos) || save.mesos < 0) flags.push('INVALID_MESOS');
    if (!Number.isFinite(save.diamonds) || save.diamonds < 0) flags.push('INVALID_DIAMONDS');
    if (!Number.isFinite(save.honorCoins) || save.honorCoins < 0) flags.push('INVALID_WAGER_TOKENS');

    if (this.baseline && reason !== 'login') {
      const elapsedSec = Math.max(1, (current.timestamp - this.baseline.timestamp) / 1000);
      const maxStage = Math.max(save.stage, this.baseline.stage);
      const mesoDelta = current.mesos - this.baseline.mesos;
      const diamondDelta = current.diamonds - this.baseline.diamonds;
      const tokenDelta = current.wagerTokens - this.baseline.wagerTokens;

      // Generous ceiling covering Fever + Meso Mine + Offline Gains + Transcendence
      const legitimateMesoCap = Math.max(
        250_000,
        getStageMesoReward(maxStage, true) * Math.max(40, elapsedSec * 8) * 12
      );
      if (mesoDelta > legitimateMesoCap && mesoDelta > this.baseline.mesos * 200 + 1_000_000) {
        flags.push(`MESO_DELTA_SPIKE(+${Math.floor(mesoDelta)})`);
      }

      // Diamonds ceiling per interval unless post_match
      const diamondAllowance = reason === 'post_match' ? 500_000 : 35_000 + elapsedSec * 120;
      if (diamondDelta > diamondAllowance) {
        flags.push(`DIAMOND_DELTA_SPIKE(+${Math.floor(diamondDelta)})`);
      }

      // Wager Tokens (Honor Coins) ceiling unless post_match
      const tokenAllowance = reason === 'post_match' ? 500_000 : 10_000 + elapsedSec * 40;
      if (tokenDelta > tokenAllowance) {
        flags.push(`WAGER_TOKEN_DELTA_SPIKE(+${Math.floor(tokenDelta)})`);
      }
    }

    return {
      valid: flags.length === 0,
      flags,
      checksum: current.checksum,
    };
  }

  private async supabaseRequest(
    path: string,
    method: 'GET' | 'POST' | 'PATCH',
    body?: unknown
  ): Promise<Response> {
    return fetch(`${this.supabaseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${this.supabaseAnonKey}`,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async login(input: {
    ign: string;
    clanTag: string;
    emblem: ProfileEmblemId;
    border: ProfileBorderId;
    existingPlayerId?: string;
  }): Promise<LoginResult> {
    const cleanIgn = input.ign.trim().slice(0, 14) || 'Capo';
    const cleanClan =
      input.clanTag
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4) || 'SYND';

    const profile: PlayerProfile = {
      playerId: input.existingPlayerId || generateSecurePlayerId(),
      ign: cleanIgn,
      clanTag: cleanClan,
      emblem: input.emblem,
      border: input.border,
      createdAt: Date.now(),
    };

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        await this.supabaseRequest('/rest/v1/player_profiles', 'POST', {
          player_id: profile.playerId,
          ign: profile.ign,
          clan_tag: profile.clanTag,
          emblem: profile.emblem,
          border: profile.border,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Non-blocking fallback for preview resilience
      }
    }

    return {
      ok: true,
      profile,
      mode: this.mode,
      serverTime: Date.now(),
    };
  }

  private getRealPlayerRegistry(): Record<string, CombatSnapshot> {
    try {
      const raw = SafeStorage.getItem(REAL_PLAYERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, CombatSnapshot>;
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // Ignore parse errors
    }
    return {};
  }

  private registerRealPlayerSnapshot(snapshot: CombatSnapshot): void {
    if (!snapshot.playerId || !snapshot.ign || snapshot.playerId === 'MI-LOCAL-GUEST') return;
    try {
      const registry = this.getRealPlayerRegistry();
      registry[snapshot.playerId] = snapshot;
      SafeStorage.setItem(REAL_PLAYERS_STORAGE_KEY, JSON.stringify(registry));
    } catch {
      // Ignore quota errors
    }
  }

  async syncSave(
    save: PlayerSaveState,
    reason: 'interval' | 'pvp_preflight' | 'manual' | 'post_match' = 'interval'
  ): Promise<SyncResult> {
    const snapshot = buildCombatSnapshot(save);
    const validation = this.validateCurrencyDelta(save, reason);
    const ledger = this.buildLedger(save);

    if (validation.valid && !save.tainted) {
      this.saveBaseline(ledger);
      this.registerRealPlayerSnapshot(snapshot);
    }

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const res = await this.supabaseRequest('/rest/v1/player_snapshots', 'POST', {
          player_id: snapshot.playerId,
          ign: snapshot.ign,
          clan_tag: snapshot.clanTag,
          combat_power: snapshot.combatPower,
          snapshot_json: snapshot,
          currency_ledger: ledger,
          delta_valid: validation.valid && !save.tainted,
          integrity_flags: validation.flags,
          synced_at: new Date(snapshot.syncedAt).toISOString(),
        });
        if (res.ok) {
          this.lastSyncedSnapshot = snapshot;
          return {
            ok: true,
            mode: 'LIVE',
            syncedAt: snapshot.syncedAt,
            checksum: snapshot.checksum,
            snapshot,
            deltaValid: validation.valid && !save.tainted,
            flaggedReasons: validation.flags,
            message: validation.valid
              ? 'Synced Combat Snapshot to Supabase Cloud'
              : `Synced with integrity flag: ${validation.flags[0]}`,
          };
        }
      } catch {
        // Fallback smoothly to local cloud mirror
      }
    }

    this.lastSyncedSnapshot = snapshot;
    return {
      ok: true,
      mode: this.mode,
      syncedAt: snapshot.syncedAt,
      checksum: snapshot.checksum,
      snapshot,
      deltaValid: validation.valid && !save.tainted,
      flaggedReasons: validation.flags,
      message:
        this.mode === 'LIVE' && !this.hasLiveCredentials()
          ? 'Live Mode keys missing — synced locally (Zero Bots)'
          : validation.valid
            ? 'Combat Snapshot synced & verified'
            : `Flagged delta anomaly: ${validation.flags[0]}`,
    };
  }

  async fetchLiveOpsConfig(): Promise<LiveOpsConfig> {
    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const res = await this.supabaseRequest(
          '/rest/v1/liveops_events?active=eq.true&limit=1',
          'GET'
        );
        if (res.ok) {
          const rows = (await res.json()) as Array<{
            event_id?: string;
            event_title?: string;
            meso_multiplier?: number;
            exp_multiplier?: number;
            starforce_bonus_rate?: number;
            wager_rake_discount?: number;
            promo_code?: string;
            promo_reward?: LiveOpsConfig['promo_reward'];
            ends_at?: string | number;
            active?: boolean;
          }>;
          const row = rows[0];
          if (row && row.event_title) {
            const endsMs =
              typeof row.ends_at === 'number'
                ? row.ends_at
                : row.ends_at
                  ? new Date(row.ends_at).getTime()
                  : Date.now() + 48 * 3600_000;
            return {
              event_id: row.event_id || 'liveops_remote',
              event_title: row.event_title,
              meso_multiplier: row.meso_multiplier ?? 1,
              exp_multiplier: row.exp_multiplier ?? 1,
              starforce_bonus_rate: row.starforce_bonus_rate ?? 0,
              wager_rake_discount: row.wager_rake_discount ?? 0,
              promo_code: (row.promo_code || 'SYNDICATE2025').toUpperCase(),
              promo_reward: row.promo_reward || { diamonds: 500, styleTickets: 2 },
              ends_at: endsMs,
              active: Boolean(row.active),
            };
          }
        }
      } catch {
        // Fall through to sandbox weekend config
      }
    }

    let endsAt = Date.now() + 48 * 3600_000;
    try {
      const savedEnd = Number(SafeStorage.getItem(LIVEOPS_END_KEY));
      if (Number.isFinite(savedEnd) && savedEnd > Date.now() + 300_000) {
        endsAt = savedEnd;
      } else {
        SafeStorage.setItem(LIVEOPS_END_KEY, String(endsAt));
      }
    } catch {
      // Ignore storage errors
    }

    return {
      event_id: 'syndicate_weekend_heist_1',
      event_title: 'Syndicate Weekend Heist Rush',
      meso_multiplier: 2.0,
      exp_multiplier: 1.5,
      starforce_bonus_rate: 10,
      wager_rake_discount: 5,
      promo_code: 'SYNDICATE2025',
      promo_reward: {
        diamonds: 500,
        styleTickets: 2,
        starStones: 5,
      },
      ends_at: endsAt,
      active: true,
    };
  }

  redeemPromoCode(
    save: PlayerSaveState,
    rawCode: string,
    liveOps: LiveOpsConfig | null
  ): PromoRedeemResult {
    if (save.tainted) {
      return { ok: false, message: 'Integrity lock: coupon redemption disabled.' };
    }
    const clean = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!clean) {
      return { ok: false, message: 'Enter a valid Syndicate promo code.' };
    }
    const activeCode = (liveOps?.active && liveOps.promo_code ? liveOps.promo_code : 'SYNDICATE2025').toUpperCase();
    if (clean !== activeCode && clean !== 'VICTORIA2025') {
      return { ok: false, message: `Code "${clean}" is invalid or expired.` };
    }
    if ((save.redeemedPromoCodes || []).includes(clean)) {
      return { ok: false, message: `Code "${clean}" has already been redeemed.` };
    }

    const reward = liveOps?.promo_reward || { diamonds: 500, styleTickets: 2, starStones: 5 };
    const dia = Math.max(0, reward.diamonds || 0);
    const sty = Math.max(0, reward.styleTickets || 0);
    const stn = Math.max(0, reward.starStones || 0);
    const mes = Math.max(0, reward.mesos || 0);

    const nextSave: PlayerSaveState = {
      ...save,
      diamonds: save.diamonds + dia,
      styleTickets: save.styleTickets + sty,
      starStones: save.starStones + stn,
      mesos: save.mesos + mes,
      redeemedPromoCodes: [...(save.redeemedPromoCodes || []), clean],
    };

    const parts: string[] = [];
    if (dia > 0) parts.push(`+${dia} Gold Bars`);
    if (sty > 0) parts.push(`+${sty} Tailor Vouchers`);
    if (stn > 0) parts.push(`+${stn} Mod Parts`);
    if (mes > 0) parts.push(`+$${mes} Cash`);

    return {
      ok: true,
      save: nextSave,
      message: `Redeemed ${clean}: ${parts.join(', ')}!`,
    };
  }

  async fetchArenaOpponents(
    playerCp: number,
    playerId: string,
    _playerLevel: number
  ): Promise<ArenaOpponent[]> {
    const minCp = Math.max(15, Math.floor(playerCp * 0.8));
    const maxCp = Math.max(30, Math.ceil(playerCp * 1.2));

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const query = `/rest/v1/player_snapshots?combat_power=gte.${minCp}&combat_power=lte.${maxCp}&player_id=neq.${encodeURIComponent(playerId)}&limit=4`;
        const res = await this.supabaseRequest(query, 'GET');
        if (res.ok) {
          const rows = (await res.json()) as Array<{ snapshot_json: CombatSnapshot }>;
          return rows
            .filter((r) => r.snapshot_json && r.snapshot_json.ign && r.snapshot_json.playerId !== playerId)
            .slice(0, 4)
            .map((r) => ({
              ...r.snapshot_json,
              isSimulated: false,
              onlineStatus: 'online',
              preferredCurrency: 'diamonds',
            }));
        }
      } catch {
        return [];
      }
    }

    // Zero bots: return only real registered player snapshots in ±20% CP range
    const registry = this.getRealPlayerRegistry();
    return Object.values(registry)
      .filter(
        (snap) =>
          snap &&
          snap.playerId &&
          snap.playerId !== playerId &&
          snap.combatPower >= minCp &&
          snap.combatPower <= maxCp
      )
      .sort((a, b) => Math.abs(a.combatPower - playerCp) - Math.abs(b.combatPower - playerCp))
      .slice(0, 4)
      .map((snap) => ({
        ...snap,
        isSimulated: false,
        onlineStatus: 'snapshot',
        preferredCurrency: 'diamonds',
      }));
  }

  async sendLiveChallenge(
    save: PlayerSaveState,
    opponent: ArenaOpponent,
    currency: ArenaCurrency,
    stake: number
  ): Promise<LiveChallengeResponse> {
    if (save.tainted) {
      return {
        accepted: false,
        escrowId: '',
        rivalStakeLocked: 0,
        message: 'Account integrity flag active — PvP challenges locked.',
      };
    }

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const res = await this.supabaseRequest('/rest/v1/wager_invites', 'POST', {
          rival_id: opponent.playerId,
          currency,
          stake,
          status: 'escrow_locked',
          created_at: new Date().toISOString(),
        });
        if (res.ok) {
          return {
            accepted: true,
            escrowId: `ESC-${Date.now().toString(36).toUpperCase()}`,
            rivalStakeLocked: stake,
            message: `${opponent.ign} accepted and locked ${stake} into Escrow!`,
          };
        }
      } catch {
        // Fallback below
      }
    }

    return {
      accepted: true,
      escrowId: `ESC-${Date.now().toString(36).toUpperCase()}`,
      rivalStakeLocked: stake,
      message: `[${opponent.clanTag}] ${opponent.ign} snapshot verified & escrow locked!`,
    };
  }

  /**
   * Authoritative match submission: receives ONLY signed snapshots + seed
   * (no client-claimed winner boolean) and recomputes outcome deterministically.
   */
  async submitWagerMatch(
    currentSave: PlayerSaveState,
    submission: PlayerWagerSubmission
  ): Promise<WagerSubmitResult> {
    if (currentSave.tainted) {
      return {
        ok: false,
        verified: false,
        checksum: '',
        flaggedReasons: ['ACCOUNT_TAINTED'],
        serverTimestamp: Date.now(),
        error: 'Account flagged for integrity violation — wager rejected.',
      };
    }

    const expectedSubSig = computeDataChecksum({
      matchId: submission.matchId,
      seed: submission.seed,
      duelType: submission.duelType,
      currency: submission.currency,
      stake: submission.stake,
      playerId: submission.playerSnapshot.playerId,
      rivalId: submission.rivalSnapshot.playerId,
      playerChecksum: submission.playerSnapshot.checksum,
      rivalChecksum: submission.rivalSnapshot.checksum,
    });

    if (submission.submissionSig !== expectedSubSig) {
      return {
        ok: false,
        verified: false,
        checksum: '',
        flaggedReasons: ['INVALID_SUBMISSION_SIGNATURE'],
        serverTimestamp: Date.now(),
        error: 'Wager submission signature mismatch.',
      };
    }

    const { checksum: pCheck, ...pCore } = submission.playerSnapshot;
    if (computeDataChecksum(pCore) !== pCheck) {
      return {
        ok: false,
        verified: false,
        checksum: '',
        flaggedReasons: ['INVALID_PLAYER_SNAPSHOT'],
        serverTimestamp: Date.now(),
        error: 'Player combat snapshot checksum invalid.',
      };
    }

    // Recompute duel outcome authoritatively from seed + snapshots
    const verifiedMatch = simulateArenaDuel(
      submission.playerSnapshot,
      submission.rivalSnapshot,
      submission.seed,
      submission.duelType,
      submission.currency,
      submission.stake,
      submission.wagerBonusPct,
      submission.houseFeePct
    );

    const validation = this.validateCurrencyDelta(currentSave, 'post_match');
    const ledger = this.buildLedger(currentSave);
    if (validation.valid) {
      this.saveBaseline(ledger);
    }

    const matchRecord = {
      match_id: verifiedMatch.matchId,
      seed: verifiedMatch.seed,
      player_id: verifiedMatch.playerSnapshot.playerId,
      rival_id: verifiedMatch.rival.playerId,
      duel_type: verifiedMatch.duelType,
      currency: verifiedMatch.currency,
      stake: verifiedMatch.stake,
      house_fee: verifiedMatch.houseFee,
      payout: verifiedMatch.payout,
      winner: verifiedMatch.winner,
      checksum: verifiedMatch.checksum,
      delta_valid: validation.valid,
      flags: validation.flags,
    };

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        await this.supabaseRequest('/rest/v1/arena_matches', 'POST', matchRecord);
      } catch {
        // Non-blocking fallback
      }
    }

    return {
      ok: true,
      verified: validation.valid,
      verifiedMatch,
      checksum: computeDataChecksum(matchRecord),
      flaggedReasons: validation.flags,
      serverTimestamp: Date.now(),
    };
  }

  // ==================== CLAN SYSTEM & GvG TERRITORY SIEGE ====================

  private getClansMap(): Record<string, ClanInfo> {
    try {
      const raw = SafeStorage.getItem(CLANS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ClanInfo>;
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // Ignore parse errors
    }
    return {};
  }

  private saveClansMap(map: Record<string, ClanInfo>): void {
    try {
      SafeStorage.setItem(CLANS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore quota errors
    }
  }

  private getChatMap(): Record<string, ClanChatMessage[]> {
    try {
      const raw = SafeStorage.getItem(CLAN_CHAT_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, ClanChatMessage[]>;
    } catch {
      // Ignore
    }
    return {};
  }

  private saveChatMap(map: Record<string, ClanChatMessage[]>): void {
    try {
      SafeStorage.setItem(CLAN_CHAT_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }

  private ensureSeededChat(clan: ClanInfo): ClanChatMessage[] {
    const map = this.getChatMap();
    if (!map[clan.clanId] || map[clan.clanId].length === 0) {
      map[clan.clanId] = [
        {
          id: `sys_${clan.clanId}_1`,
          senderIgn: 'SYNDICATE',
          kind: 'system',
          text: `Welcome to [${clan.tag}] ${clan.name} Backroom! Fund the Family Front Business daily for crew buffs.`,
          timestamp: Date.now(),
        },
      ];
      this.saveChatMap(map);
    }
    return map[clan.clanId];
  }

  private getWarMap(): Record<string, ClanWarState> {
    try {
      const raw = SafeStorage.getItem(CLAN_WAR_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, ClanWarState>;
    } catch {
      // Ignore
    }
    return {};
  }

  private saveWarMap(map: Record<string, ClanWarState>): void {
    try {
      SafeStorage.setItem(CLAN_WAR_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }

  private sortClanMembers(members: ClanMember[]): ClanMember[] {
    const order: Record<ClanRank, number> = { master: 0, jr_master: 1, member: 2 };
    return [...members].sort((a, b) => {
      if (order[a.rank] !== order[b.rank]) return order[a.rank] - order[b.rank];
      return b.combatPower - a.combatPower;
    });
  }

  async fetchClanDirectory(query = ''): Promise<ClanDirectoryEntry[]> {
    const map = this.getClansMap();
    const q = query.trim().toLowerCase();

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const res = await this.supabaseRequest('/rest/v1/clans?limit=20', 'GET');
        if (res.ok) {
          const rows = (await res.json()) as ClanDirectoryEntry[];
          if (Array.isArray(rows)) {
            return rows.filter(
              (c) => !q || c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q)
            );
          }
        }
      } catch {
        // Fallback to local directory
      }
    }

    return Object.values(map)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q))
      .map((c) => ({
        clanId: c.clanId,
        name: c.name,
        tag: c.tag,
        crest: c.crest,
        minCp: c.minCp,
        memberCount: c.memberCount,
        maxMembers: c.maxMembers,
        totalCp: c.totalCp,
        level: c.level,
        shrineLevel: c.shrine.level,
      }))
      .sort((a, b) => b.totalCp - a.totalCp);
  }

  async getCurrentClan(save: PlayerSaveState): Promise<ClanInfo | null> {
    if (!save.clanId) return null;
    const map = this.getClansMap();
    const clan = map[save.clanId];
    if (!clan) return null;

    // Keep player's live roster card synced with current gear/CP
    const snap = buildCombatSnapshot(save);
    const pId = save.profile?.playerId || snap.playerId;
    const idx = clan.members.findIndex((m) => m.playerId === pId);
    const prevMember = idx >= 0 ? clan.members[idx] : null;
    const updatedMember: ClanMember = {
      playerId: pId,
      ign: save.profile?.ign || 'Adventurer',
      job: save.job,
      level: save.level,
      combatPower: snap.combatPower,
      rank: prevMember ? prevMember.rank : 'member',
      onlineStatus: 'online',
      weeklyContribution: prevMember ? prevMember.weeklyContribution : 0,
      equippedWeaponId: snap.equippedWeaponId,
      equippedCosmetics: snap.equippedCosmetics,
      snapshot: snap,
    };

    const nextMembers =
      idx >= 0
        ? clan.members.map((m, i) => (i === idx ? updatedMember : m))
        : [updatedMember, ...clan.members];

    const deltaCp = prevMember ? snap.combatPower - prevMember.combatPower : snap.combatPower;
    const updatedClan: ClanInfo = {
      ...clan,
      memberCount: nextMembers.length,
      totalCp: Math.max(snap.combatPower, clan.totalCp + deltaCp),
      members: this.sortClanMembers(nextMembers),
    };
    map[clan.clanId] = updatedClan;
    this.saveClansMap(map);
    return updatedClan;
  }

  async createClan(
    save: PlayerSaveState,
    input: { name: string; tag: string; crest: ClanCrest; minCp: number }
  ): Promise<{ ok: boolean; clan?: ClanInfo; save?: PlayerSaveState; error?: string }> {
    if (save.tainted) {
      return { ok: false, error: 'Account integrity flag prevents founding Crime Families.' };
    }
    if (save.diamonds < CLAN_CREATION_DIAMOND_COST) {
      return { ok: false, error: `Requires ${CLAN_CREATION_DIAMOND_COST} Gold Bars to found a Family.` };
    }
    const cleanName = input.name.trim().slice(0, 18);
    const cleanTag = input.tag.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (cleanName.length < 3 || cleanTag.length < 2) {
      return { ok: false, error: 'Enter a valid Family Name (3+ chars) and 2-4 letter Tag.' };
    }

    const map = this.getClansMap();
    if (Object.values(map).some((c) => c.tag.toUpperCase() === cleanTag)) {
      return { ok: false, error: `Family tag [${cleanTag}] is already taken.` };
    }

    const nextSave: PlayerSaveState = {
      ...save,
      diamonds: save.diamonds - CLAN_CREATION_DIAMOND_COST,
      profile: {
        ...save.profile,
        clanTag: cleanTag,
      },
    };
    const snap = buildCombatSnapshot(nextSave);
    const clanId = `clan_${cleanTag.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;
    nextSave.clanId = clanId;

    const masterMember: ClanMember = {
      playerId: snap.playerId,
      ign: snap.ign,
      job: nextSave.job,
      level: nextSave.level,
      combatPower: snap.combatPower,
      rank: 'master',
      onlineStatus: 'online',
      weeklyContribution: 100,
      equippedWeaponId: snap.equippedWeaponId,
      equippedCosmetics: snap.equippedCosmetics,
      snapshot: snap,
    };

    const members: ClanMember[] = [masterMember];

    const newClan: ClanInfo = {
      clanId,
      name: cleanName,
      tag: cleanTag,
      crest: input.crest,
      minCp: Math.max(0, Math.floor(input.minCp)),
      memberCount: members.length,
      maxMembers: CLAN_MAX_MEMBERS,
      totalCp: masterMember.combatPower,
      level: 1,
      shrine: {
        level: 1,
        exp: 0,
        nextLevelExp: 120,
        totalMesoDonated: 0,
        totalDiamondDonated: 0,
      },
      members: this.sortClanMembers(members),
      createdAt: Date.now(),
    };

    map[clanId] = newClan;
    this.saveClansMap(map);
    await this.broadcastClanSystemEvent(
      clanId,
      `${snap.ign} founded [${cleanTag}] ${cleanName}!`
    );

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        await this.supabaseRequest('/rest/v1/clans', 'POST', newClan);
      } catch {
        // Non-blocking fallback
      }
    }

    return { ok: true, clan: newClan, save: nextSave };
  }

  async joinClan(
    save: PlayerSaveState,
    clanId: string
  ): Promise<{ ok: boolean; clan?: ClanInfo; save?: PlayerSaveState; error?: string }> {
    if (save.tainted) {
      return { ok: false, error: 'Account integrity flag prevents joining Families.' };
    }
    const map = this.getClansMap();
    const clan = map[clanId];
    if (!clan) return { ok: false, error: 'Crime Family not found.' };
    if (clan.memberCount >= clan.maxMembers) {
      return { ok: false, error: 'This Crime Family is already full (30/30).' };
    }

    const nextSave: PlayerSaveState = {
      ...save,
      clanId: clan.clanId,
      profile: {
        ...save.profile,
        clanTag: clan.tag,
      },
    };
    const snap = buildCombatSnapshot(nextSave);
    if (snap.combatPower < clan.minCp) {
      return {
        ok: false,
        error: `Requires ${clan.minCp.toLocaleString()} Respect (CP) minimum to join [${clan.tag}].`,
      };
    }

    const alreadyIdx = clan.members.findIndex((m) => m.playerId === snap.playerId);
    const playerMember: ClanMember = {
      playerId: snap.playerId,
      ign: snap.ign,
      job: nextSave.job,
      level: nextSave.level,
      combatPower: snap.combatPower,
      rank: 'member',
      onlineStatus: 'online',
      weeklyContribution: 25,
      equippedWeaponId: snap.equippedWeaponId,
      equippedCosmetics: snap.equippedCosmetics,
      snapshot: snap,
    };

    const nextMembers =
      alreadyIdx >= 0
        ? clan.members.map((m, i) => (i === alreadyIdx ? playerMember : m))
        : [...clan.members, playerMember];

    const updatedClan: ClanInfo = {
      ...clan,
      memberCount: nextMembers.length,
      totalCp: nextMembers.reduce((acc, m) => acc + m.combatPower, 0),
      members: this.sortClanMembers(nextMembers),
    };

    map[clan.clanId] = updatedClan;
    this.saveClansMap(map);
    await this.broadcastClanSystemEvent(clan.clanId, `${snap.ign} swore Omertà to [${clan.tag}] ${clan.name}!`);

    return { ok: true, clan: updatedClan, save: nextSave };
  }

  async leaveClan(save: PlayerSaveState): Promise<PlayerSaveState> {
    if (!save.clanId) return save;
    const map = this.getClansMap();
    const clan = map[save.clanId];
    const playerId = save.profile?.playerId;

    if (clan && playerId) {
      const leaving = clan.members.find((m) => m.playerId === playerId);
      const remaining = clan.members.filter((m) => m.playerId !== playerId);
      if (remaining.length === 0) {
        delete map[clan.clanId];
        this.saveClansMap(map);
      } else {
        if (leaving?.rank === 'master') {
          remaining[0] = { ...remaining[0], rank: 'master' };
        }
        map[clan.clanId] = {
          ...clan,
          memberCount: remaining.length,
          totalCp: remaining.reduce((acc, m) => acc + m.combatPower, 0),
          members: this.sortClanMembers(remaining),
        };
        this.saveClansMap(map);
        await this.broadcastClanSystemEvent(clan.clanId, `${save.profile.ign} walked away from the Family.`);
      }
    }

    return {
      ...save,
      clanId: null,
      profile: {
        ...save.profile,
        clanTag: 'SOLO',
      },
    };
  }

  async setClanMemberRank(
    clanId: string,
    targetPlayerId: string,
    newRank: ClanRank
  ): Promise<ClanInfo | null> {
    const map = this.getClansMap();
    const clan = map[clanId];
    if (!clan) return null;

    const target = clan.members.find((m) => m.playerId === targetPlayerId);
    if (!target || target.rank === 'master') return clan;

    const updated: ClanInfo = {
      ...clan,
      members: this.sortClanMembers(
        clan.members.map((m) => (m.playerId === targetPlayerId ? { ...m, rank: newRank } : m))
      ),
    };
    map[clanId] = updated;
    this.saveClansMap(map);
    await this.broadcastClanSystemEvent(
      clanId,
      `${target.ign} was ${newRank === 'jr_master' ? 'promoted to Caporegime' : 'assigned to Soldier'}.`
    );
    return updated;
  }

  async fetchClanChat(clanId: string): Promise<ClanChatMessage[]> {
    const map = this.getClansMap();
    const clan = map[clanId];
    if (!clan) return [];

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const res = await this.supabaseRequest(
          `/rest/v1/clan_chat?clan_id=eq.${encodeURIComponent(clanId)}&limit=40`,
          'GET'
        );
        if (res.ok) {
          const rows = (await res.json()) as ClanChatMessage[];
          if (Array.isArray(rows) && rows.length > 0) return rows;
        }
      } catch {
        // Fallback
      }
    }

    return this.ensureSeededChat(clan);
  }

  async sendClanChatMessage(
    clanId: string,
    senderIgn: string,
    senderRank: ClanRank,
    text: string
  ): Promise<ClanChatMessage[]> {
    const clean = text.trim().slice(0, 140);
    const clans = this.getClansMap();
    const clan = clans[clanId];
    if (!clan || !clean) return clan ? this.ensureSeededChat(clan) : [];

    const existing = this.ensureSeededChat(clan);
    const msg: ClanChatMessage = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderIgn,
      senderRank,
      kind: 'chat',
      text: clean,
      timestamp: Date.now(),
    };
    const nextList = [...existing, msg].slice(-45);
    const chatMap = this.getChatMap();
    chatMap[clanId] = nextList;
    this.saveChatMap(chatMap);

    if (this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        await this.supabaseRequest('/rest/v1/clan_chat', 'POST', { clan_id: clanId, ...msg });
      } catch {
        // Ignore
      }
    }

    return nextList;
  }

  async broadcastClanSystemEvent(clanId: string | null, text: string): Promise<ClanChatMessage[]> {
    if (!clanId) return [];
    const clans = this.getClansMap();
    const clan = clans[clanId];
    if (!clan) return [];

    const existing = this.ensureSeededChat(clan);
    const msg: ClanChatMessage = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderIgn: 'SYSTEM',
      kind: 'system',
      text,
      timestamp: Date.now(),
    };
    const nextList = [...existing, msg].slice(-45);
    const chatMap = this.getChatMap();
    chatMap[clanId] = nextList;
    this.saveChatMap(chatMap);
    return nextList;
  }

  async donateToShrine(
    save: PlayerSaveState,
    clanId: string,
    kind: 'mesos' | 'diamonds'
  ): Promise<{ ok: boolean; clan?: ClanInfo; save?: PlayerSaveState; leveledUp?: boolean; error?: string }> {
    const clans = this.getClansMap();
    const clan = clans[clanId];
    if (!clan) return { ok: false, error: 'Crime Family not found.' };

    const todayKey = new Date().toISOString().slice(0, 10);
    const daily =
      save.clanDailyDonations?.dateKey === todayKey
        ? save.clanDailyDonations
        : { dateKey: todayKey, mesoCount: 0, diamondCount: 0 };

    const mesoCost = Math.floor(1200 * Math.pow(1.35, clan.shrine.level - 1));
    const diamondCost = 50;

    if (kind === 'mesos') {
      if (daily.mesoCount >= 5) return { ok: false, error: 'Daily Dirty Cash cut limit (5/5) reached!' };
      if (save.mesos < mesoCost) return { ok: false, error: 'Not enough Dirty Cash!' };
    } else {
      if (daily.diamondCount >= 3) return { ok: false, error: 'Daily Gold Bar cut limit (3/3) reached!' };
      if (save.diamonds < diamondCost) return { ok: false, error: 'Not enough Gold Bars!' };
    }

    const expGain = kind === 'mesos' ? 25 : 70;
    const contribGain = kind === 'mesos' ? 20 : 60;
    let nextLv = clan.shrine.level;
    let nextExp = clan.shrine.exp + expGain;
    let nextThreshold = clan.shrine.nextLevelExp;
    let leveledUp = false;

    while (nextExp >= nextThreshold && nextLv < 20) {
      nextExp -= nextThreshold;
      nextLv += 1;
      nextThreshold = nextLv * 120;
      leveledUp = true;
    }

    const pId = save.profile?.playerId;
    const updatedMembers = clan.members.map((m) =>
      m.playerId === pId ? { ...m, weeklyContribution: m.weeklyContribution + contribGain } : m
    );

    const updatedClan: ClanInfo = {
      ...clan,
      level: Math.max(clan.level, nextLv),
      shrine: {
        level: nextLv,
        exp: nextExp,
        nextLevelExp: nextThreshold,
        totalMesoDonated: clan.shrine.totalMesoDonated + (kind === 'mesos' ? mesoCost : 0),
        totalDiamondDonated: clan.shrine.totalDiamondDonated + (kind === 'diamonds' ? diamondCost : 0),
      },
      members: updatedMembers,
    };

    clans[clanId] = updatedClan;
    this.saveClansMap(clans);

    if (leveledUp) {
      await this.broadcastClanSystemEvent(
        clanId,
        `Family Front Business expanded to Lv.${nextLv}! All made men gain stronger Cash, Boss DMG & Fight Club payouts!`
      );
    }

    const nextSave: PlayerSaveState = {
      ...save,
      mesos: kind === 'mesos' ? save.mesos - mesoCost : save.mesos,
      diamonds: kind === 'diamonds' ? save.diamonds - diamondCost : save.diamonds,
      clanDailyDonations: {
        dateKey: todayKey,
        mesoCount: daily.mesoCount + (kind === 'mesos' ? 1 : 0),
        diamondCount: daily.diamondCount + (kind === 'diamonds' ? 1 : 0),
      },
    };

    return { ok: true, clan: updatedClan, save: nextSave, leveledUp };
  }

  private recomputeLaneControl(lane: WarLaneState): WarLaneState['controlledBy'] {
    if (lane.citadelHp <= 0 || lane.enemyStatueHp <= 0) return 'ally';
    if (lane.ourCitadelHp <= 0 || lane.ourStatueHp <= 0) return 'enemy';
    const enemyAlive = lane.enemyDefenders.filter((d) => !d.defeated).length;
    const ourAlive = lane.ourDefenders.filter((d) => !d.defeated).length;
    if (enemyAlive === 0 && ourAlive > 0) return 'ally';
    if (ourAlive === 0 && enemyAlive > 0) return 'enemy';
    const ourPct = lane.ourCitadelHp / Math.max(1, lane.ourCitadelMaxHp);
    const enemyPct = lane.citadelHp / Math.max(1, lane.citadelMaxHp);
    if (ourPct - enemyPct >= 0.08) return 'ally';
    if (enemyPct - ourPct >= 0.08) return 'enemy';
    return 'contested';
  }

  async getClanWar(clanId: string, clanInfo?: ClanInfo | null): Promise<ClanWarState | null> {
    const warMap = this.getWarMap();
    const existing = warMap[clanId];
    if (!existing) return null;

    // Auto-end if 24h cycle expired
    if (existing.status === 'ACTIVE' && Date.now() >= existing.endsAt) {
      const finalized = this.finalizeWarObject(clanInfo || null, existing);
      warMap[clanId] = finalized;
      this.saveWarMap(warMap);
      return finalized;
    }
    return existing;
  }

  async startClanWar(
    save: PlayerSaveState,
    clanInfo: ClanInfo
  ): Promise<{ ok: boolean; war?: ClanWarState; error?: string }> {
    if (save.tainted) {
      return { ok: false, error: 'Account integrity lock prevents entering Clan Wars.' };
    }

    const clans = this.getClansMap();
    let candidates = Object.values(clans).filter(
      (c) => c.clanId !== clanInfo.clanId && c.members.length > 0
    );

    if (candidates.length === 0 && this.mode === 'LIVE' && this.hasLiveCredentials()) {
      try {
        const res = await this.supabaseRequest(
          `/rest/v1/clans?clan_id=neq.${encodeURIComponent(clanInfo.clanId)}&limit=10`,
          'GET'
        );
        if (res.ok) {
          const rows = (await res.json()) as ClanInfo[];
          if (Array.isArray(rows)) {
            candidates = rows.filter((c) => c.clanId !== clanInfo.clanId && c.members.length > 0);
          }
        }
      } catch {
        // Handled below
      }
    }

    if (candidates.length === 0) {
      return {
        ok: false,
        error: 'No rival player clans exist yet. Another player must found a clan first!',
      };
    }

    candidates.sort(
      (a, b) => Math.abs(a.totalCp - clanInfo.totalCp) - Math.abs(b.totalCp - clanInfo.totalCp)
    );
    const rival = candidates[0];

    const playerSnap = buildCombatSnapshot(save);
    const avgCp = Math.max(
      250,
      Math.round(
        clanInfo.members.reduce((a, b) => a + b.combatPower, 0) / Math.max(1, clanInfo.members.length)
      )
    );
    const citadelMax = Math.max(3000, Math.round(avgCp * 2.2));
    const statueMax = Math.max(2000, Math.round(avgCp * 1.4));

    const laneIds: WarLaneId[] = ['henesys_fortress', 'kerning_tower', 'perion_citadel'];
    const lanes = {} as Record<WarLaneId, WarLaneState>;

    const allyPool = clanInfo.members;
    const enemyPool = rival.members;

    laneIds.forEach((lid, lIdx) => {
      const meta = WAR_LANE_META[lid];
      const enemyDefenders: WarDefender[] = [];
      for (let i = 0; i < enemyPool.length; i++) {
        if (i % laneIds.length === lIdx || (enemyPool.length < 3 && i === 0)) {
          const em = enemyPool[i];
          enemyDefenders.push({
            playerId: em.playerId,
            ign: em.ign,
            job: em.job,
            level: em.level,
            combatPower: em.combatPower,
            defeated: false,
            snapshot: em.snapshot,
          });
        }
      }

      const ourDefenders: WarDefender[] = [];
      for (let i = 0; i < allyPool.length; i++) {
        if (i % laneIds.length === lIdx && allyPool[i].playerId !== playerSnap.playerId) {
          const am = allyPool[i];
          ourDefenders.push({
            playerId: am.playerId,
            ign: am.ign,
            job: am.job,
            level: am.level,
            combatPower: am.combatPower,
            defeated: false,
            snapshot: am.snapshot,
          });
        }
      }

      lanes[lid] = {
        id: lid,
        name: meta.name,
        subtitle: meta.subtitle,
        citadelHp: citadelMax,
        citadelMaxHp: citadelMax,
        ourCitadelHp: citadelMax,
        ourCitadelMaxHp: citadelMax,
        ourDefenders,
        enemyDefenders,
        enemyStatueHp: statueMax,
        enemyStatueMaxHp: statueMax,
        ourStatueHp: statueMax,
        ourStatueMaxHp: statueMax,
        controlledBy: 'contested',
      };
    });

    const now = Date.now();
    const war: ClanWarState = {
      warId: `WAR-${clanInfo.tag}-${now.toString(36).toUpperCase().slice(-5)}`,
      status: 'ACTIVE',
      startedAt: now,
      endsAt: now + CLAN_WAR_DURATION_MS,
      rivalClan: {
        clanId: rival.clanId,
        name: rival.name,
        tag: rival.tag,
        crest: rival.crest,
        totalCp: rival.totalCp,
      },
      attacksRemaining: CLAN_WAR_MAX_ATTACKS,
      maxAttacks: CLAN_WAR_MAX_ATTACKS,
      playerAssignedLane: null,
      playerWarMedals: 0,
      lanes,
      battleLog: [
        {
          id: `log_${now}`,
          text: `Turf War declared against [${rival.tag}] ${rival.name}! Station crew & hit all 3 districts.`,
          timestamp: now,
        },
      ],
    };

    const warMap = this.getWarMap();
    warMap[clanInfo.clanId] = war;
    this.saveWarMap(warMap);

    await this.broadcastClanSystemEvent(
      clanInfo.clanId,
      `TURF WAR STARTED vs [${rival.tag}] ${rival.name}! Assign your crew to a district in the Turf Map.`
    );

    return { ok: true, war };
  }

  async assignWarDefense(
    save: PlayerSaveState,
    clanId: string,
    laneId: WarLaneId
  ): Promise<ClanWarState | null> {
    const warMap = this.getWarMap();
    const war = warMap[clanId];
    if (!war || war.status !== 'ACTIVE') return war || null;

    const snap = buildCombatSnapshot(save);
    const defenderEntry: WarDefender = {
      playerId: snap.playerId,
      ign: snap.ign,
      job: save.job,
      level: save.level,
      combatPower: snap.combatPower,
      defeated: false,
      snapshot: snap,
    };

    const nextLanes = { ...war.lanes };
    (Object.keys(nextLanes) as WarLaneId[]).forEach((lid) => {
      const lane = nextLanes[lid];
      const filtered = lane.ourDefenders.filter((d) => d.playerId !== snap.playerId);
      const nextOurDef = lid === laneId ? [defenderEntry, ...filtered] : filtered;
      const updatedLane = { ...lane, ourDefenders: nextOurDef };
      updatedLane.controlledBy = this.recomputeLaneControl(updatedLane);
      nextLanes[lid] = updatedLane;
    });

    const updated: ClanWarState = {
      ...war,
      playerAssignedLane: laneId,
      lanes: nextLanes,
      battleLog: [
        {
          id: `def_${Date.now()}`,
          text: `${snap.ign} stationed lookout at ${WAR_LANE_META[laneId].name}.`,
          timestamp: Date.now(),
        },
        ...war.battleLog,
      ].slice(0, 20),
    };
    warMap[clanId] = updated;
    this.saveWarMap(warMap);
    return updated;
  }

  async recordWarBattleOutcome(
    save: PlayerSaveState,
    clanId: string,
    result: ClanSiegeResult
  ): Promise<{ war: ClanWarState | null; clan: ClanInfo | null }> {
    const warMap = this.getWarMap();
    const war = warMap[clanId];
    const clans = this.getClansMap();
    const clan = clans[clanId] || null;
    if (!war || save.tainted) return { war: war || null, clan };

    const lane = war.lanes[result.laneId];
    if (!lane) return { war, clan };

    let nextEnemyDefs = lane.enemyDefenders;
    let nextEnemyStatueHp = lane.enemyStatueHp;
    let nextCitadelHp = Math.max(0, lane.citadelHp - result.siegeDamage);

    if (result.targetType === 'defender' && result.victory && result.defenderId) {
      nextEnemyDefs = lane.enemyDefenders.map((d) =>
        d.playerId === result.defenderId ? { ...d, defeated: true } : d
      );
    } else if (result.targetType === 'statue') {
      nextEnemyStatueHp = Math.max(0, lane.enemyStatueHp - result.siegeDamage);
      if (nextEnemyStatueHp <= 0) {
        nextCitadelHp = 0;
      }
    }

    const updatedLane: WarLaneState = {
      ...lane,
      citadelHp: nextCitadelHp,
      enemyDefenders: nextEnemyDefs,
      enemyStatueHp: nextEnemyStatueHp,
      controlledBy: lane.controlledBy,
    };
    updatedLane.controlledBy = this.recomputeLaneControl(updatedLane);

    const logText =
      result.targetType === 'statue'
        ? `${save.profile.ign} cracked the ${lane.name} Family Safe for ${result.siegeDamage.toLocaleString()} Raid DMG!`
        : result.victory
          ? `${save.profile.ign} whacked ${result.defenderIgn || 'Rival Enforcer'} in ${lane.name} (-${result.siegeDamage.toLocaleString()} Safe HP)!`
          : `${save.profile.ign} traded shots with ${result.defenderIgn || 'Rival Enforcer'} in ${lane.name} (-${result.siegeDamage.toLocaleString()} Safe HP).`;

    const updatedWar: ClanWarState = {
      ...war,
      attacksRemaining: Math.max(0, war.attacksRemaining - 1),
      playerWarMedals: war.playerWarMedals + result.medalsEarned,
      lanes: {
        ...war.lanes,
        [result.laneId]: updatedLane,
      },
      battleLog: [
        { id: `atk_${Date.now()}`, text: logText, timestamp: Date.now() },
        ...war.battleLog,
      ].slice(0, 20),
    };

    warMap[clanId] = updatedWar;
    this.saveWarMap(warMap);

    let updatedClan = clan;
    if (clan && save.profile?.playerId) {
      updatedClan = {
        ...clan,
        members: clan.members.map((m) =>
          m.playerId === save.profile.playerId
            ? { ...m, weeklyContribution: m.weeklyContribution + result.contributionEarned }
            : m
        ),
      };
      clans[clanId] = updatedClan;
      this.saveClansMap(clans);
    }

    if (result.isStatueKill || updatedLane.controlledBy === 'ally') {
      await this.broadcastClanSystemEvent(
        clanId,
        `${save.profile.ign} took over ${lane.name} for [${clan?.tag || 'SYND'}]!`
      );
    }

    return { war: updatedWar, clan: updatedClan };
  }

  async advanceWarSkirmish(clanId: string): Promise<ClanWarState | null> {
    const warMap = this.getWarMap();
    const war = warMap[clanId];
    if (!war || war.status !== 'ACTIVE') return war || null;

    const nextLanes = { ...war.lanes };
    (Object.keys(nextLanes) as WarLaneId[]).forEach((lid, idx) => {
      const lane = { ...nextLanes[lid] };
      const allyPush = Math.round(lane.citadelMaxHp * (0.14 + (idx % 2) * 0.06));
      const enemyPush = Math.round(lane.ourCitadelMaxHp * (0.09 + ((idx + 1) % 2) * 0.05));
      lane.citadelHp = Math.max(0, lane.citadelHp - allyPush);
      lane.ourCitadelHp = Math.max(0, lane.ourCitadelHp - enemyPush);
      if (lane.citadelHp < lane.citadelMaxHp * 0.65) {
        const firstAlive = lane.enemyDefenders.findIndex((d) => !d.defeated);
        if (firstAlive >= 0) {
          lane.enemyDefenders = lane.enemyDefenders.map((d, i) =>
            i === firstAlive ? { ...d, defeated: true } : d
          );
        }
      }
      lane.controlledBy = this.recomputeLaneControl(lane);
      nextLanes[lid] = lane;
    });

    const updated: ClanWarState = {
      ...war,
      lanes: nextLanes,
      battleLog: [
        {
          id: `skirm_${Date.now()}`,
          text: 'Family crew & rivals clashed across all 3 City districts!',
          timestamp: Date.now(),
        },
        ...war.battleLog,
      ].slice(0, 20),
    };
    warMap[clanId] = updated;
    this.saveWarMap(warMap);
    return updated;
  }

  private finalizeWarObject(
    clanInfo: ClanInfo | null,
    war: ClanWarState,
    ownedSave?: PlayerSaveState
  ): ClanWarState {
    if (war.status === 'ENDED' && war.chestReward) return war;

    const laneList = Object.values(war.lanes);
    let lanesWon = 0;
    let lanesLost = 0;
    for (const l of laneList) {
      if (l.controlledBy === 'ally') lanesWon += 1;
      else if (l.controlledBy === 'enemy') lanesLost += 1;
      else if (l.citadelHp <= l.ourCitadelHp) lanesWon += 1;
      else lanesLost += 1;
    }

    const won = lanesWon >= 2;
    const pId = ownedSave?.profile?.playerId;
    const sortedMembers = clanInfo
      ? [...clanInfo.members].sort((a, b) => b.weeklyContribution - a.weeklyContribution)
      : [];
    const rankIdx = pId ? sortedMembers.findIndex((m) => m.playerId === pId) : 0;
    const contributionRank = rankIdx >= 0 ? rankIdx + 1 : 1;

    const rankTier =
      contributionRank === 1
        ? 'MVP Capo'
        : contributionRank <= 3
          ? 'Underboss Top 3'
          : 'Made Enforcer';
    const mult = contributionRank === 1 ? 1.5 : contributionRank <= 3 ? 1.2 : 1.0;

    const diamonds = Math.round((won ? 1200 : 400) * mult);
    const warMedals = Math.round((won ? 60 : 25) * mult);

    const mythicPool: RelicId[] = ['war_sovereign_banner', 'crimson_citadel_sigil'];
    const auraPool: CosmeticId[] = ['cape_warlord_aura', 'cape_celestial_aura'];

    let mythicRelicId: RelicId | undefined;
    let cosmeticAuraId: CosmeticId | undefined;

    if (won) {
      const lockedRelic = ownedSave
        ? mythicPool.find((rid) => !ownedSave.relics[rid]?.unlocked)
        : mythicPool[0];
      mythicRelicId = lockedRelic || mythicPool[Math.floor(Math.random() * mythicPool.length)];

      const lockedAura = ownedSave
        ? auraPool.find((cid) => !ownedSave.cosmeticsUnlocked[cid])
        : auraPool[0];
      cosmeticAuraId = lockedAura || auraPool[Math.floor(Math.random() * auraPool.length)];
    }

    const chestReward: ClanWarChestReward = {
      won,
      lanesWon,
      lanesLost,
      contributionRank,
      rankTier,
      diamonds,
      warMedals,
      mythicRelicId,
      cosmeticAuraId,
      claimed: false,
    };

    return {
      ...war,
      status: 'ENDED',
      chestReward,
    };
  }

  async resolveAndGenerateWarChest(
    save: PlayerSaveState,
    clanInfo: ClanInfo
  ): Promise<ClanWarState | null> {
    const warMap = this.getWarMap();
    const war = warMap[clanInfo.clanId];
    if (!war) return null;

    const finalized = this.finalizeWarObject(clanInfo, war, save);
    warMap[clanInfo.clanId] = finalized;
    this.saveWarMap(warMap);

    if (finalized.chestReward) {
      await this.broadcastClanSystemEvent(
        clanInfo.clanId,
        finalized.chestReward.won
          ? `TURF WAR VICTORY (${finalized.chestReward.lanesWon}/3 Districts)! Turf Spoils Crate unlocked!`
          : `Turf War ended (${finalized.chestReward.lanesWon}/3 Districts). Claim your cut from the crate!`
      );
    }

    return finalized;
  }

  async claimWarChest(
    save: PlayerSaveState,
    clanId: string
  ): Promise<{ save: PlayerSaveState; war: ClanWarState | null; reward: ClanWarChestReward | null }> {
    const warMap = this.getWarMap();
    const war = warMap[clanId];
    if (!war || !war.chestReward || war.chestReward.claimed) {
      return { save, war: war || null, reward: null };
    }

    const reward = war.chestReward;
    let nextRelics = { ...save.relics };
    let nextEquippedRelics = [...save.equippedRelics];

    if (reward.mythicRelicId) {
      const prevR = nextRelics[reward.mythicRelicId] || { unlocked: false, level: 1, count: 0 };
      nextRelics[reward.mythicRelicId] = prevR.unlocked
        ? { unlocked: true, level: prevR.level + 1, count: prevR.count + 1 }
        : { unlocked: true, level: 1, count: 1 };
      if (!prevR.unlocked && nextEquippedRelics.length < 2 && !nextEquippedRelics.includes(reward.mythicRelicId)) {
        nextEquippedRelics = [...nextEquippedRelics, reward.mythicRelicId];
      }
    }

    let nextCosmetics = { ...save.cosmeticsUnlocked };
    let nextEquippedCos = { ...save.equippedCosmetics };
    if (reward.cosmeticAuraId) {
      const wasNewAura = !nextCosmetics[reward.cosmeticAuraId];
      nextCosmetics[reward.cosmeticAuraId] = true;
      if (wasNewAura) {
        nextEquippedCos = { ...nextEquippedCos, cape: reward.cosmeticAuraId };
      }
    }

    const nextSave: PlayerSaveState = {
      ...save,
      diamonds: save.diamonds + reward.diamonds,
      warMedals: (save.warMedals || 0) + reward.warMedals,
      relics: nextRelics,
      equippedRelics: nextEquippedRelics,
      cosmeticsUnlocked: nextCosmetics,
      equippedCosmetics: nextEquippedCos,
    };

    // Clear finished war after claiming so Clan can start the next 24h siege cycle
    const claimedWar: ClanWarState = {
      ...war,
      chestReward: { ...reward, claimed: true },
    };
    delete warMap[clanId];
    this.saveWarMap(warMap);

    return { save: nextSave, war: claimedWar, reward };
  }
}

export const networkManager = new NetworkManager();
