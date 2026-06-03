'use client';

/**
 * Shared free-text search box + "no results" card, used across the list
 * pages (summaries, staff, sessions, payments, expenses, petty-cash,
 * quarterly, phone-pending). Keeps the search affordance visually identical
 * everywhere — a single teal-focused input.
 */

const C = {
  card: '#FFFFFF', border: '#E8ECF0', accent: '#0D9488',
  accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', muted: '#94A3B8',
};

export default function SearchBar({
  value, onChange, placeholder = 'חיפוש חופשי...', width = 320,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 16px',
          fontSize: 14, backgroundColor: C.card, color: C.text,
          width, maxWidth: '100%', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={e => {
          e.target.style.borderColor = C.accent;
          e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.09)';
        }}
        onBlur={e => {
          e.target.style.borderColor = C.border;
          e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
        }}
      />
    </div>
  );
}

export function SearchEmpty({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '44px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
        לא נמצאו תוצאות{query.trim() ? ` עבור "${query.trim()}"` : ''}
      </p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px' }}>נסי מילות חיפוש אחרות</p>
      <button
        onClick={onClear}
        style={{
          backgroundColor: C.accentSub, color: C.accent, border: `1px solid ${C.accentRim}`,
          borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        נקה חיפוש
      </button>
    </div>
  );
}
