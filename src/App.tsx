import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Compass, Flame, Gem, KeyRound, Shield, Sparkles, Sword, Swords } from 'lucide-react';
import {
  ArenaResultModal,
  ClanWarChestModal,
  GachaRevealModal,
  OfflineGainsModal,
  PauseModal,
  PlayerProfileModal,
  SettingsModal,
  StarForceModal,
  TranscendenceModal,
  WagerEscrowModal,
} from './components/Modals';
import { TabArena } from './components/TabArena';
import { TabCharacter } from './components/TabCharacter';
import { TabClan } from './components/TabClan';
import { TabDungeons } from './components/TabDungeons';
import { TabSkills } from './components/TabSkills';
import { TabSummon } from './components/TabSummon';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { simulateArenaDuel } from './game/arenaSim';
import { sfx } from './game/audio';
import {
  ARENA_CURRENCY_META,
  ARENA_HOUSE_FEE_PCT,
  COSMETICS,
  createInitialSaveState,
  EXPEDITION_COOLDOWN_MS,
  getZoneForStage,
  JOBS,
  MAPLE_RANKS,
  RELICS,
  SAVE_STORAGE_KEY,
  TRANSCEND_UNLOCK_STAGE,
  WEAPONS,
} from './game/constants';
import { MapleEngine } from './game/engine';
import { LiveChallengeResponse, NETWORK_CONFIG, networkManager } from './game/network';
import {
  advanceQuestProgress,
  applyExpGain,
  applyStarForceAttempt,
  autoMergeAndEquipBest,
  buildCombatSnapshot,
  calculateOfflineGains,
  claimCurrentQuest,
  computeBulkUpgrade,
  computeDataChecksum,
  computeStats,
  formatNum,
  getEffectiveLiveOpsBonuses,
  isTranscendUnlocked,
  loadSaveState,
  performStyleBoxPull,
  performSummon,
  performTranscendence,
  persistSaveState,
  regenDungeonKeys,
  sanitizeNum,
  setActiveClanShrineLevel,
  setActiveLiveOpsConfig,
  upgradeTranscendSkill,
} from './game/progression';
import {
  detectImpossibleGain,
  performStartupWipeIfNeeded,
  SaveMutationSource,
  sealSaveState,
  verifySaveIntegrity,
} from './game/security';
import { SafeStorage } from './game/storage';
import {
  ArenaCurrency,
  ArenaMatchHistoryItem,
  ArenaMatchResult,
  ArenaOpponent,
  BuyMultiplier,
  ClanChatMessage,
  ClanCrest,
  ClanDirectoryEntry,
  ClanInfo,
  ClanRank,
  ClanSiegeResult,
  ClanWarState,
  CompanionId,
  CosmeticId,
  DuelType,
  GachaPullResult,
  GameMode,
  JobId,
  LiveOpsConfig,
  LiveSnapshot,
  NetworkMode,
  OfflineGains,
  PlayerSaveState,
  PlayerWagerSubmission,
  ProfileBorderId,
  ProfileEmblemId,
  RelicId,
  StatUpgradeKey,
  TranscendSkillId,
  WarDefender,
  WarLaneId,
} from './game/types';

// One-time startup wipe clearing legacy saves & bot clans before state hydration
performStartupWipeIfNeeded();

type HudTab = 'character' | 'skills' | 'summon' | 'dungeons' | 'arena' | 'clan';

