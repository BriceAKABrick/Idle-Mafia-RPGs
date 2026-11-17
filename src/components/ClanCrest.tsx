import { CLAN_CREST_BG_META, CLAN_CREST_ICONS } from '../game/constants';
import { ClanCrest as ClanCrestType } from '../game/types';

interface ClanCrestProps {
  crest: ClanCrestType;
  size?: number;
  className?: string;
}

export function ClanCrest({ crest, size = 34, className = '' }: ClanCrestProps) {
  const iconDef = CLAN_CREST_ICONS[crest.icon] || CLAN_CREST_ICONS.maple_crest;
  const bgMeta = CLAN_CREST_BG_META[crest.bgColor] || CLAN_CREST_BG_META.crimson;

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: bgMeta.hex,
        borderColor: bgMeta.border,
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border-2 p-1 shadow-inner ${className}`}
      aria-label={`${iconDef.name} Family Emblem`}
    >
      <svg
        viewBox="0 0 8 8"
        className="h-full w-full"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {iconDef.rows.map((row, rIdx) =>
          row.split('').map((cell, cIdx) => {
            if (cell === '.' || cell === ' ') return null;
            const fill =
              cell === 'b' ? '#f59e0b' : cell === 'c' ? '#dc2626' : '#fef3c7';
            return (
              <rect
                key={`${rIdx}_${cIdx}`}
                x={cIdx}
                y={rIdx}
                width={1}
                height={1}
                fill={fill}
              />
            );
          })
        )}
      </svg>
    </div>
  );
}
