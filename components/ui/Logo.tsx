interface LogoProps {
  size?: number;
  variant?: 'square' | 'mark';
}

/**
 * App logo: minimal abstract sprout — two leaves on a stem.
 * Symbolizes growth, healing, care. Pure teal, no text.
 */
export default function Logo({ size = 32, variant = 'square' }: LogoProps) {
  if (variant === 'mark') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <Sprout color="#0D9488" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="32" height="32" rx={size >= 40 ? 10 : 8} fill="#0D9488" />
      <Sprout color="#FFFFFF" />
    </svg>
  );
}

function Sprout({ color }: { color: string }) {
  return (
    <g>
      {/* Stem */}
      <path
        d="M16 24 L16 13"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Left leaf */}
      <path
        d="M16 16 C12.5 14.5 10.5 11.5 11 8.5 C14 9.5 15.8 12.5 16 16 Z"
        fill={color}
      />
      {/* Right leaf */}
      <path
        d="M16 13.5 C19.5 12 21.5 9.2 21 6.5 C18 7.5 16.2 10.2 16 13.5 Z"
        fill={color}
        opacity="0.88"
      />
    </g>
  );
}
