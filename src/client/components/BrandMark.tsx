type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 30, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="12" fill="#3B82F6" />
      <path
        d="M4 29C11 21 18 19 24 22C28 18 34 17 40 19C36 22 34 25 33 29C29 27 27 29 25 32L20 40L18 31C13 27 9 27 4 29Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
