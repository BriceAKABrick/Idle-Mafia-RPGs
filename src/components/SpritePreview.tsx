import { useEffect, useRef } from 'react';
import { WEAPONS } from '../game/constants';
import { sprites } from '../game/sprites';
import { CompanionId, CosmeticId, EquippedCosmetics, JobId, RelicId } from '../game/types';

interface SpritePreviewProps {
  kind: 'hero' | 'companion' | 'weapon' | 'cosmetic' | 'relic';
  id: JobId | CompanionId | CosmeticId | RelicId | string;
  job?: JobId;
  weaponId?: string;
  cosmetics?: EquippedCosmetics;
  size?: number;
  className?: string;
}

export function SpritePreview({
  kind,
  id,
  job,
  weaponId,
  cosmetics,
  size = 36,
  className = '',
}: SpritePreviewProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let spr: HTMLCanvasElement;
    if (kind === 'hero') {
      spr = sprites.getHeroSprite(id as JobId, 'idle', weaponId, cosmetics);
    } else if (kind === 'weapon') {
      const weaponDef =
        WEAPONS.find((w) => w.id === id) ||
        WEAPONS.find((w) => w.job === (job || 'warrior')) ||
        WEAPONS[0];
      spr = sprites.getWeaponIcon(weaponDef);
    } else if (kind === 'cosmetic') {
      spr = sprites.getCosmeticIcon(id as CosmeticId);
    } else if (kind === 'relic') {
      spr = sprites.getRelicIcon(id as RelicId);
    } else {
      spr = sprites.getCompanionSprite(id as CompanionId, 0);
    }
    canvas.width = spr.width;
    canvas.height = spr.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, spr.width, spr.height);
    ctx.drawImage(spr, 0, 0);
  }, [kind, id, job, weaponId, cosmetics]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      className={`pixelated shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}
