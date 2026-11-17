import { SAVE_STORAGE_KEY } from './constants';
import { getStageMesoReward } from './progression';
import { SafeStorage } from './storage';
import { PlayerSaveState } from './types';

// One-time startup wipe key to purge all legacy player saves & bot-created clans
const WIPE_SENTINEL_KEY = 'maple_idle_wipe_v2_nobots';

const LEGACY_STORAGE_KEYS = [
  SAVE_STORAGE_KEY,
  'maple_idle_cloud_baseline_v1',
  'maple_idle_clans_v1',
  'maple_idle_clan_chat_v1',
  'maple_idle_clan_war_v1',
  'maple_idle_real_players_v1',
];

// Private closure vault (zero window globals)
interface VaultRecord {
  sig: string;
  mesos: number;
  diamonds: number;
  chaosCores: number;
  arcaneSymbols: number;
  tainted: boolean;
  updatedAt: number;
}

const vaultStore = new WeakMap<object, VaultRecord>();
const vaultHandle = {};

// Anti-speedhack monotonic drift tracker
let lastClockPerfMs = typeof performance !== 'undefined' ? performance.now() : 0;
let lastClockWallMs = Date.now();
let driftStrikeCount = 0;

export function performStartupWipeIfNeeded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (SafeStorage.getItem(WIPE_SENTINEL_KEY) === '1') {
      return false;
    }
    for (const key of LEGACY_STORAGE_KEYS) {
      SafeStorage.removeItem(key);
    }
    SafeStorage.setItem(WIPE_SENTINEL_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  let h1 = 0x811c9dc5 ^ 0x517cc1b7;
  let h2 = 0x9e3779b9 ^ 0x85ebca6b;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((h1 >>> 13) & 0xff);
    h2 = Math.imul(h2, 0xc2b2ae35);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function computeSecuritySig(save: PlayerSaveState): string {
  const starForceMap: Record<string, number> = {};
  for (const [wid, w] of Object.entries(save.weapons || {})) {
    if (w && (w.stars || 0) > 0) {
      starForceMap[wid] = w.stars || 0;
    }
  }

  return hashPayload({
    p: save.profile?.playerId || '',
    m: Math.floor(save.mesos || 0),
    d: Math.floor(save.diamonds || 0),
    h: Math.floor(save.honorCoins || 0),
    c: Math.floor(save.chaosCores || 0),
    a: Math.floor(save.arcaneSymbols || 0),
    st: save.stage,
    lv: save.level,
    eq: save.equippedWeaponByJob,
    sf: starForceMap,
    t: Boolean(save.tainted),
  });
}

export function sealSaveState(save: PlayerSaveState): PlayerSaveState {
  const sig = computeSecuritySig(save);
  const sealed: PlayerSaveState = {
    ...save,
    _sig: sig,
  };
  vaultStore.set(vaultHandle, {
    sig,
    mesos: sealed.mesos,
    diamonds: sealed.diamonds,
    chaosCores: sealed.chaosCores,
    arcaneSymbols: sealed.arcaneSymbols,
    tainted: sealed.tainted,
    updatedAt: Date.now(),
  });
  return sealed;
}

export function verifySaveIntegrity(
  save: PlayerSaveState,
  hadExistingSave: boolean
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!Number.isFinite(save.mesos) || save.mesos < 0) reasons.push('CORRUPT_MESOS');
  if (!Number.isFinite(save.diamonds) || save.diamonds < 0) reasons.push('CORRUPT_DIAMONDS');
  if (!Number.isFinite(save.chaosCores) || save.chaosCores < 0) reasons.push('CORRUPT_CORES');
  if (!Number.isFinite(save.arcaneSymbols) || save.arcaneSymbols < 0) {
    reasons.push('CORRUPT_SYMBOLS');
  }

  for (const [wid, w] of Object.entries(save.weapons || {})) {
    if (w && ((w.stars || 0) < 0 || (w.stars || 0) > 15)) {
      reasons.push(`INVALID_STAR_FORCE(${wid})`);
      break;
    }
  }

  if (hadExistingSave) {
    const expected = computeSecuritySig(save);
    if (!save._sig || save._sig !== expected) {
      reasons.push('STORAGE_CHECKSUM_MISMATCH');
    }
  }

  if (save.tainted) {
    reasons.push('PREVIOUSLY_TAINTED');
  }

  return { ok: reasons.length === 0, reasons };
}

