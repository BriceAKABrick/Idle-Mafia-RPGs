import { Coins, Gem, KeyRound, Play, Skull } from 'lucide-react';
import { formatNum, safePow, sanitizeNum } from '../game/progression';
import { CombatMode, PlayerSaveState } from '../game/types';

interface TabDungeonsProps {
  save: PlayerSaveState;
  combatMode: CombatMode;
  onStartDungeon: (mode: 'DUNGEON_MESO' | 'DUNGEON_JEWEL') => void;
  onClaimFreeKey: () => void;
  onToggleAutoBoss: () => void;
}

export function TabDungeons({
  save,
  combatMode,
  onStartDungeon,
  onClaimFreeKey,
  onToggleAutoBoss,
}: TabDungeonsProps) {
  const now = Date.now();
  const freeCooldownMs = 120 * 1000; // 2 min bonus key cooldown
  const freeReady = now - save.dungeonKeys.lastFreeClaimAt >= freeCooldownMs;
  const freeWaitSec = Math.max(0, Math.ceil((freeCooldownMs - (now - save.dungeonKeys.lastFreeClaimAt)) / 1000));
  const inDungeon = combatMode === 'DUNGEON_MESO' || combatMode === 'DUNGEON_JEWEL';

  const estMesoHaul = Math.floor(sanitizeNum(1800 * safePow(1.135, save.stage - 1), 1800));
  const estJewelHaul = 220 + Math.min(2500, save.stage * 20);

  return (
    <div className="space-y-3 pb-2">
      {/* Side Hustle Header & Bonus Permit Claim */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1a1920]/95 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-zinc-200">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span className="font-bold">Side Hustles</span>
          <span className="text-zinc-400 text-[11px]">15s Heist Run</span>
        </div>

        <button
          type="button"
          disabled={!freeReady}
          onClick={onClaimFreeKey}
          className={`min-h-[32px] rounded-md px-2.5 py-1 text-[11px] font-bold whitespace-nowrap cursor-pointer ${
            freeReady
              ? 'bg-emerald-500 text-[#121216] hover:bg-emerald-400'
              : 'bg-zinc-800 text-zinc-400 cursor-not-allowed font-mono-num'
          }`}
        >
          {freeReady ? 'Claim +1 Permit' : `Free Permit (${freeWaitSec}s)`}
        </button>
      </div>

      {/* Armored Truck Hijack Card */}
      <div className="rounded-lg border border-emerald-500/45 bg-gradient-to-r from-[#1a1920] to-emerald-950/35 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/40">
              <Coins className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-display text-sm font-bold text-white">Armored Truck Hijack</div>
              <p className="text-[11px] text-zinc-300">
                Crack open the rolling armored convoy for massive Dirty Cash.
              </p>
              <div className="mt-1 font-mono-num text-[11px] text-emerald-300">
                Est. Score: ~${formatNum(estMesoHaul)} Cash · Permits: {save.dungeonKeys.meso}/5
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={inDungeon || save.dungeonKeys.meso <= 0}
            onClick={() => onStartDungeon('DUNGEON_MESO')}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
              !inDungeon && save.dungeonKeys.meso > 0
                ? 'bg-emerald-400 text-[#121216] hover:bg-emerald-300'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Hijack</span>
          </button>
        </div>
      </div>

      {/* Diamond District Vault Card */}
      <div className="rounded-lg border border-amber-500/45 bg-gradient-to-r from-[#1a1920] to-amber-950/35 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/40">
              <Gem className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="font-display text-sm font-bold text-white">Diamond District Vault</div>
              <p className="text-[11px] text-zinc-300">
                Blow the reinforced treasury safe for Gold Bars & Deal Contracts.
              </p>
              <div className="mt-1 font-mono-num text-[11px] text-amber-300">
                Est. Score: ~{formatNum(estJewelHaul)} Gold Bars · Permits: {save.dungeonKeys.jewel}/5
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={inDungeon || save.dungeonKeys.jewel <= 0}
            onClick={() => onStartDungeon('DUNGEON_JEWEL')}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
              !inDungeon && save.dungeonKeys.jewel > 0
                ? 'bg-amber-400 text-[#121216] hover:bg-amber-300'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Crack</span>
          </button>
        </div>
      </div>

      {/* Auto-Confront District Boss Setting */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1a1920]/90 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Skull className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">Auto-Confront District Boss</div>
            <div className="text-[11px] text-zinc-400 truncate">
              Automatically confront boss after Wave 10
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleAutoBoss}
          className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
            save.autoBoss
              ? 'bg-emerald-500 text-[#121216]'
              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
          }`}
        >
          {save.autoBoss ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
  );
}
