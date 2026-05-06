const styleMap: Record<string, { bg: string; color: string; border: string }> = {
  /* patient status */
  active:       { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  inactive:     { bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1' },
  waiting:      { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  /* session status */
  planned:      { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  completed:    { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  cancelled:    { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  no_show:      { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  /* recording status */
  pending:      { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  transcribed:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  draft_ready:  { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  approved:     { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  /* email status */
  not_sent:     { bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1' },
  sent:         { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  failed:       { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  /* boolean / paid */
  true:         { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  false:        { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
};

const defaultStyle = { bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1' };

interface BadgeProps {
  value: string;
  labels: Record<string, string>;
}

export default function Badge({ value, labels }: BadgeProps) {
  const label = labels[value] ?? value;
  const s     = styleMap[value] ?? defaultStyle;
  return (
    <span
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        padding:         '2px 9px',
        borderRadius:    20,
        fontSize:        12,
        fontWeight:      500,
        letterSpacing:   '0.01em',
        whiteSpace:      'nowrap',
        backgroundColor: s.bg,
        color:           s.color,
        border:          `1px solid ${s.border}`,
      }}
    >
      {label}
    </span>
  );
}
