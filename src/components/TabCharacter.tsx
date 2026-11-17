import { useState } from 'react';
import {
  ArrowUpCircle,
  Flame,
  Gem,
  Orbit,
  Shield,
  Shirt,
  Sparkles,
  Sword,
  Ticket,
  Zap,
} from 'lucide-react';
import {
  COSMETICS,
  JOBS,
  MAPLE_RANKS,
  RARITY_META,
  RELICS,
  TRANSCEND_UNLOCK_STAGE,
  UPGRADE_LABELS,
  WEAPONS,
} from '../game/constants';
import {
  computeBulkUpgrade,
  computeCosmeticCollectionBonus,
  computePendingArcaneSymbols,
  computeStats,
  formatNum,
  getEffectiveLiveOpsBonuses,
  getMilestoneMultiplier,
  isTranscendUnlocked,
} from '../game/progression';
import {
  BuyMultiplier,
  CosmeticId,
  CosmeticSlot,
  JobId,
  PlayerSaveState,
  RelicId,
  StatUpgradeKey,
} from '../game/types';
import { SpritePreview } from './SpritePreview';

interface TabCharacterProps {
  save: PlayerSaveState;
  buyMult: BuyMultiplier;
  onChangeBuyMult: (m: BuyMultiplier) => void;
  onSwitchJob: (job: JobId) => void;
  onUpgradeStat: (key: StatUpgradeKey) => void;
  onUpgradeRank: () => void;
  onOpenStyleBox: (useTicket: boolean) => void;
  onEquipCosmetic: (id: CosmeticId) => void;
  onToggleRelic: (id: RelicId) => void;
  onUpgradeRelic: (id: RelicId) => void;
  onUpgradeRelicWithCores: (id: RelicId) => void;
  onOpenTranscendence: () => void;
}

type CharSubTab = 'stats' | 'wardrobe' | 'relics';

