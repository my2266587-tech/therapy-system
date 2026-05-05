const colorMap: Record<string, string> = {
  active:      'bg-emerald-100 text-emerald-700',
  inactive:    'bg-slate-100 text-slate-500',
  waiting:     'bg-amber-100 text-amber-700',
  planned:     'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-red-100 text-red-600',
  no_show:         'bg-orange-100 text-orange-700',
  pending_summary: 'bg-orange-100 text-orange-800 font-semibold',
  pending:     'bg-amber-100 text-amber-700',
  transcribed: 'bg-blue-100 text-blue-700',
  draft_ready: 'bg-purple-100 text-purple-700',
  approved:    'bg-emerald-100 text-emerald-700',
  not_sent:    'bg-slate-100 text-slate-500',
  sent:        'bg-emerald-100 text-emerald-700',
  failed:      'bg-red-100 text-red-600',
  true:        'bg-emerald-100 text-emerald-700',
  false:       'bg-slate-100 text-slate-500',
};

interface BadgeProps {
  value: string;
  labels: Record<string, string>;
}

export default function Badge({ value, labels }: BadgeProps) {
  const label = labels[value] ?? value;
  const cls   = colorMap[value] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}
