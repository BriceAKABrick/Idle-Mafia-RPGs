import { useState } from 'react';
import { Gem, Layers, Sparkles, Star, Sword, Ticket, Users } from 'lucide-react';
import {
  JOBS,
  RARITY_META,
  RARITY_ORDER,
  SUMMON_EXP_THRESHOLDS,
  SUMMON_RATES_BY_LEVEL,
  WEAPONS,
} from '../game/constants';
import { formatNum, getEffectiveLiveOpsBonuses, getWeaponAtkPct } from '../game/progression';
import { JobId, PlayerSaveState } from '../game/types';
import { SpritePreview } from './SpritePreview';

interface TabSummonProps {
  save: PlayerSaveState;
  onSummon: (banner: 'weapon' | 'companion', count: 1 | 10, useTickets: boolean) => void;
  onAutoMergeEquip: () => void;
  onEquipWeapon: (job: JobId, weaponId: string) => void;
  onOpenStarForce: (weaponId: string) => void;
}

export function TabSummon({
  save,
  onSummon,
  onAutoMergeEquip,
  onEquipWeapon,
  onOpenStarForce,
}: TabSummonProps) {
  const [showRates, setShowRates] = useState(false);
  const [jobFilter, setJobFilter] = useState<'current' | 'all'>('current');

  const rates = SUMMON_RATES_BY_LEVEL[Math.min(9, save.summonLevel - 1)];
  const nextThreshold = save.summonLevel < 10 ? SUMMON_EXP_THRESHOLDS[save.summonLevel] : 1;
  const expPct = save.summonLevel >= 10 ? 100 : Math.min(100, (save.summonExp / nextThreshold) * 100);

  const canTicket1 = save.summonTickets >= 1;
  const canTicket10 = save.summonTickets >= 10;
  const canDia1 = save.diamonds >= 100;
  const canDia10 = save.diamonds >= 900;

  const displayedWeapons = WEAPONS.filter((w) => jobFilter === 'all' || w.job === save.job);

  const equippedWpnId = save.equippedWeaponByJob[save.job];
  const equippedWpn = WEAPONS.find((w) => w.id === equippedWpnId);
  const equippedWpnOwned = equippedWpnId ? save.weapons[equippedWpnId] : undefined;
  const equippedCanStarForce =
    equippedWpn &&
    equippedWpnOwned?.unlocked &&
    (equippedWpn.rarity === 'unique' || equippedWpn.rarity === 'legendary');

  return (
    <div className="space-y-3 pb-2">
      {/* Supplier Tier Progress */}
      <div className="rounded-lg border border-zinc-800 bg-[#1a1920]/95 p-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Supplier Tier Lv.{save.summonLevel}</span>
            <span className="font-mono-num text-[11px] text-zinc-400">
              {save.summonLevel >= 10 ? '(Max)' : `(${save.summonExp}/${nextThreshold})`}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1 font-mono-num text-[11px] font-bold text-amber-300">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {save.starStones} Mod Parts
            </span>
            <button
              type="button"
              onClick={() => setShowRates((v) => !v)}
              className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
            >
              {showRates ? 'Hide Odds' : 'Cut Odds'}
            </button>
          </div>
        </div>

        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-[#8B1E24] via-amber-500 to-emerald-400 transition-[width] duration-200"
            style={{ width: `${expPct}%` }}
          />
        </div>

        {showRates && (
          <div className="mt-2 grid grid-cols-5 gap-1 border-t border-zinc-800 pt-2 text-center font-mono-num text-[10px]">
            {RARITY_ORDER.map((r) => (
              <div key={r}>
                <div className={`font-bold ${RARITY_META[r].text}`}>{RARITY_META[r].label}</div>
                <div className="text-zinc-300">{rates[r]}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Heat Tuning Banner for Currently Equipped Syndicate / Godfather Weapon */}
      {equippedCanStarForce && equippedWpn && equippedWpnOwned && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/60 bg-gradient-to-r from-[#8B1E24]/45 via-[#1a1920] to-amber-950/40 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#121216] border border-amber-400/40">
              <SpritePreview kind="weapon" id={equippedWpn.id} job={equippedWpn.job} size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
                <span className="truncate">{equippedWpn.name}</span>
                <span className="font-mono-num text-amber-300">★{equippedWpnOwned.stars || 0}/15</span>
              </div>
              <div className="font-mono-num text-[10px] text-emerald-400">
                +{formatNum(getWeaponAtkPct(equippedWpn, equippedWpnOwned))}% ATK Equipped
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenStarForce(equippedWpn.id)}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-1.5 text-xs font-bold text-[#121216] hover:brightness-110 shrink-0 cursor-pointer"
          >
            <Star className="w-3.5 h-3.5 fill-[#121216]" />
            <span>Heat Tuning</span>
            {getEffectiveLiveOpsBonuses().starforceBonusPct > 0 && (
              <span className="rounded bg-emerald-950/90 px-1 text-[9px] font-mono-num text-emerald-300">
                +{getEffectiveLiveOpsBonuses().starforceBonusPct}%
              </span>
            )}
          </button>
        </div>
      )}

      {/* Arms Smuggler Banner */}
      <div className="rounded-lg border border-zinc-700/80 bg-gradient-to-r from-[#1a1920] to-amber-950/35 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sword className="w-4 h-4 text-amber-400" />
            <div>
              <div className="font-display text-sm font-bold text-white leading-tight">
                Arms Smuggler
              </div>
              <div className="text-[11px] text-zinc-400">
                Smuggle Street to Godfather hardware
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canTicket1 && !canDia1}
            onClick={() => onSummon('weapon', 1, canTicket1)}
            className={`min-h-[42px] rounded-lg px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              canTicket1 || canDia1
                ? 'bg-emerald-500 text-[#121216] hover:bg-emerald-400'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {canTicket1 ? <Ticket className="w-3.5 h-3.5" /> : <Gem className="w-3.5 h-3.5" />}
            <span>Deal x1 ({canTicket1 ? '1 Contract' : '100 G'})</span>
          </button>

          <button
            type="button"
            disabled={!canTicket10 && !canDia10}
            onClick={() => onSummon('weapon', 10, canTicket10)}
            className={`min-h-[42px] rounded-lg px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              canTicket10 || canDia10
                ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-[#121216] hover:brightness-105'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {canTicket10 ? <Ticket className="w-3.5 h-3.5" /> : <Gem className="w-3.5 h-3.5" />}
            <span>Deal x10 ({canTicket10 ? '10 Contracts' : '900 G'})</span>
          </button>
        </div>
      </div>

      {/* Crew Recruitment Banner */}
      <div className="rounded-lg border border-zinc-700/80 bg-gradient-to-r from-[#1a1920] to-[#8B1E24]/30 p-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-rose-400" />
          <div>
            <div className="font-display text-sm font-bold text-white leading-tight">
              Crew Recruitment
            </div>
            <div className="text-[11px] text-zinc-400">
              Recruit Corrupt Accountant, Hired Muscle, Explosives Expert & Doberman
            </div>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canTicket1 && !canDia1}
            onClick={() => onSummon('companion', 1, canTicket1)}
            className={`min-h-[42px] rounded-lg px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              canTicket1 || canDia1
                ? 'bg-[#8B1E24] text-white hover:bg-rose-700'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {canTicket1 ? <Ticket className="w-3.5 h-3.5" /> : <Gem className="w-3.5 h-3.5" />}
            <span>Recruit x1 ({canTicket1 ? '1 Contract' : '100 G'})</span>
          </button>

          <button
            type="button"
            disabled={!canTicket10 && !canDia10}
            onClick={() => onSummon('companion', 10, canTicket10)}
            className={`min-h-[42px] rounded-lg px-3 py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              canTicket10 || canDia10
                ? 'bg-gradient-to-b from-rose-600 to-[#8B1E24] text-white hover:brightness-110'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {canTicket10 ? <Ticket className="w-3.5 h-3.5" /> : <Gem className="w-3.5 h-3.5" />}
            <span>Recruit x10 ({canTicket10 ? '10 Contracts' : '900 G'})</span>
          </button>
        </div>
      </div>

      {/* Consolidate & Equip Best */}
      <button
        type="button"
        onClick={onAutoMergeEquip}
        className="w-full min-h-[40px] flex items-center justify-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-950/50 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/50 cursor-pointer"
      >
        <Layers className="w-4 h-4" />
        <span>Consolidate (5 Duplicates) & Equip Best</span>
      </button>

      {/* Arsenal Collection Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs font-bold text-zinc-200">Arsenal Collection</h3>
          <div className="flex items-center gap-1 rounded-md bg-[#1a1920] p-0.5 border border-zinc-800">
            <button
              type="button"
              onClick={() => setJobFilter('current')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                jobFilter === 'current' ? 'bg-[#8B1E24] text-white' : 'text-zinc-400'
              }`}
            >
              {JOBS[save.job].name}
            </button>
            <button
              type="button"
              onClick={() => setJobFilter('all')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                jobFilter === 'all' ? 'bg-[#8B1E24] text-white' : 'text-zinc-400'
              }`}
            >
              All Roles
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {displayedWeapons.map((w) => {
            const owned = save.weapons[w.id];
            const unlocked = owned?.unlocked;
            const isEquipped = save.equippedWeaponByJob[w.job] === w.id;
            const meta = RARITY_META[w.rarity];
            const canStarForce = unlocked && (w.rarity === 'unique' || w.rarity === 'legendary');
            const stars = owned?.stars || 0;
            const atkBonus = unlocked ? getWeaponAtkPct(w, owned) : w.baseAtkPct;

            return (
              <div
                key={w.id}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  unlocked
                    ? `${meta.border} ${meta.bg}`
                    : 'border-zinc-800 bg-[#1a1920]/45 opacity-50'
                }`}
              >
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    if (isEquipped && canStarForce) {
                      onOpenStarForce(w.id);
                    } else {
                      onEquipWeapon(w.job, w.id);
                    }
                  }}
                  className={`w-full text-left ${unlocked ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-bold ${meta.text}`}>
                      {meta.label}
                      {canStarForce && (
                        <span className="ml-1 font-mono-num text-amber-300">★{stars}</span>
                      )}
                    </span>
                    <span className="font-mono-num text-[10px] text-zinc-300">
                      {isEquipped ? 'Equipped' : unlocked ? `${owned.count}/5` : 'Locked'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#121216] border border-zinc-800">
                      <SpritePreview kind="weapon" id={w.id} job={w.job} size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{w.name}</div>
                      <div className="font-mono-num text-[10px] text-amber-300">
                        +{formatNum(atkBonus)}% ATK · {JOBS[w.job].name}
                      </div>
                    </div>
                  </div>
                </button>

                {canStarForce && (
                  <button
                    type="button"
                    onClick={() => onOpenStarForce(w.id)}
                    className="mt-1.5 w-full min-h-[28px] flex items-center justify-center gap-1 rounded bg-amber-400/95 hover:bg-amber-300 text-[#121216] text-[10px] font-bold cursor-pointer"
                  >
                    <Star className="w-3 h-3 fill-[#121216]" />
                    <span>{isEquipped ? 'Heat Tuning ★' : `Heat Tuning (${stars}/15)`}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