export type SaveMutationSource =
  | 'tick'
  | 'kill'
  | 'boss'
  | 'dungeon'
  | 'zakum'
  | 'offline'
  | 'quest'
  | 'arena_payout'
  | 'clan_war'
  | 'promo'
  | 'transcend'
  | 'ui';

export function detectImpossibleGain(
  prev: PlayerSaveState,
  next: PlayerSaveState,
  source: SaveMutationSource
): { tainted: boolean; reason?: string } {
  if (prev.tainted) return { tainted: true, reason: 'ALREADY_TAINTED' };

  const vault = vaultStore.get(vaultHandle);
  if (vault && prev._sig && prev._sig !== vault.sig) {
    return { tainted: true, reason: 'MEMORY_VAULT_DESYNC' };
  }

  const mesoGain = next.mesos - prev.mesos;
  const diaGain = next.diamonds - prev.diamonds;

  // Allow known legitimate lump-sum sources with generous safety ceilings
  if (source === 'kill' || source === 'tick' || source === 'ui') {
    const expectedKillMeso = getStageMesoReward(Math.max(1, prev.stage), true);
    const maxSingleFrameMeso = Math.max(250_000, expectedKillMeso * 10_000);
    if (mesoGain > maxSingleFrameMeso) {
      return { tainted: true, reason: `IMPOSSIBLE_MESO_JUMP(+${Math.floor(mesoGain)})` };
    }
    if (diaGain > 25_000) {
      return { tainted: true, reason: `IMPOSSIBLE_DIAMOND_JUMP(+${Math.floor(diaGain)})` };
    }
  }

  return { tainted: false };
}

/**
 * Wraps state references in a defensive Proxy so direct console mutations
 * on sensitive currency/gear properties are rejected and flagged immediately.
 */
export function createGuardedSaveProxy(
  target: PlayerSaveState,
  onTamper: (reason: string) => void
): PlayerSaveState {
  const guardedKeys = new Set([
    'mesos',
    'diamonds',
    'chaosCores',
    'arcaneSymbols',
    'honorCoins',
    'weapons',
    'equippedWeaponByJob',
    '_sig',
    'tainted',
  ]);

  return new Proxy(target, {
    set(_obj, prop) {
      if (typeof prop === 'string' && guardedKeys.has(prop)) {
        onTamper(`CONSOLE_MUTATION_ATTEMPT(${prop})`);
      }
      return false;
    },
    defineProperty() {
      onTamper('CONSOLE_DEFINE_PROPERTY');
      return false;
    },
  });
}

export function resetClockMonitor(): void {
  lastClockPerfMs = typeof performance !== 'undefined' ? performance.now() : 0;
  lastClockWallMs = Date.now();
  driftStrikeCount = 0;
}

/**
 * Compares high-resolution performance.now() against Date.now() wall-clock delta
 * to detect speedhack tools that accelerate requestAnimationFrame / performance timers.
 */
export function sampleClockDrift(): {
  speedhackSuspected: boolean;
  safeDtCap: number;
} {
  if (typeof performance === 'undefined') {
    return { speedhackSuspected: false, safeDtCap: 0.05 };
  }
  const nowPerf = performance.now();
  const nowWall = Date.now();
  const perfDelta = nowPerf - lastClockPerfMs;
  const wallDelta = nowWall - lastClockWallMs;

  if (wallDelta >= 400) {
    lastClockPerfMs = nowPerf;
    lastClockWallMs = nowWall;
    if (perfDelta > wallDelta * 1.55 + 350 && typeof document !== 'undefined' && !document.hidden) {
      driftStrikeCount += 1;
    } else if (perfDelta <= wallDelta * 1.25 + 150) {
      driftStrikeCount = Math.max(0, driftStrikeCount - 1);
    }
  }

  const ratio = wallDelta > 200 ? Math.min(1, Math.max(0.25, wallDelta / Math.max(1, perfDelta))) : 1;
  return {
    speedhackSuspected: driftStrikeCount >= 4,
    safeDtCap: 0.05 * ratio,
  };
}
