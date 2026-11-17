import { useEffect } from 'react';
import { JOBS } from '../game/constants';
import { JobId } from '../game/types';
import { SpritePreview } from './SpritePreview';

interface TitleScreenProps {
  selectedJob: JobId;
  hasExistingSave: boolean;
  savedLevel: number;
  savedStage: number;
  profileIgn?: string;
  profileClan?: string;
  disableShortcuts?: boolean;
  onSelectJob: (job: JobId) => void;
  onOpenProfile?: () => void;
  onStart: () => void;
}

export function TitleScreen({
  selectedJob,
  hasExistingSave,
  savedLevel,
  savedStage,
  profileIgn,
  profileClan,
  disableShortcuts = false,
  onSelectJob,
  onOpenProfile,
  onStart,
}: TitleScreenProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (disableShortcuts) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onStart, disableShortcuts]);

  const jobList: JobId[] = ['warrior', 'magician', 'bowman', 'thief'];

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-b from-[#121216]/70 via-[#121216]/88 to-[#121216]/98 p-5">
      {/* Upper space + Bespoke Syndicate Idle SVG Mafia Crest */}
      <div className="flex flex-col items-center pt-5 text-center">
        <svg
          viewBox="0 0 280 98"
          className="w-64 h-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
          aria-label="Syndicate Idle: Capo's Rise"
        >
          <defs>
            <linearGradient id="syndicateCrimsonGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" />
              <stop offset="55%" stopColor="#8B1E24" />
              <stop offset="100%" stopColor="#450a0a" />
            </linearGradient>
            <linearGradient id="titleGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
          {/* Noir Fedora & Crimson Syndicate Crest */}
          <ellipse cx="140" cy="40" rx="28" ry="6" fill="#18181b" stroke="#F59E0B" strokeWidth="1.5" />
          <path
            d="M121 38 L127 16 L140 20 L153 16 L159 38 Z"
            fill="#1f1f26"
            stroke="#475569"
            strokeWidth="1.5"
          />
          <rect x="122" y="32" width="36" height="5" fill="url(#syndicateCrimsonGrad)" />
          <circle cx="140" cy="34.5" r="2.2" fill="#F59E0B" />
          <text
            x="140"
            y="70"
            textAnchor="middle"
            fill="url(#titleGold)"
            stroke="#121216"
            strokeWidth="4"
            paintOrder="stroke"
            style={{ fontFamily: 'var(--font-display)', fontSize: '25px', fontWeight: 700, letterSpacing: '0.05em' }}
          >
            SYNDICATE IDLE
          </text>
          <text
            x="140"
            y="89"
            textAnchor="middle"
            fill="#f8fafc"
            stroke="#450a0a"
            strokeWidth="2.5"
            paintOrder="stroke"
            style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.22em' }}
          >
            CAPO&apos;S RISE
          </text>
        </svg>

        {hasExistingSave && (
          <p className="mt-2 text-xs text-amber-300 font-mono-num">
            Saved Capo · Lv.{savedLevel} · Block {savedStage}
          </p>
        )}
      </div>

      {/* Archetype Picker */}
      <div className="my-auto space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-sm font-bold text-slate-100">Choose Your Archetype</h2>
          <span className="text-xs text-slate-400">Switch anytime</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {jobList.map((jid) => {
            const job = JOBS[jid];
            const active = selectedJob === jid;
            return (
              <button
                key={jid}
                type="button"
                onClick={() => onSelectJob(jid)}
                className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all cursor-pointer min-h-[64px] ${
                  active
                    ? 'border-amber-400 bg-[#8B1E24]/45 shadow-[0_0_16px_rgba(245,158,11,0.28)]'
                    : 'border-zinc-800 bg-[#1a1920]/90 hover:border-zinc-600'
                }`}
              >
                <SpritePreview kind="hero" id={jid} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-sm font-bold text-white leading-tight truncate">
                    {job.name}
                  </div>
                  <div className="text-[11px] text-slate-300 leading-tight mt-0.5 truncate">
                    {job.advancementTitle} · {job.primaryStat}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-[#1a1920]/85 px-3 py-2 text-xs text-slate-300">
          <span className="font-semibold text-amber-300">{JOBS[selectedJob].name}:</span>{' '}
          {JOBS[selectedJob].desc}
        </div>
      </div>

      {/* Primary Start CTA & Made Man Profile Bar */}
      <div className="space-y-2 pb-1">
        {onOpenProfile && (
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-700/80 bg-[#1a1920]/90 px-3 py-2 text-xs text-slate-200 hover:border-amber-400 cursor-pointer"
          >
            <span className="truncate font-semibold">
              {profileIgn
                ? `[${profileClan || 'SYND'}] ${profileIgn}`
                : 'Configure Made Man Profile & Cloud Sync'}
            </span>
            <span className="text-[11px] font-bold text-amber-300 shrink-0 ml-2">
              {profileIgn ? 'Edit Profile' : 'Setup'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onStart}
          className="w-full min-h-[48px] rounded-xl bg-gradient-to-b from-[#F59E0B] to-[#8B1E24] px-4 py-3 font-display text-base font-bold text-white shadow-[0_4px_0_#450a0a] active:translate-y-0.5 transition-transform cursor-pointer"
        >
          {hasExistingSave ? 'Resume Empire' : 'Enter the Underworld'}
        </button>
        <p className="text-center text-[11px] text-slate-400">
          Tap/Click to Upgrade &amp; Fire · Enter/Space to Start · Auto-Battle Active
        </p>
      </div>
    </div>
  );
}
