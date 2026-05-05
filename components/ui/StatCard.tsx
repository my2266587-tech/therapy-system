type Accent = 'teal' | 'blue' | 'violet' | 'amber' | 'slate';

const accentStyles: Record<Accent, { bar: string; number: string }> = {
  teal:   { bar: 'bg-teal-500',   number: 'text-teal-700'   },
  blue:   { bar: 'bg-blue-500',   number: 'text-blue-700'   },
  violet: { bar: 'bg-violet-500', number: 'text-violet-700' },
  amber:  { bar: 'bg-amber-400',  number: 'text-amber-700'  },
  slate:  { bar: 'bg-slate-400',  number: 'text-slate-700'  },
};

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  accent?: Accent;
}

export default function StatCard({ title, value, description, accent = 'slate' }: StatCardProps) {
  const { bar, number } = accentStyles[accent];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 overflow-hidden relative">
      <div className={`absolute top-0 right-0 left-0 h-1 ${bar}`} />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">{title}</p>
      <p className={`text-4xl font-bold mt-2 mb-1 tabular-nums ${number}`}>{value}</p>
      {description && <p className="text-xs text-slate-400">{description}</p>}
    </div>
  );
}
