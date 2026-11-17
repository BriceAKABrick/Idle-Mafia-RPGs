import { useEffect, useRef, useState } from 'react';
import { Activity, Flame, Pause, Settings, Skull, Ticket, Volume2, VolumeX, Zap } from 'lucide-react';
import { EXPEDITION_COOLDOWN_MS, getZoneForStage, JOBS } from '../game/constants';
import { computeStats, expForNextLevel, formatNum, getFeverDuration } from '../game/progression';
import { LiveOpsConfig, LiveSnapshot, PlayerSaveState } from '../game/types';

interface TopHudProps {
  save: PlayerSaveState;
  snapshot: LiveSnapshot;
  arenaSpeed?: 1 | 2;
  liveOps?: LiveOpsConfig | null;
  onChallengeBoss: () => void;
  onToggleAutoBoss: () => void;
  onStartExpedition: () => void;
  onToggleDpsMeter: () => void;
  onToggleMute: () => void;
  onToggleArenaSpeed?: () => void;
  onOpenSettings?: () => void;
  onOpenPause: () => void;
}

export function TopHud({
  save,
  snapshot,
  arenaSpeed = 1,
  liveOps,
  onChallengeBoss,
  onToggleAutoBoss,
  onStartExpedition,
  onToggleDpsMeter,
  onToggleMute,
  onToggleArenaSpeed,
  onOpenSettings,
  onOpenPause,
}: TopHudProps) {
  const zone = getZoneForStage(save.stage);
  const job = JOBS[save.job];
  const needExp = expForNextLevel(save.level);
  const expPct = Math.min(100, (save.exp / needExp) * 100);
  const hpPct = Math.min(100, (snapshot.heroHp / Math.max(1, snapshot.heroMaxHp)) * 100);
  const maxFeverDuration = getFeverDuration(save);

  const targetCp = computeStats(save).combatPower;
  const [displayCp, setDisplayCp] = useState(targetCp);
  const [cpPop, setCpPop] = useState<{ delta: number; key: number } | null>(null);
  const prevTargetCpRef = useRef(targetCp);
  const displayCpRef = useRef(targetCp);

  useEffect(() => {
    const prev = prevTargetCpRef.current;
    if (targetCp === prev) return;
    const diff = targetCp - prev;
    prevTargetCpRef.current = targetCp;

    if (diff > 0) {
      setCpPop({ delta: diff, key: Date.now() });
    }

    const startVal = displayCpRef.current;
    const startTime = performance.now();
    const duration = 420;
    let rafId = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextVal = Math.round(startVal + (targetCp - startVal) * eased);
      displayCpRef.current = nextVal;
      setDisplayCp(nextVal);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [targetCp]);

  useEffect(() => {
    if (!cpPop) return;
    const t = window.setTimeout(() => setCpPop(null), 1350);
    return () => window.clearTimeout(t);
  }, [cpPop]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cdLeftMs = Math.max(0, EXPEDITION_COOLDOWN_MS - (nowMs - save.lastExpeditionAt));
  const cdSec = Math.ceil(cdLeftMs / 1000);
  const cdLabel = `${String(Math.floor(cdSec / 60)).padStart(2, '0')}:${String(cdSec % 60).padStart(2, '0')}`;
  const expeditionReady = cdLeftMs === 0 || save.expeditionTickets > 0;
  const isFever = snapshot.feverTimer > 0;
  const liveOpsActive = Boolean(liveOps && liveOps.active && nowMs < liveOps.ends_at);
  const opsRemMs = liveOpsActive && liveOps ? Math.max(0, liveOps.ends_at - nowMs) : 0;
  const opsH = Math.floor(opsRemMs / 3_600_000);
  const opsM = Math.floor((opsRemMs % 3_600_000) / 60_000);

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex flex-col justify-between transition-shadow duration-300 ${
        isFever
          ? 'ring-2 ring-inset ring-amber-400/90 shadow-[inset_0_0_24px_rgba(245,158,11,0.45)]'
          : ''
      }`}
    >
      {/* Top Turf War Frenzy Gauge Edge */}
      <div className="w-full">
        <div className="relative h-2 w-full bg-[#121216]/90 border-b border-zinc-800/80 overflow-hidden">
          <div
            className={`h-full transition-[width] duration-150 ${
              isFever
                ? 'bg-gradient-to-r from-[#8B1E24] via-amber-400 to-rose-500 animate-pulse'
                : 'bg-gradient-to-r from-[#8B1E24] to-[#F59E0B]'
            }`}
            style={{
              width: `${isFever ? Math.min(100, (snapshot.feverTimer / maxFeverDuration) * 100) : Math.min(100, snapshot.feverCharge)}%`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold tracking-wide text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)] font-mono-num">
            {isFever
              ? `TURF WAR FRENZY! 2x FIRE RATE · 2x CASH (${snapshot.feverTimer.toFixed(1)}s)`
              : `FRENZY ${Math.floor(snapshot.feverCharge)}%`}
          </div>
        </div>

        {/* Slim LiveOps Event Strip */}
        {liveOpsActive && liveOps && (
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#8B1E24]/95 via-rose-800/90 to-amber-700/90 px-2 py-0.5 text-[9px] font-bold text-white border-b border-amber-300/40">
            <span className="truncate font-display tracking-wide">{liveOps.event_title}</span>
            <div className="flex items-center gap-1.5 shrink-0 font-mono-num">
              <span className="rounded bg-[#121216]/65 px-1 text-[#10B981]">
                {liveOps.meso_multiplier}x CASH
              </span>
              {liveOps.starforce_bonus_rate > 0 && (
                <span className="rounded bg-[#121216]/65 px-1 text-amber-200">
                  +{liveOps.starforce_bonus_rate}% MOD
                </span>
              )}
              <span className="text-amber-100">Ends in {opsH}h {opsM}m</span>
            </div>
          </div>
        )}

        {/* Top Perimeter Status Row */}
        <div className="flex items-start justify-between gap-1.5 px-2 pt-1.5">
          {/* Block / Lockdown Tier, Wave & Rolling Respect (CP) Ticker */}
          <div
            className={`rounded-md bg-[#121216]/85 border px-2 py-1 text-left ${
              zone.isChaos ? 'border-[#8B1E24]' : 'border-zinc-700/80'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-white leading-tight">
              <span
                className={`font-display ${
                  snapshot.combatMode === 'ARENA_PVP' || snapshot.combatMode === 'CLAN_SIEGE'
                    ? 'text-rose-300'
                    : zone.isChaos
                      ? 'text-red-400'
                      : 'text-amber-300'
                }`}
              >
                {snapshot.combatMode === 'ARENA_PVP'
                  ? 'Fight Club'
                  : snapshot.combatMode === 'CLAN_SIEGE'
                    ? 'Turf War'
                    : zone.worldLabel}
              </span>
              <span aria-hidden="true" className="text-zinc-500">·</span>
              <span className="truncate max-w-[96px] text-slate-200">
                {snapshot.combatMode === 'ARENA_PVP'
                  ? 'Backroom 1v1'
                  : snapshot.combatMode === 'CLAN_SIEGE'
                    ? snapshot.siegeLaneName || 'District Raid'
                    : zone.name}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono-num leading-tight">
              <span className="text-slate-300">
                {snapshot.combatMode === 'ARENA_PVP'
                  ? `${(snapshot.arenaClock || 0).toFixed(1)}s`
                  : snapshot.combatMode === 'CLAN_SIEGE'
                    ? snapshot.arenaClock !== undefined
                      ? `${snapshot.arenaClock.toFixed(1)}s`
                      : `${snapshot.bossTimer.toFixed(1)}s`
                    : snapshot.combatMode === 'EXPEDITION_ZAKUM'
                      ? 'Fed Reserve'
                      : snapshot.combatMode === 'BOSS'
                        ? 'Boss Hit'
                        : snapshot.combatMode === 'DUNGEON_MESO'
                          ? 'Brinks Truck'
                          : snapshot.combatMode === 'DUNGEON_JEWEL'
                            ? 'Treasury Vault'
                            : `Wave ${save.wave}/10`}
              </span>
              <span aria-hidden="true" className="text-zinc-500">·</span>
              <span
                className={`relative inline-flex items-center gap-0.5 font-bold transition-colors duration-300 ${
                  cpPop ? 'text-[#10B981]' : 'text-amber-300'
                }`}
              >
                <Zap className="w-2.5 h-2.5 text-[#F59E0B]" />
                CP {formatNum(displayCp)}
                {cpPop && (
                  <span
                    key={cpPop.key}
                    className="ml-1 text-[9px] font-bold text-[#10B981] animate-gacha-pop"
                  >
                    +{formatNum(cpPop.delta)}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Currencies + Mute/Pause */}
          <div className="flex items-center gap-1">
            <div className="rounded-md bg-[#121216]/85 border border-zinc-700/80 px-2 py-1 text-right font-mono-num text-[10px] leading-tight">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[#10B981] font-bold">${formatNum(save.mesos)}</span>
                <span className="text-[#F59E0B] font-bold">{formatNum(save.diamonds)}G</span>
                <span className="inline-flex items-center gap-0.5 text-amber-200 font-bold">
                  <Ticket className="w-2.5 h-2.5" />
                  {save.summonTickets}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={save.muted ? 'Unmute sound' : 'Mute sound'}
              className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md bg-[#121216]/85 border border-zinc-700/80 text-slate-200 hover:bg-zinc-800 cursor-pointer"
            >
              {save.muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-[#10B981]" />}
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Settings and Account"
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md bg-[#121216]/85 border border-zinc-700/80 text-slate-200 hover:bg-zinc-800 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-amber-300" />
              </button>
            )}

            <button
              type="button"
              onClick={onOpenPause}
              aria-label="Open menu"
              className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md bg-[#121216]/85 border border-zinc-700/80 text-slate-200 hover:bg-zinc-800 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Top-Center Boss / Federal Reserve Heist / Action Buttons */}
      <div className="flex justify-center px-2">
        {snapshot.combatMode === 'EXPEDITION_ZAKUM' && (
          <div className="w-68 rounded-md bg-[#121216]/90 border border-[#8B1E24] px-2.5 py-1 shadow-[0_0_14px_rgba(139,30,36,0.55)]">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-amber-300 truncate">{snapshot.bossName}</span>
              <span className="font-mono-num text-slate-200">
                Turrets: <span className={snapshot.zakumArmsAlive > 0 ? 'text-rose-300' : 'text-[#10B981]'}>{snapshot.zakumArmsAlive}/6</span>
                <span className="mx-1 text-zinc-500">·</span>
                <span className="text-amber-300">{snapshot.bossTimer.toFixed(1)}s</span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-[#8B1E24] via-rose-500 to-amber-400 transition-[width] duration-100"
                style={{ width: `${Math.min(100, (snapshot.bossHp / Math.max(1, snapshot.bossMaxHp)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {snapshot.combatMode === 'BOSS' && (
          <div className="w-60 rounded-md bg-[#121216]/90 border border-[#8B1E24] px-2.5 py-1">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-rose-300 truncate max-w-[140px]">{snapshot.bossName}</span>
              <span className="font-mono-num text-amber-300">{snapshot.bossTimer.toFixed(1)}s</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-[#8B1E24] to-amber-500 transition-[width] duration-100"
                style={{ width: `${Math.min(100, (snapshot.bossHp / Math.max(1, snapshot.bossMaxHp)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {snapshot.combatMode === 'ARENA_PVP' && (
          <div className="w-full max-w-[310px] rounded-md bg-[#121216]/90 border border-[#8B1E24] px-2.5 py-1.5 shadow-lg">
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
              <span className="truncate text-[#10B981]">
                {save.profile?.ign || 'You'} ({formatNum(snapshot.arenaPlayerHp ?? 0)})
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-amber-300 font-display">VS</span>
                {onToggleArenaSpeed && (
                  <button
                    type="button"
                    onClick={onToggleArenaSpeed}
                    className="pointer-events-auto rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 font-mono-num text-[9px] font-bold text-white hover:border-amber-400 cursor-pointer"
                  >
                    {arenaSpeed}x
                  </button>
                )}
              </div>
              <span className="truncate text-rose-300 text-right">
                {snapshot.arenaRivalName || 'Rival'} ({formatNum(snapshot.arenaRivalHp ?? 0)})
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <div className="h-2 overflow-hidden rounded-sm bg-zinc-800">
                <div
                  className="h-full bg-[#10B981] transition-[width] duration-75"
                  style={{
                    width: `${Math.min(
                      100,
                      ((snapshot.arenaPlayerHp ?? 0) / Math.max(1, snapshot.arenaPlayerMaxHp ?? 1)) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-zinc-800">
                <div
                  className="ml-auto h-full bg-rose-500 transition-[width] duration-75"
                  style={{
                    width: `${Math.min(
                      100,
                      ((snapshot.arenaRivalHp ?? 0) / Math.max(1, snapshot.arenaRivalMaxHp ?? 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {snapshot.combatMode === 'CLAN_SIEGE' && (
          <div className="w-68 rounded-md bg-[#121216]/90 border border-[#8B1E24] px-2.5 py-1 shadow-[0_0_14px_rgba(139,30,36,0.45)]">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-rose-300 truncate max-w-[165px]">
                {snapshot.siegeTargetName || 'Rival Crew'}
              </span>
              <span className="font-mono-num text-amber-300">
                {snapshot.arenaClock !== undefined
                  ? `${snapshot.arenaClock.toFixed(1)}s`
                  : `${snapshot.bossTimer.toFixed(1)}s`}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-[#8B1E24] via-rose-500 to-amber-400 transition-[width] duration-75"
                style={{
                  width: `${Math.min(
                    100,
                    ((snapshot.siegeTargetHp ?? 0) / Math.max(1, snapshot.siegeTargetMaxHp ?? 1)) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="mt-0.5 flex items-center justify-between font-mono-num text-[9px] text-slate-300">
              <span>{snapshot.siegeLaneName || 'Turf Raid'}</span>
              <span>
                {formatNum(snapshot.siegeTargetHp ?? 0)}/{formatNum(snapshot.siegeTargetMaxHp ?? 1)}
              </span>
            </div>
          </div>
        )}

        {(snapshot.combatMode === 'DUNGEON_MESO' || snapshot.combatMode === 'DUNGEON_JEWEL') && (
          <div className="w-60 rounded-md bg-[#121216]/90 border border-amber-400/80 px-2.5 py-1">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-[#10B981]">
                {snapshot.combatMode === 'DUNGEON_MESO' ? 'Cash Haul' : 'Gold Haul'}: {formatNum(snapshot.dungeonScore)}
              </span>
              <span className="font-mono-num text-white">{snapshot.bossTimer.toFixed(1)}s</span>
            </div>
          </div>
        )}

        {snapshot.combatMode === 'FARMING' && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {save.bossReady && (
              <button
                type="button"
                onClick={onChallengeBoss}
                className="pointer-events-auto flex items-center gap-1 rounded-lg border-2 border-amber-300 bg-gradient-to-b from-[#8B1E24] to-red-900 px-3 py-1 font-display text-xs font-bold text-white shadow-[0_0_16px_rgba(139,30,36,0.85)] animate-pulse cursor-pointer"
              >
                <Skull className="w-3.5 h-3.5 text-amber-200" />
                <span>HIT BOSS</span>
                <kbd className="hidden sm:inline-block rounded bg-black/35 px-1 text-[9px] font-mono-num text-amber-100">
                  SPACE
                </kbd>
              </button>
            )}

            {(save.bossReady || save.autoBoss || save.transcendCount > 0) && (
              <label className="pointer-events-auto flex items-center gap-1 rounded-md border border-zinc-700/90 bg-[#121216]/90 px-2 py-1 text-[10px] font-bold text-slate-200 cursor-pointer select-none hover:border-amber-400/70">
                <input
                  type="checkbox"
                  checked={save.autoBoss}
                  onChange={onToggleAutoBoss}
                  className="h-3 w-3 accent-amber-400 cursor-pointer"
                />
                <span className={save.autoBoss ? 'text-[#10B981]' : 'text-slate-300'}>
                  Auto-Hit
                </span>
              </label>
            )}

            <button
              type="button"
              disabled={!expeditionReady}
              onClick={onStartExpedition}
              className={`pointer-events-auto flex items-center gap-1 rounded-lg border px-2.5 py-1 font-display text-[11px] font-bold transition-all ${
                expeditionReady
                  ? 'border-amber-400 bg-gradient-to-b from-[#8B1E24] to-zinc-900 text-white shadow-[0_0_14px_rgba(245,158,11,0.5)] hover:brightness-110 cursor-pointer'
                  : 'border-zinc-700 bg-[#121216]/85 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${expeditionReady ? 'text-amber-300' : 'text-zinc-500'}`} />
              <span>FED HEIST</span>
              <span className="font-mono-num text-[10px] text-amber-200/90">
                {cdLeftMs === 0
                  ? 'Free'
                  : save.expeditionTickets > 0
                    ? `${save.expeditionTickets} Pass`
                    : cdLabel}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Edge Capo HP/Respect EXP + Toggleable Floating DPS Meter */}
      <div className="flex items-end justify-between gap-2 px-2 pb-1.5">
        <div className="w-44 rounded-md bg-[#121216]/85 border border-zinc-700/80 px-2 py-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-200">
            <span>Lv.{save.level} {job.name}</span>
            <span className="font-mono-num text-rose-300">
              {formatNum(snapshot.heroHp)}/{formatNum(snapshot.heroMaxHp)}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-sm bg-zinc-800">
            <div
              className="h-full bg-[#8B1E24] transition-[width] duration-100"
              style={{ width: `${hpPct}%` }}
            />
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-sm bg-zinc-800">
            <div
              className="h-full bg-[#10B981] transition-[width] duration-150"
              style={{ width: `${expPct}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleDpsMeter}
          title={save.showDpsMeter ? 'Hide DPS Meter' : 'Show DPS Meter'}
          className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-[#121216]/85 border border-zinc-700/80 px-2 py-1 text-[10px] font-mono-num font-bold text-slate-200 hover:bg-zinc-800 cursor-pointer"
        >
          <Activity className={`w-3 h-3 ${save.showDpsMeter ? 'text-[#10B981]' : 'text-zinc-500'}`} />
          {save.showDpsMeter ? (
            <span className="text-[#10B981]">{formatNum(snapshot.realDps)}/s</span>
          ) : (
            <span className="text-slate-400">DPS</span>
          )}
        </button>
      </div>
    </div>
  );
}
