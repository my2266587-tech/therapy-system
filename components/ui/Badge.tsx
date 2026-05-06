const styleMap: Record<string, { bg: string; color: string; border: string }> = {
  /* patient status */
  active:       { bg: '#eef6f1', color: '#1f623e', border: '#a9d5ba' },
  inactive:     { bg: '#f4f4f4', color: '#6b7470', border: '#d8d4cf' },
  waiting:      { bg: '#fdf6ec', color: '#92600d', border: '#f0d090' },
  /* session status */
  planned:      { bg: '#eff5ff', color: '#1e4db7', border: '#b5cef7' },
  completed:    { bg: '#eef6f1', color: '#1f623e', border: '#a9d5ba' },
  cancelled:    { bg: '#fff0f0', color: '#b91c1c', border: '#fca5a5' },
  no_show:      { bg: '#fff7ed', color: '#9a4400', border: '#fed7aa' },
  /* recording status */
  pending:      { bg: '#fdf6ec', color: '#92600d', border: '#f0d090' },
  transcribed:  { bg: '#eff5ff', color: '#1e4db7', border: '#b5cef7' },
  draft_ready:  { bg: '#f5f0ff', color: '#6b21a8', border: '#d8b4fe' },
  approved:     { bg: '#eef6f1', color: '#1f623e', border: '#a9d5ba' },
  /* email status */
  not_sent:     { bg: '#f4f4f4', color: '#6b7470', border: '#d8d4cf' },
  sent:         { bg: '#eef6f1', color: '#1f623e', border: '#a9d5ba' },
  failed:       { bg: '#fff0f0', color: '#b91c1c', border: '#fca5a5' },
  /* boolean */
  true:         { bg: '#eef6f1', color: '#1f623e', border: '#a9d5ba' },
  false:        { bg: '#f4f4f4', color: '#6b7470', border: '#d8d4cf' },
};

const defaultStyle = { bg: '#f4f4f4', color: '#4a5e52', border: '#d8d4cf' };

interface BadgeProps {
  value: string;
  labels: Record<string, string>;
}

export default function Badge({ value, labels }: BadgeProps) {
  const label = labels[value] ?? value;
  const s = styleMap[value] ?? defaultStyle;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </span>
  );
}
