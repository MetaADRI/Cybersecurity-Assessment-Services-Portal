import { useTheme } from '../theme';

const SOURCES = {
  full: '/brand/logo-full.png',
  dark: '/brand/logo-full-dark.png',
  reversed: '/brand/logo-full-reversed.png',
  mark: '/brand/logo-mark.png',
  markDark: '/brand/logo-mark-dark.png',
  markReversed: '/brand/logo-mark-reversed.png',
} as const;

type LogoVariant = keyof typeof SOURCES | 'auto';

export function Logo({
  variant = 'auto',
  mark = false,
  className = '',
  alt = 'OpenDefenders',
}: {
  variant?: LogoVariant;
  mark?: boolean;
  className?: string;
  alt?: string;
}) {
  const { theme } = useTheme();
  const resolved: keyof typeof SOURCES =
    variant === 'auto'
      ? mark
        ? theme === 'dark'
          ? 'markDark'
          : 'mark'
        : theme === 'dark'
          ? 'dark'
          : 'full'
      : variant;

  return (
    <img
      src={SOURCES[resolved]}
      alt={alt}
      className={`block w-auto ${className}`}
      draggable={false}
    />
  );
}
