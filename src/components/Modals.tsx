import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Gem,
  Lock,
  Orbit,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Star,
  Swords,
  Ticket,
  Trophy,
  UserCheck,
  Volume2,
  X,
} from 'lucide-react';
import { sfx } from '../game/audio';
import {
  ARENA_CURRENCY_META,
  ARENA_HOUSE_FEE_PCT,
  COSMETICS,
  getZoneForStage,
  JOBS,
  PROFILE_BORDERS,
  PROFILE_EMBLEMS,
  RARITY_META,
  RELICS,
  TRANSCEND_EDGES,
  TRANSCEND_SKILLS,
  WEAPONS,
} from '../game/constants';
import { generateSecurePlayerId, LiveChallengeResponse } from '../game/network';
import {
  canUpgradeTranscendSkill,
  computePendingArcaneSymbols,
  computeStats,
  formatNum,
  getEffectiveLiveOpsBonuses,
  getStarForceConfig,
  getTranscendSkillCost,
  getWeaponAtkPct,
  isTranscendUnlocked,
} from '../game/progression';
import {
  ArenaCurrency,
  ArenaMatchResult,
  ArenaOpponent,
  ClanWarState,
  CompanionId,
  CosmeticId,
  DuelType,
  GachaPullResult,
  JobId,
  NetworkMode,
  OfflineGains,
  PlayerSaveState,
  ProfileBorderId,
  ProfileEmblemId,
  TranscendSkillId,
  WagerTier,
} from '../game/types';
import { SpritePreview } from './SpritePreview';

