import { Flame, Users, Zap } from 'lucide-react';
import { COMPANIONS, JOBS, RARITY_META } from '../game/constants';
import { formatNum } from '../game/progression';
import { CompanionId, LiveSnapshot, PlayerSaveState } from '../game/types';
import { SpritePreview } from './SpritePreview';

interface TabSkillsProps {
  save: PlayerSaveState;
  snapshot: LiveSnapshot;
  onToggleAutoSkills: () => void;
  onCastSkill: (skillId: string) => void;
  onUpgradeSkill: (skillId: string) => void;
  onToggleEquipCompanion: (cid: CompanionId) => void;
  onLevelUpCompanion: (cid: CompanionId) => void;
}

export function TabSkills({
  save,
  snapshot,
  onToggleAutoSkills,
  onCastSkill,
  onUpgradeSkill,
  onToggleEquipCompanion,
  onLevelUpCompanion,
}: TabSkillsProps) {
  const job = JOBS[save.job];
  const compIds = Object.keys(COMPANIONS) as CompanionId[];

  return (
    <div className="space-y-3 pb-2">
      {/* Active Skills Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-[#F59E0B]" />
          <h3 className="font-display text-xs font-bold text-slate-100">
            {job.name} Combat Skills
          </h3>
        </div>
        <button
          type="button"
          onClick={onToggleAutoSkills}
          className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
            save.autoSkills
              ? 'border-[#10B981]/70 bg-[#10B981]/15 text-[#10B981]'
              : 'border-zinc-700 bg-[#1a1920] text-slate-400'
          }`}
        >
          Auto-Fire: {save.autoSkills ? 'On' : 'Off'}
        </button>
      </div>

      {/* 4 Active Skill Slots */}
      <div className="grid grid-cols-2 gap-2">
        {job.skills.map((sk, idx) => {
          const lv = save.skillLevels[sk.id] || 0;
          const unlocked = lv > 0;
          const remCd = snapshot.skillCooldowns[sk.id] || 0;
          const cdPct = unlocked ? Math.min(100, (remCd / sk.cooldown) * 100) : 0;
          const cost = unlocked ? Math.floor(140 * Math.pow(1.45, lv)) : sk.unlockCost;
          const canAfford = save.mesos >= cost;

          return (
            <div
              key={sk.id}
              className="rounded-lg border border-zinc-800 bg-[#1a1920]/90 p-2 flex flex-col justify-between gap-2"
            >
              <div className="flex items-start gap-2">
                {/* Cooldown Sweep Skill Icon Button */}
                <button
                  type="button"
                  disabled={!unlocked || remCd > 0}
                  onClick={() => onCastSkill(sk.id)}
                  className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-zinc-700 bg-[#121216] flex items-center justify-center cursor-pointer disabled:cursor-default"
                  style={{ borderColor: unlocked ? sk.color : undefined }}
                  title={unlocked ? `Fire ${sk.name} [${idx + 1}]` : `${sk.name} (Locked)`}
                >
                  <Zap className="w-4 h-4" style={{ color: unlocked ? sk.color : '#52525b' }} />
                  <kbd className="pointer-events-none absolute top-0.5 right-0.5 hidden sm:block rounded bg-[#1a1920]/90 px-1 text-[8px] font-mono-num font-bold text-slate-300">
                    {idx + 1}
                  </kbd>
                  {unlocked && remCd > 0 && (
                    <>
                      <div
                        className="absolute inset-x-0 bottom-0 bg-[#121216]/80"
                        style={{ height: `${cdPct}%` }}
                      />
                      <span className="relative z-10 font-mono-num text-[10px] font-bold text-white">
                        {remCd.toFixed(1)}
                      </span>
                    </>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-white truncate">{sk.name}</span>
                    <span className="font-mono-num text-[10px] text-amber-300 shrink-0">
                      {unlocked ? `Lv.${lv}` : 'Locked'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400 leading-tight line-clamp-2">
                    {sk.desc}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <span className="font-mono-num text-[10px] text-slate-400">
                  {Math.round(sk.dmgMult * (1 + Math.max(0, lv - 1) * 0.18) * 100)}% · {sk.cooldown}s
                </span>
                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => onUpgradeSkill(sk.id)}
                  className={`min-h-[30px] rounded px-2 py-1 font-mono-num text-[10px] font-bold whitespace-nowrap cursor-pointer ${
                    canAfford
                      ? 'bg-[#10B981] text-slate-950 hover:bg-emerald-400'
                      : 'bg-zinc-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {unlocked ? `Lv Up ($${formatNum(cost)})` : `Unlock ($${formatNum(cost)})`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Crew Roster Section */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-amber-400" />
          <h3 className="font-display text-xs font-bold text-slate-100">
            Crew Roster ({save.equippedCompanions.length}/2 Deployed)
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">Recruit crew in Black Mkt</span>
      </div>

      <div className="space-y-1.5">
        {compIds.map((cid) => {
          const def = COMPANIONS[cid];
          const owned = save.companions[cid];
          const meta = RARITY_META[def.rarity];
          const isEquipped = save.equippedCompanions.includes(cid);
          const buffVal = Math.round(def.baseBuffValue * (1 + (owned.level - 1) * 0.2));
          const upgCost = Math.floor(200 * Math.pow(1.6, owned.level - 1));
          const canLevelUp = owned.unlocked && save.mesos >= upgCost;

          return (
            <div
              key={cid}
              className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
                owned.unlocked
                  ? `${meta.border} ${meta.bg}`
                  : 'border-zinc-800 bg-[#1a1920]/50 opacity-70'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#121216]/85 border border-zinc-800">
                  <SpritePreview kind="companion" id={cid} size={28} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate">{def.name}</span>
                    <span className={`text-[10px] font-semibold ${meta.text}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono-num">
                    {owned.unlocked ? `Lv.${owned.level}` : 'Locked'} · +{buffVal}% {def.buffLabel}
                  </div>
                </div>
              </div>

              {owned.unlocked ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={!canLevelUp}
                    onClick={() => onLevelUpCompanion(cid)}
                    className={`min-h-[34px] rounded-md px-2 py-1 font-mono-num text-[10px] font-bold whitespace-nowrap cursor-pointer ${
                      canLevelUp
                        ? 'bg-zinc-800 text-amber-300 border border-amber-500/40 hover:bg-zinc-700'
                        : 'bg-[#121216] text-slate-500 border border-zinc-800 cursor-not-allowed'
                    }`}
                  >
                    Lv Up (${formatNum(upgCost)})
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleEquipCompanion(cid)}
                    className={`min-h-[34px] rounded-md px-2.5 py-1 text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                      isEquipped
                        ? 'bg-[#10B981] text-slate-950 hover:bg-emerald-400'
                        : 'bg-[#F59E0B] text-slate-950 hover:bg-amber-300'
                    }`}
                  >
                    {isEquipped ? 'Deployed' : 'Deploy'}
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-slate-500 pr-1">Black Market</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
