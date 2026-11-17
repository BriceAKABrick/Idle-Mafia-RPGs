import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Coins,
  Crown,
  Flame,
  Gem,
  LogOut,
  MessageSquare,
  PlusCircle,
  Search,
  Send,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import {
  CLAN_CREATION_DIAMOND_COST,
  CLAN_CREST_BG_META,
  CLAN_CREST_ICONS,
  JOBS,
} from '../game/constants';
import { computeStats, formatNum, getClanShrineBuffs } from '../game/progression';
import {
  ClanChatMessage,
  ClanCrest as ClanCrestType,
  ClanCrestBgColor,
  ClanCrestIconId,
  ClanDirectoryEntry,
  ClanInfo,
  ClanRank,
  ClanWarState,
  CombatMode,
  PlayerSaveState,
  WarDefender,
  WarLaneId,
} from '../game/types';
import { ClanCrest } from './ClanCrest';
import { SpritePreview } from './SpritePreview';

export type ClanSubTab = 'roster' | 'shrine' | 'war';

interface TabClanProps {
  save: PlayerSaveState;
  combatMode: CombatMode;
  clan: ClanInfo | null;
  directory: ClanDirectoryEntry[];
  chatMessages: ClanChatMessage[];
  clanWar: ClanWarState | null;
  initialSubTab?: ClanSubTab;
  onRefreshDirectory: (query?: string) => void;
  onCreateClan: (input: {
    name: string;
    tag: string;
    crest: ClanCrestType;
    minCp: number;
  }) => Promise<void>;
  onJoinClan: (clanId: string) => Promise<void>;
  onLeaveClan: () => Promise<void>;
  onSetMemberRank: (targetPlayerId: string, newRank: ClanRank) => Promise<void>;
  onSendChat: (text: string) => Promise<void>;
  onDonateShrine: (kind: 'mesos' | 'diamonds') => Promise<void>;
  onStartWar: () => Promise<void>;
  onAssignDefense: (laneId: WarLaneId) => Promise<void>;
  onAttackDefender: (laneId: WarLaneId, defender: WarDefender) => void;
  onRallyStatue: (laneId: WarLaneId) => void;
  onAdvanceWarSkirmish: () => Promise<void>;
  onResolveWar: () => Promise<void>;
  onOpenWarChest: () => void;
}