export function OfflineGainsModal({
  gains,
  onClaim,
}: {
  gains: OfflineGains;
  onClaim: () => void;
}) {
  const mins = Math.floor(gains.elapsedSeconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  const timeStr =
    hrs > 0
      ? `${hrs}h ${remMins}m`
      : mins > 0
        ? `${mins}m ${gains.elapsedSeconds % 60}s`
        : `${gains.elapsedSeconds}s`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121216]/90 p-4">
      <div className="w-full max-w-xs rounded-xl border border-amber-500/60 bg-[#1a1920] p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-amber-300">
          <Clock className="w-5 h-5" />
          <h2 className="font-display text-base font-bold text-white">Racket Earnings Collected!</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-300">
          Your crew ran rackets across the city for{' '}
          <span className="font-mono-num font-bold text-amber-300">{timeStr}</span>.
        </p>

        <div className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-[#121216] p-3 font-mono-num text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Cash Laundered</span>
            <span className="font-bold text-emerald-400">+${formatNum(gains.mesos)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Respect EXP</span>
            <span className="font-bold text-amber-300">+{formatNum(gains.exp)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Deal Contracts</span>
            <span className="inline-flex items-center gap-1 font-bold text-rose-300">
              <Ticket className="w-3.5 h-3.5" />+{gains.tickets}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClaim}
          className="mt-4 w-full min-h-[44px] rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2 font-display text-sm font-bold text-[#121216] cursor-pointer"
        >
          Collect Earnings
        </button>
      </div>
    </div>
  );
}

export function GachaRevealModal({
  results,
  onClose,
}: {
  results: GachaPullResult[];
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121216]/92 p-4">
      <div className="w-full max-w-sm rounded-xl border border-amber-500/60 bg-[#1a1920] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-base font-bold text-white">Black Market Haul</h2>
          </div>
          <span className="font-mono-num text-xs text-zinc-400">{results.length} Deals</span>
        </div>

        <div
          className={`mt-3 grid gap-2 max-h-[55vh] overflow-y-auto hud-scroll pr-0.5 ${
            results.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {results.map((item, idx) => {
            const meta = RARITY_META[item.rarity];
            return (
              <div
                key={`${item.id}_${idx}`}
                style={{ animationDelay: `${idx * 45}ms` }}
                className={`animate-gacha-pop rounded-lg border p-2.5 ${meta.border} ${meta.bg} ${meta.glow}`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className={meta.text}>{meta.label}</span>
                  {item.isNew && <span className="text-emerald-400">NEW</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#121216] border border-zinc-800">
                    {item.category === 'companion' ? (
                      <SpritePreview kind="companion" id={item.id as CompanionId} size={26} />
                    ) : item.category === 'cosmetic' ? (
                      <SpritePreview kind="cosmetic" id={item.id as CosmeticId} size={26} />
                    ) : (
                      <SpritePreview kind="weapon" id={item.id} job={item.job} size={26} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{item.name}</div>
                    <div className="text-[10px] text-zinc-300 truncate">{item.subLabel}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full min-h-[44px] rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold text-[#121216] hover:bg-amber-300 cursor-pointer"
        >
          Stash All
        </button>
      </div>
    </div>
  );
}

export function StarForceModal({
  weaponId,
  save,
  onAttemptStarForce,
  onClose,
}: {
  weaponId: string;
  save: PlayerSaveState;
  onAttemptStarForce: (
    weaponId: string,
    caughtGreenZone: boolean
  ) => { success: boolean; oldStars: number; newStars: number } | null;
  onClose: () => void;
}) {
  const def = WEAPONS.find((w) => w.id === weaponId);
  const owned = save.weapons[weaponId];

  const [phase, setPhase] = useState<'ready' | 'rolling' | 'result'>('ready');
  const [cursor, setCursor] = useState(50);
  const [caughtBonus, setCaughtBonus] = useState(false);
  const [outcome, setOutcome] = useState<{
    success: boolean;
    oldStars: number;
    newStars: number;
  } | null>(null);

  const cursorRef = useRef(50);
  const dirRef = useRef(1);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== 'ready') return;
    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let next = cursorRef.current + dirRef.current * 135 * dt;
      if (next >= 100) {
        next = 100;
        dirRef.current = -1;
      } else if (next <= 0) {
        next = 0;
        dirRef.current = 1;
      }
      cursorRef.current = next;
      setCursor(next);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!def || !owned?.unlocked) return null;

  const currentStars = owned.stars || 0;
  const isMaxed = currentStars >= 15;
  const cfg = getStarForceConfig(currentStars);
  const curAtkPct = getWeaponAtkPct(def, owned);
  const nextAtkPct = isMaxed
    ? curAtkPct
    : getWeaponAtkPct(def, { ...owned, stars: currentStars + 1 });
  const canAfford = !isMaxed && save.mesos >= cfg.mesoCost && save.starStones >= cfg.stoneCost;
  const meta = RARITY_META[def.rarity];

  const handleEnhance = () => {
    if (phase !== 'ready' || !canAfford || isMaxed) return;
    const hitGreen = cursorRef.current >= 38 && cursorRef.current <= 62;
    setCaughtBonus(hitGreen);
    setPhase('rolling');
    setOutcome(null);
    sfx.unlock();
    sfx.playStarForceDrumroll();

    timerRef.current = window.setTimeout(() => {
      const res = onAttemptStarForce(weaponId, hitGreen);
      if (res) {
        sfx.playStarForceResult(res.success);
        setOutcome(res);
        setPhase('result');
      } else {
        setPhase('ready');
      }
    }, 850);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121216]/92 p-4">
      <div className={`w-full max-w-xs rounded-xl border ${meta.border} bg-[#1a1920] p-4 shadow-2xl`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            <h2 className="font-display text-base font-bold text-white">Black Market Heat Tuning</h2>
          </div>
          <button
            type="button"
            disabled={phase === 'rolling'}
            onClick={onClose}
            aria-label="Close Heat Tuning"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Weapon Header + Star Row */}
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#121216] p-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-[#1a1920]">
            <SpritePreview kind="weapon" id={def.id} job={def.job} size={32} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">{def.name}</div>
            <div className="font-mono-num text-[11px] font-bold text-amber-300">
              {currentStars}★ {!isMaxed && `-> ${currentStars + 1}★`}
            </div>
            <div className="font-mono-num text-[10px] text-emerald-400">
              +{formatNum(curAtkPct)}% ATK {!isMaxed && `-> +${formatNum(nextAtkPct)}%`}
            </div>
          </div>
        </div>

        {/* 15 Star Visual Track */}
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1">
          {Array.from({ length: 15 }, (_, idx) => {
            const filled = idx < currentStars;
            return (
              <Star
                key={idx}
                className={`w-3.5 h-3.5 ${
                  filled ? 'fill-amber-400 text-amber-300' : 'text-zinc-700'
                }`}
              />
            );
          })}
        </div>

        {!isMaxed ? (
          <>
            {/* Success Chance & Cost */}
            <div className="mt-3 space-y-1.5 rounded-lg border border-zinc-800 bg-[#121216] p-2.5 font-mono-num text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-400">Tuning Odds</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>{cfg.successPct}%</span>
                  <span className="text-[10px] text-amber-300">(+5% Lockpick)</span>
                  {cfg.bonusPct > 0 && (
                    <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 text-[9px] text-emerald-200">
                      +{cfg.bonusPct}% Event
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Dirty Cash Cost</span>
                <span className={save.mesos >= cfg.mesoCost ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
                  ${formatNum(cfg.mesoCost)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Mod Parts</span>
                <span className={save.starStones >= cfg.stoneCost ? 'font-bold text-amber-200' : 'font-bold text-rose-400'}>
                  {save.starStones} / {cfg.stoneCost}
                </span>
              </div>
              {cfg.canDropOnFail && (
                <div className="text-[10px] text-rose-400 text-center pt-0.5 border-t border-zinc-800">
                  Warning: Failure above 10★ drops 1 Star!
                </div>
              )}
            </div>

            {/* Pick the Lock Stop-Bar Minigame */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                <span className="text-zinc-300">Pick the Lock (+5% Bonus)</span>
                {phase !== 'ready' && (
                  <span className={caughtBonus ? 'text-emerald-400' : 'text-zinc-400'}>
                    {caughtBonus ? '+5% Picked!' : 'Missed Sweet Spot'}
                  </span>
                )}
              </div>
              <div className="relative h-5 w-full rounded-md border border-zinc-700 bg-[#121216] overflow-hidden">
                {/* Green Target Zone 38..62 */}
                <div
                  className="absolute inset-y-0 bg-emerald-500/35 border-x border-emerald-400"
                  style={{ left: '38%', width: '24%' }}
                />
                {/* Moving Tumbler Cursor */}
                <div
                  className="absolute top-0.5 bottom-0.5 w-2 -ml-1 rounded-sm bg-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                  style={{ left: `${cursor}%` }}
                />
              </div>
            </div>

            {/* Result Feedback Banner */}
            {phase === 'rolling' && (
              <div className="mt-3 rounded-lg border border-amber-400/60 bg-amber-950/40 py-2 text-center font-display text-xs font-bold text-amber-200 animate-pulse">
                Tuning Hardware...
              </div>
            )}

            {phase === 'result' && outcome && (
              <div
                className={`mt-3 animate-gacha-pop rounded-lg border py-2 px-3 text-center ${
                  outcome.success
                    ? 'border-emerald-400 bg-emerald-950/70 text-emerald-200'
                    : 'border-rose-500 bg-rose-950/70 text-rose-200'
                }`}
              >
                <div className="font-display text-sm font-bold">
                  {outcome.success ? '★ TUNED! ★' : 'JAMMED'}
                </div>
                <div className="font-mono-num text-[11px]">
                  {outcome.success
                    ? `${outcome.oldStars}★ -> ${outcome.newStars}★`
                    : outcome.newStars < outcome.oldStars
                      ? `Spec dropped: ${outcome.oldStars}★ -> ${outcome.newStars}★`
                      : `Heat preserved at ${outcome.newStars}★`}
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="mt-3">
              {phase === 'result' ? (
                <button
                  type="button"
                  onClick={() => setPhase('ready')}
                  className="w-full min-h-[42px] rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold text-[#121216] hover:bg-amber-300 cursor-pointer"
                >
                  Re-tune
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canAfford || phase === 'rolling'}
                  onClick={handleEnhance}
                  className={`w-full min-h-[42px] rounded-lg px-4 py-2 font-display text-sm font-bold transition-colors ${
                    canAfford && phase === 'ready'
                      ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-[#121216] hover:brightness-110 cursor-pointer'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {phase === 'rolling' ? 'Machining...' : 'TUNE ★'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-400/60 bg-emerald-950/50 p-3 text-center">
            <div className="font-display text-sm font-bold text-emerald-300">
              Peak 15★ Street Spec Reached!
            </div>
            <div className="mt-1 text-xs text-zinc-300">
              This piece is tuned to maximum Syndicate heat.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PauseModal({
  stage,
  level,
  job,
  monstersKilled,
  onResume,
  onTitle,
  onResetSave,
}: {
  stage: number;
  level: number;
  job: JobId;
  monstersKilled: number;
  onResume: () => void;
  onTitle: () => void;
  onResetSave: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121216]/90 p-4">
      <div className="w-full max-w-xs rounded-xl border border-zinc-700 bg-[#1a1920] p-4 shadow-2xl">
        <h2 className="font-display text-base font-bold text-white">Syndicate Paused</h2>
        <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-[#121216] p-3 font-mono-num text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-400">Capo Level</span>
            <span className="text-white font-bold">
              Lv.{level} ({JOBS[job].name})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Current Block</span>
            <span className="text-amber-300 font-bold">Block {stage}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Rivals Whacked</span>
            <span className="text-emerald-400 font-bold">{formatNum(monstersKilled)}</span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[44px] rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold text-[#121216] hover:bg-amber-300 cursor-pointer"
          >
            Resume Operations
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="w-full min-h-[40px] rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
          >
            Return to Title Screen
          </button>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#8B1E24] bg-[#8B1E24]/30 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-[#8B1E24]/50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Wipe Empire Save</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="flex-1 min-h-[40px] rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onResetSave}
                className="flex-1 min-h-[40px] rounded-lg bg-[#8B1E24] px-3 py-2 text-xs font-bold text-white cursor-pointer"
              >
                Confirm Wipe
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CONSTELLATION_BG_STARS = [
  { x: 10, y: 12, r: 0.7 },
  { x: 32, y: 9, r: 0.5 },
  { x: 68, y: 11, r: 0.6 },
  { x: 91, y: 18, r: 0.8 },
  { x: 8, y: 52, r: 0.6 },
  { x: 48, y: 36, r: 0.5 },
  { x: 92, y: 60, r: 0.6 },
  { x: 14, y: 86, r: 0.7 },
  { x: 52, y: 84, r: 0.6 },
  { x: 88, y: 85, r: 0.5 },
];

export function TranscendenceModal({
  save,
  onUpgradeSkill,
  onConfirmTranscend,
  onClose,
}: {
  save: PlayerSaveState;
  onUpgradeSkill: (id: TranscendSkillId) => void;
  onConfirmTranscend: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<TranscendSkillId>('greed_pig');
  const [confirmReset, setConfirmReset] = useState(false);

  const skillIds = Object.keys(TRANSCEND_SKILLS) as TranscendSkillId[];
  const selectedDef = TRANSCEND_SKILLS[selectedId];
  const selectedLv = save.transcendSkills?.[selectedId] || 0;
  const selectedMaxed = selectedLv >= selectedDef.maxLevel;
  const selectedCost = getTranscendSkillCost(selectedId, selectedLv);
  const canUpgradeSelected = canUpgradeTranscendSkill(save, selectedId);

  const transcendReady = isTranscendUnlocked(save);
  const pendingSymbols = computePendingArcaneSymbols(save);
  const projectedHighest = Math.max(save.highestStageCleared || 0, Math.max(0, save.stage - 1));
  const fastTrackActive = (save.transcendSkills?.fast_track || 0) > 0;
  const startStage = fastTrackActive ? Math.max(1, Math.floor(projectedHighest * 0.5)) : 1;
  const startZone = getZoneForStage(startStage);

  const parentRequirementMet =
    !selectedDef.requires ||
    selectedDef.requires.some((reqId) => (save.transcendSkills?.[reqId] || 0) > 0);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121216]/94 p-3">
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-[#8B1E24] bg-[#1a1920] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-3.5 py-2.5 bg-gradient-to-r from-[#8B1E24]/50 to-[#1a1920]">
          <div className="flex items-center gap-2 min-w-0">
            <Orbit className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-white truncate">
                Go to the Mattresses · Conspiracy Board
              </h2>
              <div className="font-mono-num text-[10px] text-amber-300">
                {formatNum(save.arcaneSymbols)} Omertà Seals · New Identity #{save.transcendCount}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Conspiracy Board"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="hud-scroll flex-1 overflow-y-auto p-3 space-y-2.5">
          {/* Interactive Noir Corkboard & Crimson Yarn Node Graph */}
          <div className="relative h-48 w-full overflow-hidden rounded-lg border border-amber-500/35 bg-gradient-to-b from-[#181414] via-[#221616] to-[#261818]">
            <svg
              viewBox="0 0 100 92"
              className="h-full w-full select-none"
              aria-label="Conspiracy Board Skill Tree"
            >
              {/* Background corkboard pins */}
              {CONSTELLATION_BG_STARS.map((st, idx) => (
                <circle
                  key={idx}
                  cx={st.x}
                  cy={st.y}
                  r={st.r}
                  fill="#78716c"
                  opacity="0.35"
                />
              ))}

              {/* Crimson Yarn Edges */}
              {TRANSCEND_EDGES.map(([fromId, toId]) => {
                const a = TRANSCEND_SKILLS[fromId];
                const b = TRANSCEND_SKILLS[toId];
                const lit =
                  (save.transcendSkills?.[fromId] || 0) > 0 &&
                  (save.transcendSkills?.[toId] || 0) > 0;
                const partial =
                  (save.transcendSkills?.[fromId] || 0) > 0 ||
                  (save.transcendSkills?.[toId] || 0) > 0;
                return (
                  <line
                    key={`${fromId}_${toId}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={lit ? '#ef4444' : partial ? '#8B1E24' : '#3f3f46'}
                    strokeWidth={lit ? 1.25 : 0.85}
                    strokeDasharray={lit ? undefined : '2 1.5'}
                    opacity={lit ? 0.95 : 0.75}
                  />
                );
              })}

              {/* Conspiracy Pushpin Nodes */}
              {skillIds.map((id) => {
                const def = TRANSCEND_SKILLS[id];
                const lv = save.transcendSkills?.[id] || 0;
                const isSelected = selectedId === id;
                const isMaxed = lv >= def.maxLevel;
                const affordable = canUpgradeTranscendSkill(save, id);
                const radius = def.isCapstone ? 7.2 : 6;

                return (
                  <g
                    key={id}
                    onClick={() => setSelectedId(id)}
                    className="cursor-pointer"
                  >
                    {(isSelected || affordable) && (
                      <circle
                        cx={def.x}
                        cy={def.y}
                        r={radius + 2.5}
                        fill="none"
                        stroke={isSelected ? '#fbbf24' : '#10b981'}
                        strokeWidth="0.9"
                        opacity="0.85"
                      />
                    )}
                    <circle
                      cx={def.x}
                      cy={def.y}
                      r={radius}
                      fill={
                        isMaxed
                          ? '#f59e0b'
                          : lv > 0
                            ? '#8B1E24'
                            : '#18181b'
                      }
                      stroke={
                        isSelected
                          ? '#fef08a'
                          : lv > 0
                            ? '#f87171'
                            : '#52525b'
                      }
                      strokeWidth="1"
                    />
                    <text
                      x={def.x}
                      y={def.y + 1.4}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="4.1"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {lv}/{def.maxLevel}
                    </text>
                    <text
                      x={def.x}
                      y={def.y + radius + 5}
                      textAnchor="middle"
                      fill={isSelected ? '#fde047' : '#d4d4d8'}
                      fontSize="3.6"
                      fontWeight="bold"
                    >
                      {def.shortName}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Node Inspector */}
          <div className="rounded-lg border border-zinc-700/80 bg-[#121216] p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span className="truncate">{selectedDef.name}</span>
                  <span className="font-mono-num text-[10px] text-amber-300 shrink-0">
                    Lv.{selectedLv}/{selectedDef.maxLevel}
                  </span>
                </div>
                <div className="mt-0.5 font-mono-num text-[11px] font-semibold text-emerald-400">
                  {selectedDef.effectPerLvLabel}
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-400 leading-snug">
                  {selectedDef.desc}
                </p>
                {!parentRequirementMet && (
                  <p className="mt-1 text-[10px] font-semibold text-rose-400">
                    Requires Black Market Contacts or Bribed Detectives Lv.1+
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={!canUpgradeSelected}
                onClick={() => {
                  sfx.unlock();
                  sfx.playQuestClaim();
                  onUpgradeSkill(selectedId);
                }}
                className={`min-h-[38px] rounded-lg px-2.5 py-1.5 font-mono-num text-[11px] font-bold whitespace-nowrap shrink-0 ${
                  selectedMaxed
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : canUpgradeSelected
                      ? 'bg-amber-400 text-[#121216] hover:bg-amber-300 cursor-pointer'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {selectedMaxed ? 'Maxed' : `Wire (${formatNum(selectedCost)})`}
              </button>
            </div>
          </div>

          {/* Prestige Action */}
          <div className="rounded-lg border border-amber-500/50 bg-gradient-to-b from-[#8B1E24]/30 to-[#121216] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-200">New Identity Payout</span>
              <span className="font-mono-num font-bold text-amber-300">
                +{formatNum(pendingSymbols)} Omertà Seals
              </span>
            </div>

            <div className="text-[10px] text-zinc-300 leading-relaxed space-y-0.5">
              <div>
                <span className="text-rose-400 font-semibold">Resets:</span>{' '}
                Block ({startZone.worldLabel}-1), Capo Level (Lv.1), Cash Upgrades.
              </div>
              <div>
                <span className="text-emerald-400 font-semibold">Keeps Forever:</span>{' '}
                Arsenal, Heat Tuning, Crew, Tailor Shop, Relics, Gold Bars & Hierarchy.
              </div>
            </div>

            {!transcendReady ? (
              <div className="rounded-md bg-[#1a1920] py-2 text-center text-xs font-bold text-zinc-400 border border-zinc-800">
                Clear Block 30 to Unlock Go to the Mattresses
              </div>
            ) : !confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full min-h-[42px] rounded-lg bg-gradient-to-r from-amber-400 via-amber-500 to-rose-600 px-4 py-2 font-display text-sm font-bold text-[#121216] hover:brightness-110 cursor-pointer"
              >
                Start New Identity (+{formatNum(pendingSymbols)} Seals)
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 min-h-[40px] rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConfirmTranscend();
                    onClose();
                  }}
                  className="flex-1 min-h-[40px] rounded-lg bg-gradient-to-r from-amber-400 to-rose-600 px-3 py-2 font-display text-xs font-bold text-[#121216] cursor-pointer"
                >
                  Confirm New Identity
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerProfileModal({
  save,
  networkMode,
  hasLiveCreds,
  isFirstTime,
  onSaveProfile,
  onClose,
}: {
  save: PlayerSaveState;
  networkMode: NetworkMode;
  hasLiveCreds: boolean;
  isFirstTime: boolean;
  onSaveProfile: (
    input: {
      ign: string;
      clanTag: string;
      emblem: ProfileEmblemId;
      border: ProfileBorderId;
      playerId: string;
    },
    mode: NetworkMode
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [ign, setIgn] = useState(save.profile?.ign || 'Capo');
  const [clanTag, setClanTag] = useState(save.profile?.clanTag || 'SYND');
  const [emblem, setEmblem] = useState<ProfileEmblemId>(save.profile?.emblem || 'maple_leaf');
  const [border, setBorder] = useState<ProfileBorderId>(save.profile?.border || 'bronze');
  const [playerId, setPlayerId] = useState(
    save.profile?.playerId || generateSecurePlayerId()
  );
  const [selectedMode, setSelectedMode] = useState<NetworkMode>(networkMode);
  const [saving, setSaving] = useState(false);

  const borderMeta = PROFILE_BORDERS[border];
  const emblemMeta = PROFILE_EMBLEMS[emblem];
  const emblemIds = Object.keys(PROFILE_EMBLEMS) as ProfileEmblemId[];
  const borderIds = Object.keys(PROFILE_BORDERS) as ProfileBorderId[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    await onSaveProfile({ ign, clanTag, emblem, border, playerId }, selectedMode);
    setSaving(false);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#121216]/94 p-3">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-amber-500/70 bg-[#1a1920] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-[#1a1920]">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-sm font-bold text-white">
              Made Man Profile & Cloud Sync
            </h2>
          </div>
          {!isFirstTime && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Profile"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="hud-scroll flex-1 overflow-y-auto p-3.5 space-y-3">
          {/* Live Card Preview */}
          <div className={`flex items-center gap-3 rounded-xl border-2 p-2.5 ${borderMeta.borderClass} ${borderMeta.bgClass}`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-[#121216]">
              <SpritePreview
                kind="hero"
                id={save.job}
                weaponId={save.equippedWeaponByJob[save.job]}
                cosmetics={save.equippedCosmetics}
                size={38}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                <span aria-hidden="true">{emblemMeta.badge}</span>
                <span className="font-mono-num text-xs text-amber-300">
                  [{clanTag.trim().toUpperCase().slice(0, 4) || 'SYND'}]
                </span>
                <span className="truncate">{ign.trim() || 'Capo'}</span>
              </div>
              <div className="mt-0.5 font-mono-num text-[10px] text-zinc-300 truncate">
                ID: {playerId}
              </div>
            </div>
          </div>

          {/* Street Alias & Family Tag */}
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="text-[11px] font-bold text-zinc-300">Street Alias (IGN)</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={14}
                value={ign}
                onChange={(e) => setIgn(e.target.value)}
                placeholder="Capo"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#121216] px-2.5 py-2 text-[16px] font-bold text-white focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-zinc-300">Family Tag</span>
              <input
                type="text"
                maxLength={4}
                value={clanTag}
                onChange={(e) => setClanTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="SYND"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#121216] px-2.5 py-2 font-mono-num text-[16px] font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
              />
            </label>
          </div>

          {/* Secure Player ID */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#121216] px-2.5 py-2 text-[10px]">
            <div className="min-w-0">
              <div className="text-zinc-400">Encrypted Ledger ID</div>
              <div className="font-mono-num font-bold text-amber-300 truncate">{playerId}</div>
            </div>
            <button
              type="button"
              onClick={() => setPlayerId(generateSecurePlayerId())}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-200 hover:border-amber-400 cursor-pointer shrink-0"
            >
              Regenerate
            </button>
          </div>

          {/* Emblem Picker */}
          <div>
            <div className="text-[11px] font-bold text-zinc-300 mb-1.5">Select Signet</div>
            <div className="grid grid-cols-3 gap-1.5">
              {emblemIds.map((eid) => {
                const em = PROFILE_EMBLEMS[eid];
                const active = emblem === eid;
                return (
                  <button
                    key={eid}
                    type="button"
                    onClick={() => setEmblem(eid)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold cursor-pointer ${
                      active
                        ? 'border-amber-400 bg-amber-950/50 text-white'
                        : 'border-zinc-800 bg-[#121216] text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    <span aria-hidden="true">{em.badge}</span>
                    <span className="truncate">{em.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Border Picker */}
          <div>
            <div className="text-[11px] font-bold text-zinc-300 mb-1.5">Select Dossier Frame</div>
            <div className="grid grid-cols-5 gap-1.5">
              {borderIds.map((bid) => {
                const bm = PROFILE_BORDERS[bid];
                const active = border === bid;
                return (
                  <button
                    key={bid}
                    type="button"
                    onClick={() => setBorder(bid)}
                    className={`rounded-lg border-2 py-1.5 text-center text-[10px] font-bold cursor-pointer ${bm.borderClass} ${bm.bgClass} ${
                      active ? 'ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    <span className={bm.textClass}>{bm.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Network Mode Toggle */}
          <div className="rounded-lg border border-zinc-800 bg-[#121216] p-2.5">
            <div className="text-[11px] font-bold text-zinc-200 mb-1.5">Cloud Wire Mode</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMode('SANDBOX')}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-bold cursor-pointer ${
                  selectedMode === 'SANDBOX'
                    ? 'border-amber-400 bg-amber-950/50 text-amber-200'
                    : 'border-zinc-800 bg-[#1a1920] text-zinc-400'
                }`}
              >
                Local Ledger
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('LIVE')}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-bold cursor-pointer ${
                  selectedMode === 'LIVE'
                    ? 'border-emerald-400 bg-emerald-950/60 text-emerald-200'
                    : 'border-zinc-800 bg-[#1a1920] text-zinc-400'
                }`}
              >
                Live Wire
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-zinc-400 leading-snug">
              {selectedMode === 'SANDBOX'
                ? 'Runs locally with synced real player dossiers and ledger checksum validation — zero bots.'
                : hasLiveCreds
                  ? 'Connected to configured Supabase wire for real-time dossiers and Fight Club matchmaking.'
                  : 'Paste SUPABASE_URL & SUPABASE_ANON_KEY in network.ts to sync live; falls back safely here.'}
            </p>
          </div>
        </div>

        <div className="border-t border-zinc-800 p-3 bg-[#1a1920]">
          <button
            type="submit"
            disabled={saving || ign.trim().length < 2}
            className="w-full min-h-[44px] rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2 font-display text-sm font-bold text-[#121216] hover:brightness-110 cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Connecting & Syncing...' : 'Save Profile & Enter the Underworld'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function WagerEscrowModal({
  save,
  opponent,
  onSendLiveChallenge,
  onLaunchDuel,
  onClose,
}: {
  save: PlayerSaveState;
  opponent: ArenaOpponent;
  onSendLiveChallenge: (currency: ArenaCurrency, stake: number) => Promise<LiveChallengeResponse>;
  onLaunchDuel: (duelType: DuelType, currency: ArenaCurrency, stake: number) => void;
  onClose: () => void;
}) {
  const [duelType, setDuelType] = useState<DuelType>('SNAPSHOT');
  const [currency, setCurrency] = useState<ArenaCurrency>('diamonds');
  const [tier, setTier] = useState<WagerTier>(500);
  const [escrowStage, setEscrowStage] = useState<'setup' | 'inviting' | 'locked'>('setup');
  const [escrowMsg, setEscrowMsg] = useState('');

  const myStats = computeStats(save);
  const myBalance =
    currency === 'diamonds'
      ? save.diamonds
      : currency === 'chaosCores'
        ? save.chaosCores
        : save.honorCoins;

  const resolvedStake = tier === 'ALL_IN' ? Math.floor(myBalance) : tier;
  const isTainted = Boolean(save.tainted);
  const canAfford = !isTainted && resolvedStake > 0 && myBalance >= resolvedStake;

  const liveOpsBonuses = getEffectiveLiveOpsBonuses();
  const effectiveFeePct =
    duelType === 'SNAPSHOT'
      ? Math.max(0, ARENA_HOUSE_FEE_PCT - liveOpsBonuses.wagerRakeDiscount)
      : 0;
  const pot = resolvedStake * 2;
  const houseFee = Math.floor((pot * effectiveFeePct) / 100);
  const basePayout = Math.max(0, pot - houseFee);
  const wagerBonusPct = myStats.wagerBonusPct || 0;
  const shrineBonus = resolvedStake > 0 ? Math.floor((basePayout * wagerBonusPct) / 100) : 0;
  const winPayout = basePayout + shrineBonus;
  const curMeta = ARENA_CURRENCY_META[currency];

  const handleLockAndBattle = async () => {
    if (!canAfford || isTainted) return;
    if (duelType === 'SNAPSHOT') {
      onLaunchDuel('SNAPSHOT', currency, resolvedStake);
      return;
    }

    setEscrowStage('inviting');
    setEscrowMsg(`Sending live fight callout to [${opponent.clanTag}] ${opponent.ign}...`);
    const res = await onSendLiveChallenge(currency, resolvedStake);
    if (res.accepted) {
      setEscrowStage('locked');
      setEscrowMsg(res.message);
    } else {
      setEscrowStage('setup');
      setEscrowMsg(res.message);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#121216]/92 p-3">
      <div className="w-full max-w-sm rounded-xl border border-[#8B1E24] bg-[#1a1920] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-300" />
            <h2 className="font-display text-base font-bold text-white">Backroom Wager Escrow</h2>
          </div>
          <button
            type="button"
            disabled={escrowStage === 'inviting'}
            onClick={onClose}
            aria-label="Close Escrow"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Face-Off Matchup */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-[#121216] p-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <SpritePreview
              kind="hero"
              id={save.job}
              weaponId={save.equippedWeaponByJob[save.job]}
              cosmetics={save.equippedCosmetics}
              size={34}
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-emerald-400 truncate">
                {save.profile?.ign || 'You'}
              </div>
              <div className="font-mono-num text-[10px] text-zinc-400">
                CP {formatNum(myStats.combatPower)}
              </div>
            </div>
          </div>

          <span className="font-display text-xs font-bold text-amber-300 shrink-0">VS</span>

          <div className="flex items-center gap-2 min-w-0 text-right">
            <div className="min-w-0">
              <div className="text-xs font-bold text-rose-400 truncate">
                {opponent.ign}
              </div>
              <div className="font-mono-num text-[10px] text-zinc-400">
                CP {formatNum(opponent.combatPower)}
              </div>
            </div>
            <SpritePreview
              kind="hero"
              id={opponent.job}
              weaponId={opponent.equippedWeaponId}
              cosmetics={opponent.equippedCosmetics}
              size={34}
            />
          </div>
        </div>

        {/* Duel Format Selector */}
        <div className="mt-3">
          <div className="text-[11px] font-bold text-zinc-300 mb-1">Bout Format</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={escrowStage !== 'setup'}
              onClick={() => setDuelType('SNAPSHOT')}
              className={`rounded-lg border px-2 py-2 text-left cursor-pointer ${
                duelType === 'SNAPSHOT'
                  ? 'border-amber-400 bg-amber-950/50 text-white'
                  : 'border-zinc-800 bg-[#121216] text-zinc-400'
              }`}
            >
              <div className="text-xs font-bold">Backroom Snapshot</div>
              <div className="text-[10px] text-zinc-300">
                Fight immediately · {Math.max(0, ARENA_HOUSE_FEE_PCT - liveOpsBonuses.wagerRakeDiscount)}% Rake
              </div>
            </button>
            <button
              type="button"
              disabled={escrowStage !== 'setup'}
              onClick={() => setDuelType('LIVE_INVITE')}
              className={`rounded-lg border px-2 py-2 text-left cursor-pointer ${
                duelType === 'LIVE_INVITE'
                  ? 'border-rose-400 bg-[#8B1E24]/40 text-white'
                  : 'border-zinc-800 bg-[#121216] text-zinc-400'
              }`}
            >
              <div className="text-xs font-bold">Live Callout</div>
              <div className="text-[10px] text-zinc-300">Dual Escrow · 0% Rake</div>
            </button>
          </div>
        </div>

        {/* Currency Selector */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-bold mb-1">
            <span className="text-zinc-300">Stake Asset</span>
            <span className={`font-mono-num ${curMeta.textClass}`}>
              Stash: {formatNum(myBalance)} {curMeta.short}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['diamonds', 'honorCoins', 'chaosCores'] as ArenaCurrency[]).map((c) => {
              const m = ARENA_CURRENCY_META[c];
              const active = currency === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={escrowStage !== 'setup'}
                  onClick={() => setCurrency(c)}
                  className={`rounded-lg border py-1.5 px-1 text-[11px] font-bold cursor-pointer ${
                    active
                      ? 'border-amber-400 bg-amber-950/50 text-white'
                      : 'border-zinc-800 bg-[#121216] text-zinc-400'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preset Wager Tiers */}
        <div className="mt-3">
          <div className="text-[11px] font-bold text-zinc-300 mb-1">Stake Tier</div>
          <div className="grid grid-cols-4 gap-1.5">
            {([100, 500, 2500, 'ALL_IN'] as WagerTier[]).map((t) => {
              const active = tier === t;
              const label = t === 'ALL_IN' ? 'ALL-IN' : formatNum(t);
              return (
                <button
                  key={String(t)}
                  type="button"
                  disabled={escrowStage !== 'setup'}
                  onClick={() => setTier(t)}
                  className={`min-h-[38px] rounded-lg border font-mono-num text-xs font-bold cursor-pointer ${
                    active
                      ? t === 'ALL_IN'
                        ? 'border-rose-400 bg-[#8B1E24]/60 text-rose-200'
                        : 'border-amber-400 bg-amber-950/60 text-amber-200'
                      : 'border-zinc-800 bg-[#121216] text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Payout Breakdown */}
        <div className="mt-3 space-y-1 rounded-lg border border-zinc-800 bg-[#121216] p-2.5 font-mono-num text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-400">Your Locked Stake</span>
            <span className={canAfford ? 'font-bold text-white' : 'font-bold text-rose-400'}>
              {formatNum(resolvedStake)} {curMeta.short}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Fight Club House Fee</span>
            <span className="text-zinc-300">
              {duelType === 'SNAPSHOT'
                ? effectiveFeePct === 0
                  ? '0 (Event 0% Rake!)'
                  : `-${formatNum(houseFee)} (${effectiveFeePct}%)`
                : '0 (Live Escrow)'}
            </span>
          </div>
          {wagerBonusPct > 0 && (
            <div className="flex justify-between">
              <span className="text-emerald-400">Front Business Bonus (+{wagerBonusPct}%)</span>
              <span className="font-bold text-emerald-400">
                +{formatNum(shrineBonus)} {curMeta.short}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-800 pt-1">
            <span className="text-emerald-400 font-bold">Victory Payout</span>
            <span className={`font-bold ${curMeta.textClass}`}>
              +{formatNum(winPayout)} {curMeta.label}
            </span>
          </div>
        </div>

        {escrowMsg && (
          <div className="mt-2.5 rounded-lg border border-amber-500/50 bg-amber-950/40 px-2.5 py-2 text-center text-xs font-bold text-amber-200">
            {escrowMsg}
          </div>
        )}

        <div className="mt-3">
          {escrowStage === 'locked' ? (
            <button
              type="button"
              onClick={() => onLaunchDuel(duelType, currency, resolvedStake)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 font-display text-sm font-bold text-[#121216] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Enter Underground Fight Club</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!canAfford || escrowStage === 'inviting'}
              onClick={handleLockAndBattle}
              className={`w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-bold transition-colors ${
                canAfford && escrowStage === 'setup'
                  ? 'bg-gradient-to-b from-rose-600 to-[#8B1E24] text-white hover:brightness-110 cursor-pointer'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Swords className="w-4 h-4" />
              <span>
                {escrowStage === 'inviting'
                  ? 'Locking Escrow...'
                  : duelType === 'LIVE_INVITE'
                    ? 'Send Live Callout'
                    : 'Lock Stake & Fight'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArenaResultModal({
  match,
  onReturnLobby,
  onRematch,
}: {
  match: ArenaMatchResult;
  onReturnLobby: () => void;
  onRematch: () => void;
}) {
  const [chartTab, setChartTab] = useState<'player' | 'rival'>('player');
  const isWin = match.winner === 'player';
  const curMeta = ARENA_CURRENCY_META[match.currency];
  const entries = chartTab === 'player' ? match.playerBreakdown : match.rivalBreakdown;
  const totalDmg = Math.max(
    1,
    chartTab === 'player' ? match.playerTotalDmg : match.rivalTotalDmg
  );

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#121216]/94 p-3">
      <div
        className={`flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border-2 bg-[#1a1920] shadow-2xl ${
          isWin ? 'border-amber-400' : 'border-[#8B1E24]'
        }`}
      >
        {/* Dramatic Victory / Defeat Headline */}
        <div
          className={`px-4 py-3 text-center ${
            isWin
              ? 'bg-gradient-to-b from-amber-500/25 to-[#1a1920]'
              : 'bg-gradient-to-b from-[#8B1E24]/45 to-[#1a1920]'
          }`}
        >
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-300">
            {isWin ? (
              <Trophy className="w-4 h-4 text-amber-300" />
            ) : (
              <Shield className="w-4 h-4 text-rose-400" />
            )}
            <span>Underground Fight Club · {match.durationSec.toFixed(1)}s</span>
          </div>

          <h2
            className={`mt-1 font-display text-lg font-bold tracking-wide ${
              isWin ? 'text-amber-300' : 'text-rose-400'
            }`}
          >
            {isWin
              ? `VICTORY — +${formatNum(match.payout)} ${curMeta.label.toUpperCase()} WON`
              : `DEFEAT — -${formatNum(match.stake)} ${curMeta.label.toUpperCase()} LOST`}
          </h2>
          <p className="mt-0.5 font-mono-num text-[11px] text-zinc-300">
            vs [{match.rival.clanTag}] {match.rival.ign} ({JOBS[match.rival.job].name}) · Seed #{match.seed.toString(16).slice(0, 6)}
          </p>
        </div>

        <div className="hud-scroll flex-1 overflow-y-auto p-3.5 space-y-3">
          {/* Combat Telemetry Summary */}
          <div className="grid grid-cols-3 gap-2 text-center font-mono-num">
            <div className="rounded-lg border border-zinc-800 bg-[#121216] p-2">
              <div className="text-[10px] text-zinc-400">Your Damage</div>
              <div className="text-xs font-bold text-emerald-400">
                {formatNum(match.playerTotalDmg)}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-[#121216] p-2">
              <div className="text-[10px] text-zinc-400">Crits / Stuns</div>
              <div className="text-xs font-bold text-amber-300">
                {match.playerCrits} / {match.playerStuns}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-[#121216] p-2">
              <div className="text-[10px] text-zinc-400">Rival Damage</div>
              <div className="text-xs font-bold text-rose-400">
                {formatNum(match.rivalTotalDmg)}
              </div>
            </div>
          </div>

          {/* Damage / Skill Contribution Chart */}
          <div className="rounded-xl border border-zinc-800 bg-[#121216] p-3">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h3 className="text-xs font-bold text-white">Damage & Skill Breakdown</h3>
              <div className="flex rounded-md bg-[#1a1920] p-0.5 border border-zinc-800 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setChartTab('player')}
                  className={`rounded px-2 py-0.5 cursor-pointer ${
                    chartTab === 'player' ? 'bg-emerald-500 text-[#121216]' : 'text-zinc-400'
                  }`}
                >
                  You
                </button>
                <button
                  type="button"
                  onClick={() => setChartTab('rival')}
                  className={`rounded px-2 py-0.5 cursor-pointer ${
                    chartTab === 'rival' ? 'bg-[#8B1E24] text-white' : 'text-zinc-400'
                  }`}
                >
                  {match.rival.ign.slice(0, 8)}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {entries.map((e) => {
                const pct = Math.min(100, Math.round((e.totalDmg / totalDmg) * 100));
                return (
                  <div key={`${chartTab}_${e.sourceName}`}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-semibold text-zinc-200 truncate">
                        {e.sourceName}{' '}
                        <span className="font-mono-num text-[10px] text-zinc-400">
                          ({e.hits}x · {e.crits} crit)
                        </span>
                      </span>
                      <span className="font-mono-num font-bold text-white shrink-0 ml-2">
                        {formatNum(e.totalDmg)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
                      <div
                        className="h-full rounded-sm transition-[width] duration-300"
                        style={{ width: `${Math.max(4, pct)}%`, backgroundColor: e.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-zinc-800 p-3 bg-[#1a1920]">
          <button
            type="button"
            onClick={onReturnLobby}
            className="flex-1 min-h-[42px] rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 font-display text-xs font-bold text-white hover:bg-zinc-700 cursor-pointer"
          >
            Return to Lobby
          </button>
          <button
            type="button"
            onClick={onRematch}
            className="flex-1 min-h-[42px] rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2 font-display text-xs font-bold text-[#121216] hover:brightness-110 cursor-pointer"
          >
            Rematch
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClanWarChestModal({
  war,
  onClaim,
  onClose,
}: {
  war: ClanWarState;
  onClaim: () => Promise<void>;
  onClose: () => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const reward = war.chestReward;
  if (!reward) return null;

  const relicDef = reward.mythicRelicId ? RELICS[reward.mythicRelicId] : null;
  const auraDef = reward.cosmeticAuraId ? COSMETICS[reward.cosmeticAuraId] : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#121216]/94 p-3">
      <div
        className={`flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border-2 bg-[#1a1920] shadow-2xl ${
          reward.won ? 'border-amber-400' : 'border-[#8B1E24]'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b border-zinc-800 px-4 py-3 ${
            reward.won
              ? 'bg-gradient-to-r from-amber-500/25 via-amber-700/20 to-[#1a1920]'
              : 'bg-gradient-to-r from-[#8B1E24]/35 to-[#1a1920]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className={`w-5 h-5 shrink-0 ${reward.won ? 'text-amber-300' : 'text-zinc-300'}`} />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {reward.won ? 'Turf War Spoils Crate!' : 'District Raid Chest'}
              </h2>
              <div className="font-mono-num text-[11px] text-zinc-300">
                {reward.lanesWon}/3 Districts Held · vs [{war.rivalClan.tag}]
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Turf Crate"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="hud-scroll flex-1 overflow-y-auto p-3.5 space-y-3">
          {/* Contribution Standing */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#121216] px-3 py-2 text-xs">
            <span className="text-zinc-300 font-semibold">Family Standing</span>
            <span className="font-mono-num font-bold text-amber-300">
              #{reward.contributionRank} · {reward.rankTier}
            </span>
          </div>

          {/* Bulk Currencies */}
          <div className="grid grid-cols-2 gap-2 font-mono-num">
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/35 p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-amber-300">
                <Gem className="w-3.5 h-3.5" />
                <span>Bulk Gold Bars</span>
              </div>
              <div className="mt-0.5 text-sm font-bold text-white">
                +{formatNum(reward.diamonds)}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/35 p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-300">
                <Shield className="w-3.5 h-3.5" />
                <span>Turf Medallions</span>
              </div>
              <div className="mt-0.5 text-sm font-bold text-white">
                +{formatNum(reward.warMedals)}
              </div>
            </div>
          </div>

          {/* Exclusive Mythic Loot */}
          {relicDef && (
            <div className="rounded-xl border border-amber-400/70 bg-gradient-to-r from-amber-950/45 to-[#121216] p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold mb-1.5">
                <span className="text-amber-300">MYTHIC HEIST RELIC</span>
                <span className="text-emerald-400">+{relicDef.atkPct}% ATK</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-400/60 bg-[#121216]">
                  <SpritePreview kind="relic" id={relicDef.id} size={30} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{relicDef.name}</div>
                  <div className="text-[10px] text-amber-200">{relicDef.passiveLabel}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{relicDef.desc}</div>
                </div>
              </div>
            </div>
          )}

          {auraDef && (
            <div className="rounded-xl border border-rose-500/70 bg-gradient-to-r from-[#8B1E24]/45 to-[#121216] p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold mb-1.5">
                <span className="text-rose-300">TURF MYTHIC COAT/AURA</span>
                <span className="text-emerald-400">
                  +{auraDef.bonusValue}% {auraDef.bonusType === 'atk_pct' ? 'ATK' : 'Crit DMG'}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-rose-400/60 bg-[#121216]">
                  <SpritePreview kind="cosmetic" id={auraDef.id} size={28} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{auraDef.name}</div>
                  <div className="text-[10px] text-zinc-300">
                    Equips live heat aura layer on your Capo!
                  </div>
                </div>
              </div>
            </div>
          )}

          {!relicDef && !auraDef && (
            <div className="rounded-lg border border-zinc-800 bg-[#121216] p-2.5 text-center text-[11px] text-zinc-400">
              Control 2+ city districts in your next Turf War to unlock exclusive Mythic Heist Relics & Turf Auras!
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 p-3 bg-[#1a1920]">
          <button
            type="button"
            disabled={reward.claimed || claiming}
            onClick={async () => {
              if (claiming || reward.claimed) return;
              setClaiming(true);
              await onClaim();
              setClaiming(false);
            }}
            className={`w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-bold ${
              reward.claimed
                ? 'bg-zinc-800 text-zinc-400 cursor-default'
                : 'bg-gradient-to-b from-amber-400 to-amber-600 text-[#121216] hover:brightness-110 cursor-pointer'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {reward.claimed ? 'Spoils Claimed' : claiming ? 'Cracking Crate...' : 'Claim Turf Crate'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({
  save,
  isSyncing,
  onChangeSfxVolume,
  onChangeBgmVolume,
  onToggleLowPower,
  onManualSync,
  onRedeemPromo,
  onClose,
}: {
  save: PlayerSaveState;
  isSyncing: boolean;
  onChangeSfxVolume: (v: number) => void;
  onChangeBgmVolume: (v: number) => void;
  onToggleLowPower: () => void;
  onManualSync: () => Promise<void>;
  onRedeemPromo: (code: string) => { ok: boolean; message: string };
  onClose: () => void;
}) {
  const [coupon, setCoupon] = useState('');
  const [couponStatus, setCouponStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    const idText = save.profile?.playerId || 'SYND-LOCAL-GUEST';
    try {
      await navigator.clipboard.writeText(idText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmitCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onRedeemPromo(coupon);
    setCouponStatus({ ok: res.ok, msg: res.message });
    if (res.ok) setCoupon('');
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#121216]/92 p-3">
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-zinc-700 bg-[#1a1920] shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-[#1a1920]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-sm font-bold text-white">Settings & Account</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="hud-scroll flex-1 overflow-y-auto p-3.5 space-y-3">
          {/* Audio Volume Sliders */}
          <div className="rounded-xl border border-zinc-800 bg-[#121216] p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Audio Mixer</span>
            </div>

            <label className="block">
              <div className="flex justify-between text-[11px] font-mono-num text-zinc-300 mb-1">
                <span>SFX Volume</span>
                <span>{Math.round((save.sfxVolume ?? 0.75) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((save.sfxVolume ?? 0.75) * 100)}
                onChange={(e) => onChangeSfxVolume(Number(e.target.value) / 100)}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-[11px] font-mono-num text-zinc-300 mb-1">
                <span>BGM Volume</span>
                <span>{Math.round((save.bgmVolume ?? 0.35) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((save.bgmVolume ?? 0.35) * 100)}
                onChange={(e) => onChangeBgmVolume(Number(e.target.value) / 100)}
                className="w-full accent-[#8B1E24] cursor-pointer"
              />
            </label>
          </div>

          {/* Performance Mode */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-[#121216] p-3">
            <div>
              <div className="text-xs font-bold text-white">Low-Power Mode (30 FPS)</div>
              <div className="text-[10px] text-zinc-400">
                Reduces battery drain & particle load on mobile
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleLowPower}
              className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                save.lowPowerMode
                  ? 'bg-emerald-500 text-[#121216]'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}
            >
              {save.lowPowerMode ? 'On (30Hz)' : 'Off (60Hz)'}
            </button>
          </div>

          {/* Account & Cloud Save */}
          <div className="rounded-xl border border-zinc-800 bg-[#121216] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">Syndicate ID</span>
              <span
                className={`font-mono-num text-[10px] font-bold ${
                  save.tainted ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {save.tainted ? 'Integrity Flagged' : 'Verified Clean'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-[#1a1920] px-2.5 py-2">
              <span className="font-mono-num text-xs font-bold text-amber-300 truncate">
                {save.profile?.playerId || 'SYND-LOCAL-GUEST'}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-200 hover:border-amber-400 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <button
              type="button"
              disabled={isSyncing}
              onClick={() => void onManualSync()}
              className="w-full min-h-[38px] rounded-lg border border-amber-500/60 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/50 cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? 'Syncing Cloud Dossier...' : 'Manual Cloud Save Now'}
            </button>
          </div>

          {/* LiveOps Wire Code Redemption */}
          <form
            onSubmit={handleSubmitCoupon}
            className="rounded-xl border border-amber-500/40 bg-[#121216] p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300">Redeem Syndicate Code</span>
              <span className="font-mono-num text-[10px] text-zinc-400">Try: SYNDICATE2025</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                maxLength={24}
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="Enter wire code..."
                className="flex-1 rounded-lg border border-zinc-700 bg-[#1a1920] px-2.5 py-1.5 font-mono-num text-[16px] font-bold text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!coupon.trim() || Boolean(save.tainted)}
                className="min-h-[38px] rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#121216] hover:bg-amber-300 cursor-pointer disabled:opacity-40"
              >
                Redeem
              </button>
            </div>
            {couponStatus && (
              <div
                className={`text-[11px] font-semibold ${
                  couponStatus.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {couponStatus.msg}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}