export default function App() {
  const initialLoadedRef = useRef<{
    save: PlayerSaveState;
    hasExisting: boolean;
    integrityFailed: boolean;
  }>({
    save: createInitialSaveState(),
    hasExisting: false,
    integrityFailed: false,
  });

  // Load & verify initial save once lazily
  const [initialized, setInitialized] = useState(false);
  const [save, setSave] = useState<PlayerSaveState>(() => {
    const loaded = loadSaveState();
    if (loaded) {
      const regened = regenDungeonKeys(loaded);
      const integrity = verifySaveIntegrity(regened, true);
      const checked: PlayerSaveState = integrity.ok
        ? regened
        : {
            ...regened,
            tainted: true,
            integrityFlags: [...(regened.integrityFlags || []), ...integrity.reasons].slice(-8),
          };
      const sealed = sealSaveState(checked);
      initialLoadedRef.current = {
        save: sealed,
        hasExisting: true,
        integrityFailed: !integrity.ok,
      };
      return sealed;
    }
    const fresh = sealSaveState(createInitialSaveState());
    initialLoadedRef.current = { save: fresh, hasExisting: false, integrityFailed: false };
    return fresh;
  });

  const [gameMode, setGameMode] = useState<GameMode>('TITLE_MENU');
  const [activeTab, setActiveTab] = useState<HudTab>('character');
  const [buyMult, setBuyMult] = useState<BuyMultiplier>(1);

  const [offlineGains, setOfflineGains] = useState<OfflineGains | null>(null);
  const [gachaResults, setGachaResults] = useState<GachaPullResult[] | null>(null);
  const [starForceWeaponId, setStarForceWeaponId] = useState<string | null>(null);
  const [showTranscendModal, setShowTranscendModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(() => !save.profile?.ign);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveOps, setLiveOps] = useState<LiveOpsConfig | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800
  );
  const [networkMode, setNetworkMode] = useState<NetworkMode>(() => networkManager.getMode());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastChecksum, setLastChecksum] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [opponents, setOpponents] = useState<ArenaOpponent[]>([]);
  const [loadingOpponents, setLoadingOpponents] = useState(false);
  const [escrowOpponent, setEscrowOpponent] = useState<ArenaOpponent | null>(null);
  const [arenaResult, setArenaResult] = useState<ArenaMatchResult | null>(null);
  const [arenaSpeed, setArenaSpeed] = useState<1 | 2>(1);
  const [clanInfo, setClanInfo] = useState<ClanInfo | null>(null);
  const [clanDirectory, setClanDirectory] = useState<ClanDirectoryEntry[]>([]);
  const [clanChat, setClanChat] = useState<ClanChatMessage[]>([]);
  const [clanWar, setClanWar] = useState<ClanWarState | null>(null);
  const [showWarChestModal, setShowWarChestModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<LiveSnapshot>({
    heroHp: 200,
    heroMaxHp: 200,
    combatMode: 'FARMING',
    bossName: '',
    bossHp: 0,
    bossMaxHp: 1,
    bossTimer: 0,
    dungeonScore: 0,
    skillCooldowns: {},
    dpsEstimate: 25,
    realDps: 0,
    feverCharge: 0,
    feverTimer: 0,
    zakumArmsAlive: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MapleEngine | null>(null);
  const saveRef = useRef<PlayerSaveState>(save);
  saveRef.current = save;
  const snapshotRef = useRef<LiveSnapshot>(snapshot);
  snapshotRef.current = snapshot;
  const pendingWagersRef = useRef<Map<string, PlayerWagerSubmission>>(new Map());

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const updateSave = useCallback(
    (
      updater: PlayerSaveState | ((prev: PlayerSaveState) => PlayerSaveState),
      source: SaveMutationSource = 'ui'
    ) => {
      let flaggedReason: string | null = null;
      setSave((prev) => {
        const candidate = typeof updater === 'function' ? updater(prev) : updater;
        if (candidate === prev) return prev;
        const jump = detectImpossibleGain(prev, candidate, source);
        let next = candidate;
        if (jump.tainted) {
          flaggedReason = jump.reason || 'INTEGRITY_VIOLATION';
          const prevFlags = candidate.integrityFlags || [];
          const nextFlags =
            jump.reason && !prevFlags.includes(jump.reason)
              ? [...prevFlags, jump.reason].slice(-8)
              : prevFlags;
          next = {
            ...candidate,
            tainted: true,
            integrityFlags: nextFlags,
          };
        }
        return sealSaveState(next);
      });
      if (flaggedReason) {
        showToast(`Integrity Lock: ${flaggedReason}`);
      }
    },
    [showToast]
  );

  const markTainted = useCallback(
    (reason: string) => {
      setSave((prev) => {
        const nextFlags = prev.integrityFlags?.includes(reason)
          ? prev.integrityFlags
          : [...(prev.integrityFlags || []), reason].slice(-8);
        const sealed = sealSaveState({
          ...prev,
          tainted: true,
          integrityFlags: nextFlags,
        });
        persistSaveState(sealed);
        return sealed;
      });
      showToast(`Integrity Lock: ${reason}`);
    },
    [showToast]
  );

  const refreshOpponents = useCallback(async (overrideSave?: PlayerSaveState) => {
    const targetSave = overrideSave || saveRef.current;
    const cp = computeStats(targetSave).combatPower;
    setLoadingOpponents(true);
    try {
      const list = await networkManager.fetchArenaOpponents(
        cp,
        targetSave.profile?.playerId || 'local',
        targetSave.level
      );
      setOpponents(list);
    } finally {
      setLoadingOpponents(false);
    }
  }, []);

  const handleArenaMatchComplete = useCallback(
    async (match: ArenaMatchResult) => {
      const submission = pendingWagersRef.current.get(match.matchId);
      pendingWagersRef.current.delete(match.matchId);

      if (!submission) {
        showToast('Missing signed wager payload — match rejected.');
        return;
      }

      const submitRes = await networkManager.submitWagerMatch(saveRef.current, submission);
      if (!submitRes.ok || !submitRes.verifiedMatch) {
        if (submitRes.flaggedReasons.length > 0) {
          markTainted(submitRes.flaggedReasons[0]);
        } else {
          showToast(submitRes.error || 'Wager verification failed.');
        }
        return;
      }

      const resolvedMatch = submitRes.verifiedMatch;
      const isWin = resolvedMatch.winner === 'player';
      if (isWin) {
        sfx.playLevelUp();
      } else {
        sfx.playClick();
      }

      const netDelta = isWin ? resolvedMatch.payout - resolvedMatch.stake : -resolvedMatch.stake;
      const historyItem: ArenaMatchHistoryItem = {
        matchId: resolvedMatch.matchId,
        rivalIgn: resolvedMatch.rival.ign,
        rivalClan: resolvedMatch.rival.clanTag,
        rivalJob: resolvedMatch.rival.job,
        rivalCp: resolvedMatch.rival.combatPower,
        duelType: resolvedMatch.duelType,
        currency: resolvedMatch.currency,
        stake: resolvedMatch.stake,
        netDelta,
        winner: resolvedMatch.winner,
        timestamp: Date.now(),
      };

      const prev = saveRef.current;
      const currentBal = prev[resolvedMatch.currency];
      const nextBal = isWin ? sanitizeNum(currentBal + resolvedMatch.payout, currentBal) : currentBal;
      const nextSave = sealSaveState({
        ...prev,
        [resolvedMatch.currency]: nextBal,
        arenaStats: {
          wins: prev.arenaStats.wins + (isWin ? 1 : 0),
          losses: prev.arenaStats.losses + (isWin ? 0 : 1),
          streak: isWin ? prev.arenaStats.streak + 1 : 0,
          totalWonDiamonds:
            prev.arenaStats.totalWonDiamonds +
            (isWin && resolvedMatch.currency === 'diamonds'
              ? resolvedMatch.payout - resolvedMatch.stake
              : 0),
        },
        arenaHistory: [historyItem, ...(prev.arenaHistory || [])].slice(0, 15),
      });

      setSave(nextSave);
      persistSaveState(nextSave);
      setArenaResult(resolvedMatch);

      const syncRes = await networkManager.syncSave(nextSave, 'post_match');
      setLastSyncedAt(syncRes.syncedAt);
      setLastChecksum(syncRes.checksum);

      if (isWin && (resolvedMatch.stake >= 500 || resolvedMatch.payout >= 1000) && nextSave.clanId) {
        const curLabel = ARENA_CURRENCY_META[resolvedMatch.currency].label;
        const nextChat = await networkManager.broadcastClanSystemEvent(
          nextSave.clanId,
          `[1v1 FIGHT] ${nextSave.profile.ign} flattened [${resolvedMatch.rival.clanTag}] ${resolvedMatch.rival.ign} for ${formatNum(resolvedMatch.payout)} ${curLabel}!`
        );
        setClanChat(nextChat);
      }

      if (!submitRes.verified || !syncRes.deltaValid) {
        const combinedFlags = [...submitRes.flaggedReasons, ...syncRes.flaggedReasons];
        if (combinedFlags.length > 0) {
          updateSave(
            (cur) => ({
              ...cur,
              integrityFlags: [...(cur.integrityFlags || []), ...combinedFlags].slice(-8),
            }),
            'arena_payout'
          );
        }
      }
    },
    [markTainted, showToast, updateSave]
  );

  const arenaMatchCompleteRef = useRef(handleArenaMatchComplete);
  arenaMatchCompleteRef.current = handleArenaMatchComplete;

  const handleClanSiegeComplete = useCallback(
    async (result: ClanSiegeResult) => {
      if (result.victory || result.isStatueKill) {
        sfx.playLevelUp();
      } else {
        sfx.playClick();
      }

      const cur = saveRef.current;
      const nextSave = sealSaveState({
        ...cur,
        warMedals: (cur.warMedals || 0) + result.medalsEarned,
      });
      setSave(nextSave);
      persistSaveState(nextSave);

      if (cur.clanId) {
        const res = await networkManager.recordWarBattleOutcome(nextSave, cur.clanId, result);
        if (res.war) setClanWar(res.war);
        if (res.clan) setClanInfo(res.clan);
        const nextChat = await networkManager.fetchClanChat(cur.clanId);
        setClanChat(nextChat);
      }

      showToast(
        result.targetType === 'statue'
          ? `Safe Hit: ${formatNum(result.siegeDamage)} Turf DMG · +${result.medalsEarned} Medallions`
          : result.victory
            ? `Whacked ${result.defenderIgn || 'Defender'}! -${formatNum(result.siegeDamage)} Safe HP`
            : `Turf Clash: -${formatNum(result.siegeDamage)} Safe HP · +${result.medalsEarned} Medallions`
      );
    },
    [showToast]
  );

  const clanSiegeCompleteRef = useRef(handleClanSiegeComplete);
  clanSiegeCompleteRef.current = handleClanSiegeComplete;

  // Initialize audio mixer & offline gains / integrity notice once
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      sfx.setMuted(save.muted);
      sfx.setSfxVolume(save.sfxVolume ?? 0.75);
      sfx.setBgmVolume(save.bgmVolume ?? 0.35);
      if (initialLoadedRef.current.integrityFailed) {
        showToast('Save checksum mismatch — Fight Club & Turf Wars locked.');
      }
      if (initialLoadedRef.current.hasExisting) {
        const gains = calculateOfflineGains(initialLoadedRef.current.save);
        if (gains) setOfflineGains(gains);
      }
    }
  }, [initialized, save.bgmVolume, save.muted, save.sfxVolume, showToast]);

  // Dynamic itch.io iframe / mobile portrait viewport height listener
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Poll Remote LiveOps Config on launch and every 5 minutes
  useEffect(() => {
    let cancelled = false;
    const pollLiveOps = async () => {
      const cfg = await networkManager.fetchLiveOpsConfig();
      if (!cancelled) {
        setLiveOps(cfg);
        setActiveLiveOpsConfig(cfg);
      }
    };
    void pollLiveOps();
    const id = window.setInterval(() => {
      void pollLiveOps();
    }, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Sync Chiptune BGM playback lifecycle with active play & mute state
  useEffect(() => {
    if (gameMode === 'PLAYING' && !save.muted) {
      sfx.startBgm();
    } else {
      sfx.stopBgm();
    }
    return () => {
      sfx.stopBgm();
    };
  }, [gameMode, save.muted]);

  // Mount isolated 60fps canvas engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new MapleEngine(canvas, saveRef.current, {
      onKillMonster: (isBoss, mesos, exp, diamonds, chaosCores) => {
        let leveledTo: number | null = null;
        updateSave((prev) => {
          let next: PlayerSaveState = {
            ...prev,
            mesos: sanitizeNum(prev.mesos + mesos, prev.mesos),
            diamonds: prev.diamonds + diamonds,
            chaosCores: (prev.chaosCores || 0) + chaosCores,
            statsTotals: {
              ...prev.statsTotals,
              monstersKilled: prev.statsTotals.monstersKilled + 1,
              bossesDefeated: prev.statsTotals.bossesDefeated + (isBoss ? 1 : 0),
            },
          };
          const expRes = applyExpGain(next, exp);
          next = expRes.save;
          if (expRes.leveledUp) {
            leveledTo = next.level;
          }
          next = advanceQuestProgress(next, 'kill_monsters', 1);
          if (isBoss) {
            next = advanceQuestProgress(next, 'defeat_boss', 1);
          }
          return next;
        }, 'kill');
        if (leveledTo !== null) {
          sfx.playLevelUp();
          showToast(`Level Up! Lv.${leveledTo} (+1 Street Cred)`);
        }
      },
      onWaveCleared: () => {
        const prev = saveRef.current;
        const willBeBossReady = prev.bossReady || prev.wave + 1 > 10;
        updateSave((cur) => {
          let nextWave = cur.wave + 1;
          let bossReady = cur.bossReady;
          if (nextWave > 10) {
            nextWave = 10;
            bossReady = true;
          }
          let next = { ...cur, wave: nextWave, bossReady };
          next = advanceQuestProgress(next, 'clear_waves', 1);
          return next;
        }, 'tick');
        if (willBeBossReady && prev.autoBoss && engineRef.current) {
          window.setTimeout(() => {
            engineRef.current?.triggerBossChallenge();
          }, 250);
        }
      },
      onBossVictory: (diamonds, mesos) => {
        sfx.playLevelUp();
        const clearedStage = saveRef.current.stage;
        const nextStagePreview = clearedStage + 1;
        const nextZone = getZoneForStage(nextStagePreview);
        updateSave(
          (prev) => ({
            ...prev,
            stage: prev.stage + 1,
            highestStageCleared: Math.max(prev.highestStageCleared || 0, prev.stage),
            wave: 1,
            bossReady: false,
            diamonds: prev.diamonds + diamonds,
            mesos: sanitizeNum(prev.mesos + mesos, prev.mesos),
            starStones: prev.starStones + 3,
            styleTickets: prev.styleTickets + 1,
          }),
          'boss'
        );
        if (clearedStage === TRANSCEND_UNLOCK_STAGE) {
          showToast('Block 30 Cleared! Go to the Mattresses Unlocked in Boss Tab!');
        } else if (clearedStage === 50) {
          showToast('Block 50 Cleared! Federal Lockdown Unlocked!');
        } else {
          const stageLabel = nextZone.isChaos
            ? `${nextZone.worldLabel}-1`
            : `Block ${nextStagePreview}`;
          showToast(`Boss Eliminated! ${stageLabel} · +${diamonds} G · +3 Parts`);
        }
      },
      onBossFailed: () => {
        showToast('Boss slipped away — returning to Wave 10 turf');
      },
      onDungeonComplete: (mode, reward) => {
        sfx.playQuestClaim();
        if (mode === 'DUNGEON_MESO') {
          updateSave((prev) => ({ ...prev, mesos: sanitizeNum(prev.mesos + reward, prev.mesos) }), 'dungeon');
          showToast(`Armored Truck Hijack Complete! +$${formatNum(reward)} Cash`);
        } else {
          const bonusTickets = reward >= 350 ? 2 : 1;
          updateSave(
            (prev) => ({
              ...prev,
              diamonds: prev.diamonds + reward,
              summonTickets: prev.summonTickets + bonusTickets,
            }),
            'dungeon'
          );
          showToast(`Diamond District Vault Complete! +${formatNum(reward)} Gold Bars & +${bonusTickets} Contract`);
        }
      },
      onZakumVictory: (droppedRelic, diamonds, starStones, styleTickets) => {
        sfx.playLevelUp();
        const relicDef = RELICS[droppedRelic];
        const wasUnlocked = saveRef.current.relics[droppedRelic]?.unlocked;
        updateSave((prev) => {
          const curRelic = prev.relics[droppedRelic] || { unlocked: false, level: 1, count: 0 };
          const nextRelic = curRelic.unlocked
            ? { unlocked: true, level: curRelic.level + 1, count: curRelic.count + 1 }
            : { unlocked: true, level: 1, count: 1 };
          const nextEquipped =
            !curRelic.unlocked &&
            prev.equippedRelics.length < 2 &&
            !prev.equippedRelics.includes(droppedRelic)
              ? [...prev.equippedRelics, droppedRelic]
              : prev.equippedRelics;

          return {
            ...prev,
            diamonds: prev.diamonds + diamonds,
            starStones: prev.starStones + starStones,
            styleTickets: prev.styleTickets + styleTickets,
            relics: {
              ...prev.relics,
              [droppedRelic]: nextRelic,
            },
            equippedRelics: nextEquipped,
          };
        }, 'zakum');
        showToast(
          wasUnlocked
            ? `Federal Reserve Cleared! ${relicDef.name} Lv.+1 · +${starStones} Parts`
            : `Federal Reserve Cleared! Stashed Relic: ${relicDef.name}!`
        );
      },
      onZakumFailed: () => {
        showToast('Federal Reserve Heist timed out — gear up and hit it again!');
      },
      onArenaMatchComplete: (result) => {
        void arenaMatchCompleteRef.current(result);
      },
      onClanSiegeComplete: (result) => {
        void clanSiegeCompleteRef.current(result);
      },
      onSpeedhackDetected: (reason) => {
        markTainted(reason);
      },
      onSnapshot: (snap) => {
        setSnapshot(snap);
      },
    });

    engineRef.current = engine;
    engine.setLowPowerMode(Boolean(saveRef.current.lowPowerMode));
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [markTainted, showToast, updateSave]);

  // Keep engine synced whenever save, lowPowerMode, or gameMode updates
  useEffect(() => {
    engineRef.current?.syncSave(save);
    engineRef.current?.setLowPowerMode(Boolean(save.lowPowerMode));
  }, [save]);

  useEffect(() => {
    engineRef.current?.setGameMode(gameMode);
  }, [gameMode]);

  // Periodic localStorage persistence + key regen
  useEffect(() => {
    const id = window.setInterval(() => {
      setSave((prev) => {
        const regened = sealSaveState(regenDungeonKeys(prev));
        persistSaveState(regened);
        return regened;
      });
    }, 4000);
    const onUnload = () => persistSaveState(sealSaveState(saveRef.current));
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  // 60-second Cloud Combat Snapshot auto-sync
  useEffect(() => {
    const runIntervalSync = async () => {
      const cur = saveRef.current;
      if (!cur.profile?.ign) return;
      const res = await networkManager.syncSave(cur, 'interval');
      setLastSyncedAt(res.syncedAt);
      setLastChecksum(res.checksum);
      if (!res.deltaValid && res.flaggedReasons.length > 0) {
        updateSave(
          (prev) => ({
            ...prev,
            integrityFlags: [...(prev.integrityFlags || []), ...res.flaggedReasons].slice(-8),
          }),
          'tick'
        );
      }
    };
    const id = window.setInterval(() => {
      void runIntervalSync();
    }, NETWORK_CONFIG.AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [updateSave]);

  // Ensure Colosseum opponents are loaded on startup or when entering Arena tab
  useEffect(() => {
    if (activeTab === 'arena' && opponents.length === 0 && !loadingOpponents) {
      void refreshOpponents();
    }
  }, [activeTab, opponents.length, loadingOpponents, refreshOpponents]);

  // Hydrate Clan Hall, Directory, Chat & War State and sync global Clan Shrine level
  const hydrateClanState = useCallback(async (targetSave?: PlayerSaveState) => {
    const s = targetSave || saveRef.current;
    const dir = await networkManager.fetchClanDirectory();
    setClanDirectory(dir);
    if (!s.clanId) {
      setClanInfo(null);
      setClanChat([]);
      setClanWar(null);
      setActiveClanShrineLevel(0);
      return;
    }
    const info = await networkManager.getCurrentClan(s);
    setClanInfo(info);
    setActiveClanShrineLevel(info?.shrine.level || 0);
    if (info) {
      const [chat, war] = await Promise.all([
        networkManager.fetchClanChat(info.clanId),
        networkManager.getClanWar(info.clanId, info),
      ]);
      setClanChat(chat);
      setClanWar(war);
    } else {
      setClanChat([]);
      setClanWar(null);
    }
  }, []);

  useEffect(() => {
    void hydrateClanState(saveRef.current);
  }, [save.clanId, save.profile?.playerId, hydrateClanState]);

  useEffect(() => {
    setActiveClanShrineLevel(clanInfo?.shrine.level || 0);
  }, [clanInfo?.shrine.level]);

  // Handlers
  const handleStartGame = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    setGameMode('PLAYING');
  }, []);

  const handleSwitchJob = useCallback(
    (job: JobId) => {
      sfx.unlock();
      sfx.playClick();
      updateSave((prev) => ({ ...prev, job }), 'ui');
    },
    [updateSave]
  );

  const handleToggleMute = useCallback(() => {
    sfx.unlock();
    updateSave((prev) => {
      const nextMuted = !prev.muted;
      sfx.setMuted(nextMuted);
      return { ...prev, muted: nextMuted };
    }, 'ui');
  }, [updateSave]);

  const handleChangeSfxVolume = useCallback(
    (v: number) => {
      sfx.unlock();
      sfx.setSfxVolume(v);
      updateSave((prev) => ({ ...prev, sfxVolume: v }), 'ui');
    },
    [updateSave]
  );

  const handleChangeBgmVolume = useCallback(
    (v: number) => {
      sfx.unlock();
      sfx.setBgmVolume(v);
      updateSave((prev) => ({ ...prev, bgmVolume: v }), 'ui');
    },
    [updateSave]
  );

  const handleToggleLowPower = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    updateSave((prev) => ({ ...prev, lowPowerMode: !prev.lowPowerMode }), 'ui');
  }, [updateSave]);

  const handleRedeemPromo = useCallback(
    (code: string) => {
      sfx.unlock();
      const res = networkManager.redeemPromoCode(saveRef.current, code, liveOps);
      if (res.ok && res.save) {
        sfx.playQuestClaim();
        const sealed = sealSaveState(res.save);
        setSave(sealed);
        persistSaveState(sealed);
        showToast(res.message);
      }
      return { ok: res.ok, message: res.message };
    },
    [liveOps, showToast]
  );

  // Desktop keyboard hotkeys ([1]-[4] Skills, [SPACE] Boss, [Q/W/E/R/T/Y] Tabs, [M] Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable)
      ) {
        return;
      }
      if (
        gameMode !== 'PLAYING' ||
        showProfileModal ||
        settingsOpen ||
        showTranscendModal ||
        starForceWeaponId ||
        escrowOpponent ||
        arenaResult ||
        gachaResults ||
        offlineGains ||
        showWarChestModal
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === '1' || key === '2' || key === '3' || key === '4') {
        const idx = Number(key) - 1;
        const job = JOBS[saveRef.current.job];
        const sk = job.skills[idx];
        if (sk && (saveRef.current.skillLevels[sk.id] || 0) > 0) {
          sfx.unlock();
          engineRef.current?.castSkillManual(sk.id);
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (saveRef.current.bossReady && snapshotRef.current.combatMode === 'FARMING') {
          sfx.unlock();
          engineRef.current?.triggerBossChallenge();
        }
        return;
      }

      const tabShortcutMap: Record<string, HudTab> = {
        q: 'character',
        w: 'skills',
        e: 'summon',
        r: 'dungeons',
        t: 'arena',
        y: 'clan',
      };
      if (tabShortcutMap[key]) {
        sfx.unlock();
        sfx.playClick();
        setActiveTab(tabShortcutMap[key]);
        return;
      }

      if (key === 'm') {
        handleToggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    arenaResult,
    escrowOpponent,
    gachaResults,
    gameMode,
    handleToggleMute,
    offlineGains,
    settingsOpen,
    showProfileModal,
    showTranscendModal,
    showWarChestModal,
    starForceWeaponId,
  ]);

  const handleToggleDpsMeter = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    updateSave((prev) => ({ ...prev, showDpsMeter: !prev.showDpsMeter }), 'ui');
  }, [updateSave]);

  const handleStartExpedition = useCallback(() => {
    sfx.unlock();
    const now = Date.now();
    const cur = saveRef.current;
    const cooldownElapsed = now - cur.lastExpeditionAt >= EXPEDITION_COOLDOWN_MS;
    if (!cooldownElapsed && cur.expeditionTickets <= 0) return;

    updateSave((prev) => {
      const cdDone = now - prev.lastExpeditionAt >= EXPEDITION_COOLDOWN_MS;
      if (cdDone) {
        return { ...prev, lastExpeditionAt: now };
      }
      if (prev.expeditionTickets > 0) {
        return { ...prev, expeditionTickets: prev.expeditionTickets - 1 };
      }
      return prev;
    }, 'ui');
    engineRef.current?.triggerZakumExpedition();
  }, [updateSave]);

  const handleUpgradeStat = useCallback(
    (key: StatUpgradeKey) => {
      sfx.unlock();
      updateSave((prev) => {
        const bulk = computeBulkUpgrade(key, prev.upgrades[key], prev.mesos, buyMult);
        if (bulk.levels <= 0 || prev.mesos < bulk.totalCost) return prev;
        sfx.playClick();
        let next: PlayerSaveState = {
          ...prev,
          mesos: prev.mesos - bulk.totalCost,
          upgrades: {
            ...prev.upgrades,
            [key]: prev.upgrades[key] + bulk.levels,
          },
          statsTotals: {
            ...prev.statsTotals,
            totalUpgrades: prev.statsTotals.totalUpgrades + bulk.levels,
          },
        };
        if (key === 'atk') next = advanceQuestProgress(next, 'upgrade_atk', bulk.levels);
        if (key === 'maxHp') next = advanceQuestProgress(next, 'upgrade_hp', bulk.levels);
        return next;
      }, 'ui');
    },
    [buyMult, updateSave]
  );

  const handleUpgradeRank = useCallback(() => {
    sfx.unlock();
    updateSave((prev) => {
      const nextRank = MAPLE_RANKS[prev.mapleRank + 1];
      if (!nextRank || prev.rankPoints < nextRank.cost) return prev;
      sfx.playLevelUp();
      showToast(`Promoted to ${nextRank.name}! Street Presence Upgraded`);
      return {
        ...prev,
        mapleRank: prev.mapleRank + 1,
        rankPoints: prev.rankPoints - nextRank.cost,
      };
    }, 'ui');
  }, [showToast, updateSave]);

  const handleOpenStyleBox = useCallback(
    (useTicket: boolean) => {
      sfx.unlock();
      const res = performStyleBoxPull(saveRef.current, useTicket);
      if (!res) return;
      updateSave(res.save, 'ui');
      setGachaResults([res.result]);
      sfx.playGachaReveal(res.result.rarity);
    },
    [updateSave]
  );

  const handleEquipCosmetic = useCallback(
    (id: CosmeticId) => {
      sfx.unlock();
      sfx.playClick();
      const def = COSMETICS[id];
      updateSave((prev) => {
        if (!prev.cosmeticsUnlocked[id]) return prev;
        const isSame = prev.equippedCosmetics[def.slot] === id;
        return {
          ...prev,
          equippedCosmetics: {
            ...prev.equippedCosmetics,
            [def.slot]: isSame ? null : id,
          },
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleToggleRelic = useCallback(
    (id: RelicId) => {
      sfx.unlock();
      sfx.playClick();
      updateSave((prev) => {
        if (!prev.relics[id]?.unlocked) return prev;
        const equipped = prev.equippedRelics.includes(id);
        if (equipped) {
          return {
            ...prev,
            equippedRelics: prev.equippedRelics.filter((r) => r !== id),
          };
        }
        return {
          ...prev,
          equippedRelics: [...prev.equippedRelics, id].slice(-2),
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleToggleAutoBoss = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    const cur = saveRef.current;
    const willEnable = !cur.autoBoss;
    updateSave((prev) => ({ ...prev, autoBoss: !prev.autoBoss }), 'ui');
    if (willEnable && cur.bossReady) {
      window.setTimeout(() => {
        engineRef.current?.triggerBossChallenge();
      }, 100);
    }
  }, [updateSave]);

  const handleUpgradeRelic = useCallback(
    (id: RelicId) => {
      sfx.unlock();
      updateSave((prev) => {
        const owned = prev.relics[id];
        if (!owned?.unlocked) return prev;
        const stoneCost = 3 + owned.level * 2;
        const mesoCost = Math.floor(600 * Math.pow(1.6, owned.level - 1));
        if (prev.starStones < stoneCost || prev.mesos < mesoCost) return prev;
        sfx.playQuestClaim();
        return {
          ...prev,
          starStones: prev.starStones - stoneCost,
          mesos: prev.mesos - mesoCost,
          relics: {
            ...prev.relics,
            [id]: { ...owned, level: owned.level + 1 },
          },
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleUpgradeRelicWithCores = useCallback(
    (id: RelicId) => {
      sfx.unlock();
      updateSave((prev) => {
        const owned = prev.relics[id];
        if (!owned?.unlocked) return prev;
        const coreCost = 2 + owned.level * 2;
        if ((prev.chaosCores || 0) < coreCost) return prev;
        sfx.playQuestClaim();
        return {
          ...prev,
          chaosCores: (prev.chaosCores || 0) - coreCost,
          relics: {
            ...prev.relics,
            [id]: { ...owned, level: owned.level + 1 },
          },
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleUpgradeTranscendSkill = useCallback(
    (id: TranscendSkillId) => {
      sfx.unlock();
      updateSave((prev) => {
        const next = upgradeTranscendSkill(prev, id);
        return next ?? prev;
      }, 'transcend');
    },
    [updateSave]
  );

  const handleConfirmTranscend = useCallback(() => {
    sfx.unlock();
    const res = performTranscendence(saveRef.current);
    if (!res) return;
    updateSave(res.save, 'transcend');
    engineRef.current?.resetForTranscendence(res.save);
    sfx.playLevelUp();
    const startZone = getZoneForStage(res.startStage);
    const startLabel = startZone.isChaos ? `${startZone.worldLabel}-1` : `Block ${res.startStage}-1`;
    showToast(`Went to the Mattresses! +${formatNum(res.gainedSymbols)} Omertà Seals · ${startLabel}`);
  }, [showToast, updateSave]);

  const handleUpgradeSkill = useCallback(
    (skillId: string) => {
      sfx.unlock();
      updateSave((prev) => {
        const lv = prev.skillLevels[skillId] || 0;
        const job = JOBS[prev.job];
        const sk = job.skills.find((s) => s.id === skillId);
        if (!sk) return prev;
        const cost = lv > 0 ? Math.floor(140 * Math.pow(1.45, lv)) : sk.unlockCost;
        if (prev.mesos < cost) return prev;
        sfx.playClick();
        return {
          ...prev,
          mesos: prev.mesos - cost,
          skillLevels: {
            ...prev.skillLevels,
            [skillId]: lv + 1,
          },
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleToggleEquipCompanion = useCallback(
    (cid: CompanionId) => {
      sfx.unlock();
      sfx.playClick();
      updateSave((prev) => {
        if (!prev.companions[cid]?.unlocked) return prev;
        const currentlyEquipped = prev.equippedCompanions.includes(cid);
        if (currentlyEquipped) {
          return {
            ...prev,
            equippedCompanions: prev.equippedCompanions.filter((id) => id !== cid),
          };
        }
        const nextList = [...prev.equippedCompanions, cid].slice(-2);
        return {
          ...prev,
          equippedCompanions: nextList,
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleLevelUpCompanion = useCallback(
    (cid: CompanionId) => {
      sfx.unlock();
      updateSave((prev) => {
        const owned = prev.companions[cid];
        if (!owned?.unlocked) return prev;
        const cost = Math.floor(200 * Math.pow(1.6, owned.level - 1));
        if (prev.mesos < cost) return prev;
        sfx.playClick();
        return {
          ...prev,
          mesos: prev.mesos - cost,
          companions: {
            ...prev.companions,
            [cid]: { ...owned, level: owned.level + 1 },
          },
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleSummon = useCallback(
    (banner: 'weapon' | 'companion', count: 1 | 10, useTickets: boolean) => {
      sfx.unlock();
      const res = performSummon(saveRef.current, banner, count, useTickets);
      if (!res) return;
      updateSave(res.save, 'ui');
      setGachaResults(res.results);
      const rankOrder = { common: 0, rare: 1, epic: 2, unique: 3, legendary: 4 };
      const best = res.results.reduce(
        (acc, cur) => (rankOrder[cur.rarity] > rankOrder[acc] ? cur.rarity : acc),
        'common' as GachaPullResult['rarity']
      );
      sfx.playGachaReveal(best);
    },
    [updateSave]
  );

  const handleAutoMergeEquip = useCallback(() => {
    sfx.unlock();
    const res = autoMergeAndEquipBest(saveRef.current);
    updateSave(res.save, 'ui');
    sfx.playQuestClaim();
    showToast(
      res.mergesDone > 0
        ? `Consolidated ${res.mergesDone} sets & equipped best hardware!`
        : 'Equipped your deadliest Arsenal & Crew!'
    );
  }, [showToast, updateSave]);

  const handleEquipWeapon = useCallback(
    (job: JobId, weaponId: string) => {
      sfx.unlock();
      sfx.playClick();
      updateSave((prev) => {
        if (!prev.weapons[weaponId]?.unlocked) return prev;
        return {
          ...prev,
          equippedWeaponByJob: {
            ...prev.equippedWeaponByJob,
            [job]: weaponId,
          },
        };
      }, 'ui');
    },
    [updateSave]
  );

  const handleAttemptStarForce = useCallback(
    (weaponId: string, caughtGreenZone: boolean) => {
      const res = applyStarForceAttempt(saveRef.current, weaponId, caughtGreenZone);
      if (!res) return null;
      updateSave(res.save, 'ui');
      if (res.success && res.newStars === 15 && res.save.clanId) {
        const wpnName = WEAPONS.find((w) => w.id === weaponId)?.name || 'Weapon';
        void networkManager
          .broadcastClanSystemEvent(
            res.save.clanId,
            `[★15] ${res.save.profile.ign} just tuned a 15★ ${wpnName}!`
          )
          .then((nextChat) => setClanChat(nextChat));
      }
      return {
        success: res.success,
        oldStars: res.oldStars,
        newStars: res.newStars,
      };
    },
    [updateSave]
  );

  const handleStartDungeon = useCallback(
    (mode: 'DUNGEON_MESO' | 'DUNGEON_JEWEL') => {
      sfx.unlock();
      updateSave((prev) => {
        const isMeso = mode === 'DUNGEON_MESO';
        const keys = isMeso ? prev.dungeonKeys.meso : prev.dungeonKeys.jewel;
        if (keys <= 0) return prev;
        return {
          ...prev,
          dungeonKeys: {
            ...prev.dungeonKeys,
            meso: isMeso ? keys - 1 : prev.dungeonKeys.meso,
            jewel: !isMeso ? keys - 1 : prev.dungeonKeys.jewel,
          },
        };
      }, 'ui');
      engineRef.current?.triggerDungeon(mode);
    },
    [updateSave]
  );

  const handleClaimFreeKey = useCallback(() => {
    sfx.unlock();
    const now = Date.now();
    if (now - saveRef.current.dungeonKeys.lastFreeClaimAt < 120 * 1000) return;
    sfx.playQuestClaim();
    updateSave(
      (prev) => ({
        ...prev,
        dungeonKeys: {
          ...prev.dungeonKeys,
          meso: Math.min(5, prev.dungeonKeys.meso + 1),
          jewel: Math.min(5, prev.dungeonKeys.jewel + 1),
          lastFreeClaimAt: now,
        },
      }),
      'ui'
    );
    showToast('Claimed +1 Truck Permit & +1 Vault Permit!');
  }, [showToast, updateSave]);

  const handleClaimQuest = useCallback(() => {
    sfx.unlock();
    if (saveRef.current.quest.progress < saveRef.current.quest.target) return;
    sfx.playQuestClaim();
    const rewardD = saveRef.current.quest.rewardDiamonds;
    const rewardT = saveRef.current.quest.rewardTickets;
    updateSave((prev) => claimCurrentQuest(prev), 'quest');
    showToast(`Contract Complete! +${rewardD} G, +${rewardT} Deal, +1 Tailor Voucher`);
  }, [showToast, updateSave]);

  const handleClaimOffline = useCallback(() => {
    if (!offlineGains) return;
    sfx.unlock();
    sfx.playQuestClaim();
    updateSave((prev) => {
      const next = {
        ...prev,
        mesos: sanitizeNum(prev.mesos + offlineGains.mesos, prev.mesos),
        summonTickets: prev.summonTickets + offlineGains.tickets,
      };
      return applyExpGain(next, offlineGains.exp).save;
    }, 'offline');
    setOfflineGains(null);
  }, [offlineGains, updateSave]);

  const handleResetSave = useCallback(() => {
    SafeStorage.removeItem(SAVE_STORAGE_KEY);
    const fresh = sealSaveState(createInitialSaveState());
    initialLoadedRef.current = { save: fresh, hasExisting: false, integrityFailed: false };
    setSave(fresh);
    setGameMode('TITLE_MENU');
    setShowProfileModal(true);
    showToast('Save data reset');
  }, [showToast]);

  const handleSaveProfile = useCallback(
    async (
      input: {
        ign: string;
        clanTag: string;
        emblem: ProfileEmblemId;
        border: ProfileBorderId;
        playerId: string;
      },
      mode: NetworkMode
    ) => {
      sfx.unlock();
      sfx.playQuestClaim();
      networkManager.setMode(mode);
      setNetworkMode(mode);

      const loginRes = await networkManager.login({
        ign: input.ign,
        clanTag: input.clanTag,
        emblem: input.emblem,
        border: input.border,
        existingPlayerId: input.playerId,
      });

      const updatedSave = sealSaveState({
        ...saveRef.current,
        profile: loginRes.profile,
      });
      setSave(updatedSave);
      persistSaveState(updatedSave);

      setIsSyncing(true);
      const syncRes = await networkManager.syncSave(updatedSave, 'manual');
      setIsSyncing(false);
      setLastSyncedAt(syncRes.syncedAt);
      setLastChecksum(syncRes.checksum);
      setShowProfileModal(false);
      void refreshOpponents(updatedSave);
      showToast(`Logged in as [${loginRes.profile.clanTag}] ${loginRes.profile.ign}`);
    },
    [refreshOpponents, showToast]
  );

  const handleToggleNetworkMode = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    const nextMode: NetworkMode = networkMode === 'SANDBOX' ? 'LIVE' : 'SANDBOX';
    networkManager.setMode(nextMode);
    setNetworkMode(nextMode);
    void refreshOpponents();
    showToast(
      nextMode === 'LIVE'
        ? networkManager.hasLiveCredentials()
          ? 'Switched to Live Wire Mode'
          : 'Live Wire selected (no Supabase keys — using local real dossiers)'
        : 'Switched to Local Ledger Mode'
    );
  }, [networkMode, refreshOpponents, showToast]);

  const handleManualSync = useCallback(async () => {
    sfx.unlock();
    sfx.playClick();
    setIsSyncing(true);
    const res = await networkManager.syncSave(saveRef.current, 'manual');
    setIsSyncing(false);
    setLastSyncedAt(res.syncedAt);
    setLastChecksum(res.checksum);
    if (!res.deltaValid && res.flaggedReasons.length > 0) {
      updateSave(
        (prev) => ({
          ...prev,
          integrityFlags: [...(prev.integrityFlags || []), ...res.flaggedReasons].slice(-8),
        }),
        'ui'
      );
    }
    showToast(res.message);
  }, [showToast, updateSave]);

  const handleSendLiveChallenge = useCallback(
    async (currency: ArenaCurrency, stake: number): Promise<LiveChallengeResponse> => {
      if (!escrowOpponent) {
        return {
          accepted: false,
          escrowId: '',
          rivalStakeLocked: 0,
          message: 'Opponent unavailable.',
        };
      }
      return networkManager.sendLiveChallenge(saveRef.current, escrowOpponent, currency, stake);
    },
    [escrowOpponent]
  );

  const handleLaunchDuel = useCallback(
    async (duelType: DuelType, currency: ArenaCurrency, stake: number) => {
      const opponent = escrowOpponent;
      if (!opponent) return;
      const curSave = saveRef.current;
      if (curSave.tainted) {
        showToast('Integrity lock: Underground Fight Club is locked.');
        return;
      }
      const curBalance = curSave[currency];
      if (stake <= 0 || curBalance < stake) {
        showToast(`Not enough ${ARENA_CURRENCY_META[currency].label} for this wager!`);
        return;
      }

      sfx.unlock();

      // Lock stake into Escrow immediately before sync & battle
      const escrowedSave = sealSaveState({
        ...curSave,
        [currency]: curBalance - stake,
      });
      setSave(escrowedSave);
      persistSaveState(escrowedSave);
      setEscrowOpponent(null);

      // Sync Combat Snapshot before PvP match
      setIsSyncing(true);
      const syncRes = await networkManager.syncSave(escrowedSave, 'pvp_preflight');
      setIsSyncing(false);
      setLastSyncedAt(syncRes.syncedAt);
      setLastChecksum(syncRes.checksum);

      const playerSnap = buildCombatSnapshot(escrowedSave);
      const wagerBonusPct = computeStats(escrowedSave).wagerBonusPct;
      const liveOpsBonuses = getEffectiveLiveOpsBonuses();
      const houseFeePct =
        duelType === 'SNAPSHOT'
          ? Math.max(0, ARENA_HOUSE_FEE_PCT - liveOpsBonuses.wagerRakeDiscount)
          : 0;
      const seed =
        typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
          ? crypto.getRandomValues(new Uint32Array(1))[0]
          : Math.floor(Math.random() * 0xffffffff);

      const match = simulateArenaDuel(
        playerSnap,
        opponent,
        seed,
        duelType,
        currency,
        stake,
        wagerBonusPct,
        houseFeePct
      );

      // Store signed wager submission (NO client winner boolean) for authoritative settlement
      const submissionSig = computeDataChecksum({
        matchId: match.matchId,
        seed: match.seed,
        duelType: match.duelType,
        currency: match.currency,
        stake: match.stake,
        playerId: playerSnap.playerId,
        rivalId: opponent.playerId,
        playerChecksum: playerSnap.checksum,
        rivalChecksum: opponent.checksum,
      });
      pendingWagersRef.current.set(match.matchId, {
        matchId: match.matchId,
        seed: match.seed,
        duelType: match.duelType,
        currency: match.currency,
        stake: match.stake,
        wagerBonusPct,
        houseFeePct,
        playerSnapshot: playerSnap,
        rivalSnapshot: opponent,
        submittedAt: Date.now(),
        submissionSig,
      });

      engineRef.current?.setArenaSpeed(arenaSpeed);
      engineRef.current?.triggerArenaPvp(match);
    },
    [arenaSpeed, escrowOpponent, showToast]
  );

  const handleToggleArenaSpeed = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    const nextSpeed: 1 | 2 = arenaSpeed === 1 ? 2 : 1;
    setArenaSpeed(nextSpeed);
    engineRef.current?.setArenaSpeed(nextSpeed);
  }, [arenaSpeed]);

  const handleArenaReturnLobby = useCallback(() => {
    sfx.unlock();
    sfx.playClick();
    setArenaResult(null);
    engineRef.current?.exitArenaPvp();
    void refreshOpponents();
  }, [refreshOpponents]);

  const handleArenaRematch = useCallback(() => {
    if (!arenaResult) return;
    sfx.unlock();
    sfx.playClick();
    const rival = arenaResult.rival;
    setArenaResult(null);
    engineRef.current?.exitArenaPvp();
    setEscrowOpponent(rival);
  }, [arenaResult]);

  // Clan & GvG War Handlers
  const handleRefreshClanDirectory = useCallback(async (query?: string) => {
    const dir = await networkManager.fetchClanDirectory(query);
    setClanDirectory(dir);
  }, []);

  const handleCreateClan = useCallback(
    async (input: { name: string; tag: string; crest: ClanCrest; minCp: number }) => {
      sfx.unlock();
      const res = await networkManager.createClan(saveRef.current, input);
      if (!res.ok || !res.clan || !res.save) {
        showToast(res.error || 'Could not found Family.');
        return;
      }
      sfx.playLevelUp();
      const sealedSave = sealSaveState(res.save);
      setSave(sealedSave);
      persistSaveState(sealedSave);
      setClanInfo(res.clan);
      setActiveClanShrineLevel(res.clan.shrine.level);
      const [chat, dir] = await Promise.all([
        networkManager.fetchClanChat(res.clan.clanId),
        networkManager.fetchClanDirectory(),
      ]);
      setClanChat(chat);
      setClanDirectory(dir);
      showToast(`Founded [${res.clan.tag}] ${res.clan.name}!`);
    },
    [showToast]
  );

  const handleJoinClan = useCallback(
    async (clanId: string) => {
      sfx.unlock();
      const res = await networkManager.joinClan(saveRef.current, clanId);
      if (!res.ok || !res.clan || !res.save) {
        showToast(res.error || 'Could not join Family.');
        return;
      }
      sfx.playQuestClaim();
      const sealedSave = sealSaveState(res.save);
      setSave(sealedSave);
      persistSaveState(sealedSave);
      setClanInfo(res.clan);
      setActiveClanShrineLevel(res.clan.shrine.level);
      const [chat, war, dir] = await Promise.all([
        networkManager.fetchClanChat(res.clan.clanId),
        networkManager.getClanWar(res.clan.clanId, res.clan),
        networkManager.fetchClanDirectory(),
      ]);
      setClanChat(chat);
      setClanWar(war);
      setClanDirectory(dir);
      showToast(`Joined [${res.clan.tag}] ${res.clan.name}!`);
    },
    [showToast]
  );

  const handleLeaveClan = useCallback(async () => {
    sfx.unlock();
    sfx.playClick();
    const nextSave = sealSaveState(await networkManager.leaveClan(saveRef.current));
    setSave(nextSave);
    persistSaveState(nextSave);
    setClanInfo(null);
    setClanChat([]);
    setClanWar(null);
    setActiveClanShrineLevel(0);
    const dir = await networkManager.fetchClanDirectory();
    setClanDirectory(dir);
    showToast('Left Family.');
  }, [showToast]);

  const handleSetClanMemberRank = useCallback(
    async (targetPlayerId: string, newRank: ClanRank) => {
      if (!clanInfo) return;
      sfx.unlock();
      sfx.playClick();
      const updated = await networkManager.setClanMemberRank(clanInfo.clanId, targetPlayerId, newRank);
      if (updated) {
        setClanInfo(updated);
        const chat = await networkManager.fetchClanChat(updated.clanId);
        setClanChat(chat);
      }
    },
    [clanInfo]
  );

  const handleSendClanChat = useCallback(
    async (text: string) => {
      if (!clanInfo) return;
      sfx.unlock();
      const myMember = clanInfo.members.find((m) => m.playerId === saveRef.current.profile?.playerId);
      const next = await networkManager.sendClanChatMessage(
        clanInfo.clanId,
        saveRef.current.profile?.ign || 'Made Man',
        myMember?.rank || 'member',
        text
      );
      setClanChat(next);
    },
    [clanInfo]
  );

  const handleDonateShrine = useCallback(
    async (kind: 'mesos' | 'diamonds') => {
      if (!clanInfo) return;
      sfx.unlock();
      const res = await networkManager.donateToShrine(saveRef.current, clanInfo.clanId, kind);
      if (!res.ok || !res.clan || !res.save) {
        showToast(res.error || 'Cannot donate right now.');
        return;
      }
      sfx.playQuestClaim();
      const sealedSave = sealSaveState(res.save);
      setSave(sealedSave);
      persistSaveState(sealedSave);
      setClanInfo(res.clan);
      setActiveClanShrineLevel(res.clan.shrine.level);
      const chat = await networkManager.fetchClanChat(res.clan.clanId);
      setClanChat(chat);
      showToast(
        res.leveledUp
          ? `Front Business Upgraded to Lv.${res.clan.shrine.level}!`
          : `Laundered ${kind === 'mesos' ? 'Dirty Cash' : 'Gold Bars'} into Front Business!`
      );
    },
    [clanInfo, showToast]
  );

  const handleStartClanWar = useCallback(async () => {
    if (!clanInfo) return;
    sfx.unlock();
    const res = await networkManager.startClanWar(saveRef.current, clanInfo);
    if (!res.ok || !res.war) {
      showToast(res.error || 'Could not start Turf War.');
      return;
    }
    sfx.playBossHorn();
    setClanWar(res.war);
    const chat = await networkManager.fetchClanChat(clanInfo.clanId);
    setClanChat(chat);
    showToast(`Turf War started vs [${res.war.rivalClan.tag}] ${res.war.rivalClan.name}!`);
  }, [clanInfo, showToast]);

  const handleAssignWarDefense = useCallback(
    async (laneId: WarLaneId) => {
      if (!clanInfo) return;
      sfx.unlock();
      sfx.playClick();
      const updated = await networkManager.assignWarDefense(saveRef.current, clanInfo.clanId, laneId);
      if (updated) {
        setClanWar(updated);
        showToast(`Fortified ${updated.lanes[laneId].name}!`);
      }
    },
    [clanInfo, showToast]
  );

  const handleAttackWarDefender = useCallback(
    (laneId: WarLaneId, defender: WarDefender) => {
      if (!clanWar || clanWar.attacksRemaining <= 0) return;
      const curSave = saveRef.current;
      const lane = clanWar.lanes[laneId];
      if (!lane) return;

      sfx.unlock();
      const playerSnap = buildCombatSnapshot(curSave);
      const rivalOpp: ArenaOpponent = {
        ...defender.snapshot,
        isSimulated: true,
        onlineStatus: 'snapshot',
        preferredCurrency: 'diamonds',
      };
      const seed =
        typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
          ? crypto.getRandomValues(new Uint32Array(1))[0]
          : Math.floor(Math.random() * 0xffffffff);

      const match = simulateArenaDuel(playerSnap, rivalOpp, seed, 'LIVE_INVITE', 'diamonds', 0, 0);
      engineRef.current?.triggerClanSiege({
        laneId,
        laneName: lane.name,
        targetType: 'defender',
        enemyDefender: defender,
        statueHp: lane.enemyStatueHp,
        statueMaxHp: lane.enemyStatueMaxHp,
        rivalClanTag: clanWar.rivalClan.tag,
        rivalClanName: clanWar.rivalClan.name,
        playerSnapshot: playerSnap,
        duelMatch: match,
        bossDmgBonusPct: computeStats(curSave).bossDmgBonusPct,
      });
    },
    [clanWar]
  );

  const handleRallyStatue = useCallback(
    (laneId: WarLaneId) => {
      if (!clanWar || clanWar.attacksRemaining <= 0) return;
      const curSave = saveRef.current;
      const lane = clanWar.lanes[laneId];
      if (!lane) return;

      sfx.unlock();
      const playerSnap = buildCombatSnapshot(curSave);
      engineRef.current?.triggerClanSiege({
        laneId,
        laneName: lane.name,
        targetType: 'statue',
        statueHp: lane.enemyStatueHp,
        statueMaxHp: lane.enemyStatueMaxHp,
        rivalClanTag: clanWar.rivalClan.tag,
        rivalClanName: clanWar.rivalClan.name,
        playerSnapshot: playerSnap,
        bossDmgBonusPct: computeStats(curSave).bossDmgBonusPct,
      });
    },
    [clanWar]
  );

  const handleAdvanceWarSkirmish = useCallback(async () => {
    if (!clanInfo) return;
    sfx.unlock();
    sfx.playClick();
    const updated = await networkManager.advanceWarSkirmish(clanInfo.clanId);
    if (updated) {
      setClanWar(updated);
      showToast('Simulated crew wave across all 3 city districts!');
    }
  }, [clanInfo, showToast]);

  const handleResolveWar = useCallback(async () => {
    if (!clanInfo) return;
    sfx.unlock();
    sfx.playLevelUp();
    const finalized = await networkManager.resolveAndGenerateWarChest(saveRef.current, clanInfo);
    if (finalized) {
      setClanWar(finalized);
      const chat = await networkManager.fetchClanChat(clanInfo.clanId);
      setClanChat(chat);
      if (finalized.chestReward) {
        setShowWarChestModal(true);
      }
    }
  }, [clanInfo]);

  const handleClaimWarChest = useCallback(async () => {
    if (!clanInfo) return;
    sfx.unlock();
    const res = await networkManager.claimWarChest(saveRef.current, clanInfo.clanId);
    if (res.reward) {
      sfx.playQuestClaim();
      const sealedSave = sealSaveState(res.save);
      setSave(sealedSave);
      persistSaveState(sealedSave);
      setClanWar(null);
      setShowWarChestModal(false);
      const nextClan = await networkManager.getCurrentClan(sealedSave);
      setClanInfo(nextClan);
      setActiveClanShrineLevel(nextClan?.shrine.level || 0);
      showToast(`Claimed Turf Crate: +${formatNum(res.reward.diamonds)} G & +${res.reward.warMedals} Medallions!`);
    }
  }, [clanInfo, showToast]);

  const questDone = save.quest.progress >= save.quest.target;
  const transcendBadgeVisible =
    isTranscendUnlocked(save) && (save.transcendCount === 0 || save.arcaneSymbols >= 2);

  return (
    <div
      className="relative flex h-[100dvh] w-[100vw] items-center justify-center bg-[#0c0b0e] overflow-hidden"
      style={{ height: viewportHeight ? `${viewportHeight}px` : undefined }}
    >
      {/* Atmospheric desktop sidebars outside 9:16 itch.io portrait frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden sm:block bg-[radial-gradient(circle_at_18%_35%,rgba(139,30,36,0.16),transparent_44%),radial-gradient(circle_at_82%_65%,rgba(245,158,11,0.08),transparent_42%)]"
      />
      {/* 9:16 Portrait Mobile Shell */}
      <div className="relative flex h-full w-full max-w-[450px] flex-col overflow-hidden bg-[#121216] shadow-[0_0_50px_rgba(0,0,0,0.92)] sm:border-x sm:border-zinc-800">
        {/* TOP 42%: 2D Pixel Art Canvas Combat Stage */}
        <div className="relative h-[42%] w-full shrink-0 overflow-hidden bg-[#121216] border-b-2 border-zinc-800">
          <canvas
            ref={canvasRef}
            className="h-full w-full block pixelated"
          />

          {gameMode !== 'TITLE_MENU' && (
            <TopHud
              save={save}
              snapshot={snapshot}
              arenaSpeed={arenaSpeed}
              liveOps={liveOps}
              onChallengeBoss={() => {
                sfx.unlock();
                engineRef.current?.triggerBossChallenge();
              }}
              onToggleAutoBoss={handleToggleAutoBoss}
              onStartExpedition={handleStartExpedition}
              onToggleDpsMeter={handleToggleDpsMeter}
              onToggleMute={handleToggleMute}
              onToggleArenaSpeed={handleToggleArenaSpeed}
              onOpenSettings={() => {
                sfx.unlock();
                sfx.playClick();
                setSettingsOpen(true);
              }}
              onOpenPause={() => setGameMode('PAUSED')}
            />
          )}

          {/* Non-blocking Toast Banner */}
          {toastMsg && (
            <div className="pointer-events-none absolute bottom-10 right-2 z-20 rounded-md border border-amber-500/70 bg-[#121216]/95 px-2.5 py-1 text-[11px] font-bold text-amber-200 shadow-lg">
              {toastMsg}
            </div>
          )}
        </div>

        {/* GUIDE QUEST BAR (Single-line persistent tracker right below canvas) */}
        <button
          type="button"
          onClick={handleClaimQuest}
          className={`flex h-10 w-full shrink-0 items-center justify-between gap-2 border-b px-3 text-left transition-colors cursor-pointer ${
            questDone
              ? 'border-amber-500 bg-gradient-to-r from-[#8B1E24]/80 via-amber-950/70 to-[#8B1E24]/80 text-amber-200'
              : 'border-zinc-800 bg-[#1a1920] text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {questDone ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Compass className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate text-xs font-semibold">
              {save.quest.label} ({save.quest.progress}/{save.quest.target})
            </span>
          </div>

          <span
            className={`font-mono-num text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 ${
              questDone ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {questDone ? (
              'Collect!'
            ) : (
              <>
                <Gem className="w-3 h-3" />
                {save.quest.rewardDiamonds}
              </>
            )}
          </span>
        </button>

        {/* BOTTOM ~58%: Scrollable Tab Body + Bottom 6-Tab Nav */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#121216]">
          <main className="hud-scroll flex-1 overflow-y-auto px-3 pt-2.5">
            {activeTab === 'character' && (
              <TabCharacter
                save={save}
                buyMult={buyMult}
                onChangeBuyMult={setBuyMult}
                onSwitchJob={handleSwitchJob}
                onUpgradeStat={handleUpgradeStat}
                onUpgradeRank={handleUpgradeRank}
                onOpenStyleBox={handleOpenStyleBox}
                onEquipCosmetic={handleEquipCosmetic}
                onToggleRelic={handleToggleRelic}
                onUpgradeRelic={handleUpgradeRelic}
                onUpgradeRelicWithCores={handleUpgradeRelicWithCores}
                onOpenTranscendence={() => {
                  sfx.unlock();
                  sfx.playClick();
                  setShowTranscendModal(true);
                }}
              />
            )}

            {activeTab === 'skills' && (
              <TabSkills
                save={save}
                snapshot={snapshot}
                onToggleAutoSkills={() => {
                  sfx.unlock();
                  sfx.playClick();
                  updateSave((p) => ({ ...p, autoSkills: !p.autoSkills }), 'ui');
                }}
                onCastSkill={(id) => {
                  sfx.unlock();
                  engineRef.current?.castSkillManual(id);
                }}
                onUpgradeSkill={handleUpgradeSkill}
                onToggleEquipCompanion={handleToggleEquipCompanion}
                onLevelUpCompanion={handleLevelUpCompanion}
              />
            )}

            {activeTab === 'summon' && (
              <TabSummon
                save={save}
                onSummon={handleSummon}
                onAutoMergeEquip={handleAutoMergeEquip}
                onEquipWeapon={handleEquipWeapon}
                onOpenStarForce={(wid) => {
                  sfx.unlock();
                  sfx.playClick();
                  setStarForceWeaponId(wid);
                }}
              />
            )}

            {activeTab === 'dungeons' && (
              <TabDungeons
                save={save}
                combatMode={snapshot.combatMode}
                onStartDungeon={handleStartDungeon}
                onClaimFreeKey={handleClaimFreeKey}
                onToggleAutoBoss={handleToggleAutoBoss}
              />
            )}

            {activeTab === 'arena' && (
              <TabArena
                save={save}
                combatMode={snapshot.combatMode}
                networkMode={networkMode}
                hasLiveCreds={networkManager.hasLiveCredentials()}
                lastSyncedAt={lastSyncedAt}
                lastChecksum={lastChecksum}
                isSyncing={isSyncing}
                opponents={opponents}
                loadingOpponents={loadingOpponents}
                onToggleNetworkMode={handleToggleNetworkMode}
                onOpenProfileModal={() => {
                  sfx.unlock();
                  sfx.playClick();
                  setShowProfileModal(true);
                }}
                onManualSync={() => {
                  void handleManualSync();
                }}
                onRefreshOpponents={() => {
                  sfx.unlock();
                  sfx.playClick();
                  void refreshOpponents();
                }}
                onSelectOpponent={(opp) => {
                  sfx.unlock();
                  sfx.playClick();
                  setEscrowOpponent(opp);
                }}
              />
            )}
            {activeTab === 'clan' && (
              <TabClan
                save={save}
                combatMode={snapshot.combatMode}
                clan={clanInfo}
                directory={clanDirectory}
                chatMessages={clanChat}
                clanWar={clanWar}
                onRefreshDirectory={(q) => {
                  void handleRefreshClanDirectory(q);
                }}
                onCreateClan={handleCreateClan}
                onJoinClan={handleJoinClan}
                onLeaveClan={handleLeaveClan}
                onSetMemberRank={handleSetClanMemberRank}
                onSendChat={handleSendClanChat}
                onDonateShrine={handleDonateShrine}
                onStartWar={handleStartClanWar}
                onAssignDefense={handleAssignWarDefense}
                onAttackDefender={handleAttackWarDefender}
                onRallyStatue={handleRallyStatue}
                onAdvanceWarSkirmish={handleAdvanceWarSkirmish}
                onResolveWar={handleResolveWar}
                onOpenWarChest={() => setShowWarChestModal(true)}
              />
            )}
          </main>

          {/* Bottom 6-Tab Bar */}
          <nav
            aria-label="Game Menus"
            className="grid h-14 shrink-0 grid-cols-6 border-t border-zinc-800 bg-[#1a1920]"
          >
            {(
              [
                { id: 'character', label: 'Boss', hotkey: 'Q', icon: Sword },
                { id: 'skills', label: 'Crew', hotkey: 'W', icon: Flame },
                { id: 'summon', label: 'Black Mkt', hotkey: 'E', icon: Sparkles },
                { id: 'dungeons', label: 'Hustles', hotkey: 'R', icon: KeyRound },
                { id: 'arena', label: 'Fight Club', hotkey: 'T', icon: Swords },
                { id: 'clan', label: 'Family', hotkey: 'Y', icon: Shield },
              ] as const
            ).map(({ id, label, hotkey, icon: Icon }) => {
              const active = activeTab === id;
              const showTranscendIndicator = id === 'character' && transcendBadgeVisible;
              const showWarChestDot =
                id === 'clan' &&
                clanWar?.status === 'ENDED' &&
                Boolean(clanWar.chestReward && !clanWar.chestReward.claimed);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    sfx.unlock();
                    sfx.playClick();
                    setActiveTab(id);
                  }}
                  className={`relative flex flex-col items-center justify-center gap-0.5 border-t-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-500 bg-[#8B1E24]/30 text-amber-300'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-4 h-4" />
                    {showTranscendIndicator && (
                      <span
                        aria-label="Go to the Mattresses ready"
                        className="absolute -right-2.5 -top-1 text-[10px] font-bold leading-none text-amber-300"
                      >
                        ✦
                      </span>
                    )}
                    {showWarChestDot && (
                      <span
                        aria-label="Turf Crate ready"
                        className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400"
                      />
                    )}
                  </div>
                  <span className="flex items-center gap-0.5 text-[9.5px] font-bold leading-none whitespace-nowrap">
                    <span>{label}</span>
                    <kbd className="hidden sm:inline-block rounded bg-zinc-800/90 px-1 text-[7.5px] font-mono-num text-zinc-400">
                      {hotkey}
                    </kbd>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Title Screen Overlay */}
        {gameMode === 'TITLE_MENU' && (
          <TitleScreen
            selectedJob={save.job}
            hasExistingSave={initialLoadedRef.current.hasExisting}
            savedLevel={save.level}
            savedStage={save.stage}
            profileIgn={save.profile?.ign}
            profileClan={save.profile?.clanTag}
            disableShortcuts={showProfileModal || settingsOpen}
            onSelectJob={handleSwitchJob}
            onOpenProfile={() => {
              sfx.unlock();
              sfx.playClick();
              setShowProfileModal(true);
            }}
            onStart={handleStartGame}
          />
        )}

        {/* Modals */}
        {showProfileModal && (
          <PlayerProfileModal
            save={save}
            networkMode={networkMode}
            hasLiveCreds={networkManager.hasLiveCredentials()}
            isFirstTime={!save.profile?.ign}
            onSaveProfile={handleSaveProfile}
            onClose={() => setShowProfileModal(false)}
          />
        )}

        {settingsOpen && (
          <SettingsModal
            save={save}
            isSyncing={isSyncing}
            onChangeSfxVolume={handleChangeSfxVolume}
            onChangeBgmVolume={handleChangeBgmVolume}
            onToggleLowPower={handleToggleLowPower}
            onManualSync={handleManualSync}
            onRedeemPromo={handleRedeemPromo}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {gameMode === 'PLAYING' && !showProfileModal && offlineGains && (
          <OfflineGainsModal gains={offlineGains} onClaim={handleClaimOffline} />
        )}

        {gachaResults && (
          <GachaRevealModal results={gachaResults} onClose={() => setGachaResults(null)} />
        )}

        {starForceWeaponId && (
          <StarForceModal
            weaponId={starForceWeaponId}
            save={save}
            onAttemptStarForce={handleAttemptStarForce}
            onClose={() => setStarForceWeaponId(null)}
          />
        )}

        {showTranscendModal && (
          <TranscendenceModal
            save={save}
            onUpgradeSkill={handleUpgradeTranscendSkill}
            onConfirmTranscend={handleConfirmTranscend}
            onClose={() => setShowTranscendModal(false)}
          />
        )}

        {escrowOpponent && (
          <WagerEscrowModal
            save={save}
            opponent={escrowOpponent}
            onSendLiveChallenge={handleSendLiveChallenge}
            onLaunchDuel={(duelType, currency, stake) => {
              void handleLaunchDuel(duelType, currency, stake);
            }}
            onClose={() => setEscrowOpponent(null)}
          />
        )}

        {arenaResult && (
          <ArenaResultModal
            match={arenaResult}
            onReturnLobby={handleArenaReturnLobby}
            onRematch={handleArenaRematch}
          />
        )}

        {showWarChestModal && clanWar?.chestReward && (
          <ClanWarChestModal
            war={clanWar}
            onClaim={handleClaimWarChest}
            onClose={() => setShowWarChestModal(false)}
          />
        )}

        {gameMode === 'PAUSED' && (
          <PauseModal
            stage={save.stage}
            level={save.level}
            job={save.job}
            monstersKilled={save.statsTotals.monstersKilled}
            onResume={() => setGameMode('PLAYING')}
            onTitle={() => setGameMode('TITLE_MENU')}
            onResetSave={handleResetSave}
          />
        )}
      </div>
    </div>
  );
}
