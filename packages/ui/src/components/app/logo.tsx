interface LogoProps {
  /** Width and height in px. */
  size?: number;
  className?: string;
}

/**
 * Basics brand mark: the blue rounded square with three white bars.
 * Decorative by design; the surrounding UI owns the "Basics" label.
 * Same drawing as `public/favicon.svg` and the desktop loading screen.
 */
export function Logo({ size = 20, className }: LogoProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="8" fill="#0a84ff" />
      <rect x="8" y="9" width="16" height="3" rx="1.5" fill="#fff" />
      <rect x="8" y="14.5" width="12" height="3" rx="1.5" fill="#fff" fillOpacity="0.85" />
      <rect x="8" y="20" width="8" height="3" rx="1.5" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}
