import { Cloud, RefreshCw, ShieldAlert, Swords, Trophy, UserCog } from 'lucide-react';
import {
  ARENA_CURRENCY_META,
  JOBS,
  PROFILE_BORDERS,
  PROFILE_EMBLEMS,
} from '../game/constants';
import { computeStats, formatNum, getEffectiveLiveOpsBonuses } from '../game/progression';
import {
  ArenaOpponent,
  CombatMode,
  NetworkMode,
  PlayerSaveState,
} from '../game/types';
import { SpritePreview } from './SpritePreview';

interface TabArenaProps {
  save: PlayerSaveState;
  combatMode: CombatMode;
  networkMode: NetworkMode;
  hasLiveCreds: boolean;
  lastSyncedAt: number | null;
  lastChecksum: string | null;
  isSyncing: boolean;
  opponents: ArenaOpponent[];
  loadingOpponents: boolean;
  onToggleNetworkMode: () => void;
  onOpenProfileModal: () => void;
  onManualSync: () => void;
  onRefreshOpponents: () => void;
  onSelectOpponent: (opponent: ArenaOpponent) => void;
}

export function TabArena({
  save,
  combatMode,
  networkMode,
  hasLiveCreds,
  lastSyncedAt,
  lastChecksum,
  isSyncing,
  opponents,
  loadingOpponents,
  onToggleNetworkMode,
  onOpenProfileModal,
  onManualSync,
  onRefreshOpponents,
  onSelectOpponent,
}: TabArenaProps) {
  const stats = computeStats(save);
  const myBorder = PROFILE_BORDERS[save.profile?.border || 'bronze'];
  const myEmblem = PROFILE_EMBLEMS[save.profile?.emblem || 'maple_leaf'];
  const myWpn = save.equippedWeaponByJob[save.job];
  const duelActive = combatMode === 'ARENA_PVP';
  const busyMode = combatMode !== 'FARMING';
  const liveOpsBonuses = getEffectiveLiveOpsBonuses();
  const isTainted = Boolean(save.tainted);

  const syncTimeLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Not synced';

  return (
    <div className="space-y-3 pb-4">
      {isTainted && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/80 bg-rose-950/70 p-2.5 text-[11px] text-rose-100">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-display font-bold text-rose-200">
              Security Lockout: Backroom Wagers Disabled
            </div>
            <div className="text-[10px] text-rose-200/85">
              Save tampering or clock desync detected. Competitive Fight Club & Turf Wars are locked on this ledger.
            </div>
          </div>
        </div>
      )}
      {/* Made Man Cloud Profile & Sync Status Card */}
      <div className={`rounded-xl border ${myBorder.borderClass} bg-[#1a1920] p-3`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 ${myBorder.borderClass} ${myBorder.bgClass}`}
            >
              <SpritePreview
                kind="hero"
                id={save.job}
                weaponId={myWpn}
                cosmetics={save.equippedCosmetics}
                size={38}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold text-white leading-tight">
                <span aria-hidden="true">{myEmblem.badge}</span>
                <span className="text-amber-300 font-mono-num text-xs">
                  [{save.profile?.clanTag || 'SYND'}]
                </span>
                <span className="truncate">{save.profile?.ign || 'Made Man'}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono-num text-zinc-300">
                <span>CP {formatNum(stats.combatPower)}</span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="text-emerald-400">{save.arenaStats.wins}W</span>
                <span className="text-zinc-500">-</span>
                <span className="text-rose-400">{save.arenaStats.losses}L</span>
                {save.arenaStats.streak >= 2 && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">·</span>
                    <span className="text-amber-300">{save.arenaStats.streak} Streak</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenProfileModal}
              title="Edit Made Man Profile"
              className="flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 bg-[#121216] px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-amber-400 cursor-pointer"
            >
              <UserCog className="w-3.5 h-3.5 text-amber-300" />
              <span>Dossier</span>
            </button>
          </div>
        </div>

        {/* Cloud Sync & Mode Controls */}
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2 text-[10px]">
          <div className="min-w-0 text-zinc-400 font-mono-num truncate">
            <span className={networkMode === 'LIVE' ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
              {networkMode === 'LIVE' ? (hasLiveCreds ? 'Live Wire' : 'Live (Fallback)') : 'Local Ledger'}
            </span>
            <span aria-hidden="true" className="mx-1 text-zinc-600">·</span>
            <span>Sync {syncTimeLabel}</span>
            {lastChecksum && (
              <>
                <span aria-hidden="true" className="mx-1 text-zinc-600">·</span>
                <span className="text-zinc-500">#{lastChecksum.slice(0, 6)}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleNetworkMode}
              className="rounded border border-zinc-700 bg-[#121216] px-2 py-1 text-[10px] font-bold text-zinc-200 hover:border-amber-400 cursor-pointer whitespace-nowrap"
            >
              {networkMode === 'SANDBOX' ? 'Switch Live' : 'Switch Local'}
            </button>
            <button
              type="button"
              disabled={isSyncing}
              onClick={onManualSync}
              className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-950/50 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-900/50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Cloud className="w-3 h-3" />
              <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>
          </div>
        </div>

        {save.integrityFlags && save.integrityFlags.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[10px] text-rose-200">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="truncate">
              Ledger Audit Flag: {save.integrityFlags[save.integrityFlags.length - 1]}
            </span>
          </div>
        )}
      </div>

      {/* Wager Currencies Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-zinc-800 bg-[#1a1920]/90 px-2.5 py-2 text-center">
          <div className="text-[10px] text-zinc-400">Gold Bars</div>
          <div className="mt-0.5 font-mono-num text-xs font-bold text-amber-300">
            {formatNum(save.diamonds)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-[#1a1920]/90 px-2.5 py-2 text-center">
          <div className="text-[10px] text-zinc-400">Blackmail Files</div>
          <div className="mt-0.5 font-mono-num text-xs font-bold text-rose-300">
            {formatNum(save.chaosCores)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-[#1a1920]/90 px-2.5 py-2 text-center">
          <div className="text-[10px] text-zinc-400">Fight Chips</div>
          <div className="mt-0.5 font-mono-num text-xs font-bold text-emerald-300">
            {formatNum(save.honorCoins)}
          </div>
        </div>
      </div>

      {/* Active Fight Club Battle Banner */}
      {duelActive && (
        <div className="rounded-xl border border-[#8B1E24] bg-[#8B1E24]/30 p-3 text-center">
          <div className="font-display text-sm font-bold text-amber-300">
            Backroom 1v1 In Progress
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-300">
            Watch the live seeded showdown in The Underground Fight Club ring above.
          </div>
        </div>
      )}

      {/* Matchmaking Lobby Header */}
      <div className="flex items-center justify-between px-0.5">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-display text-sm font-bold text-white">
              Underground Fight Club Lobby
            </h3>
            {liveOpsBonuses.wagerRakeDiscount >= 5 && (
              <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1.5 py-0.5 font-mono-num text-[9px] font-bold text-emerald-300">
                0% RAKE
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400">
            Real Made Men matched within ±20% of your Combat Power
          </p>
        </div>
        <button
          type="button"
          disabled={loadingOpponents || duelActive}
          onClick={onRefreshOpponents}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-[#1a1920] px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:border-amber-400 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingOpponents ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Real Rival Cards (Zero Bots) */}
      <div className="space-y-2">
        {loadingOpponents ? (
          <div className="rounded-xl border border-zinc-800 bg-[#1a1920]/70 p-6 text-center text-xs text-zinc-400">
            Scanning Underworld wire for ±20% CP challengers...
          </div>
        ) : opponents.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-[#1a1920]/85 p-5 text-center space-y-1.5">
            <div className="font-display text-xs font-bold text-zinc-200">
              No Real Challengers in ±20% CP Bracket
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Zero bots — pure player-vs-player integrity. Sync your Syndicate dossier or switch to Live Wire once rival Capos check in!
            </p>
          </div>
        ) : (
          opponents.map((opp) => {
            const border = PROFILE_BORDERS[opp.border] || PROFILE_BORDERS.bronze;
            const emblem = PROFILE_EMBLEMS[opp.emblem] || PROFILE_EMBLEMS.maple_leaf;
            const jobDef = JOBS[opp.job];
            const cpDiffPct = Math.round(
              ((opp.combatPower - stats.combatPower) / Math.max(1, stats.combatPower)) * 100
            );
            const statusText =
              opp.onlineStatus === 'online'
                ? 'Live Online'
                : opp.onlineStatus === 'in_lobby'
                  ? 'In Fight Club'
                  : 'Cloud Dossier';

            return (
              <div
                key={opp.playerId}
                className="flex items-center justify-between gap-2.5 rounded-xl border border-zinc-800 bg-[#1a1920] p-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 ${border.borderClass} ${border.bgClass}`}
                  >
                    <SpritePreview
                      kind="hero"
                      id={opp.job}
                      weaponId={opp.equippedWeaponId}
                      cosmetics={opp.equippedCosmetics}
                      size={38}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-xs font-bold text-white leading-tight">
                      <span aria-hidden="true">{emblem.badge}</span>
                      <span className="font-mono-num text-[10px] text-amber-300">
                        [{opp.clanTag}]
                      </span>
                      <span className="truncate">{opp.ign}</span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-300 font-mono-num">
                      <span>Lv.{opp.level} {jobDef.name}</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-amber-300 font-bold">CP {formatNum(opp.combatPower)}</span>
                      <span className={cpDiffPct >= 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        ({cpDiffPct >= 0 ? `+${cpDiffPct}%` : `${cpDiffPct}%`})
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono-num">
                      <span>{opp.wins}W - {opp.losses}L</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className={opp.onlineStatus === 'snapshot' ? 'text-zinc-400' : 'text-emerald-400'}>
                        {statusText}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyMode || isTainted}
                  onClick={() => onSelectOpponent(opp)}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-display text-xs font-bold whitespace-nowrap transition-colors ${
                    busyMode || isTainted
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-b from-rose-600 to-[#8B1E24] text-white hover:brightness-110 cursor-pointer'
                  }`}
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Stake Wager</span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Fight Club History */}
      {save.arenaHistory && save.arenaHistory.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-[#1a1920]/85 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200 mb-2">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Recent Fight Club Matches</span>
          </div>
          <div className="space-y-1.5">
            {save.arenaHistory.slice(0, 5).map((item) => {
              const curMeta = ARENA_CURRENCY_META[item.currency];
              const isWin = item.winner === 'player';
              return (
                <div
                  key={item.matchId}
                  className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5 last:border-none last:pb-0 text-[11px]"
                >
                  <div className="min-w-0 truncate text-zinc-300">
                    <span className={isWin ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
                      {isWin ? 'WIN' : 'LOSS'}
                    </span>
                    <span className="mx-1.5 text-zinc-600">·</span>
                    <span>vs [{item.rivalClan}] {item.rivalIgn}</span>
                  </div>
                  <span
                    className={`font-mono-num font-bold shrink-0 ml-2 ${
                      isWin ? curMeta.textClass : 'text-rose-400'
                    }`}
                  >
                    {item.netDelta >= 0 ? `+${formatNum(item.netDelta)}` : formatNum(item.netDelta)}{' '}
                    {curMeta.short}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