export function TabClan({
  save,
  combatMode,
  clan,
  directory,
  chatMessages,
  clanWar,
  initialSubTab = 'roster',
  onRefreshDirectory,
  onCreateClan,
  onJoinClan,
  onLeaveClan,
  onSetMemberRank,
  onSendChat,
  onDonateShrine,
  onStartWar,
  onAssignDefense,
  onAttackDefender,
  onRallyStatue,
  onAdvanceWarSkirmish,
  onResolveWar,
  onOpenWarChest,
}: TabClanProps) {
  const [noClanView, setNoClanView] = useState<'directory' | 'create'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<ClanSubTab>(initialSubTab);

  // Create Clan state
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState('');
  const [crestIcon, setCrestIcon] = useState<ClanCrestIconId>('maple_crest');
  const [crestBg, setCrestBg] = useState<ClanCrestBgColor>('crimson');
  const [minCp, setMinCp] = useState(100);
  const [creating, setCreating] = useState(false);

  // Roster & Chat state
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [selectedLane, setSelectedLane] = useState<WarLaneId>('henesys_fortress');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stats = computeStats(save);
  const myPlayerId = save.profile?.playerId;

  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (c) => c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q)
    );
  }, [directory, searchQuery]);

  const myMember = clan?.members.find((m) => m.playerId === myPlayerId);
  const isMaster = myMember?.rank === 'master';

  const latestMsg = chatMessages[chatMessages.length - 1];

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    await onCreateClan({
      name: newName,
      tag: newTag,
      crest: { icon: crestIcon, bgColor: crestBg },
      minCp,
    });
    setCreating(false);
  };

  const handleSendChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput('');
    await onSendChat(msg);
  };

  // ==================== NO-FAMILY STATE: DIRECTORY & FOUND CRIME FAMILY ====================
  if (!clan) {
    const canAffordCreate = save.diamonds >= CLAN_CREATION_DIAMOND_COST;
    const iconIds = Object.keys(CLAN_CREST_ICONS) as ClanCrestIconId[];
    const bgIds = Object.keys(CLAN_CREST_BG_META) as ClanCrestBgColor[];

    return (
      <div className="space-y-2.5 pb-2">
        {/* Sub-view Switcher */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-[#1a1920] p-1">
          <button
            type="button"
            onClick={() => setNoClanView('directory')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              noClanView === 'directory'
                ? 'bg-amber-400 text-[#121216]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Family Directory</span>
          </button>
          <button
            type="button"
            onClick={() => setNoClanView('create')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              noClanView === 'create'
                ? 'bg-[#8B1E24] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Found Family (1,000 G)</span>
          </button>
        </div>

        {noClanView === 'directory' ? (
          <>
            {/* Search Input */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    onRefreshDirectory(e.target.value);
                  }}
                  placeholder="Search family name or [TAG]..."
                  className="w-full rounded-lg border border-zinc-800 bg-[#1a1920] pl-8 pr-3 py-2 text-[16px] font-semibold text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Directory List */}
            <div className="space-y-2">
              {filteredDirectory.map((entry) => {
                const isFull = entry.memberCount >= entry.maxMembers;
                const meetsCp = stats.combatPower >= entry.minCp;
                const canJoin = !isFull && meetsCp;

                return (
                  <div
                    key={entry.clanId}
                    className="flex items-center justify-between gap-2.5 rounded-xl border border-zinc-800 bg-[#1a1920]/90 p-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ClanCrest crest={entry.crest} size={38} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <span className="font-mono-num text-amber-300 shrink-0">[{entry.tag}]</span>
                          <span className="truncate">{entry.name}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-mono-num text-zinc-400">
                          <span className="text-amber-300 font-semibold">
                            CP {formatNum(entry.totalCp)}
                          </span>
                          <span>·</span>
                          <span>
                            {entry.memberCount}/{entry.maxMembers} Made Men
                          </span>
                          <span>·</span>
                          <span className="text-emerald-400">Front Lv.{entry.shrineLevel}</span>
                        </div>
                        <div className="mt-0.5 font-mono-num text-[10px] text-zinc-400">
                          Min CP: {entry.minCp > 0 ? formatNum(entry.minCp) : 'Open'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canJoin}
                      onClick={() => void onJoinClan(entry.clanId)}
                      className={`min-h-[36px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap ${
                        canJoin
                          ? 'bg-emerald-400 text-[#121216] hover:bg-emerald-300 cursor-pointer'
                          : 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
                      }`}
                    >
                      {isFull ? 'Full' : !meetsCp ? `Need ${formatNum(entry.minCp)}` : 'Join'}
                    </button>
                  </div>
                );
              })}

              {filteredDirectory.length === 0 && (
                <div className="rounded-xl border border-zinc-800 bg-[#1a1920]/70 p-4 text-center text-xs text-zinc-400">
                  {searchQuery.trim()
                    ? `No Crime Families matched "${searchQuery}". Found your own!`
                    : 'No Syndicate Families founded yet. Spend 1,000 G to establish the first Crime Family!'}
                </div>
              )}
            </div>
          </>
        ) : (
          <form
            onSubmit={handleSubmitCreate}
            className="space-y-3 rounded-xl border border-[#8B1E24]/70 bg-[#1a1920]/95 p-3"
          >
            {/* Live Crest Preview */}
            <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#121216] p-2.5">
              <ClanCrest crest={{ icon: crestIcon, bgColor: crestBg }} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <span className="font-mono-num text-amber-300">
                    [{(newTag || 'SYND').toUpperCase().slice(0, 4)}]
                  </span>
                  <span className="truncate">{newName.trim() || 'Your Crime Family'}</span>
                </div>
                <div className="mt-0.5 font-mono-num text-[10px] text-zinc-400">
                  Min Requirement: {minCp > 0 ? `${formatNum(minCp)} CP` : 'Open to All'} · You rule as Don
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block">
                <span className="text-[11px] font-bold text-zinc-300">Family Name</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={18}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="CorleoneSyndicate"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#121216] px-2.5 py-2 text-[16px] font-bold text-white focus:border-amber-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-zinc-300">4-Char Tag</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={4}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="SYND"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#121216] px-2.5 py-2 font-mono-num text-[16px] font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
                />
              </label>
            </div>

            {/* Pixel Family Emblem Picker */}
            <div>
              <div className="text-[11px] font-bold text-zinc-300 mb-1.5">Syndicate Signet Emblem</div>
              <div className="grid grid-cols-4 gap-1.5">
                {iconIds.map((iid) => {
                  const active = crestIcon === iid;
                  return (
                    <button
                      key={iid}
                      type="button"
                      onClick={() => setCrestIcon(iid)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-950/40'
                          : 'border-zinc-800 bg-[#121216] hover:border-zinc-700'
                      }`}
                    >
                      <ClanCrest crest={{ icon: iid, bgColor: crestBg }} size={26} />
                      <span className="text-[9px] font-semibold text-zinc-300 truncate max-w-full">
                        {CLAN_CREST_ICONS[iid].name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Background Color Picker */}
            <div>
              <div className="text-[11px] font-bold text-zinc-300 mb-1.5">Banner Felt Color</div>
              <div className="grid grid-cols-6 gap-1.5">
                {bgIds.map((bid) => {
                  const meta = CLAN_CREST_BG_META[bid];
                  const active = crestBg === bid;
                  return (
                    <button
                      key={bid}
                      type="button"
                      onClick={() => setCrestBg(bid)}
                      style={{ backgroundColor: meta.hex, borderColor: meta.border }}
                      className={`rounded-md border-2 py-1.5 text-[10px] font-bold text-white cursor-pointer ${
                        active ? 'ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      {meta.name.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minimum CP Requirement */}
            <div>
              <div className="text-[11px] font-bold text-zinc-300 mb-1">Minimum CP Requirement</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 100, 1000, 10000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMinCp(val)}
                    className={`rounded-md border py-1.5 font-mono-num text-[11px] font-bold cursor-pointer ${
                      minCp === val
                        ? 'border-amber-400 bg-amber-950/50 text-amber-200'
                        : 'border-zinc-800 bg-[#121216] text-zinc-400'
                    }`}
                  >
                    {val === 0 ? 'Open' : formatNum(val)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!canAffordCreate || creating || newName.trim().length < 3 || newTag.length < 2}
              className={`w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-bold ${
                canAffordCreate && newName.trim().length >= 3 && newTag.length >= 2
                  ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-[#121216] hover:brightness-110 cursor-pointer'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Gem className="w-4 h-4" />
              <span>
                {creating
                  ? 'Founding Family...'
                  : `Found Family (${formatNum(CLAN_CREATION_DIAMOND_COST)} G)`}
              </span>
            </button>
          </form>
        )}
      </div>
    );
  }

  // ==================== IN-FAMILY HALL VIEW ====================
  const shrineBuffs = getClanShrineBuffs(clan.shrine.level);
  const shrinePct = Math.min(
    100,
    Math.round((clan.shrine.exp / Math.max(1, clan.shrine.nextLevelExp)) * 100)
  );
  const mesoDonateCost = Math.floor(1200 * Math.pow(1.35, clan.shrine.level - 1));
  const dailyMesoCount = save.clanDailyDonations?.mesoCount || 0;
  const dailyDiaCount = save.clanDailyDonations?.diamondCount || 0;

  const warEndsInMs = clanWar ? Math.max(0, clanWar.endsAt - nowMs) : 0;
  const warHrs = Math.floor(warEndsInMs / 3_600_000);
  const warMins = Math.floor((warEndsInMs % 3_600_000) / 60_000);
  const warSecs = Math.floor((warEndsInMs % 60_000) / 1000);
  const warClockLabel = `${String(warHrs).padStart(2, '0')}h ${String(warMins).padStart(2, '0')}m ${String(warSecs).padStart(2, '0')}s`;

  const lanesWon = clanWar
    ? Object.values(clanWar.lanes).filter((l) => l.controlledBy === 'ally').length
    : 0;
  const activeLane = clanWar?.lanes[selectedLane];
  const busyInCombat = combatMode !== 'FARMING';

  return (
    <div className="space-y-2.5 pb-2">
      {/* Family Hall Banner + TURF WAR CTA */}
      <div className="rounded-xl border border-amber-500/50 bg-gradient-to-r from-[#1a1920] via-[#8B1E24]/25 to-[#1a1920] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <ClanCrest crest={clan.crest} size={38} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <span className="font-mono-num text-amber-300 shrink-0">[{clan.tag}]</span>
                <span className="truncate">{clan.name}</span>
                <span className="font-mono-num text-[10px] text-zinc-400 shrink-0">
                  Lv.{clan.level}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-mono-num text-zinc-300">
                <span className="text-amber-300 font-bold">CP {formatNum(clan.totalCp)}</span>
                <span>·</span>
                <span>
                  {clan.memberCount}/{clan.maxMembers} Crew
                </span>
                <span>·</span>
                <span className="text-emerald-300 font-bold">
                  {formatNum(save.warMedals || 0)} Medallions
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSubTab('war')}
            className={`min-h-[36px] shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-display text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              clanWar?.status === 'ENDED' && clanWar.chestReward && !clanWar.chestReward.claimed
                ? 'border-amber-300 bg-gradient-to-b from-amber-400 to-amber-600 text-[#121216] animate-pulse'
                : 'border-rose-400 bg-gradient-to-b from-rose-600 to-[#8B1E24] text-white shadow-[0_0_12px_rgba(139,30,36,0.55)] hover:brightness-110'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            <span>TURF WAR</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-[#1a1920] p-1">
        <button
          type="button"
          onClick={() => setSubTab('roster')}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'roster' ? 'bg-amber-400 text-[#121216]' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Hall & Crew</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('shrine')}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'shrine' ? 'bg-emerald-400 text-[#121216]' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Front Lv.{clan.shrine.level}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('war')}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            subTab === 'war' ? 'bg-[#8B1E24] text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>
            Turf {clanWar ? `(${clanWar.attacksRemaining}/${clanWar.maxAttacks})` : ''}
          </span>
        </button>
      </div>

      {/* ==================== SUB-TAB 1: FAMILY HALL & CREW ==================== */}
      {subTab === 'roster' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5 text-[11px]">
            <span className="font-bold text-zinc-300">
              Family Roster ({clan.members.length} Active Made Men)
            </span>
            {!confirmLeave ? (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Leave Family</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmLeave(false);
                    void onLeaveClan();
                  }}
                  className="rounded bg-[#8B1E24] px-2 py-0.5 text-[10px] font-bold text-white cursor-pointer"
                >
                  Confirm Leave
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {clan.members.map((m) => {
              const isSelf = m.playerId === myPlayerId;
              const statusColor =
                m.onlineStatus === 'online'
                  ? 'bg-emerald-400'
                  : m.onlineStatus === 'in_war'
                    ? 'bg-amber-400'
                    : 'bg-zinc-600';
              const statusLabel =
                m.onlineStatus === 'online'
                  ? 'Online'
                  : m.onlineStatus === 'in_war'
                    ? 'On Turf'
                    : 'Offline';
              const rankLabel =
                m.rank === 'master' ? 'Don' : m.rank === 'jr_master' ? 'Caporegime' : 'Soldier';
              const rankColor =
                m.rank === 'master'
                  ? 'text-amber-300 border-amber-400/50 bg-amber-950/50'
                  : m.rank === 'jr_master'
                    ? 'text-rose-300 border-rose-400/50 bg-[#8B1E24]/35'
                    : 'text-zinc-300 border-zinc-700 bg-zinc-800/80';

              return (
                <div
                  key={m.playerId}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                    isSelf
                      ? 'border-amber-400/60 bg-amber-950/20'
                      : 'border-zinc-800 bg-[#1a1920]/85'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-[#121216]">
                      <SpritePreview
                        kind="hero"
                        id={m.job}
                        weaponId={m.equippedWeaponId}
                        cosmetics={m.equippedCosmetics}
                        size={28}
                      />
                      <span
                        title={statusLabel}
                        className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border border-[#121216] ${statusColor}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        {m.rank === 'master' && (
                          <Crown className="w-3 h-3 text-amber-300 shrink-0" />
                        )}
                        <span className="truncate">{m.ign}</span>
                        <span className={`rounded border px-1 py-0.5 text-[9px] font-bold leading-none shrink-0 ${rankColor}`}>
                          {rankLabel}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono-num text-[10px] text-zinc-400">
                        <span>
                          Lv.{m.level} {JOBS[m.job].name}
                        </span>
                        <span>·</span>
                        <span className="text-amber-300 font-bold">CP {formatNum(m.combatPower)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-num text-[10px] font-bold text-emerald-400">
                      +{formatNum(m.weeklyContribution)} Pts
                    </div>
                    {isMaster && m.rank !== 'master' ? (
                      <button
                        type="button"
                        onClick={() =>
                          void onSetMemberRank(
                            m.playerId,
                            m.rank === 'jr_master' ? 'member' : 'jr_master'
                          )
                        }
                        className="mt-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-200 hover:border-amber-400 cursor-pointer"
                      >
                        {m.rank === 'jr_master' ? 'Demote' : 'Make Capo'}
                      </button>
                    ) : (
                      <div className="text-[9px] text-zinc-500">{statusLabel}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 2: FAMILY FRONT BUSINESS ==================== */}
      {subTab === 'shrine' && (
        <div className="space-y-2.5">
          {/* Front Business Progress */}
          <div className="rounded-xl border border-emerald-500/45 bg-gradient-to-b from-emerald-950/30 to-[#1a1920] p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="font-display text-sm font-bold text-white">
                  Front Business Lv.{clan.shrine.level}
                </span>
              </div>
              <span className="font-mono-num text-xs font-bold text-emerald-300">
                {clan.shrine.exp}/{clan.shrine.nextLevelExp} REP
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-[width] duration-300"
                style={{ width: `${shrinePct}%` }}
              />
            </div>

            {/* Active Shared Buffs */}
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center font-mono-num">
              <div className="rounded-lg border border-zinc-800 bg-[#121216]/90 p-2">
                <div className="text-[9px] text-zinc-400">Cash Cut</div>
                <div className="mt-0.5 text-xs font-bold text-emerald-400">
                  +{shrineBuffs.mesoPct}%
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-[#121216]/90 p-2">
                <div className="text-[9px] text-zinc-400">Boss DMG</div>
                <div className="mt-0.5 text-xs font-bold text-rose-400">
                  +{shrineBuffs.bossDmgPct}%
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-[#121216]/90 p-2">
                <div className="text-[9px] text-zinc-400">Fight Club Payout</div>
                <div className="mt-0.5 text-xs font-bold text-amber-300">
                  +{shrineBuffs.wagerBonusPct}%
                </div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-zinc-400">
              Front Business cuts apply automatically to every Family member across Blocks, Bosses, Federal Reserve Heists & Fight Club payouts.
            </p>
          </div>

          {/* Daily Kickup Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-500/40 bg-[#1a1920]/90 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <Coins className="w-3.5 h-3.5" />
                  Dirty Cash Cut
                </span>
                <span className="font-mono-num text-[10px] text-zinc-400">
                  {dailyMesoCount}/5
                </span>
              </div>
              <div className="font-mono-num text-[10px] text-zinc-300">
                +25 Front REP · +20 Pts
              </div>
              <button
                type="button"
                disabled={dailyMesoCount >= 5 || save.mesos < mesoDonateCost}
                onClick={() => void onDonateShrine('mesos')}
                className={`w-full min-h-[38px] rounded-lg px-2 py-1.5 font-mono-num text-xs font-bold ${
                  dailyMesoCount < 5 && save.mesos >= mesoDonateCost
                    ? 'bg-emerald-400 text-[#121216] hover:bg-emerald-300 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {dailyMesoCount >= 5 ? 'Daily Maxed' : `$${formatNum(mesoDonateCost)}`}
              </button>
            </div>

            <div className="rounded-xl border border-amber-500/40 bg-[#1a1920]/90 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Gem className="w-3.5 h-3.5" />
                  Gold Bar Cut
                </span>
                <span className="font-mono-num text-[10px] text-zinc-400">
                  {dailyDiaCount}/3
                </span>
              </div>
              <div className="font-mono-num text-[10px] text-zinc-300">
                +70 Front REP · +60 Pts
              </div>
              <button
                type="button"
                disabled={dailyDiaCount >= 3 || save.diamonds < 50}
                onClick={() => void onDonateShrine('diamonds')}
                className={`w-full min-h-[38px] rounded-lg px-2 py-1.5 font-mono-num text-xs font-bold ${
                  dailyDiaCount < 3 && save.diamonds >= 50
                    ? 'bg-amber-400 text-[#121216] hover:bg-amber-300 cursor-pointer'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {dailyDiaCount >= 3 ? 'Daily Maxed' : '50 G'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 3: TURF WAR (3-LANE CITY DISTRICT TAKEOVER) ==================== */}
      {subTab === 'war' && (
        <div className="space-y-2.5">
          {!clanWar ? (
            <div className="rounded-xl border border-[#8B1E24]/70 bg-gradient-to-b from-[#8B1E24]/30 to-[#1a1920] p-4 text-center space-y-2.5">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-rose-400/60 bg-[#8B1E24]/60 text-rose-200">
                <Swords className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  Turf War: City District Takeover
                </h3>
                <p className="mt-1 text-[11px] text-zinc-300 leading-relaxed">
                  Battle a rival Crime Family across <span className="text-emerald-300 font-semibold">Little Italy</span>,{' '}
                  <span className="text-amber-300 font-semibold">The Docks</span>, and{' '}
                  <span className="text-rose-300 font-semibold">Downtown Casino</span>. Control 2+ districts to crack the Mythic Spoils Crate!
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(save.tainted)}
                onClick={() => void onStartWar()}
                className={`w-full min-h-[42px] rounded-xl px-4 py-2 font-display text-sm font-bold shadow-lg ${
                  save.tainted
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-gradient-to-b from-rose-600 to-[#8B1E24] text-white hover:brightness-110 cursor-pointer'
                }`}
              >
                {save.tainted ? 'Locked (Integrity Flag)' : 'Match Rival Family & Start 24h Turf War'}
              </button>
            </div>
          ) : (
            <>
              {/* War Matchup Scoreboard & Timer */}
              <div className="rounded-xl border border-[#8B1E24]/70 bg-[#1a1920]/95 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ClanCrest crest={clan.crest} size={28} />
                    <div className="min-w-0">
                      <div className="font-mono-num text-[11px] font-bold text-emerald-400 truncate">
                        [{clan.tag}] {lanesWon}/3
                      </div>
                      <div className="font-mono-num text-[9px] text-zinc-400">
                        CP {formatNum(clan.totalCp)}
                      </div>
                    </div>
                  </div>

                  <div className="text-center shrink-0">
                    <div className="font-mono-num text-[10px] font-bold text-amber-300">
                      {clanWar.status === 'ENDED' ? 'TURF SETTLED' : warClockLabel}
                    </div>
                    <div className="font-mono-num text-[9px] text-zinc-300">
                      Hits: <span className="font-bold text-white">{clanWar.attacksRemaining}/{clanWar.maxAttacks}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0 text-right">
                    <div className="min-w-0">
                      <div className="font-mono-num text-[11px] font-bold text-rose-400 truncate">
                        [{clanWar.rivalClan.tag}]
                      </div>
                      <div className="font-mono-num text-[9px] text-zinc-400">
                        CP {formatNum(clanWar.rivalClan.totalCp)}
                      </div>
                    </div>
                    <ClanCrest crest={clanWar.rivalClan.crest} size={28} />
                  </div>
                </div>

                {/* Ended War Crate CTA */}
                {clanWar.status === 'ENDED' && clanWar.chestReward && !clanWar.chestReward.claimed && (
                  <button
                    type="button"
                    onClick={onOpenWarChest}
                    className="mt-2.5 w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 via-amber-500 to-rose-500 px-3 py-2 font-display text-xs font-bold text-[#121216] shadow-lg hover:brightness-110 cursor-pointer"
                  >
                    <Trophy className="w-4 h-4" />
                    <span>Open Turf War Spoils Crate!</span>
                  </button>
                )}
              </div>

              {/* 3-District Turf Map Selector */}
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(clanWar.lanes) as WarLaneId[]).map((lid) => {
                  const lane = clanWar.lanes[lid];
                  const active = selectedLane === lid;
                  const ctrlBadge =
                    lane.controlledBy === 'ally'
                      ? 'text-emerald-400'
                      : lane.controlledBy === 'enemy'
                        ? 'text-rose-400'
                        : 'text-amber-300';
                  const enemyPct = Math.round((lane.citadelHp / Math.max(1, lane.citadelMaxHp)) * 100);
                  const isAssignedHere = clanWar.playerAssignedLane === lid;

                  return (
                    <button
                      key={lid}
                      type="button"
                      onClick={() => setSelectedLane(lid)}
                      className={`rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-950/35'
                          : 'border-zinc-800 bg-[#1a1920]/85 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-white">
                        <span className="truncate">{lane.name}</span>
                        {isAssignedHere && (
                          <Shield className="w-2.5 h-2.5 text-amber-300 shrink-0" />
                        )}
                      </div>
                      <div className={`text-[9px] font-bold ${ctrlBadge}`}>
                        {lane.controlledBy === 'ally'
                          ? 'Controlled'
                          : lane.controlledBy === 'enemy'
                            ? 'Rival Hold'
                            : 'Contested'}
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-zinc-800">
                        <div
                          className="h-full bg-[#8B1E24]"
                          style={{ width: `${enemyPct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected District Detail */}
              {activeLane && (
                <div className="rounded-xl border border-zinc-800 bg-[#1a1920]/90 p-2.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display text-xs font-bold text-white">
                        {activeLane.name}
                      </div>
                      <div className="text-[10px] text-zinc-400">{activeLane.subtitle}</div>
                    </div>

                    {clanWar.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => void onAssignDefense(activeLane.id)}
                        className={`min-h-[32px] rounded-md border px-2 py-1 text-[10px] font-bold cursor-pointer whitespace-nowrap ${
                          clanWar.playerAssignedLane === activeLane.id
                            ? 'border-emerald-400 bg-emerald-950/60 text-emerald-300'
                            : 'border-amber-400/70 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50'
                        }`}
                      >
                        {clanWar.playerAssignedLane === activeLane.id
                          ? 'Guarding Turf'
                          : 'Post Lookout'}
                      </button>
                    )}
                  </div>

                  {/* Safe HP Comparison */}
                  <div className="grid grid-cols-2 gap-2 font-mono-num text-[10px]">
                    <div className="rounded-md border border-zinc-800 bg-[#121216] p-1.5">
                      <div className="flex justify-between text-emerald-400 font-bold">
                        <span>Our Crew</span>
                        <span>{formatNum(activeLane.ourCitadelHp)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-zinc-800">
                        <div
                          className="h-full bg-emerald-400"
                          style={{
                            width: `${Math.round(
                              (activeLane.ourCitadelHp / Math.max(1, activeLane.ourCitadelMaxHp)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-[#121216] p-1.5">
                      <div className="flex justify-between text-rose-400 font-bold">
                        <span>Rival Safe</span>
                        <span>{formatNum(activeLane.citadelHp)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-zinc-800">
                        <div
                          className="h-full bg-[#8B1E24]"
                          style={{
                            width: `${Math.round(
                              (activeLane.citadelHp / Math.max(1, activeLane.citadelMaxHp)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rival Enforcers + Family Guardian Safe */}
                  {(() => {
                    const allDefeated = activeLane.enemyDefenders.every((d) => d.defeated);
                    const canAttack =
                      !save.tainted &&
                      clanWar.status === 'ACTIVE' &&
                      clanWar.attacksRemaining > 0 &&
                      !busyInCombat;

                    return (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-zinc-300">
                          Turf Enforcers ({activeLane.enemyDefenders.filter((d) => !d.defeated).length} Left)
                        </div>
                        {activeLane.enemyDefenders.map((def) => (
                          <div
                            key={def.playerId}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 ${
                              def.defeated
                                ? 'border-zinc-800 bg-[#121216]/50 opacity-55'
                                : 'border-zinc-800 bg-[#121216]/90'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SpritePreview
                                kind="hero"
                                id={def.job}
                                weaponId={def.snapshot.equippedWeaponId}
                                cosmetics={def.snapshot.equippedCosmetics}
                                size={24}
                              />
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate">
                                  {def.ign}
                                </div>
                                <div className="font-mono-num text-[9px] text-zinc-400">
                                  Lv.{def.level} {JOBS[def.job].name} · CP {formatNum(def.combatPower)}
                                </div>
                              </div>
                            </div>

                            {def.defeated ? (
                              <span className="font-mono-num text-[10px] font-bold text-emerald-400 shrink-0">
                                Whacked
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!canAttack}
                                onClick={() => onAttackDefender(activeLane.id, def)}
                                className={`min-h-[30px] shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${
                                  canAttack
                                    ? 'bg-[#8B1E24] text-white hover:bg-rose-700 cursor-pointer'
                                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                }`}
                              >
                                Hit (-1)
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Family Guardian Safe */}
                        <div
                          className={`rounded-lg border p-2 ${
                            allDefeated
                              ? 'border-amber-400/70 bg-gradient-to-r from-[#8B1E24]/45 to-amber-950/40'
                              : 'border-zinc-800 bg-[#121216]/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
                                <Flame className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Family Guardian Safe</span>
                              </div>
                              <div className="font-mono-num text-[10px] text-zinc-300">
                                Armor {formatNum(activeLane.enemyStatueHp)} / {formatNum(activeLane.enemyStatueMaxHp)}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!allDefeated || !canAttack || activeLane.enemyStatueHp <= 0}
                              onClick={() => onRallyStatue(activeLane.id)}
                              className={`min-h-[32px] shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${
                                allDefeated && canAttack && activeLane.enemyStatueHp > 0
                                  ? 'bg-gradient-to-b from-amber-400 to-rose-600 text-[#121216] hover:brightness-110 cursor-pointer'
                                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                              }`}
                            >
                              {activeLane.enemyStatueHp <= 0
                                ? 'Cracked'
                                : allDefeated
                                  ? 'Crack Safe!'
                                  : 'Clear Enforcers'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Turf War Action Controls & Log */}
              {clanWar.status === 'ACTIVE' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void onAdvanceWarSkirmish()}
                    className="min-h-[34px] rounded-lg border border-zinc-700 bg-[#1a1920] px-2 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-amber-400 cursor-pointer"
                  >
                    Simulate Crew Drive-By
                  </button>
                  <button
                    type="button"
                    onClick={() => void onResolveWar()}
                    className="min-h-[34px] rounded-lg border border-amber-400/70 bg-amber-950/50 px-2 py-1.5 text-[11px] font-bold text-amber-200 hover:bg-amber-900/60 cursor-pointer"
                  >
                    Settle Turf & Claim Crate
                  </button>
                </div>
              )}

              {clanWar.battleLog.length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-[#121216]/90 p-2 space-y-1">
                  <div className="text-[10px] font-bold text-zinc-400">Recent Turf Log</div>
                  {clanWar.battleLog.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="text-[10px] text-zinc-300 leading-snug">
                      · {entry.text}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== COLLAPSIBLE LIVE SPEAKEASY FEED ==================== */}
      <div className="rounded-xl border border-zinc-700/80 bg-[#1a1920]/95 overflow-hidden">
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-zinc-800/70 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <MessageSquare className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="text-[10px] font-bold text-amber-300 shrink-0">SPEAKEASY FEED</span>
            <span className="truncate text-[10px] text-zinc-300">
              {latestMsg
                ? latestMsg.kind === 'system'
                  ? `✦ ${latestMsg.text}`
                  : `${latestMsg.senderIgn}: ${latestMsg.text}`
                : 'Wire quiet'}
            </span>
          </div>
          {chatOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
        </button>

        {chatOpen && (
          <div className="border-t border-zinc-800 p-2 space-y-2 bg-[#121216]/90">
            <div className="hud-scroll max-h-36 overflow-y-auto space-y-1 pr-1">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded px-2 py-1 text-[10px] leading-snug ${
                    msg.kind === 'system'
                      ? 'bg-amber-950/45 border border-amber-500/35 text-amber-200 font-semibold'
                      : 'bg-[#1a1920] text-zinc-200'
                  }`}
                >
                  {msg.kind === 'system' ? (
                    <span>✦ {msg.text}</span>
                  ) : (
                    <>
                      <span className="font-bold text-amber-300">{msg.senderIgn}: </span>
                      <span>{msg.text}</span>
                    </>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChatSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                maxLength={140}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Pass word to the Family..."
                className="flex-1 rounded-lg border border-zinc-700 bg-[#1a1920] px-2.5 py-1.5 text-[16px] text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-[#121216] hover:bg-amber-300 cursor-pointer disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
