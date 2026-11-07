import { cn } from '@/lib/utils';
import { ICON_DATA, type IconName } from './icon-data.generated';

export type { IconName };

/**
 * The single icon component for the app. Icons come from Rune Icons (Apache-2.0), extracted at
 * dev time by `scripts/generate-icons.mjs` — swap the icon set there, in one place.
 */
export function Icon({
  name,
  size = 18,
  className,
  label,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Accessible label; omit for decorative icons. */
  label?: string;
}) {
  const icon = ICON_DATA[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      className={cn('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: icon.markup }}
    />
  );
}
