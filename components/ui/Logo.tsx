interface LogoProps {
  size?: number;
  variant?: 'mark' | 'full';
}

const COLORS = {
  cream: '#EDE8E2',
  sun:   '#F5C200',
  teal:  '#2C7A72',
  tealLight: '#5C9690',
};

/**
 * "מחר אחר" logo — sun and wave on cream background.
 * - variant="mark"  → just the icon (for sidebar, favicon)
 * - variant="full"  → icon + Hebrew brand text (for login)
 */
export default function Logo({ size = 32, variant = 'mark' }: LogoProps) {
  if (variant === 'full') {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Mark size={size} />
        <div style={{ textAlign: 'center', lineHeight: 1.15, direction: 'rtl' }}>
          <div style={{
            fontSize: Math.round(size * 0.34),
            fontWeight: 800,
            color: COLORS.teal,
            letterSpacing: '0.02em',
          }}>
            מחר אחר
          </div>
          <div style={{
            fontSize: Math.round(size * 0.16),
            fontWeight: 500,
            color: COLORS.tealLight,
            marginTop: 4,
            letterSpacing: '0.06em',
          }}>
            לבחור להגשים
          </div>
        </div>
      </div>
    );
  }
  return <Mark size={size} />;
}

function Mark({ size }: { size: number }) {
  const radius = size >= 40 ? 12 : 8;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="64" height="64" rx={radius} fill={COLORS.cream} />
      {/* Sun */}
      <circle cx="42" cy="22" r="6" fill={COLORS.sun} />
      {/* Wave */}
      <path
        d="M8 34 Q18 26 28 32 T 48 30 T 58 26"
        stroke={COLORS.teal}
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