export function TabCharacter({
  save,
  buyMult,
  onChangeBuyMult,
  onSwitchJob,
  onUpgradeStat,
  onUpgradeRank,
  onOpenStyleBox,
  onEquipCosmetic,
  onToggleRelic,
  onUpgradeRelic,
  onUpgradeRelicWithCores,
  onOpenTranscendence,
}: TabCharacterProps) {
  const [subTab, setSubTab] = useState<CharSubTab>('stats');

  const stats = computeStats(save);
  const currentJob = JOBS[save.job];
  const currentRank = MAPLE_RANKS[save.mapleRank] || MAPLE_RANKS[0];
  const nextRank = MAPLE_RANKS[save.mapleRank + 1];

  const equippedWpnId = save.equippedWeaponByJob[save.job];
  const equippedWpn = WEAPONS.find((w) => w.id === equippedWpnId);
  const cosBonus = computeCosmeticCollectionBonus(save);

  const transcendReady = isTranscendUnlocked(save);
  const pendingSymbols = computePendingArcaneSymbols(save);
  const showTranscendPanel = transcendReady || save.transcendCount > 0 || save.arcaneSymbols > 0;

  const statRows: Array<{
    key: StatUpgradeKey;
    valueDisplay: string;
    hasMilestone: boolean;
  }> = [
    { key: 'atk', valueDisplay: formatNum(stats.atk), hasMilestone: true },
    { key: 'maxHp', valueDisplay: formatNum(stats.maxHp), hasMilestone: true },
    { key: 'critRate', valueDisplay: `${stats.critRate.toFixed(1)}%`, hasMilestone: false },
    {
      key: 'critDmg',
      valueDisplay: `${formatNum(Math.round(stats.critDmg))}% / ${formatNum(stats.critDmgCap)}%`,
      hasMilestone: true,
    },
    { key: 'atkSpeed', valueDisplay: `${stats.atkSpeed.toFixed(2)}/s`, hasMilestone: false },
  ];

  const jobList: JobId[] = ['warrior', 'magician', 'bowman', 'thief'];
  const multOptions: BuyMultiplier[] = [1, 10, 'MAX'];

  const slotGroups: Array<{ slot: CosmeticSlot; title: string }> = [
    { slot: 'hat', title: 'Fedoras & Headgear' },
    { slot: 'cape', title: 'Trench Coats & Aura' },
    { slot: 'face', title: 'Shades & Cigars' },
  ];

  const canStyleTicket = save.styleTickets >= 1;
  const canStyleDia = save.diamonds >= 150;

  return (
    <div className="space-y-3 pb-2">
      {/* Sub-Tab Selector */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-[#1a1920] p-1">
        <button
          type="button"
          onClick={() => setSubTab('stats')}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'stats'
              ? 'bg-[#F59E0B] text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sword className="w-3.5 h-3.5" />
          <span>Stats &amp; Rank</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('wardrobe')}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'wardrobe'
              ? 'bg-[#8B1E24] text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shirt className="w-3.5 h-3.5" />
          <span>Tailor Shop</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('relics')}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'relics'
              ? 'bg-[#10B981] text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Heist Relics</span>
        </button>
      </div>

      {subTab === 'stats' && (
        <>
          {/* Archetype Selector Strip */}
          <div className="grid grid-cols-4 gap-1.5">
            {jobList.map((jid) => {
              const j = JOBS[jid];
              const active = save.job === jid;
              return (
                <button
                  key={jid}
                  type="button"
                  onClick={() => onSwitchJob(jid)}
                  className={`flex flex-col items-center justify-center rounded-lg border py-1.5 px-1 transition-colors cursor-pointer min-h-[56px] ${
                    active
                      ? 'border-amber-400 bg-[#8B1E24]/35 text-amber-200'
                      : 'border-zinc-800 bg-[#1a1920]/75 text-slate-400 hover:border-zinc-700 hover:text-slate-200'
                  }`}
                >
                  <SpritePreview
                    kind="hero"
                    id={jid}
                    weaponId={save.equippedWeaponByJob[jid]}
                    cosmetics={save.equippedCosmetics}
                    size={26}
                  />
                  <span className="mt-0.5 text-[11px] font-bold leading-none whitespace-nowrap">
                    {j.name}
                  </span>
                  <span className="text-[9px] text-slate-400 leading-tight">{j.primaryStat}</span>
                </button>
              );
            })}
          </div>

          {/* Capo Summary Row with Live Paper-Doll Weapon & Tailored Look */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1a1920]/85 px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#121216] border border-zinc-800">
                <SpritePreview
                  kind="hero"
                  id={save.job}
                  weaponId={equippedWpnId}
                  cosmetics={save.equippedCosmetics}
                  size={34}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Sword className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{currentJob.advancementTitle}</span>
                  <span aria-hidden="true" className="text-zinc-500">·</span>
                  <span className="text-amber-300 font-mono-num">
                    {currentJob.primaryStat} {formatNum(stats.primaryStatVal)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                  {equippedWpn ? equippedWpn.name : 'Street Gear'} · {currentRank.name}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <div className="text-[10px] text-slate-400">Combat Power</div>
              <div className="font-mono-num text-sm font-bold text-[#10B981]">
                {formatNum(stats.combatPower)}
              </div>
            </div>
          </div>

          {/* Go to the Mattresses Prestige Card */}
          {showTranscendPanel ? (
            <div className="rounded-lg border border-[#8B1E24] bg-gradient-to-r from-[#8B1E24]/55 via-[#1a1920] to-zinc-900 p-2.5 shadow-[0_0_16px_rgba(139,30,36,0.35)]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Orbit className="w-4 h-4 text-amber-300 shrink-0" />
                    <span className="font-display">Go to the Mattresses</span>
                    <span className="font-mono-num text-[10px] text-amber-200">
                      #{save.transcendCount} · {formatNum(save.arcaneSymbols)} Seals
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-300 font-mono-num">
                    {transcendReady
                      ? `New Identity Gain: +${formatNum(pendingSymbols)} Omertà Seals`
                      : `Clear Block ${TRANSCEND_UNLOCK_STAGE} to earn Seals`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenTranscendence}
                  className="relative min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#F59E0B] to-[#8B1E24] px-3 py-1.5 font-display text-xs font-bold text-white shadow-[0_0_14px_rgba(245,158,11,0.45)] hover:brightness-110 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>REBOOT</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1a1920]/70 px-3 py-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Orbit className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Conspiracy Board (Prestige)</span>
              </div>
              <span className="font-mono-num text-slate-400">
                Clear Block {TRANSCEND_UNLOCK_STAGE} ({Math.min(TRANSCEND_UNLOCK_STAGE, save.stage)}/{TRANSCEND_UNLOCK_STAGE})
              </span>
            </div>
          )}

          {/* Dirty Cash Stat Upgrades Header + Multiplier */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-display text-xs font-bold text-slate-200">Dirty Cash Upgrades</h3>
              {getEffectiveLiveOpsBonuses().active && (
                <span className="rounded bg-[#10B981]/20 border border-[#10B981]/50 px-1.5 py-0.5 font-mono-num text-[9px] font-bold text-[#10B981] whitespace-nowrap">
                  {getEffectiveLiveOpsBonuses().mesoMult}X CASH
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-[#1a1920] p-0.5 border border-zinc-800">
              {multOptions.map((m) => (
                <button
                  key={String(m)}
                  type="button"
                  onClick={() => onChangeBuyMult(m)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    buyMult === m
                      ? 'bg-[#F59E0B] text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m === 'MAX' ? 'MAX' : `x${m}`}
                </button>
              ))}
            </div>
          </div>

          {/* Stat Rows with 25-Level Milestone Progress Bars */}
          <div className="space-y-1.5">
            {statRows.map(({ key, valueDisplay, hasMilestone }) => {
              const cfg = UPGRADE_LABELS[key];
              const curLv = save.upgrades[key];
              const isMaxed = cfg.maxLevel !== undefined && curLv >= cfg.maxLevel;
              const bulk = computeBulkUpgrade(key, curLv, save.mesos, buyMult);
              const canAfford = !isMaxed && bulk.levels > 0 && save.mesos >= bulk.totalCost;
              const nextSingleCost = computeBulkUpgrade(key, curLv, Number.MAX_SAFE_INTEGER, 1).totalCost;

              const milestoneMult = hasMilestone ? getMilestoneMultiplier(curLv) : 1;
              const bracketProg = curLv % 25;
              const nextMilestoneLv = (Math.floor(curLv / 25) + 1) * 25;
              const progressPct = hasMilestone
                ? (bracketProg / 25) * 100
                : cfg.maxLevel
                  ? Math.min(100, (curLv / cfg.maxLevel) * 100)
                  : 0;

              return (
                <div
                  key={key}
                  className="rounded-lg border border-zinc-800/90 bg-[#1a1920]/85 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                        <span>{cfg.name}</span>
                        <span className="text-[11px] font-mono-num text-slate-400">
                          Lv.{curLv}
                        </span>
                        {hasMilestone && milestoneMult > 1 && (
                          <span className="text-[10px] font-mono-num font-bold text-[#10B981]">
                            x{formatNum(milestoneMult)}
                          </span>
                        )}
                      </div>
                      <div className="font-mono-num text-xs font-bold text-[#F59E0B]">
                        {valueDisplay}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canAfford || isMaxed}
                      onClick={() => onUpgradeStat(key)}
                      className={`min-h-[38px] min-w-[96px] rounded-lg px-2.5 py-1 text-right font-mono-num text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isMaxed
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          : canAfford
                            ? 'bg-[#10B981] text-slate-950 hover:bg-emerald-400'
                            : 'bg-zinc-800 text-slate-400 border border-zinc-700 cursor-not-allowed'
                      }`}
                    >
                      {isMaxed ? (
                        'Maxed'
                      ) : (
                        <div className="flex flex-col items-end leading-tight">
                          <span>+{bulk.levels > 0 ? bulk.levels : 1} Lv</span>
                          <span className="text-[10px]">
                            ${formatNum(bulk.totalCost > 0 ? bulk.totalCost : nextSingleCost)}
                          </span>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Milestone Progress Bar under Upgrade Row */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-sm bg-zinc-800">
                      <div
                        className={`h-full transition-[width] duration-150 ${
                          hasMilestone ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="font-mono-num text-[9px] text-slate-400 shrink-0">
                      {hasMilestone
                        ? `x2 at Lv.${nextMilestoneLv} (${bracketProg}/25)`
                        : cfg.maxLevel
                          ? `${curLv}/${cfg.maxLevel}`
                          : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mafia Hierarchy System */}
          <div className="rounded-lg border border-zinc-800 bg-[#1a1920]/90 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Hierarchy: {currentRank.name}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 font-mono-num">
                  Cut: +{currentRank.atkBonusPct}% ATK · +{currentRank.hpBonusPct}% HP · +
                  {currentRank.expBonusPct}% EXP
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-slate-400">Street Cred</div>
                <div className="font-mono-num text-sm font-bold text-amber-300">
                  {save.rankPoints} RP
                </div>
              </div>
            </div>

            {nextRank ? (
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2">
                <div className="text-[11px] text-slate-300 min-w-0">
                  Next: <span className="font-bold text-white">{nextRank.name}</span> (+
                  {nextRank.atkBonusPct}% ATK &amp; Aura)
                </div>
                <button
                  type="button"
                  disabled={save.rankPoints < nextRank.cost}
                  onClick={onUpgradeRank}
                  className={`inline-flex items-center gap-1 min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                    save.rankPoints >= nextRank.cost
                      ? 'bg-[#8B1E24] text-white hover:bg-rose-700'
                      : 'bg-zinc-800 text-slate-400 border border-zinc-700 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  <span>Make Bones ({nextRank.cost} RP)</span>
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#10B981] border-t border-zinc-800 pt-2">
                <Shield className="w-3.5 h-3.5" />
                <span>Supreme Godfather Achieved</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
            <Zap className="w-3 h-3 text-amber-400 shrink-0" />
            <span>
              Every 25 upgrade levels doubles that stat&apos;s base firepower.
            </span>
          </div>
        </>
      )}

      {subTab === 'wardrobe' && (
        <>
          {/* Live Paper-Doll Fashion Showcase & Tailor Box */}
          <div className="rounded-lg border border-[#8B1E24] bg-gradient-to-r from-[#1a1920] via-[#8B1E24]/30 to-[#1a1920] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-amber-400/40 bg-[#121216]/90">
                <SpritePreview
                  kind="hero"
                  id={save.job}
                  weaponId={equippedWpnId}
                  cosmetics={save.equippedCosmetics}
                  size={52}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-white">Tailor Shop</span>
                  <span className="inline-flex items-center gap-1 font-mono-num text-[11px] font-bold text-amber-300">
                    <Ticket className="w-3 h-3" />
                    {save.styleTickets} Vouchers
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-300 truncate">
                  Hat: {save.equippedCosmetics.hat ? COSMETICS[save.equippedCosmetics.hat].name : 'None'} ·
                  Coat: {save.equippedCosmetics.cape ? COSMETICS[save.equippedCosmetics.cape].name : 'None'}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canStyleTicket && !canStyleDia}
                    onClick={() => onOpenStyleBox(canStyleTicket)}
                    className={`flex-1 min-h-[36px] flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      canStyleTicket || canStyleDia
                        ? 'bg-gradient-to-b from-[#F59E0B] to-[#8B1E24] text-white hover:brightness-110 cursor-pointer'
                        : 'bg-zinc-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {canStyleTicket ? <Ticket className="w-3.5 h-3.5" /> : <Gem className="w-3.5 h-3.5" />}
                    <span>Tailor Crate ({canStyleTicket ? '1 Voucher' : '150 Gold'})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Passive Respect Collection Bonus */}
            <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800 pt-2 text-[11px] font-mono-num">
              <span className="text-slate-300 font-semibold">
                Respect ({cosBonus.unlockedCount}/{cosBonus.totalCount})
              </span>
              <span className="text-[#10B981] font-bold">
                +{cosBonus.atkPct}% ATK · +{cosBonus.mesoPct}% Cash · +{cosBonus.critDmg}% Crit DMG
              </span>
            </div>
          </div>

          {/* Cosmetic Slots */}
          {slotGroups.map(({ slot, title }) => {
            const items = (Object.values(COSMETICS) as Array<(typeof COSMETICS)[CosmeticId]>).filter(
              (c) => c.slot === slot
            );
            return (
              <div key={slot} className="space-y-1.5">
                <h3 className="font-display text-xs font-bold text-slate-200">{title}</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map((c) => {
                    const unlocked = save.cosmeticsUnlocked[c.id];
                    const isEquipped = save.equippedCosmetics[c.slot] === c.id;
                    const meta = RARITY_META[c.rarity];
                    const bonusTxt =
                      c.bonusType === 'atk_pct'
                        ? `+${c.bonusValue}% ATK`
                        : c.bonusType === 'meso_pct'
                          ? `+${c.bonusValue}% Cash`
                          : `+${c.bonusValue}% Crit DMG`;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => onEquipCosmetic(c.id)}
                        className={`rounded-lg border p-2 text-left transition-colors ${
                          isEquipped
                            ? 'border-amber-400 bg-[#8B1E24]/45 shadow-[0_0_12px_rgba(245,158,11,0.28)] cursor-pointer'
                            : unlocked
                              ? `${meta.border} ${meta.bg} cursor-pointer`
                              : 'border-zinc-800 bg-[#1a1920]/40 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                          <span className={c.isMythic ? 'text-amber-300' : meta.text}>
                            {c.isMythic ? 'TURF MYTHIC' : meta.label}
                          </span>
                          <span className={isEquipped ? 'text-amber-300' : 'text-slate-400'}>
                            {isEquipped ? 'Wearing' : unlocked ? 'Wear' : c.warExclusive ? 'Turf Crate' : 'Locked'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#121216]/85 border border-zinc-800">
                            <SpritePreview kind="cosmetic" id={c.id} size={24} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{c.name}</div>
                            <div className="font-mono-num text-[10px] text-[#10B981]">
                              {bonusTxt}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {subTab === 'relics' && (
        <div className="space-y-2.5">
          <div className="rounded-lg border border-amber-500/40 bg-gradient-to-r from-[#1a1920] to-[#8B1E24]/35 p-2.5 flex items-center justify-between">
            <div>
              <div className="font-display text-xs font-bold text-white">Fed Reserve &amp; Heist Relics</div>
              <div className="text-[11px] text-slate-400">
                Upgrade trophies with Mod Parts or Block 51+ Blackmail Files.
              </div>
            </div>
            <div className="text-right font-mono-num text-[11px] shrink-0 pl-2">
              <div className="text-amber-300 font-bold">
                Slots {save.equippedRelics.length}/2
              </div>
              <div className="text-[10px] text-[#10B981]">{formatNum(save.starStones)} Parts</div>
              <div className="text-[10px] text-rose-300">{formatNum(save.chaosCores)} Files</div>
            </div>
          </div>

          {(Object.values(RELICS) as Array<(typeof RELICS)[RelicId]>).map((r) => {
            const owned = save.relics[r.id];
            const unlocked = owned?.unlocked;
            const isEquipped = save.equippedRelics.includes(r.id);
            const meta = RARITY_META[r.rarity];
            const lvScale = 1 + ((owned?.level || 1) - 1) * 0.3;
            const atkBonus = Math.round(r.atkPct * lvScale);
            const stoneCost = 3 + (owned?.level || 1) * 2;
            const mesoCost = Math.floor(600 * Math.pow(1.35, (owned?.level || 1) - 1));
            const coreCost = 2 + (owned?.level || 1) * 2;
            const canUpgradeStones = unlocked && save.starStones >= stoneCost && save.mesos >= mesoCost;
            const canUpgradeCores = unlocked && save.chaosCores >= coreCost;

            return (
              <div
                key={r.id}
                className={`rounded-lg border p-2.5 ${
                  unlocked
                    ? `${meta.border} ${meta.bg}`
                    : 'border-zinc-800 bg-[#1a1920]/50 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#121216]/90 border border-zinc-800">
                      <SpritePreview kind="relic" id={r.id} size={30} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <span className="truncate">{r.name}</span>
                        {r.isMythic && (
                          <span className="rounded bg-[#8B1E24]/50 border border-rose-400/50 px-1 py-0.5 text-[9px] font-bold leading-none text-amber-200 shrink-0">
                            MYTHIC
                          </span>
                        )}
                        {unlocked && (
                          <span className="font-mono-num text-[10px] text-amber-300 shrink-0">
                            Lv.{owned.level}
                          </span>
                        )}
                      </div>
                      <div className="font-mono-num text-[11px] font-bold text-amber-300">
                        +{formatNum(atkBonus)}% ATK · +{r.critRate}% Crit · {r.passiveLabel}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-snug">{r.desc}</div>
                    </div>
                  </div>
                </div>

                {unlocked ? (
                  <div className="mt-2 space-y-1.5 border-t border-zinc-800/80 pt-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleRelic(r.id)}
                        className={`min-h-[34px] flex-1 rounded-md px-2.5 text-xs font-bold cursor-pointer ${
                          isEquipped
                            ? 'bg-[#10B981]/20 border border-[#10B981] text-[#10B981]'
                            : 'bg-zinc-800 border border-zinc-700 text-slate-200 hover:bg-zinc-700'
                        }`}
                      >
                        {isEquipped ? 'Equipped' : 'Equip Relic'}
                      </button>
                      <button
                        type="button"
                        disabled={!canUpgradeStones}
                        onClick={() => onUpgradeRelic(r.id)}
                        className={`min-h-[34px] rounded-md px-2.5 font-mono-num text-[10px] font-bold whitespace-nowrap ${
                          canUpgradeStones
                            ? 'bg-[#F59E0B] text-slate-950 hover:bg-amber-300 cursor-pointer'
                            : 'bg-zinc-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        +{stoneCost} Pt · ${formatNum(mesoCost)}
                      </button>
                      <button
                        type="button"
                        disabled={!canUpgradeCores}
                        onClick={() => onUpgradeRelicWithCores(r.id)}
                        className={`min-h-[34px] rounded-md px-2.5 font-mono-num text-[10px] font-bold whitespace-nowrap ${
                          canUpgradeCores
                            ? 'bg-[#8B1E24] text-white hover:bg-rose-700 cursor-pointer'
                            : 'bg-zinc-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {coreCost} Files
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 border-t border-zinc-800/80 pt-1.5 text-[10px] font-semibold text-slate-400">
                    {r.warExclusive
                      ? 'Drops from Turf Spoils Crate (Family Tab)'
                      : 'Drops from Federal Reserve Heist (Top HUD)'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
